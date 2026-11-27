// Claude Code Web GUI Server
// Zero external dependencies - pure Node.js HTTP + Server-Sent Events

const http = require('http');
const { spawn, exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const url = require('url');

const PORT = process.env.PORT || 3000;
const WORKSPACE_DIR = process.cwd();
const SESSIONS_FILE = path.join(WORKSPACE_DIR, '.web-sessions.json');
const SESSIONS_DATA_DIR = path.join(WORKSPACE_DIR, '.web-sessions-data');
const UPLOADS_DIR = path.join(WORKSPACE_DIR, 'uploads');

if (!fs.existsSync(SESSIONS_DATA_DIR)) {
  try { fs.mkdirSync(SESSIONS_DATA_DIR, { recursive: true }); } catch (_) {}
}
if (!fs.existsSync(UPLOADS_DIR)) {
  try { fs.mkdirSync(UPLOADS_DIR, { recursive: true }); } catch (_) {}
}

// In-memory active process tracking: sessionId -> ChildProcess
const activeProcesses = new Map();

// Load sessions from disk
function loadSessions() {
  try {
    if (fs.existsSync(SESSIONS_FILE)) {
      return JSON.parse(fs.readFileSync(SESSIONS_FILE, 'utf8'));
    }
  } catch (err) {
    console.error('Error loading sessions:', err.message);
  }
  return [];
}

// Save sessions to disk
function saveSessions(sessions) {
  try {
    fs.writeFileSync(SESSIONS_FILE, JSON.stringify(sessions, null, 2), 'utf8');
  } catch (err) {
    console.error('Error saving sessions:', err.message);
  }
}

// Load message history for a specific session
function loadSessionMessages(sessionId) {
  try {
    const file = path.join(SESSIONS_DATA_DIR, `${sessionId}.json`);
    if (fs.existsSync(file)) {
      return JSON.parse(fs.readFileSync(file, 'utf8'));
    }
  } catch (err) {
    console.error('Error loading session messages:', err.message);
  }
  return [];
}

// Save a conversation turn into session history
function saveSessionMessageTurn(sessionId, turnData) {
  try {
    const file = path.join(SESSIONS_DATA_DIR, `${sessionId}.json`);
    let history = [];
    if (fs.existsSync(file)) {
      try { history = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (_) {}
    }
    history.push(turnData);
    fs.writeFileSync(file, JSON.stringify(history, null, 2), 'utf8');
  } catch (err) {
    console.error('Error saving session message turn:', err.message);
  }
}

// Helper: Read request body as JSON
function parseJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
      if (body.length > 10 * 1024 * 1024) { // 10MB limit
        reject(new Error('Request entity too large'));
      }
    });
    req.on('end', () => {
      if (!body) return resolve({});
      try {
        resolve(JSON.parse(body));
      } catch (e) {
        reject(new Error('Invalid JSON'));
      }
    });
    req.on('error', reject);
  });
}

// Helper: Serve static file with correct content type
function serveStaticFile(res, filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const mimeTypes = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.txt': 'text/plain; charset=utf-8'
  };

  const contentType = mimeTypes[ext] || 'application/octet-stream';

  fs.readFile(filePath, (err, data) => {
    if (err) {
      if (err.code === 'ENOENT') {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Not found' }));
      } else {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Server error' }));
      }
      return;
    }
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(data);
  });
}

