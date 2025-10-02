// src/utils/cache.js
// Enkel cache med in-memory store

const memoryCache = new Map();

export function setCache(key, value, ttlMs = 1000 * 60 * 60) {
  const expires = Date.now() + ttlMs;
  memoryCache.set(key, { value, expires });
}

export function getCache(key) {
  const entry = memoryCache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expires) {
    memoryCache.delete(key);
    return null;
  }
  return entry.value;
}

export function clearCache() {
  memoryCache.clear();
}
