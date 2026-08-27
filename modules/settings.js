// modules/settings.js — Settings Panel: API keys, provider toggle, baud rate
import { checkBridgeStatus } from './bridge.js';

let settingsPanel = null;
let isOpen = false;

const STORAGE_KEYS = {
  provider: 'arduino-claw:provider',
  uploadMode: 'arduino-claw:upload-mode',
  autoUpdate: 'arduino-claw:auto-update',
  geminiKey: 'arduino-claw:gemini-key',
  geminiModel: 'arduino-claw:gemini-model',
  claudeKey: 'arduino-claw:claude-key',
  claudeModel: 'arduino-claw:claude-model',
  llamaKey: 'arduino-claw:llama-key',
  llamaUrl: 'arduino-claw:llama-url',
  llamaModel: 'arduino-claw:llama-model',
  baud: 'arduino-claw:baud',
  customPreset: 'arduino-claw:custom-preset',
  maxSerialLines: 'arduino-claw:max-serial-lines',
};

export function getAutoUpdate() {
  return localStorage.getItem(STORAGE_KEYS.autoUpdate) === 'true';
}

export function setAutoUpdate(val) {
  localStorage.setItem(STORAGE_KEYS.autoUpdate, val ? 'true' : 'false');
}

export function getSerialCaptureLimit() {
  return localStorage.getItem(STORAGE_KEYS.maxSerialLines) || 'auto';
}

export function setSerialCaptureLimit(limit) {
  localStorage.setItem(STORAGE_KEYS.maxSerialLines, String(limit));
}

export function getMaxSerialLines() {
  const val = getSerialCaptureLimit();
  if (val.endsWith('s') || val === 'auto') return 50;
  return parseInt(val) || 50;
}

export function setMaxSerialLines(limit) {
  setSerialCaptureLimit(limit);
}

export const CUSTOM_PRESETS = {
  cerebras: { name: 'Cerebras', url: 'https://api.cerebras.ai/v1/chat/completions', model: 'llama3.1-8b' },
  groq: { name: 'Groq', url: 'https://api.groq.com/openai/v1/chat/completions', model: 'llama-3.3-70b-specdec' },
  sambanova: { name: 'SambaNova', url: 'https://api.sambanova.ai/v1/chat/completions', model: 'Meta-Llama-3.1-8B-Instruct' },
  openrouter: { name: 'OpenRouter (Free)', url: 'https://openrouter.ai/api/v1/chat/completions', model: 'meta-llama/llama-3.1-8b-instruct:free' },
  deepseek: { name: 'DeepSeek', url: 'https://api.deepseek.com/v1/chat/completions', model: 'deepseek-chat' },
  ollama: { name: 'Ollama (Local)', url: 'http://localhost:11434/v1/chat/completions', model: 'llama3' },
  custom: { name: 'Custom URL', url: '', model: '' }
};

export function getCustomPreset() {
  return localStorage.getItem(STORAGE_KEYS.customPreset) || 'cerebras';
}

export function setCustomPreset(val) {
  localStorage.setItem(STORAGE_KEYS.customPreset, val);
}

export function getProvider() {
  return localStorage.getItem(STORAGE_KEYS.provider) || 'llama';
}

export function setProvider(p) {
  localStorage.setItem(STORAGE_KEYS.provider, p);
}

export function getApiKey(provider) {
  if (provider === 'llama') return localStorage.getItem(STORAGE_KEYS.llamaKey) || '';
  const key = provider === 'claude' ? STORAGE_KEYS.claudeKey : STORAGE_KEYS.geminiKey;
  return localStorage.getItem(key) || '';
}

export function setApiKey(provider, value) {
  if (provider === 'llama') {
    localStorage.setItem(STORAGE_KEYS.llamaKey, value);
    return;
  }
  const key = provider === 'claude' ? STORAGE_KEYS.claudeKey : STORAGE_KEYS.geminiKey;
  localStorage.setItem(key, value);
}

