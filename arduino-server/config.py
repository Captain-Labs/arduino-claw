# config.py
# Configuration constants for the Arduino CLI Compilation Server - Hardened Production Version

# Path to arduino-cli. If in PATH, just the executable name works.
import os

ARDUINO_CLI_PATH = os.environ.get('ARDUINO_CLI_PATH', 'arduino-cli')
BASE_DIR = os.path.abspath(os.path.dirname(__file__))

# Ensure self-contained directories exist
for d in ['arduino_data', 'arduino_downloads', 'arduino_user']:
    os.makedirs(os.path.join(BASE_DIR, d), exist_ok=True)

ARDUINO_CLI_CONFIG_FILE = os.path.join(BASE_DIR, 'arduino-cli.yaml')
with open(ARDUINO_CLI_CONFIG_FILE, 'w') as f:
    f.write(f"""directories:
  data: {os.path.join(BASE_DIR, 'arduino_data')}
  downloads: {os.path.join(BASE_DIR, 'arduino_downloads')}
  user: {os.path.join(BASE_DIR, 'arduino_user')}
""")

ARDUINO_CLI_CMD = [ARDUINO_CLI_PATH, '--config-file', ARDUINO_CLI_CONFIG_FILE]

# Default and supported boards
DEFAULT_BOARD_FQBN = 'arduino:avr:uno'
SUPPORTED_BOARDS = {
    'uno': 'arduino:avr:uno',
    'nano': 'arduino:avr:nano',
    'mega': 'arduino:avr:mega',
    'leonardo': 'arduino:avr:leonardo',
    'micro': 'arduino:avr:micro',
    'pro': 'arduino:avr:pro',
    'diecimila': 'arduino:avr:diecimila',
    'unomini': 'arduino:avr:unomini',
    'unowifi': 'arduino:avr:unowifi',
    'ethernet': 'arduino:avr:ethernet',
    'bt': 'arduino:avr:bt',
    'lilypad': 'arduino:avr:lilypad',
    'LilyPadUSB': 'arduino:avr:LilyPadUSB',
    'yun': 'arduino:avr:yun',
    'esplora': 'arduino:avr:esplora',
    'gemma': 'arduino:avr:gemma',
    'chiwawa': 'arduino:avr:chiwawa',
    'robotControl': 'arduino:avr:robotControl',
    'robotMotor': 'arduino:avr:robotMotor',
    'circuitplay32u4cat': 'arduino:avr:circuitplay32u4cat',
    'esp32': 'esp32:esp32:esp32',
    'nodemcu-32s': 'esp32:esp32:nodemcu-32s',
    'esp32s3': 'esp32:esp32:esp32s3',
    'esp32c3': 'esp32:esp32:esp32c3',
    'esp32cam': 'esp32:esp32:esp32cam',
    'rpipico': 'rp2040:rp2040:rpipico',
    'rpipicow': 'rp2040:rp2040:rpipicow',
    'nodemcuv2': 'esp8266:esp8266:nodemcuv2',
    'd1_mini': 'esp8266:esp8266:d1_mini',
}

# Maximum flash storage size (in bytes) for supported boards
BOARD_FLASH_LIMITS = {
    'arduino:avr:uno': 32256,
    'arduino:avr:nano': 30720,
    'arduino:avr:mega': 253952,
    'arduino:avr:leonardo': 28672,
    'arduino:avr:micro': 28672,
    'arduino:avr:pro': 30720,
    'esp32:esp32:esp32': 1310720,
    'esp8266:esp8266:nodemcuv2': 1044464
}

# Limits and Timeouts
COMPILE_TIMEOUT_SEC = 60
MAX_QUEUE_SIZE = 20
MAX_CODE_LENGTH = 50000  # maximum sketch characters
CACHE_MAX_ENTRIES = 500

# Server Binding
SERVER_HOST = '0.0.0.0'
SERVER_PORT = 5000

# Prefix for temporary compilation directories
TEMP_DIR_PREFIX = 'arduino_compile_'

# ═══════════════════════════════════════
# PRODUCTION SECURITY ADDITIONS
# ═══════════════════════════════════════

# Request Size Limit (100KB)
MAX_CONTENT_LENGTH = 100 * 1024

# Security Hardening Blocked Patterns (restricted dangerous keywords)
BLOCKED_PATTERNS = [
    'system(',
    'exec(',
    'popen(',
    'fork(',
    '__asm',
    '#include "/etc',
    '#include "/proc',
    '#include "/sys',
    'FILE *',
    'fopen(',
]

# ═══════════════════════════════════════
# AUTO LIBRARY INSTALLER MAPPINGS
# ═══════════════════════════════════════

# Map header filenames to Arduino Library names
HEADER_TO_LIBRARY = {
    'Servo.h':                  'Servo',
    'DHT.h':                    'DHT sensor library',
    'DHT20.h':                  'DHT20',
    'Adafruit_NeoPixel.h':      'Adafruit NeoPixel',
    'Adafruit_SSD1306.h':       'Adafruit SSD1306',
    'Adafruit_GFX.h':           'Adafruit GFX Library',
    'Adafruit_TCS34725.h':      'Adafruit TCS34725',
    'Adafruit_VL53L0X.h':       'Adafruit VL53L0X',
    'Adafruit_NeoMatrix.h':     'Adafruit NeoMatrix',
    'NewPing.h':                'NewPing',
    'Encoder.h':                'Encoder',
    'RTClib.h':                 'RTClib',
    'AccelStepper.h':           'AccelStepper',
    'MPU6050_tockn.h':          'MPU6050_tockn',
    'RunningAverage.h':         'RunningAverage',
    'Wire.h':                   'Wire',
    'SPI.h':                    'SPI',
    'Stepper.h':                'Stepper',
    'LiquidCrystal_I2C.h':      'LiquidCrystal I2C',
    'LiquidCrystal.h':          'LiquidCrystal',
}

# Essential startup library lists used by the 16 block categories
ESSENTIAL_LIBRARIES = list(set(HEADER_TO_LIBRARY.values()))

# ═══════════════════════════════════════
# INTELLIGENT CACHING COMMON SKETCHES
# ═══════════════════════════════════════

COMMON_SKETCHES = [
    {
        "name": "blink_250",
        "board": "arduino:avr:uno",
        "code": "void setup() { pinMode(13, OUTPUT); }\nvoid loop() {\n  digitalWrite(13, HIGH); delay(250);\n  digitalWrite(13, LOW);  delay(250);\n}"
    },
    {
        "name": "blink_500",
        "board": "arduino:avr:uno",
        "code": "void setup() { pinMode(13, OUTPUT); }\nvoid loop() {\n  digitalWrite(13, HIGH); delay(500);\n  digitalWrite(13, LOW);  delay(500);\n}"
    },
    {
        "name": "blink_1000",
        "board": "arduino:avr:uno",
        "code": "void setup() { pinMode(13, OUTPUT); }\nvoid loop() {\n  digitalWrite(13, HIGH); delay(1000);\n  digitalWrite(13, LOW);  delay(1000);\n}"
    },
    {
        "name": "blink_2000",
        "board": "arduino:avr:uno",
        "code": "void setup() { pinMode(13, OUTPUT); }\nvoid loop() {\n  digitalWrite(13, HIGH); delay(2000);\n  digitalWrite(13, LOW);  delay(2000);\n}"
    },
    {
        "name": "empty_sketch",
        "board": "arduino:avr:uno",
        "code": "void setup(){} void loop(){}"
    }
]
