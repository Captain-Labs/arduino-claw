// modules/serial.js — Web Serial API abstraction
// Modeled after the proven transport layer from ArduinoFlash

/** @type {SerialPort|null} */
let port = null;

/** @type {ReadableStreamDefaultReader|null} */
let reader = null;

/** @type {WritableStreamDefaultWriter|null} */
let writer = null;

/** Whether the port is currently open */
let portOpen = false;

/** RX buffer for background read loop */
let rxBuffer = [];
let readLoopPromise = null;
let keepReading = false;

/** Serial monitor state */
let monitorActive = false;
let monitorReader = null;

// ═══════════════════════════════════════
// Port Selection & Detection
// ═══════════════════════════════════════

const ARDUINO_FILTERS = [
  { usbVendorId: 0x2341 }, // Arduino SA (Uno, Mega, Leonardo, Zero, Due, Nano 33 BLE, MKR, etc.)
  { usbVendorId: 0x2a03 }, // Arduino LLC / Arduino.org
  { usbVendorId: 0x1a86 }, // QinHeng / WCH (CH340, CH341, CH343, CH9102)
  { usbVendorId: 0x0403 }, // FTDI (FT232R, FT232H, FT2232)
  { usbVendorId: 0x10c4 }, // Silicon Labs (CP2102, CP2104, CP2102N)
  { usbVendorId: 0x303a }, // Espressif Systems (ESP32, ESP32-S2/S3/C3 native USB)
  { usbVendorId: 0x2e8a }, // Raspberry Pi Ltd (RP2040, Pico, Pico W)
  { usbVendorId: 0x0483 }, // STMicroelectronics (STM32, Nucleo, BluePill VCP)
  { usbVendorId: 0x239a }, // Adafruit (Feather, Trinket, Circuit Playground, QT Py)
  { usbVendorId: 0x1b4f }, // SparkFun (Pro Micro, RedBoard, SAMD)
  { usbVendorId: 0x04d8 }, // Microchip / Atmel (ATmega32U4, SAMD)
  { usbVendorId: 0x16c0 }, // Teensy / PJRC / Van Ooijen (Teensy 2.0/3.x/4.x CDC)
  { usbVendorId: 0x2886 }, // Seeed Technology (Seeeduino, XIAO)
  { usbVendorId: 0x067b }, // Prolific Technology (PL2303)
  { usbVendorId: 0x0d28 }, // ARM / DAPLink (CMSIS-DAP CDC)
  { usbVendorId: 0x3171 }, // WCH / QinHeng USB serial
];

/**
 * Check if Web Serial API is available.
 * @returns {boolean}
 */
export function isSerialSupported() {
  if (window.flutter_inappwebview || 
      window.location.search.includes("platform=app") || 
      navigator.userAgent.includes("wv") ||
      (window.parent && (window.parent.flutter_inappwebview || (window.parent.location && window.parent.location.search.includes("platform=app"))))) return true;
  return 'serial' in navigator;
}

/**
 * Get already-granted ports (no user gesture required).
 * Filters to only USB hardware serial devices.
 * @returns {Promise<SerialPort[]>}
 */
export async function listPorts() {
  if (!navigator.serial) return [];
  try {
    const allPorts = await navigator.serial.getPorts();
    return allPorts.filter(p => {
      const info = p.getInfo ? p.getInfo() : {};
      if (!info.usbVendorId) return false;
      return ARDUINO_FILTERS.some(f => f.usbVendorId === info.usbVendorId);
    });
  } catch (_) {
    return [];
  }
}

/**
 * Prompt the user to select a port via the browser native picker.
 * Applies USB Vendor filters so ONLY physical USB microcontroller / serial ports appear.
 * @returns {Promise<boolean>} true if a port was selected
 */
