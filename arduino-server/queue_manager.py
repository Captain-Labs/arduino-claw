# queue_manager.py
import queue
import threading
import multiprocessing
import time
import psutil
from config import COMPILE_TIMEOUT_SEC
from compiler import ArduinoCompiler
from library_manager import LibraryManager

class CompileQueueManager:
    def __init__(self):
        # 1. Detect system resources and scale workers dynamically
        self._cpu_count = multiprocessing.cpu_count()
        self._available_ram_gb = psutil.virtual_memory().available / (1024**3)
        
        # RAM calculation: ~180MB RAM per Arduino CLI compile
        ram_workers = int(self._available_ram_gb / 0.18)
        cpu_workers = max(1, self._cpu_count - 1)
        self._optimal_workers = min(ram_workers, cpu_workers)
        self._optimal_workers = max(1, min(self._optimal_workers, 8)) # min 1, max 8
        
        print(f"System: {self._cpu_count} CPUs, {self._available_ram_gb:.1f}GB RAM available")
        print(f"Starting {self._optimal_workers} compile workers")

        # 2. Priority Queue setup
        # Items in queue are tuples: (priority, timestamp, task)
        # Priority 1: HIGH priority compiles (cache misses)
        # Priority 2: LOW priority library installs
        self._queue = queue.PriorityQueue()
        self._lock = threading.Lock()
        
        self._active_workers = 0
        
        # IP Tracking structures (thread-safe protected by _lock)
        self._concurrent_compiles_per_ip = {} # IP -> int (active compiles)
        self._rate_limit_requests = {}         # IP -> list of timestamps

        # Start the background daemon worker threads
        for _ in range(self._optimal_workers):
            t = threading.Thread(target=self._worker, daemon=True)
            t.start()

    def _worker(self):
        """Worker thread infinite loop pulling items from the priority queue."""
        while True:
            # Blocking pull from PriorityQueue
            priority, timestamp, task = self._queue.get()
            
            with self._lock:
                self._active_workers += 1
                
            try:
                task_type = task.get('type', 'compile')
                if task_type == 'compile':
                    # Compile sketch using compile_with_auto_install
                    result = ArduinoCompiler.compile_with_auto_install(task['code'], task['board'])
                    task['result_container']['result'] = result
                elif task_type == 'library_install':
                    # Install library
                    result = LibraryManager.install(task['library_name'])
                    task['result_container']['result'] = result
            except Exception as e:
                task['result_container']['result'] = {
                    'success': False,
                    'error': f"Unexpected worker exception: {str(e)}"
                }
            finally:
                with self._lock:
                    self._active_workers -= 1
                    
                    # If compile, decrement concurrent active limit for this IP
                    if task_type == 'compile' and 'ip' in task:
                        ip = task['ip']
                        if ip in self._concurrent_compiles_per_ip:
                            self._concurrent_compiles_per_ip[ip] = max(0, self._concurrent_compiles_per_ip[ip] - 1)
                            
                # Signal completion
                task['event'].set()
                self._queue.task_done()

    def check_and_track_ip_limits(self, ip: str) -> dict or None:
        """
        Tracks IP-based concurrent limits and rate limiting.
        Enforces MAX 2 concurrent compiles per IP.
        Tracks but does not block rates for now.
        """
        now = time.time()
        with self._lock:
            # 1. Concurrency limit: max 2 concurrent compiles
            active = self._concurrent_compiles_per_ip.get(ip, 0)
            if active >= 2:
                return {
                    'success': False,
                    'error': 'Rate limit exceeded',
                    'message': 'You already have 2 compilations in progress',
                    'status_code': 429
                }
                
            # 2. Rate limit tracking: max 10 compilations per minute
            timestamps = self._rate_limit_requests.get(ip, [])
            # Purge timestamps older than 60 seconds
            cleaned_timestamps = [t for t in timestamps if now - t < 60]
            if len(cleaned_timestamps) >= 10:
                return {
                    'success': False,
                    'error': 'Rate limit exceeded',
                    'message': 'Max 10 compilations per minute',
                    'status_code': 429
                }
            cleaned_timestamps.append(now)
            self._rate_limit_requests[ip] = cleaned_timestamps
            
            # Increment concurrency counter
            self._concurrent_compiles_per_ip[ip] = active + 1
            
        return None

    def submit_compile(self, code: str, board: str, ip: str) -> tuple:
        """
        Submits code to the priority queue with HIGH priority (1).
        Returns a tuple: (result_dict, queue_position, estimated_wait_seconds)
        """
        # Track queue details at submission time
        queue_size = self._queue.qsize()
        position = queue_size
        estimated_wait = position * 5  # average compile ~5s

        # IP tracking limits
        limit_error = self.check_and_track_ip_limits(ip)
        if limit_error:
            return limit_error, position, estimated_wait

        event = threading.Event()
        result_container = {}
        
        task = {
            'type': 'compile',
            'code': code,
            'board': board,
            'ip': ip,
            'result_container': result_container,
            'event': event
        }
        
        # Priority 1: HIGH priority compile
        # Format: (priority, timestamp, task)
        self._queue.put((1, time.time(), task))
        
        # Wait with padded timeout
        wait_timeout = COMPILE_TIMEOUT_SEC + 5
        success = event.wait(timeout=wait_timeout)
        
        # If timeout happened
        if not success:
            with self._lock:
                if ip in self._concurrent_compiles_per_ip:
                    self._concurrent_compiles_per_ip[ip] = max(0, self._concurrent_compiles_per_ip[ip] - 1)
            return {'error': 'Request timed out'}, position, estimated_wait
            
        return result_container.get('result', {'error': 'No response from worker'}), position, estimated_wait

    def submit_library_install(self, library_name: str) -> dict:
        """
        Submits library installation to the priority queue with LOW priority (2).
        """
        event = threading.Event()
        result_container = {}
        
        task = {
            'type': 'library_install',
            'library_name': library_name,
            'result_container': result_container,
            'event': event
        }
        
        # Priority 2: LOW priority library installation
        self._queue.put((2, time.time(), task))
        
        success = event.wait(timeout=130) # Padded library install timeout
        if not success:
            return {'success': False, 'error': 'Library installation timed out'}
            
        return result_container.get('result', {'success': False, 'error': 'No response from worker'})

    def status(self) -> dict:
        """Return the active congestion status of the compile queue."""
        with self._lock:
            return {
                'queue_size': self._queue.qsize(),
                'active_workers': self._active_workers,
                'max_workers': self._optimal_workers
            }
