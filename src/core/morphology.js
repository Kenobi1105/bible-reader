import { loadCachedChapter, saveCachedChapter } from "./storage.js";

const CACHE_PREFIX = "morphology-v4|";
const LEXICON_CACHE_PREFIX = "strongs-lexicon-v1|";
const STRONGS_SOURCES = {
  WLC: "https://raw.githubusercontent.com/openscriptures/strongs/refs/heads/master/hebrew/strongs-hebrew-dictionary.js",
  SBLGNT: "https://raw.githubusercontent.com/openscriptures/strongs/refs/heads/master/greek/strongs-greek-dictionary.js"
};
const HEBREW_PREFIXES = {
  b: { form: "בְּ", gloss: "in" }, c: { form: "וְ", gloss: "and" }, d: { form: "הַ", gloss: "the" },
  i: { form: "הֲ", gloss: "question" }, k: { form: "כְּ", gloss: "as" }, l: { form: "לְ", gloss: "to" },
  m: { form: "מִן", gloss: "from" }
};
const lexiconLoads = new Map();
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

function conciseGloss(entry) {
  const gloss = (entry?.kjv_def || entry?.strongs_def || "")
    .replace(/\[[^\]]+\]/g, "")
    .replace(/\s+/g, " ")
    .replace(/^[-+;,.\s]+/, "")
    .trim();
  return gloss.length > 110 ? gloss.slice(0, 107).replace(/\s+\S*$/, "") + "..." : gloss;
}

function parseStrongsDictionary(source) {
  const assignment = source.indexOf("Dictionary =");
  const start = source.indexOf("{", assignment);
  const end = source.lastIndexOf("};");
  if (start < 0 || end < start) throw new Error("The lexical dictionary could not be read.");
  return JSON.parse(source.slice(start, end + 1));
}

async function loadStrongsDictionary(id) {
  if (lexiconLoads.has(id)) return lexiconLoads.get(id);
  const load = (async () => {
    const key = LEXICON_CACHE_PREFIX + id;
    const cached = await loadCachedChapter(key);
    if (cached?.entries) return cached.entries;
    const response = await fetch(STRONGS_SOURCES[id]);
    if (!response.ok) throw new Error("Could not download lexical data.");
    const entries = parseStrongsDictionary(await response.text());
    await saveCachedChapter(key, { entries });
    return entries;
  })();
  lexiconLoads.set(id, load);
  try { return await load; } catch (error) { lexiconLoads.delete(id); throw error; }
}

function strongsId(token, prefix) {
  const match = String(token || "").match(/^(\d+)/);
  return match ? prefix + Number(match[1]) : "";
}

function normalizeGreek(value) {
  return String(value || "").normalize("NFD").replace(/\p{M}/gu, "").replace(/ς/g, "σ").toLowerCase();
}

function hebrewRoot(entryId, dictionary, seen = new Set()) {
  const entry = dictionary[entryId];
  if (!entry || seen.has(entryId)) return entry?.lemma || "";
  seen.add(entryId);
  if (/primitive root|primary root|unused root/i.test(entry.derivation || "")) return entry.lemma || "";
  const parent = (entry.derivation || "").match(/H0*(\d+)/)?.[1];
  return parent ? hebrewRoot("H" + Number(parent), dictionary, seen) : (entry.lemma || "");
}

function enrichHebrewWord(word, dictionary) {
  const parts = String(word.lemma || "").split("/").filter(Boolean);
  const lexicalId = [...parts].reverse().map((part) => strongsId(part, "H")).find(Boolean);
  const lexicalEntry = dictionary[lexicalId];
  if (!lexicalEntry) return;
  const breakdown = parts.map((part) => {
    const prefix = HEBREW_PREFIXES[part];
    if (prefix) return prefix;
    const entry = dictionary[strongsId(part, "H")];
    return entry ? { form: entry.lemma, gloss: conciseGloss(entry) } : null;
  }).filter(Boolean);
  word.lexical = {
    id: lexicalId,
    lemma: lexicalEntry.lemma || word.surface,
    root: hebrewRoot(lexicalId, dictionary),
    gloss: conciseGloss(lexicalEntry),
    breakdown: breakdown.map((part) => part.form).join(" + "),
    breakdownGloss: breakdown.map((part) => part.gloss).filter(Boolean).join(" + ")
  };
}

