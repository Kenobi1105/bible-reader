import { BOOKS, chapterCount, displayReference, findPericope, parseReference } from "../core/references.js";
import { TRANSLATIONS, getChapter } from "../core/bible-sources.js";
import { downloadFile, loadState, saveState } from "../core/storage.js";

const app = document.querySelector("#app");
const defaultState = {
  tabs: [{ id: "tab-1", label: "John 1", panes: [
    { reference: { book: "John", chapter: 1, verse: 1 }, translation: "NET", scope: "pericope" },
    { reference: { book: "John", chapter: 1, verse: 1 }, translation: "SBLGNT", scope: "pericope" }
  ] }],
  activeTab: "tab-1",
  activePane: 0,
  split: true,
  paper: "white",
  dark: false,
  fontSize: 19,
  highlights: {},
  bookmarks: [],
  notes: {},
  studyTab: "notes",
  noteMode: "rich",
  selectedVerse: "John 1:1"
};

let state = loadState(defaultState);
let chapterData = {};
let popoverVerse = null;
let toastTimer = null;

function icon(name) {
  return '<i data-lucide="' + name + '"></i>';
}

function escapeHtml(value) {
  return String(value || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function activeTab() {
  return state.tabs.find((tab) => tab.id === state.activeTab) || state.tabs[0];
}

function activePane() {
  return activeTab().panes[state.activePane] || activeTab().panes[0];
}

function referenceKey(pane) {
  return pane.translation + "|" + displayReference(pane.reference);
}

function selectedReference() {
  return state.selectedVerse || displayReference(activePane().reference);
}

function persist() {
  saveState(state);
}

function setRootTheme() {
  document.body.classList.toggle("dark", state.dark);
  document.documentElement.style.setProperty("--font-size", state.fontSize + "px");
}

function showToast(message) {
  let toast = document.querySelector(".toast");
  if (!toast) {
    toast = document.createElement("div");
    toast.className = "toast";
    document.body.append(toast);
  }
  toast.textContent = message;
  toast.classList.add("visible");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("visible"), 2800);
}

function options(items, current) {
  return items.map((item) => {
    const value = Array.isArray(item) ? item[0] : item;
    const label = Array.isArray(item) ? item[0] : item;
    return '<option value="' + escapeHtml(value) + '"' + (String(value) === String(current) ? " selected" : "") + '>' + escapeHtml(label) + "</option>";
  }).join("");
}

function chapterOptions(book, current) {
  return Array.from({ length: chapterCount(book) }, (_, index) => index + 1)
    .map((chapter) => '<option value="' + chapter + '"' + (Number(current) === chapter ? " selected" : "") + ">" + chapter + "</option>")
    .join("");
}

function verseOptions(current) {
  return Array.from({ length: 176 }, (_, index) => index + 1)
    .map((verse) => '<option value="' + verse + '"' + (Number(current) === verse ? " selected" : "") + ">" + verse + "</option>")
    .join("");
}

function renderSidebar() {
  const tab = activeTab();
  const tabs = state.tabs.map((item) =>
    '<button class="tab-row ' + (item.id === tab.id ? "active" : "") + '" data-tab="' + item.id + '">' +
      icon("book-open") + '<span>' + escapeHtml(item.label) + '</span>' +
      '<span class="tab-close" data-close-tab="' + item.id + '" title="Close tab">' + icon("x") + "</span>" +
    "</button>"
  ).join("");
  return '<aside class="sidebar">' +
    '<div class="brand"><div class="brand-mark">' + icon("book-open") + '</div><div>Scripture Desk<span>read. notice. remember.</span></div></div>' +
    '<div class="side-section"><div class="side-label">Workspace</div>' +
      '<button class="nav-item active" data-nav="reader">' + icon("library-big") + '<span>Reading desk</span></button>' +
      '<button class="nav-item" data-study-open="bookmarks">' + icon("bookmark") + '<span>Bookmarks</span></button>' +
      '<button class="nav-item" data-study-open="notes">' + icon("notebook-pen") + '<span>Notes</span></button>' +
    "</div>" +
    '<div class="side-section"><div class="side-label">Open tabs</div>' + tabs +
      '<button class="nav-item" data-new-tab="true">' + icon("plus") + '<span>New passage</span></button></div>' +
    '<div class="side-bottom"><button class="nav-item" data-action="settings">' + icon("settings-2") + '<span>Reader settings</span></button></div>' +
  "</aside>";
}

function renderControls() {
  const pane = activePane();
  const pericope = findPericope(pane.reference);
  const translationOptions = Object.entries(TRANSLATIONS).map(([id, translation]) =>
    '<option value="' + id + '"' + (pane.translation === id ? " selected" : "") + ">" + translation.label + "</option>"
  ).join("");
  return '<div class="reader-controls">' +
    '<select data-control="translation" aria-label="Bible version">' + translationOptions + "</select>" +
    '<select data-control="book" aria-label="Book">' + options(BOOKS, pane.reference.book) + "</select>" +
    '<select data-control="chapter" aria-label="Chapter">' + chapterOptions(pane.reference.book, pane.reference.chapter) + "</select>" +
    '<select data-control="verse" aria-label="Verse">' + verseOptions(pane.reference.verse) + "</select>" +
    '<div class="control-spacer"></div>' +
    '<div class="segmented" aria-label="Passage scope">' +
      '<button data-scope="verse" class="' + (pane.scope === "verse" ? "active" : "") + '">Verse</button>' +
      '<button data-scope="pericope" class="' + (pane.scope === "pericope" ? "active" : "") + '">Pericope</button>' +
    "</div>" +
    '<button class="icon-button ' + (state.split ? "active" : "") + '" data-action="split" title="Toggle split screen">' + icon("columns-2") + "</button>" +
    '<span class="side-label" style="color:var(--muted);padding:0">' + escapeHtml(pericope.title) + "</span>" +
  "</div>";
}

function emptyReader(translation, result) {
  return '<div class="verse-list"><div class="empty-state"><strong>Text not available yet.</strong><br>' +
    escapeHtml(result?.message || "Loading the selected chapter...") +
    (translation.kind === "local" ? '<br><br>Add the approved local JSON file in public/data to enable this version offline.' : "") +
  "</div></div>";
}

function renderPane(pane, paneIndex) {
  const translation = TRANSLATIONS[pane.translation];
  const result = chapterData[referenceKey(pane)];
  const pericope = findPericope(pane.reference);
  let verses = result?.verses || [];
  if (pane.scope === "verse") verses = verses.filter((verse) => verse.number === Number(pane.reference.verse));
  if (pane.scope === "pericope" && pericope.to) verses = verses.filter((verse) => verse.number >= pericope.from && verse.number <= pericope.to);
  const currentRef = displayReference(pane.reference);
  const classes = "reader-pane paper-" + state.paper + (translation.script ? " lang-" + translation.script : "") + (paneIndex === state.activePane ? " active-pane" : "");
  const versesHtml = verses.length ? verses.map((verse) => {
    const verseRef = pane.reference.book + " " + pane.reference.chapter + ":" + verse.number;
    const highlight = state.highlights[verseRef] ? " highlight-" + state.highlights[verseRef] : "";
    const selected = state.selectedVerse === verseRef ? " selected" : "";
    return '<span class="verse' + highlight + selected + '" data-verse="' + escapeHtml(verseRef) + '" data-pane="' + paneIndex + '" dir="' + translation.direction + '">' +
      '<sup class="verse-number">' + verse.number + "</sup>" + escapeHtml(verse.text) + '</span><span class="verse-spacer"> </span>';
  }).join("") : emptyReader(translation, result);
  return '<article class="' + classes + '" data-activate-pane="' + paneIndex + '">' +
    '<div class="pane-header"><div class="pane-kicker">' + escapeHtml(translation.label) + " · " + escapeHtml(translation.language) + '</div>' +
      '<h1 class="chapter-title">' + escapeHtml(pericope.title) + '</h1><p class="pane-meta">' + escapeHtml(currentRef) + " · " + escapeHtml(translation.name) + "</p></div>" +
    '<div class="passage-choice"><span>Reading</span>' +
      '<button data-pane-scope="' + paneIndex + '|verse" class="' + (pane.scope === "verse" ? "active" : "") + '">selected verse</button>' +
      '<button data-pane-scope="' + paneIndex + '|pericope" class="' + (pane.scope === "pericope" ? "active" : "") + '">whole pericope</button>' +
    "</div>" + versesHtml +
    '<div class="source-status ' + (result?.error ? "warning" : "") + '">' + icon(result?.error ? "circle-alert" : "cloud-check") +
      "<span>" + escapeHtml(result?.message || "Loading chapter...") + "</span></div>" +
  "</article>";
}

function htmlToMarkdown(html) {
  const holder = document.createElement("div");
  holder.innerHTML = html || "";
  return holder.innerHTML
    .replace(/<strong>(.*?)<\/strong>/gi, "**$1**")
    .replace(/<b>(.*?)<\/b>/gi, "**$1**")
    .replace(/<em>(.*?)<\/em>/gi, "*$1*")
    .replace(/<i>(.*?)<\/i>/gi, "*$1*")
    .replace(/<u>(.*?)<\/u>/gi, "<u>$1</u>")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<p[^>]*>/gi, "")
    .replace(/<li>(.*?)<\/li>/gi, "- $1\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .trim();
}

function markdownToHtml(markdown) {
  return escapeHtml(markdown || "")
    .replace(/^### (.*)$/gm, "<h3>$1</h3>")
    .replace(/^## (.*)$/gm, "<h2>$1</h2>")
    .replace(/^# (.*)$/gm, "<h1>$1</h1>")
    .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.*?)\*/g, "<em>$1</em>")
    .replace(/\n/g, "<br>");
}

function currentNote() {
  const ref = selectedReference();
  if (!state.notes[ref]) state.notes[ref] = { html: "", markdown: "" };
  return state.notes[ref];
}

function noteMarkup() {
  const note = currentNote();
  const markdown = note.markdown || htmlToMarkdown(note.html);
  return '<div class="note-panel">' +
    '<div class="note-reference"><span>' + icon("link-2") + " " + escapeHtml(selectedReference()) + '</span>' +
      '<button class="button small" data-action="note-mode">' + (state.noteMode === "rich" ? "Markdown" : "Rich text") + "</button></div>" +
    (state.noteMode === "rich"
      ? '<div class="toolbar">' +
          '<button class="format-button" data-format="bold" title="Bold"><strong>B</strong></button>' +
          '<button class="format-button" data-format="italic" title="Italic"><em>I</em></button>' +
          '<button class="format-button" data-format="underline" title="Underline"><u>U</u></button>' +
          '<button class="format-button" data-format="insertUnorderedList" title="List">' + icon("list") + "</button>" +
          '<button class="format-button" data-format="formatBlock|blockquote" title="Quote">' + icon("quote") + "</button>" +
          '<button class="format-button" data-format="createLink" title="Link">' + icon("link") + "</button>" +
          '<input class="color-picker" data-format="foreColor" type="color" value="#8a5a44" title="Text color">' +
          '<input class="color-picker" data-format="hiliteColor" type="color" value="#f5d675" title="Highlight color">' +
        '</div><div class="note-editor" contenteditable="true" data-note-editor="true" data-placeholder="Notice what the text is doing...">' + note.html + "</div>"
      : '<textarea class="markdown-editor" data-note-markdown="true" spellcheck="true">' + escapeHtml(markdown) + "</textarea>") +
    '<div class="note-actions"><button class="button primary" data-action="save-note">' + icon("save") + "Save note</button>" +
      '<button class="button" data-action="export-md">' + icon("file-down") + ".md</button>" +
      '<button class="button" data-action="export-pdf">' + icon("file-text") + "PDF</button>" +
      '<button class="button" data-action="obsidian">' + icon("folder-output") + "Obsidian</button></div>" +
  "</div>";
}

function bookmarksMarkup() {
  const cards = state.bookmarks.length ? state.bookmarks.slice().reverse().map((bookmark) =>
    '<div class="bookmark-card" data-go-bookmark="' + escapeHtml(bookmark.reference) + '"><strong>' + escapeHtml(bookmark.reference) + "</strong>" +
      '<span>' + escapeHtml(bookmark.label || "Saved passage") + "</span></div>"
  ).join("") : '<div class="empty-state">Your saved passages will appear here.</div>';
  return '<div class="bookmark-panel"><div class="note-reference"><span>Saved passages</span><span>' + state.bookmarks.length + "</span></div>" + cards + "</div>";
}

function renderStudyPanel() {
  return '<aside class="study-panel"><div class="study-tabs">' +
    '<button data-study-tab="notes" class="' + (state.studyTab === "notes" ? "active" : "") + '">Notes</button>' +
    '<button data-study-tab="bookmarks" class="' + (state.studyTab === "bookmarks" ? "active" : "") + '">Bookmarks</button>' +
  "</div>" + (state.studyTab === "notes" ? noteMarkup() : bookmarksMarkup()) + "</aside>";
}

function renderSettings() {
  const paper = state.paper;
  return '<div class="settings-menu" id="settings-menu">' +
    '<div class="setting-row"><label><span>Text size</span><span>' + state.fontSize + " px</span></label>" +
      '<input type="range" min="15" max="28" value="' + state.fontSize + '" data-setting="font-size"></div>' +
    '<div class="setting-row"><label><span>Reader canvas</span></label><div class="theme-options">' +
      '<button class="theme-option ' + (paper === "white" ? "active" : "") + '" data-paper="white">White</button>' +
      '<button class="theme-option parchment ' + (paper === "parchment" ? "active" : "") + '" data-paper="parchment">Parchment</button>' +
      '<button class="theme-option black ' + (paper === "black" ? "active" : "") + '" data-paper="black">Black</button>' +
    "</div></div>" +
    '<button class="button" data-action="dark-mode">' + icon(state.dark ? "sun" : "moon") + (state.dark ? "Light mode" : "Dark mode") + "</button>" +
  "</div>";
}

function renderPopover() {
  if (!popoverVerse) return '<div class="verse-popover" id="verse-popover"></div>';
  const color = state.highlights[popoverVerse] || "";
  const colors = [["gold", "#f5d675"], ["rose", "#e9a6a1"], ["sage", "#b9c99a"], ["blue", "#afc7d8"], ["violet", "#c7b4d8"]];
  return '<div class="verse-popover visible" id="verse-popover"><div class="popover-reference">' + escapeHtml(popoverVerse) + "</div>" +
    '<div class="swatches">' + colors.map((item) => '<button class="swatch ' + (color === item[0] ? "active" : "") + '" style="background:' + item[1] + '" data-highlight="' + item[0] + '" title="Highlight ' + item[0] + '"></button>').join("") + "</div>" +
    '<div class="popover-actions"><button class="button small" data-action="bookmark">' + icon("bookmark-plus") + "Save</button>" +
      '<button class="button small" data-action="copy-verse">' + icon("copy") + "Copy ref</button>" +
      '<button class="button small" data-action="open-note">' + icon("notebook-pen") + "Note</button>" +
      '<button class="button small" data-action="clear-highlight">Clear</button></div></div>';
}

function render() {
  setRootTheme();
  const tab = activeTab();
  const panes = state.split ? tab.panes : [tab.panes[state.activePane]];
  const paneGrid = state.split ? "split" : "single";
  app.innerHTML = '<div class="app-shell">' + renderSidebar() +
    '<main class="workspace"><header class="topbar">' +
      '<div class="reference-search">' + icon("search") +
        '<input id="reference-search" value="' + escapeHtml(displayReference(activePane().reference)) + '" aria-label="Find a reference" />' +
        '<span class="search-hint">John 3:16</span></div><div class="topbar-spacer"></div>' +
      '<button class="icon-button" data-action="settings" title="Reader settings">' + icon("sliders-horizontal") + "</button>" +
      '<button class="icon-button" data-action="new-tab" title="New tab">' + icon("plus") + "</button><div class="user-dot">JK</div>" +
    "</header>" + renderControls() +
    '<div class="desk"><section class="reading-area"><div class="pane-grid ' + paneGrid + '">' +
      panes.map((pane, index) => renderPane(pane, state.split ? index : state.activePane)).join("") +
    "</div></section>" + renderStudyPanel() + "</div></main></div>" + renderSettings() + renderPopover();
  if (window.lucide) window.lucide.createIcons();
}

async function loadPane(pane) {
  const key = referenceKey(pane);
  chapterData[key] = { verses: [], message: "Loading chapter..." };
  render();
  chapterData[key] = await getChapter(pane.reference, pane.translation);
  render();
}

function loadVisiblePanes() {
  const tab = activeTab();
  const panes = state.split ? tab.panes : [activePane()];
  panes.forEach(loadPane);
}

function closeOverlays() {
  popoverVerse = null;
  const settings = document.querySelector("#settings-menu");
  if (settings) settings.classList.remove("visible");
}

function openVersePopover(reference, target) {
  state.selectedVerse = reference;
  popoverVerse = reference;
  render();
  const popover = document.querySelector("#verse-popover");
  const rect = target.getBoundingClientRect();
  popover.style.left = Math.min(window.innerWidth - 268, Math.max(12, rect.left)) + "px";
  popover.style.top = Math.min(window.innerHeight - 145, rect.bottom + 8) + "px";
  persist();
}

function openSettings(target) {
  const menu = document.querySelector("#settings-menu");
  const rect = target.getBoundingClientRect();
  menu.classList.add("visible");
  menu.style.right = Math.max(12, window.innerWidth - rect.right) + "px";
  menu.style.top = rect.bottom + 8 + "px";
}

function newTab() {
  const pane = JSON.parse(JSON.stringify(activePane()));
  const id = "tab-" + Date.now();
  state.tabs.push({ id, label: displayReference(pane.reference), panes: [pane, { ...pane, translation: "NET" }] });
  state.activeTab = id;
  state.activePane = 0;
  persist();
  render();
  loadVisiblePanes();
}

function changeReference(next) {
  const pane = activePane();
  pane.reference = next;
  activeTab().label = displayReference(next);
  state.selectedVerse = displayReference(next);
  persist();
  render();
  loadVisiblePanes();
}

function syncNote() {
  const note = currentNote();
  const editor = document.querySelector("[data-note-editor]");
  const markdown = document.querySelector("[data-note-markdown]");
  if (editor) {
    note.html = editor.innerHTML;
    note.markdown = htmlToMarkdown(editor.innerHTML);
  }
  if (markdown) {
    note.markdown = markdown.value;
    note.html = markdownToHtml(markdown.value);
  }
  persist();
}

function noteExport() {
  syncNote();
  const note = currentNote();
  return "# " + selectedReference() + "\n\n" + (note.markdown || htmlToMarkdown(note.html)) + "\n";
}

function exportPdf() {
  syncNote();
  const note = currentNote();
  const printWindow = window.open("", "_blank");
  if (!printWindow) {
    showToast("Allow pop-ups to export this note as PDF.");
    return;
  }
  printWindow.document.write('<!doctype html><html><head><title>' + escapeHtml(selectedReference()) + '</title><style>body{font-family:Georgia,serif;max-width:760px;margin:48px auto;color:#242120;line-height:1.6}h1{font-family:Arial,sans-serif;font-size:22px}</style></head><body><h1>' + escapeHtml(selectedReference()) + '</h1>' + (note.html || markdownToHtml(note.markdown)) + "</body></html>");
  printWindow.document.close();
  printWindow.focus();
  setTimeout(() => printWindow.print(), 250);
}

async function saveToObsidian() {
  const contents = noteExport();
  const filename = selectedReference().replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "") + ".md";
  if (!window.showDirectoryPicker) {
    downloadFile(filename, contents, "text/markdown;charset=utf-8");
    showToast("Downloaded an Obsidian-ready Markdown file.");
    return;
  }
  try {
    const directory = await window.showDirectoryPicker({ mode: "readwrite" });
    const handle = await directory.getFileHandle(filename, { create: true });
    const writer = await handle.createWritable();
    await writer.write(contents);
    await writer.close();
    showToast("Saved to the selected Obsidian folder.");
  } catch (error) {
    if (error.name !== "AbortError") showToast("Could not save to the selected folder.");
  }
}

app.addEventListener("click", async (event) => {
  const close = event.target.closest("[data-close-tab]");
  if (close) {
    event.stopPropagation();
    if (state.tabs.length === 1) return showToast("Keep at least one reading tab open.");
    const id = close.dataset.closeTab;
    state.tabs = state.tabs.filter((tab) => tab.id !== id);
    if (state.activeTab === id) state.activeTab = state.tabs[0].id;
    persist(); render(); loadVisiblePanes(); return;
  }
  const tab = event.target.closest("[data-tab]");
  if (tab) { state.activeTab = tab.dataset.tab; state.activePane = 0; persist(); render(); loadVisiblePanes(); return; }
  const verse = event.target.closest("[data-verse]");
  if (verse) { state.activePane = Number(verse.dataset.pane); openVersePopover(verse.dataset.verse, verse); return; }
  const pane = event.target.closest("[data-activate-pane]");
  if (pane) { state.activePane = Number(pane.dataset.activatePane); persist(); render(); return; }
  const scope = event.target.closest("[data-scope]");
  if (scope) { activePane().scope = scope.dataset.scope; persist(); render(); return; }
  const paneScope = event.target.closest("[data-pane-scope]");
  if (paneScope) { const parts = paneScope.dataset.paneScope.split("|"); activeTab().panes[Number(parts[0])].scope = parts[1]; state.activePane = Number(parts[0]); persist(); render(); return; }
  const study = event.target.closest("[data-study-tab], [data-study-open]");
  if (study) { state.studyTab = study.dataset.studyTab || study.dataset.studyOpen; persist(); render(); return; }
  const highlighter = event.target.closest("[data-highlight]");
  if (highlighter) { state.highlights[popoverVerse] = highlighter.dataset.highlight; persist(); render(); return; }
  const bookmark = event.target.closest("[data-go-bookmark]");
  if (bookmark) { const parsed = parseReference(bookmark.dataset.goBookmark); if (parsed) { changeReference(parsed); state.studyTab = "bookmarks"; } return; }
  const paper = event.target.closest("[data-paper]");
  if (paper) { state.paper = paper.dataset.paper; persist(); render(); openSettings(event.target); return; }
  const actionTarget = event.target.closest("[data-action], [data-new-tab]");
  if (!actionTarget) {
    if (!event.target.closest("#verse-popover") && !event.target.closest("#settings-menu")) closeOverlays();
    return;
  }
  const action = actionTarget.dataset.action || "new-tab";
  if (action === "new-tab") return newTab();
  if (action === "split") { state.split = !state.split; persist(); render(); loadVisiblePanes(); return; }
  if (action === "settings") return openSettings(actionTarget);
  if (action === "dark-mode") { state.dark = !state.dark; persist(); render(); return; }
  if (action === "bookmark") {
    if (!state.bookmarks.some((item) => item.reference === popoverVerse)) state.bookmarks.push({ reference: popoverVerse, label: "Saved passage" });
    state.studyTab = "bookmarks"; persist(); popoverVerse = null; render(); showToast("Passage saved."); return;
  }
  if (action === "copy-verse") { await navigator.clipboard?.writeText(popoverVerse); showToast("Reference copied."); return; }
  if (action === "open-note") { state.studyTab = "notes"; popoverVerse = null; persist(); render(); return; }
  if (action === "clear-highlight") { delete state.highlights[popoverVerse]; persist(); popoverVerse = null; render(); return; }
  if (action === "note-mode") {
    syncNote(); state.noteMode = state.noteMode === "rich" ? "markdown" : "rich"; persist(); render(); return;
  }
  if (action === "save-note") { syncNote(); showToast("Note saved on this device."); return; }
  if (action === "export-md") { downloadFile(selectedReference().replace(/[^a-z0-9]+/gi, "-") + ".md", noteExport(), "text/markdown;charset=utf-8"); return; }
  if (action === "export-pdf") return exportPdf();
  if (action === "obsidian") return saveToObsidian();
});

app.addEventListener("change", (event) => {
  const control = event.target.dataset.control;
  if (control) {
    const pane = activePane();
    if (control === "translation") pane.translation = event.target.value;
    if (control === "book") { pane.reference.book = event.target.value; pane.reference.chapter = 1; pane.reference.verse = 1; }
    if (control === "chapter") { pane.reference.chapter = Number(event.target.value); pane.reference.verse = 1; }
    if (control === "verse") pane.reference.verse = Number(event.target.value);
    activeTab().label = displayReference(pane.reference);
    state.selectedVerse = displayReference(pane.reference);
    persist(); render(); loadVisiblePanes(); return;
  }
  if (event.target.dataset.setting === "font-size") {
    state.fontSize = Number(event.target.value); persist(); render(); return;
  }
});

app.addEventListener("input", (event) => {
  if (event.target.matches("[data-note-editor], [data-note-markdown]")) syncNote();
});

app.addEventListener("click", (event) => {
  const format = event.target.closest("[data-format]");
  if (!format) return;
  const [command, value] = format.dataset.format.split("|");
  if (command === "createLink") {
    const url = window.prompt("Link URL");
    if (!url) return;
    document.execCommand(command, false, url);
  } else if (event.target.matches("input[type=color]")) {
    document.execCommand(command, false, event.target.value);
  } else {
    document.execCommand(command, false, value || null);
  }
  syncNote();
});

app.addEventListener("change", (event) => {
  if (!event.target.matches("input[type=color][data-format]")) return;
  document.querySelector("[data-note-editor]")?.focus();
  document.execCommand(event.target.dataset.format, false, event.target.value);
  syncNote();
});

document.addEventListener("keydown", (event) => {
  if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
    const input = document.querySelector("#reference-search");
    if (input && document.activeElement === input) {
      const parsed = parseReference(input.value);
      if (parsed) changeReference(parsed); else showToast("Use a reference like John 3:16.");
    }
  }
});

app.addEventListener("keydown", (event) => {
  if (event.key !== "Enter" || event.target.id !== "reference-search") return;
  event.preventDefault();
  const parsed = parseReference(event.target.value);
  if (parsed) changeReference(parsed); else showToast("Use a reference like John 3:16.");
});

render();
loadVisiblePanes();
