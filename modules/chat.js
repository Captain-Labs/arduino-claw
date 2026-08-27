// modules/chat.js — Chat Panel Renderer
import { setCode, resetEditorTabs, DEFAULT_CODE } from './editor.js';

const messages = [];
let chatContainer = null;
let thinkingCounter = 0;
let onChipClickCallback = null;

const STARTER_CHIPS = [
  { text: "Blink built-in LED every 500ms", label: "Blink LED" },
  { text: "Sweep SG90 servo motor from 0 to 180 degrees", label: "Servo Sweep" },
  { text: "Read analog sensor on A0 and print status to Serial", label: "Read Sensor" }
];

let activeSessionId = null;
let onSessionListUpdateCallback = null;

export function getActiveSessionId() {
  if (!activeSessionId) {
    activeSessionId = localStorage.getItem('arduino-claw:chat-active-session-id');
    if (!activeSessionId) {
      activeSessionId = createNewSession();
    }
  }
  return activeSessionId;
}

export function setActiveSessionId(id) {
  activeSessionId = id;
  localStorage.setItem('arduino-claw:chat-active-session-id', id);
}

export function getSessionsList() {
  try {
    return JSON.parse(localStorage.getItem('arduino-claw:chat-sessions')) || [];
  } catch (_) {
    return [];
  }
}

function createNewSession() {
  const newId = 'session_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
  const sessions = getSessionsList();
  sessions.unshift({
    id: newId,
    title: 'New Chat',
    timestamp: new Date().toISOString(),
    code: DEFAULT_CODE
  });
  localStorage.setItem('arduino-claw:chat-sessions', JSON.stringify(sessions));
  localStorage.setItem(`arduino-claw:chat-messages:${newId}`, JSON.stringify([]));
  setActiveSessionId(newId);
  return newId;
}

function getSessionMessages(id) {
  try {
    const raw = localStorage.getItem(`arduino-claw:chat-messages:${id}`);
    if (!raw) return [];
    const msgs = JSON.parse(raw) || [];
    return msgs.map(m => ({
      ...m,
      timestamp: m.timestamp ? new Date(m.timestamp) : new Date()
    }));
  } catch (_) {
    return [];
  }
}

function updateSessionTitleIfNeeded(id, firstUserMessage) {
  const sessions = getSessionsList();
  const session = sessions.find(s => s.id === id);
  if (session && (session.title === 'New Chat' || session.title === '')) {
    let title = firstUserMessage.trim();
    if (title.length > 25) title = title.substring(0, 25) + '...';
    session.title = title || 'New Chat';
    localStorage.setItem('arduino-claw:chat-sessions', JSON.stringify(sessions));
    dispatchSessionListUpdate();

    // Update editor header tab filename
    const editorFilename = document.getElementById('editor-filename');
    if (editorFilename) {
      if (session.title !== 'New Chat') {
        const sanitized = session.title.replace(/[^a-zA-Z0-9_\- ]/g, '');
        editorFilename.textContent = `${sanitized}.ino`;
      } else {
        editorFilename.textContent = 'sketch.ino';
      }
    }
  }
}

export function renameSession(id, newTitle) {
  const sessions = getSessionsList();
  const session = sessions.find(s => s.id === id);
  if (session && newTitle && newTitle.trim()) {
    session.title = newTitle.trim();
    localStorage.setItem('arduino-claw:chat-sessions', JSON.stringify(sessions));

    // Update editor header tab filename if active session
    if (getActiveSessionId() === id) {
      const editorFilename = document.getElementById('editor-filename');
      if (editorFilename) {
        const sanitized = session.title.replace(/[^a-zA-Z0-9_\- ]/g, '');
        editorFilename.textContent = `${sanitized || 'sketch'}.ino`;
      }
    }

    dispatchSessionListUpdate();
  }
}

export function onSessionListUpdate(cb) {
  onSessionListUpdateCallback = cb;
}

