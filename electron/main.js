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

let currentTargetPortAddress = null;

// Register IPC handlers
ipcMain.handle('set-target-serial-port', (event, portAddress) => {
  currentTargetPortAddress = portAddress;
  return true;
});

ipcMain.handle('get-serial-ports', async () => {
  if (backendLauncher) {
    return backendLauncher.getPorts();
  }
  return [];
});

ipcMain.handle('compile-sketch', async (event, data) => {
  if (backendLauncher) {
    return backendLauncher.compile(data);
  }
  return { success: false, error: 'Compiler server not running' };
});

ipcMain.handle('upload-sketch', async (event, data) => {
  if (backendLauncher) {
    return backendLauncher.upload(data);
  }
  return { success: false, error: 'Compiler server not running' };
});

function isRealUsbPort(p) {
  const name = (p.portName || '').toLowerCase();
  const display = (p.displayName || '').toLowerCase();

  // Strict blacklist: ignore bluetooth, debug console, virtual modems, mobile phones
  if (/bluetooth|debug-console|oppo|gms|wlan|modem|incoming|dialin/i.test(name) ||
      /bluetooth|debug-console|oppo|gms|wlan|modem|incoming|dialin/i.test(display)) {
    return false;
  }

  // Darwin (macOS): MUST be a USB serial / modem callout device
  if (process.platform === 'darwin') {
    return /usbserial|usbmodem|wchusb|slab|usb/i.test(name);
  }

  // Linux: MUST be ttyUSB or ttyACM
  if (process.platform === 'linux') {
    return /ttyusb|ttyacm/i.test(name);
  }

  // Windows: COM port (and must not be Bluetooth)
  if (process.platform === 'win32') {
    return /^com\d+/i.test(name);
  }

  return true;
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
      webSecurity: false,
      spellcheck: false
    }
  });

  // Enable Web Serial API in Chromium with targeted port matching
  mainWindow.webContents.session.on('select-serial-port', (event, portList, webContents, callback) => {
    event.preventDefault();
    if (!portList || portList.length === 0) {
      callback('');
      return;
    }

    if (currentTargetPortAddress) {
      const target = currentTargetPortAddress.toLowerCase().trim();
      const match = portList.find(p => {
        const name = (p.portName || '').toLowerCase();
        const display = (p.displayName || '').toLowerCase();
        return name.includes(target) || target.includes(name) || display.includes(target);
      });

      if (match) {
        currentTargetPortAddress = null;
        callback(match.portId);
        return;
      }
    }

    // Filter strictly for real USB microcontroller ports
    const validUsbPorts = portList.filter(isRealUsbPort);
    currentTargetPortAddress = null;

    if (validUsbPorts.length > 0) {
      callback(validUsbPorts[0].portId);
    } else {
      // NEVER auto-select Bluetooth or debug-console when no Arduino is connected!
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
