const APPARATUS_URL = "https://raw.githubusercontent.com/jjmccollum/sblgnt-tei/main/xml/sblgnt_tei.xml";

const NT_BOOKS = [
  "Matthew", "Mark", "Luke", "John", "Acts", "Romans", "1 Corinthians", "2 Corinthians",
  "Galatians", "Ephesians", "Philippians", "Colossians", "1 Thessalonians", "2 Thessalonians",
  "1 Timothy", "2 Timothy", "Titus", "Philemon", "Hebrews", "James", "1 Peter", "2 Peter",
  "1 John", "2 John", "3 John", "Jude", "Revelation"
];

let apparatusIndex = null;
let apparatusLoad = null;

function elementText(element) {
  return (element?.textContent || "").replace(/\s+/g, " ").trim();
}

function referenceFromMilestone(id) {
  const match = String(id || "").match(/^B(\d+)K(\d+)V(\d+)$/);
  if (!match) return null;
  const book = NT_BOOKS[Number(match[1]) - 1];
  if (!book) return null;
  return book + " " + Number(match[2]) + ":" + Number(match[3]);
}

function witnesses(value) {
  return String(value || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((item) => item.replace(/^#/, ""));
}

function buildIndex(xml) {
  const documentXml = new DOMParser().parseFromString(xml, "application/xml");
  if (documentXml.querySelector("parsererror")) throw new Error("The SBLGNT apparatus could not be read.");

  const byReference = new Map();
  const byId = new Map();
  let reference = null;
  let sequence = 0;
  const stream = documentXml.querySelectorAll("milestone[unit='verse'], app[loc]");

  stream.forEach((node) => {
    if (node.localName === "milestone") {
      reference = referenceFromMilestone(node.getAttribute("xml:id"));
      return;
    }
    if (!reference) return;
    const lemma = elementText(Array.from(node.children).find((child) => child.localName === "lem"));
    const readings = Array.from(node.children)
      .filter((child) => child.localName === "rdg")
      .map((reading) => ({
        text: elementText(reading),
        witnesses: witnesses(reading.getAttribute("wit"))
      }))
      .filter((reading) => reading.text);
    if (!lemma || readings.length < 2) return;
    const unit = {
      id: "sbl-" + (++sequence),
      reference,
      lemma,
      readings
    };
    if (!byReference.has(reference)) byReference.set(reference, []);
    byReference.get(reference).push(unit);
    byId.set(unit.id, unit);
  });
  return { byReference, byId };
}

export function loadSblApparatus() {
  if (apparatusIndex) return Promise.resolve(apparatusIndex);
  if (!apparatusLoad) {
    apparatusLoad = fetch(APPARATUS_URL)
      .then((response) => {
        if (!response.ok) throw new Error("The SBLGNT apparatus is unavailable.");
        return response.text();
      })
      .then((xml) => {
        apparatusIndex = buildIndex(xml);
        return apparatusIndex;
      })
      .catch((error) => {
        apparatusLoad = null;
        throw error;
      });
  }
  return apparatusLoad;
}

export function getSblApparatusUnits(reference) {
  return apparatusIndex?.byReference.get(reference) || [];
}

export function getSblApparatusUnit(id) {
  return apparatusIndex?.byId.get(id) || null;
}
