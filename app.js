// app.js — Entry Point: Wires all modules together
// Arduino-Claw: AI-powered Arduino IDE in the browser

import { generateCode, evaluateOutput } from './modules/ai.js';
import * as serial from './modules/serial.js';
import { flashHex, parseIntelHex } from './modules/flasher.js';
import { initEditor, getCode, setCode, getEditorView, onSelectionChange, openTab, switchTab, closeTab, setMainCode, getMainCode } from './modules/editor.js';
import { initChat, addMessage, renderThinking, removeThinking, clearChat, showProcessStep, hideProcessStep, renderPinOptions, renderCompileErrorCard, onSessionListUpdate, loadSession, deleteSession, startNewSession, renameSession, getSessionsList, getActiveSessionId } from './modules/chat.js';
import { initFeedback, addAttempt, setSerialOutput, getHistory, getCurrentCommand, showFeedbackBar, hideFeedbackBar, clearHistory, setCompileError } from './modules/feedback.js';
import { initSettings, getProvider, getApiKey, getBaud, hasApiKey, openSettings, closeSettings, toggleSettings, getLlamaUrl, getLlamaModel, getUploadMode, setUploadMode, getMaxSerialLines, getSerialCaptureLimit, getAutoUpdate } from './modules/settings.js';
import * as bridge from './modules/bridge.js';
import { initManager, openManager, initBoardSelector, getSelectedBoard, setSelectedBoard } from './modules/manager.js';
import { isI2CPotentialProject, I2C_SCANNER_SKETCH, parseDiscoveredI2CAddress, hasI2CCommunicationFailure } from './modules/i2c_agent.js';

// ═══════════════════════════════════════
// DOM References
// ═══════════════════════════════════════

const app = document.getElementById('app');
const chatMessages = document.getElementById('chat-messages');
const chatInput = document.getElementById('chat-input');
const sendBtn = document.getElementById('send-btn');
const uploadBtn = document.getElementById('upload-btn');
const connectBtn = document.getElementById('connect-btn');
const connectLabel = document.getElementById('connect-label');
const portDot = document.getElementById('port-dot');
const portLabel = document.getElementById('port-label');
const settingsBtn = document.getElementById('settings-btn');
const settingsPanel = document.getElementById('settings-panel');
const settingsOverlay = document.getElementById('settings-overlay');
const toolbarProviderName = document.getElementById('toolbar-provider-name');
const apiKeyBanner = document.getElementById('api-key-banner');
const bannerSettingsBtn = document.getElementById('banner-settings-btn');
const flashProgress = document.getElementById('flash-progress');
const flashProgressFill = document.getElementById('flash-progress-fill');
const flashProgressText = document.getElementById('flash-progress-text');
const flashProgressPct = document.getElementById('flash-progress-pct');
const serialMonitor = document.getElementById('serial-monitor');
const serialHeader = document.getElementById('serial-header');
const serialOutput = document.getElementById('serial-output');
const serialClearBtn = document.getElementById('serial-clear-btn');
const serialBaudDisplay = document.getElementById('serial-baud-display');
const serialCountdown = document.getElementById('serial-countdown');
const feedbackBar = document.getElementById('feedback-bar');
const editorContainer = document.getElementById('editor-container');
const unsupportedBanner = document.getElementById('unsupported-banner');
const autoUploadCanvas = document.getElementById('auto-upload-canvas');
const saveBtn = document.getElementById('save-btn');

// ═══════════════════════════════════════
// State
// ═══════════════════════════════════════

let isConnected = false;
let isGenerating = false;
let currentAbortController = null;
let isFlashing = false;

function setFlashing(val) {
  isFlashing = val;
  updateSendButtonState();
}

function setGenerating(val) {
  isGenerating = val;
  updateSendButtonState();
}
let lastGeneratedCode = '';
let lastCommand = '';
let serialCaptureBuffer = '';
let autoUploadActive = localStorage.getItem('auto_upload_active') === 'true';
let selectedCodeContext = '';
let selectedCliPort = null;

// ═══════════════════════════════════════
// Feature Detection
// ═══════════════════════════════════════

if (!serial.isSerialSupported()) {
  if (location.hostname === '0.0.0.0' || !window.isSecureContext) {
    unsupportedBanner.innerHTML = `
      <div class="unsupported-icon">🔌</div>
      <h2>Secure Context Required</h2>
      <p>You loaded the application from <strong>${location.origin}</strong>.</p>
      <p>USB Serial requires a secure context or desktop environment.</p>
      <p style="margin-top: 15px; font-size: 15px;">Please open the IDE at: <a href="http://localhost:${location.port || '8080'}/" style="color: var(--accent); font-weight: bold; text-decoration: underline;">http://localhost:${location.port || '8080'}/</a> instead!</p>
    `;
  }
  unsupportedBanner.classList.add('visible');
  app.style.display = 'none';
}

// ═══════════════════════════════════════
// Initialize Modules
// ═══════════════════════════════════════

initChat(chatMessages, (promptText) => {
  chatInput.value = promptText;
  handleSend();
});

function handleClearAllState() {
  // 1. Clear Serial Monitor display & buffer
  if (serialOutput) {
    serialOutput.textContent = '';
  }
  serialCaptureBuffer = '';
  serial.drainRxBuffer();

  // 2. Clear feedback attempt history & hide bar
  clearHistory();
  hideFeedbackBar();

  // 3. Clear pending prompt & reference selection
  lastCommand = '';
  selectedCodeContext = '';
  if (selectionContextCard) selectionContextCard.classList.add('hidden');
}

// Bind Delete Active Chat Button in Navbar
const chatClearBtn = document.getElementById('chat-clear-btn');
if (chatClearBtn) {
  chatClearBtn.title = 'Delete Chat Session';
  chatClearBtn.addEventListener('click', () => {
    const activeId = getActiveSessionId();
    if (confirm('Are you sure you want to delete this chat session?')) {
      deleteSession(activeId);
      handleClearAllState();
    }
  });
}

initFeedback(feedbackBar, handleRetry);

initSettings(settingsPanel, (provider) => {
  updateProviderDisplay(provider);
});

// Init editor (async — CodeMirror loads from CDN)
initEditor(editorContainer).then(() => {
  checkApiKeyBanner();
}).catch(err => {
  console.error('Editor init failed:', err);
  addMessage('system', 'Editor initialization failed. Please refresh the page.');
});

// Auto-detect ports and bridge
autoDetectPorts();
initBridgeStatus();
initMobileNav();
initResizers();
initManager();
initBoardSelector((board) => {
  addMessage('system', `Target Board switched to: <strong>${board.name}</strong> (<code>${board.fqbn}</code>)`);
});
checkArduinoUpdatesOnLaunch();

// ═══════════════════════════════════════
// Arduino CLI Update Checker & Toast Notification
// ═══════════════════════════════════════

let updateToastEl = null;

function createUpdateToast() {
  if (updateToastEl) return updateToastEl;

  updateToastEl = document.createElement('div');
  updateToastEl.className = 'update-toast';
  updateToastEl.id = 'arduino-update-toast';
  updateToastEl.innerHTML = `
    <div class="update-toast-header">
      <div class="update-toast-title">
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="var(--accent)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
          <polyline points="7 10 12 15 17 10"></polyline>
          <line x1="12" y1="15" x2="12" y2="3"></line>
        </svg>
        <span>Arduino IDE Updates Available</span>
      </div>
      <button class="update-toast-close" id="update-toast-close-btn" title="Dismiss">&times;</button>
    </div>
    <div class="update-toast-body" id="update-toast-body-text">
      New version(s) of Arduino core platform or libraries are available.
      <div class="update-toast-list" id="update-toast-list-box"></div>
    </div>
    <div class="update-toast-actions">
      <button class="btn-update-later" id="update-toast-later-btn">Remind Later</button>
      <button class="btn-update-install" id="update-toast-install-btn">
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="20 6 9 17 4 12"></polyline>
        </svg>
        <span>Install Update</span>
      </button>
    </div>
  `;

  document.body.appendChild(updateToastEl);

  const closeBtn = updateToastEl.querySelector('#update-toast-close-btn');
  const laterBtn = updateToastEl.querySelector('#update-toast-later-btn');
  const installBtn = updateToastEl.querySelector('#update-toast-install-btn');

  const hideToast = () => {
    updateToastEl.classList.remove('visible');
  };

  closeBtn.addEventListener('click', hideToast);
  laterBtn.addEventListener('click', hideToast);

  installBtn.addEventListener('click', async () => {
    installBtn.disabled = true;
    const btnSpan = installBtn.querySelector('span');
    btnSpan.textContent = 'Installing…';

    try {
      const res = await fetch('http://127.0.0.1:5000/updates/install', { method: 'POST' });
      const data = await res.json();
      if (res.ok && data.success) {
        document.getElementById('update-toast-body-text').innerHTML = '✅ <strong>All updates installed successfully!</strong>';
        installBtn.style.display = 'none';
        laterBtn.textContent = 'Close';
        addMessage('system', 'Arduino CLI cores and libraries were successfully updated to their latest versions.');
        setTimeout(hideToast, 3500);
      } else {
        alert('Update failed: ' + (data.error || 'Unknown error'));
        installBtn.disabled = false;
        btnSpan.textContent = 'Install Update';
      }
    } catch (err) {
      alert('Could not connect to compiler server to install updates.');
      installBtn.disabled = false;
      btnSpan.textContent = 'Install Update';
    }
  });

  return updateToastEl;
}

async function checkArduinoUpdatesOnLaunch() {
  try {
    const res = await fetch('http://127.0.0.1:5000/updates/check');
    if (!res.ok) return;

    const data = await res.json();
    if (!data.success || !data.has_updates) return;

    const items = [];
    (data.outdated_cores || []).forEach(c => items.push(`Core: ${c.name} (${c.installed} → ${c.latest})`));
    (data.outdated_libraries || []).forEach(l => items.push(`Lib: ${l.name} (${l.installed} → ${l.latest})`));

    if (items.length === 0) return;

    if (getAutoUpdate()) {
      addMessage('system', `⚡ Auto-updating ${items.length} Arduino CLI updates in background…`);
      const installRes = await fetch('http://127.0.0.1:5000/updates/install', { method: 'POST' });
      const installData = await installRes.json();
      if (installRes.ok && installData.success) {
        addMessage('system', '✅ Auto-update completed: All Arduino CLI cores and libraries are now up-to-date.');
      }
    } else {
      const toast = createUpdateToast();
      const listBox = toast.querySelector('#update-toast-list-box');
      listBox.innerHTML = items.map(it => `<div>• ${it}</div>`).join('');

      setTimeout(() => {
        toast.classList.add('visible');
      }, 1200);
    }
  } catch (err) {
    // Compiler server not running or network unavailable
  }
}