// Helper: Build file tree of workspace
function getWorkspaceFileTree(dir, relativeTo = dir, maxDepth = 4, currentDepth = 0) {
  if (currentDepth > maxDepth) return null;
  const items = [];
  const IGNORED = new Set(['.git', 'node_modules', '.claude', '.omniroute', '.cache', 'dist', 'build']);

  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (IGNORED.has(entry.name)) continue;
      const fullPath = path.join(dir, entry.name);
      const relPath = path.relative(relativeTo, fullPath).replace(/\\/g, '/');

      if (entry.isDirectory()) {
        const children = getWorkspaceFileTree(fullPath, relativeTo, maxDepth, currentDepth + 1);
        items.push({
          name: entry.name,
          path: relPath,
          type: 'directory',
          children: children || []
        });
      } else {
        const stats = fs.statSync(fullPath);
        items.push({
          name: entry.name,
          path: relPath,
          type: 'file',
          size: stats.size,
          updatedAt: stats.mtime
        });
      }
    }
  } catch (err) {
    console.error('Error scanning dir:', dir, err.message);
  }

  // Sort directories first, then alphabetically
  items.sort((a, b) => {
    if (a.type !== b.type) return a.type === 'directory' ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  return items;
}

// Create HTTP Server
const server = http.createServer(async (req, res) => {
  const parsedUrl = url.parse(req.url, true);
  const pathname = parsedUrl.pathname;
  const method = req.method;

  // Enable CORS for local dev
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, DELETE');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // ----------------------------------------------------
  // API: Get workspace status & configuration
  // ----------------------------------------------------
  if (method === 'GET' && pathname === '/api/status') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      cwd: WORKSPACE_DIR,
      platform: process.platform,
      nodeVersion: process.version,
      port: PORT
    }));
    return;
  }

  // ----------------------------------------------------
  // API: Check OmniRoute health & available models
  // ----------------------------------------------------
  if (method === 'GET' && pathname === '/api/omniroute') {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 2000);
      const response = await fetch('http://localhost:20128/health', { signal: controller.signal });
      clearTimeout(timeoutId);
      const text = await response.text();
      let data = text;
      try { data = JSON.parse(text); } catch (_) {}
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ online: true, data }));
    } catch (err) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ online: false, error: err.message }));
    }
    return;
  }

  // ----------------------------------------------------
  // API: List Sessions
  // ----------------------------------------------------
  if (method === 'GET' && pathname === '/api/sessions') {
    const sessions = loadSessions();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(sessions));
    return;
  }

  // ----------------------------------------------------
  // API: Get Session Message History
  // ----------------------------------------------------
  if (method === 'GET' && pathname.startsWith('/api/sessions/') && pathname.endsWith('/messages')) {
    const id = pathname.replace('/api/sessions/', '').replace('/messages', '');
    const messages = loadSessionMessages(id);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(messages));
    return;
  }

  // ----------------------------------------------------
  // API: Delete a Session
  // ----------------------------------------------------
  if (method === 'DELETE' && pathname.startsWith('/api/sessions/')) {
    const id = pathname.replace('/api/sessions/', '');
    let sessions = loadSessions();
    sessions = sessions.filter(s => s.id !== id);
    saveSessions(sessions);
    try {
      const dataFile = path.join(SESSIONS_DATA_DIR, `${id}.json`);
      if (fs.existsSync(dataFile)) fs.unlinkSync(dataFile);
    } catch (_) {}
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: true }));
    return;
  }

  // ----------------------------------------------------
  // API: Rename a Session
  // ----------------------------------------------------
  if (method === 'POST' && pathname === '/api/sessions/rename') {
    try {
      const body = await parseJsonBody(req);
      const { id, title } = body;
      if (!id || !title) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Missing id or title' }));
        return;
      }
      let sessions = loadSessions();
      const sess = sessions.find(s => s.id === id);
      if (sess) {
        sess.title = title.trim();
        sess.updatedAt = new Date().toISOString();
        saveSessions(sessions);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, session: sess }));
      } else {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Session not found' }));
      }
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  // ----------------------------------------------------
  // API: Workspace File Tree
  // ----------------------------------------------------
  if (method === 'GET' && pathname === '/api/files') {
    const tree = getWorkspaceFileTree(WORKSPACE_DIR);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ root: WORKSPACE_DIR, tree }));
    return;
  }

  // ----------------------------------------------------
  // API: Upload file or picture
  // ----------------------------------------------------
  if (method === 'POST' && pathname === '/api/upload') {
    try {
      const body = await parseJsonBody(req);
      const { name, data } = body;
      if (!name || !data) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Missing name or data' }));
        return;
      }

      const safeName = Date.now() + '_' + path.basename(name).replace(/[^a-zA-Z0-9._-]/g, '_');
      const targetPath = path.join(UPLOADS_DIR, safeName);
      const relPath = path.relative(WORKSPACE_DIR, targetPath).replace(/\\/g, '/');

      const base64Data = data.includes(',') ? data.split(',')[1] : data;
      const buffer = Buffer.from(base64Data, 'base64');
      fs.writeFileSync(targetPath, buffer);

      const ext = path.extname(safeName).toLowerCase();
      const imageExts = new Set(['.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp']);
      const isImage = imageExts.has(ext);

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: true,
        filename: safeName,
        originalName: name,
        path: relPath,
        size: buffer.length,
        isImage,
        url: `/uploads/${safeName}`
      }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  // ----------------------------------------------------
  // API: Read and visualising files (Code, Images, Markdown, HTML)
  // ----------------------------------------------------
  if (method === 'GET' && pathname === '/api/file') {
    const relPath = parsedUrl.query.path;
    if (!relPath) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Missing path' }));
      return;
    }
    const safePath = path.resolve(WORKSPACE_DIR, relPath);
    if (!safePath.startsWith(WORKSPACE_DIR)) {
      res.writeHead(403, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Access denied' }));
      return;
    }
    try {
      const stats = fs.statSync(safePath);
      const ext = path.extname(safePath).toLowerCase();
      const imageExts = new Set(['.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp', '.ico', '.bmp']);

      if (imageExts.has(ext)) {
        if (stats.size > 15 * 1024 * 1024) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Image too large (> 15MB)' }));
          return;
        }
        const fileData = fs.readFileSync(safePath);
        const base64 = fileData.toString('base64');
        const mime = ext === '.svg' ? 'image/svg+xml' : (ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' : `image/${ext.slice(1)}`);

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          path: relPath,
          name: path.basename(safePath),
          isImage: true,
          dataUrl: `data:${mime};base64,${base64}`,
          size: stats.size,
          updatedAt: stats.mtime
        }));
        return;
      }

      if (stats.size > 3 * 1024 * 1024) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'File too large to view (> 3MB)' }));
        return;
      }

      const content = fs.readFileSync(safePath, 'utf8');
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        path: relPath,
        name: path.basename(safePath),
        isImage: false,
        isMarkdown: ext === '.md',
        isHtml: ext === '.html' || ext === '.htm',
        ext: ext.slice(1),
        content,
        size: stats.size,
        updatedAt: stats.mtime
      }));
    } catch (err) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  // ----------------------------------------------------
  // API: Stop active Claude process
  // ----------------------------------------------------
  if (method === 'POST' && pathname === '/api/stop') {
    try {
      const body = await parseJsonBody(req);
      const targetSessionId = body.sessionId;
      let killedCount = 0;

      for (const [sId, proc] of activeProcesses.entries()) {
        if (!targetSessionId || targetSessionId === sId) {
          try {
            if (process.platform === 'win32') {
              exec(`taskkill /pid ${proc.pid} /t /f`);
            } else {
              proc.kill('SIGTERM');
            }
            killedCount++;
          } catch (e) {
            console.error('Error killing process:', e.message);
          }
          activeProcesses.delete(sId);
        }
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, killed: killedCount }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  // ----------------------------------------------------
  // API: Chat (SSE Streaming to Claude Code CLI)
  // ----------------------------------------------------
  if (method === 'POST' && pathname === '/api/chat') {
    let body;
    try {
      body = await parseJsonBody(req);
    } catch (err) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Invalid JSON body' }));
      return;
    }

    const { prompt, sessionId, permissionMode, model } = body;
    if (!prompt || typeof prompt !== 'string') {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Missing prompt' }));
      return;
    }

    // Set up Server-Sent Events headers
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no'
    });

    const sendEvent = (event, data) => {
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    // Construct CLI arguments
    const args = [
      '-p',
      prompt,
      '--output-format',
      'stream-json',
      '--verbose',
      '--include-partial-messages'
    ];

    if (sessionId) {
      args.push('--resume', sessionId);
    }

    // Valid permission modes according to claude --help:
    const validModes = ['acceptEdits', 'auto', 'bypassPermissions', 'manual', 'dontAsk', 'plan'];
    const pMode = validModes.includes(permissionMode) ? permissionMode : 'acceptEdits';
    args.push('--permission-mode', pMode);
    args.push('--permission-prompts', 'none');

    if (model && model !== 'auto' && model !== '__custom__') {
      args.push('--model', model);
    }

    console.log(`[Claude Exec] claude ${args.join(' ')}`);

    // Determine executable name for platform
    const claudeCmd = process.platform === 'win32' ? 'claude.exe' : 'claude';

    // Auto-configure OmniRoute router environment
    const omniroutePort = process.env.OMNIROUTE_PORT || '20128';
    const childEnv = {
      ...process.env,
      ANTHROPIC_BASE_URL: process.env.ANTHROPIC_BASE_URL || `http://localhost:${omniroutePort}`,
      ANTHROPIC_AUTH_TOKEN: process.env.ANTHROPIC_AUTH_TOKEN || 'omniroute'
    };

    let proc;
    try {
      proc = spawn(claudeCmd, args, {
        cwd: WORKSPACE_DIR,
        stdio: ['ignore', 'pipe', 'pipe'],
        env: childEnv
      });
    } catch (err) {
      sendEvent('error', { message: `Failed to spawn Claude: ${err.message}` });
      res.end();
      return;
    }

    const currentKey = sessionId || `temp_${Date.now()}`;
    activeProcesses.set(currentKey, proc);

    let detectedSessionId = sessionId || null;
    let turnResultText = '';
    let turnAssistantText = '';
    let turnThinkingText = '';
    let turnResultStats = null;
    const turnTools = new Map(); // id -> { id, name, input, result }
    let stdoutBuffer = '';

    // Handle stdout chunks
    proc.stdout.on('data', chunk => {
      stdoutBuffer += chunk.toString('utf8');
      const lines = stdoutBuffer.split('\n');
      stdoutBuffer = lines.pop(); // keep trailing incomplete chunk

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
          const parsed = JSON.parse(trimmed);

          // Capture session ID if announced
          if (parsed.session_id && !detectedSessionId) {
            detectedSessionId = parsed.session_id;
            activeProcesses.delete(currentKey);
            activeProcesses.set(detectedSessionId, proc);
          }

          // Accumulate result text & stats
          if (parsed.type === 'result') {
            if (parsed.result) turnResultText = parsed.result;
            turnResultStats = {
              duration_ms: parsed.duration_ms,
              total_cost_usd: parsed.total_cost_usd,
              usage: parsed.usage
            };
          }

          // Stream events
          if (parsed.type === 'stream_event' && parsed.event) {
            const ev = parsed.event;
            if (ev.type === 'content_block_delta' && ev.delta) {
              if (ev.delta.type === 'text_delta') {
                turnAssistantText += ev.delta.text || '';
              } else if (ev.delta.type === 'thinking_delta') {
                turnThinkingText += ev.delta.thinking || '';
              }
            }
          }

          // Full assistant messages
          if (parsed.type === 'assistant' && parsed.message && Array.isArray(parsed.message.content)) {
            for (const item of parsed.message.content) {
              if (item.type === 'tool_use') {
                turnTools.set(item.id, {
                  id: item.id,
                  name: item.name,
                  input: item.input
                });
              } else if (item.type === 'text' && !turnAssistantText) {
                turnAssistantText = item.text;
              } else if (item.type === 'thinking' && !turnThinkingText) {
                turnThinkingText = item.thinking;
              }
            }
          }

          // Tool results from user message
          if (parsed.type === 'user' && parsed.message && Array.isArray(parsed.message.content)) {
            for (const item of parsed.message.content) {
              if (item.type === 'tool_result' && item.tool_use_id) {
                const existing = turnTools.get(item.tool_use_id);
                if (existing) {
                  existing.result = item.content;
                }
              }
            }
          }

          sendEvent('claude', parsed);
        } catch (e) {
          // If not pure JSON (e.g. unrecognized model log), pass as raw
          sendEvent('raw', { text: trimmed });
        }
      }
    });

    // Handle stderr
    proc.stderr.on('data', chunk => {
      const errText = chunk.toString('utf8');
      console.warn('[Claude STDERR]', errText);
      sendEvent('stderr', { text: errText });
    });

    // Process completion
    proc.on('close', code => {
      if (detectedSessionId) {
        activeProcesses.delete(detectedSessionId);
      } else {
        activeProcesses.delete(currentKey);
      }

      // Flush any remaining buffer line
      if (stdoutBuffer && stdoutBuffer.trim()) {
        try {
          const parsed = JSON.parse(stdoutBuffer.trim());
          sendEvent('claude', parsed);
        } catch (_) {
          sendEvent('raw', { text: stdoutBuffer.trim() });
        }
      }

      // Update saved sessions index
      if (detectedSessionId) {
        const sessions = loadSessions();
        const existingIdx = sessions.findIndex(s => s.id === detectedSessionId);
        const titleSnippet = prompt.slice(0, 45) + (prompt.length > 45 ? '...' : '');

        if (existingIdx >= 0) {
          sessions[existingIdx].updatedAt = new Date().toISOString();
          sessions[existingIdx].lastPrompt = titleSnippet;
          if (model) sessions[existingIdx].model = model;
        } else {
          sessions.unshift({
            id: detectedSessionId,
            title: titleSnippet,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            model: model || 'auto'
          });
        }
        saveSessions(sessions);

        // Save detailed turn into session message history
        saveSessionMessageTurn(detectedSessionId, {
          prompt,
          assistant: turnResultText || turnAssistantText,
          thinking: turnThinkingText,
          tools: Array.from(turnTools.values()),
          stats: turnResultStats,
          timestamp: new Date().toISOString()
        });
      }

      sendEvent('done', {
        exitCode: code,
        sessionId: detectedSessionId,
        turnResult: turnResultText || turnAssistantText
      });
      res.end();
    });

    proc.on('error', err => {
      console.error('[Claude Error]', err);
      sendEvent('error', { message: err.message });
      res.end();
    });

    // If client disconnects, clean up process
    req.on('close', () => {
      if (proc && !proc.killed) {
        console.log('[Client Disconnect] Request closed by client');
      }
    });

    return;
  }

  // ----------------------------------------------------
  // Static File Serving
  // ----------------------------------------------------
  let filePath = pathname === '/' ? '/index.html' : pathname;
  // Look in public folder first
  let localPath = path.join(WORKSPACE_DIR, 'public', filePath);

  if (!fs.existsSync(localPath)) {
    // Fall back to workspace root
    localPath = path.join(WORKSPACE_DIR, filePath);
  }

  // Security check: restrict within workspace
  const resolved = path.resolve(localPath);
  if (!resolved.startsWith(WORKSPACE_DIR)) {
    res.writeHead(403, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Access denied' }));
    return;
  }

  serveStaticFile(res, resolved);
});

server.listen(PORT, () => {
  const routerUrl = process.env.ANTHROPIC_BASE_URL || `http://localhost:${process.env.OMNIROUTE_PORT || '20128'}`;
  console.log(`\n======================================================`);
  console.log(`🚀 Claude Code Web Studio running at: http://localhost:${PORT}`);
  console.log(`📁 Workspace: ${WORKSPACE_DIR}`);
  console.log(`🌐 Routed via OmniRoute: ${routerUrl}`);
  console.log(`======================================================\n`);
});
