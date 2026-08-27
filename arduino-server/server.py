# server.py
import sys
import time
import os
import subprocess
import json
import tempfile
import glob
from flask import Flask, request, jsonify
from flask_cors import CORS
from dotenv import load_dotenv

# Load .env credentials for the premium auth system
load_dotenv()

from config import (
    SUPPORTED_BOARDS, MAX_CODE_LENGTH, SERVER_HOST, SERVER_PORT,
    BOARD_FLASH_LIMITS, MAX_CONTENT_LENGTH, BLOCKED_PATTERNS,
    HEADER_TO_LIBRARY, ESSENTIAL_LIBRARIES, COMMON_SKETCHES,
    ARDUINO_CLI_CMD
)
from compiler import ArduinoCompiler
from cache import HexCache
from queue_manager import CompileQueueManager
from library_manager import LibraryManager
from core_manager import CoreManager
from scheduler import LibraryScheduler
import auth_db

# Global statistics tracking (thread-safe counters)
stats_lock = threading_lock = None
try:
    import threading
    stats_lock = threading.Lock()
except ImportError:
    pass

total_compilations = 0
successful_compilations = 0
failed_compilations = 0

def increment_stat(stat_name):
    global total_compilations, successful_compilations, failed_compilations
    if stats_lock:
        with stats_lock:
            if stat_name == 'total':
                total_compilations += 1
            elif stat_name == 'success':
                successful_compilations += 1
            elif stat_name == 'failed':
                failed_compilations += 1

# Start uptime counter
START_TIME = time.time()

# ═══════════════════════════════════════
# EXACT 10-STEP STARTUP SEQUENCE
# ═══════════════════════════════════════

print("Initializing Arduino Compile Server startup sequence...")

# STEP 1: Verify Arduino CLI installed
try:
    cli_version = ArduinoCompiler.verify_cli_installed()
except RuntimeError as e:
    print(f"FATAL STEP 1: {str(e)}", file=sys.stderr)
    sys.exit(1)

# STEP 2: Verify arduino:avr core installed
try:
    core_list = subprocess.run(
        ARDUINO_CLI_CMD + ['core', 'list'],
        capture_output=True, text=True, check=True
    )
    if 'arduino:avr' not in core_list.stdout:
        print("[Startup] arduino:avr core not found. Installing core...")
        subprocess.run(
            ARDUINO_CLI_CMD + ['core', 'install', 'arduino:avr'],
            check=True, capture_output=True
        )
        print("Installed arduino:avr core")
except Exception as e:
    print(f"WARNING STEP 2: Core list/install failed: {str(e)}")

# STEP 3: Clean up leftover temp directories
purged_dirs = ArduinoCompiler.cleanup_leftover_temp_dirs()
# Start periodic hourly cleanup thread
ArduinoCompiler.start_periodic_cleanup_thread()

# STEP 4: Install essential libraries
try:
    # Check which are already installed first
    installed_data = LibraryManager.list_installed()
    installed_libs = {lib['name'] for lib in installed_data.get('libraries', [])}
    
    # We must make sure 'Servo' and other libraries are pre-installed
    for lib in ESSENTIAL_LIBRARIES:
        if lib not in installed_libs:
            print(f"[Startup] Installing missing essential library: '{lib}'...")
            LibraryManager.install(lib)
except Exception as e:
    print(f"WARNING STEP 4: Essential library pre-installation failed: {str(e)}")

# STEP 5: Load disk cache
hex_cache = HexCache()
loaded_entries = hex_cache.load_from_disk()
if loaded_entries > 0:
    print(f"Restored {loaded_entries} entries from disk cache")

# STEP 6: Pre-compile common sketches
precompiled_count = 0
for sketch in COMMON_SKETCHES:
    # Attempt to compile
    sketch_name = sketch['name']
    code = sketch['code']
    board = sketch['board']
    board_fqbn = SUPPORTED_BOARDS.get(board, 'arduino:avr:uno')
    
    # Check if already cached (skip compile if hit)
    if hex_cache.get(code, board_fqbn) is None:
        print(f"[Startup] Pre-compiling common sketch: '{sketch_name}'...")
        comp_res = ArduinoCompiler.compile(code, board_fqbn)
        if comp_res.get('success'):
            hex_cache.set(
                code, board_fqbn, comp_res['hex'],
                comp_res['program_size'], comp_res['max_size'], comp_res['percent_used'],
                permanent=True, sketch_name=sketch_name
            )
            precompiled_count += 1
        else:
            print(f"[Startup] Failed to precompile '{sketch_name}': {comp_res.get('error')}")
    else:
        precompiled_count += 1