function dispatchSessionListUpdate() {
  if (onSessionListUpdateCallback) {
    onSessionListUpdateCallback(getSessionsList(), getActiveSessionId());
  }
}

export function loadSession(id) {
  setActiveSessionId(id);
  messages.length = 0;
  if (chatContainer) {
    chatContainer.innerHTML = '';
  }
  const loaded = getSessionMessages(id);
  if (loaded.length === 0) {
    renderEmptyState();
  } else {
    loaded.forEach(msg => {
      messages.push(msg);
      renderMessage(msg);
    });
  }

  // Load session code into editor if available (closing any previous temporary diagnostic tabs)
  const sessions = getSessionsList();
  const session = sessions.find(s => s.id === id);
  if (session && session.code !== undefined && session.code !== null) {
    resetEditorTabs(session.code);
  } else {
    resetEditorTabs(DEFAULT_CODE);
  }

  // Update editor header tab filename
  const editorFilename = document.getElementById('editor-filename');
  if (editorFilename) {
    if (session && session.title && session.title !== 'New Chat') {
      const sanitized = session.title.replace(/[^a-zA-Z0-9_\- ]/g, '');
      editorFilename.textContent = `${sanitized}.ino`;
    } else {
      editorFilename.textContent = 'sketch.ino';
    }
  }

  dispatchSessionListUpdate();
}

export function deleteSession(id) {
  let sessions = getSessionsList();
  sessions = sessions.filter(s => s.id !== id);
  localStorage.setItem('arduino-claw:chat-sessions', JSON.stringify(sessions));
  localStorage.removeItem(`arduino-claw:chat-messages:${id}`);

  const activeId = getActiveSessionId();
  if (activeId === id) {
    if (sessions.length > 0) {
      loadSession(sessions[0].id);
    } else {
      const newId = createNewSession();
      loadSession(newId);
    }
  } else {
    dispatchSessionListUpdate();
  }
}

export function startNewSession() {
  const newId = createNewSession();
  loadSession(newId);
}

/**
 * Initialize the chat module with a DOM container.
 * @param {HTMLElement} container
 * @param {function} onChipClick
 */
export function initChat(container, onChipClick) {
  chatContainer = container;
  onChipClickCallback = onChipClick;

  // Make sure we have at least one session on load
  const sessions = getSessionsList();
  if (sessions.length === 0) {
    createNewSession();
  }

  // Load the messages for the active session
  const activeId = getActiveSessionId();
  loadSession(activeId);

  // Attach global event listener for copying and applying generated code
  document.addEventListener('click', (e) => {
    const copyBtn = e.target.closest('.btn-copy-code');
    const applyBtn = e.target.closest('.btn-apply-code');

    if (copyBtn) {
      const container = copyBtn.closest('.chat-code-container');
      const codeEl = container?.querySelector('code');
      if (codeEl) {
        navigator.clipboard.writeText(codeEl.textContent);
        const originalText = copyBtn.innerHTML;
        copyBtn.innerHTML = '✓ Copied!';
        setTimeout(() => { copyBtn.innerHTML = originalText; }, 2000);
      }
    }

    if (applyBtn) {
      const container = applyBtn.closest('.chat-code-container');
      const codeEl = container?.querySelector('code');
      if (codeEl) {
        setCode(codeEl.textContent);
        const originalText = applyBtn.innerHTML;
        applyBtn.innerHTML = '✓ Loaded!';
        setTimeout(() => { applyBtn.innerHTML = originalText; }, 2000);
      }
    }
  });
}

/**
 * Add a message to the chat panel.
 * @param {'user'|'ai'|'system'} role
 * @param {string} text
 */
export function addMessage(role, text, reference = '') {
  const msg = { role, text, reference, timestamp: new Date() };
  
  if (messages.length === 0 && chatContainer) {
    chatContainer.innerHTML = '';
  }

  messages.push(msg);
  renderMessage(msg);

  // Save to active session storage
  const currentId = getActiveSessionId();
  const sessionMsgs = getSessionMessages(currentId);
  sessionMsgs.push(msg);
  localStorage.setItem(`arduino-claw:chat-messages:${currentId}`, JSON.stringify(sessionMsgs));

  // Update session title based on first user message
  if (role === 'user') {
    updateSessionTitleIfNeeded(currentId, text);
  }
}

