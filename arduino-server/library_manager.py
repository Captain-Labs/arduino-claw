# library_manager.py
import subprocess
import json
import re
from config import ARDUINO_CLI_CMD

class LibraryManager:
    @staticmethod
    def _sanitize_name(name: str) -> bool:
        """
        Validate library name.
        Only allow alphanumeric, spaces, hyphens, and underscores.
        """
        if not name or not isinstance(name, str):
            return False
        return bool(re.match(r'^[a-zA-Z0-9 _-]+$', name))

    @staticmethod
    def install(library_name: str, version: str = None) -> dict:
        """Installs a library via Arduino CLI with optional version."""
        if not LibraryManager._sanitize_name(library_name):
            return {
                'success': False,
                'error': 'Invalid library name format.'
            }
            
        target = f"{library_name}@{version}" if version else library_name
        try:
            result = subprocess.run(
                ARDUINO_CLI_CMD + ['lib', 'install', target],
                capture_output=True,
                text=True,
                timeout=120
            )
            if result.returncode == 0:
                return {
                    'success': True,
                    'message': f"Library '{target}' installed successfully.",
                    'details': result.stdout.strip()
                }
            else:
                return {
                    'success': False,
                    'error': f"Failed to install library: {result.stderr.strip() or result.stdout.strip()}",
                    'details': result.stderr.strip()
                }
        except Exception as e:
            return {
                'success': False,
                'error': f"Exception during installation: {str(e)}"
            }

    @staticmethod
    def uninstall(library_name: str) -> dict:
        """Uninstalls a library via Arduino CLI."""
        if not LibraryManager._sanitize_name(library_name):
            return {
                'success': False,
                'error': 'Invalid library name format.'
            }
            
        try:
            result = subprocess.run(
                ARDUINO_CLI_CMD + ['lib', 'uninstall', library_name],
                capture_output=True,
                text=True,
                timeout=60
            )
            if result.returncode == 0:
                return {
                    'success': True,
                    'message': f"Library '{library_name}' uninstalled successfully."
                }
            else:
                return {
                    'success': False,
                    'error': f"Failed to uninstall library: {result.stderr.strip() or result.stdout.strip()}"
                }
        except Exception as e:
            return {
                'success': False,
                'error': f"Exception during uninstallation: {str(e)}"
            }

    @staticmethod
    def search(query: str = '') -> dict:
        """Searches for libraries matching the query and returns formatted results."""
        try:
            inst_res = LibraryManager.list_installed()
            inst_map = {lib['name'].lower(): lib['version'] for lib in inst_res.get('libraries', [])}
            
            cmd = ARDUINO_CLI_CMD + ['lib', 'search']
            if query:
                cmd.append(query)
            cmd.append('--json')
            
            result = subprocess.run(cmd, capture_output=True, text=True, timeout=60)
            if result.returncode == 0 and result.stdout.strip():
                try:
                    data = json.loads(result.stdout)
                except json.JSONDecodeError:
                    data = {}
                    
                libs = data.get('libraries', [])
                formatted_libs = []
                for item in libs:
                    name = item.get('name', '')
                    latest = item.get('latest', {})
                    version = latest.get('version', '') if isinstance(latest, dict) else str(latest or '')
                    author = item.get('author') or (latest.get('author') if isinstance(latest, dict) else '') or item.get('maintainer') or 'Arduino Community'
                    category = item.get('category') or (latest.get('category') if isinstance(latest, dict) else '') or 'Uncategorized'
                    sentence = latest.get('sentence', '') if isinstance(latest, dict) else ''
                    paragraph = latest.get('paragraph', '') if isinstance(latest, dict) else ''
                    description = sentence or paragraph or item.get('sentence', '') or item.get('paragraph', '')
                    website = item.get('website') or (latest.get('website') if isinstance(latest, dict) else '') or 'https://www.arduino.cc/reference/en/libraries/'
                    
                    versions_raw = item.get('releases', {}) or item.get('versions', [])
                    if isinstance(versions_raw, dict):
                        versions = list(versions_raw.keys())
                    elif isinstance(versions_raw, list):
                        versions = [v.get('version', str(v)) if isinstance(v, dict) else str(v) for v in versions_raw]
                    else:
                        versions = [version] if version else []
                    
                    if version and version not in versions:
                        versions.insert(0, version)
                        
                    installed_v = inst_map.get(name.lower())
                    
                    formatted_libs.append({
                        'name': name,
                        'author': author,
                        'category': category,
                        'latest_version': version,
                        'versions': versions,
                        'installed_version': installed_v,
                        'description': description,
                        'website': website
                    })
                
                if formatted_libs:
                    return {'success': True, 'results': formatted_libs}
            
            # Fallback catalog if CLI search is empty or offline
            return {'success': True, 'results': LibraryManager._fallback_libraries(query, inst_map)}
        except Exception as e:
            inst_res = LibraryManager.list_installed()
            inst_map = {lib['name'].lower(): lib['version'] for lib in inst_res.get('libraries', [])}
            return {'success': True, 'results': LibraryManager._fallback_libraries(query, inst_map)}

    @staticmethod
    def _fallback_libraries(query: str = '', inst_map: dict = None):
        if inst_map is None:
            inst_map = {}
            
        catalog = [
            {
                'name': 'Servo',
                'author': 'Michael Margolis, Arduino',
                'category': 'Device Control',
                'latest_version': '1.2.2',
                'versions': ['1.2.2', '1.2.1', '1.2.0', '1.1.8'],
                'description': 'Allows an Arduino board to control RC (hobby) servo motors easily with PWM precision.',
                'website': 'https://www.arduino.cc/reference/en/libraries/servo/'
            },
            {
                'name': 'DHT sensor library',
                'author': 'Adafruit',
                'category': 'Sensors',
                'latest_version': '1.4.6',
                'versions': ['1.4.6', '1.4.4', '1.4.3', '1.4.2'],
                'description': 'Arduino library for DHT11, DHT22, etc. Temperature & Humidity Sensors.',
                'website': 'https://github.com/adafruit/DHT-sensor-library'
            },
            {
                'name': 'Adafruit NeoPixel',
                'author': 'Adafruit',
                'category': 'Display',
                'latest_version': '1.12.3',
                'versions': ['1.12.3', '1.12.0', '1.11.0', '1.10.7'],
                'description': 'Arduino library for controlling single-wire-based LED pixels and strip (WS2812B, WS2811, SK6812, etc.).',
                'website': 'https://github.com/adafruit/Adafruit_NeoPixel'
            },
            {
                'name': 'Adafruit SSD1306',
                'author': 'Adafruit',
                'category': 'Display',
                'latest_version': '2.5.11',
                'versions': ['2.5.11', '2.5.9', '2.5.7', '2.5.3'],
                'description': 'SSD1306 OLED display library for monochromatic 128x64 and 128x32 OLEDs with I2C and SPI.',
                'website': 'https://github.com/adafruit/Adafruit_SSD1306'
            },
            {
                'name': 'Adafruit GFX Library',
                'author': 'Adafruit',
                'category': 'Display',
                'latest_version': '1.11.10',
                'versions': ['1.11.10', '1.11.9', '1.11.7', '1.11.5'],
                'description': 'Core graphics library providing lines, circles, text, bitmaps, and UI primitives for all Adafruit displays.',
                'website': 'https://github.com/adafruit/Adafruit-GFX-Library'
            },
            {
                'name': 'RTClib',
                'author': 'Adafruit',
                'category': 'Timing',
                'latest_version': '2.1.4',
                'versions': ['2.1.4', '2.1.3', '2.1.1', '2.0.3'],
                'description': 'A fork of Jeelabs fantastic real-time clock library for DS1307, DS3231, PCF8523, and PCF8563.',
                'website': 'https://github.com/adafruit/RTClib'
            },
            {
                'name': 'LiquidCrystal I2C',
                'author': 'Frank de Brabander',
                'category': 'Display',
                'latest_version': '1.1.4',
                'versions': ['1.1.4', '1.1.2', '1.1.0'],
                'description': 'Library for 16x2 and 20x4 HD44780 LCD displays connected through PCF8574 I2C adapter backpack.',
                'website': 'https://github.com/johnrickman/LiquidCrystal_I2C'
            },
            {
                'name': 'AccelStepper',
                'author': 'Mike McCauley',
                'category': 'Device Control',
                'latest_version': '1.64.0',
                'versions': ['1.64.0', '1.61.0', '1.59.0'],
                'description': 'Advanced stepper motor library supporting acceleration, deceleration, simultaneous steppers, and sub-step microstepping.',
                'website': 'https://www.airspayce.com/mikem/arduino/AccelStepper/'
            },
            {
                'name': 'NewPing',
                'author': 'Tim Eckel',
                'category': 'Sensors',
                'latest_version': '1.9.7',
                'versions': ['1.9.7', '1.9.6', '1.9.4'],
                'description': 'High-performance ultrasonic sensor library for HC-SR04, SRF05, Parallax Ping, and other sonar sensors.',
                'website': 'https://bitbucket.org/teckel12/arduino-new-ping'
            },
            {
                'name': 'Encoder',
                'author': 'Paul Stoffregen',
                'category': 'Signal Input/Output',
                'latest_version': '1.4.4',
                'versions': ['1.4.4', '1.4.3', '1.4.2'],
                'description': 'Counts quadrature pulses from rotary and linear optical encoders with hardware interrupt support.',
                'website': 'https://github.com/PaulStoffregen/Encoder'
            },
            {
                'name': 'ArduinoJson',
                'author': 'Benoit Blanchon',
                'category': 'Data Processing',
                'latest_version': '7.2.0',
                'versions': ['7.2.0', '7.1.0', '7.0.4', '6.21.5'],
                'description': 'An elegant and efficient JSON library for Arduino and embedded C++ with zero-copy parsing.',
                'website': 'https://arduinojson.org/'
            },
            {
                'name': 'FastLED',
                'author': 'Daniel Garcia',
                'category': 'Display',
                'latest_version': '3.7.8',
                'versions': ['3.7.8', '3.7.0', '3.6.0'],
                'description': 'Multi-platform library for controlling addressable RGB and RGBW LED strips and matrices with fast color math.',
                'website': 'https://fastled.io/'
            },
            {
                'name': 'PubSubClient',
                'author': 'Nick O\'Leary',
                'category': 'Communication',
                'latest_version': '2.8.0',
                'versions': ['2.8.0', '2.7.0'],
                'description': 'A client library for simple publish/subscribe messaging with a server that supports MQTT protocol.',
                'website': 'https://pubsubclient.knolleary.net/'
            },
            {
                'name': 'Keypad',
                'author': 'Mark Stanley, Alexander Brevig',
                'category': 'Signal Input/Output',
                'latest_version': '3.1.1',
                'versions': ['3.1.1', '3.1.0'],
                'description': 'Keypad is a library for using matrix keypads with the Arduino.',
                'website': 'https://github.com/NullCodeStudio/Arduino-Keypad-Library'
            }
        ]
        
        # Populate installed version status
        for item in catalog:
            item['installed_version'] = inst_map.get(item['name'].lower())
            
        if not query:
            return catalog
            
        q = query.lower()
        return [
            lib for lib in catalog
            if q in lib['name'].lower() or q in lib['author'].lower() or q in lib['category'].lower() or q in lib['description'].lower()
        ]

    @staticmethod
    def list_installed() -> dict:
        """Lists all installed libraries on the system."""
        try:
            result = subprocess.run(
                ARDUINO_CLI_CMD + ['lib', 'list', '--json'],
                capture_output=True,
                text=True,
                timeout=60
            )
            if result.returncode == 0:
                try:
                    data = json.loads(result.stdout)
                except json.JSONDecodeError:
                    return {'libraries': []}
                    
                libs = data.get('installed_libraries', [])
                formatted_libs = []
                for item in libs:
                    lib_detail = item.get('library', {})
                    name = lib_detail.get('name') or item.get('name', '')
                    version = lib_detail.get('version') or item.get('version', '')
                    location = lib_detail.get('location') or item.get('location', 'unknown')
                    
                    formatted_libs.append({
                        'name': name,
                        'version': version,
                        'location': location
                    })
                return {'libraries': formatted_libs}
            else:
                return {
                    'success': False,
                    'error': f"Failed to list libraries: {result.stderr.strip()}"
                }
        except Exception as e:
            return {
                'success': False,
                'error': f"Exception listing libraries: {str(e)}"
            }

    @staticmethod
    def update_index() -> dict:
        """Updates the local index of available Arduino libraries."""
        try:
            result = subprocess.run(
                ARDUINO_CLI_CMD + ['lib', 'update-index'],
                capture_output=True,
                text=True,
                timeout=120
            )
            if result.returncode == 0:
                return {
                    'success': True,
                    'message': 'Index updated successfully.'
                }
            else:
                return {
                    'success': False,
                    'error': f"Failed to update index: {result.stderr.strip()}"
                }
        except Exception as e:
            return {
                'success': False,
                'error': f"Exception updating library index: {str(e)}"
            }

    @staticmethod
    def check_outdated() -> dict:
        """Checks for outdated cores and libraries."""
        try:
            subprocess.run(ARDUINO_CLI_CMD + ['core', 'update-index'], capture_output=True, text=True, timeout=60)
            subprocess.run(ARDUINO_CLI_CMD + ['lib', 'update-index'], capture_output=True, text=True, timeout=60)

            result = subprocess.run(
                ARDUINO_CLI_CMD + ['outdated', '--json'],
                capture_output=True,
                text=True,
                timeout=60
            )

            outdated_cores = []
            outdated_libraries = []

            if result.returncode == 0 and result.stdout.strip():
                try:
                    data = json.loads(result.stdout)
                    for core in data.get('outdated_cores', []):
                        outdated_cores.append({
                            'name': core.get('id') or core.get('name', 'Arduino Core'),
                            'installed': core.get('installed_version', ''),
                            'latest': core.get('latest_version', '')
                        })
                    for lib in data.get('outdated_libraries', []):
                        lib_info = lib.get('library', {})
                        outdated_libraries.append({
                            'name': lib_info.get('name') or lib.get('name', ''),
                            'installed': lib_info.get('version') or lib.get('installed_version', ''),
                            'latest': lib.get('latest_version') or lib.get('latest', {}).get('version', '')
                        })
                except json.JSONDecodeError:
                    pass

            has_updates = len(outdated_cores) > 0 or len(outdated_libraries) > 0

            return {
                'success': True,
                'has_updates': has_updates,
                'outdated_cores': outdated_cores,
                'outdated_libraries': outdated_libraries
            }
        except Exception as e:
            return {
                'success': False,
                'has_updates': False,
                'outdated_cores': [],
                'outdated_libraries': [],
                'error': str(e)
            }

    @staticmethod
    def upgrade_all() -> dict:
        """Upgrades all outdated libraries and cores."""
        try:
            res_lib = subprocess.run(ARDUINO_CLI_CMD + ['lib', 'upgrade'], capture_output=True, text=True, timeout=300)
            res_core = subprocess.run(ARDUINO_CLI_CMD + ['core', 'upgrade'], capture_output=True, text=True, timeout=300)
            return {
                'success': True,
                'message': 'All Arduino CLI libraries and cores updated successfully.',
                'details': (res_lib.stdout + "\n" + res_core.stdout).strip()
            }
        except Exception as e:
            return {
                'success': False,
                'error': f"Exception during upgrade: {str(e)}"
            }
