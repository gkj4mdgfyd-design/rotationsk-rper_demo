# Vokabeltrainer

Eine Lern-App fuer Vokabeln und nicht-fremdsprachige Fachbegriffe:

- **Import per Foto/PDF**: Ein Foto oder PDF (z.B. Schulheft, Skript, Lehrbuchseite) hochladen &ndash;
  Claude erkennt automatisch Begriff-Erklaerung-Paare, die vor dem Speichern noch geprueft und
  bearbeitet werden koennen.
- **Karteikarten-Modus**: Begriff ansehen, umdrehen, sich selbst bewerten (Nochmal/Schwer/Gut/Leicht).
- **Tipp-Training**: Begriff oder Erklaerung wird abgefragt, die Antwort muss eingetippt werden
  (kleine Tippfehler werden toleriert).
- **Spaced Repetition (SM-2)**: Jede Karte hat einen eigenen Lernstand (Ease-Factor, Intervall).
  Schwach gelernte Karten (viele Fehler, niedriger Ease-Factor) werden beim Lernen bevorzugt
  abgefragt, gut gelernte Karten erscheinen seltener.
- **Login mit eigenem Account**: Daten liegen in einer lokalen SQLite-Datenbank auf dem Server.

## Voraussetzungen

- Node.js ab Version 22.5 (fuer `node:sqlite`)
- Ein Anthropic-API-Key **nur fuer den KI-Import** (Karteikarten-Lernen und Tipp-Training
  funktionieren auch ohne Key)

## Einrichtung

```bash
cd vokabeltrainer
npm install
cp .env.example .env
```

Dann `.env` oeffnen und ausfuellen:

- `JWT_SECRET`: eine beliebige lange Zufallszeichenkette (zum Signieren der Login-Session).
  Zum Erzeugen z.B.: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
- `ANTHROPIC_API_KEY`: dein API-Key von [console.anthropic.com](https://console.anthropic.com)
  (Account anlegen &rarr; Zahlungsmethode hinterlegen &rarr; unter "API Keys" einen neuen Key
  erzeugen). Ohne diesen Key startet die App trotzdem, nur der Foto/PDF-Import zeigt dann eine
  Fehlermeldung an.

`.env` wird nicht ins Git-Repo eingecheckt (siehe `.gitignore`) &ndash; der Key bleibt lokal bei dir.

## Starten

```bash
npm start
```

Die App laeuft dann unter `http://localhost:3000`. Beim ersten Aufruf einfach registrieren
(E-Mail + Passwort, mind. 8 Zeichen) &ndash; ein Account reicht, um mehrere Lernstapel anzulegen.

Fuer die Entwicklung mit automatischem Neustart bei Aenderungen: `npm run dev`.

## Architektur

- **Backend**: Node.js + Express, Datenbank via eingebautes `node:sqlite` (keine native
  Kompilierung noetig), Login per JWT in einem httpOnly-Cookie, Passwoerter gehasht mit bcrypt.
- **KI-Import**: Fotos/PDFs werden direkt (per Vision bzw. Dokument-Input) an die Anthropic
  Claude API geschickt, die strukturiert Begriff/Erklaerung/Beispielsatz zurueckgibt
  (kein separater OCR-Schritt noetig).
- **Frontend**: reines HTML/CSS/JavaScript ohne Build-Schritt, im gleichen dunklen Stil wie die
  Rotationskoerper-Demo in diesem Repository.
- **Lernlogik**: `server/srs.js` implementiert den SM-2-Algorithmus. Falsch beantwortete Karten
  werden 10 Minuten spaeter erneut gezeigt, richtig beantwortete je nach Bewertung in wachsenden
  Abstaenden (1 Tag, 6 Tage, danach `Intervall x Ease-Factor`). Beim Lernen werden faellige Karten
  nach Fehlerquote und Ease-Factor sortiert &ndash; schwaechste zuerst.

## Datenmodell

- `users` &ndash; Accounts
- `decks` &ndash; Lernstapel (z.B. "Englisch Unit 3", "Biologie Fachbegriffe")
- `cards` &ndash; einzelne Karten mit Lernstand (Ease-Factor, Intervall, Wiederholungen,
  Faelligkeitsdatum, Richtig-/Falsch-Zaehler)
- `reviews` &ndash; Verlauf aller Lern-Antworten (fuer spaetere Auswertungen)

## Bekannte Grenzen (moegliche naechste Schritte)

- Statistik-Ansicht zeigt aktuell nur einfache Kennzahlen pro Stapel, keine Verlaufsdiagramme.
- Import verarbeitet eine Datei pro Durchgang (mehrfach nacheinander moeglich).
- Kein Passwort-Reset-Flow.