// ═══════════════════════════════════════
// Provider Display
// ═══════════════════════════════════════

function updateProviderDisplay(provider) {
  const display = provider === 'claude' ? 'Claude' : (provider === 'llama' ? getLlamaModel() : 'Gemini');
  toolbarProviderName.textContent = display;
}

updateProviderDisplay(getProvider());

// ═══════════════════════════════════════
// Auto-Upload
// ═══════════════════════════════════════

let autoUploadProgress = autoUploadActive ? 1 : 0;
let autoUploadTarget = autoUploadActive ? 1 : 0;
let autoUploadAnimating = false;

function drawRoundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function drawAutoUploadToggle() {
  if (!autoUploadCanvas) return;
  const ctx = autoUploadCanvas.getContext('2d');
  ctx.clearRect(0, 0, autoUploadCanvas.width, autoUploadCanvas.height);

  // Background color interpolation (using the green and gray values from user request)
  const r = Math.round(lerp(120, 76, autoUploadProgress));
  const g = Math.round(lerp(120, 175, autoUploadProgress));
  const b = Math.round(lerp(120, 80, autoUploadProgress));

  // Track (dimensions scaled to fit 50x24 canvas)
  drawRoundRect(ctx, 5, 2, 40, 20, 10);
  ctx.fillStyle = `rgb(${r},${g},${b})`;
  ctx.fill();

  // Glow
  if (autoUploadProgress > 0) {
    ctx.shadowBlur = 6 * autoUploadProgress;
    ctx.shadowColor = '#4CAF50';
    // Redraw track for glow effect
    drawRoundRect(ctx, 5, 2, 40, 20, 10);
    ctx.fillStyle = `rgb(${r},${g},${b})`;
    ctx.fill();
  }

  // Knob
  const knobX = lerp(15, 35, autoUploadProgress);
  ctx.beginPath();
  ctx.arc(knobX, 12, 7, 0, Math.PI * 2);
  ctx.fillStyle = 'white';
  ctx.fill();

  ctx.shadowBlur = 0;
}

function animateAutoUploadToggle() {
  autoUploadProgress += (autoUploadTarget - autoUploadProgress) * 0.18;

  if (Math.abs(autoUploadProgress - autoUploadTarget) < 0.001) {
    autoUploadProgress = autoUploadTarget;
    autoUploadAnimating = false;
  }

  drawAutoUploadToggle();

  if (autoUploadAnimating) {
    requestAnimationFrame(animateAutoUploadToggle);
  }
}

function updateAutoUploadUI() {
  drawAutoUploadToggle();
}

if (autoUploadCanvas) {
  autoUploadCanvas.addEventListener('click', (e) => {
    const rect = autoUploadCanvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    // Check hit boundaries (inside the track)
    if (x > 5 && x < 45 && y > 2 && y < 22) {
      autoUploadActive = !autoUploadActive;
      localStorage.setItem('auto_upload_active', autoUploadActive);
      autoUploadTarget = autoUploadActive ? 1 : 0;

      if (!autoUploadAnimating) {
        autoUploadAnimating = true;
        animateAutoUploadToggle();
      }
    }
  });
}

updateAutoUploadUI();

if (saveBtn) {
  saveBtn.addEventListener('click', async () => {
    const code = getCode();
    if (!code.trim()) {
      addMessage('system', 'No code to save.');
      return;
    }

    // Get active session's title (sanitized) or 'sketch' as default filename
    let defaultName = 'sketch.ino';
    try {
      const activeId = localStorage.getItem('arduino-claw:chat-active-session-id');
      if (activeId) {
        const sessions = JSON.parse(localStorage.getItem('arduino-claw:chat-sessions')) || [];
        const session = sessions.find(s => s.id === activeId);
        if (session && session.title && session.title !== 'New Chat') {
          const sanitized = session.title.replace(/[^a-zA-Z0-9_\-]/g, '_').substring(0, 30);
          if (sanitized) {
            defaultName = `${sanitized}.ino`;
          }
        }
      }
    } catch (_) {}

    // Check if browser supports showSaveFilePicker
    if (typeof window.showSaveFilePicker === 'function') {
      try {
        const handle = await window.showSaveFilePicker({
          suggestedName: defaultName,
          types: [{
            description: 'Arduino Sketch',
            accept: {
              'text/plain': ['.ino']
            }
          }]
        });

        const writable = await handle.createWritable();
        await writable.write(code);
        await writable.close();

        // Also save globally to browser local storage
        localStorage.setItem('arduino-claw:saved-sketch', code);

        // Update the active session's code in memory too
        try {
          const activeId = localStorage.getItem('arduino-claw:chat-active-session-id');
          if (activeId) {
            const sessions = JSON.parse(localStorage.getItem('arduino-claw:chat-sessions')) || [];
            const session = sessions.find(s => s.id === activeId);
            if (session) {
              session.code = code;
              localStorage.setItem('arduino-claw:chat-sessions', JSON.stringify(sessions));
            }
          }
        } catch (_) {}

        addMessage('system', `Project saved successfully as <strong>${handle.name}</strong>`);
      } catch (err) {
        if (err.name === 'AbortError') {
          return; // User cancelled
        }
        fallbackDownload(code, defaultName);
      }
    } else {
      fallbackDownload(code, defaultName);
    }
  });

  function fallbackDownload(code, filename) {
    const blob = new Blob([code], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    // Save to local storage
    localStorage.setItem('arduino-claw:saved-sketch', code);
    try {
      const activeId = localStorage.getItem('arduino-claw:chat-active-session-id');
      if (activeId) {
        const sessions = JSON.parse(localStorage.getItem('arduino-claw:chat-sessions')) || [];
        const session = sessions.find(s => s.id === activeId);
        if (session) {
          session.code = code;
          localStorage.setItem('arduino-claw:chat-sessions', JSON.stringify(sessions));
        }
      }
    } catch (_) {}

    addMessage('system', `Downloaded sketch as <strong>${filename}</strong> and saved to storage.`);
  }
}

// ═══════════════════════════════════════
// Selection Reference Context
// ═══════════════════════════════════════
const selectionContextCard = document.getElementById('chat-selection-context');
const selectionPreview = document.getElementById('selection-preview');
const selectionClearBtn = document.getElementById('selection-clear-btn');

function showAskTooltip(selectedText) {
  const sel = window.getSelection();
  if (!sel.rangeCount) return;
  const range = sel.getRangeAt(0);
  const rect = range.getBoundingClientRect();

  let tooltip = document.getElementById('editor-ask-tooltip');
  if (!tooltip) {
    tooltip = document.createElement('button');
    tooltip.id = 'editor-ask-tooltip';
    tooltip.className = 'editor-ask-tooltip';
    tooltip.innerHTML = `
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right: 4px; vertical-align: middle;">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
      </svg>
      Ask Claw
    `;
    document.body.appendChild(tooltip);
  }

  // Clear existing event listeners
  const newTooltip = tooltip.cloneNode(true);
  tooltip.parentNode.replaceChild(newTooltip, tooltip);

  newTooltip.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();

    selectedCodeContext = selectedText;
    if (selectionPreview) selectionPreview.textContent = selectedText;
    if (selectionContextCard) selectionContextCard.classList.remove('hidden');

    chatInput.focus();
    hideAskTooltip();
  });

  newTooltip.style.display = 'flex';
  const tooltipWidth = newTooltip.offsetWidth || 85;
  const tooltipHeight = newTooltip.offsetHeight || 26;

  // Align to center-top of selection bounds
  const left = rect.left + window.scrollX + (rect.width / 2) - (tooltipWidth / 2);
  const top = rect.top + window.scrollY - tooltipHeight - 8;

  newTooltip.style.left = `${left}px`;
  newTooltip.style.top = `${top}px`;
}

function hideAskTooltip() {
  const tooltip = document.getElementById('editor-ask-tooltip');
  if (tooltip) {
    tooltip.style.display = 'none';
  }
}

// Dismiss tooltip on clicking away
document.addEventListener('click', (e) => {
  const tooltip = document.getElementById('editor-ask-tooltip');
  if (tooltip && !tooltip.contains(e.target)) {
    const sel = window.getSelection().toString().trim();
    if (!sel) {
      hideAskTooltip();
    }
  }
});

onSelectionChange((selection) => {
  const trimmed = (selection || '').trim();
  if (trimmed.length > 0) {
    showAskTooltip(trimmed);
  } else {
    hideAskTooltip();
  }
});

if (selectionClearBtn) {
  selectionClearBtn.addEventListener('click', () => {
    selectedCodeContext = '';
    if (selectionContextCard) selectionContextCard.classList.add('hidden');
  });
}

// ═══════════════════════════════════════
// Chat History Sidebar UI
// ═══════════════════════════════════════
const historyToggleBtn = document.getElementById('chat-history-toggle-btn');
const historySidebar = document.getElementById('chat-history-sidebar');
const resizerSidebarChat = document.getElementById('resizer-sidebar-chat');
const newSessionBtn = document.getElementById('new-session-btn');
const sessionListContainer = document.getElementById('session-list');

if (historyToggleBtn && historySidebar) {
  historyToggleBtn.addEventListener('click', () => {
    historySidebar.classList.toggle('collapsed');
    const isCollapsed = historySidebar.classList.contains('collapsed');
    if (resizerSidebarChat) {
      resizerSidebarChat.style.display = isCollapsed ? 'none' : 'block';
    }
  });
}

if (newSessionBtn) {
  newSessionBtn.addEventListener('click', () => {
    startNewSession();
    handleClearAllState();
  });
}

