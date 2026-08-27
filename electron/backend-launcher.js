// electron/backend-launcher.js
// Spawns and manages the embedded Arduino Compile & Bridge Server

const { spawn } = require('child_process');
const path = require('path');
const http = require('http');
const fs = require('fs');

class BackendLauncher {
  constructor(app) {
    this.app = app;
    this.process = null;
    this.port = 5000;
    this.isRunning = false;
  }

  getBackendPath() {
    // In packaged app, extraResources copies arduino-server to process.resourcesPath
    if (this.app.isPackaged) {
      return path.join(process.resourcesPath, 'arduino-server');
    }
    // In dev mode, use project root arduino-server folder
    return path.join(__dirname, '..', 'arduino-server');
  }

  getPythonExecutable() {
    if (process.platform === 'win32') {
      return 'python.exe';
    }
    return 'python3';
  }

  async checkServerHealth() {
    return new Promise((resolve) => {
      const req = http.get(`http://127.0.0.1:${this.port}/status`, { timeout: 1500 }, (res) => {
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
    // 1. Check if server is already running on port 5000
    const alreadyUp = await this.checkServerHealth();
    if (alreadyUp) {
      console.log('[BackendLauncher] Compiler server already running on port', this.port);
      this.isRunning = true;
      return true;
    }

    const backendDir = this.getBackendPath();
    const serverScript = path.join(backendDir, 'server.py');
    const pythonExe = this.getPythonExecutable();

    console.log(`[BackendLauncher] Launching embedded server: ${pythonExe} ${serverScript} (cwd: ${backendDir})`);

    const env = {
      ...process.env,
      PYTHONUNBUFFERED: '1',
      PORT: String(this.port)
    };

    try {
      this.process = spawn(pythonExe, [serverScript], {
        cwd: backendDir,
        env,
        stdio: ['ignore', 'pipe', 'pipe']
      });

      this.process.stdout.on('data', (data) => {
        console.log(`[Backend Server] ${data.toString().trim()}`);
      });

      this.process.stderr.on('data', (data) => {
        console.error(`[Backend Server Error] ${data.toString().trim()}`);
      });

      this.process.on('close', (code) => {
        console.log(`[Backend Server] Process exited with code ${code}`);
        this.isRunning = false;
        this.process = null;
      });

      // Poll until ready (up to 15 seconds)
      const maxRetries = 30;
      for (let i = 0; i < maxRetries; i++) {
        await new Promise(r => setTimeout(r, 500));
        const ready = await this.checkServerHealth();
        if (ready) {
          console.log('[BackendLauncher] Embedded compiler server is ready & responsive!');
          this.isRunning = true;
          return true;
        }
      }

      console.warn('[BackendLauncher] Server did not respond within timeout, proceeding anyway.');
      return false;
    } catch (err) {
      console.error('[BackendLauncher] Failed to spawn backend process:', err);
      return false;
    }
  }

  stop() {
    if (this.process) {
      console.log('[BackendLauncher] Gracefully terminating embedded server...');
      try {
        if (process.platform === 'win32') {
          spawn('taskkill', ['/pid', this.process.pid, '/f', '/t']);
        } else {
          this.process.kill('SIGTERM');
        }
      } catch (e) {
        console.error('[BackendLauncher] Error stopping server:', e);
      }
      this.process = null;
      this.isRunning = false;
    }
  }
}

module.exports = BackendLauncher;