print(f"Pre-compiled {precompiled_count} common sketches")

# STEP 7: Start LibraryScheduler
scheduler = LibraryScheduler()
scheduler.start()

# STEP 8: Detect system resources
# (Will run inside queue manager instantiation next, but we also print here)
import multiprocessing
import psutil
cpu_count = multiprocessing.cpu_count()
available_ram_gb = psutil.virtual_memory().available / (1024**3)

# STEP 9: Start CompileQueueManager
queue_manager = CompileQueueManager()

# Start Flask
app = Flask(__name__)
# Configure Flask request limit (100KB)
app.config['MAX_CONTENT_LENGTH'] = MAX_CONTENT_LENGTH
CORS(app, resources={r"/*": {"origins": "*"}}, methods=["GET", "POST", "OPTIONS"], allow_headers=["Content-Type"], expose_headers=["X-Queue-Position", "X-Estimated-Wait-Seconds"])

@app.before_request
def verify_compiler_api_key():
    if request.method == 'OPTIONS':
        return
        
    # Allow auth endpoints (login, register, logout, me) to bypass compiler key
    if request.path.startswith('/auth/'):
        return
    
    secret_key = os.getenv('COMPILER_API_KEY')
    if not secret_key:
        return
        
    client_key = request.headers.get('X-Compiler-Key')
    if client_key != secret_key:
        return jsonify({
            'success': False,
            'error': 'Unauthorized',
            'message': 'Invalid or missing compilation secret key.'
        }), 401

# STEP 10: Start Flask server and print banner
libs_count = scheduler.get_status()['libraries_installed']
optimal_workers = queue_manager.status()['max_workers']

# Initialise premium auth database tables (will warn gracefully if DB not configured yet)
auth_db.init_db()

print("┌─────────────────────────────────────┐")
print("│   Arduino Compilation Server        │")
print(f"│   CLI:     arduino-cli {cli_version:<13}│")
print(f"│   Workers: {optimal_workers:<24}│")
print(f"│   Cache:   {loaded_entries:<25}│")
print(f"│   Libs:    {libs_count:<25}│")
print(f"│   URL:     http://0.0.0.0:5000      │")
print(f"│   Premium: /compile/premium (JWT)   │")
print("└─────────────────────────────────────┘")

# ═══════════════════════════════════════
# GLOBAL ERROR HANDLING
# ═══════════════════════════════════════

@app.errorhandler(Exception)
def handle_unexpected_exception(e):
    return jsonify({
        'success': False,
        'error': f"Unexpected server exception: {str(e)}"
    }), 500

@app.errorhandler(413)
def request_entity_too_large(error):
    """Enforce 100KB request size limits returning 413 error."""
    return jsonify({
        'success': False,
        'error': 'Payload Too Large',
        'message': 'Request size exceeds maximum allowed limit of 100KB'
    }), 413

@app.before_request
def validate_and_sanitize_inputs():
    """Validates decodable JSON bodies and verifies size bounds."""
    if request.method == 'POST' and request.path not in ['/libraries/update-index', '/cache/clear']:
        if not request.is_json:
            return jsonify({
                'success': False,
                'error': 'Invalid request content type. Expected application/json.'
            }), 400
        try:
            request.get_json()
        except Exception:
            return jsonify({
                'success': False,
                'error': 'Invalid JSON body in request.'
            }), 400

# ═══════════════════════════════════════
# NEW ENDPOINTS & SECURITY ADDITIONS
# ═══════════════════════════════════════

