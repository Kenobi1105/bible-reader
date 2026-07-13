import { BOOKS, chapterCount, displayReference, isOldTestament, moveChapter, parseReference } from "../core/references.js";
import { TRANSLATIONS, getChapter } from "../core/bible-sources.js?v=2";
import { downloadFile, loadCachedChapter, loadState, saveCachedChapter, saveState } from "../core/storage.js?v=2";
import { isMorphologyTranslation, loadMorphologyBook, morphologySourceLabel } from "../core/morphology.js";

const app = document.querySelector("#app");
const defaultState = {
  canvasVersion: 4,
  canvases: [
    { mode: "reader", activeTab: "canvas-0-tab-1", tabs: [{ id: "canvas-0-tab-1", label: "John 1", reference: { book: "John", chapter: 1, verse: 1 }, translation: "NET", scope: "chapter", view: "paragraph" }] },
    { mode: "reader", activeTab: "canvas-1-tab-1", tabs: [{ id: "canvas-1-tab-1", label: "John 1", reference: { book: "John", chapter: 1, verse: 1 }, translation: "SBLGNT", scope: "chapter", view: "paragraph" }] },
    { mode: "reader", activeTab: "canvas-2-tab-1", tabs: [{ id: "canvas-2-tab-1", label: "John 1", reference: { book: "John", chapter: 1, verse: 1 }, translation: "NET", scope: "chapter", view: "paragraph" }] }
  ],
  activePane: 0,
  mobilePane: 0,
  layout: 1,
  singlePanelWidth: 900,
  twoPanelRatio: 0.5,
  paneSync: false,
  studyOpen: false,
  navigatorOpen: false,
  browseStage: "books",
  browseBook: "",
  browseChapter: 1,
  paper: "white",
  dark: false,
  fontSize: 18,
  fontSizes: { latin: 18, chinese: 18, hebrew: 18, greek: 18 },
  highlights: {},
  bookmarks: [],
  notes: {},
  studyTab: "notes",
  noteMode: "rich",
  selectedVerse: null,
  panelSettings: null
};

let state = loadState(defaultState);
if (!Array.isArray(state.canvases)) {
  const legacyWorkspace = state.tabs?.find((tab) => tab.id === state.activeTab) || state.tabs?.[0];
  const legacyPanes = legacyWorkspace?.panes || defaultState.canvases.map((canvas) => canvas.tabs[0]);
  state.canvases = legacyPanes.slice(0, 2).map((pane, index) => {
    const id = "canvas-" + index + "-tab-1";
    return { mode: "reader", activeTab: id, tabs: [{ ...pane, id, label: displayReference(pane.reference), scope: "chapter" }] };
  });
}
if (state.canvasVersion < 4) state.layout = state.split ? 2 : 1;
state.canvasVersion = 4;
function createRecordId(prefix) {
  return prefix + "-" + (crypto.randomUUID?.() || Date.now().toString(36) + Math.random().toString(36).slice(2));
}

function createReaderCanvas(index) {
  const id = "canvas-" + index + "-tab-1";
  return { mode: "reader", lastUsed: 0, activeTab: id, tabs: [{ id, label: "John 1", reference: { book: "John", chapter: 1, verse: 1 }, translation: index === 1 ? "SBLGNT" : "NET", scope: "chapter", view: "paragraph" }] };
}

while (state.canvases.length < 3) state.canvases.push(createReaderCanvas(state.canvases.length));
state.canvases = state.canvases.slice(0, 3);
state.canvases.forEach((canvas) => { canvas.mode ||= "reader"; canvas.lastUsed ||= 0; });
state.layout = Math.min(3, Math.max(1, Number(state.layout) || 1));
state.singlePanelWidth = Math.min(1300, Math.max(460, Number(state.singlePanelWidth) || 900));
state.twoPanelRatio = Math.min(.72, Math.max(.28, Number(state.twoPanelRatio) || .5));
const FONT_SIZES = [12, 14, 16, 18, 20, 22, 24];
const MAX_TABS_PER_PANEL = 3;
state.fontSize = FONT_SIZES.includes(Number(state.fontSize)) ? Number(state.fontSize) : 18;
const FONT_SCRIPTS = ["latin", "chinese", "hebrew", "greek"];
const FONT_SCRIPT_LABELS = { latin: "English", chinese: "Chinese", hebrew: "Hebrew", greek: "Greek" };
state.fontSizes = FONT_SCRIPTS.reduce((sizes, script) => {
  const savedSize = Number(state.fontSizes?.[script]);
  sizes[script] = FONT_SIZES.includes(savedSize) ? savedSize : state.fontSize;
  return sizes;
}, {});

state.selectedVerse = null;
state.paneSync = Boolean(state.paneSync);
state.panelSettings = Number.isInteger(state.panelSettings) ? state.panelSettings : null;
state.mobilePane = Number.isInteger(state.mobilePane) ? state.mobilePane : state.activePane;
state.bookmarks = (state.bookmarks || []).map((bookmark, index) => ({
  ...bookmark,
  id: bookmark.id || "bookmark-legacy-" + index + "-" + Date.now()
}));
state.canvases?.forEach((canvas) => canvas.tabs?.forEach((pane) => {
  if (!pane.view) pane.view = "paragraph";
  if (pane.scope === "pericope") pane.scope = "chapter";
  pane.parseEnabled = Boolean(pane.parseEnabled);
}));
let chapterData = {};
let morphologyData = {};
let morphologyLoads = new Map();
let popoverVerse = null;
let toastTimer = null;
let pendingArrivals = new Map();
let browseVerseCount = null;
let browseVerseLoadKey = null;
let browseVerseMessage = "Loading verses...";
let multiVerseSelection = [];
let syncScrollLocked = false;
let lastSyncedScrollReference = "";
let resizeSession = null;

function icon(name) {
  return '<i data-lucide="' + name + '"></i>';
}

