export function readJSON(storage, key, fallback = null) {
  try {
    const raw = storage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

export function writeJSON(storage, key, value) {
  try {
    storage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage can be unavailable in private mode or when the quota is full.
  }
}

export function removeKey(storage, key) {
  try {
    storage.removeItem(key);
  } catch {
    // Ignore storage errors.
  }
}