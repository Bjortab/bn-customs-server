// Enkel mock-cache tills vi hookar R2/KV direkt här
const memoryCache = {};

export async function cacheGet(key) {
  return memoryCache[key] || null;
}

export async function cacheSet(key, value) {
  memoryCache[key] = value;
}
