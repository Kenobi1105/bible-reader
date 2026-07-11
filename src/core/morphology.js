import { loadCachedChapter, saveCachedChapter } from "./storage.js";

const CACHE_PREFIX = "morphology-v1|";
const SBLGNT_BOOKS = {
  "Matthew": "61-Mt", "Mark": "62-Mk", "Luke": "63-Lk", "John": "64-Jn", "Acts": "65-Ac", "Romans": "66-Ro",
  "1 Corinthians": "67-1Co", "2 Corinthians": "68-2Co", "Galatians": "69-Ga", "Ephesians": "70-Eph", "Philippians": "71-Php",
  "Colossians": "72-Col", "1 Thessalonians": "73-1Th", "2 Thessalonians": "74-2Th", "1 Timothy": "75-1Ti",
  "2 Timothy": "76-2Ti", "Titus": "77-Tit", "Philemon": "78-Phm", "Hebrews": "79-Heb", "James": "80-Jas",
  "1 Peter": "81-1Pe", "2 Peter": "82-2Pe", "1 John": "83-1Jn", "2 John": "84-2Jn", "3 John": "85-3Jn",
  "Jude": "86-Jud", "Revelation": "87-Re"
};

const WLC_BOOKS = {
  "Genesis": "Gen", "Exodus": "Exod", "Leviticus": "Lev", "Numbers": "Num", "Deuteronomy": "Deut", "Joshua": "Josh",
  "Judges": "Judg", "Ruth": "Ruth", "1 Samuel": "1Sam", "2 Samuel": "2Sam", "1 Kings": "1Kgs", "2 Kings": "2Kgs",
  "1 Chronicles": "1Chr", "2 Chronicles": "2Chr", "Ezra": "Ezra", "Nehemiah": "Neh", "Esther": "Esth", "Job": "Job",
  "Psalms": "Ps", "Proverbs": "Prov", "Ecclesiastes": "Eccl", "Song of Songs": "Song", "Isaiah": "Isa", "Jeremiah": "Jer",
  "Lamentations": "Lam", "Ezekiel": "Ezek", "Daniel": "Dan", "Hosea": "Hos", "Joel": "Joel", "Amos": "Amos",
  "Obadiah": "Obad", "Jonah": "Jonah", "Micah": "Mic", "Nahum": "Nah", "Habakkuk": "Hab", "Zephaniah": "Zeph",
  "Haggai": "Hag", "Zechariah": "Zech", "Malachi": "Mal"
};

const GREEK_POS = {
  "A-": "Adjective", "C-": "Conjunction", "D-": "Adverb", "I-": "Interjection", "N-": "Noun", "P-": "Preposition",
  "RA": "Article", "RD": "Demonstrative pronoun", "RI": "Interrogative pronoun", "RP": "Personal pronoun", "RR": "Relative pronoun",
  "V-": "Verb", "X-": "Particle"
};
const CASES = { N: "nominative", G: "genitive", D: "dative", A: "accusative", V: "vocative" };
const NUMBERS = { S: "singular", P: "plural", D: "dual" };
const GENDERS = { M: "masculine", F: "feminine", N: "neuter" };
const TENSES = { P: "present", I: "imperfect", F: "future", A: "aorist", R: "perfect", L: "pluperfect" };
const VOICES = { A: "active", M: "middle", P: "passive", E: "middle or passive" };
const MOODS = { I: "indicative", S: "subjunctive", O: "optative", M: "imperative", N: "infinitive", P: "participle" };

function greekDescription(pos, code) {
  const parts = [GREEK_POS[pos] || "Greek word"];
  if (code === "--------") return parts.join("; ");
  if (pos === "V-") {
    if (TENSES[code[1]]) parts.push(TENSES[code[1]]);
    if (VOICES[code[2]]) parts.push(VOICES[code[2]]);
    if (MOODS[code[3]]) parts.push(MOODS[code[3]]);
    if (code[3] === "P") {
      if (CASES[code[6]]) parts.push(CASES[code[6]]);
      if (NUMBERS[code[5]]) parts.push(NUMBERS[code[5]]);
      if (GENDERS[code[4]]) parts.push(GENDERS[code[4]]);
    } else {
      if (code[0] !== "-") parts.push(code[0] + (code[0] === "1" ? "st" : code[0] === "2" ? "nd" : "rd") + " person");
      if (NUMBERS[code[5]]) parts.push(NUMBERS[code[5]]);
    }
  } else {
    if (CASES[code[4]]) parts.push(CASES[code[4]]);
    if (NUMBERS[code[5]]) parts.push(NUMBERS[code[5]]);
    if (GENDERS[code[6]]) parts.push(GENDERS[code[6]]);
  }
  return parts.join("; ");
}

