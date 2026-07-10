const KEY = "scripture-desk-state-v1";

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

export function downloadFile(name, contents, mime = "text/plain;charset=utf-8") {
  const url = URL.createObjectURL(new Blob([contents], { type: mime }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  URL.revokeObjectURL(url);
}