function renderSessionsUI(sessions, activeId) {
  if (!sessionListContainer) return;
  sessionListContainer.innerHTML = '';
  
  sessions.forEach(session => {
    const item = document.createElement('div');
    item.className = `session-item ${session.id === activeId ? 'active' : ''}`;
    item.dataset.id = session.id;
    item.title = 'Double-click to rename title';
    
    const titleText = document.createElement('span');
    titleText.className = 'session-title-text';
    titleText.textContent = session.title || 'New Chat';
    item.appendChild(titleText);
    
    // Action buttons wrapper
    const actionsWrapper = document.createElement('div');
    actionsWrapper.className = 'session-actions-wrapper';
    actionsWrapper.style.display = 'flex';
    actionsWrapper.style.alignItems = 'center';
    actionsWrapper.style.gap = '2px';

    const editBtn = document.createElement('button');
    editBtn.className = 'session-edit-btn';
    editBtn.title = 'Rename Chat';
    editBtn.innerHTML = `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>`;
    actionsWrapper.appendChild(editBtn);

    const delBtn = document.createElement('button');
    delBtn.className = 'session-delete-btn';
    delBtn.title = 'Delete Chat';
    delBtn.innerHTML = '×';
    delBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (confirm('Are you sure you want to delete this chat session?')) {
        deleteSession(session.id);
        handleClearAllState();
      }
    });
    actionsWrapper.appendChild(delBtn);
    item.appendChild(actionsWrapper);

    const startInlineRename = () => {
      if (item.querySelector('.session-title-edit-input')) return;
      const currentTitle = session.title || 'New Chat';
      const input = document.createElement('input');
      input.type = 'text';
      input.className = 'session-title-edit-input';
      input.value = currentTitle;
      input.spellcheck = false;

      titleText.style.display = 'none';
      actionsWrapper.style.display = 'none';
      item.appendChild(input);
      input.focus();
      input.select();

      let isFinished = false;
      const finishEditing = (save) => {
        if (isFinished) return;
        isFinished = true;
        const newTitle = input.value.trim();
        if (save && newTitle && newTitle !== currentTitle) {
          renameSession(session.id, newTitle);
        } else {
          input.remove();
          titleText.style.display = '';
          actionsWrapper.style.display = 'flex';
        }
      };

      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          finishEditing(true);
        } else if (e.key === 'Escape') {
          e.preventDefault();
          finishEditing(false);
        }
      });

      input.addEventListener('blur', () => {
        finishEditing(true);
      });

      input.addEventListener('click', (e) => {
        e.stopPropagation();
      });
    };

    editBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      startInlineRename();
    });

    titleText.addEventListener('dblclick', (e) => {
      e.stopPropagation();
      startInlineRename();
    });

    item.addEventListener('dblclick', (e) => {
      if (e.target === delBtn || e.target === editBtn || editBtn.contains(e.target)) return;
      e.stopPropagation();
      startInlineRename();
    });

    item.addEventListener('click', () => {
      if (item.querySelector('.session-title-edit-input')) return;
      if (session.id !== getActiveSessionId()) {
        loadSession(session.id);
        handleClearAllState();
      }
    });
    
    sessionListContainer.appendChild(item);
  });
}

// Double click tab filename to rename active session
const editorFilenameEl = document.getElementById('editor-filename');
if (editorFilenameEl) {
  editorFilenameEl.title = 'Double-click to rename title';
  editorFilenameEl.style.cursor = 'pointer';
  editorFilenameEl.addEventListener('dblclick', (e) => {
    e.stopPropagation();
    const activeId = getActiveSessionId();
    const sessions = getSessionsList();
    const curr = sessions.find(s => s.id === activeId);
    const oldTitle = curr ? curr.title : 'New Chat';
    const newTitle = prompt('Rename Chat / Sketch title:', oldTitle);
    if (newTitle && newTitle.trim() && newTitle.trim() !== oldTitle) {
      renameSession(activeId, newTitle.trim());
    }
  });
}

onSessionListUpdate((sessions, activeId) => {
  renderSessionsUI(sessions, activeId);
});

renderSessionsUI(getSessionsList(), getActiveSessionId());

// ═══════════════════════════════════════
// API Key Banner
// ═══════════════════════════════════════

function checkApiKeyBanner() {
  if (!hasApiKey()) {
    apiKeyBanner.classList.add('visible');
  } else {
    apiKeyBanner.classList.remove('visible');
  }
}

bannerSettingsBtn.addEventListener('click', () => {
  openSettings();
  settingsOverlay.classList.add('visible');
});

// Help Providers Guide Modal
const bannerHelpBtn = document.getElementById('banner-get-help-btn');
const helpModalOverlay = document.getElementById('help-modal-overlay');
const helpModalBox = document.getElementById('help-modal-box');
const helpModalClose = document.getElementById('help-modal-close');

if (bannerHelpBtn) {
  bannerHelpBtn.addEventListener('click', () => {
    helpModalOverlay.style.opacity = '1';
    helpModalOverlay.style.pointerEvents = 'auto';
    helpModalBox.style.transform = 'scale(1)';
    helpModalBox.style.opacity = '1';
  });
}

if (helpModalClose) {
  helpModalClose.addEventListener('click', () => {
    helpModalOverlay.style.opacity = '0';
    helpModalOverlay.style.pointerEvents = 'none';
    helpModalBox.style.transform = 'scale(0.95)';
    helpModalBox.style.opacity = '0';
    document.activeElement?.blur();
    chatInput?.focus();
  });
}

if (helpModalOverlay) {
  helpModalOverlay.addEventListener('click', (e) => {
    if (e.target === helpModalOverlay) {
      helpModalOverlay.style.opacity = '0';
      helpModalOverlay.style.pointerEvents = 'none';
      helpModalBox.style.transform = 'scale(0.95)';
      helpModalBox.style.opacity = '0';
      document.activeElement?.blur();
      chatInput?.focus();
    }
  });
}

// ═══════════════════════════════════════
// Settings
// ═══════════════════════════════════════

settingsBtn.addEventListener('click', () => {
  toggleSettings();
  settingsOverlay.classList.toggle('visible');
  if (!settingsOverlay.classList.contains('visible')) {
    document.activeElement?.blur();
    chatInput?.focus();
  }
});

settingsOverlay.addEventListener('click', () => {
  closeSettings();
  settingsOverlay.classList.remove('visible');
  checkApiKeyBanner();
  serialBaudDisplay.textContent = getBaud() + ' baud';
  updateProviderDisplay(getProvider());
  document.activeElement?.blur();
  chatInput?.focus();
});

// settings-close-btn click event delegation
document.addEventListener('click', (e) => {
  if (e.target && e.target.closest('#settings-close-btn')) {
    settingsOverlay.classList.remove('visible');
    checkApiKeyBanner();
    serialBaudDisplay.textContent = getBaud() + ' baud';
    updateProviderDisplay(getProvider());
    document.activeElement?.blur();
    chatInput?.focus();
  }
});

// ═══════════════════════════════════════
// Port Connection
// ═══════════════════════════════════════

async function autoDetectPorts() {
  try {
    const ports = await serial.listPorts();
    if (ports.length === 1) {
      portLabel.textContent = 'Port available';
    } else if (ports.length > 1) {
      portLabel.textContent = `${ports.length} ports found`;
    } else {
      portLabel.textContent = 'Click Connect';
    }
  } catch (_) {
    portLabel.textContent = 'Click Connect';
  }
}

function updateCliPortUI() {
  if (selectedCliPort && isConnected) {
    portDot.classList.add('connected');
    const boardName = selectedCliPort.board ? ` (${selectedCliPort.board})` : '';
    portLabel.textContent = `${selectedCliPort.port || 'Unknown Port'}${boardName}`;
    connectLabel.textContent = 'Disconnect';
    connectBtn.classList.add('connected');
  } else if (selectedCliPort) {
    portDot.classList.remove('connected');
    const boardName = selectedCliPort.board ? ` (${selectedCliPort.board})` : '';
    portLabel.textContent = `${selectedCliPort.port || 'Select Port'}${boardName}`;
    connectLabel.textContent = 'Connect';
    connectBtn.classList.remove('connected');
  } else {
    portDot.classList.remove('connected');
    portLabel.textContent = 'Click Connect';
    connectLabel.textContent = 'Connect';
    connectBtn.classList.remove('connected');
  }
}

/**
 * On startup: ping the bridge. If online, switch to CLI mode automatically
 * and keep upload button enabled without needing Web Serial connection.
 */
async function initBridgeStatus() {
  const badge = document.getElementById('bridge-status');
  
  try {
    const status = await bridge.checkBridgeStatus();
    if (status.ok) {
      // Bridge is live — auto-enable CLI mode
      setUploadMode('cli');
      if (badge) {
        badge.classList.remove('hidden', 'offline');
        badge.classList.add('online');
      }
      // Enable upload button even without Web Serial connection
      uploadBtn.disabled = false;
      uploadBtn.title = 'Upload via Arduino CLI Bridge';

      // 1. Fetch live hardware ports to verify what is ACTUALLY plugged in
      let livePorts = [];
      try {
        const portRes = await bridge.listPorts();
        livePorts = portRes.ports || [];
      } catch (_) {}

      // 2. Validate saved port in localStorage against live plugged-in ports
      const saved = localStorage.getItem('arduino-claw:selected-cli-port');
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          const isStillPlugged = livePorts.some(p => (p.port || '').toLowerCase() === (parsed.port || '').toLowerCase());
          if (isStillPlugged) {
            selectedCliPort = parsed;
          } else {
            selectedCliPort = null;
            localStorage.removeItem('arduino-claw:selected-cli-port');
          }
        } catch (_) {
          selectedCliPort = null;
        }
      }
      
      if (!selectedCliPort && livePorts.length === 1) {
        selectedCliPort = livePorts[0];
      }

      // Do NOT set isConnected = true on startup; only show port when plugged in
      updateCliPortUI();
    } else {
      // Bridge offline — stay in Web Serial mode
      if (getUploadMode() === 'cli') {
        if (badge) {
          badge.classList.remove('hidden', 'online');
          badge.classList.add('offline');
        }
        uploadBtn.disabled = !isConnected;
      }
    }
  } catch (_) {
    // Bridge unreachable — silent, Web Serial is the fallback
    if (getUploadMode() === 'cli') {
      setUploadMode('webserial');
      if (badge) badge.classList.add('hidden');
    }
  }
}

