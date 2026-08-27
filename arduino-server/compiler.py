# compiler.py
import os
import shutil
import tempfile
import subprocess
import re
import threading
import time
import json
from pathlib import Path
from uuid import uuid4
from config import (
    ARDUINO_CLI_CMD, COMPILE_TIMEOUT_SEC, TEMP_DIR_PREFIX,
    BOARD_FLASH_LIMITS, HEADER_TO_LIBRARY
)

class ArduinoCompiler:
    # Class-level variable to count total auto-installs performed
    auto_installs_count = 0

    @staticmethod
    def verify_cli_installed() -> str:
        """
        Verify that arduino-cli is installed and returns its version string.
        Raises RuntimeError if validation fails.
        """
        try:
            result = subprocess.run(
                ARDUINO_CLI_CMD + ['version'],
                capture_output=True,
                text=True,
                check=True
            )
            match = re.search(r'Version:\s*([^\s]+)', result.stdout)
            if match:
                return match.group(1)
            return result.stdout.strip()
        except (subprocess.SubprocessError, FileNotFoundError) as e:
            raise RuntimeError(
                f"Arduino CLI is not installed or not found in PATH: {str(e)}"
            )

    @staticmethod
    def parse_errors(stderr: str, tmpdir: str, sketch_name: str) -> list:
        """
        Extract only error and warning lines from stderr, strip absolute temp paths,
        and replace them with 'sketch.ino' for a clean and readable output.
        """
        cleaned_lines = []
        tmpdir_path = Path(tmpdir).resolve()
        sketch_dir = tmpdir_path / sketch_name
        sketch_file = sketch_dir / f"{sketch_name}.ino"

        for line in stderr.splitlines():
            if 'error:' in line.lower() or 'warning:' in line.lower():
                cleaned = line
                cleaned = cleaned.replace(str(sketch_file.resolve()), 'sketch.ino')
                cleaned = cleaned.replace(str(sketch_file), 'sketch.ino')
                cleaned = cleaned.replace(str(sketch_dir.resolve()), 'sketch.ino')
                cleaned = cleaned.replace(str(sketch_dir), 'sketch.ino')
                cleaned = cleaned.replace(str(tmpdir_path.resolve()), 'sketch.ino')
                cleaned = cleaned.replace(str(tmpdir_path), 'sketch.ino')
                
                cleaned = re.sub(r'.*sketch_[a-f0-9]{8}/sketch_[a-f0-9]{8}\.ino', 'sketch.ino', cleaned)
                cleaned = re.sub(r'.*sketch_[a-f0-9]{8}\.ino', 'sketch.ino', cleaned)
                
                cleaned_lines.append(cleaned.strip())
                
        return cleaned_lines

    @staticmethod
    def truncate_code(code: str) -> str:
        """Helper to safely truncate code for console/debug logging (max 100 chars)."""
        if not code:
            return ""
        clean_code = " ".join(code.split())  # remove newlines/tabs for nice single-line logging
        if len(clean_code) > 100:
            return f"{clean_code[:100]}..."
        return clean_code

    @staticmethod
    def compile(code: str, board_fqbn: str) -> dict:
        """
        Compiles sketch code using Arduino CLI inside a unique temporary directory.
        Strictly utilizes Try/Finally to guarantee deletion of build folders in all cases.
        """
        tmpdir = tempfile.mkdtemp(prefix=TEMP_DIR_PREFIX)
        tmpdir_path = Path(tmpdir)
        
        sketch_name = f"sketch_{uuid4().hex[:8]}"
        sketch_dir = tmpdir_path / sketch_name
        sketch_file = sketch_dir / f"{sketch_name}.ino"
        
        # Log first 100 chars of code only
        log_code = ArduinoCompiler.truncate_code(code)
        print(f"[Compiler] Submitting sketch: '{log_code}' for board {board_fqbn}")
        
        try:
            sketch_dir.mkdir(parents=True, exist_ok=True)
            # Input sanitization: Strip null bytes, normalize line endings
            sanitized_code = code.replace('\x00', '').replace('\r\n', '\n')
            sketch_file.write_text(sanitized_code, encoding='utf-8')
            
            command = ARDUINO_CLI_CMD + [
                'compile',
                '--fqbn', board_fqbn,
                '--output-dir', str(tmpdir_path),
                '--warnings', 'none',
                str(sketch_dir)
            ]
            
            result = subprocess.run(
                command,
                capture_output=True,
                text=True,
                timeout=COMPILE_TIMEOUT_SEC
            )
            
            if result.returncode != 0:
                if "not found: platform not installed" in result.stderr:
                    match = re.search(r"Platform '([^']+)' not found", result.stderr)
                    platform_id = match.group(1) if match else board_fqbn.rsplit(':', 1)[0]
                    return {
                        'success': False,
                        'error': f"Platform core '{platform_id}' is not installed.",
                        'details': [
                            f"Platform core '{platform_id}' is required to compile for {board_fqbn}.",
                            "Installing core package via Boards Manager or auto-install..."
                        ],
                        'core_missing': platform_id,
                        'raw_stderr': result.stderr
                    }

                cleaned_errors = ArduinoCompiler.parse_errors(result.stderr, tmpdir, sketch_name)
                return {
                    'success': False,
                    'error': 'Compilation failed',
                    'details': cleaned_errors,
                    'raw_stderr': result.stderr
                }
                
            hex_file = tmpdir_path / f"{sketch_name}.ino.hex"
            bin_file = tmpdir_path / f"{sketch_name}.ino.bin"
            
            if hex_file.exists():
                hex_content = hex_file.read_text(encoding='utf-8')
            elif bin_file.exists():
                import base64
                hex_content = base64.b64encode(bin_file.read_bytes()).decode('ascii')
            else:
                return {
                    'success': False,
                    'error': 'Compiled binary output was not generated',
                    'raw_stderr': result.stderr
                }
            
            # Read compiled size stats
            bytes_used = 0
            percent_used = 0.0
            max_flash = BOARD_FLASH_LIMITS.get(board_fqbn, 32256)
            
            elf_file = tmpdir_path / f"{sketch_name}.ino.elf"
            if elf_file.exists():
                try:
                    size_result = subprocess.run(
                        ['avr-size', '--format=arduino', str(elf_file)],
                        capture_output=True,
                        text=True,
                        timeout=5
                    )
                    if size_result.returncode == 0:
                        prog_match = re.search(r'Program:\s+(\d+)\s+bytes\s+\(([\d.]+)%\s+Full\)', size_result.stdout)
                        if prog_match:
                            bytes_used = int(prog_match.group(1))
                            percent_used = float(prog_match.group(2))
                except Exception:
                    pass
            
            if bytes_used == 0:
                try:
                    calculated_size = 0
                    for line in hex_content.splitlines():
                        if line.startswith(':') and len(line) >= 11:
                            rectype = line[7:9]
                            if rectype == '00':
                                calculated_size += int(line[1:3], 16)
                    if calculated_size > 0:
                        bytes_used = calculated_size
                        percent_used = round((bytes_used / max_flash) * 100, 2)
                except Exception:
                    pass
                    
            return {
                'success': True,
                'hex': hex_content,
                'board': board_fqbn,
                'program_size': bytes_used,
                'max_size': max_flash,
                'percent_used': percent_used
            }
            
        finally:
            # Bulletproof: always deletes the temp directories in all cases
            shutil.rmtree(tmpdir, ignore_errors=True)

    # ═══════════════════════════════════════
    # AUTO LIBRARY INSTALLATION UPGRADES
    # ═══════════════════════════════════════

    @staticmethod
    def find_library_providing_header(header_name: str) -> str or None:
        """
        Dynamically queries arduino-cli to find a library that provides the given header filename.
        Uses multiple fallback strategies (provides qualifier, exact name match, and basic term search).
        """
        # Strategy 1: Search by provides qualifier
        try:
            print(f"[Auto-Install] Querying registry (provides qualifier) for: '{header_name}'...")
            result = subprocess.run(
                ARDUINO_CLI_CMD + ['lib', 'search', '--json', f"provides:{header_name}"],
                capture_output=True,
                text=True,
                timeout=20
            )
            if result.returncode == 0:
                data = json.loads(result.stdout)
                libs = data.get('libraries', [])
                if libs and libs[0].get('name'):
                    lib_name = libs[0].get('name')
                    print(f"[Auto-Install] Registry provides match found: '{lib_name}' for '{header_name}'")
                    return lib_name
        except Exception as e:
            print(f"[Auto-Install] Strategy 1 provides exception: {str(e)}")

        # Strategy 2: Exact library name match of the header base filename (e.g. UltraPing.h -> UltraPing)
        header_base = header_name.split('.')[0] if '.' in header_name else header_name
        try:
            print(f"[Auto-Install] Querying registry (exact name) for: '{header_base}'...")
            result = subprocess.run(
                ARDUINO_CLI_CMD + ['lib', 'search', '--json', f"name={header_base}"],
                capture_output=True,
                text=True,
                timeout=20
            )
            if result.returncode == 0:
                data = json.loads(result.stdout)
                libs = data.get('libraries', [])
                if libs and libs[0].get('name'):
                    lib_name = libs[0].get('name')
                    print(f"[Auto-Install] Registry name match found: '{lib_name}' for '{header_name}'")
                    return lib_name
        except Exception as e:
            print(f"[Auto-Install] Strategy 2 name exception: {str(e)}")

        # Strategy 3: Basic search by header base name and pick first case-insensitive match
        try:
            print(f"[Auto-Install] Querying registry (basic search) for: '{header_base}'...")
            result = subprocess.run(
                ARDUINO_CLI_CMD + ['lib', 'search', '--json', header_base],
                capture_output=True,
                text=True,
                timeout=20
            )
            if result.returncode == 0:
                data = json.loads(result.stdout)
                libs = data.get('libraries', [])
                if libs:
                    # Look for exact case-insensitive match or close name
                    for lib in libs:
                        name = lib.get('name', '')
                        if name.lower() == header_base.lower():
                            print(f"[Auto-Install] Registry basic exact match found: '{name}' for '{header_name}'")
                            return name
                    # Fallback to first search result if close enough
                    lib_name = libs[0].get('name')
                    print(f"[Auto-Install] Registry basic fallback match found: '{lib_name}' for '{header_name}'")
                    return lib_name
        except Exception as e:
            print(f"[Auto-Install] Strategy 3 basic exception: {str(e)}")

        return None

    @staticmethod
    def extract_missing_libraries(stderr: str) -> list:
        """
        Scans stderr output for fatal missing header errors and translates them
        to library names using config's HEADER_TO_LIBRARY mapping.
        If not in mapping, dynamically queries the library index.
        """
        if not stderr:
            return []
            
        missing_libs = set()
        # Regex to scan e.g. "fatal error: Servo.h: No such file or directory"
        patterns = [
            r'fatal error:\s*([^:\s\n\r]+)\s*:\s*No such file or directory',
            r'#include\s*<([^>]+)>\s*.*No such file or directory'
        ]
        
        for pattern in patterns:
            matches = re.findall(pattern, stderr)
            for header in matches:
                # Add .h extension if not matched in capturing group
                header_name = header if header.endswith('.h') else f"{header}.h"
                lib_name = HEADER_TO_LIBRARY.get(header_name)
                if not lib_name:
                    lib_name = ArduinoCompiler.find_library_providing_header(header_name)
                if lib_name:
                    missing_libs.add(lib_name)
                    
        return list(missing_libs)

    @staticmethod
    def auto_install_libraries(library_list: list) -> bool:
        """Automatically installs a list of Arduino libraries via the CLI."""
        for lib in library_list:
            print(f"[Auto-Install] Auto-installing: {lib}")
            try:
                result = subprocess.run(
                    ARDUINO_CLI_CMD + ['lib', 'install', lib],
                    capture_output=True,
                    text=True,
                    timeout=120
                )
                if result.returncode == 0:
                    ArduinoCompiler.auto_installs_count += 1
                    print(f"[Auto-Install] Successfully installed: {lib}")
                else:
                    print(f"[Auto-Install] Failed to install {lib}: {result.stderr.strip()}")
                    return False
            except Exception as e:
                print(f"[Auto-Install] Exception installing {lib}: {str(e)}")
                return False
        return True

    @staticmethod
    def compile_with_auto_install(code: str, board_fqbn: str) -> dict:
        """
        Submits code to compile. If it fails due to a missing library dependency,
        auto-installs it and retries compilation exactly once.
        """
        # ATTEMPT 1
        result = ArduinoCompiler.compile(code, board_fqbn)
        if result.get('success'):
            return result

        # Check if a core platform is missing
        core_missing = result.get('core_missing')
        if core_missing:
            print(f"[Compiler] Missing core platform detected: {core_missing}. Executing auto-install...")
            try:
                subprocess.run(ARDUINO_CLI_CMD + ['core', 'update-index'], capture_output=True, text=True, timeout=30)
                inst_res = subprocess.run(ARDUINO_CLI_CMD + ['core', 'install', core_missing], capture_output=True, text=True, timeout=300)
                if inst_res.returncode == 0:
                    print(f"[Compiler] Core '{core_missing}' installed successfully. Retrying compilation...")
                    retry_result = ArduinoCompiler.compile(code, board_fqbn)
                    if retry_result.get('success'):
                        retry_result['auto_installed_core'] = core_missing
                    return retry_result
            except Exception as e:
                print(f"[Compiler] Core auto-install error: {e}")
            return result
            
        # Parse missing headers
        stderr = result.get('raw_stderr', '')
        missing_libs = ArduinoCompiler.extract_missing_libraries(stderr)
        
        if not missing_libs:
            # Not a missing library error, return compiler output directly
            return result
            
        # ATTEMPT 2: Auto-install and retry exactly once
        print(f"[Compiler] Missing libraries detected: {missing_libs}. Executing auto-install...")
        install_success = ArduinoCompiler.auto_install_libraries(missing_libs)
        
        if not install_success:
            return {
                'success': False,
                'error': f"Could not auto-install required libraries: {missing_libs}",
                'details': [f"Failed to auto-install: {', '.join(missing_libs)}"]
            }
            
        print("[Compiler] Re-running compilation after successful library installations...")
        retry_result = ArduinoCompiler.compile(code, board_fqbn)
        
        if retry_result.get('success'):
            print("[Compiler] Compilation successful after auto-install")
            # Inject auto-installed libraries list to response so frontend can notify user
            retry_result['auto_installed'] = missing_libs
            
        return retry_result

    # ═══════════════════════════════════════
    # SYSTEM TEMPORARY DIRECTORY CLEANUPS
    # ═══════════════════════════════════════

    @staticmethod
    def cleanup_leftover_temp_dirs() -> int:
        """Scans the system temp directory and purges leftover crashed folders."""
        import glob
        pattern = os.path.join(tempfile.gettempdir(), f"{TEMP_DIR_PREFIX}*")
        purged = 0
        for dir_path in glob.glob(pattern):
            try:
                shutil.rmtree(dir_path, ignore_errors=True)
                purged += 1
            except Exception:
                pass
        if purged > 0:
            print(f"[Cleanup] Cleaned up {purged} leftover temp directories")
        return purged

    @staticmethod
    def start_periodic_cleanup_thread():
        """Starts a background daemon thread that sweeps old temporary folders every 1 hour."""
        def cleanup_worker():
            while True:
                time.sleep(3600)  # Wait 1 hour
                try:
                    import glob
                    pattern = os.path.join(tempfile.gettempdir(), f"{TEMP_DIR_PREFIX}*")
                    now = time.time()
                    deleted = 0
                    for dir_path in glob.glob(pattern):
                        try:
                            # Verify directory age
                            mtime = os.path.getmtime(dir_path)
                            # Deletes only if older than 10 minutes
                            if now - mtime > 600:
                                shutil.rmtree(dir_path, ignore_errors=True)
                                deleted += 1
                        except Exception:
                            pass
                    if deleted > 0:
                        print(f"[Cleanup] Periodic sweep deleted {deleted} expired temp directories")
                except Exception as e:
                    print(f"[Cleanup] Periodic cleanup exception: {str(e)}")

        t = threading.Thread(target=cleanup_worker, daemon=True)
        t.start()
