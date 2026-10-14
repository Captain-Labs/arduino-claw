// modules/manager.js — Arduino IDE Boards & Library Manager
// Full parity with Arduino IDE 2.x Boards & Library Manager UI

const SERVER_URL = 'http://127.0.0.1:5000';

let activeTab = 'boards'; // 'boards' | 'libraries'
let searchDebounceTimer = null;
let currentItems = [];
let isInstallingMap = {};
let serverConnected = false;

// ═══════════════════════════════════════════════════════════════════
// Comprehensive Built-in Catalog for Boards (Cores & Platforms)
// ═══════════════════════════════════════════════════════════════════
const DEFAULT_BOARDS_CATALOG = [
  {
    id: 'arduino:avr',
    name: 'Arduino AVR Boards',
    maintainer: 'Arduino',
    latest_version: '1.8.8',
    versions: ['1.8.8', '1.8.7', '1.8.6', '1.8.5', '1.8.4', '1.8.3'],
    installed_version: '1.8.8',
    boards: [
      { name: 'Arduino Yún', fqbn: 'arduino:avr:yun' },
      { name: 'Arduino UNO', fqbn: 'arduino:avr:uno' },
      { name: 'Arduino UNO Mini', fqbn: 'arduino:avr:unomini' },
      { name: 'Arduino UNO WiFi', fqbn: 'arduino:avr:unowifi' },
      { name: 'Arduino Duemilanove or Diecimila', fqbn: 'arduino:avr:diecimila' },
      { name: 'Arduino Nano', fqbn: 'arduino:avr:nano' },
      { name: 'Arduino Mega or Mega 2560', fqbn: 'arduino:avr:mega' },
      { name: 'Arduino Mega ADK', fqbn: 'arduino:avr:megaADK' },
      { name: 'Arduino Leonardo', fqbn: 'arduino:avr:leonardo' },
      { name: 'Arduino Leonardo ETH', fqbn: 'arduino:avr:leonardoeth' },
      { name: 'Arduino Micro', fqbn: 'arduino:avr:micro' },
      { name: 'Arduino Esplora', fqbn: 'arduino:avr:esplora' },
      { name: 'Arduino Mini', fqbn: 'arduino:avr:mini' },
      { name: 'Arduino Ethernet', fqbn: 'arduino:avr:ethernet' },
      { name: 'Arduino Fio', fqbn: 'arduino:avr:fio' },
      { name: 'Arduino BT', fqbn: 'arduino:avr:bt' },
      { name: 'LilyPad Arduino USB', fqbn: 'arduino:avr:LilyPadUSB' },
      { name: 'LilyPad Arduino', fqbn: 'arduino:avr:lilypad' },
      { name: 'Arduino Pro or Pro Mini', fqbn: 'arduino:avr:pro' },
      { name: 'Arduino NG or older', fqbn: 'arduino:avr:atmegang' },
      { name: 'Arduino Robot Control', fqbn: 'arduino:avr:robotControl' },
      { name: 'Arduino Robot Motor', fqbn: 'arduino:avr:robotMotor' },
      { name: 'Arduino Gemma', fqbn: 'arduino:avr:gemma' },
      { name: 'Adafruit Circuit Playground', fqbn: 'arduino:avr:circuitplay32u4cat' },
      { name: 'Arduino Yún Mini', fqbn: 'arduino:avr:yunmini' },
      { name: 'Arduino Industrial 101', fqbn: 'arduino:avr:chiwawa' },
      { name: 'Linino One', fqbn: 'arduino:avr:one' }
    ],
    description: 'Boards included in this package: Arduino Uno, Arduino Leonardo, Arduino Mega, Arduino Nano, Arduino Pro, Arduino Mini, LilyPad, etc.',
    website: 'https://github.com/arduino/ArduinoCore-avr'
  },
  {
    id: 'esp32:esp32',
    name: 'Arduino ESP32 Boards',
    maintainer: 'Espressif Systems',
    latest_version: '2.0.14',
    versions: ['2.0.14', '2.0.13', '2.0.11', '2.0.9', '2.0.7'],
    installed_version: null,
    boards: [
      { name: 'ESP32 Dev Module', fqbn: 'esp32:esp32:esp32' },
      { name: 'NodeMCU-32S', fqbn: 'esp32:esp32:nodemcu-32s' },
      { name: 'ESP32-S3 Dev Module', fqbn: 'esp32:esp32:esp32s3' },
      { name: 'ESP32-C3 Dev Module', fqbn: 'esp32:esp32:esp32c3' },
      { name: 'AI Thinker ESP32-CAM', fqbn: 'esp32:esp32:esp32cam' },
      { name: 'ESP32-WROVER Module', fqbn: 'esp32:esp32:esp32wrover' }
    ],
    description: 'Boards included in this package: ESP32 Dev Module, Arduino Nano ESP32, ESP32-WROOM, ESP32-S3, NodeMCU-32S.',
    website: 'https://github.com/espressif/arduino-esp32'
  },
  {
    id: 'esp8266:esp8266',
    name: 'ESP8266 Community Boards',
    maintainer: 'ESP8266 Community',
    latest_version: '3.1.2',
    versions: ['3.1.2', '3.1.1', '3.0.2', '2.7.4'],
    installed_version: null,
    boards: [
      { name: 'NodeMCU 1.0 (ESP-12E Module)', fqbn: 'esp8266:esp8266:nodemcuv2' },
      { name: 'WeMos D1 mini & D2 mini', fqbn: 'esp8266:esp8266:d1_mini' },
      { name: 'Generic ESP8266 Module', fqbn: 'esp8266:esp8266:generic' }
    ],
    description: 'Boards included in this package: NodeMCU 1.0, WeMos D1, Generic ESP8266 Module, Adafruit Feather HUZZAH.',
    website: 'https://github.com/esp8266/Arduino'
  },
  {
    id: 'arduino:samd',
    name: 'Arduino SAMD Boards (32-bits ARM Cortex-M0+)',
    maintainer: 'Arduino',
    latest_version: '1.8.13',
    versions: ['1.8.13', '1.8.12', '1.8.11', '1.8.9'],
    installed_version: null,
    boards: [
      { name: 'Arduino Zero (USB Port)', fqbn: 'arduino:samd:arduino_zero_edbg' },
      { name: 'Arduino MKR WiFi 1010', fqbn: 'arduino:samd:mkrwifi1010' },
      { name: 'Arduino Nano 33 IoT', fqbn: 'arduino:samd:nano_33_iot' },
      { name: 'Arduino MKR1000', fqbn: 'arduino:samd:mkr1000' }
    ],
    description: 'Boards included in this package: Arduino Zero, Arduino MKR1000, Arduino MKR WiFi 1010, Arduino Nano 33 IoT.',
    website: 'https://github.com/arduino/ArduinoCore-samd'
  },
  {
    id: 'arduino:megaavr',
    name: 'Arduino megaAVR Boards',
    maintainer: 'Arduino',
    latest_version: '1.8.8',
    versions: ['1.8.8', '1.8.7', '1.8.6'],
    installed_version: null,
    boards: [
      { name: 'Arduino Uno WiFi Rev2', fqbn: 'arduino:megaavr:uno2018' },
      { name: 'Arduino Nano Every', fqbn: 'arduino:megaavr:nona4809' }
    ],
    description: 'Boards included in this package: Arduino Uno WiFi Rev2, Arduino Nano Every.',
    website: 'https://github.com/arduino/ArduinoCore-megaavr'
  },
  {
    id: 'arduino:renesas_uno',
    name: 'Arduino UNO R4 Boards',
    maintainer: 'Arduino',
    latest_version: '1.2.0',
    versions: ['1.2.0', '1.1.0', '1.0.4'],
    installed_version: null,
    boards: [
      { name: 'Arduino UNO R4 Minima', fqbn: 'arduino:renesas_uno:minima' },
      { name: 'Arduino UNO R4 WiFi', fqbn: 'arduino:renesas_uno:unor4wifi' }
    ],
    description: 'Boards included in this package: Arduino UNO R4 Minima, Arduino UNO R4 WiFi (RA4M1 32-bit ARM Cortex-M4).',
    website: 'https://github.com/arduino/ArduinoCore-renesas'
  },
  {
    id: 'rp2040:rp2040',
    name: 'Raspberry Pi Pico / RP2040',
    maintainer: 'Earle F. Philhower, III',
    latest_version: '3.7.2',
    versions: ['3.7.2', '3.6.2', '3.5.0', '3.3.0'],
    installed_version: null,
    boards: [
      { name: 'Raspberry Pi Pico', fqbn: 'rp2040:rp2040:rpipico' },
      { name: 'Raspberry Pi Pico W', fqbn: 'rp2040:rp2040:rpipicow' }
    ],
    description: 'Boards included in this package: Raspberry Pi Pico, Raspberry Pi Pico W, Waveshare RP2040, Adafruit RP2040.',
    website: 'https://github.com/earlephilhower/arduino-pico'
  }
];

