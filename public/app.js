// Claude Code Studio - Frontend Application
// Features: Real-time token streaming, session history restoration,
// file/picture uploads, multi-modal file visualizer, and OmniRoute routing.

(function () {
  'use strict';

  // State
  let currentSessionId = null;
  let sessions = [];
  let isRunning = false;
  let activeAbortController = null;
  let chatHistory = []; // { role, content, time, thinking, tools, attachments }
  let sessionSearchQuery = '';
  let activeAttachments = []; // [{ id, name, relPath, url, isImage, size, type }]
  let currentModalFileData = null; // { path, name, content, dataUrl, isImage }

  // DOM Elements
  const chatContainer = document.getElementById('chatContainer');
  const messagesFeed = document.getElementById('messagesFeed');
  const welcomeScreen = document.getElementById('welcomeScreen');
  const promptInput = document.getElementById('promptInput');
  const sendBtn = document.getElementById('sendBtn');
  const stopBtn = document.getElementById('stopBtn');
  const newChatBtn = document.getElementById('newChatBtn');
  const clearChatBtn = document.getElementById('clearChatBtn');
  const exportChatBtn = document.getElementById('exportChatBtn');
  const renameSessionBtn = document.getElementById('renameSessionBtn');
  const sessionsList = document.getElementById('sessionsList');
  const sessionSearchInput = document.getElementById('sessionSearchInput');
  const filesTree = document.getElementById('filesTree');
  const refreshFilesBtn = document.getElementById('refreshFilesBtn');
  const omnirouteBadge = document.getElementById('omnirouteBadge');
  const currentSessionTitle = document.getElementById('currentSessionTitle');
  const currentSessionIdTag = document.getElementById('currentSessionId');
  const permissionModeSelect = document.getElementById('permissionModeSelect');
  const modelSelect = document.getElementById('modelSelect');
  const customModelInput = document.getElementById('customModelInput');
  const themeToggle = document.getElementById('themeToggle');
  const sidebar = document.getElementById('sidebar');
  const sidebarToggle = document.getElementById('sidebarToggle');
  const mobileMenuBtn = document.getElementById('mobileMenuBtn');
  const workspacePath = document.getElementById('workspacePath');
  const activeStatusPill = document.getElementById('activeStatusPill');
  const statusDot = document.getElementById('statusDot');
  const scrollBottomBtn = document.getElementById('scrollBottomBtn');
  const toastContainer = document.getElementById('toastContainer');

  // Attachment elements
  const uploadBtn = document.getElementById('uploadBtn');
  const fileUploadInput = document.getElementById('fileUploadInput');
  const attachmentTray = document.getElementById('attachmentTray');

  // File Modal Elements
  const fileModal = document.getElementById('fileModal');
  const modalFileName = document.getElementById('modalFileName');
  const modalFileSize = document.getElementById('modalFileSize');
  const modalFileContent = document.getElementById('modalFileContent');
  const modalCodeContainer = document.getElementById('modalCodeContainer');
  const modalPreviewContainer = document.getElementById('modalPreviewContainer');
  const modalImageContainer = document.getElementById('modalImageContainer');
  const modalImagePreview = document.getElementById('modalImagePreview');
  const modalTabsGroup = document.getElementById('modalTabsGroup');
  const modalTabCode = document.getElementById('modalTabCode');
  const modalTabPreview = document.getElementById('modalTabPreview');
  const copyFileContentBtn = document.getElementById('copyFileContentBtn');
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
  // Toast Notification System
  // ----------------------------------------------------
  function showToast(message, type = 'info') {
    if (!toastContainer) return;
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;

    let icon = 'ℹ️';
    if (type === 'success') icon = '✅';
    if (type === 'error') icon = '⚠️';

    toast.innerHTML = `<span>${icon}</span><span>${escapeHtml(message)}</span>`;
    toastContainer.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(10px)';
      toast.style.transition = 'all 0.25s ease';
      setTimeout(() => toast.remove(), 250);
    }, 2800);
  }

  // ----------------------------------------------------
  // Initialization
  // ----------------------------------------------------
  async function init() {
    initTheme();
    bindEvents();
    setupTextareaAutoGrow();
    setupDropAndPaste();
    await checkStatus();
    await checkOmniroute();
    await loadSessions();
    await loadFiles();

    // Check OmniRoute status periodically (every 15s)
    setInterval(checkOmniroute, 15000);
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
    showToast(`Switched to ${newTheme} theme`);
  }

  // ----------------------------------------------------
  // Status & Health
  // ----------------------------------------------------
  async function checkStatus() {
    try {
      const res = await fetch('/api/status');
      const data = await res.json();
      if (data.cwd) {
        const folderName = data.cwd.split(/[\\/]/).pop() || data.cwd;
        const textSpan = workspacePath.querySelector('.path-text');
        if (textSpan) textSpan.textContent = folderName;
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
      const statusText = omnirouteBadge.querySelector('.status-text');
      if (data.online) {
        omnirouteBadge.className = 'omniroute-badge online';
        if (statusText) statusText.textContent = 'OmniRoute Online';
        omnirouteBadge.title = 'OmniRoute router running at http://localhost:20128';
      } else {
        omnirouteBadge.className = 'omniroute-badge offline';
        if (statusText) statusText.textContent = 'OmniRoute Offline';
        omnirouteBadge.title = 'OmniRoute router not detected on port 20128';
      }
    } catch (_) {
      omnirouteBadge.className = 'omniroute-badge offline';
    }
  }

  // ----------------------------------------------------
  // Session Management & History Loading
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
    const filtered = sessions.filter(s => {
      if (!sessionSearchQuery) return true;
      const q = sessionSearchQuery.toLowerCase();
      const titleMatch = (s.title || '').toLowerCase().includes(q);
      const promptMatch = (s.lastPrompt || '').toLowerCase().includes(q);
      const idMatch = (s.id || '').toLowerCase().includes(q);
      const modelMatch = (s.model || '').toLowerCase().includes(q);
      return titleMatch || promptMatch || idMatch || modelMatch;
    });

    if (!filtered || filtered.length === 0) {
      sessionsList.innerHTML = `<div class="empty-list">${sessionSearchQuery ? 'No matching conversations' : 'No saved conversations'}</div>`;
      return;
    }

    filtered.forEach(sess => {
      const card = document.createElement('div');
      card.className = `session-card ${sess.id === currentSessionId ? 'active' : ''}`;

      const date = new Date(sess.updatedAt || sess.createdAt);
      const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      const dateStr = date.toLocaleDateString([], { month: 'short', day: 'numeric' });

      card.innerHTML = `
        <div class="session-title-block">
          <span class="session-title-text">${escapeHtml(sess.title || sess.lastPrompt || 'Session ' + sess.id.slice(0, 8))}</span>
          <span class="session-meta-text">${dateStr} ${timeStr} · ${escapeHtml(sess.model || 'auto')}</span>
        </div>
        <div class="session-actions">
          <button class="session-del-btn" title="Delete Session" data-id="${sess.id}">
            <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="3 6 5 6 21 6"></polyline>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
            </svg>
          </button>
        </div>
      `;

      card.addEventListener('click', (e) => {
        if (e.target.closest('.session-del-btn')) return;
        selectSession(sess);
      });

      const delBtn = card.querySelector('.session-del-btn');
      delBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        await deleteSession(sess.id);
      });

      sessionsList.appendChild(card);
    });
  }

  async function selectSession(sess) {
    currentSessionId = sess.id;
    currentSessionTitle.textContent = sess.title || 'Session ' + sess.id.slice(0, 8);
    currentSessionIdTag.textContent = sess.id;

    if (sess.model) {
      const optionExists = Array.from(modelSelect.options).some(o => o.value === sess.model);
      if (optionExists) {
        modelSelect.value = sess.model;
        customModelInput.style.display = 'none';
      } else {
        modelSelect.value = '__custom__';
        customModelInput.style.display = 'inline-block';
        customModelInput.value = sess.model;
      }
    }

    renderSessions();
    clearChatUI();
    welcomeScreen.style.display = 'none';
    chatHistory = [];

    // Fetch and restore saved conversation turns!
    try {
      const res = await fetch(`/api/sessions/${sess.id}/messages`);
      const data = await res.json();
      if (data.messages && data.messages.length > 0) {
        chatHistory = data.messages;
        renderSavedHistory(data.messages);
      } else {
        appendSystemNotice(`Resumed session <code>${sess.id}</code>.`);
      }
    } catch (err) {
      console.warn('Could not load session transcript:', err);
      appendSystemNotice(`Resumed session <code>${sess.id}</code>.`);
    }

    promptInput.focus();
    showToast(`Loaded session: ${sess.title || sess.id.slice(0, 8)}`);
  }

  function renderSavedHistory(messages) {
    messages.forEach(msg => {
      if (msg.role === 'user') {
        appendUserMessage(msg.content, msg.attachments);
      } else if (msg.role === 'assistant') {
        const turn = createAssistantTurn();
        messagesFeed.appendChild(turn.container);

        if (msg.thinking) {
          turn.appendThinking(msg.thinking);
        }

        if (Array.isArray(msg.tools)) {
          msg.tools.forEach(tool => {
            turn.addToolCall(tool);
            if (tool.result) {
              turn.updateToolResult({ tool_use_id: tool.id, content: tool.result });
            }
          });
        }

        if (msg.content) {
          turn.appendText(msg.content);
        }

        if (msg.stats) {
          turn.setResultMetadata(msg.stats);
        }

        turn.finalize();
      }
    });
    scrollToBottom();
  }

  async function renameCurrentSession() {
    if (!currentSessionId) {
      showToast('Start or select a session to rename', 'error');
      return;
    }
    const currentName = currentSessionTitle.textContent;
    const newName = prompt('Enter new session name:', currentName);
    if (!newName || newName.trim() === '' || newName === currentName) return;

    try {
      const res = await fetch('/api/sessions/rename', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: currentSessionId, title: newName.trim() })
      });
      const data = await res.json();
      if (data.success) {
        currentSessionTitle.textContent = newName.trim();
        const sess = sessions.find(s => s.id === currentSessionId);
        if (sess) sess.title = newName.trim();
        renderSessions();
        showToast('Session renamed successfully', 'success');
      } else {
        showToast('Rename failed: ' + (data.error || 'Unknown error'), 'error');
      }
    } catch (err) {
      showToast('Rename error: ' + err.message, 'error');
    }
  }

  async function deleteSession(id) {
    if (!confirm('Are you sure you want to delete this session?')) return;
    try {
      await fetch(`/api/sessions/${id}`, { method: 'DELETE' });
      sessions = sessions.filter(s => s.id !== id);
      showToast('Session deleted');
      if (currentSessionId === id) {
        startNewSession();
      } else {
        renderSessions();
      }
    } catch (e) {
      showToast('Failed to delete session: ' + e.message, 'error');
    }
  }

  function startNewSession() {
    currentSessionId = null;
    currentSessionTitle.textContent = 'New Session';
    currentSessionIdTag.textContent = 'Ready';
    clearChatUI();
    clearAttachments();
    chatHistory = [];
    welcomeScreen.style.display = 'flex';
    renderSessions();
    promptInput.value = '';
    promptInput.focus();
    showToast('Started new session');
  }

  function clearChatUI() {
    messagesFeed.innerHTML = '';
  }

  // ----------------------------------------------------
  // Attachments & Upload System
  // ----------------------------------------------------
  function setupDropAndPaste() {
    // Paste handler for prompt textarea (Ctrl+V pictures/files)
    promptInput.addEventListener('paste', async (e) => {
      const items = (e.clipboardData || e.originalEvent.clipboardData).items;
      let hasFile = false;
      for (const item of items) {
        if (item.kind === 'file') {
          const file = item.getAsFile();
          if (file) {
            hasFile = true;
            await handleFileUpload(file);
          }
        }
      }
      if (hasFile) {
        e.preventDefault();
      }
    });

    // Drag & drop on chat container
    ['dragenter', 'dragover'].forEach(eventName => {
      chatContainer.addEventListener(eventName, (e) => {
        e.preventDefault();
        e.stopPropagation();
        chatContainer.classList.add('drag-over');
      });
    });

    ['dragleave', 'drop'].forEach(eventName => {
      chatContainer.addEventListener(eventName, (e) => {
        e.preventDefault();
        e.stopPropagation();
        chatContainer.classList.remove('drag-over');
      });
    });

    chatContainer.addEventListener('drop', async (e) => {
      const files = e.dataTransfer.files;
      if (files && files.length > 0) {
        for (const file of files) {
          await handleFileUpload(file);
        }
      }
    });

    // Upload button click
    uploadBtn.addEventListener('click', () => {
      fileUploadInput.click();
    });

    fileUploadInput.addEventListener('change', async () => {
      if (fileUploadInput.files && fileUploadInput.files.length > 0) {
        for (const file of fileUploadInput.files) {
          await handleFileUpload(file);
        }
        fileUploadInput.value = '';
      }
    });
  }

  async function handleFileUpload(file) {
    showToast(`Uploading ${file.name}...`);
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = async () => {
        try {
          const base64Data = reader.result; // data:image/png;base64,...
          const res = await fetch('/api/upload', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              name: file.name,
              type: file.type,
              data: base64Data
            })
          });
          const result = await res.json();
          if (result.success) {
            activeAttachments.push(result);
            renderAttachmentTray();
            showToast(`Attached ${file.name}`, 'success');
          } else {
            showToast(`Upload failed: ${result.error}`, 'error');
          }
        } catch (err) {
          showToast(`Upload error: ${err.message}`, 'error');
        }
        resolve();
      };
      reader.readAsDataURL(file);
    });
  }

  function renderAttachmentTray() {
    attachmentTray.innerHTML = '';
    if (activeAttachments.length === 0) {
      attachmentTray.style.display = 'none';
      return;
    }

    attachmentTray.style.display = 'flex';
    activeAttachments.forEach((att, index) => {
      const pill = document.createElement('div');
      pill.className = 'attachment-pill';

      const thumbHtml = att.isImage && att.url
        ? `<img src="${att.url}" class="attachment-thumb" alt="thumb">`
        : `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline></svg>`;

      pill.innerHTML = `
        ${thumbHtml}
        <span class="attachment-pill-name" title="${escapeHtml(att.name)}">${escapeHtml(att.name)}</span>
        <button class="attachment-remove-btn" title="Remove attachment">✕</button>
      `;

      pill.querySelector('.attachment-remove-btn').addEventListener('click', (e) => {
        e.stopPropagation();
        activeAttachments.splice(index, 1);
        renderAttachmentTray();
      });

      // Clicking attachment pill opens visualizer modal
      pill.addEventListener('click', () => {
        openFileModal(att.relPath);
      });

      attachmentTray.appendChild(pill);
    });
  }

  function clearAttachments() {
    activeAttachments = [];
    renderAttachmentTray();
  }

  // ----------------------------------------------------
  // Export Chat to Markdown
  // ----------------------------------------------------
  function exportChatMarkdown() {
    if (!chatHistory || chatHistory.length === 0) {
      showToast('No conversation history to export', 'error');
      return;
    }

    let md = `# Claude Code Session: ${currentSessionTitle.textContent}\n`;
    md += `*Session ID:* \`${currentSessionId || 'New Session'}\`\n`;
    md += `*Date:* ${new Date().toLocaleString()}\n`;
    md += `*Target Model:* ${getSelectedModel()}\n\n---\n\n`;

    chatHistory.forEach(item => {
      if (item.role === 'user') {
        md += `### 👤 User (${item.time})\n\n${item.content}\n\n`;
        if (item.attachments && item.attachments.length > 0) {
          md += `*Attachments:*\n`;
          item.attachments.forEach(a => {
            md += `- [${a.name}](${a.relPath || a.url})\n`;
          });
          md += '\n';
        }
      } else if (item.role === 'assistant') {
        md += `### 🤖 Claude Code (${item.time})\n\n`;
        if (item.thinking) {
          md += `<details><summary>Thinking Process</summary>\n\n\`\`\`\n${item.thinking}\n\`\`\`\n\n</details>\n\n`;
        }
        md += `${item.content}\n\n`;
      }
    });

    const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const safeTitle = (currentSessionTitle.textContent || 'session').replace(/[^a-zA-Z0-9_-]/g, '_');
    a.download = `${safeTitle}-${Date.now()}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast('Exported session to Markdown file', 'success');
  }

  function getSelectedModel() {
    if (modelSelect.value === '__custom__') {
      return customModelInput.value.trim() || 'auto/best-coding';
    }
    return modelSelect.value;
  }

  // ----------------------------------------------------
  // File Explorer & Visualizer Modal
  // ----------------------------------------------------
  async function loadFiles() {
    try {
      const res = await fetch('/api/files');
      const data = await res.json();
      renderFileTree(data.tree, filesTree);
    } catch (e) {
      filesTree.innerHTML = '<div class="empty-list">Error loading files</div>';
    }
  }

  function renderFileTree(items, container) {
    container.innerHTML = '';
    if (!items || items.length === 0) {
      container.innerHTML = '<div class="empty-list">No files found</div>';
      return;
    }

    items.forEach(item => {
      const row = document.createElement('div');
      row.className = `tree-row ${item.type === 'directory' ? 'directory' : 'file'}`;

      const icon = item.type === 'directory'
        ? `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg>`
        : `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline></svg>`;

      row.innerHTML = `${icon}<span>${escapeHtml(item.name)}</span>`;

      if (item.type === 'directory') {
        const nestedContainer = document.createElement('div');
        nestedContainer.className = 'tree-nested';
        nestedContainer.style.display = 'none';

        row.addEventListener('click', () => {
          const isOpen = nestedContainer.style.display === 'flex';
          nestedContainer.style.display = isOpen ? 'none' : 'flex';
        });

        if (item.children && item.children.length > 0) {
          renderFileTree(item.children, nestedContainer);
        }

        container.appendChild(row);
        container.appendChild(nestedContainer);
      } else {
        row.addEventListener('click', () => openFileModal(item.path));
        container.appendChild(row);
      }
    });
  }

  async function openFileModal(relPath) {
    try {
      modalFileName.textContent = relPath;
      modalFileContent.textContent = 'Loading file...';
      modalFileSize.textContent = '';
      modalTabsGroup.style.display = 'none';
      modalCodeContainer.style.display = 'block';
      modalPreviewContainer.style.display = 'none';
      modalImageContainer.style.display = 'none';
      fileModal.classList.add('active');

      const res = await fetch(`/api/file?path=${encodeURIComponent(relPath)}`);
      const data = await res.json();

      if (data.error) {
        modalFileContent.textContent = 'Error: ' + data.error;
        return;
      }

      currentModalFileData = data;
      modalFileSize.textContent = `${(data.size / 1024).toFixed(1)} KB`;

      const ext = (relPath.split('.').pop() || '').toLowerCase();
      const isImg = data.isImage || ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'ico'].includes(ext);
      const isMd = ['md', 'markdown'].includes(ext);
      const isHtml = ['html', 'htm'].includes(ext);

      if (isImg && data.dataUrl) {
        // Show Image View
        modalCodeContainer.style.display = 'none';
        modalPreviewContainer.style.display = 'none';
        modalImageContainer.style.display = 'flex';
        modalImagePreview.src = data.dataUrl;
      } else if (isMd || isHtml) {
        // Show Tabs (Code + Preview)
        modalTabsGroup.style.display = 'flex';
        modalTabCode.classList.add('active');
        modalTabPreview.classList.remove('active');
        modalCodeContainer.style.display = 'block';
        modalPreviewContainer.style.display = 'none';
        modalFileContent.textContent = data.content;

        if (typeof hljs !== 'undefined') {
          hljs.highlightElement(modalFileContent);
        }
      } else {
        // Standard Code View
        modalCodeContainer.style.display = 'block';
        modalFileContent.textContent = data.content;
        if (typeof hljs !== 'undefined') {
          hljs.highlightElement(modalFileContent);
        }
      }
    } catch (err) {
      modalFileContent.textContent = 'Failed to load file: ' + err.message;
    }
  }

  function switchModalTab(tab) {
    if (!currentModalFileData) return;
    if (tab === 'code') {
      modalTabCode.classList.add('active');
      modalTabPreview.classList.remove('active');
      modalCodeContainer.style.display = 'block';
      modalPreviewContainer.style.display = 'none';
    } else if (tab === 'preview') {
      modalTabPreview.classList.add('active');
      modalTabCode.classList.remove('active');
      modalCodeContainer.style.display = 'none';
      modalPreviewContainer.style.display = 'block';

      const ext = (currentModalFileData.path.split('.').pop() || '').toLowerCase();
      if (['md', 'markdown'].includes(ext)) {
        modalPreviewContainer.innerHTML = typeof marked !== 'undefined'
          ? marked.parse(currentModalFileData.content)
          : escapeHtml(currentModalFileData.content);
      } else if (['html', 'htm'].includes(ext)) {
        modalPreviewContainer.innerHTML = currentModalFileData.content;
      }
    }
  }

  // ----------------------------------------------------
  // Chat Execution & Real-Time Streaming
  // ----------------------------------------------------
  async function submitPrompt() {
    const text = promptInput.value.trim();
    if ((!text && activeAttachments.length === 0) || isRunning) return;

    promptInput.value = '';
    resetTextareaHeight();
    welcomeScreen.style.display = 'none';

    const attachmentsToSend = [...activeAttachments];
    clearAttachments();

    const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    chatHistory.push({
      role: 'user',
      content: text,
      attachments: attachmentsToSend,
      time: timeStr
    });

    // 1. Add User Message to UI
    appendUserMessage(text, attachmentsToSend);

    // 2. Prepare Assistant Message turn in UI
    const turn = createAssistantTurn();
    messagesFeed.appendChild(turn.container);
    scrollToBottom();

    // 3. Set Running State
    setRunning(true);
    activeAbortController = new AbortController();

    try {
      const chosenModel = getSelectedModel();
      const payload = {
        prompt: text,
        attachments: attachmentsToSend,
        sessionId: currentSessionId,
        permissionMode: permissionModeSelect.value,
        model: chosenModel
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
        showToast('Execution stopped by user', 'info');
      } else {
        turn.showError(err.message);
        showToast('Error: ' + err.message, 'error');
      }
    } finally {
      setRunning(false);
      activeAbortController = null;
      turn.finalize();

      chatHistory.push({
        role: 'assistant',
        content: turn.getFinalText(),
        thinking: turn.getFinalThinking(),
        tools: turn.getToolRecords(),
        stats: turn.getStats(),
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      });

      await loadSessions();
      await loadFiles();
    }
  }

  // Handle Event from Claude Code (stream_event, claude, done, error)
  function handleStreamEvent(event, data, turn) {
    // 1. Real-time delta streaming from Claude CLI!
    if (event === 'stream_event') {
      if (data.type === 'content_block_delta') {
        if (data.delta && data.delta.type === 'text_delta') {
          turn.appendTextDelta(data.delta.text);
        } else if (data.delta && data.delta.type === 'thinking_delta') {
          turn.appendThinking(data.delta.thinking);
        }
      }
      return;
    }

    // 2. Structured Claude events (init, assistant, user/tool_result, result)
    if (event === 'claude') {
      if (data.type === 'system' && data.subtype === 'init') {
        if (data.session_id) {
          currentSessionId = data.session_id;
          currentSessionIdTag.textContent = data.session_id;
          if (currentSessionTitle.textContent === 'New Session') {
            currentSessionTitle.textContent = 'Session ' + data.session_id.slice(0, 8);
          }
        }
      }

      if (data.type === 'assistant' && data.message && Array.isArray(data.message.content)) {
        for (const part of data.message.content) {
          if (part.type === 'thinking') {
            turn.setThinkingContent(part.thinking);
          } else if (part.type === 'tool_use') {
            turn.addToolCall(part);
          } else if (part.type === 'text') {
            // Full message text delivered at the end of block
            turn.appendText(part.text);
          }
        }
      }

      if (data.type === 'user' && data.message && Array.isArray(data.message.content)) {
        for (const part of data.message.content) {
          if (part.type === 'tool_result') {
            turn.updateToolResult(part);
          }
        }
      }

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
    container.className = 'turn-assistant';

    const avatar = document.createElement('div');
    avatar.className = 'assistant-badge-avatar';
    avatar.innerHTML = `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg>`;

    const contentCard = document.createElement('div');
    contentCard.className = 'assistant-content-card';

    // Thinking Accordion
    const thinkingBox = document.createElement('div');
    thinkingBox.className = 'thinking-accordion';
    thinkingBox.style.display = 'none';
    thinkingBox.innerHTML = `
      <div class="thinking-accordion-header">
        <div class="thinking-label">
          <span class="thinking-spark">⚡</span>
          <span>Thinking process</span>
        </div>
        <span class="toggle-icon">▼</span>
      </div>
      <div class="thinking-accordion-content"></div>
    `;
    const thinkingContent = thinkingBox.querySelector('.thinking-accordion-content');
    const thinkingHeader = thinkingBox.querySelector('.thinking-accordion-header');
    thinkingHeader.addEventListener('click', () => {
      const isVisible = thinkingContent.style.display !== 'none';
      thinkingContent.style.display = isVisible ? 'none' : 'block';
      thinkingBox.querySelector('.toggle-icon').textContent = isVisible ? '▶' : '▼';
    });

    // Tool Cards Box Container
    const toolsBox = document.createElement('div');
    toolsBox.className = 'tools-box-list';
    toolsBox.style.display = 'flex';
    toolsBox.style.flexDirection = 'column';
    toolsBox.style.gap = '8px';

    // Prose Markdown Container
    const proseContainer = document.createElement('div');
    proseContainer.className = 'assistant-prose';

    // Footer Metadata
    const footer = document.createElement('div');
    footer.className = 'turn-meta-footer';
    footer.style.display = 'none';

    contentCard.appendChild(thinkingBox);
    contentCard.appendChild(toolsBox);
    contentCard.appendChild(proseContainer);
    contentCard.appendChild(footer);

    container.appendChild(avatar);
    container.appendChild(contentCard);

    let rawMarkdown = '';
    let rawThinking = '';
    let resultStats = null;
    const activeToolCards = new Map();
    const toolRecords = [];

    return {
      container,
      appendThinking(text) {
        if (!text) return;
        rawThinking += text;
        thinkingBox.style.display = 'block';
        thinkingContent.textContent = rawThinking;
        scrollToBottom();
      },
      setThinkingContent(text) {
        if (!text) return;
        rawThinking = text;
        thinkingBox.style.display = 'block';
        thinkingContent.textContent = text;
        scrollToBottom();
      },
      addToolCall(toolPart) {
        const card = document.createElement('div');
        card.className = 'tool-box';
        const targetDesc = getToolTargetDescription(toolPart);

        card.innerHTML = `
          <div class="tool-box-header">
            <div class="tool-box-left">
              <span class="tool-type-badge ${escapeHtml(toolPart.name)}">${escapeHtml(toolPart.name)}</span>
              <span class="tool-target-text">${escapeHtml(targetDesc)}</span>
            </div>
            <div class="tool-box-right">
              <span class="tool-status-icon">⏳</span>
              <span class="arrow-indicator">▼</span>
            </div>
          </div>
          <div class="tool-box-body" style="display: none;">${escapeHtml(JSON.stringify(toolPart.input, null, 2))}</div>
        `;

        const header = card.querySelector('.tool-box-header');
        const bodyEl = card.querySelector('.tool-box-body');
        header.addEventListener('click', () => {
          const isHidden = bodyEl.style.display === 'none';
          bodyEl.style.display = isHidden ? 'block' : 'none';
          card.querySelector('.arrow-indicator').textContent = isHidden ? '▲' : '▼';
        });

        toolsBox.appendChild(card);
        activeToolCards.set(toolPart.id, { card, toolPart, bodyEl });
        toolRecords.push({ ...toolPart, result: null });
        scrollToBottom();
      },
      updateToolResult(resultPart) {
        const toolData = activeToolCards.get(resultPart.tool_use_id);
        if (toolData) {
          const { card, toolPart, bodyEl } = toolData;
          card.querySelector('.tool-status-icon').textContent = '✓';
          card.querySelector('.tool-status-icon').style.color = 'var(--emerald)';

          const rec = toolRecords.find(r => r.id === resultPart.tool_use_id);
          if (rec) rec.result = resultPart.content;

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
          bodyEl.style.display = 'block';
          card.querySelector('.arrow-indicator').textContent = '▲';
        }
        scrollToBottom();
      },
      appendTextDelta(delta) {
        rawMarkdown += delta;
        renderMarkdown();
      },
      appendText(fullText) {
        if (!fullText) return;
        // Avoid duplicate appends if delta was already streaming
        if (fullText.length > rawMarkdown.length) {
          rawMarkdown = fullText;
        } else if (!rawMarkdown) {
          rawMarkdown = fullText;
        }
        renderMarkdown();
      },
      setResultMetadata(result) {
        resultStats = result;
        footer.style.display = 'flex';
        const duration = (result.duration_ms / 1000).toFixed(2);
        const cost = result.total_cost_usd ? `$${result.total_cost_usd.toFixed(4)}` : '';
        const inTokens = result.usage ? result.usage.input_tokens : 0;
        const outTokens = result.usage ? result.usage.output_tokens : 0;

        footer.innerHTML = `
          <div class="turn-meta-stats">
            <span>⏱️ ${duration}s</span>
            <span>🪙 ${inTokens.toLocaleString()} in / ${outTokens.toLocaleString()} out</span>
            ${cost ? `<span>💵 ${cost}</span>` : ''}
          </div>
          <span style="color: var(--emerald)">✓ Completed</span>
        `;
      },
      setStatus(status) {
        activeStatusPill.textContent = status;
      },
      showError(errText) {
        const errDiv = document.createElement('div');
        errDiv.style.backgroundColor = 'var(--rose-subtle)';
        errDiv.style.color = 'var(--rose)';
        errDiv.style.padding = '8px 12px';
        errDiv.style.borderRadius = 'var(--radius-xs)';
        errDiv.style.fontSize = '12px';
        errDiv.textContent = 'Error: ' + errText;
        contentCard.appendChild(errDiv);
      },
      getFinalText() {
        return rawMarkdown || 'Done';
      },
      getFinalThinking() {
        return rawThinking;
      },
      getToolRecords() {
        return toolRecords;
      },
      getStats() {
        return resultStats;
      },
      finalize() {
        if (!rawMarkdown && toolsBox.children.length === 0) {
          proseContainer.textContent = 'Completed (no text output).';
        }
      }
    };

    function renderMarkdown() {
      if (typeof marked !== 'undefined') {
        proseContainer.innerHTML = marked.parse(rawMarkdown);
        addCopyButtonsToCodeBlocks(proseContainer);
      } else {
        proseContainer.textContent = rawMarkdown;
      }
      scrollToBottom();
    }
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
    let html = '<div class="diff-container">';
    if (oldStr) {
      oldStr.split('\n').forEach(line => {
        html += `<div class="diff-row del">- ${escapeHtml(line)}</div>`;
      });
    }
    if (newStr) {
      newStr.split('\n').forEach(line => {
        html += `<div class="diff-row add">+ ${escapeHtml(line)}</div>`;
      });
    }
    html += '</div>';
    return html;
  }

  function addCopyButtonsToCodeBlocks(container) {
    const pres = container.querySelectorAll('pre');
    pres.forEach(pre => {
      if (pre.querySelector('.code-topbar')) return;
      const code = pre.querySelector('code');
      const langClass = Array.from(code.classList).find(c => c.startsWith('language-'));
      const lang = langClass ? langClass.replace('language-', '') : 'code';

      const topbar = document.createElement('div');
      topbar.className = 'code-topbar';
      topbar.innerHTML = `
        <span>${escapeHtml(lang)}</span>
        <button class="code-copy-btn">Copy</button>
      `;

      const copyBtn = topbar.querySelector('.code-copy-btn');
      copyBtn.addEventListener('click', () => {
        navigator.clipboard.writeText(code.innerText).then(() => {
          copyBtn.textContent = 'Copied!';
          showToast('Code copied to clipboard', 'success');
          setTimeout(() => (copyBtn.textContent = 'Copy'), 1800);
        });
      });

      pre.insertBefore(topbar, code);
    });
  }

  function appendUserMessage(text, attachments = []) {
    const turn = document.createElement('div');
    turn.className = 'turn-user';

    let html = `<div class="user-message-card">${escapeHtml(text)}</div>`;

    if (attachments && attachments.length > 0) {
      html += `<div class="user-attachments-grid">`;
      attachments.forEach(att => {
        const thumbHtml = att.isImage && att.url
          ? `<img src="${att.url}" class="user-attachment-thumb" alt="thumb">`
          : `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline></svg>`;

        html += `
          <div class="user-attachment-card" data-path="${escapeHtml(att.relPath)}">
            ${thumbHtml}
            <span>${escapeHtml(att.name)}</span>
          </div>
        `;
      });
      html += `</div>`;
    }

    turn.innerHTML = html;

    // Attach click listener to view attached files in modal
    turn.querySelectorAll('.user-attachment-card').forEach(card => {
      card.addEventListener('click', () => {
        const relPath = card.getAttribute('data-path');
        if (relPath) openFileModal(relPath);
      });
    });

    messagesFeed.appendChild(turn);
    scrollToBottom();
  }

  function appendSystemNotice(html) {
    const div = document.createElement('div');
    div.style.textAlign = 'center';
    div.style.fontSize = '12px';
    div.style.color = 'var(--text-faint)';
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
      showToast('Stopping active process...', 'info');
    } catch (e) {
      console.error('Error stopping:', e);
    }
  }

  function setRunning(running) {
    isRunning = running;
    sendBtn.style.display = running ? 'none' : 'inline-flex';
    stopBtn.style.display = running ? 'inline-flex' : 'none';
    promptInput.disabled = running;
    activeStatusPill.textContent = running ? 'Claude is working...' : 'Ready';
    if (statusDot) {
      statusDot.className = `status-indicator-dot ${running ? 'running' : 'idle'}`;
    }
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

    // Rename Session
    if (renameSessionBtn) {
      renameSessionBtn.addEventListener('click', renameCurrentSession);
    }

    // Export Chat
    if (exportChatBtn) {
      exportChatBtn.addEventListener('click', exportChatMarkdown);
    }

    // Filter Sessions
    if (sessionSearchInput) {
      sessionSearchInput.addEventListener('input', (e) => {
        sessionSearchQuery = e.target.value;
        renderSessions();
      });
    }

    // Model Selector Custom Mode Toggle
    if (modelSelect) {
      modelSelect.addEventListener('change', (e) => {
        if (e.target.value === '__custom__') {
          customModelInput.style.display = 'inline-block';
          customModelInput.focus();
        } else {
          customModelInput.style.display = 'none';
        }
      });
    }

    // Clear Chat
    clearChatBtn.addEventListener('click', () => {
      clearChatUI();
      chatHistory = [];
      welcomeScreen.style.display = 'flex';
      showToast('Cleared conversation view');
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

    // OmniRoute status click to re-check
    omnirouteBadge.addEventListener('click', async () => {
      showToast('Checking OmniRoute router status...');
      await checkOmniroute();
    });

    // Tabs inside sidebar (Sessions vs Files)
    document.querySelectorAll('.tab-item').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.tab-item').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.tab-panel').forEach(c => c.classList.remove('active'));
        btn.classList.add('active');
        const targetTab = document.getElementById(btn.dataset.tab);
        if (targetTab) targetTab.classList.add('active');
      });
    });

    // Refresh Files
    refreshFilesBtn.addEventListener('click', () => {
      loadFiles();
      showToast('Refreshed file tree');
    });

    // Suggestion Cards on Hero Welcome
    document.querySelectorAll('.hero-card').forEach(card => {
      card.addEventListener('click', () => {
        const p = card.getAttribute('data-prompt');
        if (p) {
          promptInput.value = p;
          submitPrompt();
        }
      });
    });

    // Quick Command Chips
    document.querySelectorAll('.chip').forEach(chip => {
      chip.addEventListener('click', () => {
        const cmd = chip.getAttribute('data-cmd');
        if (cmd) {
          promptInput.value = cmd;
          promptInput.focus();
        }
      });
    });

    // Scroll to bottom button
    if (scrollBottomBtn) {
      chatContainer.addEventListener('scroll', () => {
        const distFromBottom = chatContainer.scrollHeight - chatContainer.scrollTop - chatContainer.clientHeight;
        scrollBottomBtn.style.display = distFromBottom > 150 ? 'flex' : 'none';
      });

      scrollBottomBtn.addEventListener('click', () => {
        chatContainer.scrollTo({ top: chatContainer.scrollHeight, behavior: 'smooth' });
      });
    }

    // Copy File Modal Content
    if (copyFileContentBtn) {
      copyFileContentBtn.addEventListener('click', () => {
        if (currentModalFileData) {
          navigator.clipboard.writeText(currentModalFileData.content || '').then(() => {
            showToast('File content copied to clipboard', 'success');
          });
        }
      });
    }

    // Modal Tabs (Code vs Visual Preview)
    if (modalTabCode) {
      modalTabCode.addEventListener('click', () => switchModalTab('code'));
    }
    if (modalTabPreview) {
      modalTabPreview.addEventListener('click', () => switchModalTab('preview'));
    }

    // Close File Modal
    closeModalBtn.addEventListener('click', () => {
      fileModal.classList.remove('active');
    });
    fileModal.addEventListener('click', (e) => {
      if (e.target === fileModal) fileModal.classList.remove('active');
    });

    // Global Keyboard Shortcuts
    document.addEventListener('keydown', (e) => {
      // Escape closes modal
      if (e.key === 'Escape') {
        if (fileModal.classList.contains('active')) {
          fileModal.classList.remove('active');
        }
      }
      // Ctrl+B toggles sidebar
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'b') {
        e.preventDefault();
        sidebar.classList.toggle('collapsed');
      }
      // Ctrl+N starts new session
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'n') {
        e.preventDefault();
        startNewSession();
      }
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