@app.route('/compile', methods=['POST'])
def compile_sketch():
    # 1. Verification of CLI
    try:
        ArduinoCompiler.verify_cli_installed()
    except RuntimeError as e:
        return jsonify({
            'success': False,
            'error': f"Server compile capacity unavailable: {str(e)}"
        }), 503

    body = request.get_json() or {}
    code = body.get('code')
    board = body.get('board', 'uno')
    client_ip = request.remote_addr or '127.0.0.1'
    
    # 2. Validation
    if code is None:
        return jsonify({
            'success': False,
            'error': "Missing required field: 'code' must be provided."
        }), 400
        
    if not isinstance(code, str):
        return jsonify({
            'success': False,
            'error': "Invalid field type: 'code' must be a string."
        }), 400

    # Input Sanitization: Strip null bytes, normalize line endings
    sanitized_code = code.replace('\x00', '').replace('\r\n', '\n').strip()

    # Code length verification (min 10 chars, max 50000 chars)
    if len(sanitized_code) < 10:
        return jsonify({
            'success': False,
            'error': "Code too short. Minimum sketch length is 10 characters."
        }), 400

    if len(sanitized_code) > MAX_CODE_LENGTH:
        return jsonify({
            'success': False,
            'error': 'Code too long',
            'max': MAX_CODE_LENGTH
        }), 400

    # 3. Security Hardening restricted pattern keywords scan
    for pattern in BLOCKED_PATTERNS:
        if pattern in sanitized_code:
            print(f"[Security Alert] Blocked suspicious compile attempt containing '{pattern}' from IP {client_ip}")
            return jsonify({
                'success': False,
                'error': 'Code contains restricted content',
                'pattern': pattern
            }), 400

    # Resolve board parameters (supports full FQBN or alias)
    if board in SUPPORTED_BOARDS:
        board_fqbn = SUPPORTED_BOARDS[board]
    elif ':' in board:
        board_fqbn = board
    else:
        board_fqbn = f"arduino:avr:{board}"

    # 4. Check Cache
    cached_entry = hex_cache.get(sanitized_code, board_fqbn)
    if cached_entry:
        return jsonify({
            'success': True,
            'hex': cached_entry['hex'],
            'board': cached_entry['board'],
            'program_size': cached_entry['program_size'],
            'max_size': cached_entry['max_size'],
            'percent_used': cached_entry['percent_used'],
            'cached': True,
            'compile_time_ms': 0
        }), 200

    # 5. Submit to queue manager (Priority HIGH: 1)
    increment_stat('total')
    result, queue_pos, est_wait = queue_manager.submit_compile(sanitized_code, board_fqbn, client_ip)

    # Prepare response headers mapping queue positions
    response_headers = {
        'X-Queue-Position': str(queue_pos),
        'X-Estimated-Wait-Seconds': str(est_wait)
    }

    # Handle IP concurrent limits or rate limit error
    if 'success' in result and not result['success'] and result.get('status_code') == 429:
        increment_stat('failed')
        res_obj = jsonify({
            'success': False,
            'error': result.get('error'),
            'message': result.get('message')
        })
        return res_obj, 429, response_headers

    # Handle Queue Full
    if result.get('queue_full'):
        increment_stat('failed')
        res_obj = jsonify({
            'success': False,
            'error': result.get('error', 'Server busy, try again shortly')
        })
        return res_obj, 503, response_headers

    # Handle Timeout
    if result.get('error') == 'Request timed out':
        increment_stat('failed')
        res_obj = jsonify({
            'success': False,
            'error': 'Compilation timed out. Please verify your sketch loop bounds or library dependencies.'
        })
        return res_obj, 504, response_headers

    # Handle compilation failure
    if not result.get('success'):
        increment_stat('failed')
        res_obj = jsonify({
            'success': False,
            'error': result.get('error', 'Compilation failed'),
            'details': result.get('details', []),
            'raw_stderr': result.get('raw_stderr', '')
        })
        return res_obj, 400, response_headers

    # 6. Save successful result to cache
    hex_cache.set(
        sanitized_code, board_fqbn, result['hex'],
        result['program_size'], result['max_size'], result['percent_used']
    )
    increment_stat('success')

    # 7. Return success response
    success_payload = {
        'success': True,
        'hex': result['hex'],
        'board': result['board'],
        'program_size': result['program_size'],
        'max_size': result['max_size'],
        'percent_used': result['percent_used'],
        'cached': False,
        'compile_time_ms': result.get('compile_time_ms', 0)
    }
    
    # Inject auto_installed array if auto-installation retried successfully
    if 'auto_installed' in result:
        success_payload['auto_installed'] = result['auto_installed']

    res_obj = jsonify(success_payload)
    return res_obj, 200, response_headers

