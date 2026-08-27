# scheduler.py
import os
import time
import subprocess
import threading
from datetime import datetime, timedelta
from config import ARDUINO_CLI_CMD
from library_manager import LibraryManager

LAST_UPDATE_PATH = os.path.join(os.path.dirname(__file__), 'last_update.txt')

class LibraryScheduler:
    def __init__(self):
        self._last_update = None
        self._next_update = None
        self._lock = threading.Lock()
        self._start_time = datetime.now()

    def start(self):
        """Starts the background scheduler thread."""
        t = threading.Thread(target=self._scheduler_loop, daemon=True)
        t.start()

    def _scheduler_loop(self):
        """Infinite loop running in the background thread."""
        # 1. Read last_update.txt on startup
        last_update_dt = self._read_last_update()
        now = datetime.now()

        if last_update_dt is None or (now - last_update_dt) > timedelta(hours=24):
            # Run update immediately on startup
            print("[Scheduler] No recent update found. Running platform update sequence immediately...")
            self._run_update_sequence()
            with self._lock:
                self._next_update = datetime.now() + timedelta(hours=24)
        else:
            with self._lock:
                self._last_update = last_update_dt
                self._next_update = last_update_dt + timedelta(hours=24)
            
            # Calculate sleep duration until next scheduled update
            sleep_sec = (self._next_update - now).total_seconds()
            if sleep_sec > 0:
                print(f"[Scheduler] Next update scheduled in {round(sleep_sec / 3600, 2)} hours.")
                time.sleep(sleep_sec)
                
            self._run_update_sequence()
            with self._lock:
                self._next_update = datetime.now() + timedelta(hours=24)

        # Loop daily updates
        while True:
            time.sleep(24 * 3600)  # Sleep 24 hours
            self._run_update_sequence()
            with self._lock:
                self._next_update = datetime.now() + timedelta(hours=24)

    def _run_update_sequence(self):
        """Executes the 4-step update and upgrade sequence."""
        print("[Scheduler] Starting daily core and library update sequence...")
        try:
            # Step 1: Update core index
            subprocess.run(ARDUINO_CLI_CMD + ['core', 'update-index'], check=True, capture_output=True)
            # Step 2: Update library index
            subprocess.run(ARDUINO_CLI_CMD + ['lib', 'update-index'], check=True, capture_output=True)
            # Step 3: Upgrade all libraries
            subprocess.run(ARDUINO_CLI_CMD + ['lib', 'upgrade'], check=True, capture_output=True)
            # Step 4: Upgrade core if update available
            subprocess.run(ARDUINO_CLI_CMD + ['core', 'upgrade'], check=True, capture_output=True)
            
            # Step 5: Log completion with timestamp
            now_dt = datetime.now()
            with self._lock:
                self._last_update = now_dt
            self._write_last_update(now_dt)
            print(f"[Scheduler] Update sequence successfully completed at {now_dt.isoformat()}")
        except subprocess.SubprocessError as e:
            print(f"[Scheduler] Subprocess error during update: {str(e)}")
        except Exception as e:
            print(f"[Scheduler] Unexpected error during update: {str(e)}")

    def _read_last_update(self) -> datetime or None:
        """Reads the last successful update timestamp from file."""
        if not os.path.exists(LAST_UPDATE_PATH):
            return None
        try:
            with open(LAST_UPDATE_PATH, 'r', encoding='utf-8') as f:
                content = f.read().strip()
                return datetime.fromisoformat(content)
        except Exception:
            return None

    def _write_last_update(self, dt: datetime):
        """Writes the successful update timestamp to last_update.txt."""
        try:
            with open(LAST_UPDATE_PATH, 'w', encoding='utf-8') as f:
                f.write(dt.isoformat())
        except Exception:
            pass

    def get_status(self) -> dict:
        """Returns the active scheduling health parameters."""
        # Get count of installed libraries via list_installed()
        try:
            libs_data = LibraryManager.list_installed()
            lib_count = len(libs_data.get('libraries', []))
        except Exception:
            lib_count = 0

        with self._lock:
            return {
                'last_update': self._last_update.isoformat() if self._last_update else 'Never',
                'next_update': self._next_update.isoformat() if self._next_update else 'Pending',
                'libraries_installed': lib_count
            }
