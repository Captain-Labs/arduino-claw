// modules/flasher.js — STK500v1 Flash Protocol for Arduino Uno (ATmega328P)
// Directly modeled on the proven avrgirl-arduino stk500 implementation

import { serialWrite, serialRead, drainRxBuffer } from './serial.js';

// ─── Protocol constants (matching STK500 statics.js) ─────────────────────────

const CMD = {
  GET_SYNC:      0x30,
  SET_DEVICE:    0x42,
  ENTER_PROGMODE:0x50,
  LEAVE_PROGMODE:0x51,
  LOAD_ADDRESS:  0x55,
  PROG_PAGE:     0x64,
  READ_SIGN:     0x75,
  CRC_EOP:       0x20,
};

const RESP = {
  INSYNC: 0x14,
  OK:     0x10,
  NOSYNC: 0x15,
};

const BOARD = {
  name: 'Arduino Uno',
  baudRate: 115200,
  signature: [0x1e, 0x95, 0x0f],
  pageSize: 128,
  timeout: 400,
};

const OK_RESPONSE = new Uint8Array([RESP.INSYNC, RESP.OK]);

// ─── Intel HEX Parser ────────────────────────────────────────────────────────

/**
 * Parse an Intel HEX string into a binary Uint8Array.
 * Supports record types: Data (00), EOF (01),
 * Extended Segment Address (02), Extended Linear Address (04).
 * @param {string} hexStr
 * @returns {Uint8Array}
 */
export function parseIntelHex(hexStr) {
  const lines = hexStr.trim().split('\n').map(l => l.trim()).filter(l => l.startsWith(':'));

  if (lines.length === 0) {
    throw new Error('No valid Intel HEX records found');
  }

  let buf = new Uint8Array(32768);
  let bufLen = 0;
  let highAddr = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (line.length < 11) {
      throw new Error(`Intel HEX line ${i + 1} too short: "${line}"`);
    }

    const byteCount = parseInt(line.substr(1, 2), 16);
    const address = parseInt(line.substr(3, 4), 16);
    const recType = parseInt(line.substr(7, 2), 16);
    const dataHex = line.substr(9, byteCount * 2);

    // Verify checksum
    let sum = 0;
    for (let j = 1; j < line.length; j += 2) {
      sum += parseInt(line.substr(j, 2), 16);
    }
    if ((sum & 0xff) !== 0) {
      throw new Error(`Intel HEX checksum error on line ${i + 1}`);
    }

    switch (recType) {
      case 0x00: {
        const absAddr = highAddr + address;
        for (let j = 0; j < byteCount; j++) {
          const b = parseInt(dataHex.substr(j * 2, 2), 16);
          const writeAddr = absAddr + j;
          if (writeAddr >= buf.length) {
            const newBuf = new Uint8Array(buf.length * 2);
            newBuf.set(buf);
            buf = newBuf;
          }
          buf[writeAddr] = b;
          bufLen = Math.max(bufLen, writeAddr + 1);
        }
        break;
      }
      case 0x01:
        return buf.slice(0, bufLen);
      case 0x02:
        highAddr = parseInt(dataHex, 16) << 4;
        break;
      case 0x04:
        highAddr = parseInt(dataHex, 16) << 16;
        break;
      case 0x03:
      case 0x05:
        break;
      default:
        throw new Error(`Unknown Intel HEX record type 0x${recType.toString(16)} on line ${i + 1}`);
    }
  }

  if (bufLen > 0) return buf.slice(0, bufLen);
  throw new Error('Intel HEX data contained no data records');
}

// ─── STK500v1 Protocol Commands ──────────────────────────────────────────────

/**
 * Send a command, auto-appending CRC_EOP, and verify the response.
 * Matches avrgirl's sendCommand.js exactly.
 */
async function sendCommand(writer, reader, cmdData, expectedData, expectedLength, timeoutMs) {
  const packet = new Uint8Array([...cmdData, CMD.CRC_EOP]);
  await serialWrite(writer, Array.from(packet));

  const len = expectedData ? expectedData.length : expectedLength;
  const result = await serialRead(reader, len, timeoutMs);

  if (expectedData) {
    for (let i = 0; i < expectedData.length; i++) {
      if (result[i] !== expectedData[i]) {
        throw new Error(`Response mismatch: ${Array.from(result).map(b => '0x' + b.toString(16)).join(' ')}`);
      }
    }
  }

  return result;
}

/**
 * Recursive sync batch attempt matching avrgirl/stk500.
 */
async function syncBatch(writer, reader, attempts, timeoutMs) {
  for (let i = 1; i <= attempts; i++) {
    try {
      await sendCommand(writer, reader, [CMD.GET_SYNC], OK_RESPONSE, 2, timeoutMs);
      return;
    } catch (err) {
      if (i === attempts) throw err;
    }
  }
}

/**
 * Master sync: 3 batches of 3 attempts (9 total).
 */
async function sync(writer, reader, log) {
  const timeoutMs = BOARD.timeout;
  log(5, 'Syncing with bootloader…');

  // Purge any transient serial printing bytes before initiating handshake
  await new Promise(r => setTimeout(r, 150));
  try {
    drainRxBuffer();
  } catch (_) {}

  try {
    await syncBatch(writer, reader, 3, timeoutMs);
  } catch (_) {
    log(8, 'Sync retry batch 2…');
    try {
      await syncBatch(writer, reader, 3, timeoutMs);
    } catch (_) {
      log(10, 'Sync retry batch 3…');
      try {
        await syncBatch(writer, reader, 3, timeoutMs);
      } catch (_) {
        throw new Error('Could not sync with bootloader after 9 attempts. Try pressing the reset button.');
      }
    }
  }

  log(12, 'Bootloader sync OK');
}

