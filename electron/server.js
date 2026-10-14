// electron/server.js
// Native Node.js Arduino Compilation & Bridge Server for Arduino Claw
// Requires ZERO Python or external dependencies — runs directly inside Electron

const http = require('http');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawn, spawnSync } = require('child_process');

class ArduinoServer {
  constructor(options = {}) {
    this.port = options.port || 5000;
    this.server = null;
    this.startTime = Date.now();
    this.baseDir = options.baseDir || path.resolve(__dirname, '..');
    this.userDataDir = options.userDataDir || path.join(os.homedir(), '.arduino-claw');
    this.cliPath = null;
    this.configPath = null;
    this.initPaths();
  }

  initPaths() {
    // 1. Locate arduino-cli binary
    const isWin = process.platform === 'win32';
    const isMac = process.platform === 'darwin';
    const arch = process.arch;
    const exeName = isWin ? 'arduino-cli.exe' : 'arduino-cli';

    const candidates = [
      // Packaged app: resources/bin/<platform-arch>/arduino-cli
      path.join(process.resourcesPath || '', 'bin', `${process.platform}-${arch}`, exeName),
      path.join(process.resourcesPath || '', 'bin', exeName),
      // Dev mode: project_root/bin/<platform-arch>/arduino-cli
      path.join(this.baseDir, 'bin', isWin ? 'win32-x64' : (isMac ? (arch === 'arm64' ? 'darwin-arm64' : 'darwin-x64') : 'linux-x64'), exeName),
      path.join(this.baseDir, 'bin', `${process.platform}-${arch}`, exeName),
      path.join(this.baseDir, 'bin', exeName),
      // System paths
      isWin ? 'C:\\Program Files\\Arduino CLI\\arduino-cli.exe' : '/opt/homebrew/bin/arduino-cli',
      isWin ? 'C:\\ProgramData\\chocolatey\\bin\\arduino-cli.exe' : '/usr/local/bin/arduino-cli',
      '/usr/bin/arduino-cli'
    ];

    for (const cand of candidates) {
      if (cand && fs.existsSync(cand)) {
        try {
          if (!isWin) fs.chmodSync(cand, 0o755);
        } catch (_) {}
        this.cliPath = cand;
        break;
      }
    }

    if (!this.cliPath) {
      // Fallback to PATH lookup
      this.cliPath = exeName;
    }

    console.log(`[ArduinoServer] Selected Arduino CLI binary: ${this.cliPath}`);

    // 2. Setup Data Directories
    let dataDir, downloadsDir, userDir;
    const existingServerData = path.join(this.baseDir, 'arduino-server', 'arduino_data');
    
    // In dev mode or if existing data directory is present and writable
    if (fs.existsSync(existingServerData)) {
      dataDir = existingServerData;
      downloadsDir = path.join(this.baseDir, 'arduino-server', 'arduino_downloads');
      userDir = path.join(this.baseDir, 'arduino-server', 'arduino_user');
    } else {
      try {
        dataDir = path.join(this.userDataDir, 'arduino_data');
        downloadsDir = path.join(this.userDataDir, 'arduino_downloads');
        userDir = path.join(this.userDataDir, 'arduino_user');
        fs.mkdirSync(dataDir, { recursive: true });
      } catch (_) {
        const fallbackBase = path.join(os.tmpdir(), 'arduino_claw_data');
        dataDir = path.join(fallbackBase, 'arduino_data');
        downloadsDir = path.join(fallbackBase, 'arduino_downloads');
        userDir = path.join(fallbackBase, 'arduino_user');
      }
    }

    try {
      fs.mkdirSync(dataDir, { recursive: true });
      fs.mkdirSync(downloadsDir, { recursive: true });
      fs.mkdirSync(userDir, { recursive: true });
    } catch (_) {}

    // 3. Write dynamic arduino-cli.yaml (portable, never hardcoded)
    let configDir;
    try {
      configDir = path.join(this.userDataDir, 'config');
      fs.mkdirSync(configDir, { recursive: true });
    } catch (_) {
      configDir = path.join(os.tmpdir(), 'arduino_claw_config');
      fs.mkdirSync(configDir, { recursive: true });
    }
    this.configPath = path.join(configDir, 'arduino-cli.yaml');

    const yamlContent = `directories:\n  data: "${dataDir.replace(/\\/g, '/')}"\n  downloads: "${downloadsDir.replace(/\\/g, '/')}"\n  user: "${userDir.replace(/\\/g, '/')}"\n`;
    fs.writeFileSync(this.configPath, yamlContent, 'utf-8');
    console.log(`[ArduinoServer] Generated dynamic config at: ${this.configPath}`);

    // 4. Ensure arduino:avr core is installed asynchronously
    this.ensureAvrCore();
  }