// ═══════════════════════════════════════════════════════════════════
// Comprehensive Built-in Catalog for Libraries
// ═══════════════════════════════════════════════════════════════════
const DEFAULT_LIBRARIES_CATALOG = [
  {
    name: 'Servo',
    author: 'Michael Margolis, Arduino',
    category: 'Device Control',
    latest_version: '1.2.2',
    versions: ['1.2.2', '1.2.1', '1.2.0', '1.1.8'],
    installed_version: '1.2.2',
    description: 'Allows an Arduino board to control RC (hobby) servo motors easily with PWM precision.',
    website: 'https://www.arduino.cc/reference/en/libraries/servo/'
  },
  {
    name: 'DHT sensor library',
    author: 'Adafruit',
    category: 'Sensors',
    latest_version: '1.4.6',
    versions: ['1.4.6', '1.4.4', '1.4.3', '1.4.2'],
    installed_version: '1.4.6',
    description: 'Arduino library for DHT11, DHT22, etc. Temperature & Humidity Sensors.',
    website: 'https://github.com/adafruit/DHT-sensor-library'
  },
  {
    name: 'Adafruit NeoPixel',
    author: 'Adafruit',
    category: 'Display',
    latest_version: '1.12.3',
    versions: ['1.12.3', '1.12.0', '1.11.0', '1.10.7'],
    installed_version: '1.12.3',
    description: 'Arduino library for controlling single-wire-based LED pixels and strip (WS2812B, WS2811, SK6812, etc.).',
    website: 'https://github.com/adafruit/Adafruit_NeoPixel'
  },
  {
    name: 'Adafruit SSD1306',
    author: 'Adafruit',
    category: 'Display',
    latest_version: '2.5.11',
    versions: ['2.5.11', '2.5.9', '2.5.7', '2.5.3'],
    installed_version: '2.5.11',
    description: 'SSD1306 OLED display library for monochromatic 128x64 and 128x32 OLEDs with I2C and SPI.',
    website: 'https://github.com/adafruit/Adafruit_SSD1306'
  },
  {
    name: 'Adafruit GFX Library',
    author: 'Adafruit',
    category: 'Display',
    latest_version: '1.11.10',
    versions: ['1.11.10', '1.11.9', '1.11.7', '1.11.5'],
    installed_version: '1.11.10',
    description: 'Core graphics library providing lines, circles, text, bitmaps, and UI primitives for all Adafruit displays.',
    website: 'https://github.com/adafruit/Adafruit-GFX-Library'
  },
  {
    name: 'RTClib',
    author: 'Adafruit',
    category: 'Timing',
    latest_version: '2.1.4',
    versions: ['2.1.4', '2.1.3', '2.1.1', '2.0.3'],
    installed_version: '2.1.4',
    description: 'A fork of Jeelabs fantastic real-time clock library for DS1307, DS3231, PCF8523, and PCF8563.',
    website: 'https://github.com/adafruit/RTClib'
  },
  {
    name: 'LiquidCrystal I2C',
    author: 'Frank de Brabander',
    category: 'Display',
    latest_version: '1.1.4',
    versions: ['1.1.4', '1.1.2', '1.1.0'],
    installed_version: null,
    description: 'Library for 16x2 and 20x4 HD44780 LCD displays connected through PCF8574 I2C adapter backpack.',
    website: 'https://github.com/johnrickman/LiquidCrystal_I2C'
  },
  {
    name: 'AccelStepper',
    author: 'Mike McCauley',
    category: 'Device Control',
    latest_version: '1.64.0',
    versions: ['1.64.0', '1.61.0', '1.59.0'],
    installed_version: '1.64.0',
    description: 'Advanced stepper motor library supporting acceleration, deceleration, simultaneous steppers, and sub-step microstepping.',
    website: 'https://www.airspayce.com/mikem/arduino/AccelStepper/'
  },
  {
    name: 'NewPing',
    author: 'Tim Eckel',
    category: 'Sensors',
    latest_version: '1.9.7',
    versions: ['1.9.7', '1.9.6', '1.9.4'],
    installed_version: '1.9.7',
    description: 'High-performance ultrasonic sensor library for HC-SR04, SRF05, Parallax Ping, and other sonar sensors.',
    website: 'https://bitbucket.org/teckel12/arduino-new-ping'
  },
  {
    name: 'Encoder',
    author: 'Paul Stoffregen',
    category: 'Signal Input/Output',
    latest_version: '1.4.4',
    versions: ['1.4.4', '1.4.3', '1.4.2'],
    installed_version: '1.4.4',
    description: 'Counts quadrature pulses from rotary and linear optical encoders with hardware interrupt support.',
    website: 'https://github.com/PaulStoffregen/Encoder'
  },
  {
    name: 'ArduinoJson',
    author: 'Benoit Blanchon',
    category: 'Data Processing',
    latest_version: '7.2.0',
    versions: ['7.2.0', '7.1.0', '7.0.4', '6.21.5'],
    installed_version: null,
    description: 'An elegant and efficient JSON library for Arduino and embedded C++ with zero-copy parsing.',
    website: 'https://arduinojson.org/'
  },
  {
    name: 'FastLED',
    author: 'Daniel Garcia',
    category: 'Display',
    latest_version: '3.7.8',
    versions: ['3.7.8', '3.7.0', '3.6.0'],
    installed_version: null,
    description: 'Multi-platform library for controlling addressable RGB and RGBW LED strips and matrices with fast color math.',
    website: 'https://fastled.io/'
  },
  {
    name: 'PubSubClient',
    author: "Nick O'Leary",
    category: 'Communication',
    latest_version: '2.8.0',
    versions: ['2.8.0', '2.7.0'],
    installed_version: null,
    description: 'A client library for simple publish/subscribe messaging with a server that supports MQTT protocol.',
    website: 'https://pubsubclient.knolleary.net/'
  },
  {
    name: 'Keypad',
    author: 'Mark Stanley, Alexander Brevig',
    category: 'Signal Input/Output',
    latest_version: '3.1.1',
    versions: ['3.1.1', '3.1.0'],
    installed_version: null,
    description: 'Keypad is a library for using matrix keypads with the Arduino.',
    website: 'https://github.com/NullCodeStudio/Arduino-Keypad-Library'
  },
  {
    name: 'WiFiNINA',
    author: 'Arduino',
    category: 'Communication',
    latest_version: '1.8.14',
    versions: ['1.8.14', '1.8.13', '1.8.12'],
    installed_version: null,
    description: 'Enables network connection (local and Internet) with the Arduino UNO WiFi Rev.2, Arduino NANO 33 IoT, and MKR WiFi 1010.',
    website: 'https://www.arduino.cc/en/Reference/WiFiNINA'
  },
  {
    name: 'MPU6050_tockn',
    author: 'Tockn',
    category: 'Sensors',
    latest_version: '1.5.2',
    versions: ['1.5.2', '1.5.0'],
    installed_version: '1.5.2',
    description: 'Arduino library for easy communication with MPU6050 6-axis gyroscope and accelerometer with angle calculation.',
    website: 'https://github.com/Tockn/MPU6050_tockn'
  },
  {
    name: 'Bounce2',
    author: 'Thomas O Fredericks',
    category: 'Signal Input/Output',
    latest_version: '2.71',
    versions: ['2.71', '2.70', '2.57'],
    installed_version: null,
    description: 'Debouncing library for Arduino and Wiring. Perfect for noisy mechanical switches and buttons.',
    website: 'https://github.com/thomasfredericks/Bounce2'
  }
];