async function matchWebSerialToBridge() {
  const portRes = await bridge.listPorts();
  if (!portRes.ok || !portRes.ports || portRes.ports.length === 0) {
    return null;
  }
  
  // Filter bridge ports to keep only valid USB/Arduino serial ports
  const validPorts = portRes.ports.filter(p => {
    if (!p) return false;
    const addr = (p.port || '').toLowerCase();
    const board = (p.board || '').toLowerCase();
    
    // Ignore known virtual/Bluetooth/debug/GMS/OPPO ports
    if (addr.includes('bluetooth') || addr.includes('incoming') || addr.includes('debug') || addr.includes('gms') || addr.includes('oppo')) {
      return false;
    }
    
    if (p.fqbn) return true;
    if (addr.includes('usb') || addr.includes('acm') || addr.includes('com') || board.includes('usb')) {
      return true;
    }
    
    return false;
  });
  
  if (validPorts.length > 0) {
    return validPorts[0];
  }
  
  return null;
}

function promptWebSerialPortTrigger() {
  const chatContainer = document.getElementById('chat-messages');
  if (!chatContainer) return;

  const bubble = document.createElement('div');
  bubble.className = 'chat-bubble ai';
  
  bubble.innerHTML = `
    <div class="chat-content">
      <div class="chat-text">
        Upload port is not selected. Please specify your Arduino device:
        <div style="margin-top: 8px;">
          <button class="pin-choice-btn btn-trigger-web-serial" style="width: auto; padding: 6px 16px;">
            Select Port
          </button>
        </div>
      </div>
    </div>
  `;

  chatContainer.appendChild(bubble);
  chatContainer.scrollTop = chatContainer.scrollHeight;

  const scanBtn = bubble.querySelector('.btn-trigger-web-serial');
  scanBtn.addEventListener('click', async () => {
    scanBtn.disabled = true;
    scanBtn.textContent = 'Connecting...';
    
    try {
      // 1. Check detected physical ports from bridge/server
      let detectedPorts = [];
      try {
        const bridgeRes = await bridge.listPorts();
        if (bridgeRes && bridgeRes.ports && bridgeRes.ports.length > 0) {
          detectedPorts = bridgeRes.ports;
        }
      } catch (_) {}

      // 2. If at least 1 physical hardware port is detected, smoothly auto-connect immediately!
      if (detectedPorts.length > 0) {
        const p = detectedPorts[0];
        const portAddr = p.port || p.address;
        const boardName = p.board || p.label || 'Arduino Uno';

        // Direct Electron Web Serial matching
        if (window.electronAPI && typeof window.electronAPI.setTargetPort === 'function') {
          try {
            await window.electronAPI.setTargetPort(portAddr);
          } catch (_) {}
        }

        if (serial.isSerialSupported()) {
          try {
            await serial.requestPort();
          } catch (_) {}
        }

        selectedCliPort = {
          port: portAddr,
          address: portAddr,
          board: boardName,
          fqbn: p.fqbn || 'arduino:avr:uno'
        };
        localStorage.setItem('arduino-claw:selected-cli-port', JSON.stringify(selectedCliPort));
        setConnectedUI();
        updateCliPortUI();
        addMessage('system', `Connected to port: <strong>${escapeHtml(portAddr)}</strong> (${escapeHtml(boardName)})`);
        bubble.remove();
        handleUpload();
        return;
      }

      // 3. If 0 ports detected from bridge, fallback to prompt or modal
      bubble.remove();
      openPortModal();
    } catch (err) {
      addMessage('system', `Port detection error: ${err.message}`);
      bubble.remove();
      openPortModal();
    }
  });
}

// ═══════════════════════════════════════
// Port Selection Modal Controller
// ═══════════════════════════════════════

const portModalOverlay = document.getElementById('port-modal-overlay');
const portModalClose = document.getElementById('port-modal-close');
const portModalCancelBtn = document.getElementById('port-modal-cancel-btn');
const portModalConnectBtn = document.getElementById('port-modal-connect-btn');
const portModalRefreshBtn = document.getElementById('port-modal-refresh-btn');
const portModalRequestBtn = document.getElementById('port-modal-request-btn');
const portModalList = document.getElementById('port-modal-list');

let availableModalPorts = [];
// Keep the currently highlighted modal entry in module scope. Without this
// declaration, opening the modal throws a ReferenceError before port discovery
// can run, leaving the list stuck in its initial loading state.
let selectedModalPort = null;
function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

async function openPortModal() {
  if (!portModalOverlay) return;
  portModalOverlay.classList.remove('hidden');
  selectedModalPort = null;
  if (portModalConnectBtn) portModalConnectBtn.disabled = true;
  await scanAndRenderModalPorts();
}

function closePortModal() {
  if (!portModalOverlay) return;
  portModalOverlay.classList.add('hidden');
}

if (portModalClose) portModalClose.addEventListener('click', closePortModal);
if (portModalCancelBtn) portModalCancelBtn.addEventListener('click', closePortModal);

if (portModalOverlay) {
  portModalOverlay.addEventListener('click', (e) => {
    if (e.target === portModalOverlay) closePortModal();
  });
}

if (portModalRefreshBtn) {
  portModalRefreshBtn.addEventListener('click', async () => {
    await scanAndRenderModalPorts();
  });
}

if (portModalRequestBtn) {
  portModalRequestBtn.addEventListener('click', async () => {
    try {
      const granted = await serial.requestPort();
      if (granted) {
        closePortModal();
        setConnectedUI();
        addMessage('system', 'Connected to Arduino (USB Serial)');
      } else {
        alert('No USB Arduino board detected. Please plug in your Arduino board via USB and try again.');
      }
    } catch (err) {
      console.warn('User cancelled port request:', err);
    }
  });
}

async function scanAndRenderModalPorts() {
  if (!portModalList) return;
  portModalList.innerHTML = `
    <div class="port-modal-loading">
      <div class="port-modal-spinner"></div>
      <span>Scanning for serial ports...</span>
    </div>
  `;

  availableModalPorts = [];
  const seenAddresses = new Set();

  // 1. Get CLI Bridge detected ports (Electron IPC first, then HTTP fallback)
  try {
    let bridgePorts = [];
    if (window.electronAPI && typeof window.electronAPI.listPorts === 'function') {
      try {
        const ipcPorts = await window.electronAPI.listPorts();
        if (Array.isArray(ipcPorts) && ipcPorts.length > 0) {
          bridgePorts = ipcPorts;
        }
      } catch (ipcErr) {
        console.warn('IPC listPorts failed:', ipcErr);
      }
    }

    if (bridgePorts.length === 0) {
      const bridgeRes = await bridge.listPorts();
      if (bridgeRes && Array.isArray(bridgeRes.ports)) {
        bridgePorts = bridgeRes.ports;
      }
    }

    bridgePorts.forEach((bp, idx) => {
      const portAddr = bp.port || bp.address;
      if (!portAddr) return;
      const normalized = portAddr.trim().toLowerCase();
      if (seenAddresses.has(normalized)) return;
      seenAddresses.add(normalized);

      const boardName = bp.board || bp.label || bp.name || 'Arduino Uno';
      availableModalPorts.push({
        type: 'bridge',
        portObj: bp,
        name: boardName,
        sub: portAddr,
        badge: 'USB Serial',
        id: `bridge_${idx}`
      });
    });
  } catch (err) {
    console.warn('Bridge port scan error:', err);
  }

  // 2. Get Web Serial granted ports
  if (serial.isSerialSupported()) {
    try {
      const webPorts = await serial.listPorts();
      webPorts.forEach((wp, idx) => {
        const info = wp.getInfo ? wp.getInfo() : {};
        const vid = info.usbVendorId ? `0x${info.usbVendorId.toString(16).padStart(4, '0')}` : '';
        const pid = info.usbProductId ? `0x${info.usbProductId.toString(16).padStart(4, '0')}` : '';
        const subStr = `USB VID:PID ${vid}:${pid}`;
        const already = availableModalPorts.some(p => p.sub && p.sub.toLowerCase().includes(subStr.toLowerCase()));
        if (!already) {
          availableModalPorts.push({
            type: 'webserial',
            portObj: wp,
            name: 'Arduino Uno / USB Serial Device',
            sub: subStr,
            badge: 'Hardware Port',
            id: `webserial_${idx}`
          });
        }
      });
    } catch (_) {}
  }

  // 3. Render ports list
  portModalList.innerHTML = '';

  if (availableModalPorts.length === 0) {
    selectedModalPort = null;
    portModalList.innerHTML = `
      <div class="port-modal-empty">
        <p style="margin: 0 0 6px 0; font-weight: 600; color: var(--text-primary);">No serial ports detected</p>
        <p style="margin: 0; font-size: 11.5px;">Plug in your Arduino board via USB and click <strong>Refresh</strong>, or use <strong>Grant Access</strong> below.</p>
      </div>
    `;
    if (portModalConnectBtn) portModalConnectBtn.disabled = true;
    return;
  }

  // Auto-select first detected port by default!
  selectedModalPort = availableModalPorts[0];
  if (portModalConnectBtn) portModalConnectBtn.disabled = false;

  availableModalPorts.forEach((p, index) => {
    const item = document.createElement('div');
    item.className = `port-modal-item ${index === 0 ? 'selected' : ''}`;

    item.innerHTML = `
      <div class="port-item-left">
        <div class="port-item-radio">
          <div class="port-item-radio-dot"></div>
        </div>
        <div class="port-item-details">
          <span class="port-item-name">${escapeHtml(p.name)}</span>
          <span class="port-item-sub">${escapeHtml(p.sub)}</span>
        </div>
      </div>
      <span class="port-item-badge">${escapeHtml(p.badge)}</span>
    `;

    item.addEventListener('click', () => {
      document.querySelectorAll('.port-modal-item').forEach(el => el.classList.remove('selected'));
      item.classList.add('selected');
      selectedModalPort = p;
      if (portModalConnectBtn) portModalConnectBtn.disabled = false;
    });

    item.addEventListener('dblclick', async () => {
      selectedModalPort = p;
      await connectSelectedModalPort();
    });

    portModalList.appendChild(item);
  });
}

