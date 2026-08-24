import { Router } from "express";
import { db } from "../db.js";
import { hashPassword, verifyPassword, issueSession, clearSession, requireAuth } from "../auth.js";

export const authRouter = Router();

authRouter.post("/register", (req, res) => {
  const { email, password } = req.body ?? {};
  if (typeof email !== "string" || typeof password !== "string") {
    return res.status(400).json({ error: "E-Mail und Passwort sind erforderlich." });
  }
  const normalizedEmail = email.trim().toLowerCase();
  if (!normalizedEmail.includes("@") || password.length < 8) {
    return res.status(400).json({
      error: "Ungueltige E-Mail oder Passwort zu kurz (mind. 8 Zeichen).",
    });
  }

  const existing = db.prepare("SELECT id FROM users WHERE email = ?").get(normalizedEmail);
  if (existing) {
    return res.status(409).json({ error: "Diese E-Mail ist bereits registriert." });
  }

  const passwordHash = hashPassword(password);
  const result = db
    .prepare("INSERT INTO users (email, password_hash) VALUES (?, ?)")
    .run(normalizedEmail, passwordHash);

  const user = { id: Number(result.lastInsertRowid), email: normalizedEmail };
  issueSession(res, user);
  res.status(201).json({ user });
});

authRouter.post("/login", (req, res) => {
  const { email, password } = req.body ?? {};
  if (typeof email !== "string" || typeof password !== "string") {
    return res.status(400).json({ error: "E-Mail und Passwort sind erforderlich." });
  }
  const normalizedEmail = email.trim().toLowerCase();

  const row = db.prepare("SELECT id, email, password_hash FROM users WHERE email = ?").get(normalizedEmail);
  if (!row || !verifyPassword(password, row.password_hash)) {
    return res.status(401).json({ error: "E-Mail oder Passwort ist falsch." });
  }

  const user = { id: row.id, email: row.email };
  issueSession(res, user);
  res.json({ user });
});

authRouter.post("/logout", (req, res) => {
  clearSession(res);
  res.status(204).end();
});

authRouter.get("/me", requireAuth, (req, res) => {
  const row = db.prepare("SELECT id, email FROM users WHERE id = ?").get(req.userId);
  if (!row) return res.status(401).json({ error: "Nicht angemeldet." });
  res.json({ user: row });
});