@app.route('/stats', methods=['GET'])
def server_stats():
    """Returns comprehensive server runtime and cache statistics."""
    uptime = int(time.time() - START_TIME)
    q_stats = queue_manager.status()
    c_stats = hex_cache.stats()
    sched_stats = scheduler.get_status()
    
    hits = c_stats.get('total_hits', 0)
    misses = c_stats.get('total_misses', 0)
    total_cached = hits + misses
    hit_rate = f"{round((hits / total_cached) * 100, 1)}%" if total_cached > 0 else "0.0%"

    return jsonify({
        'uptime_seconds': uptime,
        'total_compilations': total_compilations,
        'successful_compilations': successful_compilations,
        'failed_compilations': failed_compilations,
        'cache_hits': hits,
        'cache_miss': misses,
        'cache_hit_rate': hit_rate,
        'auto_installs_performed': ArduinoCompiler.auto_installs_count,
        'libraries_installed': sched_stats.get('libraries_installed', 0),
        'active_workers': q_stats.get('active_workers', 0),
        'queue_size': q_stats.get('queue_size', 0),
        'last_library_update': sched_stats.get('last_update', 'Never'),
        'next_library_update': sched_stats.get('next_update', 'Pending'),
        'common_sketches_cached': c_stats.get('permanent_entries', 0)
    }), 200

@app.route('/libraries/check', methods=['POST'])
def check_libraries():
    """Checks header files availability and auto-install states."""
    body = request.get_json() or {}
    headers = body.get('headers', [])
    
    if not isinstance(headers, list):
        return jsonify({
            'success': False,
            'error': "Missing or invalid required list field: 'headers'"
        }), 400
        
    try:
        # Check system installed libs
        installed_data = LibraryManager.list_installed()
        installed_libs = {lib['name'] for lib in installed_data.get('libraries', [])}
    except Exception:
        installed_libs = set()
        
    available = []
    missing = []
    auto_installable = []
    
    # Core Arduino AVR standard libraries which are always available
    core_headers = {'Wire.h', 'SPI.h', 'Stepper.h', 'LiquidCrystal.h'}
    
    for h in headers:
        if h in core_headers:
            available.append(h)
        elif h in HEADER_TO_LIBRARY:
            lib = HEADER_TO_LIBRARY[h]
            if lib in installed_libs:
                available.append(h)
            else:
                missing.append(h)
                auto_installable.append(h)
        else:
            missing.append(h)
            # Not in mapped registry, not auto-installable
            
    return jsonify({
        'available': available,
        'missing': missing,
        'auto_installable': auto_installable
    }), 200

@app.route('/scheduler/status', methods=['GET'])
def scheduler_status():
    """Returns LibraryScheduler background operational status."""
    return jsonify(scheduler.get_status()), 200

# ═══════════════════════════════════════
# EXISTING ENDPOINTS
# ═══════════════════════════════════════

@app.route('/health', methods=['GET'])
def health():
    uptime = round(time.time() - START_TIME, 2)
    q_stats = queue_manager.status()
    c_stats = hex_cache.stats()
    return jsonify({
        'status': 'ok',
        'arduino_cli': cli_version,
        'queue': q_stats,
        'cache': c_stats,
        'uptime_seconds': uptime
    }), 200

# ═══════════════════════════════════════
# HARDWARE & BRIDGE ENDPOINTS
# ═══════════════════════════════════════

@app.route('/status', methods=['GET'])
def status():
    return jsonify({
        'status': 'ok',
        'ok': True,
        'arduino_cli': cli_version,
        'uptime': round(time.time() - START_TIME, 2)
    }), 200