async function connectSelectedModalPort() {
  // 1. If user didn't explicitly select an item, auto-select the first available port
  if (!selectedModalPort && availableModalPorts.length > 0) {
    selectedModalPort = availableModalPorts[0];
  }

  // 2. If still no port selected, return safely (do not connect without selection)
  if (!selectedModalPort) {
    return;
  }

  const targetPort = selectedModalPort;
  closePortModal();

  const portAddr = targetPort.sub || (targetPort.portObj && (targetPort.portObj.port || targetPort.portObj.address)) || 'Serial Device';
  const boardName = targetPort.name || (targetPort.portObj && targetPort.portObj.board) || 'Arduino Uno';

  // 1. Tell Electron main process which port we are targeting
  if (window.electronAPI && typeof window.electronAPI.setTargetPort === 'function') {
    try {
      await window.electronAPI.setTargetPort(portAddr);
    } catch (_) {}
  }

  // 2. Connect Web Serial for live Serial Monitor & direct flashing
  if (serial.isSerialSupported()) {
    try {
      if (targetPort.type === 'webserial' && targetPort.portObj) {
        serial.setPort(targetPort.portObj);
      } else {
        await serial.requestPort();
      }
    } catch (e) {
      console.warn('Web Serial auto-grant notice:', e);
    }
  }

  // 3. Set CLI Port for native compilation & upload
  selectedCliPort = {
    port: portAddr,
    address: portAddr,
    board: boardName,
    fqbn: (targetPort.portObj && targetPort.portObj.fqbn) || 'arduino:avr:uno'
  };
  localStorage.setItem('arduino-claw:selected-cli-port', JSON.stringify(selectedCliPort));

  setConnectedUI();
  updateCliPortUI();
  addMessage('system', `Connected to port: <strong>${escapeHtml(portAddr)}</strong> (${escapeHtml(boardName)})`);
}

if (portModalConnectBtn) {
  portModalConnectBtn.addEventListener('click', async () => {
    await connectSelectedModalPort();
  });
}

connectBtn.addEventListener('click', async () => {
  if (isFlashing) return;

  // If already connected, disconnect
  if (isConnected || selectedCliPort) {
    await serial.disconnect();
    selectedCliPort = null;
    localStorage.removeItem('arduino-claw:selected-cli-port');
    setDisconnectedUI();
    return;
  }

  // Open the dedicated Port Selection Modal
  openPortModal();
});

function setConnectedUI() {
  isConnected = true;
  portDot.classList.add('connected');
  portLabel.textContent = 'Connected';
  connectLabel.textContent = 'Disconnect';
  connectBtn.classList.add('connected');
  uploadBtn.disabled = false;
}

function setDisconnectedUI() {
  isConnected = false;
  portDot.classList.remove('connected');
  portLabel.textContent = 'Click Connect';
  connectLabel.textContent = 'Connect';
  connectBtn.classList.remove('connected');
  // In CLI mode, keep upload button enabled — the bridge handles port detection
  if (getUploadMode() !== 'cli') {
    uploadBtn.disabled = true;
  }
}

// ═══════════════════════════════════════
// Chat Input
// ═══════════════════════════════════════

// Auto-resize textarea
chatInput.addEventListener('input', () => {
  chatInput.style.height = 'auto';
  chatInput.style.height = Math.min(chatInput.scrollHeight, 120) + 'px';
});

// Enter to send (Shift+Enter for newline)
chatInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    if (isGenerating || isFlashing) {
      return; // Ignore send/accidental stops while typing
    }
    handleSend();
  }
});

const SEND_ICON_HTML = `
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
    <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
  </svg>
`;

const STOP_ICON_HTML = `
  <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
    <rect x="5" y="5" width="14" height="14" rx="2.5" fill="#ea4335" />
  </svg>
`;

function updateSendButtonState() {
  const busy = isGenerating || isFlashing;
  chatInput.disabled = false;
  if (busy) {
    sendBtn.innerHTML = STOP_ICON_HTML;
    sendBtn.title = 'Stop generation';
    sendBtn.classList.add('btn-stop-active');
  } else {
    sendBtn.innerHTML = SEND_ICON_HTML;
    sendBtn.title = 'Generate code (Enter)';
    sendBtn.classList.remove('btn-stop-active');
  }
}

function calculateDynamicCaptureWindow(code) {
  const setting = getSerialCaptureLimit ? getSerialCaptureLimit() : 'auto';
  
  // Scan code for highest delay() or interval in ms
  let maxCodeDelayMs = 0;
  if (code) {
    const delayMatches = code.matchAll(/delay\s*\(\s*([0-9]+)\s*\)/g);
    for (const m of delayMatches) {
      const ms = parseInt(m[1]);
      if (ms > maxCodeDelayMs && ms < 60000) {
        maxCodeDelayMs = ms;
      }
    }
  }

  const codeRequiredSec = maxCodeDelayMs > 0 ? Math.ceil(maxCodeDelayMs / 1000) + 1 : 5;

  if (setting === 'auto') {
    return Math.max(5, Math.min(30, codeRequiredSec));
  }

  if (setting.endsWith('s')) {
    const userSec = parseInt(setting) || 5;
    return Math.max(userSec, codeRequiredSec);
  }

  return Math.max(5, codeRequiredSec);
}

function handleStopGeneration() {
  if (currentAbortController) {
    currentAbortController.abort();
    currentAbortController = null;
  }
  isGenerating = false;
  
  if (isFlashing) {
    isFlashing = false;
    showFlashProgress(false);
    hideProcessStep();
    uploadBtn.disabled = false;
    addMessage('system', 'Upload process aborted by user.');
  }

  updateSendButtonState();
}

sendBtn.addEventListener('click', () => {
  if (isGenerating || isFlashing) {
    handleStopGeneration();
  } else {
    handleSend();
  }
});

function detectMissingPinComponents(command) {
  if (!command) return [];
  const lower = command.toLowerCase();

  // Skip if user already specified "let ai decide" or if it's a retry/fix
  if (
    lower.includes('let ai decide') ||
    lower.includes('ai-decide') ||
    lower.includes('ai decide') ||
    lower.includes('decide pins') ||
    lower.includes('use verified') ||
    lower.includes('fix code') ||
    lower.includes('retry') ||
    lower.includes('pin assignment') ||
    lower.includes('specify pins')
  ) {
    return [];
  }

  // Skip for pure questions/explanations
  if (
    lower.startsWith('explain') ||
    lower.startsWith('what is') ||
    lower.startsWith('how to') ||
    lower.startsWith('why ')
  ) {
    return [];
  }

  // Check if command already contains explicit pin definitions (e.g. "pin 9", "pin 3", "d9", "a0", "pin 13")
  const hasExplicitPin = /\b(pin\s*\d+|d\d+|a[0-5]|\d+\s*pin)\b/i.test(lower);
  if (hasExplicitPin) {
    return [];
  }

  // Hardware component dictionary
  const componentPatterns = [
    { name: 'Servo Motor', regex: /\b(servo|sg90|mg996r|mg90s)\b/i },
    { name: 'Ultrasonic Sensor', regex: /\b(ultrasonic|hc-sr04|hcsr04|distance sensor)\b/i },
    { name: 'PIR Motion Sensor', regex: /\b(pir|motion sensor)\b/i },
    { name: 'IR Sensor', regex: /\b(ir sensor|infrared sensor|obstacle sensor)\b/i },
    { name: 'DHT Sensor', regex: /\b(dht11|dht22|dht sensor|temperature and humidity)\b/i },
    { name: 'Push Button', regex: /\b(button|push button|pushbutton|switch)\b/i },
    { name: 'Potentiometer', regex: /\b(potentiometer|pot)\b/i },
    { name: 'Relay Module', regex: /\b(relay|relay module)\b/i },
    { name: 'Buzzer', regex: /\b(buzzer|piezo)\b/i },
    { name: 'External LED', regex: /\b(rgb led|red led|green led|blue led|external led|traffic light)\b/i },
    { name: 'LDR Sensor', regex: /\b(ldr|photoresistor|light sensor)\b/i },
    { name: 'Joystick', regex: /\b(joystick)\b/i },
    { name: 'Stepper Motor', regex: /\b(stepper|stepper motor|uln2003)\b/i }
  ];

  const detected = [];
  for (const comp of componentPatterns) {
    if (comp.regex.test(lower)) {
      detected.push(comp.name);
    }
  }

  return detected;
}

async function handleSend() {
  const command = chatInput.value.trim();
  if (!command) return;
  if (isGenerating) {
    handleStopGeneration();
    return;
  }

  // Check API key
  if (!hasApiKey()) {
    addMessage('system', 'No API key set — open Settings to configure your AI provider.');
    openSettings();
    settingsOverlay.classList.add('visible');
    return;
  }

  // Clear input
  chatInput.value = '';
  chatInput.style.height = 'auto';

  // Check for retry / auto-fix trigger keywords
  const trimmedLower = command.trim().toLowerCase();
  if (trimmedLower === 'retry' || trimmedLower === 'fix' || trimmedLower === 'fix it' || trimmedLower === 'fix error' || trimmedLower === 'auto fix' || trimmedLower === 'retry with ai') {
    addMessage('user', command);
    handleRetry();
    return;
  }

  lastCommand = command;

  // Clear previous attempt history for new command
  clearHistory();
  hideFeedbackBar();

  // Prepend selected code context if active
  let finalCommand = command;
  let reference = '';
  if (selectedCodeContext) {
    finalCommand = `Regarding this code block:\n\`\`\`cpp\n${selectedCodeContext}\n\`\`\`\n\n${command}`;
    reference = selectedCodeContext;
    // Clear reference state
    selectedCodeContext = '';
    if (selectionContextCard) selectionContextCard.classList.add('hidden');
  }

  // Show user message
  addMessage('user', command, reference);

  // Check if hardware components need pin configuration
  const missingPins = detectMissingPinComponents(finalCommand);
  if (missingPins.length > 0) {
    renderPinOptions(missingPins, (choiceText) => {
      let newCommand = finalCommand;
      if (choiceText === 'ai-decide') {
        newCommand += ' (Let AI decide pins)';
      } else {
        newCommand += ` (Use the following pin assignments: ${choiceText})`;
      }
      addMessage('user', choiceText === 'ai-decide' ? '🤖 Let AI Decide Pins' : `⌨️ Specify Pins: ${choiceText}`);
      generateAndShowCode(newCommand);
    });
    return;
  }

  await generateAndShowCode(finalCommand);
}