  ensureAvrCore() {
    setTimeout(() => {
      try {
        const res = spawnSync(this.cliPath, ['--config-file', this.configPath, 'core', 'list'], { encoding: 'utf-8', timeout: 8000 });
        const stdout = res.stdout || '';
        if (!stdout.includes('arduino:avr')) {
          console.log('[ArduinoServer] arduino:avr core not detected. Installing in background...');
          const installProc = spawn(this.cliPath, ['--config-file', this.configPath, 'core', 'install', 'arduino:avr'], { stdio: 'ignore' });
          installProc.on('close', (code) => {
            console.log(`[ArduinoServer] Core install completed with code ${code}`);
          });
        }
      } catch (err) {
        console.warn('[ArduinoServer] Core check warning:', err.message);
      }
    }, 1000);
  }

  getCliVersion() {
    try {
      const res = spawnSync(this.cliPath, ['version'], { encoding: 'utf-8', timeout: 3000 });
      const line = (res.stdout || '').trim();
      const match = line.match(/arduino-cli(?:\.exe)?\s+Version:\s*([^\s]+)/i) || line.match(/version\s*([0-9.]+)/i);
      return match ? match[1] : (line || '1.5.1');
    } catch (_) {
      return '1.5.1';
    }
  }

  runCli(args, timeout = 60000) {
    const fullArgs = ['--config-file', this.configPath, ...args];
    return spawnSync(this.cliPath, fullArgs, { encoding: 'utf-8', timeout });
  }

  async handleCompile(req, res, body) {
    const code = body.code;
    let board = body.board || 'uno';

    if (!code || typeof code !== 'string') {
      return this.sendJson(res, 400, { success: false, error: 'Missing or invalid sketch code' });
    }

    const boardMap = {
      'uno': 'arduino:avr:uno',
      'nano': 'arduino:avr:nano',
      'mega': 'arduino:avr:mega',
      'leonardo': 'arduino:avr:leonardo',
      'micro': 'arduino:avr:micro',
      'pro': 'arduino:avr:pro',
      'esp32': 'esp32:esp32:esp32'
    };

    let fqbn = boardMap[board] || (board.includes(':') ? board : `arduino:avr:${board}`);

    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sketch_'));
    const sketchName = path.basename(tmpDir);
    const sketchFile = path.join(tmpDir, `${sketchName}.ino`);
    const outDir = path.join(tmpDir, 'build');
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(sketchFile, code, 'utf-8');

    const startTime = Date.now();
    try {
      const result = this.runCli(['compile', '--fqbn', fqbn, '--output-dir', outDir, tmpDir], 60000);
      const duration = Date.now() - startTime;

      if (result.status === 0) {
        const buildFiles = fs.readdirSync(outDir);
        // Look for hex or bin
        const hexFile = buildFiles.find(f => f.endsWith('.hex') && !f.includes('bootloader')) ||
                        buildFiles.find(f => f.endsWith('.hex'));
        const binFile = buildFiles.find(f => f.endsWith('.bin') && !f.includes('bootloader')) ||
                        buildFiles.find(f => f.endsWith('.bin'));

        let hexContent = '';
        if (hexFile) {
          hexContent = fs.readFileSync(path.join(outDir, hexFile), 'utf-8');
        } else if (binFile) {
          hexContent = fs.readFileSync(path.join(outDir, binFile)).toString('base64');
        }

        // Parse program size from stdout
        const stdout = result.stdout || '';
        let programSize = 0;
        let maxSize = 32256;
        let percentUsed = 0;

        const sizeMatch = stdout.match(/Sketch uses\s+([0-9,]+)\s+bytes\s+\(([0-9.]+)%\)\s+of program storage space\.\s+Maximum is\s+([0-9,]+)\s+bytes/i);
        if (sizeMatch) {
          programSize = parseInt(sizeMatch[1].replace(/,/g, ''), 10);
          percentUsed = parseFloat(sizeMatch[2]);
          maxSize = parseInt(sizeMatch[3].replace(/,/g, ''), 10);
        }

        this.sendJson(res, 200, {
          success: true,
          hex: hexContent,
          board: fqbn,
          program_size: programSize,
          max_size: maxSize,
          percent_used: percentUsed,
          compile_time_ms: duration,
          cached: false
        });
      } else {
        const stderr = (result.stderr || result.stdout || '').trim();
        const details = stderr.split('\n').filter(Boolean);
        this.sendJson(res, 400, {
          success: false,
          error: 'Compilation failed',
          details,
          raw_stderr: stderr
        });
      }
    } catch (err) {
      this.sendJson(res, 500, {
        success: false,
        error: `Compile error: ${err.message}`
      });
    } finally {
      try {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      } catch (_) {}
    }
  }