export function getLlamaUrl() {
  return localStorage.getItem(STORAGE_KEYS.llamaUrl) || 'https://api.cerebras.ai/v1/chat/completions';
}

export function setLlamaUrl(url) {
  localStorage.setItem(STORAGE_KEYS.llamaUrl, url);
}

export function getLlamaModel() {
  return localStorage.getItem(STORAGE_KEYS.llamaModel) || 'gpt-oss-120b';
}

export function setLlamaModel(model) {
  localStorage.setItem(STORAGE_KEYS.llamaModel, model);
}

export function getGeminiModel() {
  return localStorage.getItem(STORAGE_KEYS.geminiModel) || 'gemini-2.0-flash';
}

export function setGeminiModel(model) {
  localStorage.setItem(STORAGE_KEYS.geminiModel, model);
}

export function getClaudeModel() {
  return localStorage.getItem(STORAGE_KEYS.claudeModel) || 'claude-sonnet-4-20250514';
}

export function setClaudeModel(model) {
  localStorage.setItem(STORAGE_KEYS.claudeModel, model);
}

export function getBaud() {
  return parseInt(localStorage.getItem(STORAGE_KEYS.baud)) || 9600;
}

export function setBaud(b) {
  localStorage.setItem(STORAGE_KEYS.baud, String(b));
}

export function getUploadMode() {
  return 'cli';
}

export function setUploadMode(m) {
  // Standardized on local compiler bridge uploading
}

export function hasApiKey() {
  const p = getProvider();
  if (p === 'llama') {
    const preset = getCustomPreset();
    if (preset === 'ollama') return getLlamaUrl().trim().length > 0;
    return getLlamaUrl().trim().length > 0 && getApiKey('llama').trim().length > 0;
  }
  return getApiKey(p).trim().length > 0;
}

/**
 * Initialize settings panel.
 * @param {HTMLElement} panel - the settings panel container
 * @param {function} onProviderChange - callback when provider changes
 */
export function initSettings(panel, onProviderChange) {
  settingsPanel = panel;
  buildSettingsUI(onProviderChange);
}

export function openSettings() {
  if (settingsPanel) {
    settingsPanel.classList.add('open');
    isOpen = true;
  }
}

export function closeSettings() {
  if (settingsPanel) {
    settingsPanel.classList.remove('open');
    isOpen = false;
  }
}

export function toggleSettings() {
  isOpen ? closeSettings() : openSettings();
}

function updateProviderSectionsVisibility(provider) {
  const geminiSec = document.getElementById('section-gemini');
  const claudeSec = document.getElementById('section-claude');
  const llamaSec = document.getElementById('section-llama');

  if (geminiSec) geminiSec.classList.toggle('provider-hidden', provider !== 'gemini');
  if (claudeSec) claudeSec.classList.toggle('provider-hidden', provider !== 'claude');
  if (llamaSec) llamaSec.classList.toggle('provider-hidden', provider !== 'llama');
}

