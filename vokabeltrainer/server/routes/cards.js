import { Router } from "express";
import { db } from "../db.js";
import { requireAuth } from "../auth.js";
import { nextSchedule, FLASHCARD_QUALITY, qualityFromTyping, gradeTypedAnswer } from "../srs.js";

export const cardsRouter = Router();
cardsRouter.use(requireAuth);

function getOwnedDeck(deckId, userId) {
  return db.prepare("SELECT * FROM decks WHERE id = ? AND user_id = ?").get(deckId, userId);
}

function getOwnedCard(cardId, userId) {
  return db
    .prepare(
      `SELECT cards.* FROM cards
       JOIN decks ON decks.id = cards.deck_id
       WHERE cards.id = ? AND decks.user_id = ?`
    )
    .get(cardId, userId);
}

// Karte manuell zu einem Stapel hinzufuegen
cardsRouter.post("/decks/:deckId/cards", (req, res) => {
  const deck = getOwnedDeck(req.params.deckId, req.userId);
  if (!deck) return res.status(404).json({ error: "Stapel nicht gefunden." });

  const { term, definition, example = "" } = req.body ?? {};
  if (typeof term !== "string" || !term.trim() || typeof definition !== "string" || !definition.trim()) {
    return res.status(400).json({ error: "Begriff und Erklaerung sind erforderlich." });
  }

  const result = db
    .prepare("INSERT INTO cards (deck_id, term, definition, example) VALUES (?, ?, ?, ?)")
    .run(deck.id, term.trim(), definition.trim(), example.trim());
  const card = db.prepare("SELECT * FROM cards WHERE id = ?").get(result.lastInsertRowid);
  res.status(201).json({ card });
});

cardsRouter.patch("/cards/:id", (req, res) => {
  const card = getOwnedCard(req.params.id, req.userId);
  if (!card) return res.status(404).json({ error: "Karte nicht gefunden." });

  const term = typeof req.body?.term === "string" && req.body.term.trim() ? req.body.term.trim() : card.term;
  const definition =
    typeof req.body?.definition === "string" && req.body.definition.trim()
      ? req.body.definition.trim()
      : card.definition;
  const example = typeof req.body?.example === "string" ? req.body.example.trim() : card.example;

  db.prepare("UPDATE cards SET term = ?, definition = ?, example = ? WHERE id = ?").run(
    term,
    definition,
    example,
    card.id
  );
  res.json({ card: { ...card, term, definition, example } });
});

cardsRouter.delete("/cards/:id", (req, res) => {
  const card = getOwnedCard(req.params.id, req.userId);
  if (!card) return res.status(404).json({ error: "Karte nicht gefunden." });
  db.prepare("DELETE FROM cards WHERE id = ?").run(card.id);
  res.status(204).end();
});

// Faellige Karten zum Lernen abrufen - schwaechste zuerst
cardsRouter.get("/decks/:deckId/study", (req, res) => {
  const deck = getOwnedDeck(req.params.deckId, req.userId);
  if (!deck) return res.status(404).json({ error: "Stapel nicht gefunden." });

  const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 100);
  const cards = db
    .prepare(
      `SELECT id, term, definition, example, ease_factor, repetitions, correct_count, wrong_count, due_at
       FROM cards
       WHERE deck_id = ? AND due_at <= datetime('now')
       ORDER BY
         (CAST(wrong_count AS REAL) / (correct_count + wrong_count + 1)) DESC,
         ease_factor ASC,
         due_at ASC
       LIMIT ?`
    )
    .all(deck.id, limit);
  res.json({ cards });
});

// Bewertung einer Karteikarten-Antwort (Flashcard-Modus: again/hard/good/easy)
cardsRouter.post("/cards/:id/review", (req, res) => {
  const card = getOwnedCard(req.params.id, req.userId);
  if (!card) return res.status(404).json({ error: "Karte nicht gefunden." });

  const { mode } = req.body ?? {};
  let quality;
  let wasCorrect;
  let feedback = null;

  if (mode === "flashcard") {
    const rating = req.body?.rating;
    if (!(rating in FLASHCARD_QUALITY)) {
      return res.status(400).json({ error: "Ungueltige Bewertung." });
    }
    quality = FLASHCARD_QUALITY[rating];
    wasCorrect = quality >= 3;
  } else if (mode === "typing") {
    const { userAnswer, direction = "term-definition" } = req.body ?? {};
    if (typeof userAnswer !== "string") {
      return res.status(400).json({ error: "Antwort fehlt." });
    }
    const correctAnswer = direction === "definition-term" ? card.term : card.definition;
    const grade = gradeTypedAnswer(userAnswer, correctAnswer);
    quality = qualityFromTyping(grade);
    wasCorrect = grade.correct;
    feedback = { correct: grade.correct, closeMatch: grade.closeMatch, correctAnswer };
  } else {
    return res.status(400).json({ error: "Unbekannter Lernmodus." });
  }

  const schedule = nextSchedule(
    {
      easeFactor: card.ease_factor,
      intervalDays: card.interval_days,
      repetitions: card.repetitions,
    },
    quality
  );

  db.prepare(
    `UPDATE cards SET ease_factor = ?, interval_days = ?, repetitions = ?, due_at = ?,
       last_reviewed_at = datetime('now'),
       correct_count = correct_count + ?, wrong_count = wrong_count + ?
     WHERE id = ?`
  ).run(
    schedule.easeFactor,
    schedule.intervalDays,
    schedule.repetitions,
    schedule.dueAt,
    wasCorrect ? 1 : 0,
    wasCorrect ? 0 : 1,
    card.id
  );

  db.prepare("INSERT INTO reviews (card_id, mode, quality) VALUES (?, ?, ?)").run(card.id, mode, quality);

  res.json({ schedule, feedback });
});