async function generateAndShowCode(command) {
  setGenerating(true);
  currentAbortController = new AbortController();
  const targetSessionId = getActiveSessionId();

  const thinkingId = renderThinking();

  try {
    const provider = getProvider();
    const apiKey = getApiKey(provider);
    const history = getHistory();
    const llamaUrl = provider === 'llama' ? getLlamaUrl() : '';
    const llamaModel = provider === 'llama' ? getLlamaModel() : '';
    const currentCode = getCode();

    // ── Autonomous I2C Discovery Agent ──
    let i2cHardwarePrompt = '';
    if (isI2CPotentialProject(command, currentCode) && (isConnected || serial.hasPort())) {
      showProcessStep('🔍 I2C device detected. Running I2C Discovery Probe…');
      addMessage('system', '🔍 **I2C Agent**: Probing I2C bus on board to discover hardware address…', '', targetSessionId);

      try {
        let scanData = null;
        if (window.electronAPI && typeof window.electronAPI.compile === 'function') {
          try {
            scanData = await window.electronAPI.compile({ code: I2C_SCANNER_SKETCH, board: 'uno' });
          } catch (_) {}
        }
        if (!scanData) {
          const scanComp = await fetch('http://127.0.0.1:5000/compile', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ code: I2C_SCANNER_SKETCH, board: 'uno' })
          });
          scanData = await scanComp.json();
        }
        if (scanData.success && scanData.hex) {
          showFlashProgress(true);
          setFlashProgress(40, 'Probing I2C bus…');
          await flashHex(scanData.hex, serial);
          showFlashProgress(false);

          // Capture scan output for 2.5s
          const scanOutput = await startSerialCapture(2.5);
          const discoveredAddr = parseDiscoveredI2CAddress(scanOutput);

          if (discoveredAddr) {
            addMessage('system', `✅ **I2C Discovered**: Found device at address <code>${discoveredAddr}</code>! Using this address in your sketch…`, '', targetSessionId);
            i2cHardwarePrompt = `\n[VERIFIED_HARDWARE_ADDRESS]\nThe physical I2C bus scanner discovered device at address: ${discoveredAddr}. You MUST use ${discoveredAddr} in the code (e.g. for LiquidCrystal_I2C or sensors).\n`;
          } else {
            addMessage('system', 'ℹ️ No responsive I2C address found during probe. Proceeding with standard defaults.', '', targetSessionId);
          }
        }
      } catch (err) {
        console.warn('I2C probe warning:', err);
      } finally {
        hideProcessStep();
      }
    }

    const activeBoard = getSelectedBoard();
    const finalPrompt = command + i2cHardwarePrompt;
    const result = await generateCode(finalPrompt, history, provider, apiKey, llamaUrl, llamaModel, currentCode, currentAbortController.signal, activeBoard);

    removeThinking(thinkingId);
    currentAbortController = null;

    const isCurrentSession = getActiveSessionId() === targetSessionId;

    // Check for AI ERROR response
    if (result.code && result.code.startsWith('ERROR:')) {
      setGenerating(false);
      addMessage('ai', result.code, '', targetSessionId);
      return;
    }

    // If AI returned new/modified code, route it cleanly
    if (result.code) {
      lastGeneratedCode = result.code;
      if (isCurrentSession) {
        switchTab('main');
        setMainCode(result.code);
        if (isConnected) {
          uploadBtn.disabled = false;
        }
      } else {
        // User switched to another session while generating: save to target session in localStorage
        const sessions = getSessionsList();
        const targetSession = sessions.find(s => s.id === targetSessionId);
        if (targetSession) {
          targetSession.code = result.code;
          localStorage.setItem('arduino-claw:chat-sessions', JSON.stringify(sessions));
        }
      }
    }

    // Always display / save the AI's explanation/chat text for the session that prompted it
    addMessage('ai', result.explanation, '', targetSessionId);

    // Auto-upload trigger (only if user is still on the active session)
    if (result.code && autoUploadActive && isCurrentSession) {
      if (isConnected || serial.hasPort()) {
        const autoBadge = document.getElementById('chat-process-auto-badge');
        if (autoBadge) autoBadge.style.display = 'inline';
        await handleUpload().finally(() => {
          if (autoBadge) autoBadge.style.display = 'none';
          setGenerating(false);
        });
      } else {
        setGenerating(false);
        promptWebSerialPortTrigger();
      }
    } else {
      setGenerating(false);
    }

  } catch (err) {
    removeThinking(thinkingId);
    setGenerating(false);
    currentAbortController = null;

    if (err.name === 'AbortError') {
      addMessage('system', 'AI generation stopped by user.');
      return;
    }

    if (err.message === 'NO_API_KEY') {
      addMessage('system', 'No API key set — open Settings.');
    } else if (err.message.includes('MISSING_PINS:')) {
      try {
        const rawList = err.message.split('MISSING_PINS:')[1].trim();
        const components = rawList
          .replace(/[\[\]]/g, '')
          .split(',')
          .map(c => c.trim())
          .filter(c => c.length > 0);

        renderPinOptions(components, (choiceText) => {
          let newCommand = command;
          if (choiceText === 'ai-decide') {
            newCommand += ' (Let AI decide pins)';
          } else {
            newCommand += ` (Use the following pin assignments: ${choiceText})`;
          }
          
          addMessage('user', choiceText === 'ai-decide' ? '🤖 Let AI Decide Pins' : `⌨️ Specify Pins: ${choiceText}`);
          generateAndShowCode(newCommand);
        });
      } catch (parseErr) {
        addMessage('ai', `Error parsing components: ${err.message}`);
      }
    } else if (err.message.startsWith('ERROR:')) {
      addMessage('ai', err.message);
    } else {
      addMessage('ai', `AI error: ${err.message}. Check your API key in Settings.`);
    }
  }
}

// ═══════════════════════════════════════
// Upload (Flash)
// ═══════════════════════════════════════

function generateSerialConfirmation(serialSnapshot, code) {
  const activeBoard = getSelectedBoard();
  const boardName = activeBoard ? activeBoard.name : 'Target Board';

  if (!serialSnapshot || serialSnapshot.trim() === '') {
    return `✓ **Confirmed**: Sketch running on ${boardName}.`;
  }

  // Filter lines: remove I2C scan markers, empty lines, and ANSI/escape garbage
  const rawLines = serialSnapshot
    .split('\n')
    .map(l => l.trim())
    .filter(l => l && !l.startsWith('---I2C_') && !l.includes('I2C_NONE_FOUND') && !l.includes('I2C_SCAN'));

  if (rawLines.length === 0) {
    return `✓ **Confirmed**: Sketch running on ${boardName}.`;
  }

  // Look for the most informative meaningful message
  const informativeLines = rawLines.filter(l => /[a-zA-Z]/.test(l));
  const chosenLine = informativeLines.length > 0 ? informativeLines[informativeLines.length - 1] : rawLines[rawLines.length - 1];

  const truncated = chosenLine.length > 65 ? chosenLine.substring(0, 62) + '...' : chosenLine;

  return `✓ **Confirmed**: Verified serial telemetry on ${boardName} — \`${truncated}\``;
}

uploadBtn.addEventListener('click', handleUpload);

