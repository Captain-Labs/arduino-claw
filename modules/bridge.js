// modules/bridge.js — Native Electron & HTTP Bridge
const BRIDGE_URL = 'http://127.0.0.1:5000';

export async function checkBridgeStatus() {
  if (window.electronAPI && typeof window.electronAPI.listPorts === 'function') {
    return { ok: true, status: 'ok', arduino_cli: '1.5.1' };
  }
  try {
    const res = await fetch(`${BRIDGE_URL}/status`);
    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      return { ok: false, error: errData.error || `Bridge returned HTTP ${res.status}` };
    }
    const data = await res.json();
    return data;
  } catch (err) {
    return { ok: false, error: 'Compiler server not running.' };
  }
}

export async function listPorts() {
  // 1. Electron IPC (instant, native, zero-network, 100% reliable)
  if (window.electronAPI && typeof window.electronAPI.listPorts === 'function') {
    try {
      const ports = await window.electronAPI.listPorts();
      if (Array.isArray(ports)) {
        return { ports, ok: true };
      }
    } catch (e) {
      console.warn('[Bridge] IPC listPorts error:', e);
    }
  }

  // 2. HTTP Fallback to 127.0.0.1:5000
  try {
    const res = await fetch(`${BRIDGE_URL}/ports`);
    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      return { ports: [], ok: false, error: errData.error || `Bridge returned HTTP ${res.status}` };
    }
    const data = await res.json();
    return { ports: data.ports || [], ok: true, hint: data.hint };
  } catch (err) {
    return { ports: [], ok: false, error: 'Compiler server not running.' };
  }
}

export async function uploadCode(code, port, baud = 9600, fqbn = 'arduino:avr:uno', maxLines = 100) {
  // 1. Electron IPC direct upload
  if (window.electronAPI && typeof window.electronAPI.upload === 'function') {
    try {
      const res = await window.electronAPI.upload({ code, port, fqbn });
      return res;
    } catch (e) {
      console.warn('[Bridge] IPC upload error:', e);
    }
  }

  // 2. HTTP Fallback
  try {
    const res = await fetch(`${BRIDGE_URL}/upload`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code, port, baud, fqbn, max_lines: maxLines })
    });
    const data = await res.json();
    return data;
  } catch (err) {
    return { success: false, error: 'Compiler server not reachable.', stage: 'network' };
  }
}

export async function readSerial(port, baud = 9600, duration = 10) {
  try {
    const res = await fetch(`${BRIDGE_URL}/serial?port=${encodeURIComponent(port)}&baud=${baud}&duration=${duration}`);
    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      return { output: [], ok: false, error: errData.error || `Bridge returned HTTP ${res.status}` };
    }
    const data = await res.json();
    return { output: data.output || [], ok: true, duration_s: data.duration_s };
  } catch (err) {
    return { output: [], ok: false, error: 'Compiler server not running.' };
  }
}
