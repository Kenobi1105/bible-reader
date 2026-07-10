export function createBibleReaderWidget({ mount, onOpen } = {}) {
  if (!mount) throw new Error("A mount element is required.");
  mount.innerHTML = '<section style="padding:16px;border:1px solid #ded2be;border-radius:7px;background:#fffdf7;color:#242120;font-family:system-ui,sans-serif">' +
    '<div style="display:flex;align-items:center;justify-content:space-between;gap:12px"><div><strong>Scripture Desk</strong><div style="font-size:12px;color:#6e625c;margin-top:3px">Resume your reading and notes.</div></div>' +
    '<button type="button" style="border:0;border-radius:5px;background:#8a5a44;color:white;padding:8px 10px;cursor:pointer">Open reader</button></div></section>';
  mount.querySelector("button").addEventListener("click", () => onOpen?.());
}
