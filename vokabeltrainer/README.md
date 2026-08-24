# Vokabeltrainer

Eine Lern-App fuer Vokabeln und nicht-fremdsprachige Fachbegriffe &ndash; komplett kostenlos,
ohne API-Keys oder Drittanbieter-Kosten.

- **Import per Foto/PDF**: Ein Foto oder PDF (z.B. Schulheft, Skript, Lehrbuchseite) hochladen.
  Der Text wird per Texterkennung (OCR) automatisch gelesen und zeilenweise in Begriff-Erklaerung-
  Paare aufgeteilt, wenn ein Trennzeichen wie "-", "=", ":" oder ein Tabulator erkennbar ist.
  Das Ergebnis kann vor dem Speichern geprueft und korrigiert werden.
- **Karteikarten-Modus**: Begriff ansehen, umdrehen, sich selbst bewerten (Nochmal/Schwer/Gut/Leicht).
- **Tipp-Training**: Begriff oder Erklaerung wird abgefragt, die Antwort muss eingetippt werden
  (kleine Tippfehler werden toleriert).
- **Spaced Repetition (SM-2)**: Jede Karte hat einen eigenen Lernstand (Ease-Factor, Intervall).
  Schwach gelernte Karten (viele Fehler, niedriger Ease-Factor) werden beim Lernen bevorzugt
  abgefragt, gut gelernte Karten erscheinen seltener.
- **Login mit eigenem Account**: Daten liegen in einer lokalen SQLite-Datenbank auf dem Server.

## Voraussetzungen

- Node.js ab Version 22.5 (fuer `node:sqlite`)
- Internetzugang beim allerersten Foto-Import (die Texterkennung laedt sich einmalig die
  Sprachdaten fuer Deutsch/Englisch herunter und cached sie danach lokal &ndash; keine laufenden
  Kosten, kein Account noetig)

## Einrichtung

```bash
cd vokabeltrainer
npm install
cp .env.example .env
```

Dann `.env` oeffnen und `JWT_SECRET` setzen (eine beliebige lange Zufallszeichenkette zum
Signieren der Login-Session). Zum Erzeugen z.B.:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

`.env` wird nicht ins Git-Repo eingecheckt (siehe `.gitignore`).

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
- **Import**: Bilder werden mit `tesseract.js` (kostenlose, lokal laufende OCR-Engine) erkannt.
  PDFs mit eingebettetem Text werden direkt mit `pdf-parse` ausgelesen; eingescannte/fotografierte
  PDFs ohne Textebene werden aktuell nicht unterstuetzt (dafuer stattdessen ein Foto der Seite
  hochladen). Der erkannte Text wird zeilenweise per einfacher Mustererkennung in Begriff und
  Erklaerung aufgeteilt.
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

- Die automatische Begriff/Erklaerung-Trennung ist eine einfache Mustererkennung (kein KI-
  Sprachverstaendnis) &ndash; funktioniert am besten bei Listen mit klarem Trennzeichen pro Zeile
  (z.B. "Apfel - Apple"). Zeilen ohne erkennbares Muster landen als Begriff ohne Erklaerung in der
  Pruefliste und koennen dort von Hand ergaenzt werden.
- Eingescannte/fotografierte PDFs ohne Textebene werden nicht per OCR gelesen (nur echte Fotos).
- Statistik-Ansicht zeigt aktuell nur einfache Kennzahlen pro Stapel, keine Verlaufsdiagramme.
- Kein Passwort-Reset-Flow.