/**
 * Verify device signature. Expects [INSYNC, sig1, sig2, sig3, OK].
 */
async function verifySignature(writer, reader, log) {
  log(14, 'Verifying device signature…');

  const expected = new Uint8Array([RESP.INSYNC, ...BOARD.signature, RESP.OK]);
  await sendCommand(writer, reader, [CMD.READ_SIGN], expected, 5, BOARD.timeout);

  log(16, `Device: ATmega328P (${BOARD.signature.map(b => '0x' + b.toString(16)).join(' ')})`);
}

/**
 * SET_DEVICE with 20 zero padding bytes (matching avrgirl).
 */
async function setOptions(writer, reader, log) {
  log(17, 'Setting device options…');
  const cmd = [CMD.SET_DEVICE, ...new Array(20).fill(0)];
  await sendCommand(writer, reader, cmd, OK_RESPONSE, 2, BOARD.timeout);
}

/**
 * Enter programming mode.
 */
async function enterProgrammingMode(writer, reader, log) {
  log(18, 'Entering programming mode…');
  await sendCommand(writer, reader, [CMD.ENTER_PROGMODE], OK_RESPONSE, 2, BOARD.timeout);
}

/**
 * Load address (word address) for page flashing.
 */
async function loadAddress(writer, reader, addr) {
  const low = addr & 0xff;
  const high = (addr >> 8) & 0xff;
  await sendCommand(writer, reader, [CMD.LOAD_ADDRESS, low, high], OK_RESPONSE, 2, BOARD.timeout);
}

/**
 * Flash all pages — matches avrgirl page-by-page upload exactly.
 */
async function uploadPages(writer, reader, hexBinary, log) {
  let pageaddr = 0;
  const pageSize = BOARD.pageSize;
  let pageCounter = 1;
  const totalPages = Math.ceil(hexBinary.length / pageSize);

  log(20, `Flashing ${totalPages} pages (${hexBinary.length} bytes)…`);

  while (pageaddr < hexBinary.length) {
    const start = pageaddr;
    const end = Math.min(start + pageSize, hexBinary.length);
    const writeBytes = hexBinary.slice(start, end);

    // 1. loadAddress (word address = byte address >> 1)
    const useaddr = pageaddr >> 1;
    await loadAddress(writer, reader, useaddr);

    // 2. Program page: CMD_STK_PROG_PAGE, size_high, size_low, 'F', data..., CRC_EOP
    const sizeLow = writeBytes.length & 0xff;
    const sizeHigh = (writeBytes.length >> 8) & 0xff;

    const packet = new Uint8Array([
      CMD.PROG_PAGE,
      sizeHigh,
      sizeLow,
      0x46, // 'F' = flash memory
      ...writeBytes,
      CMD.CRC_EOP,
    ]);

    await serialWrite(writer, Array.from(packet));
    const result = await serialRead(reader, 2, BOARD.timeout);
    if (result[0] !== RESP.INSYNC || result[1] !== RESP.OK) {
      throw new Error(`Flash failed at page ${pageCounter}/${totalPages}`);
    }

    const percent = 20 + Math.round((pageCounter / totalPages) * 70);
    log(percent, `Flashing page ${pageCounter}/${totalPages}…`);

    pageaddr += writeBytes.length;
    pageCounter++;

    // Exact requested delay (matching avrgirl)
    await new Promise(r => setTimeout(r, 4));
  }
}

/**
 * Leave programming mode.
 */
async function leaveProgrammingMode(writer, reader, log) {
  log(95, 'Leaving programming mode…');
  await sendCommand(writer, reader, [CMD.LEAVE_PROGMODE], OK_RESPONSE, 2, BOARD.timeout);
}

// ─── Main Flash Function ─────────────────────────────────────────────────────

/**
 * Flash an Intel HEX string to the Arduino Uno via STK500v1.
 *
 * This function manages the full lifecycle:
 * open port → DTR reset → sync → verify → program → leave → close
 *
 * @param {string} hexString - Intel HEX content
 * @param {object} serial - The serial module (imported serial.js)
 * @param {function(number, string)} onProgress - Progress callback (percent, message)
 */
export async function flashHex(hexString, serial, onProgress = () => {}) {
  onProgress(0, 'Parsing HEX file…');

  // 1. Parse HEX → binary
  let binary;
  try {
    binary = parseIntelHex(hexString);
  } catch (err) {
    throw new Error(`HEX parse error: ${err.message}`);
  }

  if (!binary || binary.length === 0) {
    throw new Error('HEX file produced no binary data');
  }

  onProgress(2, `Binary: ${binary.length} bytes, ${Math.ceil(binary.length / BOARD.pageSize)} pages`);

  // 2. Open port at bootloader baud + DTR reset
  onProgress(3, `Opening serial port at ${BOARD.baudRate} baud…`);
  await serial.openAndReset(BOARD.baudRate, (msg) => {
    onProgress(4, msg);
  });

  // 3. Acquire streams
  const { reader, writer } = serial.getStreams();

  try {
    // 4. Sync with bootloader
    await sync(writer, reader, onProgress);

    // 5. Verify signature
    await verifySignature(writer, reader, onProgress);

    // 6. Set device options
    await setOptions(writer, reader, onProgress);

    // 7. Enter programming mode
    await enterProgrammingMode(writer, reader, onProgress);

    // 8. Flash all pages
    await uploadPages(writer, reader, binary, onProgress);

    // 9. Leave programming mode
    await leaveProgrammingMode(writer, reader, onProgress);

    onProgress(100, 'Flash complete!');
  } finally {
    // ALWAYS clean up streams and close port
    try { await serial.releaseStreams(); } catch (_) {}
    try { await serial.closePort(); } catch (_) {}
  }
}

export { BOARD };
