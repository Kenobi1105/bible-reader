import { BOOKS, chapterCount, displayReference, findPericope, isOldTestament, moveChapter, parseReference } from "../core/references.js";
import { TRANSLATIONS, getChapter } from "../core/bible-sources.js";
import { downloadFile, loadCachedChapter, loadState, saveCachedChapter, saveState } from "../core/storage.js?v=2";

const app = document.querySelector("#app");
const defaultState = {
  canvasVersion: 3,
  canvases: [
    { activeTab: "canvas-0-tab-1", tabs: [{ id: "canvas-0-tab-1", label: "John 1", reference: { book: "John", chapter: 1, verse: 1 }, translation: "NET", scope: "chapter" }] },
    { activeTab: "canvas-1-tab-1", tabs: [{ id: "canvas-1-tab-1", label: "John 1", reference: { book: "John", chapter: 1, verse: 1 }, translation: "SBLGNT", scope: "chapter" }] }
  ],
  activePane: 0,
  split: false,
  studyOpen: false,
  navigatorOpen: false,
  browseStage: "books",
  browseBook: "",
  browseChapter: 1,
  paper: "white",
  dark: false,
  fontSize: 19,
  highlights: {},
  bookmarks: [],
  notes: {},
  studyTab: "notes",
  noteMode: "rich",
  selectedVerse: null
};

let state = loadState(defaultState);
if (state.canvasVersion !== 3) {
  const legacyWorkspace = state.tabs?.find((tab) => tab.id === state.activeTab) || state.tabs?.[0];
  const legacyPanes = legacyWorkspace?.panes || defaultState.canvases.map((canvas) => canvas.tabs[0]);
  state.canvases = legacyPanes.slice(0, 2).map((pane, index) => {
    const id = "canvas-" + index + "-tab-1";
    return { activeTab: id, tabs: [{ ...pane, id, label: displayReference(pane.reference), scope: "chapter" }] };
  });
  state.canvasVersion = 3;
  state.split = false;
  state.studyOpen = false;
  state.navigatorOpen = false;
  state.browseStage = "books";
}
function createRecordId(prefix) {
  return prefix + "-" + (crypto.randomUUID?.() || Date.now().toString(36) + Math.random().toString(36).slice(2));
}

state.selectedVerse = null;
state.bookmarks = (state.bookmarks || []).map((bookmark, index) => ({
  ...bookmark,
  id: bookmark.id || "bookmark-legacy-" + index + "-" + Date.now()
}));
let chapterData = {};
let popoverVerse = null;
let toastTimer = null;
let pendingArrival = null;

function icon(name) {
  return '<i data-lucide="' + name + '"></i>';
}

