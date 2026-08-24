import "dotenv/config";
import express from "express";
import cookieParser from "cookie-parser";
import path from "node:path";
import { fileURLToPath } from "node:url";

import "./db.js";
import { authRouter } from "./routes/auth.js";
import { decksRouter } from "./routes/decks.js";
import { cardsRouter } from "./routes/cards.js";
import { importRouter } from "./routes/import.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(here, "..", "public");

const app = express();
app.use(express.json({ limit: "1mb" }));
app.use(cookieParser());

app.use("/api/auth", authRouter);
app.use("/api/decks", decksRouter);
app.use("/api", cardsRouter);
app.use("/api/import", importRouter);

app.use("/api", (req, res) => {
  res.status(404).json({ error: "Nicht gefunden." });
});

app.use(express.static(publicDir));
app.get(/.*/, (req, res) => {
  res.sendFile(path.join(publicDir, "index.html"));
});

// zentrale Fehlerbehandlung (u.a. multer-Fehler, kaputtes JSON im Body)
app.use((err, req, res, next) => {
  console.error(err);
  res.status(400).json({ error: err.message || "Unerwarteter Fehler." });
});

const port = Number(process.env.PORT) || 3000;
app.listen(port, () => {
  console.log(`Vokabeltrainer laeuft auf http://localhost:${port}`);
  if (!process.env.ANTHROPIC_API_KEY) {
    console.warn(
      "Hinweis: ANTHROPIC_API_KEY ist nicht gesetzt - der Foto/PDF-Import (KI-Erkennung) funktioniert erst, wenn er in der .env-Datei eingetragen wird."
    );
  }
});
