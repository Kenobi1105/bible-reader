export const BOOKS = [
  ["Genesis", 50], ["Exodus", 40], ["Leviticus", 27], ["Numbers", 36], ["Deuteronomy", 34],
  ["Joshua", 24], ["Judges", 21], ["Ruth", 4], ["1 Samuel", 31], ["2 Samuel", 24],
  ["1 Kings", 22], ["2 Kings", 25], ["1 Chronicles", 29], ["2 Chronicles", 36], ["Ezra", 10],
  ["Nehemiah", 13], ["Esther", 10], ["Job", 42], ["Psalms", 150], ["Proverbs", 31],
  ["Ecclesiastes", 12], ["Song of Songs", 8], ["Isaiah", 66], ["Jeremiah", 52], ["Lamentations", 5],
  ["Ezekiel", 48], ["Daniel", 12], ["Hosea", 14], ["Joel", 3], ["Amos", 9], ["Obadiah", 1],
  ["Jonah", 4], ["Micah", 7], ["Nahum", 3], ["Habakkuk", 3], ["Zephaniah", 3], ["Haggai", 2],
  ["Zechariah", 14], ["Malachi", 4], ["Matthew", 28], ["Mark", 16], ["Luke", 24], ["John", 21],
  ["Acts", 28], ["Romans", 16], ["1 Corinthians", 16], ["2 Corinthians", 13], ["Galatians", 6],
  ["Ephesians", 6], ["Philippians", 4], ["Colossians", 4], ["1 Thessalonians", 5],
  ["2 Thessalonians", 3], ["1 Timothy", 6], ["2 Timothy", 4], ["Titus", 3], ["Philemon", 1],
  ["Hebrews", 13], ["James", 5], ["1 Peter", 5], ["2 Peter", 3], ["1 John", 5], ["2 John", 1],
  ["3 John", 1], ["Jude", 1], ["Revelation", 22]
];

const aliases = {
  gen: "Genesis", ge: "Genesis", ex: "Exodus", exod: "Exodus", ps: "Psalms", psa: "Psalms",
  prov: "Proverbs", ecc: "Ecclesiastes", song: "Song of Songs", isa: "Isaiah", jer: "Jeremiah",
  ez: "Ezekiel", dan: "Daniel", hos: "Hosea", hab: "Habakkuk", zech: "Zechariah", mal: "Malachi",
  mt: "Matthew", matt: "Matthew", mk: "Mark", mrk: "Mark", lk: "Luke", jn: "John",
  joh: "John", acts: "Acts", rom: "Romans", ro: "Romans", cor: "Corinthians",
  gal: "Galatians", eph: "Ephesians", phil: "Philippians", col: "Colossians",
  thess: "Thessalonians", tim: "Timothy", philem: "Philemon", heb: "Hebrews",
  jas: "James", pet: "Peter", rev: "Revelation", re: "Revelation"
};

export function chapterCount(book) {
  return BOOKS.find(([name]) => name === book)?.[1] ?? 1;
}

export function isOldTestament(book) {
  return BOOKS.findIndex(([name]) => name === book) < 39;
}

export function moveChapter(reference, direction) {
  const currentBookIndex = BOOKS.findIndex(([name]) => name === reference.book);
  const currentBook = BOOKS[currentBookIndex];
  const chapter = Number(reference.chapter);

  if (direction > 0 && chapter < currentBook[1]) {
    return { ...reference, chapter: chapter + 1, verse: 1 };
  }
  if (direction < 0 && chapter > 1) {
    return { ...reference, chapter: chapter - 1, verse: 1 };
  }

  const adjacentBook = BOOKS[currentBookIndex + direction];
  if (!adjacentBook) return null;
  return {
    book: adjacentBook[0],
    chapter: direction > 0 ? 1 : adjacentBook[1],
    verse: 1
  };
}

export function displayReference(reference) {
  return reference.book + " " + reference.chapter + (reference.verse ? ":" + reference.verse : "");
}

export function parseReference(input, fallback = { book: "John", chapter: 1, verse: 1 }) {
  const cleaned = input.trim().replace(/\./g, "").replace(/\s+/g, " ");
  if (!cleaned) return fallback;
  const match = cleaned.match(/^((?:[1-3]\s*)?[A-Za-z ]+?)\s+(\d+)(?::(\d+))?$/i);
  if (!match) return null;

  const rawBook = match[1].trim().toLowerCase().replace(/\s+/g, " ");
  const numbered = rawBook.match(/^([1-3])\s+(.+)$/);
  const normalizedTail = aliases[numbered?.[2] || rawBook] || (numbered?.[2] || rawBook);
  let book = "";

  if (numbered && ["Corinthians", "Thessalonians", "Timothy", "John", "Peter", "Samuel", "Kings", "Chronicles"].includes(normalizedTail)) {
    book = numbered[1] + " " + normalizedTail;
  } else {
    book = BOOKS.find(([name]) => name.toLowerCase() === rawBook)?.[0]
      || BOOKS.find(([name]) => name.toLowerCase().startsWith(rawBook))?.[0]
      || aliases[rawBook];
  }

  if (!book || !BOOKS.some(([name]) => name === book)) return null;
  const chapter = Number(match[2]);
  const verse = Number(match[3] || 1);
  if (chapter < 1 || chapter > chapterCount(book) || verse < 1) return null;
  return { book, chapter, verse };
}