function hebrewDescription(morphology) {
  const code = (morphology || "").split("/").pop() || "";
  const parts = [];
  const type = { N: "Noun", V: "Verb", A: "Adjective", P: "Pronoun", R: "Preposition", C: "Conjunction", D: "Adverb", T: "Particle", S: "Suffix" }[code[0]] || "Hebrew word";
  parts.push(type);
  if (code[0] === "V") {
    const stem = { q: "Qal", N: "Niphal", p: "Piel", P: "Pual", h: "Hiphil", H: "Hophal", t: "Hithpael" }[code[1]];
    const aspect = { p: "perfect", i: "imperfect", w: "wayyiqtol", v: "imperative", r: "participle", s: "infinitive" }[code[2]];
    if (stem) parts.push(stem);
    if (aspect) parts.push(aspect);
    if (code[3] && /[123]/.test(code[3])) parts.push(code[3] + (code[3] === "1" ? "st" : code[3] === "2" ? "nd" : "rd") + " person");
    if ({ m: "masculine", f: "feminine", c: "common" }[code[4]]) parts.push({ m: "masculine", f: "feminine", c: "common" }[code[4]]);
    if ({ s: "singular", p: "plural", d: "dual" }[code[5]]) parts.push({ s: "singular", p: "plural", d: "dual" }[code[5]]);
  } else if (code[0] === "N" || code[0] === "A" || code[0] === "P") {
    if ({ m: "masculine", f: "feminine", c: "common" }[code[2]]) parts.push({ m: "masculine", f: "feminine", c: "common" }[code[2]]);
    if ({ s: "singular", p: "plural", d: "dual" }[code[3]]) parts.push({ s: "singular", p: "plural", d: "dual" }[code[3]]);
    if ({ a: "absolute", c: "construct", d: "determined" }[code[4]]) parts.push({ a: "absolute", c: "construct", d: "determined" }[code[4]]);
  } else if (code === "Td") {
    parts.push("definite article");
  }
  return parts.join("; ");
}

function parseSblgnt(source) {
  const verses = {};
  source.split(/\r?\n/).forEach((line) => {
    const columns = line.trim().split(/\s+/);
    if (columns.length < 6 || !/^\d{6}$/.test(columns[0])) return;
    const reference = Number(columns[0].slice(2, 4)) + ":" + Number(columns[0].slice(4, 6));
    (verses[reference] ||= []).push({
      surface: columns[3],
      lemma: columns[5],
      morphology: columns[2],
      description: greekDescription(columns[1], columns[2])
    });
  });
  return verses;
}

function parseWlc(source) {
  const document = new DOMParser().parseFromString(source, "application/xml");
  if (document.querySelector("parsererror")) throw new Error("The Hebrew morphology file could not be read.");
  const verses = {};
  Array.from(document.getElementsByTagName("verse")).forEach((verse) => {
    const reference = verse.getAttribute("osisID")?.match(/^[^.]+\.(\d+)\.(\d+)$/);
    if (!reference) return;
    const words = Array.from(verse.getElementsByTagName("w")).map((word) => {
      const morphology = word.getAttribute("morph") || "";
      return {
        surface: (word.textContent || "").replace(/\//g, ""),
        lemma: word.getAttribute("lemma") || "",
        morphology,
        description: hebrewDescription(morphology)
      };
    });
    if (words.length) verses[Number(reference[1]) + ":" + Number(reference[2])] = words;
  });
  return verses;
}

export function isMorphologyTranslation(id) {
  return id === "WLC" || id === "SBLGNT";
}

export function morphologySourceLabel(id) {
  return id === "WLC" ? "Open Scriptures Hebrew Bible morphology" : "MorphGNT morphology";
}

export async function loadMorphologyBook(id, book) {
  const code = id === "WLC" ? WLC_BOOKS[book] : SBLGNT_BOOKS[book];
  if (!code || !isMorphologyTranslation(id)) throw new Error("Parsing is not available for this book.");
  const key = CACHE_PREFIX + id + "|" + book;
  const cached = await loadCachedChapter(key);
  if (cached?.verses) return cached;
  const url = id === "WLC"
    ? "https://raw.githubusercontent.com/openscriptures/morphhb/master/wlc/" + code + ".xml"
    : "https://raw.githubusercontent.com/morphgnt/sblgnt/master/" + code + "-morphgnt.txt";
  const response = await fetch(url);
  if (!response.ok) throw new Error("Could not download parsing data.");
  const source = await response.text();
  const result = { source: morphologySourceLabel(id), verses: id === "WLC" ? parseWlc(source) : parseSblgnt(source) };
  await saveCachedChapter(key, result);
  return result;
}