export function initManager() {
  const overlay = document.getElementById('manager-overlay');
  const drawer = document.getElementById('manager-drawer');
  const closeBtn = document.getElementById('manager-close-btn');
  const boardsTabBtn = document.getElementById('tab-boards-btn');
  const librariesTabBtn = document.getElementById('tab-libraries-btn');
  const searchInput = document.getElementById('manager-search-input');
  const searchClear = document.getElementById('manager-search-clear');
  const typeFilter = document.getElementById('manager-type-filter');
  const topicFilter = document.getElementById('manager-topic-filter');

  const boardsNavBtn = document.getElementById('boards-manager-btn');
  const libraryNavBtn = document.getElementById('library-manager-btn');

  if (boardsNavBtn) {
    boardsNavBtn.addEventListener('click', () => openManager('boards'));
  }
  if (libraryNavBtn) {
    libraryNavBtn.addEventListener('click', () => openManager('libraries'));
  }

  if (closeBtn) closeBtn.addEventListener('click', closeManager);
  if (overlay) overlay.addEventListener('click', closeManager);

  if (boardsTabBtn) {
    boardsTabBtn.addEventListener('click', () => switchTab('boards'));
  }
  if (librariesTabBtn) {
    librariesTabBtn.addEventListener('click', () => switchTab('libraries'));
  }

  if (searchInput) {
    searchInput.addEventListener('input', () => {
      if (searchClear) searchClear.style.display = searchInput.value ? 'block' : 'none';
      clearTimeout(searchDebounceTimer);
      searchDebounceTimer = setTimeout(() => {
        loadItems();
      }, 200);
    });
  }

  if (searchClear) {
    searchClear.addEventListener('click', () => {
      if (searchInput) {
        searchInput.value = '';
        searchClear.style.display = 'none';
        loadItems();
      }
    });
  }

  if (typeFilter) {
    typeFilter.addEventListener('change', () => renderFilteredItems());
  }
  if (topicFilter) {
    topicFilter.addEventListener('change', () => renderFilteredItems());
  }

  // Keyboard shortcut (Escape to close)
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && drawer && drawer.classList.contains('open')) {
      closeManager();
    }
  });
}

