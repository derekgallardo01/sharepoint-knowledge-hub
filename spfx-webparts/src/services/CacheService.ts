/**
 * CacheService - Multi-tier intelligent caching layer for the Knowledge Hub.
 *
 * Cache Tiers:
 *   1. Memory cache (fastest, lost on page unload)
 *   2. SessionStorage (survives SPA navigation, lost on tab close)
 *   3. LocalStorage (persists across sessions until TTL expires)
 *
 * Features:
 *   - TTL per entry with configurable defaults per tier
 *   - Cache invalidation by key, prefix pattern, or full flush
 *   - Hit/miss/eviction statistics with computed hit rate
 *   - Automatic cleanup of expired entries on periodic sweep
 *   - Generic getOrSet<T>(key, factory, ttl) for transparent caching
 *   - LRU eviction when storage quota is approached
 *   - Namespace isolation to prevent collisions with other SPFx web parts
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ICacheEntry<T = unknown> {
  /** The cached value. */
  v: T;
  /** Expiry timestamp (ms since epoch). 0 = no expiry. */
  e: number;
  /** Last access timestamp (ms since epoch) for LRU eviction. */
  a: number;
}

export interface ICacheStats {
  hits: number;
  misses: number;
  evictions: number;
  memorySize: number;
  sessionSize: number;
  localSize: number;
  hitRate: number;
}

export interface ICacheOptions {
  /** Namespace prefix for all keys. Default: "kh_". */
  namespace?: string;
  /** Default TTL for memory tier (ms). Default: 300,000 (5 min). */
  memoryTtl?: number;
  /** Default TTL for session tier (ms). Default: 900,000 (15 min). */
  sessionTtl?: number;
  /** Default TTL for local tier (ms). Default: 3,600,000 (1 hr). */
  localTtl?: number;
  /** Max entries in memory cache before LRU eviction. Default: 200. */
  maxMemoryEntries?: number;
  /** Max chars in localStorage for this namespace. Default: 4,000,000 (~4 MB). */
  maxLocalChars?: number;
  /** Cleanup interval (ms). Default: 60,000 (1 min). */
  cleanupInterval?: number;
}

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

const DEFAULTS: Required<ICacheOptions> = {
  namespace: "kh_",
  memoryTtl: 5 * 60 * 1000,
  sessionTtl: 15 * 60 * 1000,
  localTtl: 60 * 60 * 1000,
  maxMemoryEntries: 200,
  maxLocalChars: 4_000_000,
  cleanupInterval: 60_000,
};

// ---------------------------------------------------------------------------
// CacheService
// ---------------------------------------------------------------------------

export class CacheService {
  private readonly _opts: Required<ICacheOptions>;
  private readonly _mem: Map<string, ICacheEntry> = new Map();
  private _hits = 0;
  private _misses = 0;
  private _evictions = 0;
  private _cleanupTimer: number | null = null;

  constructor(options?: ICacheOptions) {
    this._opts = { ...DEFAULTS, ...options };
  }

  // ---- Lifecycle -----------------------------------------------------------

  /** Start periodic cleanup of expired entries. */
  public initialize(): void {
    if (this._cleanupTimer !== null) return;
    this._cleanupTimer = window.setInterval(
      () => this.cleanup(),
      this._opts.cleanupInterval
    );
  }

  /** Stop cleanup timer and release resources. */
  public dispose(): void {
    if (this._cleanupTimer !== null) {
      window.clearInterval(this._cleanupTimer);
      this._cleanupTimer = null;
    }
  }

  // ---- Core API ------------------------------------------------------------

  /**
   * Retrieve a value from cache. Checks tiers in order: memory > session > local.
   * Found values are promoted to faster tiers for subsequent access.
   */
  public get<T>(key: string): T | undefined {
    const ns = this._ns(key);
    const now = Date.now();

    // Tier 1: Memory
    const memEntry = this._mem.get(ns) as ICacheEntry<T> | undefined;
    if (memEntry && (memEntry.e === 0 || memEntry.e > now)) {
      memEntry.a = now;
      this._hits++;
      return memEntry.v;
    }
    if (memEntry) this._mem.delete(ns); // expired

    // Tier 2: SessionStorage
    const sessEntry = this._readStorage<T>(sessionStorage, ns);
    if (sessEntry) {
      this._setMem(ns, sessEntry); // promote
      this._hits++;
      return sessEntry.v;
    }

    // Tier 3: LocalStorage
    const localEntry = this._readStorage<T>(localStorage, ns);
    if (localEntry) {
      this._setMem(ns, localEntry); // promote
      this._writeStorage(sessionStorage, ns, localEntry); // promote
      this._hits++;
      return localEntry.v;
    }

    this._misses++;
    return undefined;
  }

