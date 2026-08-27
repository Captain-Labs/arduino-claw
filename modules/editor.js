// modules/editor.js — CodeMirror 6 Setup with Multi-Tab Management
// Uses CodeMirror 6 via standard ES Modules mapped by index.html's importmap

import { basicSetup, EditorView } from 'codemirror';
import { EditorState } from '@codemirror/state';
import { cpp } from '@codemirror/lang-cpp';
import { oneDark } from '@codemirror/theme-one-dark';

let editorView = null;
let onSelectionChangeCallback = null;

export function onSelectionChange(cb) {
  onSelectionChangeCallback = cb;
}

export const DEFAULT_CODE = `// Arduino C++ Sketch
// Type a command in the chat panel to generate code

void setup() {
  Serial.begin(9600);
}

void loop() {
  // Waiting for commands...
}
`;

// ── Tab Management ──────────────────────────────────────────────────────────
const tabs = {
  main: {
    id: 'main',
    title: 'sketch.ino',
    code: DEFAULT_CODE,
    isTemporary: false
  }
};
let activeTabId = 'main';

/**
 * Initialize the CodeMirror 6 editor inside the given DOM element.
 * @param {HTMLElement} domElement
 * @returns {Promise<EditorView>}
 */
export async function initEditor(domElement) {

  const customTheme = EditorView.theme({
    '&': {
      height: '100%',
      fontSize: '13.5px',
      backgroundColor: '#1e1e1e',
    },
    '.cm-content': {
      fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace",
      caretColor: '#007acc',
    },
    '.cm-cursor': {
      borderLeftColor: '#007acc',
      borderLeftWidth: '2px',
    },
    '.cm-gutters': {
      backgroundColor: '#1e1e1e',
      color: '#858585',
      border: 'none',
      borderRight: '1px solid #2d2d30',
    },
    '.cm-activeLineGutter': {
      backgroundColor: '#2a2d2e',
      color: '#c6c6c6',
    },
    '.cm-activeLine': {
      backgroundColor: '#2a2d2e44',
    },
    '.cm-selectionBackground': {
      backgroundColor: '#264f78 !important',
    },
    '&.cm-focused .cm-selectionBackground': {
      backgroundColor: '#264f78 !important',
    },
    '.cm-matchingBracket': {
      backgroundColor: '#3c3c3c',
      outline: '1px solid #888',
    },
  });

  let initialCode = DEFAULT_CODE;
  try {
    const activeId = localStorage.getItem('arduino-claw:chat-active-session-id');
    if (activeId) {
      const sessions = JSON.parse(localStorage.getItem('arduino-claw:chat-sessions')) || [];
      const session = sessions.find(s => s.id === activeId);
      if (session && session.code !== undefined && session.code !== null) {
        initialCode = session.code;
        tabs.main.code = initialCode;
      }
    }
  } catch (_) {}

  const state = EditorState.create({
    doc: initialCode,
    extensions: [
      basicSetup,
      cpp(),
      oneDark,
      customTheme,
      EditorState.readOnly.of(true),
      EditorView.updateListener.of((update) => {
        if (update.selectionSet) {
          const selection = update.state.sliceDoc(
            update.state.selection.main.from,
            update.state.selection.main.to
          );
          if (onSelectionChangeCallback) {
            onSelectionChangeCallback(selection);
          }
        }
      })
    ],
  });

  editorView = new EditorView({
    state,
    parent: domElement,
  });

  renderTabsUI();

  return editorView;
}

/**
 * Render editor tabs in header.
 */
