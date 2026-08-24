// SM-2 Spaced-Repetition-Algorithmus.
// quality: 0-5 (0 = komplett falsch/vergessen, 5 = perfekt, sofort gewusst)
// Karten mit niedrigem Ease-Factor bzw. vielen Fehlern gelten als "schwach"
// und werden beim Faellig-Sortieren bevorzugt abgefragt.

export function nextSchedule({ easeFactor, intervalDays, repetitions }, quality) {
  let ef = easeFactor;
  let interval = intervalDays;
  let reps = repetitions;

  if (quality < 3) {
    // Falsch beantwortet: Karte in 10 Minuten erneut zeigen (innerhalb derselben
    // Lernsession), statt einen vollen Tag wie beim regulaeren SM-2-Intervall.
    reps = 0;
    interval = 10 / (24 * 60);
  } else {
    reps += 1;
    if (reps === 1) interval = 1;
    else if (reps === 2) interval = 6;
    else interval = Math.round(interval * ef);
  }

  ef = ef + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02));
  if (ef < 1.3) ef = 1.3;

  const dueAt = new Date(Date.now() + interval * 24 * 60 * 60 * 1000);

  return {
    easeFactor: Number(ef.toFixed(2)),
    intervalDays: interval,
    repetitions: reps,
    // SQLite-kompatibles Format (wie datetime('now')), damit String-Vergleiche
    // in SQL-WHERE-Klauseln (due_at <= datetime('now')) korrekt funktionieren -
    // toISOString() liefert ein 'T'/'Z'-Format, das lexikographisch nicht
    // konsistent mit SQLites datetime()-Ausgabe vergleichbar ist.
    dueAt: dueAt.toISOString().slice(0, 19).replace("T", " "),
  };
}

// Bewertungsstufen aus dem Karteikarten-Modus ("Nochmal/Schwer/Gut/Leicht")
export const FLASHCARD_QUALITY = {
  again: 1,
  hard: 3,
  good: 4,
  easy: 5,
};

// Bewertung im Tipp-Modus: exakt richtig, mit kleinem Tippfehler, oder falsch.
export function qualityFromTyping({ correct, closeMatch }) {
  if (correct) return 5;
  if (closeMatch) return 3;
  return 1;
}

// Levenshtein-Distanz fuer Tippfehler-Toleranz bei der Eingabe-Abfrage.
export function levenshtein(a, b) {
  const m = a.length;
  const n = b.length;
  const dp = Array.from({ length: m + 1 }, (_, i) => [i, ...new Array(n).fill(0)]);
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] =
        a[i - 1] === b[j - 1]
          ? dp[i - 1][j - 1]
          : 1 + Math.min(dp[i - 1][j - 1], dp[i - 1][j], dp[i][j - 1]);
    }
  }
  return dp[m][n];
}

export function normalizeAnswer(s) {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}

export function gradeTypedAnswer(userAnswer, correctAnswer) {
  const a = normalizeAnswer(userAnswer);
  const b = normalizeAnswer(correctAnswer);
  if (a === b) return { correct: true, closeMatch: false };
  const distance = levenshtein(a, b);
  const tolerance = Math.max(1, Math.floor(b.length * 0.15));
  return { correct: false, closeMatch: distance <= tolerance };
}