function escapeHtml(value) {
  return String(value || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function canvasAt(index = state.activePane) {
  return state.canvases[index];
}

function isReaderCanvas(index) {
  return canvasAt(index)?.mode !== "parse";
}

function visiblePaneIndexes() {
  return Array.from({ length: state.layout }, (_, index) => index);
}

function readerPaneIndexes() {
  return visiblePaneIndexes().filter(isReaderCanvas);
}

function activeReaderIndex() {
  if (visiblePaneIndexes().includes(state.activePane) && isReaderCanvas(state.activePane)) return state.activePane;
  return readerPaneIndexes()[0] ?? 0;
}

function paneAt(index = state.activePane) {
  const canvas = canvasAt(isReaderCanvas(index) ? index : activeReaderIndex());
  return canvas.tabs.find((tab) => tab.id === canvas.activeTab) || canvas.tabs[0];
}

function activePane() {
  return paneAt(activeReaderIndex());
}

function markPaneUsed(index) {
  const canvas = canvasAt(index);
  if (canvas?.mode === "reader") canvas.lastUsed = Date.now();
}

function remapPaneIndex(index, left, right) {
  if (index === left) return right;
  if (index === right) return left;
  return index;
}

function swapCanvasPositions(left, right) {
  if (left === right) return;
  [state.canvases[left], state.canvases[right]] = [state.canvases[right], state.canvases[left]];
  state.activePane = remapPaneIndex(state.activePane, left, right);
  state.mobilePane = remapPaneIndex(state.mobilePane, left, right);
  if (state.panelSettings !== null) state.panelSettings = remapPaneIndex(state.panelSettings, left, right);
  const leftArrival = pendingArrivals.get(left);
  const rightArrival = pendingArrivals.get(right);
  if (leftArrival === undefined) pendingArrivals.delete(right); else pendingArrivals.set(right, leftArrival);
  if (rightArrival === undefined) pendingArrivals.delete(left); else pendingArrivals.set(left, rightArrival);
}

function visibleParseIndex() {
  return visiblePaneIndexes().find((index) => canvasAt(index).mode === "parse");
}

function moveParseToRightmost() {
  const parseIndex = visibleParseIndex();
  if (parseIndex === undefined) return;
  const rightmost = state.layout - 1;
  if (parseIndex !== rightmost) swapCanvasPositions(parseIndex, rightmost);
}

function duplicateReaderCanvas(sourceIndex, targetIndex) {
  const pane = JSON.parse(JSON.stringify(paneAt(sourceIndex)));
  const id = "canvas-" + targetIndex + "-tab-" + Date.now();
  pane.id = id;
  pane.label = displayReference(pane.reference);
  pane.scope = "chapter";
  return { mode: "reader", lastUsed: 0, activeTab: id, tabs: [pane] };
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

function adaptOriginalLanguageVersion(pane, reference) {
  if (!["WLC", "LXX", "SBLGNT"].includes(pane.translation)) return;
  if (!isTranslationApplicable(pane.translation, reference)) {
    pane.translation = isOldTestament(reference.book) ? "WLC" : "SBLGNT";
  }
}

function persist() {
  saveState({ ...state, selectedVerse: null });
}

function clearVerseSelection() {
  const changed = Boolean(state.selectedVerse || popoverVerse || multiVerseSelection.length);
  state.selectedVerse = null;
  popoverVerse = null;
  multiVerseSelection = [];
  return changed;
}

function isVerseSelected(reference) {
  return state.selectedVerse === reference || multiVerseSelection.includes(reference);
}

function highlightedVerseReferences() {
  return multiVerseSelection.length ? multiVerseSelection : (popoverVerse ? [popoverVerse] : []);
}

function queueArrival(paneIndex, reference) {
  pendingArrivals.set(paneIndex, displayReference(reference));
}

function revealArrivalIfReady(pane, key) {
  const paneIndex = state.canvases.findIndex((canvas) => canvas.tabs.some((tab) => tab.id === pane.id));
  const arrival = pendingArrivals.get(paneIndex);
  if (!arrival || key !== referenceKey(pane)) return;
  pendingArrivals.delete(paneIndex);
  requestAnimationFrame(() => {
    const verse = document.querySelector('[data-activate-pane="' + paneIndex + '"] [data-verse="' + arrival + '"]');
    if (!verse) return;
    const scrollArea = verse.closest(".verse-list");
    if (scrollArea) {
      const scrollTop = scrollArea.scrollTop + verse.getBoundingClientRect().top - scrollArea.getBoundingClientRect().top - 16;
      scrollArea.scrollTo({ top: Math.max(0, scrollTop), behavior: "smooth" });
    } else {
      verse.scrollIntoView({ block: "start", behavior: "smooth" });
    }
    verse.classList.add("arrival-flash");
    setTimeout(() => verse.classList.remove("arrival-flash"), 2400);
  });
}

function setRootTheme() {
  document.body.classList.toggle("dark", state.dark);
  FONT_SCRIPTS.forEach((script) => document.documentElement.style.setProperty("--font-size-" + script, state.fontSizes[script] + "pt"));
  document.documentElement.style.setProperty("--font-size", state.fontSizes.latin + "pt");
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

function readerSettingsMarkup(pane, paneIndex) {
  const versionOptions = Object.entries(TRANSLATIONS).map(([id, item]) => {
    const unavailable = !isTranslationApplicable(id, pane.reference);
    const duplicateOriginal = pane.view === "interlinear" && id === interlinearTranslation(pane.reference);
    return '<option value="' + id + '"' + (id === pane.translation ? " selected" : "") + (unavailable || duplicateOriginal ? " disabled" : "") + ">" + item.label + "</option>";
  }).join("");
  return '<div class="pane-settings-popover" data-pane-settings="' + paneIndex + '"><label>Version<select class="version-select" data-pane-version="' + paneIndex + '" aria-label="Bible version">' + versionOptions + '</select></label><label>Reading view<select class="reader-view-select" data-pane-view="' + paneIndex + '" aria-label="Reading layout"><option value="paragraph"' + (pane.view === "paragraph" ? " selected" : "") + '>Paragraph</option><option value="lines"' + (pane.view === "lines" ? " selected" : "") + '>One verse per line</option><option value="interlinear"' + (pane.view === "interlinear" ? " selected" : "") + '>Interlinear</option><option value="compare"' + (pane.view === "compare" ? " selected" : "") + (pane.scope !== "verse" ? " disabled" : "") + '>Compare versions</option></select></label></div>';
}

function renderCanvasTabs(paneIndex) {
  const canvas = canvasAt(paneIndex);
  const pane = paneAt(paneIndex);
  const tabLimitReached = canvas.tabs.length >= MAX_TABS_PER_PANEL;
  const parseControl = displayedMorphologyIds(pane).length
    ? '<label class="parse-toggle canvas-parse-toggle" title="Open word parsing when you click Hebrew or Greek"><input type="checkbox" data-pane-parse="' + paneIndex + '"' + (pane.parseEnabled ? " checked" : "") + '><span>Parse</span></label>'
    : "";
  return '<div class="canvas-tabs">' + canvas.tabs.map((item) =>
    '<button class="canvas-tab ' + (item.id === canvas.activeTab ? "active" : "") + '" data-canvas-tab="' + paneIndex + "|" + item.id + '">' +
      '<span>' + escapeHtml(item.label) + '</span><span class="tab-close" data-close-canvas-tab="' + paneIndex + "|" + item.id + '" title="Close tab">' + icon("x") + "</span>" +
    "</button>"
  ).join("") + '<button class="canvas-tab-add' + (tabLimitReached ? " disabled" : "") + '" data-canvas-new="' + paneIndex + '" title="' + (tabLimitReached ? "Maximum of three tabs per reader" : "New passage tab") + '"' + (tabLimitReached ? " disabled" : "") + '>' + icon("plus") + '</button><span class="canvas-tab-spacer"></span>' + parseControl + (state.panelSettings === paneIndex ? readerSettingsMarkup(pane, paneIndex) : "") + "</div>";
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
  const verses = Array.from({ length: browseVerseCount || 0 }, (_, index) => index + 1).map((verse) =>
    '<button class="number-chip ' + (verse === Number(pane.reference.verse) ? "selected" : "") + '" data-browse-verse="' + verse + '">' + verse + "</button>"
  ).join("");
  const chapterPanel = state.browseStage === "books" ? "" :
    '<section class="browse-reveal split-reveal"><div class="reveal-column"><div class="reveal-title"><strong>' + escapeHtml(selectedBook) + "</strong><button data-browse-back=\"books\" title=\"Close passage picker\">" + icon("x") + "</button></div><div class=\"chapter-grid\">" + chapters + "</div></div><div class=\"reveal-column verse-column\">" +
      (state.browseStage === "verses"
        ? '<div class="reveal-title"><strong>Verse</strong></div><div class="chapter-grid verse-grid">' + (verses || '<div class="picker-loading">' + escapeHtml(browseVerseMessage) + "</div>") + "</div>"
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
  const visiblePanels = visiblePaneIndexes();
  return '<header class="workspace-header"><div class="brand compact"><div class="brand-mark">' + icon("book-open") + '</div><div>Scripture Desk</div></div>' +
    '<div class="header-actions"><div class="reference-entry">' + icon("search") +
      '<input id="reference-search" value="' + escapeHtml(reference) + '" aria-label="Find a reference" placeholder="John 3:16" />' +
      '<button class="browse-trigger" data-action="toggle-browser" title="Browse book, chapter, and verse">' + icon("chevron-down") + '<span>Browse</span></button></div>' +
      '<button class="icon-button ' + (state.studyOpen ? "active" : "") + '" data-action="toggle-study" title="Study tools">' + icon("notebook-pen") + "</button>" +
      '<button class="icon-button ' + (state.layout > 1 ? "active" : "") + '" data-action="cycle-layout" title="Reader layout: ' + state.layout + ' panel' + (state.layout === 1 ? "" : "s") + '">' + icon(state.layout === 1 ? "square" : state.layout === 2 ? "columns-2" : "columns-3") + "</button>" +
      (state.layout > 1 ? '<button class="icon-button ' + (state.paneSync ? "active" : "") + '" data-action="toggle-pane-sync" title="' + (state.paneSync ? "Unsync reader panes" : "Sync reader panes") + '">' + icon(state.paneSync ? "link-2" : "unlink-2") + "</button>" : "") +
      '<button class="icon-button" data-action="settings" title="Reader settings">' + icon("sliders-horizontal") + "</button></div>" +
    (state.layout > 1 ? '<div class="mobile-pane-switch">' + visiblePanels.map((index) => '<button data-mobile-pane="' + index + '" class="' + (state.mobilePane === index ? "active" : "") + '">' + (isReaderCanvas(index) ? paneAt(index).translation : "Parse") + "</button>").join("") + "</div>" : "") +
  "</header>";
}

function emptyReader(translation, result) {
  return '<div class="verse-list"><div class="empty-state"><strong>Text not available yet.</strong><br>' +
    escapeHtml(result?.message || "Loading the selected chapter...") +
    (translation.kind === "local" ? '<br><br>Add the approved local JSON file in public/data to enable this version offline.' : "") +
  "</div></div>";
}

function scopedVerses(pane, verses) {
  if (pane.scope === "verse") return verses.filter((verse) => verse.number === Number(pane.reference.verse));
  return verses;
}

function verseReference(pane, number) {
  return pane.reference.book + " " + pane.reference.chapter + ":" + number;
}

function morphologyKey(id, book) {
  return id + "|" + book;
}

function displayedMorphologyIds(pane) {
  if (pane.view === "interlinear") return [interlinearTranslation(pane.reference)].filter(isMorphologyTranslation);
  if (pane.view === "compare") return comparisonTranslationIds(pane).filter(isMorphologyTranslation);
  return [pane.translation].filter(isMorphologyTranslation);
}

function parsedVerseMarkup(pane, translationId, verse) {
  if (!pane.parseEnabled || !isMorphologyTranslation(translationId)) return escapeHtml(verse.text);
  const morphology = morphologyData[morphologyKey(translationId, pane.reference.book)];
  const words = morphology?.verses?.[pane.reference.chapter + ":" + verse.number];
  if (!words?.length) return escapeHtml(verse.text);
  const reference = verseReference(pane, verse.number);
  return words.map((word, index) => {
    const title = "Lemma: " + (word.lemma || "Not listed") + "\nParsing: " + (word.description || "Not listed") + "\nCode: " + (word.morphology || "Not listed");
    return '<span class="morph-word" tabindex="0" title="' + escapeHtml(title) + '" data-morph-word="' + index + '" data-morph-translation="' + translationId + '" data-morph-reference="' + escapeHtml(reference) + '" data-morph-book="' + escapeHtml(pane.reference.book) + '">' + escapeHtml(word.surface) + "</span>";
  }).join(" ");
}

function morphologyStatus(pane) {
  if (!pane.parseEnabled) return "";
  const ids = displayedMorphologyIds(pane);
  if (!ids.length) return "";
  const loading = ids.some((id) => morphologyLoads.has(morphologyKey(id, pane.reference.book)));
  if (loading) return "Loading parsing data...";
  const failed = ids.some((id) => morphologyData[morphologyKey(id, pane.reference.book)]?.error);
  if (failed) return "Parsing data is unavailable for this book.";
  return "Parsing: " + ids.map(morphologySourceLabel).join(" + ");
}

function queueMorphology(id, book) {
  const key = morphologyKey(id, book);
  if (morphologyData[key] || morphologyLoads.has(key)) return;
  const load = loadMorphologyBook(id, book)
    .then((result) => { morphologyData[key] = result; })
    .catch(() => { morphologyData[key] = { error: true, verses: {} }; })
    .finally(() => {
      morphologyLoads.delete(key);
      render();
    });
  morphologyLoads.set(key, load);
}

function ensurePaneMorphology(pane) {
  if (!pane.parseEnabled) return;
  displayedMorphologyIds(pane).forEach((id) => queueMorphology(id, pane.reference.book));
}

function normalVersesMarkup(pane, paneIndex, verses, translation, translationId) {
  return '<div class="verse-list">' + verses.map((verse) => {
    const verseRef = verseReference(pane, verse.number);
    const highlight = state.highlights[verseRef] ? " highlight-" + state.highlights[verseRef] : "";
    const selected = isVerseSelected(verseRef) ? " selected" : "";
    return '<span class="verse' + highlight + selected + '" data-verse="' + escapeHtml(verseRef) + '" data-pane="' + paneIndex + '" dir="' + translation.direction + '">' +
      '<sup class="verse-number">' + verse.number + "</sup>" + parsedVerseMarkup(pane, translationId, verse) + '</span><span class="verse-spacer"> </span>';
  }).join("") + "</div>";
}

function interlinearMarkup(pane, paneIndex) {
  const reference = displayReference(pane.reference);
  const originalId = interlinearTranslation(pane.reference);
  const topId = pane.translation;
  const topTranslation = TRANSLATIONS[topId];
  const topVerses = scopedVerses(pane, chapterData[topId + "|" + reference]?.verses || []);
  const originalByNumber = new Map(scopedVerses(pane, chapterData[originalId + "|" + reference]?.verses || []).map((verse) => [verse.number, verse]));
  if (!topVerses.length) return emptyReader(topTranslation, { message: "Loading the interlinear pair..." });
  return '<div class="verse-list interlinear-list">' + topVerses.map((verse) => {
    const verseRef = verseReference(pane, verse.number);
    const original = originalByNumber.get(verse.number);
    const selected = isVerseSelected(verseRef) ? " selected" : "";
    return '<div class="interlinear-verse' + selected + '" data-verse="' + escapeHtml(verseRef) + '" data-pane="' + paneIndex + '">' +
      '<div class="interlinear-line top-line lang-' + (topTranslation.script || "latin") + '" dir="' + topTranslation.direction + '"><span class="interlinear-label">' + topId + '</span><sup class="verse-number">' + verse.number + "</sup>" + escapeHtml(verse.text) + "</div>" +
      '<div class="interlinear-line original-line lang-' + TRANSLATIONS[originalId].script + '" dir="' + TRANSLATIONS[originalId].direction + '"><span class="interlinear-label">' + originalId + "</span>" + (original ? '<sup class="verse-number">' + original.number + "</sup>" + parsedVerseMarkup(pane, originalId, original) : '<span class="interlinear-loading">Loading ' + originalId + "...</span>") + "</div>" +
    "</div>";
  }).join("") + "</div>";
}

function comparisonMarkup(pane, paneIndex) {
  const reference = displayReference(pane.reference);
  const verseNumber = Number(pane.reference.verse);
  const verseRef = verseReference(pane, verseNumber);
  const selected = isVerseSelected(verseRef) ? " selected" : "";
  const translations = comparisonTranslationIds(pane);
  return '<div class="verse-list comparison-list">' + translations.map((id) => {
    const translation = TRANSLATIONS[id];
    const verse = (chapterData[id + "|" + reference]?.verses || []).find((item) => item.number === verseNumber);
    const isCuv = id === "CUVS" || id === "CUVT";
    const cuvPicker = '<span class="cuv-card-picker"><button data-action="cycle-compare-cuv" data-direction="-1" data-pane-index="' + paneIndex + '" title="Show CUV Simplified" aria-label="Show CUV Simplified">' + icon("chevron-left") + '</button><span class="cuv-dot ' + (id === "CUVS" ? "active" : "") + '"></span><span class="cuv-dot ' + (id === "CUVT" ? "active" : "") + '"></span><button data-action="cycle-compare-cuv" data-direction="1" data-pane-index="' + paneIndex + '" title="Show CUV Traditional" aria-label="Show CUV Traditional">' + icon("chevron-right") + "</button></span>";
    const label = escapeHtml(translation.label) + (isCuv ? cuvPicker : "");
    return '<section class="comparison-version lang-' + (translation.script || "latin") + selected + '" data-verse="' + escapeHtml(verseRef) + '" data-pane="' + paneIndex + '" dir="' + translation.direction + '"><div class="comparison-label">' + label + "</div>" +
      (verse ? '<div class="comparison-text"><sup class="verse-number">' + verse.number + "</sup>" + parsedVerseMarkup(pane, id, verse) + "</div>" : '<div class="comparison-loading">Loading ' + escapeHtml(translation.label) + "...</div>") +
    "</section>";
  }).join("") + "</div>";
}

function renderPane(pane, paneIndex) {
  const translation = TRANSLATIONS[pane.translation];
  const loadedResult = chapterData[referenceKey(pane)];
  const showingFallback = !loadedResult && pane.fallback?.result;
  const result = loadedResult || pane.fallback?.result;
  const displayTranslation = showingFallback ? TRANSLATIONS[pane.fallback.translation] : translation;
  const verses = scopedVerses(pane, result?.verses || []);
  const classes = "reader-pane paper-" + state.paper + " view-" + pane.view + (displayTranslation.script ? " lang-" + displayTranslation.script : "") + (paneIndex === state.activePane ? " active-pane" : "") + (state.mobilePane === paneIndex ? " mobile-active" : "");
  const offlineStatus = pane.loading ? '<span class="offline-status loading-status">' + icon("loader-circle") + "Loading " + translation.label + "</span>" : !navigator.onLine ? '<span class="offline-status">' + icon("wifi-off") + "Offline · " + translation.label + "</span>" : "";
  const displayTranslationId = showingFallback ? pane.fallback.translation : pane.translation;
  const versesHtml = pane.view === "interlinear" ? interlinearMarkup(pane, paneIndex) : pane.view === "compare" ? comparisonMarkup(pane, paneIndex) : verses.length ? normalVersesMarkup(pane, paneIndex, verses, displayTranslation, displayTranslationId) : emptyReader(displayTranslation, result);
  const contextControl = pane.scope === "verse"
    ? '<div class="passage-choice chapter-return"><button class="show-chapter" data-action="show-whole-chapter" data-pane-index="' + paneIndex + '">' + icon("maximize-2") + "Show whole chapter</button></div>"
    : "";
  return '<article class="' + classes + '" data-activate-pane="' + paneIndex + '">' + renderCanvasTabs(paneIndex) +
    '<div class="pane-header">' + (offlineStatus ? '<div class="pane-topline">' + offlineStatus + "</div>" : "") + '<div class="chapter-nav"><button class="chapter-arrow" data-chapter-nav="' + paneIndex + '|-1" title="Previous chapter">' + icon("chevron-left") + '</button><div>' +
      '<h1 class="chapter-title">' + escapeHtml(pane.reference.book) + " " + pane.reference.chapter + '</h1><p class="pane-meta">' + escapeHtml(displayTranslation.name) + " · " + escapeHtml(displayTranslation.language) + "</p></div>" +
      '<button class="chapter-arrow" data-chapter-nav="' + paneIndex + '|1" title="Next chapter">' + icon("chevron-right") + "</button></div></div>" +
    contextControl + versesHtml +
    '<div class="source-status ' + (result?.error ? "warning" : "") + '">' + icon(result?.error ? "circle-alert" : "cloud-check") +
      "<span>" + escapeHtml(morphologyStatus(pane) || (pane.loading ? "Loading " + translation.label + " while keeping the current text visible..." : result?.message || "Loading chapter...")) + "</span></div>" +
  "</article>";
}

function parseDetailRow(label, value, className = "") {
  if (!value) return "";
  return '<div class="parse-detail ' + className + '"><dt>' + escapeHtml(label) + '</dt><dd>' + escapeHtml(value) + "</dd></div>";
}

function parseLexicalMarkup(data) {
  const word = data.word;
  const lexical = word.lexical || {};
  const rows = [];
  if (data.translation === "WLC") {
    rows.push(parseDetailRow("Word breakdown", lexical.breakdown, "parse-breakdown"));
    rows.push(parseDetailRow("Lemma", lexical.lemma || word.lemma));
    rows.push(parseDetailRow("Root", lexical.root));
  } else {
    rows.push(parseDetailRow("Lemma", lexical.lemma || word.lemma));
  }
  return rows.join("");
}

function parsingTerms(value) {
  return String(value || "Not listed").split(";").map((term) => term.trim()).filter(Boolean)
    .map((term) => '<span>' + escapeHtml(term) + '</span>').join('<b aria-hidden="true">·</b>');
}

function parseMetadataMarkup(data, lexicalCredit) {
  const lexical = data.word.lexical || {};
  const metadata = [];
  if (lexical.id) metadata.push("Lexicon ID " + lexical.id);
  if (data.word.morphology) metadata.push("Source " + data.word.morphology);
  metadata.push(morphologySourceLabel(data.translation) + lexicalCredit);
  return metadata.map((item) => '<span>' + escapeHtml(item) + '</span>').join("");
}

function renderParsePane(canvas, paneIndex) {
  const data = canvas.parseData;
  const translation = TRANSLATIONS[data?.translation] || {};
  const direction = translation.direction || "ltr";
  const classes = "parse-pane paper-" + state.paper + (state.mobilePane === paneIndex ? " mobile-active" : "");
  if (!data) return '<article class="' + classes + '"><div class="parse-pane-header"><span>Parsing</span><button class="format-button" data-action="close-parse-panel" data-pane-index="' + paneIndex + '" title="Close parsing panel">' + icon("x") + '</button></div><div class="parse-empty">Select a parsed Hebrew or Greek word.</div></article>';
  const lexicalCredit = data.word.lexical ? " Lexical glosses: Open Scriptures Strong's Dictionaries." : "";
  const lexical = data.word.lexical || {};
  return '<article class="' + classes + '"><header class="parse-pane-header"><div><span class="parse-kicker">' + escapeHtml(data.translation) + '</span><strong>Word parsing</strong></div><button class="format-button" data-action="close-parse-panel" data-pane-index="' + paneIndex + '" title="Restore reader panel">' + icon("x") + '</button></header><div class="parse-content parse-content-' + escapeHtml(data.translation.toLowerCase()) + '" dir="' + direction + '"><section class="parse-word-hero"><p class="parse-reference">' + escapeHtml(data.reference) + '</p><div class="parse-word">' + escapeHtml(data.word.surface) + '</div></section><section class="parse-lexical" aria-label="Lexical information"><dl class="parse-details">' + parseLexicalMarkup(data) + '</dl></section><section class="parse-emphasis parse-gloss-section" aria-labelledby="parse-gloss-' + paneIndex + '"><h2 id="parse-gloss-' + paneIndex + '">Gloss</h2><p>' + escapeHtml(lexical.gloss || "Not listed") + '</p></section><section class="parse-parsing-section" aria-labelledby="parse-parsing-' + paneIndex + '"><h2 id="parse-parsing-' + paneIndex + '">Parsing</h2><p class="parse-terms">' + parsingTerms(data.word.description) + '</p></section><footer class="parse-metadata">' + parseMetadataMarkup(data, lexicalCredit) + '</footer></div></article>';
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
      '<span class="note-header-actions"><button class="button small" data-action="note-mode">' + (state.noteMode === "rich" ? "Rich Text" : "Markdown") + '</button><button class="format-button note-delete" data-action="delete-note" title="Delete note" aria-label="Delete note">' + icon("trash-2") + "</button></span></div>" +
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
    '<div class="note-actions"><button class="format-button note-action-icon primary" data-action="save-note" title="Save note" aria-label="Save note">' + icon("save") + "</button>" +
      '<button class="format-button note-action-icon" data-action="export-md" title="Export Markdown" aria-label="Export Markdown">' + icon("file-code-2") + "</button>" +
      '<button class="format-button note-action-icon" data-action="export-pdf" title="Export PDF" aria-label="Export PDF">' + icon("file-text") + "</button>" +
      '<button class="format-button note-action-icon" data-action="obsidian" title="Save to Obsidian" aria-label="Save to Obsidian">' + icon("folder-output") + "</button></div>" +
  "</div>";
}

function bookmarksMarkup() {
  const cards = state.bookmarks.length ? state.bookmarks.slice().reverse().map((bookmark) =>
    '<div class="bookmark-card" data-go-bookmark="' + escapeHtml(bookmark.reference) + '"><div><strong>' + escapeHtml(bookmark.reference) + "</strong>" +
      '<span>' + escapeHtml(bookmark.label || "Saved passage") + '</span></div><button class="bookmark-remove" data-delete-bookmark="' + escapeHtml(bookmark.id) + '" title="Remove bookmark" aria-label="Remove ' + escapeHtml(bookmark.reference) + ' bookmark">' + icon("trash-2") + "</button></div>"
  ).join("") : '<div class="empty-state">Your saved passages will appear here.</div>';
  return '<div class="bookmark-panel"><div class="note-reference"><span>Saved passages</span><span>' + state.bookmarks.length + "</span></div>" + cards + "</div>";
}

function renderStudyPanel(drawer = false) {
  return '<aside class="study-panel' + (drawer ? " study-drawer" : "") + '">' + (drawer ? '<button class="study-drawer-close" data-action="toggle-study" title="Close study tools">' + icon("x") + "</button>" : "") + '<div class="study-tabs">' +
    '<button data-study-tab="notes" class="' + (state.studyTab === "notes" ? "active" : "") + '">Notes</button>' +
    '<button data-study-tab="bookmarks" class="' + (state.studyTab === "bookmarks" ? "active" : "") + '">Bookmarks</button>' +
  "</div>" + (state.studyTab === "notes" ? noteMarkup() : bookmarksMarkup()) + "</aside>";
}

function renderSettings() {
  const paper = state.paper;
  const fontRows = FONT_SCRIPTS.map((script) => {
    const size = state.fontSizes[script];
    const pips = FONT_SIZES.map((value) =>
      '<button class="font-size-pip' + (size === value ? " active" : "") + '" data-font-size="' + value + '" data-font-script="' + script + '" aria-label="Set ' + FONT_SCRIPT_LABELS[script] + ' text size to ' + value + ' pt" aria-pressed="' + (size === value) + '" title="' + value + ' pt"><span></span></button>'
    ).join("");
    return '<div class="setting-row font-size-row"><label><span>' + FONT_SCRIPT_LABELS[script] + '</span><span>' + size + ' pt</span></label><div class="font-size-pips" role="group" aria-label="' + FONT_SCRIPT_LABELS[script] + ' text size">' + pips + "</div></div>";
  }).join("");
  return '<div class="settings-menu" id="settings-menu">' +
    '<div class="settings-section-label">Text sizes</div>' + fontRows +
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
  const selectedCount = multiVerseSelection.length || 1;
  return '<div class="verse-popover visible" id="verse-popover"><div class="popover-reference">' + escapeHtml(popoverVerse) + (selectedCount > 1 ? '<span class="selection-count">' + selectedCount + " selected</span>" : "") + "</div>" +
    '<div class="swatches">' + colors.map((item) => '<button class="swatch ' + (color === item[0] ? "active" : "") + '" style="background:' + item[1] + '" data-highlight="' + item[0] + '" title="Highlight ' + item[0] + '"></button>').join("") + "</div>" +
    '<div class="popover-actions"><button class="format-button popover-icon-action" data-action="bookmark" title="Save verse" aria-label="Save verse">' + icon("bookmark-plus") + "</button>" +
      '<button class="format-button popover-icon-action" data-action="copy-verse" title="Copy reference" aria-label="Copy reference">' + icon("copy") + "</button>" +
      '<button class="format-button popover-icon-action" data-action="open-note" title="Open note" aria-label="Open note">' + icon("notebook-pen") + "</button>" +
      '<button class="format-button popover-icon-action" data-action="clear-highlight" title="Clear highlight" aria-label="Clear highlight">' + icon("eraser") + "</button></div>" +
    '<div class="focus-actions"><button class="format-button popover-icon-action" data-action="focus-verse" title="Show this verse only" aria-label="Show this verse only">' + icon("rows-3") + "</button></div></div>";
}

function render() {
  const paneScrollPositions = {};
  document.querySelectorAll(".reader-pane[data-activate-pane] .verse-list").forEach((list) => {
    const pane = list.closest("[data-activate-pane]");
    if (pane) paneScrollPositions[pane.dataset.activatePane] = list.scrollTop;
  });
  setRootTheme();
  const paneIndexes = visiblePaneIndexes();
  const paneGrid = state.layout === 1 ? "single" : state.layout === 2 ? "split" : "triple";
  const studyDrawer = state.studyOpen && state.layout === 3;
  const renderPanel = (paneIndex) => isReaderCanvas(paneIndex) ? renderPane(paneAt(paneIndex), paneIndex) : renderParsePane(canvasAt(paneIndex), paneIndex);
  const resizer = (kind) => '<div class="pane-resizer ' + kind + '" data-pane-resizer="' + kind + '" title="Drag to resize reader panels"></div>';
  const gridContents = state.layout === 1
    ? renderPanel(0) + resizer("single")
    : state.layout === 2
      ? renderPanel(0) + resizer("split") + renderPanel(1)
      : paneIndexes.map(renderPanel).join("");
  const gridStyle = '--single-panel-width:' + state.singlePanelWidth + 'px;--left-panel-width:' + Math.round(state.twoPanelRatio * 1000) / 10 + '%;';
  app.innerHTML = '<main class="reader-shell">' + renderWorkspaceHeader() + renderReferenceBrowser() +
    '<div class="desk ' + (state.studyOpen && !studyDrawer ? "study-open" : "") + (studyDrawer ? " study-drawer-open" : "") + '"><section class="reading-area"><div class="pane-grid ' + paneGrid + (visibleParseIndex() !== undefined ? " has-parse" : "") + '" style="' + gridStyle + '">' +
      gridContents +
    "</div></section>" + (state.studyOpen ? renderStudyPanel(studyDrawer) : "") + "</div></main>" + renderSettings() + renderPopover();
  if (window.lucide) window.lucide.createIcons();
  document.querySelectorAll(".reader-pane[data-activate-pane] .verse-list").forEach((list) => {
    const pane = list.closest("[data-activate-pane]");
    const scrollTop = pane ? paneScrollPositions[pane.dataset.activatePane] : null;
    if (Number.isFinite(scrollTop)) list.scrollTop = scrollTop;
  });
}

async function loadChapterData(reference, translationId) {
  const key = translationId + "|" + displayReference(reference);
  if (chapterData[key]?.verses?.length) return chapterData[key];
  const cached = await loadCachedChapter(key);
  if (cached?.verses?.length) {
    chapterData[key] = cached;
    return cached;
  }
  const result = await getChapter(reference, translationId);
  chapterData[key] = result;
  if (result.verses?.length && translationId !== "NET") saveCachedChapter(key, result);
  return result;
}

function interlinearTranslation(reference) {
  return isOldTestament(reference.book) ? "WLC" : "SBLGNT";
}

function comparisonTranslationIds(pane) {
  const originals = isOldTestament(pane.reference.book) ? ["WLC", "LXX"] : ["SBLGNT"];
  return ["NET", ...originals, pane.compareCuv || "CUVS"];
}

async function loadSupplementalVersions(pane) {
  let translations = [];
  if (pane.view === "interlinear") translations = [...new Set([pane.translation, interlinearTranslation(pane.reference)])];
  if (pane.view === "compare" && pane.scope === "verse") {
    translations = comparisonTranslationIds(pane);
  }
  if (!translations.length) return;
  await Promise.all(translations.map((id) => loadChapterData(pane.reference, id)));
  render();
}

async function prepareBrowseVerses() {
  const pane = activePane();
  const reference = { book: state.browseBook || pane.reference.book, chapter: state.browseChapter, verse: 1 };
  const key = pane.translation + "|" + displayReference(reference);
  browseVerseLoadKey = key;
  browseVerseCount = null;
  browseVerseMessage = "Loading verses...";
  render();
  const result = await loadChapterData(reference, pane.translation);
  if (browseVerseLoadKey !== key || state.browseStage !== "verses") return;
  browseVerseCount = result.verses?.length || 0;
  browseVerseMessage = result.error ? (result.message || "Could not load verses.") : "No verses found.";
  render();
}

async function loadPane(pane) {
  updateOfflineVersion(pane);
  const key = referenceKey(pane);
  if (chapterData[key]?.verses?.length) {
    pane.loading = false;
    pane.fallback = null;
    render();
    revealArrivalIfReady(pane, key);
    loadSupplementalVersions(pane);
    ensurePaneMorphology(pane);
    return;
  }
  pane.loading = true;
  render();
  await loadChapterData(pane.reference, pane.translation);
  if (referenceKey(pane) !== key) return;
  pane.loading = false;
  pane.fallback = null;
  render();
  revealArrivalIfReady(pane, key);
  loadSupplementalVersions(pane);
  ensurePaneMorphology(pane);
}

function loadVisiblePanes() {
  readerPaneIndexes().map((index) => paneAt(index)).forEach(loadPane);
}

function closeOverlays() {
  clearVerseSelection();
  state.navigatorOpen = false;
  const settings = document.querySelector("#settings-menu");
  if (settings) settings.classList.remove("visible");
}

function dismissFloatingMenus(event) {
  const settingsTrigger = event.target.closest('[data-action="settings"]');
  const canvasTab = event.target.closest("[data-canvas-tab]");
  const insideSettings = event.target.closest("#settings-menu");
  const insidePaneSettings = event.target.closest(".pane-settings-popover");
  let changed = false;
  if (!insideSettings && !settingsTrigger) {
    const settingsMenu = document.querySelector("#settings-menu");
    if (settingsMenu?.classList.contains("visible")) {
      settingsMenu.classList.remove("visible");
      changed = true;
    }
  }
  if (!insidePaneSettings && !canvasTab && state.panelSettings !== null) {
    state.panelSettings = null;
    document.querySelector(".pane-settings-popover")?.remove();
    changed = true;
  }
  if (changed) persist();
}

function placeVersePopover(rect) {
  const popover = document.querySelector("#verse-popover");
  if (!popover) return;
  popover.style.left = Math.min(window.innerWidth - 268, Math.max(12, rect.left)) + "px";
  popover.style.top = Math.min(window.innerHeight - 145, rect.bottom + 8) + "px";
}

function openVersePopover(reference, target) {
  const rect = target.getBoundingClientRect();
  if (state.selectedVerse === reference && popoverVerse === reference) {
    clearVerseSelection();
    persist();
    render();
    return;
  }
  state.selectedVerse = reference;
  popoverVerse = reference;
  render();
  placeVersePopover(rect);
  persist();
}

function toggleMultiVerse(reference, target) {
  const rect = target.getBoundingClientRect();
  if (!multiVerseSelection.length && popoverVerse) multiVerseSelection = [popoverVerse];
  if (multiVerseSelection.includes(reference)) {
    multiVerseSelection = multiVerseSelection.filter((item) => item !== reference);
  } else {
    multiVerseSelection.push(reference);
  }
  if (!multiVerseSelection.length) {
    clearVerseSelection();
    persist();
    render();
    return;
  }
  popoverVerse = multiVerseSelection[0];
  state.selectedVerse = popoverVerse;
  render();
  placeVersePopover(rect);
  persist();
}

function openSettings(target) {
  const menu = document.querySelector("#settings-menu");
  const rect = target.getBoundingClientRect();
  if (menu.classList.contains("visible")) {
    menu.classList.remove("visible");
    return;
  }
  state.panelSettings = null;
  document.querySelector(".pane-settings-popover")?.remove();
  menu.classList.add("visible");
  menu.style.right = Math.max(12, window.innerWidth - rect.right) + "px";
  menu.style.top = rect.bottom + 8 + "px";
}

function newCanvasTab(paneIndex = state.activePane) {
  const canvas = canvasAt(paneIndex);
  if (canvas.tabs.length >= MAX_TABS_PER_PANEL) {
    showToast("Each reader can have up to three passage tabs.");
    return;
  }
  const pane = JSON.parse(JSON.stringify(paneAt(paneIndex)));
  const id = "canvas-" + paneIndex + "-tab-" + Date.now();
  pane.id = id;
  pane.label = displayReference(pane.reference);
  pane.scope = "chapter";
  canvas.tabs.push(pane);
  canvas.activeTab = id;
  state.activePane = paneIndex;
  state.mobilePane = paneIndex;
  state.panelSettings = null;
  markPaneUsed(paneIndex);
  state.navigatorOpen = false;
  persist();
  render();
  loadVisiblePanes();
}

function setLayout(layout) {
  const nextLayout = Math.min(3, Math.max(1, layout));
  if (state.layout === 2 && nextLayout === 3 && canvasAt(1).mode === "parse") {
    const parser = canvasAt(1);
    state.canvases[1] = duplicateReaderCanvas(activeReaderIndex(), 1);
    state.canvases[2] = parser;
    if (state.mobilePane === 1) state.mobilePane = 2;
    if (state.panelSettings === 1) state.panelSettings = null;
  }
  state.layout = nextLayout;
  moveParseToRightmost();
  if (!readerPaneIndexes().includes(state.activePane)) state.activePane = readerPaneIndexes()[0] ?? 0;
  if (!visiblePaneIndexes().includes(state.mobilePane)) state.mobilePane = state.activePane;
  state.panelSettings = null;
  persist();
  render();
  loadVisiblePanes();
}

function syncPartnerPane(sourceIndex, next) {
  if (state.layout < 2 || !state.paneSync) return false;
  const sourcePane = paneAt(sourceIndex);
  readerPaneIndexes().filter((index) => index !== sourceIndex).forEach((targetIndex) => {
    const targetPane = paneAt(targetIndex);
    targetPane.reference = { ...next };
    targetPane.label = displayReference(next);
    targetPane.scope = targetPane.view === "compare" ? "verse" : sourcePane.scope;
    targetPane.fallback = null;
    adaptOriginalLanguageVersion(targetPane, next);
    updateOfflineVersion(targetPane);
    queueArrival(targetIndex, next);
  });
  return true;
}

function changePaneReference(paneIndex, next) {
  const pane = paneAt(paneIndex);
  pane.reference = next;
  pane.label = displayReference(next);
  pane.scope = "chapter";
  if (pane.view === "compare") pane.view = "paragraph";
  adaptOriginalLanguageVersion(pane, next);
  updateOfflineVersion(pane);
  state.activePane = paneIndex;
  state.mobilePane = paneIndex;
  state.selectedVerse = null;
  state.navigatorOpen = false;
  state.panelSettings = null;
  markPaneUsed(paneIndex);
  queueArrival(paneIndex, next);
  syncPartnerPane(paneIndex, next);
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

function activateVerseFocus() {
  const sourceIndex = state.activePane;
  const sourcePane = paneAt(sourceIndex);
  const reference = parseReference(popoverVerse);
  if (!reference) return;
  let targetIndex = readerPaneIndexes().find((index) => index !== sourceIndex);
  if (targetIndex === undefined) {
    targetIndex = Math.min(state.layout, 2);
    state.layout = Math.max(state.layout, targetIndex + 1);
    canvasAt(targetIndex).mode = "reader";
  }

  const focusedPane = paneAt(targetIndex);
  focusedPane.reference = reference;
  focusedPane.translation = sourcePane.translation;
  focusedPane.label = displayReference(reference);
  focusedPane.scope = "verse";
  focusedPane.view = "compare";
  focusedPane.fallback = null;
  state.activePane = targetIndex;
  state.mobilePane = targetIndex;
  state.selectedVerse = null;
  popoverVerse = null;
  queueArrival(targetIndex, reference);
  persist();
  render();
  loadVisiblePanes();
}

function loadVerseInAdjacentCompare(sourceIndex, reference) {
  const targetIndex = sourceIndex + 1;
  if (targetIndex >= state.layout || !isReaderCanvas(targetIndex)) return false;
  const targetPane = paneAt(targetIndex);
  if (targetPane.view !== "compare") return false;
  const parsed = parseReference(reference);
  if (!parsed) return false;
  targetPane.reference = parsed;
  targetPane.label = displayReference(parsed);
  targetPane.scope = "verse";
  targetPane.fallback = null;
  updateOfflineVersion(targetPane);
  queueArrival(targetIndex, parsed);
  persist();
  render();
  loadVisiblePanes();
  return true;
}

function openParsingPanel(target) {
  const translation = target.dataset.morphTranslation;
  const book = target.dataset.morphBook;
  const reference = target.dataset.morphReference;
  const index = Number(target.dataset.morphWord);
  const parsed = parseReference(reference);
  const words = morphologyData[morphologyKey(translation, book)]?.verses?.[parsed?.chapter + ":" + parsed?.verse];
  const word = words?.[index];
  if (!parsed || !word) return;
  let parseIndex = visiblePaneIndexes().find((paneIndex) => canvasAt(paneIndex).mode === "parse");
  if (parseIndex === undefined) {
    if (state.layout === 1) {
      parseIndex = 1;
      state.layout = 2;
    } else if (state.layout === 2) {
      parseIndex = 1;
    } else {
      const candidates = readerPaneIndexes().filter((paneIndex) => paneIndex !== state.activePane);
      parseIndex = candidates.sort((left, right) => (canvasAt(left).lastUsed || 0) - (canvasAt(right).lastUsed || 0))[0] ?? state.activePane;
    }
  }
  const canvas = canvasAt(parseIndex);
  canvas.mode = "parse";
  canvas.parseData = { translation, book, reference, word };
  if (state.layout === 2) state.twoPanelRatio = .66;
  moveParseToRightmost();
  state.panelSettings = null;
  state.mobilePane = state.layout - 1;
  persist();
  render();
}

function closeParsingPanel(paneIndex) {
  moveParseToRightmost();
  paneIndex = state.layout - 1;
  const canvas = canvasAt(paneIndex);
  canvas.mode = "reader";
  delete canvas.parseData;
  if (paneIndex === state.layout - 1) state.layout = Math.max(1, state.layout - 1);
  state.activePane = activeReaderIndex();
  state.mobilePane = state.activePane;
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
  dismissFloatingMenus(event);
  const insidePicker = event.target.closest(".reference-browser");
  const pickerTrigger = event.target.closest('[data-action="toggle-browser"]');
  const insideVersePopover = event.target.closest("#verse-popover");
  const clickedVerse = event.target.closest("[data-verse]");
  const morphWord = event.target.closest("[data-morph-word]");
  const formatControl = event.target.closest("[data-format]");
  const selectionCleared = !formatControl && !clickedVerse && !insideVersePopover && clearVerseSelection();
  if (state.navigatorOpen && !insidePicker && !pickerTrigger) state.navigatorOpen = false;
  if (formatControl) return;
  if (morphWord) {
    const sourcePane = morphWord.closest("[data-activate-pane]");
    if (sourcePane) {
      state.activePane = Number(sourcePane.dataset.activatePane);
      markPaneUsed(state.activePane);
    }
    return openParsingPanel(morphWord);
  }
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
    const index = Number(paneIndex);
    const canvas = canvasAt(index);
    if (canvas.activeTab === id) {
      state.panelSettings = state.panelSettings === index ? null : index;
    } else {
      canvas.activeTab = id;
      state.panelSettings = null;
    }
    state.activePane = index;
    state.mobilePane = index;
    markPaneUsed(index);
    persist(); render(); loadVisiblePanes(); return;
  }
  const canvasNew = event.target.closest("[data-canvas-new]");
  if (canvasNew) return newCanvasTab(Number(canvasNew.dataset.canvasNew));
  const mobilePane = event.target.closest("[data-mobile-pane]");
  if (mobilePane) {
    const paneIndex = Number(mobilePane.dataset.mobilePane);
    state.mobilePane = paneIndex;
    if (isReaderCanvas(paneIndex)) { state.activePane = paneIndex; markPaneUsed(paneIndex); }
    persist(); render(); return;
  }
  const chapterNav = event.target.closest("[data-chapter-nav]");
  if (chapterNav) { const parts = chapterNav.dataset.chapterNav.split("|"); navigateChapter(Number(parts[0]), Number(parts[1])); return; }
  const browseBook = event.target.closest("[data-browse-book]");
  if (browseBook) {
    const nextBook = browseBook.dataset.browseBook;
    if (state.browseBook === nextBook && state.browseStage !== "books") {
      state.browseBook = "";
      state.browseStage = "books";
      browseVerseCount = null;
      browseVerseMessage = "Loading verses...";
    } else {
      state.browseBook = nextBook;
      state.browseChapter = 1;
      state.browseStage = "chapters";
      browseVerseCount = null;
      browseVerseMessage = "Loading verses...";
    }
    state.navigatorOpen = true;
    persist(); render(); return;
  }
  const browseChapter = event.target.closest("[data-browse-chapter]");
  if (browseChapter) {
    const nextChapter = Number(browseChapter.dataset.browseChapter);
    let loadVerses = false;
    if (state.browseStage === "verses" && Number(state.browseChapter) === nextChapter) {
      state.browseStage = "chapters";
      browseVerseCount = null;
      browseVerseMessage = "Loading verses...";
    } else {
      state.browseChapter = nextChapter;
      state.browseStage = "verses";
      browseVerseCount = null;
      browseVerseMessage = "Loading verses...";
      loadVerses = true;
    }
    state.navigatorOpen = true;
    persist(); render();
    if (loadVerses) prepareBrowseVerses();
    return;
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
  if (verse && !event.target.closest("[data-action]")) {
    state.activePane = Number(verse.dataset.pane);
    if (paneAt(state.activePane).view === "compare") return;
    if (event.ctrlKey) return toggleMultiVerse(verse.dataset.verse, verse);
    if (clearVerseSelection()) {
      document.querySelector("#verse-popover")?.classList.remove("visible");
      document.querySelectorAll(".verse.selected, .interlinear-verse.selected, .comparison-version.selected").forEach((item) => item.classList.remove("selected"));
      persist();
    }
    return;
  }
  const pane = event.target.closest("[data-activate-pane]");
  if (pane && !event.target.closest("button, select, input, textarea, [contenteditable=true]")) {
    const paneIndex = Number(pane.dataset.activatePane);
    if (selectionCleared || state.activePane !== paneIndex) {
      state.activePane = paneIndex;
      state.mobilePane = paneIndex;
      state.panelSettings = null;
      markPaneUsed(paneIndex);
      persist();
      render();
    }
    return;
  }
  const study = event.target.closest("[data-study-tab], [data-study-open]");
  if (study) { state.studyTab = study.dataset.studyTab || study.dataset.studyOpen; persist(); render(); return; }
  const highlighter = event.target.closest("[data-highlight]");
  if (highlighter) {
    highlightedVerseReferences().forEach((reference) => { state.highlights[reference] = highlighter.dataset.highlight; });
    persist(); render(); return;
  }
  const deleteBookmark = event.target.closest("[data-delete-bookmark]");
  if (deleteBookmark) {
    state.bookmarks = state.bookmarks.filter((item) => item.id !== deleteBookmark.dataset.deleteBookmark);
    persist(); render(); showToast("Bookmark removed."); return;
  }
  const bookmark = event.target.closest("[data-go-bookmark]");
  if (bookmark) { const parsed = parseReference(bookmark.dataset.goBookmark); if (parsed) { changeReference(parsed); state.studyTab = "bookmarks"; } return; }
  const paper = event.target.closest("[data-paper]");
  if (paper) { state.paper = paper.dataset.paper; persist(); render(); openSettings(event.target); return; }
  const fontSizePip = event.target.closest("[data-font-size]");
  if (fontSizePip) {
    const script = fontSizePip.dataset.fontScript || "latin";
    state.fontSizes[script] = Number(fontSizePip.dataset.fontSize);
    state.fontSize = state.fontSizes.latin;
    persist(); render(); openSettings(document.querySelector('[data-action="settings"]'));
    return;
  }
  const actionTarget = event.target.closest("[data-action]");
  if (!actionTarget) {
    if (event.target.closest("select, input, textarea, [contenteditable=true]")) { persist(); return; }
    if (!event.target.closest("#verse-popover") && !event.target.closest("#settings-menu") && !event.target.closest(".pane-settings-popover")) {
      closeOverlays();
      state.panelSettings = null;
    }
    persist(); render();
    return;
  }
  const action = actionTarget.dataset.action;
  if (action === "cycle-layout") return setLayout(state.layout === 3 ? 1 : state.layout + 1);
  if (action === "toggle-pane-sync") {
    state.paneSync = !state.paneSync;
    if (state.paneSync) syncPartnerPane(activeReaderIndex(), activePane().reference);
    persist(); render(); loadVisiblePanes(); return;
  }
  if (action === "toggle-browser") {
    state.navigatorOpen = !state.navigatorOpen;
    if (state.navigatorOpen) {
      state.browseStage = "books";
      state.browseBook = "";
      state.browseChapter = activePane().reference.chapter;
      browseVerseCount = null;
      browseVerseMessage = "Loading verses...";
    }
    persist(); render(); return;
  }
  if (action === "toggle-study") { state.studyOpen = !state.studyOpen; persist(); render(); return; }
  if (action === "close-parse-panel") return closeParsingPanel(Number(actionTarget.dataset.paneIndex));
  if (action === "settings") return openSettings(actionTarget);
  if (action === "dark-mode") { state.dark = !state.dark; persist(); render(); return; }
  if (action === "cycle-compare-cuv") {
    const pane = paneAt(Number(actionTarget.dataset.paneIndex));
    pane.compareCuv = Number(actionTarget.dataset.direction) < 0 ? "CUVS" : "CUVT";
    persist(); render(); loadVisiblePanes(); return;
  }
  if (action === "bookmark") {
    if (!state.bookmarks.some((item) => item.reference === popoverVerse)) state.bookmarks.push({ id: createRecordId("bookmark"), reference: popoverVerse, label: "Saved passage" });
    state.studyTab = "bookmarks"; state.studyOpen = true; persist(); popoverVerse = null; render(); showToast("Passage saved."); return;
  }
  if (action === "copy-verse") { await navigator.clipboard?.writeText(popoverVerse); showToast("Reference copied."); return; }
  if (action === "open-note") { state.studyTab = "notes"; state.studyOpen = true; popoverVerse = null; persist(); render(); return; }
  if (action === "clear-highlight") {
    highlightedVerseReferences().forEach((reference) => delete state.highlights[reference]);
    persist(); popoverVerse = null; state.selectedVerse = null; multiVerseSelection = []; render(); return;
  }
  if (action === "focus-verse") return activateVerseFocus();
  if (action === "show-whole-chapter") {
    const paneIndex = Number(actionTarget.dataset.paneIndex);
    const pane = paneAt(paneIndex);
    pane.scope = "chapter";
    if (pane.view === "compare") pane.view = "paragraph";
    state.activePane = paneIndex;
    state.selectedVerse = null;
    persist(); render(); return;
  }
  if (action === "note-mode") {
    syncNote(); state.noteMode = state.noteMode === "rich" ? "markdown" : "rich"; persist(); render(); return;
  }
  if (action === "save-note") { syncNote(); showToast("Note saved on this device."); return; }
  if (action === "delete-note") {
    const reference = selectedReference();
    if (!window.confirm("Delete the note for " + reference + "?")) return;
    delete state.notes[reference];
    persist(); render(); showToast("Note deleted."); return;
  }
  if (action === "export-md") { downloadFile(selectedReference().replace(/[^a-z0-9]+/gi, "-") + ".md", noteExport(), "text/markdown;charset=utf-8"); return; }
  if (action === "export-pdf") return exportPdf();
  if (action === "obsidian") return saveToObsidian();
});

app.addEventListener("change", (event) => {
  const paneParse = event.target.dataset.paneParse;
  if (paneParse !== undefined) {
    const pane = paneAt(Number(paneParse));
    pane.parseEnabled = event.target.checked;
    state.activePane = Number(paneParse);
    state.mobilePane = Number(paneParse);
    markPaneUsed(state.activePane);
    persist();
    render();
    ensurePaneMorphology(pane);
    return;
  }
  const paneView = event.target.dataset.paneView;
  if (paneView !== undefined) {
    const pane = paneAt(Number(paneView));
    pane.view = event.target.value;
    if (pane.view === "compare" && pane.scope !== "verse") pane.view = "paragraph";
    if (pane.view === "interlinear" && pane.translation === interlinearTranslation(pane.reference)) pane.translation = "NET";
    state.activePane = Number(paneView);
    state.mobilePane = Number(paneView);
    state.panelSettings = null;
    markPaneUsed(state.activePane);
    persist(); render(); loadVisiblePanes(); return;
  }
  const paneVersion = event.target.dataset.paneVersion;
  if (paneVersion !== undefined) {
    const pane = paneAt(Number(paneVersion));
    const currentResult = chapterData[referenceKey(pane)];
    if (currentResult?.verses?.length) pane.fallback = { result: currentResult, translation: pane.translation };
    pane.translation = event.target.value;
    updateOfflineVersion(pane);
    state.activePane = Number(paneVersion);
    state.mobilePane = Number(paneVersion);
    state.panelSettings = null;
    markPaneUsed(state.activePane);
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
    state.fontSizes.latin = Number(event.target.value); state.fontSize = state.fontSizes.latin; persist(); render(); return;
  }
});

app.addEventListener("input", (event) => {
  if (event.target.matches("[data-note-editor], [data-note-markdown]")) syncNote();
});

app.addEventListener("dblclick", (event) => {
  const verse = event.target.closest("[data-verse]");
  if (!verse || event.target.closest("[data-action], [data-morph-word]")) return;
  const paneIndex = Number(verse.dataset.pane);
  if (paneAt(paneIndex).view === "compare") return;
  state.activePane = paneIndex;
  state.mobilePane = paneIndex;
  if (event.ctrlKey) return toggleMultiVerse(verse.dataset.verse, verse);
  if (loadVerseInAdjacentCompare(paneIndex, verse.dataset.verse)) return;
  multiVerseSelection = [];
  openVersePopover(verse.dataset.verse, verse);
});

app.addEventListener("mouseup", (event) => {
  if (event.button !== 0 || event.detail !== 1) return;
  if (event.target.closest("[data-morph-word]")) return;
  const verse = event.target.closest("[data-verse]");
  if (!verse || paneAt(Number(verse.dataset.pane)).view === "compare") return;
  const selection = window.getSelection();
  if (!selection || !selection.isCollapsed) return;
  const range = document.caretRangeFromPoint?.(event.clientX, event.clientY);
  const node = range?.startContainer;
  if (!node || node.nodeType !== Node.TEXT_NODE) return;
  const text = node.textContent || "";
  const isWordCharacter = (character) => /[\p{L}\p{M}\p{N}'’]/u.test(character);
  let start = range.startOffset;
  let end = range.startOffset;
  while (start > 0 && isWordCharacter(text[start - 1])) start -= 1;
  while (end < text.length && isWordCharacter(text[end])) end += 1;
  if (start === end) return;
  const wordRange = document.createRange();
  wordRange.setStart(node, start);
  wordRange.setEnd(node, end);
  selection.removeAllRanges();
  selection.addRange(wordRange);
});

app.addEventListener("pointerdown", (event) => {
  const handle = event.target.closest("[data-pane-resizer]");
  if (!handle || window.innerWidth <= 760) return;
  const grid = handle.closest(".pane-grid");
  if (!grid) return;
  event.preventDefault();
  resizeSession = { kind: handle.dataset.paneResizer, grid, startX: event.clientX, startWidth: state.singlePanelWidth, startRatio: state.twoPanelRatio };
  handle.setPointerCapture?.(event.pointerId);
  document.body.classList.add("resizing-panels");
});

window.addEventListener("pointermove", (event) => {
  if (!resizeSession) return;
  const readingArea = resizeSession.grid.closest(".reading-area");
  if (resizeSession.kind === "single") {
    const maximum = Math.min(1300, (readingArea?.getBoundingClientRect().width || window.innerWidth) - 34);
    state.singlePanelWidth = Math.round(Math.min(maximum, Math.max(460, resizeSession.startWidth + event.clientX - resizeSession.startX)));
    resizeSession.grid.style.setProperty("--single-panel-width", state.singlePanelWidth + "px");
    return;
  }
  const rect = resizeSession.grid.getBoundingClientRect();
  const available = Math.max(1, rect.width - 14);
  const leftMinimum = 360;
  const rightMinimum = canvasAt(1).mode === "parse" ? 310 : 360;
  const leftWidth = Math.min(available - rightMinimum, Math.max(leftMinimum, event.clientX - rect.left));
  state.twoPanelRatio = Math.min(.72, Math.max(.28, leftWidth / available));
  resizeSession.grid.style.setProperty("--left-panel-width", Math.round(state.twoPanelRatio * 1000) / 10 + "%");
});

window.addEventListener("pointerup", () => {
  if (!resizeSession) return;
  resizeSession = null;
  document.body.classList.remove("resizing-panels");
  persist();
  render();
});

app.addEventListener("scroll", (event) => {
  const list = event.target;
  if (!(list instanceof Element) || !list.matches(".verse-list") || state.layout < 2 || !state.paneSync || syncScrollLocked) return;
  const readerPane = list.closest("[data-activate-pane]");
  if (!readerPane) return;
  const sourceIndex = Number(readerPane.dataset.activatePane);
  const listTop = list.getBoundingClientRect().top;
  const verses = Array.from(list.querySelectorAll("[data-verse]"));
  const currentVerse = verses.reduce((closest, item) => {
    const distance = Math.abs(item.getBoundingClientRect().top - listTop);
    return !closest || distance < closest.distance ? { item, distance } : closest;
  }, null)?.item;
  const reference = currentVerse && parseReference(currentVerse.dataset.verse);
  if (!reference) return;
  const referenceLabel = displayReference(reference);
  const key = sourceIndex + "|" + referenceLabel;
  if (key === lastSyncedScrollReference) return;
  lastSyncedScrollReference = key;
  syncScrollLocked = true;
  readerPaneIndexes().filter((targetIndex) => targetIndex !== sourceIndex).forEach((targetIndex) => {
    const targetPane = paneAt(targetIndex);
    if (targetPane.reference.book !== reference.book || Number(targetPane.reference.chapter) !== Number(reference.chapter)) return;
    const targetList = document.querySelector('[data-activate-pane="' + targetIndex + '"] .verse-list');
    const targetVerse = document.querySelector('[data-activate-pane="' + targetIndex + '"] [data-verse="' + referenceLabel + '"]');
    if (!targetList || !targetVerse) return;
    const offset = targetList.scrollTop + targetVerse.getBoundingClientRect().top - targetList.getBoundingClientRect().top - 16;
    targetList.scrollTo({ top: Math.max(0, offset), behavior: "auto" });
  });
  setTimeout(() => { syncScrollLocked = false; }, 80);
}, true);

app.addEventListener("mousedown", (event) => {
  if (event.target.closest("button[data-format]")) event.preventDefault();
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
