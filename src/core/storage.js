const KEY = "scripture-desk-state-v1";
const CHAPTER_CACHE_DB = "scripture-desk-chapters-v1";
const CHAPTER_STORE = "chapters";

export function loadState(defaultState) {
  try {
    const stored = JSON.parse(localStorage.getItem(KEY));
    return stored ? { ...defaultState, ...stored } : defaultState;
  } catch {
    return defaultState;
  }
}

export function saveState(state) {
  localStorage.setItem(KEY, JSON.stringify(state));
}

function openChapterCache() {
  return new Promise((resolve, reject) => {
    if (!window.indexedDB) return resolve(null);
    const request = indexedDB.open(CHAPTER_CACHE_DB, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(CHAPTER_STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function loadCachedChapter(key) {
  try {
    const database = await openChapterCache();
    if (!database) return null;
    return await new Promise((resolve, reject) => {
      const request = database.transaction(CHAPTER_STORE, "readonly").objectStore(CHAPTER_STORE).get(key);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  } catch {
    return null;
  }
}

export async function saveCachedChapter(key, value) {
  try {
    const database = await openChapterCache();
    if (!database) return;
    await new Promise((resolve, reject) => {
      const request = database.transaction(CHAPTER_STORE, "readwrite").objectStore(CHAPTER_STORE).put(value, key);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  } catch {
    // The reader remains usable when browser storage is unavailable.
  }
}

export async function removeCachedChapter(key) {
  try {
    const database = await openChapterCache();
    if (!database) return;
    await new Promise((resolve, reject) => {
      const request = database.transaction(CHAPTER_STORE, "readwrite").objectStore(CHAPTER_STORE).delete(key);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  } catch {
    // The reader remains usable when browser storage is unavailable.
  }
}

export function downloadFile(name, contents, mime = "text/plain;charset=utf-8") {
  const url = URL.createObjectURL(new Blob([contents], { type: mime }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  URL.revokeObjectURL(url);
}