export function openManager(tab = 'boards') {
  const overlay = document.getElementById('manager-overlay');
  const drawer = document.getElementById('manager-drawer');
  if (!drawer) return;

  switchTab(tab, false);
  if (overlay) overlay.classList.add('open');
  drawer.classList.add('open');
  loadItems();
}

export function closeManager() {
  const overlay = document.getElementById('manager-overlay');
  const drawer = document.getElementById('manager-drawer');
  if (overlay) overlay.classList.remove('open');
  if (drawer) drawer.classList.remove('open');
}

function switchTab(tab, reload = true) {
  activeTab = tab;
  const boardsTabBtn = document.getElementById('tab-boards-btn');
  const librariesTabBtn = document.getElementById('tab-libraries-btn');
  const topicFilterGroup = document.getElementById('manager-topic-filter-group');
  const searchInput = document.getElementById('manager-search-input');

  if (boardsTabBtn) boardsTabBtn.classList.toggle('active', tab === 'boards');
  if (librariesTabBtn) librariesTabBtn.classList.toggle('active', tab === 'libraries');

  if (topicFilterGroup) {
    topicFilterGroup.style.display = tab === 'libraries' ? 'flex' : 'none';
  }

  if (reload) {
    if (searchInput) searchInput.value = '';
    const searchClear = document.getElementById('manager-search-clear');
    if (searchClear) searchClear.style.display = 'none';
    loadItems();
  }
}