def detect_serial_ports():
    ports = []
    existing_addrs = set()

    # 1. Primary: Use pyserial's serial.tools.list_ports
    try:
        import serial.tools.list_ports
        for p in serial.tools.list_ports.comports():
            dev = p.device
            desc = p.description or ''
            if any(skip in dev.lower() for skip in ['bluetooth', 'debug-console', 'gms', 'oppo']):
                continue
            if dev not in existing_addrs:
                ports.append({
                    'port': dev,
                    'board': desc if desc and desc != 'n/a' else 'USB Serial Device',
                    'fqbn': 'arduino:avr:uno'
                })
                existing_addrs.add(dev)
    except Exception as e:
        print(f"[Ports] pyserial scan error: {e}")

    # 2. Try arduino-cli board list --json
    try:
        res = subprocess.run(ARDUINO_CLI_CMD + ['board', 'list', '--json'], capture_output=True, text=True, timeout=5)
        if res.returncode == 0 and res.stdout.strip():
            data = json.loads(res.stdout)
            detected = data.get('detected_ports', []) or data.get('ports', [])
            for p in detected:
                port_addr = p.get('port', {}).get('address') if isinstance(p.get('port'), dict) else p.get('address') or p.get('port')
                board_name = ''
                fqbn = ''
                matching_boards = p.get('matching_boards', [])
                if matching_boards and isinstance(matching_boards, list):
                    board_name = matching_boards[0].get('name', '')
                    fqbn = matching_boards[0].get('fqbn', '')
                elif isinstance(p.get('port'), dict):
                    board_name = p.get('port', {}).get('label', '')
                    
                if port_addr and port_addr not in existing_addrs:
                    ports.append({
                        'port': port_addr,
                        'board': board_name or 'Arduino Device',
                        'fqbn': fqbn or 'arduino:avr:uno'
                    })
                    existing_addrs.add(port_addr)
    except Exception:
        pass
        
    # 3. Also scan OS dev nodes for macOS/Linux /dev/cu.usb*, /dev/ttyUSB*, /dev/ttyACM*
    system_patterns = ['/dev/cu.usb*', '/dev/cu.wchusb*', '/dev/cu.SLAB*', '/dev/ttyUSB*', '/dev/ttyACM*', '/dev/tty.usb*']
    for pat in system_patterns:
        for p in glob.glob(pat):
            if p not in existing_addrs:
                ports.append({
                    'port': p,
                    'board': 'USB Serial Port',
                    'fqbn': 'arduino:avr:uno'
                })
                existing_addrs.add(p)
                
    return ports

@app.route('/ports', methods=['GET'])
def get_ports():
    ports = detect_serial_ports()
    return jsonify({
        'ok': True,
        'ports': ports
    }), 200

@app.route('/upload', methods=['POST'])
def upload_sketch():
    body = request.get_json() or {}
    code = body.get('code')
    port = body.get('port')
    fqbn = body.get('fqbn', 'arduino:avr:uno')
    
    if not code:
        return jsonify({'success': False, 'error': 'Missing code parameter'}), 400
    if not port:
        return jsonify({'success': False, 'error': 'Missing port parameter'}), 400
        
    # Compile first to ensure code compiles clean
    compile_res = ArduinoCompiler.compile_with_auto_install(code, fqbn)
    if not compile_res.get('success'):
        return jsonify({
            'success': False,
            'error': compile_res.get('error', 'Compilation failed'),
            'details': compile_res.get('details', []),
            'stage': 'compilation'
        }), 400
        
    # Write sketch to a temporary directory and upload via arduino-cli
    try:
        with tempfile.TemporaryDirectory() as tmpdir:
            sketch_dir = os.path.join(tmpdir, 'sketch')
            os.makedirs(sketch_dir, exist_ok=True)
            sketch_file = os.path.join(sketch_dir, 'sketch.ino')
            with open(sketch_file, 'w', encoding='utf-8') as f:
                f.write(code)
                
            upload_cmd = ARDUINO_CLI_CMD + ['compile', '--upload', '-b', fqbn, '-p', port, sketch_dir]
            res = subprocess.run(upload_cmd, capture_output=True, text=True, timeout=60)
            if res.returncode == 0:
                return jsonify({
                    'success': True,
                    'message': f"Uploaded successfully to {port} ({fqbn})",
                    'details': res.stdout.strip()
                }), 200
            else:
                return jsonify({
                    'success': False,
                    'error': f"Upload failed: {res.stderr.strip() or res.stdout.strip()}",
                    'stage': 'upload'
                }), 400
    except Exception as e:
        return jsonify({
            'success': False,
            'error': f"Upload exception: {str(e)}",
            'stage': 'upload'
        }), 500

@app.route('/serial', methods=['GET'])
def read_serial_log():
    return jsonify({'ok': True, 'output': []}), 200