function enrichGreekWord(word, dictionary, index) {
  const entry = index.get(normalizeGreek(cleanGreekForLookup(word.lemma)));
  if (!entry) return;
  word.lexical = { id: entry.id, lemma: entry.lemma || word.lemma, gloss: conciseGloss(entry) };
}

async function enrichLexicalData(id, result) {
  const dictionary = await loadStrongsDictionary(id);
  if (id === "WLC") {
    Object.values(result.verses).flat().forEach((word) => enrichHebrewWord(word, dictionary));
  } else {
    const index = new Map(Object.entries(dictionary).map(([key, entry]) => [normalizeGreek(entry.lemma), { ...entry, id: key }]));
    Object.values(result.verses).flat().forEach((word) => enrichGreekWord(word, dictionary, index));
  }
  result.lexiconVersion = 1;
}

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
  const rawCode = (morphology || "").split("/").pop() || "";
  // OSHB marks Hebrew morphology with an initial language marker, e.g. HVqp3ms.
  const code = rawCode.replace(/^H(?=[A-Z])/, "");
  const parts = [];
  const type = { N: "Noun", V: "Verb", A: "Adjective", P: "Pronoun", R: "Preposition", C: "Conjunction", D: "Adverb", T: "Particle", S: "Suffix" }[code[0]] || "Hebrew word";
  if (code[0] === "V") {
    const stem = { q: "Qal", N: "Niphal", p: "Piel", P: "Pual", h: "Hiphil", H: "Hophal", t: "Hithpael" }[code[1]];
    const aspect = { p: "perfect", i: "imperfect", w: "wayyiqtol", v: "imperative", r: "participle", s: "infinitive" }[code[2]];
    if (stem) parts.push(stem);
    if (aspect) parts.push(aspect);
    if (code[3] && /[123]/.test(code[3])) parts.push(code[3] + (code[3] === "1" ? "st" : code[3] === "2" ? "nd" : "rd") + " person");
    if ({ m: "masculine", f: "feminine", c: "common" }[code[4]]) parts.push({ m: "masculine", f: "feminine", c: "common" }[code[4]]);
    if ({ s: "singular", p: "plural", d: "dual" }[code[5]]) parts.push({ s: "singular", p: "plural", d: "dual" }[code[5]]);
  } else {
    parts.push(type);
  }
  if (code[0] === "N" || code[0] === "A" || code[0] === "P") {
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

function cleanGreekForLookup(value) {
  return String(value || "")
    .replace(/[()[\]{}⟦⟧⟨⟩‹›†‡*]/g, "")
    .replace(/[\u2E00-\u2E7F]/g, "")
    .replace(/\s+/g, " ")
    .trim();
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
  let result = cached?.verses ? cached : null;
  if (!result) {
    const url = id === "WLC"
      ? "https://raw.githubusercontent.com/openscriptures/morphhb/master/wlc/" + code + ".xml"
      : "https://raw.githubusercontent.com/morphgnt/sblgnt/master/" + code + "-morphgnt.txt";
    const response = await fetch(url);
    if (!response.ok) throw new Error("Could not download parsing data.");
    const source = await response.text();
    result = { source: morphologySourceLabel(id), verses: id === "WLC" ? parseWlc(source) : parseSblgnt(source) };
  }
  if (result.lexiconVersion !== 1) {
    try { await enrichLexicalData(id, result); } catch { /* Keep parsing available if lexical data is temporarily unavailable. */ }
  }
  await saveCachedChapter(key, result);
  return result;
}
