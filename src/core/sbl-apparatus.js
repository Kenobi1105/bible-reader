const APPARATUS_BASE_URL = "https://raw.githubusercontent.com/Faithlife/SBLGNT/master/data/sblgntapp/xml/";

const APPARATUS_FILES = {
  "Matthew": "Matt", "Mark": "Mark", "Luke": "Luke", "John": "John", "Acts": "Acts",
  "Romans": "Rom", "1 Corinthians": "1Cor", "2 Corinthians": "2Cor", "Galatians": "Gal",
  "Ephesians": "Eph", "Philippians": "Phil", "Colossians": "Col", "1 Thessalonians": "1Thess",
  "2 Thessalonians": "2Thess", "1 Timothy": "1Tim", "2 Timothy": "2Tim", "Titus": "Titus",
  "Philemon": "Phlm", "Hebrews": "Heb", "James": "Jas", "1 Peter": "1Pet", "2 Peter": "2Pet",
  "1 John": "1John", "2 John": "2John", "3 John": "3John", "Jude": "Jude", "Revelation": "Rev"
};

const WITNESS = /^(?:\[\[)?(?:WH|Treg|NIV|RP|NA27|NA28|ECM|Greeven|Holmes|Tregmarg|WHmarg)(?:\]\])?:?$/;
const bookIndexes = new Map();
const bookLoads = new Map();
const unitsById = new Map();

function plainText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function referenceParts(reference) {
  const match = String(reference || "").match(/^(.+) (\d+):(\d+)$/);
  return match ? { book: match[1], chapter: Number(match[2]), verse: Number(match[3]) } : null;
}

function parseReading(value) {
  const terms = plainText(value).split(" ").filter(Boolean);
  const witnesses = [];
  while (terms.length && WITNESS.test(terms[terms.length - 1])) {
    witnesses.unshift(terms.pop().replace(/[\[\]:]/g, ""));
  }
  return { text: terms.join(" ").trim(), witnesses };
}

function rangeFromNote(reference, note) {
  const context = referenceParts(reference);
  if (!context) return null;
  const match = note.match(/(?:\+\s+)?(?:(\d+):)?(\d+)[\u2013-](?:(\d+):)?(\d+)(?=\s|$)/);
  if (!match) return null;
  return {
    start: { book: context.book, chapter: Number(match[1] || context.chapter), verse: Number(match[2]) },
    end: { book: context.book, chapter: Number(match[3] || match[1] || context.chapter), verse: Number(match[4]) }
  };
}

function isWithinRange(reference, range) {
  const current = referenceParts(reference);
  if (!current || !range || current.book !== range.start.book) return false;
  const value = current.chapter * 1000 + current.verse;
  const start = range.start.chapter * 1000 + range.start.verse;
  const end = range.end.chapter * 1000 + range.end.verse;
  return value >= start && value <= end;
}

function parseNote(reference, noteText, sequence) {
  return plainText(noteText).split("\u2022").map((entry) => {
    const parts = entry.split("]");
    if (parts.length < 2) return null;
    const left = plainText(parts.shift()).replace(/^\d+(?::\d+)?\s+/, "");
    const current = parseReading(left);
    if (!current.text) return null;
    const alternatives = parts.join("]").split(";").map(parseReading).filter((reading) => reading.text);
    if (!alternatives.length) return null;
    return {
      id: "sbl-" + reference.replace(/\s|:|[^\w]/g, "-") + "-" + sequence(),
      reference,
      lemma: current.text,
      readings: [current, ...alternatives],
      range: rangeFromNote(reference, entry)
    };
  }).filter(Boolean);
}

function buildBookIndex(book, xml) {
  const documentXml = new DOMParser().parseFromString(xml, "application/xml");
  if (documentXml.querySelector("parsererror")) throw new Error("The SBLGNT apparatus could not be read.");
  const byReference = new Map();
  const rangeUnits = [];
  let reference = null;
  let sequence = 0;
  const nextSequence = () => ++sequence;

  documentXml.querySelectorAll("verse, note").forEach((node) => {
    if (node.localName === "verse") {
      reference = plainText(node.textContent);
      return;
    }
    if (!reference) return;
    parseNote(reference, node.textContent, nextSequence).forEach((unit) => {
      if (!byReference.has(reference)) byReference.set(reference, []);
      byReference.get(reference).push(unit);
      unitsById.set(unit.id, unit);
      const range = unit.range || rangeFromNote(reference, unit.readings.map((reading) => reading.text).join(" "));
      if (range) {
        unit.range = range;
        rangeUnits.push(unit);
      }
    });
  });
  return { byReference, rangeUnits };
}

export function loadSblApparatus(book) {
  if (!APPARATUS_FILES[book]) return Promise.resolve(null);
  if (bookIndexes.has(book)) return Promise.resolve(bookIndexes.get(book));
  if (!bookLoads.has(book)) {
    const load = fetch(APPARATUS_BASE_URL + APPARATUS_FILES[book] + ".xml")
      .then((response) => {
        if (!response.ok) throw new Error("The SBLGNT apparatus is unavailable.");
        return response.text();
      })
      .then((xml) => {
        const index = buildBookIndex(book, xml);
        bookIndexes.set(book, index);
        return index;
      })
      .catch((error) => {
        bookLoads.delete(book);
        throw error;
      });
    bookLoads.set(book, load);
  }
  return bookLoads.get(book);
}

export function getSblApparatusUnits(reference) {
  const parts = referenceParts(reference);
  const index = parts && bookIndexes.get(parts.book);
  if (!index) return [];
  return [...(index.byReference.get(reference) || []), ...index.rangeUnits.filter((unit) => isWithinRange(reference, unit.range))];
}

export function getSblApparatusUnit(id) {
  return unitsById.get(id) || null;
}