@app.route('/boards', methods=['GET'])
def boards():
    inst = CoreManager.list_installed()
    installed_cores = inst.get('cores', [])
    # Flatten boards
    all_boards = [
        {'id': 'uno', 'name': 'Arduino Uno (ATmega328P)', 'fqbn': 'arduino:avr:uno'}
    ]
    for c in installed_cores:
        for b in c.get('boards', []):
            all_boards.append({'id': b.lower().replace(' ', '_'), 'name': b, 'fqbn': f"{c['id']}:{b.lower().replace(' ', '')}"})
    return jsonify({'boards': all_boards}), 200

# ─── Cores & Board Manager Routes ───────────────────────────────────────────
@app.route('/cores/search', methods=['GET'])
def search_cores():
    query = request.args.get('q', '')
    result = CoreManager.search(query)
    return jsonify(result), 200

@app.route('/cores/installed', methods=['GET'])
def list_installed_cores():
    result = CoreManager.list_installed()
    return jsonify(result), 200

@app.route('/cores/install', methods=['POST'])
def install_core():
    body = request.get_json() or {}
    core = body.get('core') or body.get('id')
    version = body.get('version')
    if not core:
        return jsonify({'success': False, 'error': "Missing field: 'core'"}), 400
        
    result = CoreManager.install(core, version)
    status_code = 200 if result.get('success') else 400
    return jsonify(result), status_code

@app.route('/cores/uninstall', methods=['POST'])
def uninstall_core():
    body = request.get_json() or {}
    core = body.get('core') or body.get('id')
    if not core:
        return jsonify({'success': False, 'error': "Missing field: 'core'"}), 400
        
    result = CoreManager.uninstall(core)
    status_code = 200 if result.get('success') else 400
    return jsonify(result), status_code

# ─── Library Manager Routes ──────────────────────────────────────────────────
@app.route('/libraries/install', methods=['POST'])
def install_library():
    body = request.get_json() or {}
    library = body.get('library') or body.get('name')
    version = body.get('version')
    if not library:
        return jsonify({'success': False, 'error': "Missing field: 'library'"}), 400
        
    result = LibraryManager.install(library, version)
    if result.get('success'):
        return jsonify({'success': True, 'message': f"Library '{library}' installed successfully."}), 200
    else:
        return jsonify({'success': False, 'error': result.get('error'), 'details': result.get('details', '')}), 400

@app.route('/libraries/uninstall', methods=['POST'])
def uninstall_library():
    body = request.get_json() or {}
    library = body.get('library') or body.get('name')
    if not library:
        return jsonify({'success': False, 'error': "Missing field: 'library'"}), 400
        
    result = LibraryManager.uninstall(library)
    if result.get('success'):
        return jsonify({'success': True, 'message': 'Uninstalled successfully'}), 200
    else:
        return jsonify({'success': False, 'error': result.get('error')}), 400

@app.route('/libraries/search', methods=['GET'])
def search_libraries():
    query = request.args.get('q', '')
    result = LibraryManager.search(query)
    if 'error' in result:
        return jsonify({'success': False, 'error': result['error']}), 400
    return jsonify(result), 200

@app.route('/libraries/installed', methods=['GET'])
def list_installed_libraries():
    result = LibraryManager.list_installed()
    if 'error' in result:
        return jsonify({'success': False, 'error': result['error']}), 400
    return jsonify(result), 200

@app.route('/libraries/update-index', methods=['POST'])
def update_library_index():
    result = LibraryManager.update_index()
    if result.get('success'):
        return jsonify({'success': True, 'message': 'Index updated'}), 200
    else:
        return jsonify({'success': False, 'error': result.get('error')}), 400

@app.route('/cache/stats', methods=['GET'])
def cache_stats():
    stats = hex_cache.stats()
    return jsonify(stats), 200

@app.route('/cache/clear', methods=['POST'])
def clear_cache():
    hex_cache.clear()
    return jsonify({'success': True, 'message': 'Cache cleared'}), 200

@app.route('/updates/check', methods=['GET'])
def check_updates():
    result = LibraryManager.check_outdated()
    return jsonify(result), 200

@app.route('/updates/install', methods=['POST'])
def install_updates():
    result = LibraryManager.upgrade_all()
    if result.get('success'):
        return jsonify(result), 200
    return jsonify(result), 400


# ═══════════════════════════════════════════════════════════════════════
# PREMIUM AUTH & PAID COMPILE ROUTES
# These are NEW routes. All existing routes above are completely untouched.
# ═══════════════════════════════════════════════════════════════════════