function getLocalDefaultCatalog(query = '') {
  const catalog = activeTab === 'boards' ? DEFAULT_BOARDS_CATALOG : DEFAULT_LIBRARIES_CATALOG;
  if (!query) return [...catalog];

  const q = query.toLowerCase();
  return catalog.filter(item => {
    if (activeTab === 'boards') {
      return (item.name || '').toLowerCase().includes(q) ||
             (item.id || '').toLowerCase().includes(q) ||
             (item.maintainer || '').toLowerCase().includes(q) ||
             (item.boards || []).some(b => (typeof b === 'string' ? b : (b.name || '')).toLowerCase().includes(q));
    } else {
      return (item.name || '').toLowerCase().includes(q) ||
             (item.author || '').toLowerCase().includes(q) ||
             (item.category || '').toLowerCase().includes(q) ||
             (item.description || '').toLowerCase().includes(q);
    }
  });
}

async function loadItems() {
  const searchInput = document.getElementById('manager-search-input');
  const query = searchInput ? searchInput.value.trim() : '';
  const loadingEl = document.getElementById('manager-loading');
  const listEl = document.getElementById('manager-list');

  // STEP 1: Immediately populate with built-in instant catalog (Zero Latency!)
  currentItems = getLocalDefaultCatalog(query);
  renderFilteredItems();

  // STEP 2: Asynchronously query the backend to sync live installed states & additional results
  try {
    const endpoint = activeTab === 'boards' 
      ? `${SERVER_URL}/cores/search?q=${encodeURIComponent(query)}`
      : `${SERVER_URL}/libraries/search?q=${encodeURIComponent(query)}`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 4000);

    const res = await fetch(endpoint, { signal: controller.signal });
    clearTimeout(timeoutId);

    if (res.ok) {
      const data = await res.json();
      serverConnected = true;
      if (data.results && data.results.length > 0) {
        currentItems = data.results;
        renderFilteredItems();
      }
    }
  } catch (err) {
    serverConnected = false;
    // Backend unreachable — keep showing built-in rich catalog!
  } finally {
    if (loadingEl) loadingEl.style.display = 'none';
  }
}

