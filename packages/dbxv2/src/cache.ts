/** In-memory LRU bounded by entry count and total bytes, with a freshness window. */

export interface LruOptions {
  /** Maximum summed `size` of the entries (default 64 MiB). */
  readonly maxBytes?: number;
  readonly maxEntries?: number;
  /** Freshness window in milliseconds (default 5 minutes); stale entries are still returned, flagged. */
  readonly ttlMs?: number;
  readonly now?: () => number;
}

export interface LruHit<V> {
  readonly value: V;
  readonly fresh: boolean;
}

interface Slot<V> {
  value: V;
  size: number;
  at: number;
}

export class LruCache<V> {
  readonly maxBytes: number;
  readonly maxEntries: number;
  readonly ttlMs: number;
  readonly #now: () => number;
  readonly #slots = new Map<string, Slot<V>>();
  #bytes = 0;

  constructor(options: LruOptions = {}) {
    this.maxBytes = options.maxBytes ?? 64 * 1024 * 1024;
    this.maxEntries = options.maxEntries ?? 512;
    this.ttlMs = options.ttlMs ?? 5 * 60 * 1000;
    this.#now = options.now ?? Date.now;
  }

  get size(): number {
    return this.#slots.size;
  }
  get bytes(): number {
    return this.#bytes;
  }

  get(key: string): LruHit<V> | undefined {
    const slot = this.#slots.get(key);
    if (!slot) return undefined;
    this.#slots.delete(key);
    this.#slots.set(key, slot); // most recently used last
    return { value: slot.value, fresh: this.#now() - slot.at <= this.ttlMs };
  }

  /** Stores a value; an entry larger than half the byte budget is not retained. */
  set(key: string, value: V, size: number): boolean {
    this.delete(key);
    if (size > this.maxBytes / 2) return false;
    this.#slots.set(key, { value, size, at: this.#now() });
    this.#bytes += size;
    while (this.#slots.size > this.maxEntries || this.#bytes > this.maxBytes) {
      const oldest = this.#slots.keys().next();
      if (oldest.done) break;
      this.delete(oldest.value);
    }
    return true;
  }

  /** Marks an entry fresh again (successful revalidation). */
  touch(key: string): void {
    const slot = this.#slots.get(key);
    if (slot) slot.at = this.#now();
  }

  delete(key: string): boolean {
    const slot = this.#slots.get(key);
    if (!slot) return false;
    this.#bytes -= slot.size;
    return this.#slots.delete(key);
  }

  clear(): void {
    this.#slots.clear();
    this.#bytes = 0;
  }
}
