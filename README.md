<div align="center">

# 🦞 Arduino Claw

### AI-Powered Arduino IDE with Zero-Config Embedded Compilation & Direct USB Web Serial Flashing

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Platform](https://img.shields.io/badge/Platform-macOS%20%7C%20Windows%20%7C%20Linux%20%7C%20Web-blueviolet)](#downloads)
[![Electron](https://img.shields.io/badge/Electron-29.x-47848F?logo=electron&logoColor=white)](#)
[![Arduino CLI](https://img.shields.io/badge/Arduino%20CLI-0.35.x-00979D?logo=arduino&logoColor=white)](#)

---

</div>

## 📥 Downloads (Latest Release)

Download the ready-to-run standalone desktop installer for your operating system from [**Releases → Assets**](https://github.com/Captain-Labs/arduino-claw/releases/latest):

| Operating System | Installer Format | Description |
| :--- | :--- | :--- |
| 🍏 **macOS** | [**`Arduino Claw-1.0.0-arm64.dmg`**](https://github.com/Captain-Labs/arduino-claw/releases/latest) | Apple Disk Image with drag-and-drop to `/Applications` |
| 🪟 **Windows** | [**`Arduino Claw Setup 1.0.0.exe`**](https://github.com/Captain-Labs/arduino-claw/releases/latest) | NSIS Setup Wizard with desktop & Start menu shortcuts |
| 🐧 **Linux** | [**`Arduino Claw-1.0.0.AppImage`**](https://github.com/Captain-Labs/arduino-claw/releases/latest) | Portable standalone executable (`chmod +x` and run) |

---

## ✨ Features

- 🤖 **Natural Language to Firmware**: Describe your electronics project in plain English, and Arduino Claw writes, verifies, and compiles full Arduino C++ sketches with built-in reasoning telemetry.
- ⚡ **Zero-Config Embedded Compiler Backend**: The Arduino CLI compiler runs seamlessly inside the app. No manual server launches, no terminal commands, and zero external installs.
- 🔌 **Direct USB Flashing & Web Serial**: Flash your compiled `.hex` sketches directly over USB via high-speed STK500v1 / Web Serial protocols right inside the app.
- 🎯 **Native Port Selection Modal**: Click **Connect** to open the in-app hardware device picker showing board names, USB VID:PID, and serial ports with instant refresh.
- 📚 **Arduino IDE 2.x Boards & Library Manager**: Search, install, and update thousands of open-source Arduino libraries and board index packages with a single click.
- 🔄 **Real-Time Serial Monitor**: Integrated terminal with auto-scrolling, baud rate control (300 to 115200), and auto-upload telemetry verification.
- 🌐 **Multi-Provider AI Engine**: Supports Google Gemini, Groq (Llama 3.3), Cerebras, SambaNova, OpenRouter, and local Ollama / LM Studio models.
- 🗂️ **Multi-Session Chat History & Tabbed Editor**: Save and organize sketches, double-click to rename chat sessions, and switch between code files with Monaco-powered syntax highlighting.

---

## 🚀 Quick Start

### 1. Launch the Desktop App
Download and run the installer for your OS. The internal compiler server starts automatically in the background.

### 2. Configure Your AI Provider
Click the ⚙️ **Settings** button in the top toolbar and enter your API key (e.g. Gemini, Groq, or OpenRouter).

### 3. Connect Your Arduino Board
1. Plug in your Arduino Uno (or compatible board) via USB.
2. Click **Connect** in the top navbar.
3. Select your port in the **Select Serial Port** modal and click **Connect Port**.

### 4. Create & Upload
Type a prompt such as:
> *"Blink the built-in LED every 500ms and print telemetry to Serial"*

Click **Send** — the AI generates the code, compiles it in the background, and flashes it directly to your board!

---

## 🛠️ Building from Source

### Prerequisites
- Node.js (v18 or later)
- npm

### Setup & Run
```bash
# 1. Clone the repository
git clone https://github.com/Captain-Labs/arduino-claw.git
cd arduino-claw

# 2. Install dependencies
npm install

# 3. Start desktop app in development mode
npm start
```

### Build Packages for Distribution
```bash
# Build macOS .dmg
npm run dist:mac

# Build Windows .exe setup wizard
npm run dist:win

# Build Linux .AppImage and .deb
npm run dist:linux

# Build all platforms
npm run dist:all
```

---

## 📋 System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Arduino Claw Desktop                     │
│  ┌───────────────────────┐       ┌───────────────────────┐  │
│  │   AI Chat Assistant   │       │ Monaco Code Editor    │  │
│  └───────────┬───────────┘       └───────────┬───────────┘  │
│              │                               │              │
│              ▼                               ▼              │
│  ┌───────────────────────────────────────────────────────┐  │
│  │     Web Serial USB Flasher & In-App Port Selector     │  │
│  └───────────────────────────┬───────────────────────────┘  │
└──────────────────────────────┼──────────────────────────────┘
                               │ HTTP / WebSocket (localhost:5000)
┌──────────────────────────────▼──────────────────────────────┐
│       Embedded Python & Arduino-CLI Backend Server          │
│  ┌───────────────────────────────────────────────────────┐  │
│  │  Arduino-CLI Core Engine • Library & Board Managers   │  │
│  └───────────────────────────────────────────────────────┘  │
└──────────────────────────────┬──────────────────────────────┘
                               │ USB / Serial
┌──────────────────────────────▼──────────────────────────────┐
│                    Physical Arduino Board                   │
└─────────────────────────────────────────────────────────────┘
```

---

## 📄 License

This project is licensed under the [MIT License](LICENSE) — Copyright © 2026 Captain Labs.
