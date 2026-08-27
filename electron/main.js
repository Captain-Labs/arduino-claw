// electron/main.js — Electron Desktop Main Process
const { app, BrowserWindow, session, ipcMain, Menu } = require('electron');
const path = require('path');
const BackendLauncher = require('./backend-launcher');

let mainWindow = null;
let backendLauncher = null;

// Ensure single app instance
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1360,
    height: 860,
    minWidth: 980,
    minHeight: 640,
    backgroundColor: '#0c0d12',
    title: 'Arduino Claw',
    icon: path.join(__dirname, '..', 'build-resources', process.platform === 'win32' ? 'icon.ico' : 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      enableWebSQL: false,
      webSecurity: true,
      spellcheck: false
    }
  });

  // Enable Web Serial API in Chromium
  mainWindow.webContents.session.on('select-serial-port', (event, portList, webContents, callback) => {
    event.preventDefault();
    if (portList && portList.length > 0) {
      // Auto-select first matching Arduino / CH340 / USB Serial port or let user pick via in-app modal
      callback(portList[0].portId);
    } else {
      callback('');
    }
  });

  mainWindow.webContents.session.setPermissionCheckHandler((webContents, permission, requestingOrigin) => {
    if (permission === 'serial') return true;
    return false;
  });

  mainWindow.webContents.session.setDevicePermissionHandler((details) => {
    if (details.deviceType === 'serial') return true;
    return false;
  });

  // Load the application UI
  mainWindow.loadFile(path.join(__dirname, '..', 'index.html'));

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// App lifecycle
app.whenReady().then(async () => {
  backendLauncher = new BackendLauncher(app);
  
  // 1. Launch the embedded Arduino compiler server in the background
  try {
    await backendLauncher.start();
  } catch (err) {
    console.error('[Main] Error starting backend launcher:', err);
  }

  // 2. Open desktop window
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('before-quit', () => {
  if (backendLauncher) {
    backendLauncher.stop();
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