/**
 * Clear all messages from the chat.
 */
export function clearChat() {
  messages.length = 0;
  if (chatContainer) {
    chatContainer.innerHTML = '';
    renderEmptyState();
  }
  resetEditorTabs(DEFAULT_CODE);
  const activeId = getActiveSessionId();
  localStorage.setItem(`arduino-claw:chat-messages:${activeId}`, JSON.stringify([]));
}

/**
 * Show an animated "thinking" bubble.
 * @returns {string} - ID to remove later
 */
export function renderThinking() {
  thinkingCounter++;
  const id = `thinking-${thinkingCounter}`;

  const bubble = document.createElement('div');
  bubble.className = 'chat-bubble ai thinking';
  bubble.id = id;
  bubble.innerHTML = `
    <div class="chat-content">
      <div class="thinking-dots">
        <span></span><span></span><span></span>
      </div>
    </div>
  `;

  chatContainer.appendChild(bubble);
  scrollToBottom();

  return id;
}

/**
 * Remove a thinking bubble by its ID.
 * @param {string} id
 */
export function removeThinking(id) {
  const el = document.getElementById(id);
  if (el) {
    el.classList.add('fade-out');
    setTimeout(() => el.remove(), 200);
  }
}

/**
 * Show dynamic process steps inside the Chat area.
 * Displays only one at a time.
 */
export function showProcessStep(text) {
  const container = document.getElementById('chat-process-container');
  const label = document.getElementById('chat-process-label');
  if (container && label) {
    label.innerHTML = replaceEmojisWithSVGs(text);
    container.classList.remove('hidden');
    scrollToBottom();
  }
}

/**
 * Hide the dynamic process step overlay.
 */
export function hideProcessStep() {
  const container = document.getElementById('chat-process-container');
  if (container) {
    container.classList.add('hidden');
  }
}

/**
 * Render interactive pin selection options in the chat container.
 * @param {Array<string>} components
 * @param {function(string)} onSubmitPrompt
 */
export function renderPinOptions(components, onSubmitPrompt) {
  if (!chatContainer) return;

  const bubble = document.createElement('div');
  bubble.className = 'chat-bubble ai';
  
  const id = `pin-options-${Date.now()}`;
  bubble.id = id;
  
  bubble.innerHTML = `
    <div class="chat-content">
      <div class="chat-text">
        Pin numbers are not specified for some components. How would you like to configure them?
        <div class="pin-choice-container">
          <button class="pin-choice-btn btn-ai-pins">
            Let AI Decide Pins
          </button>
          <button class="pin-choice-btn btn-manual-pins">
            Enter Pins Manually
          </button>
        </div>
      </div>
    </div>
  `;

  chatContainer.appendChild(bubble);
  scrollToBottom();

  const aiBtn = bubble.querySelector('.btn-ai-pins');
  const manualBtn = bubble.querySelector('.btn-manual-pins');
  const chatContent = bubble.querySelector('.chat-content');

  aiBtn.addEventListener('click', () => {
    bubble.remove();
    onSubmitPrompt('ai-decide');
  });

  manualBtn.addEventListener('click', () => {
    // Replace choices with table form
    const pins = ["D2", "D3", "D4", "D5", "D6", "D7", "D8", "D9", "D10", "D11", "D12", "D13", "A0", "A1", "A2", "A3", "A4", "A5"];
    
    let tableRows = '';
    components.forEach((c, idx) => {
      // Suggest standard pins as defaults to make it user-friendly
      const defaultPin = idx === 0 ? "D3" : (idx === 1 ? "D9" : "D4");
      
      tableRows += `
        <tr>
          <td><strong>${escapeHtml(c)}</strong></td>
          <td>
            <select class="pin-select" data-component="${escapeHtml(c)}">
              ${pins.map(p => `<option value="${p}" ${p === defaultPin ? 'selected' : ''}>${p}</option>`).join('')}
            </select>
          </td>
        </tr>
      `;
    });

    chatContent.innerHTML = `
      <div class="pin-selection-form">
        <div class="pin-form-title">Specify Pins Manually</div>
        <table class="pin-form-table">
          <thead>
            <tr>
              <th>Component</th>
              <th>Arduino Pin</th>
            </tr>
          </thead>
          <tbody>
            ${tableRows}
          </tbody>
        </table>
        <button class="pin-form-submit-btn">Submit Pins</button>
      </div>
    `;
    scrollToBottom();

    const submitBtn = chatContent.querySelector('.pin-form-submit-btn');
    submitBtn.addEventListener('click', () => {
      const selections = [];
      chatContent.querySelectorAll('.pin-select').forEach(select => {
        const comp = select.dataset.component;
        const val = select.value;
        selections.push(`${comp} on pin ${val}`);
      });
      
      bubble.remove();
      onSubmitPrompt(selections.join(', '));
    });
  });
}

