<div align="center">

# 🦞 Arduino Claw

### Next-Generation AI Arduino IDE Desktop Application with Zero-Config Embedded Compilation & Direct USB Serial Flashing

[![GitHub Release](https://img.shields.io/github/v/release/Captain-Labs/arduino-claw?color=blue&label=Latest%20Release)](https://github.com/Captain-Labs/arduino-claw/releases/latest)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Platform](https://img.shields.io/badge/Platform-macOS%20%7C%20Windows%20%7C%20Linux-blueviolet)](#-downloads-latest-release)
[![Electron](https://img.shields.io/badge/Electron-29.x-47848F?logo=electron&logoColor=white)](#)
[![Arduino CLI](https://img.shields.io/badge/Arduino%20CLI-0.35.x-00979D?logo=arduino&logoColor=white)](#)
[![AI Engine](https://img.shields.io/badge/AI-Any%20LLM%20Supported-orange)](#-model-agnostic-ai-engine)

<p align="center">
  <b>Arduino Claw</b> is an open-source, AI-first desktop IDE that converts natural language prompts into production-ready Arduino C++ firmware, compiles sketches locally with an embedded zero-config compiler, and flashes microcontrollers directly over USB via high-speed serial protocols.
</p>

[**Download Installers**](#-downloads-latest-release) • [**Key Features**](#-key-features) • [**Supported Hardware**](#-tested--supported-hardware) • [**Architecture**](#-system-architecture) • [**FAQ**](#-frequently-asked-questions-faq)

---

</div>

## 📑 Table of Contents
- [📥 Downloads (Latest Release)](#-downloads-latest-release)
- [✨ Key Features](#-key-features)
- [⚡ Arduino Claw vs Traditional Arduino IDE](#-arduino-claw-vs-traditional-arduino-ide)
- [🔌 Tested & Supported Hardware](#-tested--supported-hardware)
- [🧠 Model-Agnostic AI Engine](#-model-agnostic-ai-engine)
- [🚀 Quick Start Guide](#-quick-start-guide)
- [🛠️ Building from Source](#️-building-from-source)
- [📋 System Architecture](#-system-architecture)
- [❓ Frequently Asked Questions (FAQ)](#-frequently-asked-questions-faq)
- [📄 License](#-license)

---

## 📥 Downloads (Latest Release)

Standalone, zero-dependency desktop installers for macOS, Windows, and Linux are available under [**Releases → Assets**](https://github.com/Captain-Labs/arduino-claw/releases/latest):

| Operating System | Package | Size | Architecture | Direct Download |
| :--- | :--- | :--- | :--- | :--- |
| 🍏 **macOS** | `Arduino.Claw-1.0.0-arm64.dmg` | **187.6 MB** | Apple Silicon (M1/M2/M3/M4) | [**Download DMG**](https://github.com/Captain-Labs/arduino-claw/releases/download/v1.0.0/Arduino.Claw-1.0.0-arm64.dmg) |
| 🪟 **Windows** | `Arduino.Claw.Setup.1.0.0.exe` | **103.5 MB** | Windows 10 / 11 (x64) | [**Download Setup EXE**](https://github.com/Captain-Labs/arduino-claw/releases/download/v1.0.0/Arduino.Claw.Setup.1.0.0.exe) |
| 🐧 **Linux** | `Arduino.Claw-1.0.0.AppImage` | **135.4 MB** | Linux x64 (Ubuntu, Debian, Fedora) | [**Download AppImage**](https://github.com/Captain-Labs/arduino-claw/releases/download/v1.0.0/Arduino.Claw-1.0.0.AppImage) |

*All releases are standalone and bundle their own background compilation engine. No separate Python or Arduino IDE installations are required.*

---

## ✨ Key Features

- 🤖 **Natural Language to Firmware**: Describe your electronics project, sensors, servos, displays, or robotics logic in plain conversational English. Arduino Claw generates verified, clean, non-blocking Arduino C++ code with comprehensive inline comments.
- ⚡ **Zero-Config Embedded Compilation Engine**: Built-in native Arduino CLI backend runs automatically inside the desktop app. No command-line tools, external compiler servers, or manual environment setup needed.
- 🔌 **Direct USB Flashing & Web Serial**: Flash compiled `.hex` sketches directly to your connected microcontroller over USB via high-speed STK500v1 / Web Serial protocols right inside the application window.
- 🎯 **Native Port Selection Modal**: Click **Connect** in the navbar to open an interactive hardware device picker displaying detected board models, USB VID:PID, and serial ports with instant auto-refresh.
- 🔄 **Integrated Real-Time Serial Monitor**: Monitor serial print output, debug sensors, and transmit commands with configurable baud rates (300 to 115200 baud) and auto-scrolling telemetry.
- 📚 **Arduino 2.x Library & Board Manager**: Search, download, and manage thousands of open-source Arduino libraries and third-party board definitions with one-click installation.
- 🧠 **Multi-Provider AI Intelligence**: Seamlessly switch between cloud providers (Google Gemini 1.5/2.0, Groq Llama 3.3, Cerebras, SambaNova, OpenRouter) or local private offline LLMs (Ollama, LM Studio).
- 🗂️ **Multi-Session Chat History & Tabbed Editor**: Save and organize sketches across sessions. Rename chats, view reasoning chains, and edit code with VS Code-grade Monaco syntax highlighting.

---

## ⚡ Arduino Claw vs Traditional Arduino IDE

| Feature | Standard Arduino IDE 2.x | Arduino Claw |
| :--- | :---: | :---: |
| **Conversational AI Code Assistant** | ❌ None / Plugin needed | ✅ **Built-in multi-model AI assistant** |
| **Natural Language to C++ Code** | ❌ Manual coding | ✅ **Instant prompt-to-sketch generation** |
| **Zero-Config Embedded Compiler** | ⚠️ Heavy separate setup | ✅ **Fully embedded, auto-starting backend** |
| **One-Click Direct USB Flashing** | ⚠️ Requires pre-configured port | ✅ **Interactive modal + auto-connect** |
| **Integrated Serial Monitor** | ✅ Basic serial monitor | ✅ **Telemetry-aware serial terminal** |
| **Offline Local LLM Support** | ❌ No | ✅ **Full Ollama & LM Studio integration** |
| **Lightweight App Bundle** | ⚠️ ~400 MB to 3+ GB | ✅ **Optimized ~100–180 MB installer** |

---

## 🔌 Tested & Supported Hardware
 
### ✅ Fully Tested & Verified
- **Arduino Uno R3** (ATmega328P — Native USB & CH340 / 16U2 serial bridges tested)
- **Standard USB-to-Serial Bridges** (CH340, CP2102, FT232R, PL2303)

### ⏳ Coming Soon (In Active Development)
- **Arduino Nano** (ATmega328P)
- **Arduino Mega 2560** (ATmega2560)
- **Arduino Leonardo & Micro** (ATmega32U4)
- **ESP32 & ESP32-S3** (Xtensa 32-bit dual-core)
- **ESP8266** (NodeMCU / Wemos D1 Mini)
- **Raspberry Pi Pico** (RP2040)

---

## 🧠 Model-Agnostic AI Engine

Arduino Claw is completely model-agnostic. You are not locked into any single AI provider or model architecture:

- **Any Cloud AI Provider**: Plug in your own API key for **Google Gemini**, **Groq**, **Cerebras**, **SambaNova**, **OpenRouter**, **OpenAI**, or **Anthropic**.
- **Any Local Offline Model**: Connect directly to your local **Ollama** or **LM Studio** endpoint. Run 100% private, zero-latency coding without an internet connection or subscription fees.
- **Choose Any Model**: Whether you prefer fast lightweight models or deep reasoning models, Arduino Claw works seamlessly with whatever model you choose.

---

## 🚀 Quick Start Guide

### 1. Download & Launch
Download the installer for your OS from [**Releases**](https://github.com/Captain-Labs/arduino-claw/releases/latest). Launch the app — the embedded compiler server starts automatically.

### 2. Configure Your AI Provider
Click the ⚙️ **Settings** button in the top toolbar. Enter your API key (e.g. Google Gemini, Groq, or OpenRouter), or toggle **Local Ollama** for offline coding.

### 3. Connect Your Board
1. Plug in your Arduino board via USB.
2. Click **Connect** in the top navigation bar.
3. Select your serial port in the modal and click **Connect Port**.

### 4. Generate & Flash
Type your project idea into the chat prompt, for example:
> *"Create an ultrasonic distance radar using an HC-SR04 sensor and an SG90 servo motor that sweeps 0 to 180 degrees and prints distances to the Serial Monitor."*

Click **Send** — Arduino Claw writes the code, compiles it in the background, and allows you to flash it straight to your board with a single click.

---

## 🛠️ Building from Source

### Prerequisites
- [Node.js](https://nodejs.org/) (v18.x or v20.x)
- npm (v9.x or later)
- Git

### Clone & Run Locally
```bash
# Clone the repository
git clone https://github.com/Captain-Labs/arduino-claw.git
cd arduino-claw

# Install dependencies
npm install

# Run the desktop app in development mode
npm start
```

### Packaging Installers
```bash
# Package for macOS (.dmg)
npm run dist:mac

# Package for Windows (.exe setup wizard)
npm run dist:win

# Package for Linux (.AppImage)
npm run dist:linux

# Package all target platforms
npm run dist:all
```

---

## 📋 System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Arduino Claw Desktop                     │
│  ┌───────────────────────┐       ┌───────────────────────┐  │
│  │   AI Chat Assistant   │       │ Monaco Code Editor    │  │
│  │ (Gemini/Groq/Ollama)  │       │ (Syntax Highlighting) │  │
│  └───────────┬───────────┘       └───────────┬───────────┘  │
│              │                               │              │
│              ▼                               ▼              │
│  ┌───────────────────────────────────────────────────────┐  │
│  │     Web Serial USB Flasher & In-App Port Selector     │  │
│  └───────────────────────────┬───────────────────────────┘  │
└──────────────────────────────┼──────────────────────────────┘
                               │ Local IPC / HTTP (localhost:5000)
┌──────────────────────────────▼──────────────────────────────┐
│       Embedded Python & Arduino-CLI Backend Server          │
│  ┌───────────────────────────────────────────────────────┐  │
│  │  Arduino-CLI Core Engine • Library & Board Managers   │  │
│  └───────────────────────────────────────────────────────┘  │
└──────────────────────────────┬──────────────────────────────┘
                               │ USB / Serial (STK500v1 / Baud 115200)
┌──────────────────────────────▼──────────────────────────────┐
│                    Physical Arduino Board                   │
│         (Uno / Nano / Mega / ESP32 / ESP8266 / RP2040)      │
└─────────────────────────────────────────────────────────────┘
```

---

## ❓ Frequently Asked Questions (FAQ)

### Can Arduino Claw be used without an internet connection?
Yes! You can connect Arduino Claw to a local **Ollama** or **LM Studio** instance running `codellama`, `deepseek-coder`, or `qwen2.5-coder`. Since the compilation engine runs locally on your machine, you can write, compile, and flash code 100% offline.

### Do I need to install the official Arduino IDE first?
No. Arduino Claw is completely standalone. It embeds its own compiler backend and board tools, eliminating the need to install Arduino IDE 2.x or any external toolchains.

### How does in-app USB flashing work?
Arduino Claw communicates with microcontrollers via native USB serial drivers and Web Serial protocols (STK500v1). It directly streams compiled binary hex files across the USB COM/serial port.

### Which operating systems are supported?
- **macOS**: Apple Silicon (M1, M2, M3, M4) and Intel x64 via Rosetta.
- **Windows**: Windows 10 and Windows 11 (64-bit).
- **Linux**: Ubuntu, Debian, Fedora, Arch Linux (via portable AppImage).

### Is Arduino Claw free and open source?
Yes, Arduino Claw is free, open source, and licensed under the permissive [MIT License](LICENSE).

---

## 📄 License

This project is licensed under the [MIT License](LICENSE) — Copyright © 2026 Captain Labs.
