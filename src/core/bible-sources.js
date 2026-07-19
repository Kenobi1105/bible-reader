import { BOOKS, displayReference } from "./references.js";

export const TRANSLATIONS = {
  NET: { label: "NET", name: "New English Translation", language: "English", kind: "net", direction: "ltr" },
  CUVS: { label: "CUV Simplified", name: "Chinese Union Version", language: "中文（简体）", kind: "getbible", code: "cus", direction: "ltr", script: "chinese", fontClass: "chinese-sc" },
  CUVT: { label: "CUV Traditional", name: "Chinese Union Version", language: "中文（繁體）", kind: "getbible", code: "cut", direction: "ltr", script: "chinese", fontClass: "chinese-tc" },
  SBLGNT: { label: "SBLGNT", name: "SBL Greek New Testament", language: "Koine Greek", kind: "sblgnt", direction: "ltr", script: "greek" },
  WLC: { label: "WLC", name: "Westminster Leningrad Codex", language: "Biblical Hebrew", kind: "getbible", code: "codex", direction: "rtl", script: "hebrew" },
  LXX: { label: "LXX", name: "Septuagint", language: "Ancient Greek", kind: "getbible", code: "lxx", direction: "ltr", script: "greek" }
};

function chapterFromGetBible(payload, reference) {
  const chapter = payload?.book?.chapters?.[reference.chapter]
    || payload?.chapters?.[reference.chapter]
    || payload?.data?.book?.chapters?.[reference.chapter]
    || payload?.data?.chapters?.[reference.chapter];
  const verses = chapter?.verses || payload?.verses || payload?.data?.verses;
  if (!verses) return [];
  return Object.values(verses)
    .map((verse, index) => ({
      number: Number(verse.verse || verse.number || index + 1),
      text: cleanText(verse.text || verse.verseText || verse.content || "")
    }))
    .filter((verse) => verse.text);
}

function chapterFromLocal(payload, reference) {
  const chapter = payload?.[reference.book]?.[reference.chapter]
    || payload?.books?.[reference.book]?.chapters?.[reference.chapter]
    || payload?.books?.find?.((book) => book.name === reference.book)?.chapters?.[reference.chapter];
  const verses = chapter?.verses || chapter || [];
  if (Array.isArray(verses)) {
    return verses.map((verse, index) => ({
      number: Number(verse.number || verse.verse || index + 1),
      text: cleanText(verse.text || verse.content || "")
    })).filter((verse) => verse.text);
  }
  return Object.entries(verses).map(([number, value]) => ({
    number: Number(value?.number || value?.verse || number),
    text: cleanText(value?.text || value?.content || value || "")
  })).filter((verse) => verse.text);
}

function cleanText(value) {
  const holder = document.createElement("div");
  holder.innerHTML = String(value).replace(/<br\s*\/?>/gi, " ");
  return holder.textContent.replace(/\s+/g, " ").trim();
}

function sblCriticalMarkers(text) {
  return Array.from(text.matchAll(/[\u2E00-\u2E05\u27E6\u27E7\[\]]/gu)).map((match) => ({
    marker: match[0],
    index: match.index
  }));
}

async function fetchNet(reference) {
  const chapterReference = { ...reference, verse: 0 };
  const url = "https://labs.bible.org/api/?passage=" + encodeURIComponent(displayReference(chapterReference)) + "&formatting=plain&type=json";
  const response = await fetch(url);
  if (!response.ok) throw new Error("NET service returned " + response.status);
  const data = await response.json();
  return data.map((verse) => ({ number: Number(verse.verse), text: cleanText(verse.text) }));
}

async function fetchGetBible(reference, translation) {
  const bookNumber = BOOKS.findIndex(([book]) => book === reference.book) + 1;
  const url = "https://api.getbible.net/v2/" + translation.code + "/" + bookNumber + "/" + reference.chapter + ".json";
  const response = await fetch(url);
  if (!response.ok) throw new Error("Source service returned " + response.status);
  const data = await response.json();
  const verses = chapterFromGetBible(data, reference);
  if (!verses.length) throw new Error("The source returned an unreadable chapter format.");
  return verses;
}

const sblFiles = {
  "Matthew": "Matt", "Mark": "Mark", "Luke": "Luke", "John": "John", "Acts": "Acts",
  "Romans": "Rom", "1 Corinthians": "1Cor", "2 Corinthians": "2Cor", "Galatians": "Gal",
  "Ephesians": "Eph", "Philippians": "Phil", "Colossians": "Col", "1 Thessalonians": "1Thess",
  "2 Thessalonians": "2Thess", "1 Timothy": "1Tim", "2 Timothy": "2Tim", "Titus": "Titus",
  "Philemon": "Phlm", "Hebrews": "Heb", "James": "Jas", "1 Peter": "1Pet", "2 Peter": "2Pet",
  "1 John": "1John", "2 John": "2John", "3 John": "3John", "Jude": "Jude", "Revelation": "Rev"
};

async function fetchSblGnt(reference) {
  const file = sblFiles[reference.book];
  if (!file) throw new Error("SBLGNT contains New Testament books only.");
  const url = "https://raw.githubusercontent.com/Faithlife/SBLGNT/master/data/sblgnt/xml/" + file + ".xml";
  const response = await fetch(url);
  if (!response.ok) throw new Error("SBLGNT source returned " + response.status);
  const documentXml = new DOMParser().parseFromString(await response.text(), "application/xml");
  const prefix = reference.book + " " + reference.chapter + ":";
  const verses = [...documentXml.querySelectorAll("verse-number")]
    .filter((node) => node.getAttribute("id")?.startsWith(prefix))
    .map((node) => {
      let text = "";
      let next = node.nextSibling;
      while (next && !(next.nodeType === Node.ELEMENT_NODE && next.nodeName === "verse-number")) {
        text += next.textContent || "";
        next = next.nextSibling;
      }
      const cleaned = cleanText(text);
      return {
        number: Number(node.getAttribute("id").split(":")[1]),
        text: cleaned,
        markers: sblCriticalMarkers(cleaned)
      };
    })
    .filter((verse) => verse.text);
  if (!verses.length) throw new Error("No SBLGNT verses were found for this chapter.");
  return verses;
}

async function fetchLocal(reference, translation) {
  const response = await fetch("public/data/" + translation.file);
  if (!response.ok) throw new Error("Local file " + translation.file + " has not been added yet.");
  const data = await response.json();
  const verses = chapterFromLocal(data, reference);
  if (!verses.length) throw new Error("No matching chapter was found in " + translation.file + ".");
  return verses;
}

export async function getChapter(reference, translationId) {
  const translation = TRANSLATIONS[translationId];
  try {
    let verses;
    if (translation.kind === "net") verses = await fetchNet(reference);
    if (translation.kind === "getbible") verses = await fetchGetBible(reference, translation);
    if (translation.kind === "local") verses = await fetchLocal(reference, translation);
    if (translation.kind === "sblgnt") verses = await fetchSblGnt(reference);
    let message = "Loaded from the selected Bible source.";
    if (translation.kind === "net") message = "Loaded from the official NET Bible API.";
    if (translation.kind === "getbible") message = "Loaded through GetBible / CrossWire.";
    if (translation.kind === "sblgnt") message = "SBLGNT · CC BY 4.0 · Faithlife / SBL.";
    return { verses, online: translation.kind !== "local", message };
  } catch (error) {
    return {
      verses: [],
      online: translation.kind !== "local",
      message: error.message,
      error: true
    };
  }
}
