import { Router } from "express";
import { db } from "../db.js";
import { requireAuth } from "../auth.js";

export const decksRouter = Router();
decksRouter.use(requireAuth);

function getOwnedDeck(deckId, userId) {
  return db
    .prepare("SELECT * FROM decks WHERE id = ? AND user_id = ?")
    .get(deckId, userId);
}

decksRouter.get("/", (req, res) => {
  const decks = db
    .prepare(
      `SELECT d.id, d.name, d.description, d.created_at,
              COUNT(c.id) AS card_count,
              SUM(CASE WHEN c.due_at <= datetime('now') THEN 1 ELSE 0 END) AS due_count
       FROM decks d
       LEFT JOIN cards c ON c.deck_id = d.id
       WHERE d.user_id = ?
       GROUP BY d.id
       ORDER BY d.created_at DESC`
    )
    .all(req.userId);
  res.json({ decks });
});

decksRouter.post("/", (req, res) => {
  const { name, description = "" } = req.body ?? {};
  if (typeof name !== "string" || !name.trim()) {
    return res.status(400).json({ error: "Name des Stapels ist erforderlich." });
  }
  const result = db
    .prepare("INSERT INTO decks (user_id, name, description) VALUES (?, ?, ?)")
    .run(req.userId, name.trim(), description.trim());
  const deck = db.prepare("SELECT * FROM decks WHERE id = ?").get(result.lastInsertRowid);
  res.status(201).json({ deck });
});

decksRouter.get("/:id", (req, res) => {
  const deck = getOwnedDeck(req.params.id, req.userId);
  if (!deck) return res.status(404).json({ error: "Stapel nicht gefunden." });
  const cards = db
    .prepare(
      `SELECT id, term, definition, example, ease_factor, interval_days, repetitions,
              correct_count, wrong_count, due_at, last_reviewed_at
       FROM cards WHERE deck_id = ? ORDER BY created_at DESC`
    )
    .all(deck.id);
  res.json({ deck, cards });
});

decksRouter.patch("/:id", (req, res) => {
  const deck = getOwnedDeck(req.params.id, req.userId);
  if (!deck) return res.status(404).json({ error: "Stapel nicht gefunden." });
  const name = typeof req.body?.name === "string" && req.body.name.trim() ? req.body.name.trim() : deck.name;
  const description = typeof req.body?.description === "string" ? req.body.description.trim() : deck.description;
  db.prepare("UPDATE decks SET name = ?, description = ? WHERE id = ?").run(name, description, deck.id);
  res.json({ deck: { ...deck, name, description } });
});

decksRouter.delete("/:id", (req, res) => {
  const deck = getOwnedDeck(req.params.id, req.userId);
  if (!deck) return res.status(404).json({ error: "Stapel nicht gefunden." });
  db.prepare("DELETE FROM decks WHERE id = ?").run(deck.id);
  res.status(204).end();
});

decksRouter.get("/:id/stats", (req, res) => {
  const deck = getOwnedDeck(req.params.id, req.userId);
  if (!deck) return res.status(404).json({ error: "Stapel nicht gefunden." });

  const totals = db
    .prepare(
      `SELECT COUNT(*) AS total,
              SUM(CASE WHEN due_at <= datetime('now') THEN 1 ELSE 0 END) AS due,
              SUM(CASE WHEN repetitions >= 4 AND ease_factor >= 2.4 THEN 1 ELSE 0 END) AS mastered,
              SUM(CASE WHEN repetitions > 0 AND (repetitions < 4 OR ease_factor < 2.4) THEN 1 ELSE 0 END) AS learning,
              SUM(CASE WHEN repetitions = 0 THEN 1 ELSE 0 END) AS new_cards
       FROM cards WHERE deck_id = ?`
    )
    .get(deck.id);

  const weakest = db
    .prepare(
      `SELECT id, term, definition, ease_factor, correct_count, wrong_count
       FROM cards WHERE deck_id = ? AND (correct_count + wrong_count) > 0
       ORDER BY (CAST(wrong_count AS REAL) / (correct_count + wrong_count)) DESC, ease_factor ASC
       LIMIT 10`
    )
    .all(deck.id);

  res.json({ totals, weakest });
});