/**
 * Get all messages.
 * @returns {Array}
 */
export function getMessages() {
  return [...messages];
}

// ─── Internal Rendering ──────────────────────────────────────────────────────

function renderEmptyState() {
  if (!chatContainer) return;

  const emptyDiv = document.createElement('div');
  emptyDiv.className = 'chat-empty-state';
  emptyDiv.innerHTML = `
    <div class="chat-empty-logo-wrapper" style="display: flex; justify-content: center; margin-bottom: 20px;">
      <img src="arduino%20claw.svg" style="width: 80px; height: 80px; border-radius: 14px; background: var(--bg-secondary); padding: 12px; border: 1px solid var(--border); filter: brightness(1.6);" alt="Arduino-Claw Logo">
    </div>
    <div class="chat-empty-title">Arduino AI Assistant</div>
    <div class="chat-empty-subtitle">Type a natural language instruction below to generate C++ code and upload it to your board. Or choose a template:</div>
    <div class="chat-chips-grid" id="chat-chips-grid"></div>
  `;
  chatContainer.appendChild(emptyDiv);

  const chipsGrid = emptyDiv.querySelector('#chat-chips-grid');
  STARTER_CHIPS.forEach(chip => {
    const chipBtn = document.createElement('button');
    chipBtn.className = 'chat-prompt-chip';
    chipBtn.innerHTML = `
      <span>${chip.label}</span>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <line x1="5" y1="12" x2="19" y2="12"></line>
        <polyline points="12 5 19 12 12 19"></polyline>
      </svg>
    `;
    chipBtn.addEventListener('click', () => {
      if (onChipClickCallback) onChipClickCallback(chip.text);
    });
    chipsGrid.appendChild(chipBtn);
  });
}