async function handleUpload() {
  if (isFlashing) return;

  const code = getCode();
  if (!code.trim()) {
    addMessage('system', 'No code to upload. Generate code first.');
    return;
  }

  // If not connected yet, ask user to select port
  if (!isConnected && !serial.hasPort()) {
    promptWebSerialPortTrigger();
    return;
  }

  setFlashing(true);
  uploadBtn.disabled = true;
  showFlashProgress(true);
  setFlashProgress(15, 'Compiling sketch on backend…');
  showProcessStep('⚙️ Compiling sketch on backend...');

  // Store attempt before compilation so error context is preserved
  addAttempt({
    command: lastCommand || 'Manual code',
    code: code,
    serialOutput: '',
    compileError: null
  });

  try {
    const activeBoard = getSelectedBoard();
    const isAvrBoard = (activeBoard.fqbn || '').startsWith('arduino:avr');

    // ── MULTI-PLATFORM PATH: Non-AVR Boards (ESP32, ESP8266, RP2040, SAMD) ──
    if (!isAvrBoard) {
      showProcessStep(`⚡ Uploading sketch to ${activeBoard.name} via compiler bridge…`);
      setFlashProgress(25, `Preparing ${activeBoard.name}…`);

      // 1. Temporarily release Web Serial port in browser so CLI can flash
      if (serial.isOpen()) {
        await serial.disconnect();
      }

      // 2. Resolve system port
      let targetPort = selectedCliPort?.port;
      if (!targetPort) {
        try {
          const portsData = await bridge.listPorts();
          if (portsData.ports && portsData.ports.length > 0) {
            targetPort = portsData.ports[0].port || portsData.ports[0].address;
          }
        } catch (e) {}
      }

      if (!targetPort) {
        showFlashProgress(false);
        setFlashing(false);
        uploadBtn.disabled = false;
        hideProcessStep();
        addMessage('system', `⚠️ Could not detect system USB serial port for ${activeBoard.name}. Please ensure your board is connected to USB.`);
        return;
      }

      setFlashProgress(50, `Compiling & flashing ${activeBoard.name}…`);

      let uploadData = null;
      if (window.electronAPI && typeof window.electronAPI.upload === 'function') {
        try {
          uploadData = await window.electronAPI.upload({ code, port: targetPort, fqbn: activeBoard.fqbn });
        } catch (_) {}
      }
      if (!uploadData) {
        const uploadRes = await fetch('http://127.0.0.1:5000/upload', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code, port: targetPort, fqbn: activeBoard.fqbn })
        });
        uploadData = await uploadRes.json();
      }

      if (!uploadData || !uploadData.success) {
        showFlashProgress(false);
        setFlashing(false);
        uploadBtn.disabled = false;
        hideProcessStep();
        const errMsg = uploadData?.raw_stderr || (uploadData?.details && uploadData.details.join('\n')) || uploadData?.error || uploadData?.message || 'Upload failed';
        setCompileError(errMsg);
        renderCompileErrorCard(errMsg, handleRetry);
        showFeedbackBar();
        return;
      }

      setFlashProgress(100, 'Upload complete!');
      await sleep(300);
      showFlashProgress(false);

      addMessage('ai', `Done Uploading ✅ - Code successfully compiled and uploaded to your ${activeBoard.name}.`);
      showFeedbackBar();

      // Reconnect Web Serial for serial monitor
      try {
        await serial.openForMonitor(activeBoard.fqbn.includes('esp') ? 115200 : 9600);
      } catch (e) {}

      showProcessStep(`📡 Verifying live Serial telemetry from ${activeBoard.name}…`);
      const serialSnapshot = await startSerialCapture();
      hideProcessStep();

      const confirmMsg = generateSerialConfirmation(serialSnapshot, code);
      if (confirmMsg) {
        addMessage('ai', confirmMsg);
      }
      return;
    }

    // ── AVR DIRECT WEB SERIAL PATH (Uno, Nano, Mega, etc.) ──
    let compileData = null;
    if (window.electronAPI && typeof window.electronAPI.compile === 'function') {
      try {
        compileData = await window.electronAPI.compile({ code, board: activeBoard.fqbn || activeBoard.id || 'arduino:avr:uno' });
      } catch (_) {}
    }
    if (!compileData) {
      const compileRes = await fetch('http://127.0.0.1:5000/compile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, board: activeBoard.fqbn || activeBoard.id || 'arduino:avr:uno' })
      });
      compileData = await compileRes.json();
    }

    if (!compileData || !compileData.success || !compileData.hex) {
      showFlashProgress(false);
      setFlashing(false);
      uploadBtn.disabled = false;
      hideProcessStep();
      const errMsg = compileData?.raw_stderr || (compileData?.details && compileData.details.join('\n')) || compileData?.error || compileData?.message || 'Compilation failed';
      setCompileError(errMsg);
      renderCompileErrorCard(errMsg, handleRetry);
      showFeedbackBar();
      return;
    }

    // Step 2: Flash binary directly via Web Serial
    showProcessStep(`⚡ Flashing compiled binary to ${activeBoard.name}…`);
    setFlashProgress(40, `Flashing ${activeBoard.name}…`);

    await flashHex(compileData.hex, serial, (percent, msg) => {
      setFlashProgress(percent, msg);
    });

    setFlashProgress(100, 'Flash complete!');
    await sleep(300);
    showFlashProgress(false);

    addMessage('ai', `Done Uploading ✅ - Code successfully compiled and uploaded to your ${activeBoard.name}.`);
    showFeedbackBar();

    showProcessStep(`📡 Verifying live Serial telemetry from ${activeBoard.name}…`);

    // Step 3: Open serial monitor for live infinite streaming & capture AI verification
    const serialSnapshot = await startSerialCapture();
    hideProcessStep();

    // Step 4: Autonomous I2C Self-Healing check
    if (hasI2CCommunicationFailure(serialSnapshot, code) && (isConnected || serial.hasPort())) {
      addMessage('ai', '⚠️ **I2C Communication Alert**: Serial monitor reported a device connection issue. Launching autonomous I2C discovery probe…');
      
      try {
        openTab('i2c-scanner', '🔍 I2C Scanner.ino', I2C_SCANNER_SKETCH, true);

        let scanData = null;
        if (window.electronAPI && typeof window.electronAPI.compile === 'function') {
          try {
            scanData = await window.electronAPI.compile({ code: I2C_SCANNER_SKETCH, board: 'uno' });
          } catch (_) {}
        }
        if (!scanData) {
          const scanRes = await fetch('http://127.0.0.1:5000/compile', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ code: I2C_SCANNER_SKETCH, board: 'uno' })
          });
          scanData = await scanRes.json();
        }

        if (scanData && scanData.success && scanData.hex) {
          await flashHex(scanData.hex, serial);
          const scanOut = await startSerialCapture(2.5);
          const recoveredAddr = parseDiscoveredI2CAddress(scanOut);
          if (recoveredAddr) {
            addMessage('ai', `🔄 **Self-Healing**: Discovered active I2C device at <code>${recoveredAddr}</code>! Updating main sketch with verified address and flashing…`);
            switchTab('main');
            await generateAndShowCode(`${lastCommand || 'Run sketch'} (Hardware I2C address verified at ${recoveredAddr})`);
            return;
          } else {
            switchTab('main');
            addMessage('system', '⚠️ **No I2C Device Responded**: The I2C bus scanner found no devices.\n\n**Wiring Checklist**:\n• **VCC** → 5V\n• **GND** → GND\n• **SDA** → Pin A4\n• **SCL** → Pin A5\n\nOnce connected, click **Upload** to run your sketch.');
          }
        } else {
          switchTab('main');
        }
      } catch (_) {
        switchTab('main');
      }
    } else {
      // Step 5: Post formal & minimal confirmation based on verified serial output
      const confirmMsg = generateSerialConfirmation(serialSnapshot, code);
      if (confirmMsg) {
        addMessage('ai', confirmMsg);
      }
    }

  } catch (err) {
    showFlashProgress(false);
    hideProcessStep();
    if (err.message && err.message.includes('Failed to fetch')) {
      addMessage('system', '⚠️ **Compiler Server Starting or Unreachable**: Could not connect to the local compilation server on `http://127.0.0.1:5000`.\n\nPlease ensure the app has permissions to bind local port 5000, or retry in a few seconds.');
    } else {
      addMessage('system', `Upload failed: ${err.message}`);
    }
  } finally {
    setFlashing(false);
    uploadBtn.disabled = false;
  }
}

/**
 * Flash a HEX string directly (for when we have pre-compiled HEX).
 * This is the full upload pipeline.
 */
async function flashHexToBoard(hexString) {
  if (isFlashing) return;
  setFlashing(true);

  showFlashProgress(true);
  uploadBtn.disabled = true;
  connectBtn.disabled = true;

  try {
    addMessage('ai', 'Uploading to Arduino…');

    await flashHex(hexString, serial, (percent, msg) => {
      setFlashProgress(percent, msg);
    });

    addMessage('ai', 'Uploaded! Reading Serial Monitor…');
    setFlashProgress(100, 'Flash complete!');

    // Brief delay then start serial monitor
    await sleep(500);
    showFlashProgress(false);

    await startSerialCapture();

  } catch (err) {
    addMessage('ai', `Flash failed: ${err.message}`);
    showFlashProgress(false);
  } finally {
    setFlashing(false);
    uploadBtn.disabled = !isConnected;
    connectBtn.disabled = false;
  }
}

// ═══════════════════════════════════════
// Flash Progress
// ═══════════════════════════════════════

function showFlashProgress(visible) {
  flashProgress.classList.toggle('visible', visible);
}

function setFlashProgress(percent, text) {
  flashProgressFill.style.width = percent + '%';
  flashProgressPct.textContent = Math.round(percent) + '%';
  if (text) flashProgressText.textContent = text;
}

// ═══════════════════════════════════════
// Serial Monitor
// ═══════════════════════════════════════

serialHeader.addEventListener('click', () => {
  serialMonitor.classList.toggle('collapsed');
});

serialClearBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  serialOutput.textContent = '';
});

serialBaudDisplay.textContent = getBaud() + ' baud';

async function reconnectLiveWebSerial() {
  if (!serial.hasPort()) return;
  try {
    showProcessStep('🔌 Reconnecting live Serial Monitor...');
    try {
      await serial.closePort();
    } catch (_) {}
    await serial.openForMonitor(getBaud());
    
    const serialMonitor = document.getElementById('serial-monitor');
    if (serialMonitor) serialMonitor.classList.remove('collapsed');
    
    const serialOutput = document.getElementById('serial-output');
    if (serialOutput) {
      serialOutput.textContent = '';
    }
    
    setMobileActiveTab('serial');
    
    serial.startMonitor((text) => {
      if (serialOutput) {
        serialOutput.textContent += text;
        serialOutput.scrollTop = serialOutput.scrollHeight;
      }
    });
    hideProcessStep();
  } catch (err) {
    console.warn('Failed to reconnect Web Serial monitor:', err);
    hideProcessStep();
  }
}

async function startSerialCapture(customDurationSec = null, customMaxLines = null) {
  serialCaptureBuffer = '';

  // If we have an open port, start monitoring
  if (!serial.isOpen()) {
    try {
      await serial.openForMonitor(getBaud());
    } catch (err) {
      addMessage('system', `Could not open serial monitor: ${err.message}`);
      return '';
    }
  }

  // Uncollapse serial monitor
  serialMonitor.classList.remove('collapsed');
  setMobileActiveTab('serial');

  let captureActive = true;
  let capturedLinesCount = 0;
  const targetMaxLines = customMaxLines || getMaxSerialLines();

  // Continuous infinite monitor (never paused!)
  serial.startMonitor((text) => {
    // 1. Live stream to UI indefinitely
    serialOutput.textContent += text;
    if (serialOutput.textContent.length > 50000) {
      serialOutput.textContent = serialOutput.textContent.slice(-30000);
    }
    serialOutput.scrollTop = serialOutput.scrollHeight;

    // 2. Collect for AI evaluation window
    if (captureActive) {
      serialCaptureBuffer += text;
      const lines = serialCaptureBuffer.split('\n');
      capturedLinesCount = lines.length;
    }
  });

  // Calculate dynamic duration
  const code = getCode();
  const durationSec = customDurationSec || calculateDynamicCaptureWindow(code);
  let remaining = durationSec;

  serialCountdown.classList.add('visible');
  serialCountdown.classList.remove('live');
  serialCountdown.textContent = `Capturing AI Feedback… ${remaining}s`;

  return new Promise((resolve) => {
    const countdownInterval = setInterval(() => {
      remaining--;
      if (remaining <= 0 || (capturedLinesCount >= targetMaxLines && remaining <= durationSec - 2)) {
        clearInterval(countdownInterval);
        captureActive = false;
        
        // Switch badge to Live Infinite Stream without stopping monitor!
        serialCountdown.classList.add('live');
        serialCountdown.textContent = 'Live Streaming';
        
        // Store captured output for feedback
        setSerialOutput(serialCaptureBuffer);
        showFeedbackBar();
        
        resolve(serialCaptureBuffer);
      } else {
        serialCountdown.textContent = `Capturing AI Feedback… ${remaining}s`;
      }
    }, 1000);
  });
}