function escapeHtml(value) {
  return String(value || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function canvasAt(index = state.activePane) {
  return state.canvases[index];
}

function paneAt(index = state.activePane) {
  const canvas = canvasAt(index);
  return canvas.tabs.find((tab) => tab.id === canvas.activeTab) || canvas.tabs[0];
}

function activePane() {
  return paneAt(state.activePane);
}

function referenceKey(pane) {
  return pane.translation + "|" + displayReference(pane.reference);
}

function selectedReference() {
  return state.selectedVerse || displayReference(activePane().reference);
}

function offlineTranslation(reference) {
  return isOldTestament(reference.book) ? "WLC" : "SBLGNT";
}

function isTranslationApplicable(translationId, reference) {
  if (translationId === "SBLGNT") return !isOldTestament(reference.book);
  if (translationId === "WLC" || translationId === "LXX") return isOldTestament(reference.book);
  return true;
}

function updateOfflineVersion(pane) {
  if (!navigator.onLine) pane.translation = offlineTranslation(pane.reference);
}

function persist() {
  saveState({ ...state, selectedVerse: null });
}

function clearVerseSelection() {
  const changed = Boolean(state.selectedVerse || popoverVerse);
  state.selectedVerse = null;
  popoverVerse = null;
  return changed;
}

function queueArrival(paneIndex, reference) {
  pendingArrival = { paneIndex, reference: displayReference(reference) };
}

function revealArrivalIfReady(pane, key) {
  const paneIndex = state.canvases.findIndex((canvas) => canvas.tabs.some((tab) => tab.id === pane.id));
  if (!pendingArrival || pendingArrival.paneIndex !== paneIndex || key !== referenceKey(pane)) return;
  const arrival = pendingArrival;
  pendingArrival = null;
  requestAnimationFrame(() => {
    const verse = document.querySelector('[data-activate-pane="' + arrival.paneIndex + '"] [data-verse="' + arrival.reference + '"]');
    if (!verse) return;
    verse.scrollIntoView({ block: "start", behavior: "smooth" });
    verse.classList.add("arrival-flash");
    setTimeout(() => verse.classList.remove("arrival-flash"), 2400);
  });
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

function renderCanvasTabs(paneIndex) {
  const canvas = canvasAt(paneIndex);
  return '<div class="canvas-tabs">' + canvas.tabs.map((item) =>
    '<button class="canvas-tab ' + (item.id === canvas.activeTab ? "active" : "") + '" data-canvas-tab="' + paneIndex + "|" + item.id + '">' +
      '<span>' + escapeHtml(item.label) + '</span><span class="tab-close" data-close-canvas-tab="' + paneIndex + "|" + item.id + '" title="Close tab">' + icon("x") + "</span>" +
    "</button>"
  ).join("") + '<button class="canvas-tab-add" data-canvas-new="' + paneIndex + '" title="New passage tab">' + icon("plus") + "</button></div>";
}

function renderReferenceBrowser() {
  const pane = activePane();
  const selectedBook = state.browseBook || pane.reference.book;
  const selectedChapter = state.browseChapter || pane.reference.chapter;
  const booksPerRow = 9;
  const shortNames = {
    "Genesis": "Gn", "Exodus": "Ex", "Leviticus": "Lv", "Numbers": "Nm", "Deuteronomy": "Dt", "Joshua": "Jo", "Judges": "Jgs", "Ruth": "Ru",
    "1 Samuel": "1 Sm", "2 Samuel": "2 Sm", "1 Kings": "1 Kgs", "2 Kings": "2 Kgs", "1 Chronicles": "1 Ch", "2 Chronicles": "2 Ch",
    "Ezra": "Ezr", "Nehemiah": "Neh", "Esther": "Est", "Job": "Jb", "Psalms": "Ps", "Proverbs": "Prv", "Ecclesiastes": "Ecc",
    "Song of Songs": "Sg", "Isaiah": "Is", "Jeremiah": "Jer", "Lamentations": "Lam", "Ezekiel": "Ez", "Daniel": "Dn",
    "Hosea": "Hos", "Joel": "Jl", "Amos": "Am", "Obadiah": "Ob", "Jonah": "Jon", "Micah": "Mi", "Nahum": "Na", "Habakkuk": "Hb",
    "Zephaniah": "Zep", "Haggai": "Hg", "Zechariah": "Zec", "Malachi": "Mal", "Matthew": "Mt", "Mark": "Mk", "Luke": "Lk",
    "John": "Jn", "Acts": "Ac", "Romans": "Rm", "1 Corinthians": "1 Co", "2 Corinthians": "2 Co", "Galatians": "Gal",
    "Ephesians": "Eph", "Philippians": "Phil", "Colossians": "Col", "1 Thessalonians": "1 Th", "2 Thessalonians": "2 Th",
    "1 Timothy": "1 Tm", "2 Timothy": "2 Tm", "Titus": "Ti", "Philemon": "Phm", "Hebrews": "Heb", "James": "Jas",
    "1 Peter": "1 Pt", "2 Peter": "2 Pt", "1 John": "1 Jn", "2 John": "2 Jn", "3 John": "3 Jn", "Jude": "Jd", "Revelation": "Rv"
  };
  const makeBooks = (books) => books.map(([book]) =>
    '<button class="browse-chip ' + (book === selectedBook ? "selected" : "") + '" data-browse-book="' + escapeHtml(book) + '">' + shortNames[book] + "</button>"
  ).join("");
  const chapters = Array.from({ length: chapterCount(selectedBook) }, (_, index) => index + 1).map((chapter) =>
    '<button class="number-chip ' + (chapter === Number(selectedChapter) ? "selected" : "") + '" data-browse-chapter="' + chapter + '">' + chapter + "</button>"
  ).join("");
  const verses = Array.from({ length: 176 }, (_, index) => index + 1).map((verse) =>
    '<button class="number-chip ' + (verse === Number(pane.reference.verse) ? "selected" : "") + '" data-browse-verse="' + verse + '">' + verse + "</button>"
  ).join("");
  const chapterPanel = state.browseStage === "books" ? "" :
    '<section class="browse-reveal split-reveal"><div class="reveal-column"><div class="reveal-title"><strong>' + escapeHtml(selectedBook) + "</strong><button data-browse-back=\"books\" title=\"Close passage picker\">" + icon("x") + "</button></div><div class=\"chapter-grid\">" + chapters + "</div></div><div class=\"reveal-column verse-column\">" +
      (state.browseStage === "verses"
        ? '<div class="reveal-title"><strong>Verse</strong></div><div class="chapter-grid verse-grid">' + verses + "</div>"
        : '<div class="reveal-placeholder">Select a chapter</div>') +
    "</div></section>";
  const renderTestament = (label, books) => {
    let rows = '<div class="testament-row"><span>' + label + "</span></div>";
    for (let start = 0; start < books.length; start += booksPerRow) {
      const row = books.slice(start, start + booksPerRow);
      rows += '<div class="book-grid">' + makeBooks(row) + "</div>";
      if (state.browseStage !== "books" && row.some(([book]) => book === selectedBook)) rows += chapterPanel;
    }
    return rows;
  };
  return '<section class="reference-browser ' + (state.navigatorOpen ? "open" : "") + '" aria-label="Browse Bible reference">' +
    '<div class="browser-section staged-books"><div class="browser-label">Book</div>' + renderTestament("Old Testament", BOOKS.slice(0, 39)) + renderTestament("New Testament", BOOKS.slice(39)) + "</div>" +
  "</section>";
}

function renderWorkspaceHeader() {
  const reference = displayReference(activePane().reference);
  return '<header class="workspace-header"><div class="brand compact"><div class="brand-mark">' + icon("book-open") + '</div><div>Scripture Desk</div></div>' +
    '<div class="header-actions"><div class="reference-entry">' + icon("search") +
      '<input id="reference-search" value="' + escapeHtml(reference) + '" aria-label="Find a reference" placeholder="John 3:16" />' +
      '<button class="browse-trigger" data-action="toggle-browser" title="Browse book, chapter, and verse">' + icon("chevron-down") + '<span>Browse</span></button></div>' +
      '<button class="icon-button ' + (state.studyOpen ? "active" : "") + '" data-action="toggle-study" title="Study tools">' + icon("notebook-pen") + "</button>" +
      '<button class="icon-button ' + (state.split ? "active" : "") + '" data-action="split" title="Toggle split screen">' + icon("columns-2") + "</button>" +
      '<button class="icon-button" data-action="settings" title="Reader settings">' + icon("sliders-horizontal") + "</button></div>" +
    (state.split ? '<div class="mobile-pane-switch"><button data-mobile-pane="0" class="' + (state.activePane === 0 ? "active" : "") + '">' + paneAt(0).translation + '</button><button data-mobile-pane="1" class="' + (state.activePane === 1 ? "active" : "") + '">' + paneAt(1).translation + "</button></div>" : "") +
  "</header>";
}

function emptyReader(translation, result) {
  return '<div class="verse-list"><div class="empty-state"><strong>Text not available yet.</strong><br>' +
    escapeHtml(result?.message || "Loading the selected chapter...") +
    (translation.kind === "local" ? '<br><br>Add the approved local JSON file in public/data to enable this version offline.' : "") +
  "</div></div>";
}

function renderPane(pane, paneIndex) {
  const translation = TRANSLATIONS[pane.translation];
  const loadedResult = chapterData[referenceKey(pane)];
  const showingFallback = !loadedResult && pane.fallback?.result;
  const result = loadedResult || pane.fallback?.result;
  const displayTranslation = showingFallback ? TRANSLATIONS[pane.fallback.translation] : translation;
  const pericope = findPericope(pane.reference);
  let verses = result?.verses || [];
  if (pane.scope === "verse") verses = verses.filter((verse) => verse.number === Number(pane.reference.verse));
  if (pane.scope === "pericope" && pericope.to) verses = verses.filter((verse) => verse.number >= pericope.from && verse.number <= pericope.to);
  const currentRef = displayReference(pane.reference);
  const classes = "reader-pane paper-" + state.paper + (displayTranslation.script ? " lang-" + displayTranslation.script : "") + (paneIndex === state.activePane ? " active-pane" : "");
  const versionOptions = Object.entries(TRANSLATIONS).map(([id, item]) =>
    '<option value="' + id + '"' + (id === pane.translation ? " selected" : "") + (!isTranslationApplicable(id, pane.reference) ? " disabled" : "") + ">" + item.label + "</option>"
  ).join("");
  const offlineStatus = pane.loading ? '<span class="offline-status loading-status">' + icon("loader-circle") + "Loading " + translation.label + "</span>" : !navigator.onLine ? '<span class="offline-status">' + icon("wifi-off") + "Offline · " + translation.label + "</span>" : "";
  const versesHtml = verses.length ? '<div class="verse-list">' + verses.map((verse) => {
    const verseRef = pane.reference.book + " " + pane.reference.chapter + ":" + verse.number;
    const highlight = state.highlights[verseRef] ? " highlight-" + state.highlights[verseRef] : "";
    const selected = state.selectedVerse === verseRef ? " selected" : "";
    return '<span class="verse' + highlight + selected + '" data-verse="' + escapeHtml(verseRef) + '" data-pane="' + paneIndex + '" dir="' + translation.direction + '">' +
      '<sup class="verse-number">' + verse.number + "</sup>" + escapeHtml(verse.text) + '</span><span class="verse-spacer"> </span>';
  }).join("") + "</div>" : emptyReader(displayTranslation, result);
  const contextControl = pane.scope === "chapter"
    ? '<span class="chapter-context">Whole chapter</span>'
    : '<button class="show-chapter" data-action="show-whole-chapter" data-pane-index="' + paneIndex + '">' + icon("maximize-2") + "Show whole chapter</button>";
  return '<article class="' + classes + '" data-activate-pane="' + paneIndex + '">' + renderCanvasTabs(paneIndex) +
    '<div class="pane-header"><div class="pane-topline"><select class="version-select" data-pane-version="' + paneIndex + '" aria-label="Bible version">' + versionOptions + "</select>" + offlineStatus + '</div>' +
      '<div class="chapter-nav"><button class="chapter-arrow" data-chapter-nav="' + paneIndex + '|-1" title="Previous chapter">' + icon("chevron-left") + '</button><div>' +
      '<h1 class="chapter-title">' + escapeHtml(pane.reference.book) + " " + pane.reference.chapter + '</h1><p class="pane-meta">' + escapeHtml(displayTranslation.name) + " · " + escapeHtml(displayTranslation.language) + "</p></div>" +
      '<button class="chapter-arrow" data-chapter-nav="' + paneIndex + '|1" title="Next chapter">' + icon("chevron-right") + "</button></div></div>" +
    '<div class="passage-choice"><span>' + escapeHtml(pericope.title) + "</span>" + contextControl + "</div>" + versesHtml +
    '<div class="source-status ' + (result?.error ? "warning" : "") + '">' + icon(result?.error ? "circle-alert" : "cloud-check") +
      "<span>" + escapeHtml(pane.loading ? "Loading " + translation.label + " while keeping the current text visible..." : result?.message || "Loading chapter...") + "</span></div>" +
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
    '<div class="bookmark-card" data-go-bookmark="' + escapeHtml(bookmark.reference) + '"><div><strong>' + escapeHtml(bookmark.reference) + "</strong>" +
      '<span>' + escapeHtml(bookmark.label || "Saved passage") + '</span></div><button class="bookmark-remove" data-delete-bookmark="' + escapeHtml(bookmark.id) + '" title="Remove bookmark" aria-label="Remove ' + escapeHtml(bookmark.reference) + ' bookmark">' + icon("trash-2") + "</button></div>"
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
      '<button class="button small" data-action="clear-highlight">Clear</button></div>' +
    '<div class="focus-actions"><button class="button primary small" data-action="focus-pericope">' + icon("columns-2") + "Focus this pericope</button>" +
      '<button class="button small" data-action="focus-verse">' + icon("columns-2") + "Show this verse only</button></div></div>";
}

function render() {
  setRootTheme();
  const paneIndexes = state.split ? [0, 1] : [state.activePane];
  const paneGrid = state.split ? "split" : "single";
  app.innerHTML = '<main class="reader-shell">' + renderWorkspaceHeader() + renderReferenceBrowser() +
    '<div class="desk ' + (state.studyOpen ? "study-open" : "") + '"><section class="reading-area"><div class="pane-grid ' + paneGrid + '">' +
      paneIndexes.map((paneIndex) => renderPane(paneAt(paneIndex), paneIndex)).join("") +
    "</div></section>" + (state.studyOpen ? renderStudyPanel() : "") + "</div></main>" + renderSettings() + renderPopover();
  if (window.lucide) window.lucide.createIcons();
}

async function loadPane(pane) {
  updateOfflineVersion(pane);
  const key = referenceKey(pane);
  if (chapterData[key]?.verses?.length) {
    pane.loading = false;
    pane.fallback = null;
    render();
    revealArrivalIfReady(pane, key);
    return;
  }
  pane.loading = true;
  render();
  const cached = await loadCachedChapter(key);
  if (cached?.verses?.length) chapterData[key] = cached;
  else {
    chapterData[key] = await getChapter(pane.reference, pane.translation);
    if (chapterData[key].verses?.length && pane.translation !== "NET") saveCachedChapter(key, chapterData[key]);
  }
  if (referenceKey(pane) !== key) return;
  pane.loading = false;
  pane.fallback = null;
  render();
  revealArrivalIfReady(pane, key);
}

function loadVisiblePanes() {
  const paneIndexes = state.split ? [0, 1] : [state.activePane];
  paneIndexes.map((index) => paneAt(index)).forEach(loadPane);
}

function closeOverlays() {
  clearVerseSelection();
  state.navigatorOpen = false;
  const settings = document.querySelector("#settings-menu");
  if (settings) settings.classList.remove("visible");
}

function openVersePopover(reference, target) {
  if (state.selectedVerse === reference && popoverVerse === reference) {
    clearVerseSelection();
    persist();
    render();
    return;
  }
  const rect = target.getBoundingClientRect();
  state.selectedVerse = reference;
  popoverVerse = reference;
  render();
  const popover = document.querySelector("#verse-popover");
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

function newCanvasTab(paneIndex = state.activePane) {
  const canvas = canvasAt(paneIndex);
  const pane = JSON.parse(JSON.stringify(paneAt(paneIndex)));
  const id = "canvas-" + paneIndex + "-tab-" + Date.now();
  pane.id = id;
  pane.label = displayReference(pane.reference);
  pane.scope = "chapter";
  canvas.tabs.push(pane);
  canvas.activeTab = id;
  state.activePane = paneIndex;
  state.navigatorOpen = false;
  persist();
  render();
  loadVisiblePanes();
}

function changePaneReference(paneIndex, next) {
  const pane = paneAt(paneIndex);
  pane.reference = next;
  pane.label = displayReference(next);
  pane.scope = "chapter";
  updateOfflineVersion(pane);
  state.activePane = paneIndex;
  state.selectedVerse = null;
  state.navigatorOpen = false;
  queueArrival(paneIndex, next);
  persist();
  render();
  loadVisiblePanes();
}

function changeReference(next) {
  changePaneReference(state.activePane, next);
}

function navigateChapter(paneIndex, direction) {
  const next = moveChapter(paneAt(paneIndex).reference, direction);
  if (!next) return showToast("You are already at the edge of the canon.");
  changePaneReference(paneIndex, next);
}

function activateSplitFocus(scope) {
  const sourceIndex = state.activePane;
  const targetIndex = sourceIndex === 0 ? 1 : 0;
  const sourcePane = paneAt(sourceIndex);
  const reference = parseReference(popoverVerse);
  if (!reference) return;

  const focusedPane = paneAt(targetIndex);
  focusedPane.reference = reference;
  focusedPane.translation = sourcePane.translation;
  focusedPane.label = displayReference(reference);
  focusedPane.scope = scope;
  focusedPane.fallback = null;
  state.split = true;
  state.activePane = targetIndex;
  state.selectedVerse = null;
  popoverVerse = null;
  queueArrival(targetIndex, reference);
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
  const insidePicker = event.target.closest(".reference-browser");
  const pickerTrigger = event.target.closest('[data-action="toggle-browser"]');
  const insideVersePopover = event.target.closest("#verse-popover");
  const clickedVerse = event.target.closest("[data-verse]");
  if (state.navigatorOpen && !insidePicker && !pickerTrigger) state.navigatorOpen = false;
  if (!clickedVerse && !insideVersePopover) clearVerseSelection();
  const close = event.target.closest("[data-close-canvas-tab]");
  if (close) {
    event.stopPropagation();
    const [paneIndex, id] = close.dataset.closeCanvasTab.split("|");
    const canvas = canvasAt(Number(paneIndex));
    if (canvas.tabs.length === 1) return showToast("Keep at least one tab open in this canvas.");
    canvas.tabs = canvas.tabs.filter((tab) => tab.id !== id);
    if (canvas.activeTab === id) canvas.activeTab = canvas.tabs[0].id;
    persist(); render(); loadVisiblePanes(); return;
  }
  const canvasTab = event.target.closest("[data-canvas-tab]");
  if (canvasTab) {
    const [paneIndex, id] = canvasTab.dataset.canvasTab.split("|");
    canvasAt(Number(paneIndex)).activeTab = id;
    state.activePane = Number(paneIndex);
    persist(); render(); loadVisiblePanes(); return;
  }
  const canvasNew = event.target.closest("[data-canvas-new]");
  if (canvasNew) return newCanvasTab(Number(canvasNew.dataset.canvasNew));
  const mobilePane = event.target.closest("[data-mobile-pane]");
  if (mobilePane) { state.activePane = Number(mobilePane.dataset.mobilePane); persist(); render(); return; }
  const chapterNav = event.target.closest("[data-chapter-nav]");
  if (chapterNav) { const parts = chapterNav.dataset.chapterNav.split("|"); navigateChapter(Number(parts[0]), Number(parts[1])); return; }
  const browseBook = event.target.closest("[data-browse-book]");
  if (browseBook) {
    const nextBook = browseBook.dataset.browseBook;
    if (state.browseBook === nextBook && state.browseStage !== "books") {
      state.browseBook = "";
      state.browseStage = "books";
    } else {
      state.browseBook = nextBook;
      state.browseChapter = 1;
      state.browseStage = "chapters";
    }
    state.navigatorOpen = true;
    persist(); render(); return;
  }
  const browseChapter = event.target.closest("[data-browse-chapter]");
  if (browseChapter) {
    const nextChapter = Number(browseChapter.dataset.browseChapter);
    if (state.browseStage === "verses" && Number(state.browseChapter) === nextChapter) {
      state.browseStage = "chapters";
    } else {
      state.browseChapter = nextChapter;
      state.browseStage = "verses";
    }
    state.navigatorOpen = true;
    persist(); render(); return;
  }
  const browseVerse = event.target.closest("[data-browse-verse]");
  if (browseVerse) {
    const pane = activePane();
    changeReference({
      book: state.browseBook || pane.reference.book,
      chapter: state.browseChapter || pane.reference.chapter,
      verse: Number(browseVerse.dataset.browseVerse)
    });
    return;
  }
  const browseBack = event.target.closest("[data-browse-back]");
  if (browseBack) {
    state.browseStage = browseBack.dataset.browseBack;
    if (state.browseStage === "books") state.browseBook = "";
    persist(); render(); return;
  }
  const verse = event.target.closest("[data-verse]");
  if (verse) { state.activePane = Number(verse.dataset.pane); openVersePopover(verse.dataset.verse, verse); return; }
  const pane = event.target.closest("[data-activate-pane]");
  if (pane && !event.target.closest("button, select, input, textarea")) { state.activePane = Number(pane.dataset.activatePane); persist(); render(); return; }
  const scope = event.target.closest("[data-scope]");
  if (scope) { activePane().scope = scope.dataset.scope; persist(); render(); return; }
  const study = event.target.closest("[data-study-tab], [data-study-open]");
  if (study) { state.studyTab = study.dataset.studyTab || study.dataset.studyOpen; persist(); render(); return; }
  const highlighter = event.target.closest("[data-highlight]");
  if (highlighter) { state.highlights[popoverVerse] = highlighter.dataset.highlight; persist(); render(); return; }
  const deleteBookmark = event.target.closest("[data-delete-bookmark]");
  if (deleteBookmark) {
    state.bookmarks = state.bookmarks.filter((item) => item.id !== deleteBookmark.dataset.deleteBookmark);
    persist(); render(); showToast("Bookmark removed."); return;
  }
  const bookmark = event.target.closest("[data-go-bookmark]");
  if (bookmark) { const parsed = parseReference(bookmark.dataset.goBookmark); if (parsed) { changeReference(parsed); state.studyTab = "bookmarks"; } return; }
  const paper = event.target.closest("[data-paper]");
  if (paper) { state.paper = paper.dataset.paper; persist(); render(); openSettings(event.target); return; }
  const actionTarget = event.target.closest("[data-action]");
  if (!actionTarget) {
    if (event.target.closest("select, input, textarea")) { persist(); return; }
    if (!event.target.closest("#verse-popover") && !event.target.closest("#settings-menu")) closeOverlays();
    persist(); render();
    return;
  }
  const action = actionTarget.dataset.action;
  if (action === "split") { state.split = !state.split; persist(); render(); loadVisiblePanes(); return; }
  if (action === "toggle-browser") {
    state.navigatorOpen = !state.navigatorOpen;
    if (state.navigatorOpen) {
      state.browseStage = "books";
      state.browseBook = "";
      state.browseChapter = activePane().reference.chapter;
    }
    persist(); render(); return;
  }
  if (action === "toggle-study") { state.studyOpen = !state.studyOpen; persist(); render(); return; }
  if (action === "settings") return openSettings(actionTarget);
  if (action === "dark-mode") { state.dark = !state.dark; persist(); render(); return; }
  if (action === "bookmark") {
    if (!state.bookmarks.some((item) => item.reference === popoverVerse)) state.bookmarks.push({ id: createRecordId("bookmark"), reference: popoverVerse, label: "Saved passage" });
    state.studyTab = "bookmarks"; state.studyOpen = true; persist(); popoverVerse = null; render(); showToast("Passage saved."); return;
  }
  if (action === "copy-verse") { await navigator.clipboard?.writeText(popoverVerse); showToast("Reference copied."); return; }
  if (action === "open-note") { state.studyTab = "notes"; state.studyOpen = true; popoverVerse = null; persist(); render(); return; }
  if (action === "clear-highlight") { delete state.highlights[popoverVerse]; persist(); popoverVerse = null; render(); return; }
  if (action === "focus-pericope") return activateSplitFocus("pericope");
  if (action === "focus-verse") return activateSplitFocus("verse");
  if (action === "show-whole-chapter") {
    const paneIndex = Number(actionTarget.dataset.paneIndex);
    const pane = paneAt(paneIndex);
    pane.scope = "chapter";
    state.activePane = paneIndex;
    state.selectedVerse = null;
    persist(); render(); return;
  }
  if (action === "note-mode") {
    syncNote(); state.noteMode = state.noteMode === "rich" ? "markdown" : "rich"; persist(); render(); return;
  }
  if (action === "save-note") { syncNote(); showToast("Note saved on this device."); return; }
  if (action === "export-md") { downloadFile(selectedReference().replace(/[^a-z0-9]+/gi, "-") + ".md", noteExport(), "text/markdown;charset=utf-8"); return; }
  if (action === "export-pdf") return exportPdf();
  if (action === "obsidian") return saveToObsidian();
});

app.addEventListener("change", (event) => {
  const paneVersion = event.target.dataset.paneVersion;
  if (paneVersion !== undefined) {
    const pane = paneAt(Number(paneVersion));
    const currentResult = chapterData[referenceKey(pane)];
    if (currentResult?.verses?.length) pane.fallback = { result: currentResult, translation: pane.translation };
    pane.translation = event.target.value;
    updateOfflineVersion(pane);
    state.activePane = Number(paneVersion);
    persist(); render(); loadVisiblePanes(); return;
  }
  const control = event.target.dataset.control;
  if (control) {
    const pane = activePane();
    if (control === "translation") pane.translation = event.target.value;
    if (control === "book") { pane.reference.book = event.target.value; pane.reference.chapter = 1; pane.reference.verse = 1; }
    if (control === "chapter") { pane.reference.chapter = Number(event.target.value); pane.reference.verse = 1; }
    if (control === "verse") pane.reference.verse = Number(event.target.value);
    pane.label = displayReference(pane.reference);
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
