# Arduino CLI Compilation Server - Hardened Production Version

This is a production-ready, resource-scaling, self-updating, and security-hardened Arduino sketch compilation server.

## 1. Prerequisites

- **Python 3.10+**
- **Arduino CLI**
  - **Mac (Homebrew):**
    ```bash
    brew install arduino-cli
    ```
  - **Windows (PowerShell):**
    ```powershell
    Invoke-Expression (New-Object System.Net.WebClient).DownloadString('https://raw.githubusercontent.com/arduino/arduino-cli/master/install.ps1')
    ```
  - **Linux (Bash):**
    ```bash
    curl -fsSL https://raw.githubusercontent.com/arduino/arduino-cli/master/install.sh | sh
    sudo mv ./bin/arduino-cli /usr/local/bin/
    ```
- **arduino:avr platform core**
  - Download and install the AVR boards platform core:
    ```bash
    arduino-cli core update-index
    arduino-cli core install arduino:avr
    ```

## 2. Setup

- **Install dependencies:**
  ```bash
  pip install -r requirements.txt
  ```
- **Run the server:**
  ```bash
  python3 server.py
  ```

---

## 3. Advanced Production Architecture

### Library Auto-Install
The compilation engine features an **automatic missing library detector**.
- If a compilation fails with a missing header error (e.g. `fatal error: Servo.h: No such file or directory`), the server extracts the header, maps it to its registered Arduino library, automatically installs it via the CLI, and retries compilation exactly once.
- **Pre-installed Libraries** (installed automatically on server start):
  - `Servo`
  - `DHT sensor library`
  - `DHT20`
  - `Adafruit NeoPixel`
  - `Adafruit SSD1306`
  - `Adafruit GFX Library`
  - `NewPing`
  - `Encoder`
  - `RTClib`
  - `AccelStepper`
  - `MPU6050_tockn`
  - `Wire`
  - `RunningAverage`
  - `Adafruit TCS34725`
  - `Adafruit VL53L0X`
  - `Adafruit NeoMatrix`

### Daily Updates
A background daemon thread (`LibraryScheduler`) monitors and runs automated platform index updates and platform/library upgrades.
- Checks if updates are due on startup (by inspecting `last_update.txt`) and then executes every 24 hours:
  - `arduino-cli core update-index`
  - `arduino-cli lib update-index`
  - `arduino-cli lib upgrade` (upgrades all installed libraries to their latest versions)
  - `arduino-cli core upgrade` (upgrades the AVR core if updates are available)
- **Manual Trigger**: Submit a `POST` request to `/libraries/update-index`.

### Multi-User Capacity & Scaling
- **Dynamic Resource Scaling**: The server automatically calculates optimal compilation daemon worker threads using system memory and CPU core quantities at startup:
  $$\text{optimal\_workers} = \text{max}(1, \text{min}(\lfloor\text{Available RAM GB} / 0.18\rfloor, \text{CPU Count} - 1, 8))$$
- **IP-Based Concurrency Limit**: To ensure fair scheduling in shared environments, the server restricts each client IP address to a maximum of **2 concurrent compilation jobs** at any given time, returning standard `429 Rate Limit Exceeded` responses to offending clients.
- **Queue Priority & Wait Metrics**: Cache misses are routed to a **HIGH priority queue**, and library installs to a **LOW priority queue**. Responses return congestion statistics (`X-Queue-Position` and `X-Estimated-Wait-Seconds`) in response headers.

### Security Hardening
- **Payload Limits**: Requests are capped at a strict maximum of **100KB** (`MAX_CONTENT_LENGTH`), returning a `413 Payload Too Large` code.
- **Code Sanitization**: Sketches are scanned for unauthorized syntax patterns (`system(`, `exec(`, `popen(`, `__asm`, `#include "/etc`, etc.) and immediately rejected with a `400 Restricted Content` response.
- **Size Bounds**: Code must be between 10 and 50,000 characters. Null bytes are stripped.

---

## 4. Test the server

### ROUTE 1: GET `/health`
```bash
curl http://localhost:5000/health
```

### ROUTE 2: POST `/compile`
```bash
curl -X POST http://localhost:5000/compile \
  -H "Content-Type: application/json" \
  -d '{"code":"void setup(){pinMode(13,OUTPUT);}void loop(){digitalWrite(13,HIGH);delay(1000);digitalWrite(13,LOW);delay(1000);}", "board":"uno"}'
```

### ROUTE 3: GET `/stats`
```bash
curl http://localhost:5000/stats
```
**Expected Response:**
```json
{
  "uptime_seconds": 120,
  "total_compilations": 5,
  "successful_compilations": 5,
  "failed_compilations": 0,
  "cache_hits": 2,
  "cache_miss": 3,
  "cache_hit_rate": "40.0%",
  "auto_installs_performed": 0,
  "libraries_installed": 16,
  "active_workers": 0,
  "queue_size": 0,
  "last_library_update": "2026-06-02T07:05:34",
  "next_library_update": "2026-06-03T07:05:34",
  "common_sketches_cached": 5
}
```

### ROUTE 4: POST `/libraries/check`
```bash
curl -X POST http://localhost:5000/libraries/check \
  -H "Content-Type: application/json" \
  -d '{"headers": ["Servo.h", "NonExistent.h"]}'
```
**Expected Response:**
```json
{
  "available": ["Servo.h"],
  "missing": ["NonExistent.h"],
  "auto_installable": []
}
```

---

## 5. Production Deployment

For production-level VPS hosting, do not run Flask's built-in development server. Instead, use a production WSGI server. We support both **Waitress** (cross-platform, single-process thread-pool) and **Gunicorn** (Unix-only).

### Option A: Waitress (Recommended)
Waitress serves the application inside a multi-threaded pool in a single process, ensuring that background scheduler and cleanup threads execute exactly once without process forks:
```bash
cd arduino-server
python3 prod_server.py
```

### Option B: Gunicorn (Unix / Linux)
To avoid multiple workers running duplicate startup and background scheduler threads, run Gunicorn with `1` worker and specify thread-level concurrency:
```bash
cd arduino-server
gunicorn --workers=1 --threads=8 --bind 0.0.0.0:5000 server:app
```

---

## 6. GitHub Codespaces Testing

We have configured a `.devcontainer` to support zero-config testing inside GitHub Codespaces.

1. **Launch a Codespace** on the repository.
2. The environment automatically installs:
   - `arduino-cli` and `arduino:avr` platform core.
   - AVR compiler toolchains (`gcc-avr`, `binutils-avr`, `avr-libc`).
   - Python server dependencies from `requirements.txt`.
3. **Start the Backend Compilation Server**:
   ```bash
   cd arduino-server
   python3 prod_server.py
   ```
4. **Preview the IDE Frontend**:
   - In Codespaces, open the VS Code command palette and search for `Live Server: Open with Live Server` or run:
     ```bash
     python3 -m http.server 8000
     ```
   - Port `8000` (frontend) and `5000` (backend) will be automatically forwarded and exposed.
   - Access the IDE in your browser at `http://localhost:8000`.
   - Open the **Settings** (top right) in the Web UI and verify/change the Compiler Server URL to point to your forwarded backend (e.g. `http://localhost:5000`).
   - Drag some blocks (e.g. Servo), click **Verify**, and test the compilation server!