function renderFilteredItems() {
  const listEl = document.getElementById('manager-list');
  const emptyEl = document.getElementById('manager-empty');
  const typeFilter = document.getElementById('manager-type-filter');
  const topicFilter = document.getElementById('manager-topic-filter');

  if (!listEl) return;

  const selectedType = typeFilter ? typeFilter.value : 'all';
  const selectedTopic = topicFilter ? topicFilter.value : 'all';

  const filtered = currentItems.filter(item => {
    // Type filter
    if (selectedType === 'installed' && !item.installed_version) return false;
    if (selectedType === 'updatable') {
      if (!item.installed_version) return false;
      if (item.installed_version === item.latest_version) return false;
    }

    // Topic filter (for libraries)
    if (activeTab === 'libraries' && selectedTopic !== 'all') {
      const cat = (item.category || '').toLowerCase();
      if (!cat.includes(selectedTopic.toLowerCase())) return false;
    }

    return true;
  });

  if (filtered.length === 0) {
    listEl.innerHTML = '';
    if (emptyEl) emptyEl.style.display = 'block';
    return;
  }

  if (emptyEl) emptyEl.style.display = 'none';

  listEl.innerHTML = filtered.map(item => renderItemCard(item)).join('');

  // Bind actions for each card
  filtered.forEach(item => {
    bindCardEvents(item);
  });
}

function renderItemCard(item) {
  const idOrName = activeTab === 'boards' ? item.id : item.name;
  const safeId = idOrName.replace(/[^a-zA-Z0-9_-]/g, '_');
  const isInstalled = !!item.installed_version;
  const isUpdatable = isInstalled && item.latest_version && item.installed_version !== item.latest_version;
  const authorText = item.maintainer || item.author || 'Arduino';
  const versions = item.versions && item.versions.length ? item.versions : [item.latest_version || '1.0.0'];
  const isBusy = !!isInstallingMap[idOrName];

  let boardsListHtml = '';
    const boardNames = item.boards.map(b => typeof b === 'string' ? b : (b.name || b.fqbn || 'Unknown Board')).join(', ');
    boardsListHtml = `<div class="manager-item-boards"><strong>Boards included in this package:</strong> ${escapeHtml(boardNames)}</div>`;

  const moreInfoLink = item.website 
    ? `<a href="${escapeHtml(item.website)}" target="_blank" rel="noopener" class="manager-more-info">More info</a>`
    : '';

  return `
    <div class="manager-card" id="card-${safeId}">
      <div class="manager-card-header">
        <span class="manager-item-name">${escapeHtml(item.name || idOrName)}</span>
        <span class="manager-item-author">by ${escapeHtml(authorText)}</span>
      </div>

      ${isInstalled ? `
        <div class="manager-installed-badge">
          <span class="badge-dot"></span>
          <span>${escapeHtml(item.installed_version)} installed</span>
          ${isUpdatable ? `<span class="badge-update-tag">UPDATE AVAILABLE</span>` : ''}
        </div>
      ` : ''}

      <div class="manager-item-desc">
        ${escapeHtml(item.description || (item.name + ' package for Arduino projects.'))}
      </div>

      ${boardsListHtml}
      ${moreInfoLink}

      <div class="manager-card-footer">
        <div class="manager-version-select-wrapper">
          <select class="manager-version-select" id="version-select-${safeId}" ${isBusy ? 'disabled' : ''}>
            ${versions.map(v => `
              <option value="${v}" ${v === (item.installed_version || item.latest_version) ? 'selected' : ''}>${v}</option>
            `).join('')}
          </select>
        </div>

        <div class="manager-action-container" id="action-container-${safeId}">
          ${renderActionButton(item, safeId, item.installed_version || item.latest_version, isBusy)}
        </div>
      </div>
    </div>
  `;
}

function renderActionButton(item, safeId, selectedVersion, isBusy) {
  const isInstalled = !!item.installed_version;
  const isSelectedInstalled = isInstalled && item.installed_version === selectedVersion;
  const isUpdate = isInstalled && !isSelectedInstalled && selectedVersion === item.latest_version;

  if (isBusy) {
    return `
      <button class="btn-manager-action busy" disabled>
        <span class="btn-spinner"></span>
        <span>Working…</span>
      </button>
    `;
  }

  if (isSelectedInstalled) {
    return `
      <button class="btn-manager-remove" id="btn-action-${safeId}" data-action="remove">
        REMOVE
      </button>
    `;
  } else if (isUpdate) {
    return `
      <button class="btn-manager-install update" id="btn-action-${safeId}" data-action="install">
        UPDATE
      </button>
    `;
  } else {
    return `
      <button class="btn-manager-install" id="btn-action-${safeId}" data-action="install">
        INSTALL
      </button>
    `;
  }
}

