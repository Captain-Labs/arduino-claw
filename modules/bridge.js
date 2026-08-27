// modules/bridge.js
const BRIDGE_URL = 'http://localhost:5000';

export async function checkBridgeStatus() {
  try {
    const res = await fetch(`${BRIDGE_URL}/status`);
    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      return { ok: false, error: errData.error || `Bridge returned HTTP ${res.status}` };
    }
    const data = await res.json();
    return data;
  } catch (err) {
    return { ok: false, error: 'Bridge not running. Start bridge.py first.' };
  }
}

export async function listPorts() {
  try {
    const res = await fetch(`${BRIDGE_URL}/ports`);
    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      return { ports: [], ok: false, error: errData.error || `Bridge returned HTTP ${res.status}` };
    }
    const data = await res.json();
    return { ports: data.ports || [], ok: true, hint: data.hint };
  } catch (err) {
    return { ports: [], ok: false, error: 'Bridge not running. Start bridge.py first.' };
  }
}

export async function uploadCode(code, port, baud = 9600, fqbn = null, maxLines = 100) {
  try {
    const res = await fetch(`${BRIDGE_URL}/upload`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code, port, baud, fqbn, max_lines: maxLines })
    });
    
    // It could be 200 OK or 400/500 with a JSON error body
    const data = await res.json();
    return data;
  } catch (err) {
    return { success: false, error: 'Bridge not running. Start bridge.py first.', stage: 'network' };
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
    return { output: [], ok: false, error: 'Bridge not running. Start bridge.py first.' };
  }
}