export function renderCompileErrorCard(errMsg, onRetry) {
  if (!chatContainer) return;

  const bubble = document.createElement('div');
  bubble.className = 'chat-bubble ai compile-error-bubble';
  const time = formatTime(new Date());

  const isMissingCore = errMsg.includes("Platform core '") || errMsg.includes('platform not installed');
  const coreMatch = errMsg.match(/Platform core '([^']+)'/i);
  const coreId = coreMatch ? coreMatch[1] : '';

  bubble.innerHTML = `
    <div class="chat-content" style="width: 100%; max-width: 100%;">
      <div class="compile-error-card">
        <div class="compile-error-header">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#ff5f56" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="10"></circle>
            <line x1="12" y1="8" x2="12" y2="12"></line>
            <line x1="12" y1="16" x2="12.01" y2="16"></line>
          </svg>
          <span>Compilation Error</span>
        </div>
        <pre class="compile-error-text">${escapeHtml(errMsg)}</pre>
        <div class="compile-error-actions" style="display: flex; gap: 8px; flex-wrap: wrap;">
          ${isMissingCore && coreId ? `
            <button class="compile-install-core-btn" style="display: inline-flex; align-items: center; gap: 6px; background: var(--accent); color: #000; font-weight: 600; padding: 6px 12px; border-radius: 6px; border: none; cursor: pointer; font-size: 12px;">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                <polyline points="7 10 12 15 17 10"></polyline>
                <line x1="12" y1="15" x2="12" y2="3"></line>
              </svg>
              Install '${coreId}' Core
            </button>
          ` : ''}
          <button class="compile-retry-btn">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/>
            </svg>
            Auto-Fix with AI & Retry
          </button>
        </div>
      </div>
      <div class="chat-time">${time}</div>
    </div>
  `;

  const installCoreBtn = bubble.querySelector('.compile-install-core-btn');
  if (installCoreBtn && coreId) {
    installCoreBtn.addEventListener('click', async () => {
      installCoreBtn.disabled = true;
      installCoreBtn.innerHTML = `<span class="spinner-inline" style="display:inline-block; width:12px; height:12px; border:2px solid #000; border-top-color:transparent; border-radius:50%; animation: spin 0.8s linear infinite; margin-right:6px;"></span> Installing ${coreId}…`;
      try {
        const res = await fetch('http://localhost:5000/cores/install', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ core: coreId })
        });
        const data = await res.json();
        if (data.success) {
          installCoreBtn.innerHTML = `✓ ${coreId} Installed!`;
          setTimeout(() => {
            if (onRetry) onRetry();
          }, 800);
        } else {
          installCoreBtn.innerHTML = `⚠️ Install Failed`;
        }
      } catch (err) {
        installCoreBtn.innerHTML = `⚠️ Error: ${err.message}`;
      }
    });
  }

  const btn = bubble.querySelector('.compile-retry-btn');
  if (btn && onRetry) {
    btn.addEventListener('click', () => {
      btn.disabled = true;
      btn.style.opacity = '0.7';
      btn.innerHTML = `<span class="spinner-inline" style="display:inline-block; width:12px; height:12px; border:2px solid #fff; border-top-color:transparent; border-radius:50%; animation: spin 0.8s linear infinite; margin-right:6px;"></span> Fixing with AI...`;
      onRetry();
    });
  }

  chatContainer.appendChild(bubble);
  scrollToBottom();
}

function renderMessage(msg) {
  if (!chatContainer) return;

  const bubble = document.createElement('div');
  bubble.className = `chat-bubble ${msg.role}`;

  const time = formatTime(msg.timestamp);

  if (msg.role === 'user') {
    let refHtml = '';
    if (msg.reference) {
      refHtml = `
        <div class="chat-message-reference" style="background: rgba(255, 255, 255, 0.05); border: 1px solid var(--border); border-radius: var(--radius-sm); padding: 8px; margin-bottom: 6px; width: 100%;">
          <div style="font-size: 10px; font-weight: 600; color: var(--accent); text-transform: uppercase; margin-bottom: 4px; display: flex; align-items: center; gap: 4px;">
            <span>${replaceEmojisWithSVGs('📎')}</span> REFERENCE SELECTION
          </div>
          <pre style="margin: 0; font-family: var(--font-mono); font-size: 11px; white-space: pre-wrap; word-break: break-all; color: var(--text-primary); max-height: 100px; overflow-y: auto;">${escapeHtml(msg.reference)}</pre>
        </div>
      `;
    }
    bubble.innerHTML = `
      <div class="chat-content">
        ${refHtml}
        <div class="chat-text">${replaceEmojisWithSVGs(escapeHtml(msg.text))}</div>
      </div>
    `;
  } else if (msg.role === 'ai') {
    bubble.innerHTML = `
      <div class="chat-content">
        <div class="chat-text">${replaceEmojisWithSVGs(formatAIText(msg.text))}</div>
      </div>
    `;
  } else {
    // system — allow simple bold tags for port names etc.
    const safeText = msg.text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      // Re-allow <strong> and </strong>
      .replace(/&lt;strong&gt;/g, '<strong>')
      .replace(/&lt;\/strong&gt;/g, '</strong>')
      .replace(/\n/g, '<br>');
    bubble.innerHTML = `
      <div class="chat-content">
        <div class="chat-text">${replaceEmojisWithSVGs(safeText)}</div>
      </div>
    `;
  }

  chatContainer.appendChild(bubble);
  scrollToBottom();
}