export async function requestPort() {
  await forceClose();

  const isApp = window.flutter_inappwebview || 
                (window.parent && window.parent.flutter_inappwebview);
  if (isApp) {
    const handler = window.flutter_inappwebview?.callHandler || 
                    window.parent?.flutter_inappwebview?.callHandler;
    if (handler) {
      const success = await handler("selectPort");
      if (success) {
        port = { dummy: true, getInfo: () => ({ usbVendorId: 0x2341 }) };
        return true;
      }
      return false;
    }
  }

  if (!navigator.serial) {
    throw new Error('Serial hardware access is not supported on this platform. Please run the desktop app or grant USB permissions.');
  }

  try {
    // Filter strictly for USB hardware devices — hides Bluetooth, debug consoles, virtual phone links
    port = await navigator.serial.requestPort({ filters: ARDUINO_FILTERS });
    return !!port;
  } catch (err) {
    if (err.name === 'NotFoundError') {
      return false;
    }
    console.warn('[Serial] requestPort error:', err);
    return false;
  }
}

/**
 * Check if a port has been selected.
 * @returns {boolean}
 */
export function hasPort() {
  return port !== null;
}

export function getPort() {
  return port;
}

export function setPort(selectedPort) {
  port = selectedPort;
}

/**
 * Check if the port is currently open.
 * @returns {boolean}
 */
export function isOpen() {
  return portOpen && port !== null;
}

/**
 * Get port info string for display.
 * @returns {string}
 */
export function getPortInfo() {
  if (!port) return '';
  const info = port.getInfo ? port.getInfo() : {};
  const vid = info.usbVendorId;
  const pid = info.usbProductId;
  if (vid === 0x2341 || vid === 0x2a03) return 'Arduino Board';
  if (vid === 0x1a86) return 'CH340 (Arduino)';
  if (vid === 0x0403) return 'FTDI (Arduino)';
  if (vid === 0x10c4) return 'CP210x (ESP/Arduino)';
  if (vid === 0x04d8) return 'Microchip (Arduino)';
  if (vid === 0x1b4f) return 'SparkFun Board';
  if (vid === 0x2e8a) return 'Raspberry Pi Pico';
  if (vid === 0x303a) return 'ESP32 Device';
  if (vid) {
    return `USB Serial (0x${vid.toString(16).padStart(4, '0')}:${(pid || 0).toString(16).padStart(4, '0')})`;
  }
  return 'Serial Port';
}

// ═══════════════════════════════════════
// Open / Close / Reset
// ═══════════════════════════════════════

/**
 * Open port at given baud rate and perform DTR reset.
 * Matches proven avrgirl-arduino timing.
 * @param {number} baudRate
 * @param {function} log
 */
export async function openAndReset(baudRate, log = () => {}) {
  if (!port) throw new Error("No serial port selected. Click 'Connect' first.");

  if (portOpen || (port && (port.readable || port.writable))) {
    log('Resetting serial connection…');
    await forceClose();
    await sleep(150);
  }

  const isApp = window.flutter_inappwebview || 
                (window.parent && window.parent.flutter_inappwebview);
  if (isApp) {
    const handler = window.flutter_inappwebview?.callHandler || 
                    window.parent?.flutter_inappwebview?.callHandler;
    if (handler) {
      const success = await handler("openPort", { baudRate });
      if (!success) throw new Error("Failed to open serial port natively.");
      portOpen = true;

      // Set global callback from Dart
      const win = window.flutter_inappwebview ? window : window.parent;
      win.onSerialDataFromDart = (bytes) => {
        if (keepReading) {
          for (const byte of bytes) rxBuffer.push(byte);
        }
      };

      // DTR reset native handler
      log('Resetting board natively (DTR toggle)…');
      await handler("setSignals", { dataTerminalReady: false, requestToSend: false });
      await sleep(250);
      await handler("setSignals", { dataTerminalReady: true, requestToSend: true });
      await sleep(50);
      return;
    }
  }

  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      await port.open({ baudRate });
      portOpen = true;
      break;
    } catch (err) {
      if (attempt === 1) {
        await forceClose();
        await sleep(350);
      } else {
        portOpen = false;
        if (err.message && err.message.includes('Failed to open')) {
          throw new Error(
            'Failed to open serial port. Make sure no other application ' +
            '(Arduino IDE Serial Monitor, PuTTY, etc.) is using this port, ' +
            'then try again.'
          );
        }
        throw err;
      }
    }
  }

  // DTR Reset — strict avrgirl timing
  log('Resetting board (DTR toggle)…');
  await port.setSignals({ dataTerminalReady: false, requestToSend: false });
  await sleep(250);
  await port.setSignals({ dataTerminalReady: true, requestToSend: true });
  await sleep(50);
}

