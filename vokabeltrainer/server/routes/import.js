import { Router } from "express";
import multer from "multer";
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
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

const ExtractedItemsSchema = z.object({
  items: z.array(
    z.object({
      term: z.string().describe("Die Vokabel oder der Fachbegriff"),
      definition: z.string().describe("Uebersetzung bzw. Erklaerung des Begriffs"),
      example: z.string().optional().describe("Beispielsatz aus der Vorlage, falls vorhanden, sonst leer"),
    })
  ),
});

function getOwnedDeck(deckId, userId) {
  return db.prepare("SELECT * FROM decks WHERE id = ? AND user_id = ?").get(deckId, userId);
}

importRouter.post("/extract", upload.single("file"), async (req, res) => {
  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(503).json({
      error:
        "Kein ANTHROPIC_API_KEY konfiguriert. Bitte in der .env-Datei einen Anthropic-API-Key eintragen, siehe README.",
    });
  }
  if (!req.file) {
    return res.status(400).json({ error: "Keine Datei hochgeladen." });
  }

  const base64 = req.file.buffer.toString("base64");
  const contentBlock =
    req.file.mimetype === "application/pdf"
      ? { type: "document", source: { type: "base64", media_type: "application/pdf", data: base64 } }
      : { type: "image", source: { type: "base64", media_type: req.file.mimetype, data: base64 } };

  try {
    const client = new Anthropic();
    const response = await client.beta.messages.parse({
      model: "claude-opus-5",
      max_tokens: 8000,
      messages: [
        {
          role: "user",
          content: [
            contentBlock,
            {
              type: "text",
              text:
                "Das ist ein Foto oder PDF mit Vokabeln oder Fachbegriffen (z.B. aus einem Schulheft, Skript " +
                "oder Lehrbuch). Extrahiere alle erkennbaren Begriff-Erklaerung-Paare. Das kann eine Vokabel " +
                "mit fremdsprachiger Uebersetzung sein oder ein nicht-fremdsprachiger Fachbegriff mit seiner " +
                "Definition/Erklaerung. Uebernimm die Begriffe und Erklaerungen moeglichst wortgetreu aus der " +
                "Vorlage, korrigiere nur offensichtliche Erkennungsfehler. Wenn zu einem Begriff ein Beispielsatz " +
                "in der Vorlage steht, uebernimm ihn ins example-Feld, sonst lasse es leer.",
            },
          ],
        },
      ],
      output_format: betaZodOutputFormat(ExtractedItemsSchema),
    });

    if (!response.parsed) {
      return res.status(502).json({ error: "Die KI konnte keine Begriffe strukturiert zurueckgeben. Bitte erneut versuchen." });
    }

    res.json({ items: response.parsed.items });
  } catch (err) {
    if (err instanceof Anthropic.AuthenticationError) {
      return res.status(503).json({ error: "Der ANTHROPIC_API_KEY ist ungueltig." });
    }
    if (err instanceof Anthropic.RateLimitError) {
      return res.status(429).json({ error: "Zu viele Anfragen an die KI. Bitte kurz warten und erneut versuchen." });
    }
    if (err instanceof Anthropic.APIError) {
      return res.status(502).json({ error: `KI-Fehler: ${err.message}` });
    }
    console.error("Import extract failed:", err);
    res.status(500).json({ error: "Unerwarteter Fehler bei der Extraktion." });
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