function buildSettingsUI(onProviderChange) {
  if (!settingsPanel) return;

  const currentProvider = getProvider();
  const uploadMode = getUploadMode();
  const geminiKey = getApiKey('gemini');
  const geminiModel = getGeminiModel();
  const claudeKey = getApiKey('claude');
  const claudeModel = getClaudeModel();
  const llamaKey = getApiKey('llama');
  const llamaUrl = getLlamaUrl();
  const llamaModel = getLlamaModel();
  const baud = getBaud();
  const currentPreset = getCustomPreset();
  const maxSerialLines = getMaxSerialLines();

  settingsPanel.innerHTML = `
    <div class="settings-header">
      <h3>Settings</h3>
      <button class="settings-close-btn" id="settings-close-btn" title="Close">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
        </svg>
      </button>
    </div>

    <div class="settings-body">

      <div class="settings-section">
        <label class="settings-label">AI Provider</label>
        <div class="provider-toggle" id="provider-toggle">
          <button class="provider-btn ${currentProvider === 'llama' ? 'active' : ''}" data-provider="llama" title="OpenAI Compatible Custom API">
            <span class="provider-icon" style="margin-right: 4px; display: inline-flex; align-items: center;">
              <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <rect x="2" y="3" width="20" height="14" rx="2" ry="2"></rect>
                <line x1="8" y1="21" x2="16" y2="21"></line>
                <line x1="12" y1="17" x2="12" y2="21"></line>
              </svg>
            </span> Custom Server
          </button>
          <button class="provider-btn ${currentProvider === 'gemini' ? 'active' : ''}" data-provider="gemini" title="Google Gemini">
            <span class="provider-icon">✦</span> Gemini
          </button>
          <button class="provider-btn ${currentProvider === 'claude' ? 'active' : ''}" data-provider="claude" title="Anthropic Claude">
            <span class="provider-icon">◈</span> Claude
          </button>
        </div>
      </div>

      <div id="section-gemini" class="settings-section settings-section-provider">
        <label class="settings-label" for="gemini-key-input">Gemini API Key</label>
        <input type="password" id="gemini-key-input" class="settings-input" style="margin-bottom: 10px;"
          placeholder="Paste your Gemini API key" value="${escapeAttr(geminiKey)}">
        <label class="settings-label" for="gemini-model-input">Model Name</label>
        <input type="text" id="gemini-model-input" class="settings-input"
          placeholder="e.g. gemini-2.0-flash" value="${escapeAttr(geminiModel)}">
      </div>

      <div id="section-claude" class="settings-section settings-section-provider">
        <label class="settings-label" for="claude-key-input">Claude API Key</label>
        <input type="password" id="claude-key-input" class="settings-input" style="margin-bottom: 10px;"
          placeholder="Paste your Claude API key" value="${escapeAttr(claudeKey)}">
        <label class="settings-label" for="claude-model-input">Model Name</label>
        <input type="text" id="claude-model-input" class="settings-input"
          placeholder="e.g. claude-sonnet-4-20250514" value="${escapeAttr(claudeModel)}">
      </div>

      <div id="section-llama" class="settings-section settings-section-provider">
        <label class="settings-label" for="custom-preset-select">Preset Provider</label>
        <select id="custom-preset-select" class="settings-select" style="margin-bottom: 12px;">
          ${Object.entries(CUSTOM_PRESETS).map(([key, data]) => 
            `<option value="${key}" ${key === currentPreset ? 'selected' : ''}>${data.name}</option>`
          ).join('')}
        </select>

        <label class="settings-label" for="llama-url-input">Custom API URL</label>
        <input type="text" id="llama-url-input" class="settings-input"
          placeholder="https://api.cerebras.ai/v1/chat/completions" value="${escapeAttr(llamaUrl)}">
        <label class="settings-label" style="margin-top:10px" for="llama-model-input">Model Name</label>
        <input type="text" id="llama-model-input" class="settings-input"
          placeholder="e.g. llama3.1-8b" value="${escapeAttr(llamaModel)}">
        <label class="settings-label" style="margin-top:10px" for="llama-key-input">Custom API Key</label>
        <input type="password" id="llama-key-input" class="settings-input"
          placeholder="Paste your API Key" value="${escapeAttr(llamaKey)}">
      </div>

      <div class="settings-section" style="border-top: 1px solid var(--border); padding-top: 16px;">
        <h4 style="font-size: 11px; font-weight: 700; text-transform: uppercase; color: var(--text-muted); margin-bottom: 12px; letter-spacing: 0.5px;">Advanced Settings</h4>
        
        <label class="settings-label" for="baud-select">Serial Monitor Baud Rate</label>
        <select id="baud-select" class="settings-select" style="margin-bottom: 12px;">
          ${[9600, 19200, 38400, 57600, 115200].map(b =>
            `<option value="${b}" ${b === baud ? 'selected' : ''}>${b}</option>`
          ).join('')}
        </select>

        <label class="settings-label" for="serial-limit-select">AI Serial Feedback Capture Limit</label>
        <select id="serial-limit-select" class="settings-select" style="margin-bottom: 14px;">
          ${[
            { val: 'auto', label: 'Auto (Smart AI Delay Detection)' },
            { val: '5s', label: '5 seconds' },
            { val: '10s', label: '10 seconds' },
            { val: '15s', label: '15 seconds' },
            { val: '20s', label: '20 seconds' },
            { val: '10', label: '10 lines' },
            { val: '20', label: '20 lines' },
            { val: '50', label: '50 lines' },
            { val: '100', label: '100 lines' }
          ].map(opt =>
            `<option value="${opt.val}" ${opt.val === String(getSerialCaptureLimit()) ? 'selected' : ''}>${opt.label}</option>`
          ).join('')}
        </select>

        <div style="display: flex; align-items: center; justify-content: space-between; padding: 10px 0; border-top: 1px dashed var(--border);">
          <div>
            <label class="settings-label" style="margin-bottom: 2px; cursor: pointer;" for="auto-update-toggle-checkbox">Auto-Update Arduino CLI & Libraries</label>
            <div style="font-size: 11px; color: var(--text-muted);">Auto-download latest core & library updates on launch</div>
          </div>
          <label class="switch">
            <input type="checkbox" id="auto-update-toggle-checkbox" ${getAutoUpdate() ? 'checked' : ''}>
            <span class="slider" style="border-radius: 18px;"></span>
          </label>
        </div>
      </div>

      <div class="settings-section" style="border-top: 1px solid var(--border); padding-top: 16px; margin-bottom: 0;">
        <button class="settings-about-trigger-btn" id="settings-about-trigger-btn" style="width: 100%; display: flex; justify-content: space-between; align-items: center; cursor: pointer; padding: 10px 14px; border: 1px solid var(--border); border-radius: 6px; background: var(--bg-primary); color: var(--text-primary); transition: background 0.2s; font-family: var(--font-ui); font-size: 12px; font-weight: 600; outline: none; box-sizing: border-box;" onmouseover="this.style.background='var(--bg-hover)'" onmouseout="this.style.background='var(--bg-primary)'">
          <div style="display: flex; align-items: center; gap: 8px;">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color: var(--accent);">
              <circle cx="12" cy="12" r="10"></circle>
              <line x1="12" y1="16" x2="12" y2="12"></line>
              <line x1="12" y1="8" x2="12.01" y2="8"></line>
            </svg>
            <span>About Arduino-Claw</span>
          </div>
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color: var(--text-muted);">
            <polyline points="9 18 15 12 9 6"></polyline>
          </svg>
        </button>
      </div>

      <div class="settings-section settings-danger">
        <button class="settings-clear-btn" id="settings-clear-btn">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
          </svg>
          Clear all saved data
        </button>
      </div>
    </div>
  `;

  // Apply initial sections visibility state
  updateProviderSectionsVisibility(currentProvider);

  // Bind events
  document.getElementById('settings-close-btn').addEventListener('click', () => {
    closeSettings();
    if (onProviderChange) onProviderChange(getProvider());
  });

  document.getElementById('provider-toggle').addEventListener('click', (e) => {
    const btn = e.target.closest('.provider-btn');
    if (!btn) return;
    const p = btn.dataset.provider;
    setProvider(p);
    document.querySelectorAll('#provider-toggle .provider-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    
    // Smoothly transition visible fields
    updateProviderSectionsVisibility(p);
    
    if (onProviderChange) onProviderChange(p);
  });

  document.getElementById('custom-preset-select').addEventListener('change', (e) => {
    const presetKey = e.target.value;
    setCustomPreset(presetKey);
    
    if (presetKey !== 'custom') {
      const preset = CUSTOM_PRESETS[presetKey];
      
      const urlInput = document.getElementById('llama-url-input');
      const modelInput = document.getElementById('llama-model-input');
      
      if (urlInput) {
        urlInput.value = preset.url;
        setLlamaUrl(preset.url);
      }
      if (modelInput) {
        modelInput.value = preset.model;
        setLlamaModel(preset.model);
      }
      
      if (onProviderChange) onProviderChange(getProvider());
    }
  });

  document.getElementById('gemini-key-input').addEventListener('blur', (e) => {
    setApiKey('gemini', e.target.value.trim());
  });

  document.getElementById('gemini-model-input').addEventListener('blur', (e) => {
    setGeminiModel(e.target.value.trim());
    if (onProviderChange) onProviderChange(getProvider());
  });

  document.getElementById('claude-key-input').addEventListener('blur', (e) => {
    setApiKey('claude', e.target.value.trim());
  });

  document.getElementById('claude-model-input').addEventListener('blur', (e) => {
    setClaudeModel(e.target.value.trim());
    if (onProviderChange) onProviderChange(getProvider());
  });

  document.getElementById('llama-key-input').addEventListener('blur', (e) => {
    setApiKey('llama', e.target.value.trim());
  });

  document.getElementById('llama-url-input').addEventListener('blur', (e) => {
    setLlamaUrl(e.target.value.trim());
  });

  document.getElementById('llama-model-input').addEventListener('blur', (e) => {
    setLlamaModel(e.target.value.trim());
    if (onProviderChange) onProviderChange(getProvider());
  });

  document.getElementById('baud-select').addEventListener('change', (e) => {
    setBaud(parseInt(e.target.value));
  });

  document.getElementById('serial-limit-select').addEventListener('change', (e) => {
    setSerialCaptureLimit(e.target.value);
  });

  const autoUpdateCb = document.getElementById('auto-update-toggle-checkbox');
  if (autoUpdateCb) {
    autoUpdateCb.addEventListener('change', (e) => {
      setAutoUpdate(e.target.checked);
    });
  }

  // Bind About modal triggers
  const aboutTrigger = document.getElementById('settings-about-trigger-btn');
  const aboutOverlay = document.getElementById('about-modal-overlay');
  const aboutBox = document.getElementById('about-modal-box');
  const aboutClose = document.getElementById('about-modal-close');

  if (aboutTrigger && aboutOverlay && aboutBox) {
    aboutTrigger.addEventListener('click', () => {
      aboutOverlay.style.opacity = '1';
      aboutOverlay.style.pointerEvents = 'all';
      aboutBox.style.transform = 'scale(1)';
      aboutBox.style.opacity = '1';
    });
  }

  if (aboutClose && aboutOverlay && aboutBox) {
    aboutClose.addEventListener('click', () => {
      aboutOverlay.style.opacity = '0';
      aboutOverlay.style.pointerEvents = 'none';
      aboutBox.style.transform = 'scale(0.95)';
      aboutBox.style.opacity = '0';
      document.activeElement?.blur();
      document.getElementById('chat-input')?.focus();
    });
  }

  if (aboutOverlay && aboutBox) {
    aboutOverlay.addEventListener('click', (e) => {
      if (e.target === aboutOverlay) {
        aboutOverlay.style.opacity = '0';
        aboutOverlay.style.pointerEvents = 'none';
        aboutBox.style.transform = 'scale(0.95)';
        aboutBox.style.opacity = '0';
        document.activeElement?.blur();
        document.getElementById('chat-input')?.focus();
      }
    });
  }

  document.getElementById('settings-clear-btn').addEventListener('click', () => {
    if (confirm('This will clear all API keys, settings, and saved patterns. Continue?')) {
      Object.values(STORAGE_KEYS).forEach(k => localStorage.removeItem(k));
      localStorage.removeItem('arduino-claw:known-good');
      localStorage.removeItem('arduino-claw:theme');
      buildSettingsUI(onProviderChange);
    }
  });
}

function escapeAttr(str) {
  return str.replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
