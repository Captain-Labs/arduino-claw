// electron/backend-launcher.js
// Manages the embedded Arduino Compile & Bridge Server
// Uses native Node.js ArduinoServer (zero external Python required) with fallback check

const http = require('http');
const path = require('path');
const ArduinoServer = require('./server');

class BackendLauncher {
  constructor(app) {
    this.app = app;
    this.port = 5000;
    const userDataDir = this.app ? this.app.getPath('userData') : null;
    this.server = new ArduinoServer({
      port: this.port,
      baseDir: path.resolve(__dirname, '..'),
      userDataDir
    });
    this.isRunning = false;
  }

  async checkServerHealth() {
    return new Promise((resolve) => {
      const req = http.get(`http://127.0.0.1:${this.port}/status`, { timeout: 1000 }, (res) => {
        if (res.statusCode === 200) {
          resolve(true);
        } else {
          resolve(false);
        }
      });
      req.on('error', () => resolve(false));
      req.on('timeout', () => {
        req.destroy();
        resolve(false);
      });
    });
  }

  async start() {
    // 1. Check if an external server is already running on port 5000
    const alreadyUp = await this.checkServerHealth();
    if (alreadyUp) {
      console.log(`[BackendLauncher] Compilation server already running on port ${this.port}`);
      this.isRunning = true;
      return true;
    }

    // 2. Start embedded native Node.js compiler server
    console.log(`[BackendLauncher] Starting embedded native compiler server on port ${this.port}...`);
    try {
      const started = await this.server.start();
      if (started) {
        console.log('[BackendLauncher] Embedded compiler server is UP and listening!');
        this.isRunning = true;
        return true;
      }
    } catch (err) {
      console.error('[BackendLauncher] Failed to start native server:', err);
    }

    // Double check health
    const healthy = await this.checkServerHealth();
    this.isRunning = healthy;
    return healthy;
  }

  stop() {
    if (this.server) {
      console.log('[BackendLauncher] Stopping embedded server...');
      this.server.stop();
      this.server = null;
      this.isRunning = false;
    }
  }

  getPorts() {
    if (this.server) {
      return this.server.getPorts();
    }
    return [];
  }

  compile(data = {}) {
    if (this.server) {
      return this.server.compileDirect(data.code, data.board || data.fqbn);
    }
    return { success: false, error: 'Compiler server not running' };
  }

  upload(data = {}) {
    if (this.server) {
      return this.server.uploadDirect(data.code, data.port, data.fqbn);
    }
    return { success: false, error: 'Compiler server not running' };
  }
}

module.exports = BackendLauncher;