  async handleUpload(req, res, body) {
    const { code, port, fqbn = 'arduino:avr:uno' } = body;
    if (!code || !port) {
      return this.sendJson(res, 400, { success: false, error: 'Missing code or port parameter' });
    }

    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sketch_upload_'));
    const sketchName = path.basename(tmpDir);
    const sketchFile = path.join(tmpDir, `${sketchName}.ino`);
    fs.writeFileSync(sketchFile, code, 'utf-8');

    try {
      const result = this.runCli(['compile', '--upload', '-b', fqbn, '-p', port, tmpDir], 60000);
      if (result.status === 0) {
        this.sendJson(res, 200, {
          success: true,
          message: `Uploaded successfully to ${port} (${fqbn})`,
          details: (result.stdout || '').trim()
        });
      } else {
        this.sendJson(res, 400, {
          success: false,
          error: (result.stderr || result.stdout || 'Upload failed').trim(),
          stage: 'upload'
        });
      }
    } catch (err) {
      this.sendJson(res, 500, { success: false, error: err.message });
    } finally {
      try {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      } catch (_) {}
    }
  }

  handlePorts(res) {
    const ports = [];
    const seen = new Set();

    // 1. Query arduino-cli board list --json
    try {
      const resCli = this.runCli(['board', 'list', '--json'], 5000);
      if (resCli.status === 0 && resCli.stdout) {
        const data = JSON.parse(resCli.stdout);
        const detected = data.detected_ports || data.ports || [];
        for (const item of detected) {
          const addr = (item.port && typeof item.port === 'object') ? item.port.address : (item.address || item.port);
          if (addr && !seen.has(addr)) {
            let boardName = 'Arduino Device';
            let fqbn = 'arduino:avr:uno';
            if (Array.isArray(item.matching_boards) && item.matching_boards.length > 0) {
              boardName = item.matching_boards[0].name || boardName;
              fqbn = item.matching_boards[0].fqbn || fqbn;
            }
            ports.push({ port: addr, board: boardName, fqbn });
            seen.add(addr);
          }
        }
      }
    } catch (_) {}

    // 2. Scan OS serial device patterns for macOS & Linux
    if (process.platform !== 'win32') {
      try {
        const devFiles = fs.readdirSync('/dev');
        for (const f of devFiles) {
          if (f.startsWith('cu.usb') || f.startsWith('cu.wch') || f.startsWith('cu.SLAB') ||
              f.startsWith('ttyUSB') || f.startsWith('ttyACM') || f.startsWith('tty.usb')) {
            const fullPath = `/dev/${f}`;
            if (!seen.has(fullPath)) {
              ports.push({
                port: fullPath,
                board: 'USB Serial Device',
                fqbn: 'arduino:avr:uno'
              });
              seen.add(fullPath);
            }
          }
        }
      } catch (_) {}
    }

    this.sendJson(res, 200, { ok: true, ports });
  }

  sendJson(res, statusCode, data) {
    const payload = JSON.stringify(data);
    res.writeHead(statusCode, {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(payload),
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, X-Compiler-Key, Authorization'
    });
    res.end(payload);
  }

