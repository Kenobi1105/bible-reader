import { writeFile } from "node:fs/promises";
import { BOOKS } from "../src/core/references.js";

const API = "https://labs.bible.org/api/?formatting=full&type=json&passage=";
const concurrency = 6;

async function fetchChapter(book, chapter) {
  const url = API + encodeURIComponent(book + " " + chapter);
  const response = await fetch(url);
  if (!response.ok) throw new Error(book + " " + chapter + ": " + response.status);
  const verses = await response.json();
  if (!Array.isArray(verses) || !verses.length) throw new Error(book + " " + chapter + ": no verses");
  return verses.map((verse) => ({ number: Number(verse.verse), text: String(verse.text || "") }));
}

function sectionsForChapter(book, chapter, verses) {
  const starts = verses
    .filter((verse) => /<p\b[^>]*\bbodytext\b/i.test(verse.text))
    .map((verse) => verse.number);
  if (!starts.includes(1)) starts.unshift(1);
  const uniqueStarts = [...new Set(starts)].sort((a, b) => a - b);
  const lastVerse = verses.at(-1).number;
  return uniqueStarts.map((from, index) => ({
    book,
    chapter,
    from,
    to: (uniqueStarts[index + 1] || lastVerse + 1) - 1
  }));
}

const tasks = BOOKS.flatMap(([book, chapters]) => Array.from({ length: chapters }, (_, index) => ({ book, chapter: index + 1 })));
const results = [];
let cursor = 0;

async function worker() {
  while (cursor < tasks.length) {
    const task = tasks[cursor++];
    const verses = await fetchChapter(task.book, task.chapter);
    results.push(...sectionsForChapter(task.book, task.chapter, verses));
    process.stdout.write(".");
  }
}

await Promise.all(Array.from({ length: concurrency }, worker));
results.sort((a, b) => BOOKS.findIndex(([book]) => book === a.book) - BOOKS.findIndex(([book]) => book === b.book) || a.chapter - b.chapter || a.from - b.from);
const output = "// Generated from official NET API paragraph markers.\nexport const NET_PERICOPE_BOUNDARIES = " + JSON.stringify(results, null, 2) + ";\n";
await writeFile(new URL("../src/core/net-pericope-index.js", import.meta.url), output, "utf8");
process.stdout.write("\nGenerated " + results.length + " NET section boundaries.\n");