function bindCardEvents(item) {
  const idOrName = activeTab === 'boards' ? item.id : item.name;
  const safeId = idOrName.replace(/[^a-zA-Z0-9_-]/g, '_');
  const versionSelect = document.getElementById(`version-select-${safeId}`);
  const actionContainer = document.getElementById(`action-container-${safeId}`);

  if (versionSelect && actionContainer) {
    versionSelect.addEventListener('change', () => {
      const selVer = versionSelect.value;
      actionContainer.innerHTML = renderActionButton(item, safeId, selVer, !!isInstallingMap[idOrName]);
      bindActionButton(item, safeId);
    });
  }

  bindActionButton(item, safeId);
}

function bindActionButton(item, safeId) {
  const idOrName = activeTab === 'boards' ? item.id : item.name;
  const safeIdClean = idOrName.replace(/[^a-zA-Z0-9_-]/g, '_');
  const btn = document.getElementById(`btn-action-${safeIdClean}`);
  const versionSelect = document.getElementById(`version-select-${safeIdClean}`);
  if (!btn) return;

  btn.addEventListener('click', async () => {
    const action = btn.dataset.action;
    const version = versionSelect ? versionSelect.value : null;

    isInstallingMap[idOrName] = true;
    renderFilteredItems();

    try {
      if (action === 'install') {
        const endpoint = activeTab === 'boards' ? `${SERVER_URL}/cores/install` : `${SERVER_URL}/libraries/install`;
        const body = activeTab === 'boards' ? { core: idOrName, version } : { library: idOrName, version };

        const res = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
        });
        const data = await res.json();

        if (res.ok && data.success) {
          item.installed_version = version;
        } else {
          alert(`Installation failed: ${data.error || 'Unknown error'}`);
        }
      } else if (action === 'remove') {
        const endpoint = activeTab === 'boards' ? `${SERVER_URL}/cores/uninstall` : `${SERVER_URL}/libraries/uninstall`;
        const body = activeTab === 'boards' ? { core: idOrName } : { library: idOrName };

        const res = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
        });
        const data = await res.json();

        if (res.ok && data.success) {
          item.installed_version = null;
        } else {
          alert(`Removal failed: ${data.error || 'Unknown error'}`);
        }
      }
    } catch (err) {
      alert(`Could not connect to compiler server at ${SERVER_URL}.\nPlease make sure arduino-server is running (python3 server.py in arduino-server folder).`);
    } finally {
      delete isInstallingMap[idOrName];
      renderFilteredItems();
    }
  });
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ═══════════════════════════════════════════════════════════════════
// Board Selector Flyout Menu (Arduino IDE 2.x Parity)
// ═══════════════════════════════════════════════════════════════════

const DEFAULT_BOARD = {
  name: 'Arduino UNO',
  fqbn: 'arduino:avr:uno',
  id: 'uno',
  platform: 'arduino:avr'
};

export function getSelectedBoard() {
  return DEFAULT_BOARD;
}

export function setSelectedBoard(board) {
  const label = document.getElementById('selected-board-name');
  if (label) {
    label.textContent = 'Arduino UNO';
  }
}

export function initBoardSelector(onBoardSelected) {
  const wrapper = document.getElementById('board-selector-wrapper');
  const btn = document.getElementById('board-selector-btn');
  const menu = document.getElementById('board-flyout-menu');
  const managerBtn = document.getElementById('menu-open-boards-manager');
  const label = document.getElementById('selected-board-name');

  if (label) {
    label.textContent = 'Arduino UNO';
  }

  if (btn && menu) {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const isClosed = menu.classList.contains('hidden');
      if (isClosed) {
        renderBoardFlyoutMenu(onBoardSelected);
        menu.classList.remove('hidden');
        if (wrapper) wrapper.classList.add('open');
      } else {
        menu.classList.add('hidden');
        if (wrapper) wrapper.classList.remove('open');
      }
    });
  }

  if (managerBtn) {
    managerBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (menu) menu.classList.add('hidden');
      if (wrapper) wrapper.classList.remove('open');
      openManager('boards');
    });
  }

  // Close when clicking outside
  document.addEventListener('click', (e) => {
    if (wrapper && !wrapper.contains(e.target)) {
      if (menu) menu.classList.add('hidden');
      wrapper.classList.remove('open');
    }
  });

  // Keyboard shortcut: Shift + Cmd + B / Shift + Ctrl + B
  document.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.shiftKey && (e.key === 'b' || e.key === 'B')) {
      e.preventDefault();
      openManager('boards');
    }
  });
}

