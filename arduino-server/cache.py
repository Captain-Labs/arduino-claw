# cache.py
import hashlib
import json
import os
import threading
import atexit
from datetime import datetime
from config import CACHE_MAX_ENTRIES

CACHE_FILE_PATH = os.path.join(os.path.dirname(__file__), 'hex_cache.json')

class HexCache:
    def __init__(self):
        self._cache = {}
        self._lock = threading.Lock()
        self._total_hits = 0
        self._total_misses = 0

        # Register save_to_disk for automatic execution on clean exit
        atexit.register(self.save_to_disk)

    def _generate_key(self, code: str, board: str) -> str:
        """Generates an MD5 hash key from the combined sketch code and board FQBN."""
        # Normalize input by stripping null bytes and whitespace to avoid minor variations
        norm_code = code.replace('\x00', '').strip()
        hash_input = f"{norm_code}{board}".encode('utf-8')
        return hashlib.md5(hash_input).hexdigest()

    def get(self, code: str, board: str) -> dict or None:
        """
        Retrieve cached compilation result.
        Returns a copy of the cache entry if present and increments hit count.
        """
        key = self._generate_key(code, board)
        with self._lock:
            entry = self._cache.get(key)
            if entry:
                self._total_hits += 1
                entry['hit_count'] += 1
                return entry.copy()
            else:
                self._total_misses += 1
        return None

    def set(self, code: str, board: str, hex_content: str, program_size: int, max_size: int, percent_used: float, permanent: bool = False, sketch_name: str = None):
        """
        Cache a compiled result.
        Evicts least-used and oldest non-permanent entries if total cache size exceeds limit.
        """
        key = self._generate_key(code, board)
        now_str = datetime.now().isoformat()
        
        with self._lock:
            self._cache[key] = {
                'hex': hex_content,
                'board': board,
                'program_size': program_size,  # maps to size_bytes
                'max_size': max_size,
                'percent_used': percent_used,
                'timestamp': now_str,
                'hit_count': self._cache[key]['hit_count'] if key in self._cache else 0,
                'permanent': permanent,
                'sketch_name': sketch_name
            }

            # If cache exceeds limit, perform LRU eviction on non-permanent items
            if len(self._cache) > CACHE_MAX_ENTRIES:
                self._evict_lru()

    def _evict_lru(self):
        """
        LRU Eviction Policy:
        Sorts non-permanent entries by hit_count ASC, then by timestamp ASC (least hit + oldest first).
        Removes the bottom 50 entries.
        """
        # Separate non-permanent items
        non_perm = [
            (key, entry) for key, entry in self._cache.items() 
            if not entry.get('permanent', False)
        ]
        
        if not non_perm:
            return  # No eligible entries to evict

        # Sort: least hit first, then oldest first
        non_perm_sorted = sorted(
            non_perm,
            key=lambda item: (item[1].get('hit_count', 0), item[1].get('timestamp', ''))
        )
        
        # Evict up to 50 entries
        to_evict = non_perm_sorted[:50]
        for key, _ in to_evict:
            self._cache.pop(key, None)

    def stats(self) -> dict:
        """Return cache health metrics."""
        with self._lock:
            total_entries = len(self._cache)
            permanent_count = sum(1 for e in self._cache.values() if e.get('permanent', False))
            
            if total_entries > 0:
                oldest_entry = min(self._cache.values(), key=lambda e: e['timestamp'])['timestamp']
            else:
                oldest_entry = None
            
            return {
                'total_entries': total_entries,
                'permanent_entries': permanent_count,
                'total_hits': self._total_hits,
                'total_misses': self._total_misses,
                'oldest_entry': oldest_entry
            }

    def clear(self):
        """Empty the entire cache, retaining ONLY permanent entries."""
        with self._lock:
            # Filters and preserves permanent entries
            self._cache = {
                key: entry for key, entry in self._cache.items() 
                if entry.get('permanent', False)
            }
            self._total_hits = 0
            self._total_misses = 0

    def save_to_disk(self):
        """Writers only non-permanent entries to hex_cache.json on clean exit."""
        with self._lock:
            non_permanent_cache = {
                key: entry for key, entry in self._cache.items()
                if not entry.get('permanent', False)
            }
        
        try:
            with open(CACHE_FILE_PATH, 'w', encoding='utf-8') as f:
                json.dump(non_permanent_cache, f, indent=2)
        except Exception as e:
            # Fail silently or print to stderr during shutdown hook
            pass

    def load_from_disk(self) -> int:
        """Restores non-permanent cache entries from disk."""
        if not os.path.exists(CACHE_FILE_PATH):
            return 0
            
        try:
            with open(CACHE_FILE_PATH, 'r', encoding='utf-8') as f:
                data = json.load(f)
                
            restored = 0
            with self._lock:
                for key, entry in data.items():
                    # Sanity check entry attributes
                    if all(k in entry for k in ['hex', 'board', 'program_size', 'max_size', 'percent_used']):
                        # Ensure loaded entries are not flagged permanent
                        entry['permanent'] = False
                        # If hit count is missing, default to 0
                        entry['hit_count'] = entry.get('hit_count', 0)
                        entry['timestamp'] = entry.get('timestamp', datetime.now().isoformat())
                        self._cache[key] = entry
                        restored += 1
            return restored
        except Exception:
            return 0
