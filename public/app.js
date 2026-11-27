// Claude Code Web Studio - Frontend Application

(function () {
  'use strict';

  // State
  let currentSessionId = null;
  let sessions = [];
  let isRunning = false;
  let activeAbortController = null;

  // DOM Elements
  const chatContainer = document.getElementById('chatContainer');
  const messagesFeed = document.getElementById('messagesFeed');
  const welcomeScreen = document.getElementById('welcomeScreen');
  const promptInput = document.getElementById('promptInput');
  const sendBtn = document.getElementById('sendBtn');
  const stopBtn = document.getElementById('stopBtn');
  const newChatBtn = document.getElementById('newChatBtn');
  const clearChatBtn = document.getElementById('clearChatBtn');
  const sessionsList = document.getElementById('sessionsList');
  const filesTree = document.getElementById('filesTree');
  const refreshFilesBtn = document.getElementById('refreshFilesBtn');
  const omnirouteBadge = document.getElementById('omnirouteBadge');
  const currentSessionTitle = document.getElementById('currentSessionTitle');
  const currentSessionIdTag = document.getElementById('currentSessionId');
  const permissionModeSelect = document.getElementById('permissionModeSelect');
  const modelSelect = document.getElementById('modelSelect');
  const themeToggle = document.getElementById('themeToggle');
  const sidebar = document.getElementById('sidebar');
  const sidebarToggle = document.getElementById('sidebarToggle');
  const mobileMenuBtn = document.getElementById('mobileMenuBtn');
  const workspacePath = document.getElementById('workspacePath');
  const activeStatusPill = document.getElementById('activeStatusPill');

  // File Modal Elements
  const fileModal = document.getElementById('fileModal');
  const modalFileName = document.getElementById('modalFileName');
  const modalFileSize = document.getElementById('modalFileSize');
  const modalFileContent = document.getElementById('modalFileContent');
  const closeModalBtn = document.getElementById('closeModalBtn');

  // Setup Marked Markdown renderer
  if (typeof marked !== 'undefined') {
    marked.setOptions({
      gfm: true,
      breaks: true,
      highlight: function (code, lang) {
        if (typeof hljs !== 'undefined' && lang && hljs.getLanguage(lang)) {
          try {
            return hljs.highlight(code, { language: lang }).value;
          } catch (_) {}
        }
        return code;
      }
    });
  }

  // ----------------------------------------------------
  // Initialization
  // ----------------------------------------------------
  async function init() {
    initTheme();
    bindEvents();
    setupTextareaAutoGrow();
    await checkStatus();
    await checkOmniroute();
    await loadSessions();
    await loadFiles();

    // Check OmniRoute status periodically
    setInterval(checkOmniroute, 20000);
  }

  // Theme Handling
  function initTheme() {
    const saved = localStorage.getItem('claude-web-theme') || 'dark';
    document.body.className = saved === 'light' ? 'light-theme' : 'dark-theme';
  }

  function toggleTheme() {
    const isDark = document.body.classList.contains('dark-theme');
    const newTheme = isDark ? 'light' : 'dark';
    document.body.className = newTheme === 'light' ? 'light-theme' : 'dark-theme';
    localStorage.setItem('claude-web-theme', newTheme);
  }

  // ----------------------------------------------------
  // Status & Health
  // ----------------------------------------------------
  async function checkStatus() {
    try {
      const res = await fetch('/api/status');
      const data = await res.json();
      if (data.cwd) {
        workspacePath.querySelector('span').textContent = data.cwd;
        workspacePath.title = `Working Directory: ${data.cwd}`;
      }
    } catch (e) {
      console.warn('Failed to fetch status:', e);
    }
  }

  async function checkOmniroute() {
    try {
      const res = await fetch('/api/omniroute');
      const data = await res.json();
      if (data.online) {
        omnirouteBadge.textContent = 'OmniRoute Online';
        omnirouteBadge.className = 'badge online';
        omnirouteBadge.title = 'OmniRoute router running on port 20128';
      } else {
        omnirouteBadge.textContent = 'Local Claude';
        omnirouteBadge.className = 'badge offline';
        omnirouteBadge.title = 'OmniRoute not detected on :20128 - using standard Claude CLI';
      }
    } catch (_) {
      omnirouteBadge.textContent = 'Offline';
      omnirouteBadge.className = 'badge offline';
    }
  }

  // ----------------------------------------------------
  // Session Management
  // ----------------------------------------------------
  async function loadSessions() {
    try {
      const res = await fetch('/api/sessions');
      sessions = await res.json();
      renderSessions();
    } catch (e) {
      console.error('Error loading sessions:', e);
    }
  }

  function renderSessions() {
    sessionsList.innerHTML = '';
    if (!sessions || sessions.length === 0) {
      sessionsList.innerHTML = '<div class="empty-state-small">No saved sessions yet</div>';
      return;
    }

    sessions.forEach(sess => {
      const div = document.createElement('div');
      div.className = `session-item ${sess.id === currentSessionId ? 'active' : ''}`;

      const date = new Date(sess.updatedAt || sess.createdAt);
      const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      const dateStr = date.toLocaleDateString([], { month: 'short', day: 'numeric' });

      div.innerHTML = `
        <div class="session-title-wrap">
          <span class="session-name">${escapeHtml(sess.title || sess.lastPrompt || 'Session ' + sess.id.slice(0, 8))}</span>
          <span class="session-date">${dateStr} ${timeStr} · ${sess.model || 'auto'}</span>
        </div>
        <button class="session-delete-btn" title="Delete Session" data-id="${sess.id}">
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="3 6 5 6 21 6"></polyline>
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
          </svg>
        </button>
      `;

      div.addEventListener('click', (e) => {
        if (e.target.closest('.session-delete-btn')) return;
        selectSession(sess);
      });

      const delBtn = div.querySelector('.session-delete-btn');
      delBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        await deleteSession(sess.id);
      });

      sessionsList.appendChild(div);
    });
  }

  function selectSession(sess) {
    currentSessionId = sess.id;
    currentSessionTitle.textContent = sess.title || 'Session ' + sess.id.slice(0, 8);
    currentSessionIdTag.textContent = sess.id;
    if (sess.model) {
      modelSelect.value = sess.model;
    }
    renderSessions();
    // Clear chat feed to start fresh resume turn
    clearChatUI();
    welcomeScreen.style.display = 'none';
    appendSystemNotice(`Resumed session <code>${sess.id}</code>. Messages sent will continue this conversation.`);
    promptInput.focus();
  }

  async function deleteSession(id) {
    if (!confirm('Are you sure you want to delete this session?')) return;
    try {
      await fetch(`/api/sessions/${id}`, { method: 'DELETE' });
      sessions = sessions.filter(s => s.id !== id);
      if (currentSessionId === id) {
        startNewSession();
      } else {
        renderSessions();
      }
    } catch (e) {
      alert('Failed to delete session: ' + e.message);
    }
  }

  function startNewSession() {
    currentSessionId = null;
    currentSessionTitle.textContent = 'New Session';
    currentSessionIdTag.textContent = 'Ready';
    clearChatUI();
    welcomeScreen.style.display = 'flex';
    renderSessions();
    promptInput.value = '';
    promptInput.focus();
  }

  function clearChatUI() {
    messagesFeed.innerHTML = '';
  }

  // ----------------------------------------------------
  // File Explorer
  // ----------------------------------------------------
  async function loadFiles() {
    try {
      const res = await fetch('/api/files');
      const data = await res.json();
      renderFileTree(data.tree, filesTree);
    } catch (e) {
      filesTree.innerHTML = '<div class="empty-state-small">Error loading files</div>';
    }
  }

  function renderFileTree(items, container) {
    container.innerHTML = '';
    if (!items || items.length === 0) {
      container.innerHTML = '<div class="empty-state-small">No files found</div>';
      return;
    }

    items.forEach(item => {
      const node = document.createElement('div');
      node.className = `tree-node ${item.type === 'directory' ? 'dir' : 'file'}`;

      const icon = item.type === 'directory'
        ? `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg>`
        : `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline></svg>`;

      node.innerHTML = `${icon}<span>${escapeHtml(item.name)}</span>`;

      if (item.type === 'directory') {
        const childContainer = document.createElement('div');
        childContainer.className = 'tree-children';
        childContainer.style.display = 'none';

        node.addEventListener('click', () => {
          const isOpen = childContainer.style.display === 'flex';
          childContainer.style.display = isOpen ? 'none' : 'flex';
        });

        if (item.children && item.children.length > 0) {
          renderFileTree(item.children, childContainer);
        }

        container.appendChild(node);
        container.appendChild(childContainer);
      } else {
        node.addEventListener('click', () => openFileModal(item.path));
        container.appendChild(node);
      }
    });
  }

  async function openFileModal(relPath) {
    try {
      modalFileName.textContent = relPath;
      modalFileContent.textContent = 'Loading...';
      modalFileSize.textContent = '';
      fileModal.classList.add('active');

      const res = await fetch(`/api/file?path=${encodeURIComponent(relPath)}`);
      const data = await res.json();

      if (data.error) {
        modalFileContent.textContent = 'Error: ' + data.error;
        return;
      }

      modalFileSize.textContent = `${(data.size / 1024).toFixed(1)} KB`;
      modalFileContent.textContent = data.content;

      // Auto highlight code
      if (typeof hljs !== 'undefined') {
        hljs.highlightElement(modalFileContent);
      }
    } catch (err) {
      modalFileContent.textContent = 'Failed to load file: ' + err.message;
    }
  }

  // ----------------------------------------------------
  // Chat Execution & Streaming
  // ----------------------------------------------------
  async function submitPrompt() {
    const text = promptInput.value.trim();
    if (!text || isRunning) return;

    promptInput.value = '';
    resetTextareaHeight();
    welcomeScreen.style.display = 'none';

    // 1. Add User Message to UI
    appendUserMessage(text);

    // 2. Prepare Assistant Message turn in UI
    const turn = createAssistantTurn();
    messagesFeed.appendChild(turn.container);
    scrollToBottom();

    // 3. Set Running State
    setRunning(true);
    activeAbortController = new AbortController();

    try {
      const payload = {
        prompt: text,
        sessionId: currentSessionId,
        permissionMode: permissionModeSelect.value,
        model: modelSelect.value !== 'custom' ? modelSelect.value : null
      };

      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: activeAbortController.signal
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${await response.text()}`);
      }

      // Stream Server-Sent Events from Response Body
      const reader = response.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let buffer = '';

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop(); // keep last incomplete line

        let currentEvent = 'message';
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;

          if (trimmed.startsWith('event:')) {
            currentEvent = trimmed.replace('event:', '').trim();
          } else if (trimmed.startsWith('data:')) {
            const jsonStr = trimmed.replace('data:', '').trim();
            try {
              const data = JSON.parse(jsonStr);
              handleStreamEvent(currentEvent, data, turn);
            } catch (err) {
              console.warn('Failed to parse SSE data:', jsonStr);
            }
          }
        }
      }
    } catch (err) {
      if (err.name === 'AbortError') {
        turn.setStatus('Stopped by user');
      } else {
        turn.showError(err.message);
      }
    } finally {
      setRunning(false);
      activeAbortController = null;
      turn.finalize();
      await loadSessions();
      await loadFiles();
    }
  }

  // Handle Event from Claude Code
  function handleStreamEvent(event, data, turn) {
    if (event === 'claude') {
      // 1. System init
      if (data.type === 'system' && data.subtype === 'init') {
        if (data.session_id) {
          currentSessionId = data.session_id;
          currentSessionIdTag.textContent = data.session_id;
          if (currentSessionTitle.textContent === 'New Session') {
            currentSessionTitle.textContent = 'Session ' + data.session_id.slice(0, 8);
          }
        }
      }

      // 2. Assistant message
      if (data.type === 'assistant' && data.message && Array.isArray(data.message.content)) {
        for (const part of data.message.content) {
          if (part.type === 'thinking') {
            turn.appendThinking(part.thinking);
          } else if (part.type === 'tool_use') {
            turn.addToolCall(part);
          } else if (part.type === 'text') {
            turn.appendText(part.text);
          }
        }
      }

      // 3. User message (Tool Results)
      if (data.type === 'user' && data.message && Array.isArray(data.message.content)) {
        for (const part of data.message.content) {
          if (part.type === 'tool_result') {
            turn.updateToolResult(part);
          }
        }
      }

      // 4. Final result
      if (data.type === 'result') {
        turn.setResultMetadata(data);
      }
    } else if (event === 'done') {
      turn.setStatus('Done');
    } else if (event === 'error') {
      turn.showError(data.message);
    }
  }

  // ----------------------------------------------------
  // UI Component: Assistant Turn Builder
  // ----------------------------------------------------
  function createAssistantTurn() {
    const container = document.createElement('div');
    container.className = 'message-turn assistant-turn';

    const body = document.createElement('div');
    body.className = 'assistant-body';

    // Thinking Box
    const thinkingBox = document.createElement('div');
    thinkingBox.className = 'thinking-box';
    thinkingBox.style.display = 'none';
    thinkingBox.innerHTML = `
      <div class="thinking-header">
        <div class="thinking-title">
          <span class="thinking-icon">⚡</span>
          <span>Thinking process</span>
        </div>
        <span class="thinking-toggle-arrow">▼</span>
      </div>
      <div class="thinking-content"></div>
    `;
    const thinkingContent = thinkingBox.querySelector('.thinking-content');
    const thinkingHeader = thinkingBox.querySelector('.thinking-header');
    thinkingHeader.addEventListener('click', () => {
      const isVisible = thinkingContent.style.display !== 'none';
      thinkingContent.style.display = isVisible ? 'none' : 'block';
      thinkingBox.querySelector('.thinking-toggle-arrow').textContent = isVisible ? '▶' : '▼';
    });

    // Tool Cards Container
    const toolsContainer = document.createElement('div');
    toolsContainer.className = 'tools-container';
    toolsContainer.style.display = 'flex';
    toolsContainer.style.flexDirection = 'column';
    toolsContainer.style.gap = '8px';

    // Assistant Markdown Text Container
    const textContainer = document.createElement('div');
    textContainer.className = 'assistant-text';

    // Footer Metadata
    const footer = document.createElement('div');
    footer.className = 'turn-footer';
    footer.style.display = 'none';

    body.appendChild(thinkingBox);
    body.appendChild(toolsContainer);
    body.appendChild(textContainer);
    body.appendChild(footer);
    container.appendChild(body);

    let rawMarkdown = '';
    const activeToolCards = new Map();

    return {
      container,
      appendThinking(text) {
        thinkingBox.style.display = 'block';
        thinkingContent.textContent += text;
        scrollToBottom();
      },
      addToolCall(toolPart) {
        const card = document.createElement('div');
        card.className = 'tool-card';
        const targetDesc = getToolTargetDescription(toolPart);

        card.innerHTML = `
          <div class="tool-header">
            <div class="tool-info">
              <span class="tool-badge ${escapeHtml(toolPart.name)}">${escapeHtml(toolPart.name)}</span>
              <span class="tool-target">${escapeHtml(targetDesc)}</span>
            </div>
            <span class="tool-status-icon">⏳</span>
          </div>
          <div class="tool-body" style="display: none;">${escapeHtml(JSON.stringify(toolPart.input, null, 2))}</div>
        `;

        const header = card.querySelector('.tool-header');
        const bodyEl = card.querySelector('.tool-body');
        header.addEventListener('click', () => {
          bodyEl.style.display = bodyEl.style.display === 'none' ? 'block' : 'none';
        });

        toolsContainer.appendChild(card);
        activeToolCards.set(toolPart.id, { card, toolPart, bodyEl });
        scrollToBottom();
      },
      updateToolResult(resultPart) {
        const toolData = activeToolCards.get(resultPart.tool_use_id);
        if (toolData) {
          const { card, toolPart, bodyEl } = toolData;
          card.querySelector('.tool-status-icon').textContent = '✓';
          card.querySelector('.tool-status-icon').style.color = 'var(--success-text)';

          // Format output
          let content = typeof resultPart.content === 'string'
            ? resultPart.content
            : JSON.stringify(resultPart.content, null, 2);

          // If Edit tool, format visual diff lines
          if (toolPart.name === 'Edit' && toolPart.input) {
            bodyEl.innerHTML = formatDiffView(toolPart.input.old_string, toolPart.input.new_string);
          } else {
            bodyEl.textContent = content;
          }
          bodyEl.style.display = 'block'; // open to show output
        }
        scrollToBottom();
      },
      appendText(chunk) {
        rawMarkdown += chunk;
        if (typeof marked !== 'undefined') {
          textContainer.innerHTML = marked.parse(rawMarkdown);
          addCopyButtonsToCodeBlocks(textContainer);
        } else {
          textContainer.textContent = rawMarkdown;
        }
        scrollToBottom();
      },
      setResultMetadata(result) {
        footer.style.display = 'flex';
        const duration = (result.duration_ms / 1000).toFixed(2);
        const cost = result.total_cost_usd ? `$${result.total_cost_usd.toFixed(4)}` : '';
        const inTokens = result.usage ? result.usage.input_tokens : 0;
        const outTokens = result.usage ? result.usage.output_tokens : 0;

        footer.innerHTML = `
          <span class="turn-stat">⏱️ ${duration}s</span>
          <span class="turn-stat">🪙 in: ${inTokens.toLocaleString()} / out: ${outTokens.toLocaleString()}</span>
          ${cost ? `<span class="turn-stat">💵 ${cost}</span>` : ''}
          <span class="turn-stat">⚡ Completed</span>
        `;
      },
      setStatus(status) {
        activeStatusPill.textContent = status;
      },
      showError(errText) {
        const errDiv = document.createElement('div');
        errDiv.className = 'status-pill';
        errDiv.style.backgroundColor = 'var(--danger-bg)';
        errDiv.style.color = 'var(--danger-text)';
        errDiv.style.padding = '8px 12px';
        errDiv.style.borderRadius = 'var(--radius-sm)';
        errDiv.textContent = 'Error: ' + errText;
        body.appendChild(errDiv);
      },
      finalize() {
        if (!rawMarkdown && toolsContainer.children.length === 0) {
          textContainer.textContent = 'Completed (no text output).';
        }
      }
    };
  }

  function getToolTargetDescription(toolPart) {
    const input = toolPart.input || {};
    if (input.command) return input.command.length > 50 ? input.command.slice(0, 50) + '...' : input.command;
    if (input.file_path) return input.file_path.split(/[\\/]/).pop();
    if (input.pattern) return `"${input.pattern}"`;
    return '';
  }

  function formatDiffView(oldStr, newStr) {
    if (!oldStr && !newStr) return '';
    let html = '<div class="diff-view">';
    if (oldStr) {
      oldStr.split('\n').forEach(line => {
        html += `<div class="diff-line diff-del">- ${escapeHtml(line)}</div>`;
      });
    }
    if (newStr) {
      newStr.split('\n').forEach(line => {
        html += `<div class="diff-line diff-add">+ ${escapeHtml(line)}</div>`;
      });
    }
    html += '</div>';
    return html;
  }

  function addCopyButtonsToCodeBlocks(container) {
    const pres = container.querySelectorAll('pre');
    pres.forEach(pre => {
      if (pre.querySelector('.code-header-bar')) return;
      const code = pre.querySelector('code');
      const langClass = Array.from(code.classList).find(c => c.startsWith('language-'));
      const lang = langClass ? langClass.replace('language-', '') : 'code';

      const header = document.createElement('div');
      header.className = 'code-header-bar';
      header.innerHTML = `
        <span>${escapeHtml(lang)}</span>
        <button class="copy-btn">Copy</button>
      `;

      const copyBtn = header.querySelector('.copy-btn');
      copyBtn.addEventListener('click', () => {
        navigator.clipboard.writeText(code.innerText).then(() => {
          copyBtn.textContent = 'Copied!';
          setTimeout(() => (copyBtn.textContent = 'Copy'), 1800);
        });
      });

      pre.insertBefore(header, code);
    });
  }

  function appendUserMessage(text) {
    const turn = document.createElement('div');
    turn.className = 'message-turn user-turn';
    turn.innerHTML = `<div class="user-bubble">${escapeHtml(text)}</div>`;
    messagesFeed.appendChild(turn);
    scrollToBottom();
  }

  function appendSystemNotice(html) {
    const div = document.createElement('div');
    div.style.textAlign = 'center';
    div.style.fontSize = '12px';
    div.style.color = 'var(--text-muted)';
    div.style.margin = '10px 0';
    div.innerHTML = html;
    messagesFeed.appendChild(div);
  }

  async function stopExecution() {
    if (!isRunning) return;
    try {
      await fetch('/api/stop', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: currentSessionId })
      });
      if (activeAbortController) {
        activeAbortController.abort();
      }
    } catch (e) {
      console.error('Error stopping:', e);
    }
  }

  function setRunning(running) {
    isRunning = running;
    sendBtn.style.display = running ? 'none' : 'inline-flex';
    stopBtn.style.display = running ? 'inline-flex' : 'none';
    promptInput.disabled = running;
    activeStatusPill.textContent = running ? 'Running Claude...' : 'Idle';
    activeStatusPill.className = `status-pill ${running ? 'running' : 'idle'}`;
  }

  function scrollToBottom() {
    chatContainer.scrollTop = chatContainer.scrollHeight;
  }

  function setupTextareaAutoGrow() {
    promptInput.addEventListener('input', () => {
      promptInput.style.height = 'auto';
      promptInput.style.height = Math.min(promptInput.scrollHeight, 180) + 'px';
    });
  }

  function resetTextareaHeight() {
    promptInput.style.height = 'auto';
  }

  // ----------------------------------------------------
  // Event Bindings
  // ----------------------------------------------------
  function bindEvents() {
    // Send on button click
    sendBtn.addEventListener('click', submitPrompt);

    // Stop on button click
    stopBtn.addEventListener('click', stopExecution);

    // Keydown in input: Enter to send, Shift+Enter for newline
    promptInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        submitPrompt();
      }
    });

    // New Session
    newChatBtn.addEventListener('click', startNewSession);

    // Clear Chat
    clearChatBtn.addEventListener('click', () => {
      clearChatUI();
      welcomeScreen.style.display = 'flex';
    });

    // Theme Toggle
    themeToggle.addEventListener('click', toggleTheme);

    // Sidebar Toggle
    sidebarToggle.addEventListener('click', () => {
      sidebar.classList.toggle('collapsed');
    });

    mobileMenuBtn.addEventListener('click', () => {
      sidebar.classList.toggle('mobile-open');
    });

    // Tabs inside sidebar
    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
        btn.classList.add('active');
        const targetTab = document.getElementById(btn.dataset.tab);
        if (targetTab) targetTab.classList.add('active');
      });
    });

    // Refresh Files
    refreshFilesBtn.addEventListener('click', loadFiles);

    // Prompt Suggestions
    document.querySelectorAll('.suggestion-card').forEach(card => {
      card.addEventListener('click', () => {
        const p = card.getAttribute('data-prompt');
        if (p) {
          promptInput.value = p;
          submitPrompt();
        }
      });
    });

    // Quick Command Pills
    document.querySelectorAll('.cmd-pill').forEach(pill => {
      pill.addEventListener('click', () => {
        const cmd = pill.getAttribute('data-cmd');
        if (cmd) {
          promptInput.value = cmd;
          promptInput.focus();
        }
      });
    });

    // Close File Modal
    closeModalBtn.addEventListener('click', () => {
      fileModal.classList.remove('active');
    });
    fileModal.addEventListener('click', (e) => {
      if (e.target === fileModal) fileModal.classList.remove('active');
    });
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  // Run app
  document.addEventListener('DOMContentLoaded', init);
})();