/**
 * Open port at given baud rate WITHOUT reset (for Serial Monitor).
 * @param {number} baudRate
 */
export async function openForMonitor(baudRate) {
  if (!port) throw new Error("No serial port selected.");

  if (portOpen || (port && (port.readable || port.writable))) {
    await forceClose();
    await sleep(150);
  }

  const isApp = window.flutter_inappwebview || 
                (window.parent && window.parent.flutter_inappwebview);
  if (isApp) {
    const handler = window.flutter_inappwebview?.callHandler || 
                    window.parent?.flutter_inappwebview?.callHandler;
    if (handler) {
      const success = await handler("openPort", { baudRate });
      if (!success) throw new Error("Failed to open serial port natively.");
      portOpen = true;

      // Set global callback from Dart
      const win = window.flutter_inappwebview ? window : window.parent;
      win.onSerialDataFromDart = (bytes) => {
        if (keepReading) {
          for (const byte of bytes) rxBuffer.push(byte);
        }
      };

      rxBuffer = [];
      keepReading = true;
      return;
    }
  }

  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      await port.open({ baudRate });
      portOpen = true;
      break;
    } catch (err) {
      if (attempt === 1) {
        await forceClose();
        await sleep(300);
      } else {
        portOpen = false;
        throw err;
      }
    }
  }

  rxBuffer = [];
  keepReading = true;
  readLoopPromise = backgroundReadLoop();
}

export function getStreams() {
  if (!port || !portOpen) throw new Error('Serial port is not open');

  const isApp = window.flutter_inappwebview || 
                (window.parent && window.parent.flutter_inappwebview);
  if (isApp) {
    rxBuffer = [];
    keepReading = true;
    
    const handler = window.flutter_inappwebview?.callHandler || 
                    window.parent?.flutter_inappwebview?.callHandler;
    writer = {
      write: async (bytes) => {
        const bytesList = Array.from(bytes);
        if (handler) {
          await handler("writeBytes", bytesList);
        }
      },
      releaseLock: () => {
        writer = null;
      }
    };
    return { reader: {}, writer };
  }

  if (!port.readable || !port.writable) throw new Error('Serial port streams unavailable');

  rxBuffer = [];
  writer = port.writable.getWriter();

  keepReading = true;
  readLoopPromise = backgroundReadLoop();

  return { reader: {}, writer };
}

export async function releaseStreams() {
  keepReading = false;

  const isApp = window.flutter_inappwebview || 
                (window.parent && window.parent.flutter_inappwebview);
  if (isApp) {
    writer = null;
    return;
  }

  if (reader) {
    try { await reader.cancel(); } catch (_) {}
    try { reader.releaseLock(); } catch (_) {}
    reader = null;
  }
  if (writer) {
    try { writer.releaseLock(); } catch (_) {}
    writer = null;
  }

  if (readLoopPromise) {
    await Promise.race([
      readLoopPromise,
      new Promise(resolve => setTimeout(resolve, 100))
    ]);
    readLoopPromise = null;
  }
}