export function renderTabsUI() {
  const container = document.getElementById('editor-tabs');
  if (!container) return;

  container.innerHTML = '';

  Object.values(tabs).forEach(tab => {
    const tabEl = document.createElement('div');
    tabEl.className = `editor-tab ${tab.id === activeTabId ? 'active' : ''}`;
    tabEl.dataset.tabId = tab.id;

    const dot = document.createElement('span');
    dot.className = 'dot';
    if (tab.isTemporary) {
      dot.style.background = '#00e5ff';
    }
    tabEl.appendChild(dot);

    const label = document.createElement('span');
    label.textContent = tab.title;
    tabEl.appendChild(label);

    if (tab.isTemporary) {
      const closeBtn = document.createElement('span');
      closeBtn.className = 'tab-close-btn';
      closeBtn.textContent = '✕';
      closeBtn.title = 'Close temporary tab';
      closeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        closeTab(tab.id);
      });
      tabEl.appendChild(closeBtn);
    }

    tabEl.addEventListener('click', () => {
      switchTab(tab.id);
    });

    container.appendChild(tabEl);
  });
}

/**
 * Open or create a tab (e.g. temporary I2C Scanner or test sketch).
 */
export function openTab(tabId, title, code, isTemporary = true) {
  if (editorView && tabs[activeTabId]) {
    tabs[activeTabId].code = editorView.state.doc.toString();
  }

  tabs[tabId] = {
    id: tabId,
    title: title || `${tabId}.ino`,
    code: code || '',
    isTemporary: !!isTemporary
  };

  switchTab(tabId);
}

/**
 * Close a tab and return to main.
 */
export function closeTab(tabId) {
  if (tabId === 'main') return; // Cannot close main tab
  delete tabs[tabId];
  if (activeTabId === tabId) {
    switchTab('main');
  } else {
    renderTabsUI();
  }
}

/**
 * Reset tabs back to just the main sketch tab with default code.
 */
export function resetEditorTabs(defaultCode = DEFAULT_CODE) {
  for (const key of Object.keys(tabs)) {
    if (key !== 'main') {
      delete tabs[key];
    }
  }
  tabs.main = {
    id: 'main',
    title: 'sketch.ino',
    code: defaultCode,
    isTemporary: false
  };
  activeTabId = 'main';
  renderTabsUI();
  if (editorView) {
    editorView.dispatch({
      changes: {
        from: 0,
        to: editorView.state.doc.length,
        insert: defaultCode,
      },
    });
  }
}

/**
 * Switch active editor tab.
 */
export function switchTab(tabId) {
  if (!tabs[tabId]) tabId = 'main';

  // Save current active tab text
  if (editorView && tabs[activeTabId]) {
    tabs[activeTabId].code = editorView.state.doc.toString();
  }

  activeTabId = tabId;
  renderTabsUI();

  // Load new tab's code into CodeMirror
  if (editorView) {
    editorView.dispatch({
      changes: {
        from: 0,
        to: editorView.state.doc.length,
        insert: tabs[tabId].code || '',
      },
    });
  }
}

/**
 * Get the current code from the editor (active tab).
 * @returns {string}
 */
export function getCode() {
  if (!editorView) return '';
  return editorView.state.doc.toString();
}

/**
 * Always get the main sketch code (even if viewing a temporary tab).
 */
export function getMainCode() {
  if (activeTabId === 'main' && editorView) {
    return editorView.state.doc.toString();
  }
  return tabs.main ? tabs.main.code : '';
}

/**
 * Set the code in the active editor tab.
 * @param {string} code
 */
export function setCode(code) {
  if (tabs[activeTabId]) {
    tabs[activeTabId].code = code;
  }

  if (!editorView) return;
  editorView.dispatch({
    changes: {
      from: 0,
      to: editorView.state.doc.length,
      insert: code,
    },
  });

  // Save to active session if main tab
  if (activeTabId === 'main') {
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
  }
}

/**
 * Set the main tab code directly without affecting temporary tabs.
 */
export function setMainCode(code, title = null) {
  if (!tabs.main) {
    tabs.main = { id: 'main', title: title || 'sketch.ino', code: code, isTemporary: false };
  } else {
    tabs.main.code = code;
    if (title) tabs.main.title = title;
  }

  if (activeTabId === 'main' && editorView) {
    editorView.dispatch({
      changes: {
        from: 0,
        to: editorView.state.doc.length,
        insert: code,
      },
    });
  }
  renderTabsUI();
}

/**
 * Get the EditorView instance.
 * @returns {EditorView|null}
 */
export function getEditorView() {
  return editorView;
}