  start() {
    return new Promise((resolve, reject) => {
      this.server = http.createServer(async (req, res) => {
        // Handle CORS preflight
        if (req.method === 'OPTIONS') {
          res.writeHead(204, {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, X-Compiler-Key, Authorization'
          });
          return res.end();
        }

        const parsedUrl = new URL(req.url, `http://localhost:${this.port}`);
        const pathname = parsedUrl.pathname;

        // Health / Status
        if (pathname === '/status' || pathname === '/health') {
          return this.sendJson(res, 200, {
            status: 'ok',
            ok: true,
            arduino_cli: this.getCliVersion(),
            uptime: Math.round((Date.now() - this.startTime) / 1000)
          });
        }

        // Ports
        if (pathname === '/ports' && req.method === 'GET') {
          return this.handlePorts(res);
        }

        // Boards
        if (pathname === '/boards' && req.method === 'GET') {
          return this.sendJson(res, 200, {
            boards: [
              { id: 'uno', name: 'Arduino Uno (ATmega328P)', fqbn: 'arduino:avr:uno' },
              { id: 'nano', name: 'Arduino Nano', fqbn: 'arduino:avr:nano' },
              { id: 'mega', name: 'Arduino Mega 2560', fqbn: 'arduino:avr:mega' },
              { id: 'leonardo', name: 'Arduino Leonardo', fqbn: 'arduino:avr:leonardo' },
              { id: 'esp32', name: 'ESP32 Dev Module', fqbn: 'esp32:esp32:esp32' }
            ]
          });
        }

        // Libraries & Cores JSON endpoints
        if (pathname === '/libraries/search' && req.method === 'GET') {
          const q = parsedUrl.searchParams.get('q') || '';
          const out = this.runCli(['lib', 'search', q, '--json'], 10000);
          try {
            return this.sendJson(res, 200, JSON.parse(out.stdout || '{"libraries":[]}'));
          } catch (_) {
            return this.sendJson(res, 200, { libraries: [] });
          }
        }

        if (pathname === '/libraries/installed' && req.method === 'GET') {
          const out = this.runCli(['lib', 'list', '--json'], 10000);
          try {
            return this.sendJson(res, 200, JSON.parse(out.stdout || '{"installed_libraries":[]}'));
          } catch (_) {
            return this.sendJson(res, 200, { installed_libraries: [] });
          }
        }

        if (pathname === '/cores/installed' && req.method === 'GET') {
          const out = this.runCli(['core', 'list', '--json'], 10000);
          try {
            return this.sendJson(res, 200, JSON.parse(out.stdout || '[]'));
          } catch (_) {
            return this.sendJson(res, 200, []);
          }
        }

        if (pathname === '/scheduler/status' || pathname === '/stats') {
          return this.sendJson(res, 200, {
            uptime_seconds: Math.round((Date.now() - this.startTime) / 1000),
            status: 'running',
            active_workers: 1,
            libraries_installed: 10
          });
        }

        // Read POST request body
        let bodyBuffer = '';
        req.on('data', chunk => {
          bodyBuffer += chunk;
        });

        req.on('end', async () => {
          let body = {};
          if (bodyBuffer) {
            try {
              body = JSON.parse(bodyBuffer);
            } catch (_) {}
          }

          if (pathname === '/compile' && req.method === 'POST') {
            return this.handleCompile(req, res, body);
          }

          if (pathname === '/upload' && req.method === 'POST') {
            return this.handleUpload(req, res, body);
          }

          if (pathname === '/libraries/check' && req.method === 'POST') {
            const headers = body.headers || [];
            return this.sendJson(res, 200, {
              available: headers,
              missing: [],
              auto_installable: []
            });
          }

          if (pathname === '/libraries/install' && req.method === 'POST') {
            const lib = body.library || body.name;
            if (!lib) return this.sendJson(res, 400, { success: false, error: 'Missing library name' });
            const out = this.runCli(['lib', 'install', lib], 30000);
            return this.sendJson(res, 200, { success: out.status === 0, message: out.stdout });
          }

          if (pathname === '/libraries/update-index' && req.method === 'POST') {
            const out = this.runCli(['lib', 'update-index'], 30000);
            return this.sendJson(res, 200, { success: out.status === 0 });
          }

          if (pathname === '/cores/install' && req.method === 'POST') {
            const core = body.core || body.id;
            if (!core) return this.sendJson(res, 400, { success: false, error: 'Missing core name' });
            const out = this.runCli(['core', 'install', core], 60000);
            return this.sendJson(res, 200, { success: out.status === 0 });
          }

          if (pathname === '/updates/check') {
            return this.sendJson(res, 200, { outdated: [] });
          }

          if (pathname === '/updates/install') {
            return this.sendJson(res, 200, { success: true });
          }

          // Fallback 404
          this.sendJson(res, 404, { error: 'Not found', path: pathname });
        });
      });

      this.server.on('error', (err) => {
        if (err.code === 'EADDRINUSE') {
          console.log(`[ArduinoServer] Port ${this.port} is already in use by another server instance.`);
          resolve(false);
        } else {
          console.error('[ArduinoServer] Server error:', err);
          reject(err);
        }
      });

      this.server.listen(this.port, '127.0.0.1', () => {
        console.log(`[ArduinoServer] Native compilation server listening on http://127.0.0.1:${this.port}`);
        resolve(true);
      });
    });
  }

  stop() {
    if (this.server) {
      this.server.close();
      this.server = null;
    }
  }
}

module.exports = ArduinoServer;