  /**
   * Store a value in all cache tiers.
   * @param key   Cache key (namespaced internally).
   * @param value Value to cache (must be JSON-serializable for session/local).
   * @param ttl   Optional TTL override (ms). If omitted, per-tier defaults apply.
   */
  public set<T>(key: string, value: T, ttl?: number): void {
    const ns = this._ns(key);
    const now = Date.now();

    // Tier 1: Memory
    this._setMem(ns, {
      v: value,
      e: ttl !== undefined ? now + ttl : (this._opts.memoryTtl > 0 ? now + this._opts.memoryTtl : 0),
      a: now,
    } as ICacheEntry<T>);

    // Tier 2: SessionStorage
    this._writeStorage(sessionStorage, ns, {
      v: value,
      e: ttl !== undefined ? now + ttl : (this._opts.sessionTtl > 0 ? now + this._opts.sessionTtl : 0),
      a: now,
    } as ICacheEntry<T>);

    // Tier 3: LocalStorage
    const localEntry: ICacheEntry<T> = {
      v: value,
      e: ttl !== undefined ? now + ttl : (this._opts.localTtl > 0 ? now + this._opts.localTtl : 0),
      a: now,
    };
    this._ensureLocalSpace(ns, localEntry);
    this._writeStorage(localStorage, ns, localEntry);
  }

  /**
   * Transparent cache-aside: returns cached value if present, otherwise
   * invokes factory, caches the result across all tiers, and returns it.
   */
  public async getOrSet<T>(
    key: string,
    factory: () => Promise<T>,
    ttl?: number
  ): Promise<T> {
    const cached = this.get<T>(key);
    if (cached !== undefined) return cached;

    const value = await factory();
    this.set(key, value, ttl);
    return value;
  }

  // ---- Invalidation --------------------------------------------------------

  /** Remove a specific key from all tiers. */
  public invalidate(key: string): void {
    const ns = this._ns(key);
    this._mem.delete(ns);
    this._removeStorage(sessionStorage, ns);
    this._removeStorage(localStorage, ns);
  }

  /** Remove all keys matching a prefix from all tiers. */
  public invalidateByPrefix(prefix: string): void {
    const ns = this._ns(prefix);

    // Memory
    for (const k of Array.from(this._mem.keys())) {
      if (k.startsWith(ns)) { this._mem.delete(k); this._evictions++; }
    }

    // Storage
    this._removeStorageByPrefix(sessionStorage, ns);
    this._removeStorageByPrefix(localStorage, ns);
  }

  /** Clear all cache entries in all tiers (within namespace). */
  public clear(): void {
    this._mem.clear();
    this._removeStorageByPrefix(sessionStorage, this._opts.namespace);
    this._removeStorageByPrefix(localStorage, this._opts.namespace);
  }

  // ---- Statistics ----------------------------------------------------------

  public getStats(): ICacheStats {
    const total = this._hits + this._misses;
    return {
      hits: this._hits,
      misses: this._misses,
      evictions: this._evictions,
      memorySize: this._mem.size,
      sessionSize: this._countKeys(sessionStorage),
      localSize: this._countKeys(localStorage),
      hitRate: total > 0 ? Math.round((this._hits / total) * 10000) / 100 : 0,
    };
  }

  public resetStats(): void {
    this._hits = 0;
    this._misses = 0;
    this._evictions = 0;
  }

  // ---- Cleanup -------------------------------------------------------------

  /** Remove expired entries from all tiers. */
  public cleanup(): void {
    const now = Date.now();

    for (const [k, entry] of Array.from(this._mem.entries())) {
      if (entry.e > 0 && entry.e <= now) {
        this._mem.delete(k);
        this._evictions++;
      }
    }

    this._cleanupStorage(sessionStorage, now);
    this._cleanupStorage(localStorage, now);
  }

