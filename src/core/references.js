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

const pericopes = [
  { book: "Genesis", chapter: 1, from: 1, to: 31, title: "The Creation" },
  { book: "Genesis", chapter: 12, from: 1, to: 9, title: "The Call of Abram" },
  { book: "Psalms", chapter: 23, from: 1, to: 6, title: "The Shepherd Psalm" },
  { book: "Matthew", chapter: 5, from: 1, to: 12, title: "The Beatitudes" },
  { book: "Luke", chapter: 2, from: 1, to: 20, title: "The Birth of Jesus" },
  { book: "John", chapter: 1, from: 1, to: 18, title: "The Word Became Flesh" },
  { book: "John", chapter: 1, from: 19, to: 34, title: "The Testimony of John" },
  { book: "John", chapter: 1, from: 35, to: 51, title: "The First Disciples" },
  { book: "John", chapter: 3, from: 1, to: 21, title: "Jesus and Nicodemus" },
  { book: "John", chapter: 4, from: 1, to: 42, title: "Jesus and the Samaritan Woman" },
  { book: "Acts", chapter: 2, from: 1, to: 41, title: "The Coming of the Holy Spirit" },
  { book: "Romans", chapter: 8, from: 1, to: 17, title: "Life Through the Spirit" },
  { book: "Romans", chapter: 8, from: 18, to: 39, title: "Future Glory" },
  { book: "Philippians", chapter: 2, from: 1, to: 11, title: "Imitating Christ's Humility" },
  { book: "Hebrews", chapter: 4, from: 12, to: 16, title: "The Living Word" }
];

export function chapterCount(book) {
  return BOOKS.find(([name]) => name === book)?.[1] ?? 1;
}

export function displayReference(reference) {
  return reference.book + " " + reference.chapter + (reference.verse ? ":" + reference.verse : "");
}

export function findPericope(reference) {
  const match = pericopes.find((item) =>
    item.book === reference.book &&
    item.chapter === Number(reference.chapter) &&
    Number(reference.verse || 1) >= item.from &&
    Number(reference.verse || 1) <= item.to
  );
  return match || {
    book: reference.book,
    chapter: Number(reference.chapter),
    from: 1,
    to: null,
    title: reference.book + " " + reference.chapter
  };
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