export function renderBoardFlyoutMenu(onBoardSelected) {
  const container = document.getElementById('board-flyout-platforms');
  if (!container) return;

  const current = DEFAULT_BOARD;
  const installedPlatforms = DEFAULT_BOARDS_CATALOG;

  container.innerHTML = '';

  installedPlatforms.forEach(platform => {
    const isPlatformActive = (platform.id === 'arduino:avr');
    const platformEl = document.createElement('div');
    platformEl.className = `board-platform-item ${isPlatformActive ? 'active' : ''}`;
    platformEl.dataset.platformId = platform.id;

    // Platform header
    platformEl.innerHTML = `
      <div class="board-platform-left" style="display: flex; align-items: center; justify-content: space-between; width: 100%;">
        <div style="display: flex; align-items: center; gap: 8px;">
          <span class="board-platform-bullet"></span>
          <span>${escapeHtml(platform.name)}</span>
        </div>
        ${platform.id !== 'arduino:avr' ? `<span style="font-size: 9px; padding: 2px 6px; border-radius: 4px; background: rgba(255,255,255,0.06); color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.5px; font-weight: 600; margin-right: 4px;">Soon</span>` : ''}
      </div>
      <span class="board-submenu-arrow">›</span>
    `;

    // Submenu containing list of boards
    const submenu = document.createElement('div');
    submenu.className = 'board-submenu';

    (platform.boards || []).forEach(board => {
      const bName = typeof board === 'string' ? board : board.name;
      const bFqbn = typeof board === 'string' ? `${platform.id}:${board.toLowerCase().replace(/[^a-z0-9]/g, '')}` : board.fqbn;
      const isUno = (bFqbn === 'arduino:avr:uno' || bName === 'Arduino UNO');

      const boardItem = document.createElement('div');
      boardItem.className = `board-submenu-item ${isUno ? 'selected' : 'disabled'}`;
      boardItem.style.display = 'flex';
      boardItem.style.alignItems = 'center';
      boardItem.style.justifyContent = 'space-between';
      boardItem.style.gap = '8px';

      boardItem.innerHTML = `
        <div style="display: flex; align-items: center; gap: 8px;">
          <span class="board-check-icon">${isUno ? '✓' : ''}</span>
          <span style="${!isUno ? 'opacity: 0.6;' : 'font-weight: 600;'}">${escapeHtml(bName)}</span>
        </div>
        ${!isUno ? `<span style="font-size: 9px; padding: 2px 5px; border-radius: 4px; background: rgba(255,255,255,0.07); color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.4px; font-weight: 600;">Coming Soon</span>` : ''}
      `;

      boardItem.addEventListener('click', (e) => {
        e.stopPropagation();
        const menu = document.getElementById('board-flyout-menu');
        const wrapper = document.getElementById('board-selector-wrapper');
        if (menu) menu.classList.add('hidden');
        if (wrapper) wrapper.classList.remove('open');

        if (isUno) {
          setSelectedBoard(DEFAULT_BOARD);
          if (typeof onBoardSelected === 'function') {
            onBoardSelected(DEFAULT_BOARD);
          }
        } else {
          // Notify user that this board is coming soon
          const toast = document.createElement('div');
          toast.className = 'custom-toast';
          toast.style.cssText = 'position: fixed; bottom: 30px; left: 50%; transform: translateX(-50%); background: #1e2024; color: #fff; border: 1px solid var(--border); padding: 10px 18px; border-radius: 8px; font-size: 13px; z-index: 99999; box-shadow: 0 4px 16px rgba(0,0,0,0.5); display: flex; align-items: center; gap: 8px; animation: fadeIn 0.2s ease;';
          toast.innerHTML = `<span>ℹ️ <strong>${escapeHtml(bName)}</strong> support is coming soon. Deploying on <strong>Arduino UNO</strong>.</span>`;
          document.body.appendChild(toast);
          setTimeout(() => { toast.remove(); }, 3200);
        }
      });

      submenu.appendChild(boardItem);
    });

    platformEl.appendChild(submenu);
    container.appendChild(platformEl);
  });
}