export async function closePort() {
  await releaseStreams();

  const isApp = window.flutter_inappwebview || 
                (window.parent && window.parent.flutter_inappwebview);
  if (isApp) {
    const handler = window.flutter_inappwebview?.callHandler || 
                    window.parent?.flutter_inappwebview?.callHandler;
    if (handler) {
      try { await handler("closePort"); } catch (_) {}
    }
    portOpen = false;
    return;
  }

  if (port && portOpen) {
    try { await port.close(); } catch (err) {
      console.warn('Port close warning:', err.message);
    }
  }
  portOpen = false;
}

export async function forceClose() {
  stopMonitor();
  try { await releaseStreams(); } catch (_) {}

  const isApp = window.flutter_inappwebview || 
                (window.parent && window.parent.flutter_inappwebview);
  if (isApp) {
    const handler = window.flutter_inappwebview?.callHandler || 
                    window.parent?.flutter_inappwebview?.callHandler;
    if (handler) {
      try { await handler("closePort"); } catch (_) {}
    }
    portOpen = false;
    return;
  }

  if (port) {
    try { await port.close(); } catch (_) {}
  }
  portOpen = false;
}

/**
 * Disconnect entirely — close and forget port.
 */
export async function disconnect() {
  await forceClose();
  port = null;
}

// ═══════════════════════════════════════
// Low-level Read/Write (for STK500)
// ═══════════════════════════════════════

/**
 * Write raw bytes to the port.
 * @param {WritableStreamDefaultWriter} w
 * @param {number[]} data
 */
export async function serialWrite(w, data) {
  await w.write(new Uint8Array(data));
}

/**
 * Read exactly `length` bytes with timeout, from the rxBuffer.
 * This polls the background read loop buffer (proven reliable pattern).
 * @param {object} _r - unused reader placeholder
 * @param {number} length
 * @param {number} timeoutMs
 * @returns {Promise<Uint8Array>}
 */
export async function serialRead(_r, length, timeoutMs = 400) {
  const result = new Uint8Array(length);
  let bytesRead = 0;
  const deadline = Date.now() + timeoutMs;

  while (bytesRead < length) {
    if (rxBuffer.length > 0) {
      result[bytesRead] = rxBuffer.shift();
      bytesRead++;
      continue;
    }

    if (Date.now() > deadline) {
      throw new Error(`Serial read timeout: expected ${length} bytes, got ${bytesRead}`);
    }

    await sleep(2);
  }

  return result;
}

/**
 * Drain all currently buffered RX bytes (non-blocking).
 * @returns {Uint8Array}
 */
export function drainRxBuffer() {
  if (rxBuffer.length === 0) return new Uint8Array(0);
  return new Uint8Array(rxBuffer.splice(0, rxBuffer.length));
}

// ═══════════════════════════════════════
// Serial Monitor (text streaming)
// ═══════════════════════════════════════

let monitorInterval = null;

/**
 * Start streaming decoded text from the port to a callback.
 * @param {function(string)} onData
 */
export function startMonitor(onData) {
  if (monitorInterval) clearInterval(monitorInterval);
  if (!port || !portOpen) return;

  const decoder = new TextDecoder("utf-8", { fatal: false });

  monitorInterval = setInterval(() => {
    const bytes = drainRxBuffer();
    if (bytes.length === 0) return;

    const text = decoder.decode(bytes, { stream: true });
    onData(text);
  }, 40);
}

/**
 * Stop the serial monitor stream.
 */
export function stopMonitor() {
  if (monitorInterval) {
    clearInterval(monitorInterval);
    monitorInterval = null;
  }
}

// ═══════════════════════════════════════
// Internal Helpers
// ═══════════════════════════════════════

/**
 * Background read loop — continuously reads from the port
 * and pushes bytes into rxBuffer for serialRead() to consume.
 */
async function backgroundReadLoop() {
  while (port.readable && keepReading) {
    reader = port.readable.getReader();
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        if (value) {
          for (let i = 0; i < value.length; i++) {
            rxBuffer.push(value[i]);
          }
        }
      }
    } catch (_) {
      // Stream aborted on cancel
    } finally {
      reader.releaseLock();
      reader = null;
    }
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