function scrollToBottom() {
  if (chatContainer) {
    requestAnimationFrame(() => {
      chatContainer.scrollTop = chatContainer.scrollHeight;
    });
  }
}

function formatTime(date) {
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatAIText(text) {
  let formatted = text;

  // Extract code blocks to render them inside card containers with actions
  const codeBlocks = [];
  formatted = formatted.replace(/```(?:cpp|arduino|c\+\+)?\s*([\s\S]*?)```/gi, (match, code) => {
    const id = `__CODE_BLOCK_${codeBlocks.length}__`;
    codeBlocks.push(code);
    return id;
  });

  // Escape HTML of normal text
  formatted = escapeHtml(formatted);

  // Parse markdown tables
  formatted = parseMarkdownTables(formatted);

  // Re-insert code blocks formatted with action bar controls
  codeBlocks.forEach((code, i) => {
    const escapedCode = escapeHtml(code);
    const html = `
      <div class="chat-code-container">
        <div class="chat-code-header">
          <span class="chat-code-lang">Arduino C++</span>
          <div class="chat-code-actions">
            <button class="chat-code-btn btn-copy-code" title="Copy to Clipboard">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"></path><rect x="8" y="2" width="8" height="4" rx="1" ry="1"></rect></svg>
              Copy
            </button>
            <button class="chat-code-btn btn-apply-code" title="Load into Code Editor">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="8 17 12 21 16 17"></polyline><line x1="12" y1="12" x2="12" y2="21"></line><path d="M20.88 18.09A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.29"></path></svg>
              Load Editor
            </button>
          </div>
        </div>
        <pre class="chat-code-block"><code>${escapedCode}</code></pre>
      </div>
    `;
    formatted = formatted.replace(`__CODE_BLOCK_${i}__`, html);
  });

  // Inline code: `code`
  formatted = formatted.replace(/`([^`]+)`/g, '<code class="inline-code">$1</code>');
  
  // Basic markdown tags: bold (**text**), italic (*text*), lists
  formatted = formatted.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  formatted = formatted.replace(/\*([^*]+)\*/g, '<em>$1</em>');
  
  // Headings: ### Title
  formatted = formatted.replace(/^###\s+(.+)$/gm, '<h3 class="chat-heading">$1</h3>');

  // Line breaks, avoiding inside <pre> and <div class="chat-table-wrapper"> blocks
  const parts = formatted.split(/(<pre[\s\S]*?<\/pre>|<div class="chat-table-wrapper">[\s\S]*?<\/div>)/g);
  for (let i = 0; i < parts.length; i++) {
    if (!parts[i].startsWith('<pre') && !parts[i].startsWith('<div class="chat-table-wrapper"')) {
      parts[i] = parts[i].replace(/\n/g, '<br>');
    }
  }
  formatted = parts.join('');

  // Clean up any extra spacing before/after headings and tables
  formatted = formatted.replace(/(?:<br>\s*)+(<h3 class="chat-heading">)/gi, '$1');
  formatted = formatted.replace(/(?:<br>\s*)+(<div class="chat-table-wrapper">)/gi, '$1');
  formatted = formatted.replace(/(<\/h3>|<\/div>)(?:\s*<br>)+/gi, '$1');

  return formatted;
}

function parseMarkdownTables(text) {
  const lines = text.split('\n');
  let inTable = false;
  let tableRows = [];
  const output = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line.startsWith('|') && line.endsWith('|')) {
      if (!inTable) {
        inTable = true;
        tableRows = [];
      }
      tableRows.push(line);
    } else {
      if (inTable) {
        output.push(renderMarkdownTable(tableRows));
        inTable = false;
      }
      output.push(lines[i]);
    }
  }
  if (inTable) {
    output.push(renderMarkdownTable(tableRows));
  }
  return output.join('\n');
}

function renderMarkdownTable(rows) {
  let html = '<div class="chat-table-wrapper"><table class="chat-table">';
  
  rows.forEach((row, index) => {
    // Remove leading and trailing pipes, then split by pipe
    const cells = row.slice(1, -1).split('|').map(c => c.trim());
    
    // Skip divider row: |---|---|
    if (index === 1 && cells.every(c => /^:-{1,}:?|^-{1,}:?|:-{1,}$/.test(c))) {
      return;
    }
    
    html += '<tr>';
    cells.forEach(cell => {
      if (index === 0) {
        html += `<th>${cell}</th>`;
      } else {
        html += `<td>${cell}</td>`;
      }
    });
    html += '</tr>';
  });
  
  html += '</table></div>';
  return html;
}

const EMOJI_SVG_MAP = {
  '📎': `<svg class="icon-svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block; vertical-align:middle; margin-right:4px;"><path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>`,
  '🤖': `<svg class="icon-svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block; vertical-align:middle; margin-right:4px;"><rect x="3" y="11" width="18" height="10" rx="2"/><circle cx="12" cy="5" r="2"/><path d="M12 7v4M8 15h.01M16 15h.01"/></svg>`,
  '⌨️': `<svg class="icon-svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block; vertical-align:middle; margin-right:4px;"><rect x="2" y="4" width="20" height="16" rx="2" ry="2"/><path d="M6 8h.01M10 8h.01M14 8h.01M18 8h.01M6 12h.01M10 12h.01M14 12h.01M18 12h.01M7 16h10"/></svg>`,
  '🚀': `<svg class="icon-svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block; vertical-align:middle; margin-right:4px;"><path d="M4.5 16.5c-1.5 1.26-2 2.76-2 3.75a.5.5 0 0 0 .5.5c.99 0 2.49-.5 3.75-2M12 12c2-2 5-2.5 7-4.5 2-2 1.5-5.5-.5-7.5s-5.5-2.5-7.5-.5c-2 2-2.5 5-4.5 7M22 2l-2 2M16 8l-6 6M9 15l-3 3M15 9l-3 3"/></svg>`,
  '🔓': `<svg class="icon-svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block; vertical-align:middle; margin-right:4px;"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 9.9-1"/></svg>`,
  '⚠️': `<svg class="icon-svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#ffcc00" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block; vertical-align:middle; margin-right:4px;"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`,
  '🔄': `<svg class="icon-svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block; vertical-align:middle; margin-right:4px;"><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/></svg>`,
  '✅': `<svg class="icon-svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#4cd964" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block; vertical-align:middle; margin-right:4px;"><polyline points="20 6 9 17 4 12"/></svg>`,
  '🌀': `<svg class="icon-svg spinner" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block; vertical-align:middle; margin-right:4px; animation: spin 1s linear infinite;"><path d="M21 12a9 9 0 1 1-6.21-8.58"/></svg>`
};

const emojiRegex = /[\u{1F300}-\u{1F6FF}\u{1F900}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F1E6}-\u{1F1FF}\u{1F191}-\u{1F251}\u{1F680}-\u{1F6FF}\u{1F780}-\u{1F7FF}\u{1F800}-\u{1F8FF}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FAFF}\u{2a72}-\u{2d7f}]/gu;

export function replaceEmojisWithSVGs(text) {
  if (typeof text !== 'string') return text;
  let result = text;
  for (const [emoji, svg] of Object.entries(EMOJI_SVG_MAP)) {
    result = result.split(emoji).join(svg);
  }
  result = result.replace(emojiRegex, '');
  return result;
}


