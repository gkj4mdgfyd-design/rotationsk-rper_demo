import { Router } from "express";
import multer from "multer";
import { createWorker } from "tesseract.js";
import pdfParse from "pdf-parse/lib/pdf-parse.js";
import { db } from "../db.js";
import { requireAuth } from "../auth.js";

export const importRouter = Router();
importRouter.use(requireAuth);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ["image/png", "image/jpeg", "image/webp", "image/gif", "application/pdf"];
    if (!allowed.includes(file.mimetype)) {
      return cb(new Error("Nicht unterstuetzter Dateityp. Erlaubt: PNG, JPEG, WEBP, GIF, PDF."));
    }
    cb(null, true);
  },
});

function getOwnedDeck(deckId, userId) {
  return db.prepare("SELECT * FROM decks WHERE id = ? AND user_id = ?").get(deckId, userId);
}

// Trennt eine Textzeile in Begriff + Erklaerung, wenn ein typisches
// Listen-Trennzeichen erkennbar ist ("Apfel - Apple", "Haus = house",
// "der Hund: the dog", per Tabulator oder mit >=2 Leerzeichen getrennt).
const SPLIT_PATTERNS = [
  /\t+/, // Tabulator (z.B. aus Tabellen kopiert)
  /\s{2,}/, // mehrere Leerzeichen (Spaltenausrichtung)
  /\s[-–—]\s/, // " - ", " – ", " — "
  /\s*=\s*/, // "="
  /:\s+/, // ": "
];

function splitLine(line) {
  for (const pattern of SPLIT_PATTERNS) {
    const parts = line.split(pattern);
    if (parts.length === 2 && parts[0].trim() && parts[1].trim()) {
      return { term: parts[0].trim(), definition: parts[1].trim() };
    }
  }
  return null;
}

function parseLinesToItems(text) {
  const lines = text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  const items = [];
  for (const line of lines) {
    const split = splitLine(line);
    if (split) {
      items.push({ term: split.term, definition: split.definition, example: "" });
    } else if (line.length > 1 && line.length < 80) {
      // Kein Trennzeichen erkannt - als Begriff ohne Erklaerung uebernehmen,
      // damit nichts verloren geht; die Erklaerung kann in der Pruefliste
      // von Hand ergaenzt werden.
      items.push({ term: line, definition: "", example: "" });
    }
  }
  return items;
}

const OCR_LOAD_TIMEOUT_MS = 45000;
const OCR_RECOGNIZE_TIMEOUT_MS = 60000;

function withTimeout(promise, ms, message) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(message)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

async function ocrImage(buffer) {
  // errorHandler ist erforderlich: ohne ihn wirft tesseract.js interne Worker-Fehler
  // (z.B. fehlgeschlagener Download der Sprachdaten) unbehandelt und reisst den
  // gesamten Node-Prozess mit. Der errorHandler selbst darf NICHT werfen - er wird
  // synchron aus einem Event-Handler aufgerufen, ein Wurf hier waere ebenso fatal.
  // Zusaetzlich haengt tesseract.js bei manchen internen Fehlern (z.B. Netzwerkfehler
  // beim Sprachdaten-Download) auf unbestimmte Zeit, ohne die createWorker()-Promise
  // je aufzuloesen - daher zusaetzlich per withTimeout absichern.
  const worker = await withTimeout(
    createWorker(["deu", "eng"], undefined, {
      errorHandler: (err) => {
        console.error("Tesseract worker error:", err);
      },
    }),
    OCR_LOAD_TIMEOUT_MS,
    "Die Texterkennung konnte nicht geladen werden (Zeituberschreitung). Falls dies der erste " +
      "Foto-Import ist, werden dafuer einmalig Sprachdaten aus dem Internet geladen - bitte " +
      "Internetverbindung pruefen und erneut versuchen."
  );
  try {
    const {
      data: { text },
    } = await withTimeout(worker.recognize(buffer), OCR_RECOGNIZE_TIMEOUT_MS, "Zeitueberschreitung bei der Texterkennung.");
    return text;
  } finally {
    worker.terminate().catch(() => {});
  }
}

async function extractPdfText(buffer) {
  const result = await pdfParse(buffer);
  return result.text || "";
}

importRouter.post("/extract", upload.single("file"), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "Keine Datei hochgeladen." });
  }

  try {
    let text;
    if (req.file.mimetype === "application/pdf") {
      text = await extractPdfText(req.file.buffer);
      if (text.trim().length < 4) {
        return res.status(422).json({
          error:
            "Im PDF konnte kein Text gefunden werden (vermutlich ein eingescanntes/fotografiertes PDF ohne Textebene). " +
            "Bitte stattdessen ein Foto der Seite hochladen oder die Karten manuell eintragen.",
        });
      }
    } else {
      text = await ocrImage(req.file.buffer);
    }

    const items = parseLinesToItems(text);
    res.json({ items, rawText: text });
  } catch (err) {
    console.error("Import extract failed:", err);
    res.status(500).json({
      error: err instanceof Error && err.message ? err.message : "Die Datei konnte nicht verarbeitet werden. Bitte erneut versuchen.",
    });
  }
});

importRouter.post("/confirm", (req, res) => {
  const { deckId, items } = req.body ?? {};
  const deck = getOwnedDeck(deckId, req.userId);
  if (!deck) return res.status(404).json({ error: "Stapel nicht gefunden." });
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: "Keine Begriffe zum Speichern uebergeben." });
  }

  const insert = db.prepare("INSERT INTO cards (deck_id, term, definition, example) VALUES (?, ?, ?, ?)");
  let inserted = 0;
  for (const item of items) {
    const term = typeof item?.term === "string" ? item.term.trim() : "";
    const definition = typeof item?.definition === "string" ? item.definition.trim() : "";
    const example = typeof item?.example === "string" ? item.example.trim() : "";
    if (!term || !definition) continue;
    insert.run(deck.id, term, definition, example);
    inserted += 1;
  }

  res.status(201).json({ inserted });
});