async function streamCapturedSerialToMonitor(lines) {
  serialCaptureBuffer = '';
  serialOutput.textContent = '';
  serialMonitor.classList.remove('collapsed');

  // Automatically show serial monitor on mobile
  setMobileActiveTab('serial');
  
  let remaining = 10;
  serialCountdown.classList.add('visible');
  serialCountdown.textContent = `Capturing… ${remaining}s`;
  
  const countdownInterval = setInterval(() => {
    remaining--;
    if (remaining <= 0) {
      clearInterval(countdownInterval);
      serialCountdown.classList.remove('visible');
    } else {
      serialCountdown.textContent = `Capturing… ${remaining}s`;
    }
  }, 1000);

  // Stream each line dynamically to look like a live serial console
  if (Array.isArray(lines)) {
    for (const line of lines) {
      if (line) {
        serialCaptureBuffer += line + '\n';
        serialOutput.textContent += line + '\n';
        serialOutput.scrollTop = serialOutput.scrollHeight;
        await sleep(150); // Muted, dynamic streaming delay
      }
    }
  }
  
  setSerialOutput(serialCaptureBuffer);

  // Take the user back to the chat tab after print capture is complete
  setMobileActiveTab('chat');
}

// ═══════════════════════════════════════
// Retry with AI Fix
// ═══════════════════════════════════════

async function handleRetry() {
  const history = getHistory();
  const lastAttempt = history[history.length - 1];
  const origCommand = lastAttempt?.command || getCurrentCommand() || lastCommand || 'Arduino sketch';

  let targetGoal = origCommand;
  if (targetGoal.toLowerCase().startsWith('retry') || targetGoal.toLowerCase().startsWith('fix')) {
    const validAttempt = history.find(a => a.command && !a.command.toLowerCase().startsWith('retry'));
    if (validAttempt) targetGoal = validAttempt.command;
  }

  const failedCode = getCode();
  const compileErr = lastAttempt?.compileError || 'Compilation failed';
  const retryPrompt = `The following Arduino sketch failed to compile with this error:\n\`\`\`\n${compileErr}\n\`\`\`\n\nCurrent sketch code:\n\`\`\`cpp\n${failedCode}\n\`\`\`\n\nGoal: "${targetGoal}". Please fix all errors, correct the syntax, ensure all required libraries are included, and deliver the complete, corrected, compile-ready Arduino sketch.`;

  addMessage('system', '🔄 Retrying with AI auto-fix…');
  await generateAndShowCode(retryPrompt);
}

// ═══════════════════════════════════════
// Utility
// ═══════════════════════════════════════

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ═══════════════════════════════════════
// Mobile Navigation Setup
// ═══════════════════════════════════════

function initMobileNav() {
  const appContainer = document.getElementById('app');
  if (appContainer) {
    appContainer.setAttribute('data-active-tab', 'chat');
  }

  const mobileNav = document.getElementById('mobile-nav');
  if (mobileNav) {
    mobileNav.addEventListener('click', (e) => {
      const btn = e.target.closest('.mobile-nav-btn');
      if (!btn) return;
      setMobileActiveTab(btn.dataset.target);
    });
  }

  const desktopBackBtn = document.getElementById('desktop-back-btn');
  if (desktopBackBtn) {
    desktopBackBtn.addEventListener('click', () => {
      if (window.parent && typeof window.parent.switchToHomeView === 'function') {
        window.parent.switchToHomeView();
      }
    });
  }
}

function setMobileActiveTab(target) {
  if (target === 'home') {
    if (window.parent && typeof window.parent.switchToHomeView === 'function') {
      window.parent.switchToHomeView();
    }
    return;
  }

  const appContainer = document.getElementById('app');
  if (appContainer) {
    appContainer.setAttribute('data-active-tab', target);
  }

  // Update active state in mobile nav buttons
  document.querySelectorAll('.mobile-nav-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.target === target);
  });

  // Force CodeMirror to redraw if we switch to the editor tab on mobile
  if (target === 'editor') {
    const view = getEditorView();
    if (view) {
      setTimeout(() => {
        view.requestMeasure();
      }, 50);
    }
  }
}

function containsHardwareWarning(lines) {
  const warningKeywords = [
    'not detected',
    'not found',
    'failed to initialize',
    'failed to find',
    'sensor offline',
    'check wiring',
    'check connection',
    'connection error',
    'no connection',
    'could not find',
    'error initializing',
    'device error',
    'error starting'
  ];
  
  for (const line of lines) {
    const lower = line.toLowerCase();
    for (const kw of warningKeywords) {
      if (lower.includes(kw)) {
        return { triggered: true, keyword: kw, line: line };
      }
    }
  }
  return { triggered: false };
}

function initResizers() {
  const resizerX = document.getElementById('resizer-chat-editor');
  const resizerY = document.getElementById('resizer-main-bottom');
  const resizerSidebar = document.getElementById('resizer-sidebar-chat');
  const chatPanel = document.querySelector('.chat-panel');
  const historySidebar = document.getElementById('chat-history-sidebar');
  const serialMonitor = document.getElementById('serial-monitor');

  // Restore saved widths on startup
  try {
    const savedChatWidth = localStorage.getItem('arduino-claw:chat-width');
    if (savedChatWidth && chatPanel) {
      chatPanel.style.width = savedChatWidth;
      chatPanel.style.maxWidth = 'none';
    }

    const savedSidebarWidth = localStorage.getItem('arduino-claw:sidebar-width');
    if (savedSidebarWidth && historySidebar) {
      historySidebar.style.width = savedSidebarWidth;
    }
  } catch (_) {}

  // Dragging X (Chat vs Editor)
  if (resizerX && chatPanel) {
    resizerX.addEventListener('mousedown', (e) => {
      e.preventDefault();
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';

      const doDragX = (moveEvent) => {
        const containerRect = document.querySelector('.main-content').getBoundingClientRect();
        let newWidth = moveEvent.clientX - containerRect.left;
        
        // Boundaries: min 280px, max 85% of container width
        if (newWidth < 280) newWidth = 280;
        if (newWidth > containerRect.width * 0.85) newWidth = containerRect.width * 0.85;

        chatPanel.style.width = newWidth + 'px';
        chatPanel.style.maxWidth = 'none'; // Override CSS max-width constraint
      };

      const stopDragX = () => {
        document.removeEventListener('mousemove', doDragX);
        document.removeEventListener('mouseup', stopDragX);
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
        try {
          localStorage.setItem('arduino-claw:chat-width', chatPanel.style.width);
        } catch (_) {}
      };

      document.addEventListener('mousemove', doDragX);
      document.addEventListener('mouseup', stopDragX);
    });
  }

  // Dragging Sidebar (History Sidebar vs Main Chat)
  if (resizerSidebar && historySidebar && chatPanel) {
    resizerSidebar.addEventListener('mousedown', (e) => {
      e.preventDefault();
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';

      const doDragSidebar = (moveEvent) => {
        const chatPanelRect = chatPanel.getBoundingClientRect();
        let newWidth = moveEvent.clientX - chatPanelRect.left;
        
        // Boundaries: min 120px, max 350px
        if (newWidth < 120) newWidth = 120;
        if (newWidth > 350) newWidth = 350;

        historySidebar.style.width = newWidth + 'px';
      };

      const stopDragSidebar = () => {
        document.removeEventListener('mousemove', doDragSidebar);
        document.removeEventListener('mouseup', stopDragSidebar);
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
        try {
          localStorage.setItem('arduino-claw:sidebar-width', historySidebar.style.width);
        } catch (_) {}
      };

      document.addEventListener('mousemove', doDragSidebar);
      document.addEventListener('mouseup', stopDragSidebar);
    });
  }

  // Dragging Y (Main Content vs Serial Monitor)
  if (resizerY && serialMonitor) {
    resizerY.addEventListener('mousedown', (e) => {
      e.preventDefault();
      document.body.style.cursor = 'row-resize';
      document.body.style.userSelect = 'none';

      // Temporarily disable height transition during dragging
      serialMonitor.style.transition = 'none';

      const doDragY = (moveEvent) => {
        const bottomRect = document.body.getBoundingClientRect();
        let newHeight = bottomRect.bottom - moveEvent.clientY;

        // Boundaries: min 32px (collapsed threshold), max 80% of page height
        if (newHeight < 40) {
          serialMonitor.classList.add('collapsed');
          newHeight = 32;
        } else {
          serialMonitor.classList.remove('collapsed');
          if (newHeight > window.innerHeight * 0.8) {
            newHeight = window.innerHeight * 0.8;
          }
        }

        serialMonitor.style.height = newHeight + 'px';
      };

      const stopDragY = () => {
        document.removeEventListener('mousemove', doDragY);
        document.removeEventListener('mouseup', stopDragY);
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
        
        // Restore transition
        serialMonitor.style.transition = 'height 0.3s ease';
      };

      document.addEventListener('mousemove', doDragY);
      document.addEventListener('mouseup', stopDragY);
    });
  }
}

// ═══════════════════════════════════════
// Temp Layout Height Diagnostic Overlay
// ═══════════════════════════════════════
function addDiagnosticOverlay() {
  const diag = document.createElement('div');
  diag.style.position = 'fixed';
  diag.style.bottom = '80px';
  diag.style.right = '10px';
  diag.style.background = 'rgba(255, 0, 0, 0.9)';
  diag.style.color = 'white';
  diag.style.padding = '8px 12px';
  diag.style.fontSize = '10px';
  diag.style.fontFamily = 'monospace';
  diag.style.zIndex = '9999';
  diag.style.borderRadius = '4px';
  diag.style.pointerEvents = 'none';
  diag.id = 'layout-diagnostic';
  document.body.appendChild(diag);

  const updateDiag = () => {
    const app = document.getElementById('app');
    const mainContent = document.querySelector('.main-content');
    const chatPanel = document.querySelector('.chat-panel');
    const wrapper = document.querySelector('.chat-body-wrapper');
    const chatMain = document.querySelector('.chat-main');
    const messages = document.getElementById('chat-messages');

    diag.innerHTML = `
      Viewport H: ${window.innerHeight}px<br>
      #app H: ${app ? app.clientHeight : 'null'}px<br>
      .main-content H: ${mainContent ? mainContent.clientHeight : 'null'}px<br>
      .chat-panel H: ${chatPanel ? chatPanel.clientHeight : 'null'}px<br>
      .chat-body-wrapper H: ${wrapper ? wrapper.clientHeight : 'null'}px<br>
      .chat-main H: ${chatMain ? chatMain.clientHeight : 'null'}px<br>
      #chat-messages H: ${messages ? messages.clientHeight : 'null'}px
    `;
  };

  updateDiag();
  window.addEventListener('resize', updateDiag);
  setInterval(updateDiag, 1000);
}
// Un-comment to enable diagnostic overlay if height collapse persists
// addDiagnosticOverlay();
