# core_manager.py
# Core & Board Manager for Arduino CLI
import subprocess
import json
import re
from config import ARDUINO_CLI_CMD

class CoreManager:
    @staticmethod
    def _sanitize_name(name: str) -> bool:
        """Validate core package name format."""
        if not name or not isinstance(name, str):
            return False
        return bool(re.match(r'^[a-zA-Z0-9 _:-]+$', name))

    @staticmethod
    def list_installed() -> dict:
        """Lists all installed core platforms."""
        try:
            result = subprocess.run(
                ARDUINO_CLI_CMD + ['core', 'list', '--json'],
                capture_output=True,
                text=True,
                timeout=60
            )
            if result.returncode == 0 and result.stdout.strip():
                try:
                    data = json.loads(result.stdout)
                except json.JSONDecodeError:
                    data = []
                
                cores = data if isinstance(data, list) else data.get('platforms', [])
                formatted = []
                for item in cores:
                    cid = item.get('id') or item.get('id_str') or ''
                    installed_v = item.get('installed_version') or item.get('installed') or ''
                    latest_v = item.get('latest_version') or item.get('latest') or installed_v
                    name = item.get('name') or cid
                    maintainer = item.get('maintainer') or 'Arduino'
                    boards = [b.get('name', '') for b in item.get('boards', []) if isinstance(b, dict)]
                    
                    formatted.append({
                        'id': cid,
                        'name': name,
                        'maintainer': maintainer,
                        'installed_version': installed_v,
                        'latest_version': latest_v,
                        'boards': boards
                    })
                return {'success': True, 'cores': formatted}
            else:
                return {'success': True, 'cores': []}
        except Exception as e:
            return {'success': False, 'error': str(e), 'cores': []}

    @staticmethod
    def search(query: str = '') -> dict:
        """Searches core platforms from index."""
        try:
            cmd = ARDUINO_CLI_CMD + ['core', 'search']
            if query:
                cmd.append(query)
            cmd.append('--json')
            
            result = subprocess.run(cmd, capture_output=True, text=True, timeout=60)
            if result.returncode == 0 and result.stdout.strip():
                try:
                    data = json.loads(result.stdout)
                except json.JSONDecodeError:
                    data = []
                
                cores = data if isinstance(data, list) else data.get('platforms', [])
                inst_res = CoreManager.list_installed()
                inst_map = {c['id']: c for c in inst_res.get('cores', [])}
                
                formatted = []
                for item in cores:
                    cid = item.get('id') or ''
                    name = item.get('name') or cid
                    maintainer = item.get('maintainer') or 'Arduino'
                    latest = item.get('latest') or ''
                    if isinstance(latest, dict):
                        latest = latest.get('version', '')
                    
                    versions_raw = item.get('releases', {}) or item.get('versions', [])
                    if isinstance(versions_raw, dict):
                        versions = list(versions_raw.keys())
                    elif isinstance(versions_raw, list):
                        versions = [v.get('version', str(v)) if isinstance(v, dict) else str(v) for v in versions_raw]
                    else:
                        versions = [latest] if latest else []
                    
                    if latest and latest not in versions:
                        versions.insert(0, latest)
                    
                    boards = [b.get('name', '') for b in item.get('boards', []) if isinstance(b, dict)]
                    installed_info = inst_map.get(cid)
                    
                    formatted.append({
                        'id': cid,
                        'name': name,
                        'maintainer': maintainer,
                        'latest_version': latest,
                        'versions': versions,
                        'installed_version': installed_info['installed_version'] if installed_info else None,
                        'boards': boards,
                        'website': item.get('website', '')
                    })
                
                if formatted:
                    return {'success': True, 'results': formatted}
            
            # If search is empty or CLI index has no results, fallback to standard catalog
            return {'success': True, 'results': CoreManager._fallback_cores(query)}
        except Exception as e:
            return {'success': True, 'results': CoreManager._fallback_cores(query)}

    @staticmethod
    def _fallback_cores(query: str = ''):
        inst_res = CoreManager.list_installed()
        inst_map = {c['id']: c for c in inst_res.get('cores', [])}
        popular = [
            {
                'id': 'arduino:avr',
                'name': 'Arduino AVR Boards',
                'maintainer': 'Arduino',
                'latest_version': '1.8.6',
                'versions': ['1.8.6', '1.8.5', '1.8.4', '1.8.3'],
                'installed_version': inst_map.get('arduino:avr', {}).get('installed_version', '1.8.6'),
                'boards': ['Arduino Uno', 'Arduino Nano', 'Arduino Mega or Mega 2560', 'Arduino Leonardo', 'LilyPad Arduino USB', 'Arduino Pro or Pro Mini'],
                'website': 'https://github.com/arduino/ArduinoCore-avr'
            },
            {
                'id': 'esp32:esp32',
                'name': 'Arduino ESP32 Boards',
                'maintainer': 'Espressif Systems',
                'latest_version': '2.0.14',
                'versions': ['2.0.14', '2.0.13', '2.0.11', '2.0.9'],
                'installed_version': inst_map.get('esp32:esp32', {}).get('installed_version', None),
                'boards': ['ESP32 Dev Module', 'Arduino Nano ESP32', 'NodeMCU-32S', 'WEMOS LOLIN32'],
                'website': 'https://github.com/espressif/arduino-esp32'
            },
            {
                'id': 'arduino:samd',
                'name': 'Arduino SAMD Boards (32-bits ARM Cortex-M0+)',
                'maintainer': 'Arduino',
                'latest_version': '1.8.13',
                'versions': ['1.8.13', '1.8.12', '1.8.11'],
                'installed_version': inst_map.get('arduino:samd', {}).get('installed_version', None),
                'boards': ['Arduino Zero', 'Arduino MKR1000', 'Arduino MKR WiFi 1010', 'Arduino Nano 33 IoT'],
                'website': 'https://github.com/arduino/ArduinoCore-samd'
            },
            {
                'id': 'arduino:mbed_nano',
                'name': 'Arduino Mbed OS Nano Boards',
                'maintainer': 'Arduino',
                'latest_version': '4.1.5',
                'versions': ['4.1.5', '4.1.3', '4.0.2'],
                'installed_version': inst_map.get('arduino:mbed_nano', {}).get('installed_version', None),
                'boards': ['Arduino Nano 33 BLE', 'Arduino Nano RP2040 Connect'],
                'website': 'https://github.com/arduino/ArduinoCore-mbed'
            },
            {
                'id': 'arduino:mbed_edge',
                'name': 'Arduino Mbed OS Edge Boards',
                'maintainer': 'Arduino',
                'latest_version': '4.1.5',
                'versions': ['4.1.5', '4.1.3', '4.0.2'],
                'installed_version': inst_map.get('arduino:mbed_edge', {}).get('installed_version', None),
                'boards': ['Arduino Edge Control'],
                'website': 'https://github.com/arduino/ArduinoCore-mbed'
            },
            {
                'id': 'arduino:megaavr',
                'name': 'Arduino megaAVR Boards',
                'maintainer': 'Arduino',
                'latest_version': '1.8.8',
                'versions': ['1.8.8', '1.8.7', '1.8.6'],
                'installed_version': inst_map.get('arduino:megaavr', {}).get('installed_version', None),
                'boards': ['Arduino Uno WiFi Rev2', 'Arduino Nano Every'],
                'website': 'https://github.com/arduino/ArduinoCore-megaavr'
            },
            {
                'id': 'rp2040:rp2040',
                'name': 'Raspberry Pi Pico / RP2040',
                'maintainer': 'Earle F. Philhower, III',
                'latest_version': '3.7.2',
                'versions': ['3.7.2', '3.6.2', '3.5.0'],
                'installed_version': inst_map.get('rp2040:rp2040', {}).get('installed_version', None),
                'boards': ['Raspberry Pi Pico', 'Raspberry Pi Pico W', 'Waveshare RP2040-Zero'],
                'website': 'https://github.com/earlephilhower/arduino-pico'
            }
        ]
        
        if not query:
            return popular
        
        q = query.lower()
        return [
            c for c in popular
            if q in c['name'].lower() or q in c['id'].lower() or any(q in b.lower() for b in c.get('boards', []))
        ]

    @staticmethod
    def install(core_id: str, version: str = None) -> dict:
        """Installs or upgrades a core platform."""
        if not CoreManager._sanitize_name(core_id):
            return {'success': False, 'error': 'Invalid core ID format.'}
        
        target = f"{core_id}@{version}" if version else core_id
        try:
            result = subprocess.run(
                ARDUINO_CLI_CMD + ['core', 'install', target],
                capture_output=True,
                text=True,
                timeout=300
            )
            if result.returncode == 0:
                return {'success': True, 'message': f"Core '{target}' installed successfully.", 'details': result.stdout.strip()}
            else:
                return {'success': False, 'error': result.stderr.strip() or result.stdout.strip()}
        except Exception as e:
            return {'success': False, 'error': f"Exception during core install: {str(e)}"}

    @staticmethod
    def uninstall(core_id: str) -> dict:
        """Uninstalls a core platform."""
        if not CoreManager._sanitize_name(core_id):
            return {'success': False, 'error': 'Invalid core ID format.'}
        
        try:
            result = subprocess.run(
                ARDUINO_CLI_CMD + ['core', 'uninstall', core_id],
                capture_output=True,
                text=True,
                timeout=120
            )
            if result.returncode == 0:
                return {'success': True, 'message': f"Core '{core_id}' uninstalled successfully."}
            else:
                return {'success': False, 'error': result.stderr.strip() or result.stdout.strip()}
        except Exception as e:
            return {'success': False, 'error': f"Exception during core uninstall: {str(e)}"}