  // ---- Private helpers -----------------------------------------------------

  private _ns(key: string): string {
    return `${this._opts.namespace}${key}`;
  }

  private _setMem(nsKey: string, entry: ICacheEntry): void {
    if (this._mem.size >= this._opts.maxMemoryEntries && !this._mem.has(nsKey)) {
      this._evictLruMemory();
    }
    this._mem.set(nsKey, entry);
  }

  private _evictLruMemory(): void {
    let oldestKey: string | undefined;
    let oldestAccess = Infinity;
    for (const [k, e] of this._mem.entries()) {
      if (e.a < oldestAccess) { oldestAccess = e.a; oldestKey = k; }
    }
    if (oldestKey) { this._mem.delete(oldestKey); this._evictions++; }
  }

  private _readStorage<T>(storage: Storage, nsKey: string): ICacheEntry<T> | undefined {
    try {
      const raw = storage.getItem(nsKey);
      if (!raw) return undefined;
      const entry: ICacheEntry<T> = JSON.parse(raw);
      if (entry.e > 0 && entry.e <= Date.now()) {
        storage.removeItem(nsKey);
        return undefined;
      }
      entry.a = Date.now();
      storage.setItem(nsKey, JSON.stringify(entry));
      return entry;
    } catch {
      try { storage.removeItem(nsKey); } catch { /* noop */ }
      return undefined;
    }
  }

  private _writeStorage(storage: Storage, nsKey: string, entry: ICacheEntry): void {
    try {
      storage.setItem(nsKey, JSON.stringify(entry));
    } catch {
      this._cleanupStorage(storage, Date.now());
      try { storage.setItem(nsKey, JSON.stringify(entry)); } catch { /* quota exceeded */ }
    }
  }

  private _removeStorage(storage: Storage, nsKey: string): void {
    try { storage.removeItem(nsKey); } catch { /* noop */ }
  }

  private _removeStorageByPrefix(storage: Storage, prefix: string): void {
    try {
      const toRemove: string[] = [];
      for (let i = 0; i < storage.length; i++) {
        const k = storage.key(i);
        if (k?.startsWith(prefix)) toRemove.push(k);
      }
      for (const k of toRemove) { storage.removeItem(k); this._evictions++; }
    } catch { /* noop */ }
  }

  private _cleanupStorage(storage: Storage, now: number): void {
    try {
      const toRemove: string[] = [];
      for (let i = 0; i < storage.length; i++) {
        const k = storage.key(i);
        if (!k?.startsWith(this._opts.namespace)) continue;
        try {
          const entry: ICacheEntry = JSON.parse(storage.getItem(k)!);
          if (entry.e > 0 && entry.e <= now) toRemove.push(k);
        } catch { toRemove.push(k); }
      }
      for (const k of toRemove) { storage.removeItem(k); this._evictions++; }
    } catch { /* noop */ }
  }

  private _ensureLocalSpace(nsKey: string, entry: ICacheEntry): void {
    try {
      const serialized = JSON.stringify(entry);
      let total = 0;
      const entries: Array<{ key: string; size: number; access: number }> = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (!k?.startsWith(this._opts.namespace)) continue;
        const val = localStorage.getItem(k);
        if (!val) continue;
        total += val.length;
        try {
          const e: ICacheEntry = JSON.parse(val);
          entries.push({ key: k, size: val.length, access: e.a });
        } catch { /* skip corrupt */ }
      }

      if (total + serialized.length <= this._opts.maxLocalChars) return;

      // Evict LRU until enough space
      entries.sort((a, b) => a.access - b.access);
      let freed = 0;
      const needed = total + serialized.length - this._opts.maxLocalChars;
      for (const item of entries) {
        if (freed >= needed) break;
        localStorage.removeItem(item.key);
        freed += item.size;
        this._evictions++;
      }
    } catch { /* noop */ }
  }

  private _countKeys(storage: Storage): number {
    let count = 0;
    try {
      for (let i = 0; i < storage.length; i++) {
        if (storage.key(i)?.startsWith(this._opts.namespace)) count++;
      }
    } catch { /* noop */ }
    return count;
  }
}

/** Singleton instance with default configuration. */
export const cacheService = new CacheService();