_ADMIN_SECRET = os.getenv('ADMIN_SECRET', '')

def _extract_bearer_token() -> str | None:
    """Extracts the JWT from the Authorization: Bearer <token> header."""
    auth_header = request.headers.get('Authorization', '')
    if auth_header.startswith('Bearer '):
        return auth_header[7:].strip()
    return None


@app.route('/auth/register', methods=['POST'])
def auth_register():
    """Register a new user account (plan=free by default)."""
    body = request.get_json() or {}
    name = body.get('name', '').strip()
    email = body.get('email', '').strip()
    password = body.get('password', '')

    result = auth_db.register_user(name, email, password)
    if result.get('success'):
        return jsonify({
            'success': True,
            'message': 'Account created successfully. You can now log in.'
        }), 201
    return jsonify({'success': False, 'error': result.get('error')}), 400


@app.route('/auth/login', methods=['POST'])
def auth_login():
    """Authenticate a user and return a JWT session token."""
    body = request.get_json() or {}
    email = body.get('email', '').strip()
    password = body.get('password', '')

    result = auth_db.login_user(email, password)
    if result.get('success'):
        return jsonify(result), 200
    return jsonify({'success': False, 'error': result.get('error')}), 401


@app.route('/auth/logout', methods=['POST'])
def auth_logout():
    """Invalidate the current session token."""
    token = _extract_bearer_token()
    if not token:
        return jsonify({'success': False, 'error': 'No token provided.'}), 400
    result = auth_db.logout_user(token)
    return jsonify(result), 200 if result.get('success') else 400


@app.route('/auth/me', methods=['GET'])
def auth_me():
    """Returns the currently authenticated user's info and plan."""
    token = _extract_bearer_token()
    if not token:
        return jsonify({'success': False, 'error': 'Not authenticated.'}), 401

    payload = auth_db.validate_token(token)
    if not payload:
        return jsonify({'success': False, 'error': 'Token invalid or expired. Please log in again.'}), 401

    user = auth_db.get_user(payload['user_id'])
    if not user:
        return jsonify({'success': False, 'error': 'User not found.'}), 404

    return jsonify({
        'success': True,
        'user': {
            'id': user['id'],
            'name': user.get('name') or '',
            'email': user['email'],
            'plan': user['plan'],
            'premium_expires_at': user.get('premium_expires_at') or None,
            'created_at': str(user.get('created_at', ''))
        }
    }), 200


@app.route('/compile/premium', methods=['POST'])
def compile_premium():
    """
    Premium compilation endpoint — no queue, direct compile.
    Requires a valid JWT from a user with plan='premium'.
    All existing security checks (code sanitization, blocked patterns) apply.
    """
    # ── 1. Authentication ──────────────────────────────────────────────
    token = _extract_bearer_token()
    if not token:
        return jsonify({
            'success': False,
            'error': 'Authentication required.',
            'message': 'Include your token as: Authorization: Bearer <token>'
        }), 401

    payload = auth_db.validate_token(token)
    if not payload:
        return jsonify({
            'success': False,
            'error': 'Token invalid or expired.',
            'message': 'Please log in again from Settings → Account.'
        }), 401

    # ── 2. Plan check ──────────────────────────────────────────────────
    if payload.get('plan') != 'premium':
        return jsonify({
            'success': False,
            'error': 'Premium subscription required.',
            'message': 'Send a WhatsApp message to +91 94004 68025 with your email to upgrade.'
        }), 403

    # ── 3. CLI availability ────────────────────────────────────────────
    try:
        ArduinoCompiler.verify_cli_installed()
    except RuntimeError as e:
        return jsonify({'success': False, 'error': f'Compile capacity unavailable: {str(e)}'}), 503

    # ── 4. Parse request body ──────────────────────────────────────────
    body = request.get_json() or {}
    code = body.get('code')
    board = body.get('board', 'uno')

    if code is None or not isinstance(code, str):
        return jsonify({'success': False, 'error': "Missing or invalid 'code' field."}), 400

    # ── 5. Input sanitization ──────────────────────────────────────────
    sanitized_code = code.replace('\x00', '').replace('\r\n', '\n').strip()

    if len(sanitized_code) < 10:
        return jsonify({'success': False, 'error': 'Code too short. Minimum 10 characters.'}), 400
    if len(sanitized_code) > MAX_CODE_LENGTH:
        return jsonify({'success': False, 'error': 'Code too long.', 'max': MAX_CODE_LENGTH}), 400
    if board not in SUPPORTED_BOARDS:
        return jsonify({'success': False, 'error': 'Unsupported board.', 'supported': list(SUPPORTED_BOARDS.keys())}), 400

    # ── 6. Security pattern scan ───────────────────────────────────────
    client_ip = request.remote_addr or 'unknown'
    for pattern in BLOCKED_PATTERNS:
        if pattern in sanitized_code:
            print(f"[Security/Premium] Blocked pattern '{pattern}' from user {payload.get('email')} IP {client_ip}")
            return jsonify({'success': False, 'error': 'Code contains restricted content.', 'pattern': pattern}), 400

    board_fqbn = SUPPORTED_BOARDS[board]

    # ── 7. Cache check — premium users also benefit from the shared cache
    cached_entry = hex_cache.get(sanitized_code, board_fqbn)
    if cached_entry:
        return jsonify({
            'success': True,
            'hex': cached_entry['hex'],
            'board': cached_entry['board'],
            'program_size': cached_entry['program_size'],
            'max_size': cached_entry['max_size'],
            'percent_used': cached_entry['percent_used'],
            'cached': True,
            'compile_time_ms': 0,
            'premium': True
        }), 200

    # ── 8. DIRECT compile — no queue ──────────────────────────────────
    increment_stat('total')
    result = ArduinoCompiler.compile_with_auto_install(sanitized_code, board_fqbn)

    if not result.get('success'):
        increment_stat('failed')
        return jsonify({
            'success': False,
            'error': result.get('error', 'Compilation failed'),
            'details': result.get('details', []),
            'raw_stderr': result.get('raw_stderr', '')
        }), 400

    # ── 9. Cache the result ────────────────────────────────────────────
    hex_cache.set(
        sanitized_code, board_fqbn, result['hex'],
        result['program_size'], result['max_size'], result['percent_used']
    )
    increment_stat('success')

    success_payload = {
        'success': True,
        'hex': result['hex'],
        'board': result.get('board', board_fqbn),
        'program_size': result['program_size'],
        'max_size': result['max_size'],
        'percent_used': result['percent_used'],
        'cached': False,
        'compile_time_ms': result.get('compile_time_ms', 0),
        'premium': True
    }
    if 'auto_installed' in result:
        success_payload['auto_installed'] = result['auto_installed']

    return jsonify(success_payload), 200


@app.route('/admin/upgrade', methods=['POST'])
def admin_upgrade():
    """
    Manually upgrades a user's plan to 'premium'.
    Protected by the ADMIN_SECRET environment variable.
    Usage: POST /admin/upgrade  with header X-Admin-Secret: <secret>
           body: {"email": "user@example.com"}
    Optional downgrade: body: {"email": "user@example.com", "action": "downgrade"}
    """
    # Admin secret check
    provided_secret = request.headers.get('X-Admin-Secret', '')
    if not _ADMIN_SECRET or provided_secret != _ADMIN_SECRET:
        return jsonify({'success': False, 'error': 'Unauthorized.'}), 403

    body = request.get_json() or {}
    email = body.get('email', '').strip()
    action = body.get('action', 'upgrade')  # 'upgrade' or 'downgrade'

    if not email:
        return jsonify({'success': False, 'error': "Missing 'email' field."}), 400

    if action == 'downgrade':
        result = auth_db.downgrade_to_free(email)
    else:
        result = auth_db.upgrade_to_premium(email)

    status_code = 200 if result.get('success') else 400
    return jsonify(result), status_code


@app.route('/admin/users', methods=['GET'])
def admin_list_users():
    """
    Lists all registered users (id, email, plan, created_at).
    Protected by the ADMIN_SECRET header.
    """
    provided_secret = request.headers.get('X-Admin-Secret', '')
    if not _ADMIN_SECRET or provided_secret != _ADMIN_SECRET:
        return jsonify({'success': False, 'error': 'Unauthorized.'}), 403

    users = auth_db.list_users()
    return jsonify({'success': True, 'count': len(users), 'users': users}), 200


if __name__ == '__main__':
    app.run(host=SERVER_HOST, port=SERVER_PORT)
