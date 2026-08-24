const app = document.getElementById("app");
const topNav = document.getElementById("top-nav");
const userEmailEl = document.getElementById("user-email");

let currentUser = null;

// ---------- API helpers ----------

async function apiJson(path, method = "GET", body) {
  const res = await fetch(`/api${path}`, {
    method,
    headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
    credentials: "same-origin",
  });
  let data = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }
  if (!res.ok) {
    const message = data?.error || `Fehler (${res.status})`;
    throw new Error(message);
  }
  return data;
}

async function apiUpload(path, formData) {
  const res = await fetch(`/api${path}`, {
    method: "POST",
    body: formData,
    credentials: "same-origin",
  });
  let data = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }
  if (!res.ok) {
    throw new Error(data?.error || `Fehler (${res.status})`);
  }
  return data;
}

// ---------- View mounting ----------

function mount(templateId) {
  const tpl = document.getElementById(templateId);
  app.innerHTML = "";
  app.appendChild(tpl.content.cloneNode(true));
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str ?? "";
  return div.innerHTML;
}

// ---------- Auth view ----------

function renderAuth() {
  topNav.classList.add("hidden");
  mount("tpl-auth");

  let mode = "login";
  const tabs = app.querySelectorAll(".tab-btn");
  const form = document.getElementById("auth-form");
  const submitBtn = form.querySelector("button[type=submit]");
  const errorEl = document.getElementById("auth-error");

  tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      mode = tab.dataset.tab;
      tabs.forEach((t) => t.classList.toggle("active", t === tab));
      submitBtn.textContent = mode === "login" ? "Anmelden" : "Registrieren";
      errorEl.textContent = "";
    });
  });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    errorEl.textContent = "";
    const fd = new FormData(form);
    const email = fd.get("email");
    const password = fd.get("password");
    try {
      const data = await apiJson(`/auth/${mode}`, "POST", { email, password });
      currentUser = data.user;
      afterLogin();
    } catch (err) {
      errorEl.textContent = err.message;
    }
  });
}

function afterLogin() {
  topNav.classList.remove("hidden");
  userEmailEl.textContent = currentUser.email;
  renderDashboard();
}

document.getElementById("logout-btn").addEventListener("click", async () => {
  await apiJson("/auth/logout", "POST");
  currentUser = null;
  renderAuth();
});

document.querySelectorAll("#top-nav .nav-btn[data-view]").forEach((btn) => {
  btn.addEventListener("click", () => {
    if (btn.dataset.view === "dashboard") renderDashboard();
  });
});

// ---------- Dashboard ----------

async function renderDashboard() {
  mount("tpl-dashboard");
  const listEl = document.getElementById("deck-list");
  listEl.innerHTML = '<p class="empty-note">Laedt ...</p>';

  document.getElementById("new-deck-btn").addEventListener("click", showNewDeckForm);

  try {
    const { decks } = await apiJson("/decks");
    if (decks.length === 0) {
      listEl.innerHTML = '<p class="empty-note">Noch keine Stapel. Leg deinen ersten Stapel an!</p>';
      return;
    }
    listEl.innerHTML = "";
    decks.forEach((deck) => {
      const card = document.createElement("div");
      card.className = "deck-card";
      card.innerHTML = `
        <h3>${escapeHtml(deck.name)}</h3>
        <p class="muted">${escapeHtml(deck.description || "")}</p>
        <div class="meta">
          <span>${deck.card_count} Karten</span>
          ${deck.due_count > 0 ? `<span class="due-badge">${deck.due_count} faellig</span>` : "<span>alles gelernt</span>"}
        </div>`;
      card.addEventListener("click", () => renderDeck(deck.id));
      listEl.appendChild(card);
    });
  } catch (err) {
    listEl.innerHTML = `<p class="error">${escapeHtml(err.message)}</p>`;
  }
}

function showNewDeckForm() {
  if (document.getElementById("new-deck-form")) return;
  const listEl = document.getElementById("deck-list");
  const form = document.createElement("form");
  form.id = "new-deck-form";
  form.className = "deck-card stack";
  form.innerHTML = `
    <label>Name<input type="text" name="name" required placeholder="z.B. Englisch Unit 3"></label>
    <label>Beschreibung (optional)<input type="text" name="description" placeholder="z.B. Kapitel 3-4"></label>
    <div class="btn-row">
      <button type="submit" class="btn primary">Anlegen</button>
      <button type="button" class="btn ghost" id="cancel-new-deck">Abbrechen</button>
    </div>
    <p class="error" id="new-deck-error"></p>`;
  listEl.prepend(form);
  form.querySelector("#cancel-new-deck").addEventListener("click", () => form.remove());
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    try {
      const { deck } = await apiJson("/decks", "POST", {
        name: fd.get("name"),
        description: fd.get("description"),
      });
      renderDeck(deck.id);
    } catch (err) {
      form.querySelector("#new-deck-error").textContent = err.message;
    }
  });
}

// ---------- Deck detail ----------

let studyDirection = "term-definition";

async function renderDeck(deckId) {
  mount("tpl-deck");
  app.querySelector('[data-view="dashboard"]').addEventListener("click", renderDashboard);
  document.getElementById("deck-import-btn").addEventListener("click", () => renderImport(deckId));
  document.getElementById("deck-add-btn").addEventListener("click", () => showAddCardForm(deckId));
  document.getElementById("start-flashcard-btn").addEventListener("click", () => {
    studyDirection = document.getElementById("study-direction").value;
    startStudy(deckId, "flashcard");
  });
  document.getElementById("start-typing-btn").addEventListener("click", () => {
    studyDirection = document.getElementById("study-direction").value;
    startStudy(deckId, "typing");
  });

  await Promise.all([loadDeckDetail(deckId), loadDeckStats(deckId)]);
}

async function loadDeckDetail(deckId) {
  const { deck, cards } = await apiJson(`/decks/${deckId}`);
  document.getElementById("deck-name").textContent = deck.name;
  document.getElementById("deck-desc").textContent = deck.description || "";
  document.getElementById("card-count").textContent = cards.length;

  const listEl = document.getElementById("card-list");
  listEl.innerHTML = "";
  if (cards.length === 0) {
    listEl.innerHTML = '<p class="empty-note">Noch keine Karten. Importiere Vokabeln oder fuege sie manuell hinzu.</p>';
    return;
  }
  cards.forEach((card) => {
    const isWeak = card.wrong_count > card.correct_count && card.wrong_count > 0;
    const row = document.createElement("div");
    row.className = "card-row";
    row.innerHTML = `
      <span class="term">${escapeHtml(card.term)}</span>
      <span class="definition">${escapeHtml(card.definition)}</span>
      <span class="ease">${isWeak ? '<span class="weak-tag">SCHWACH</span> ' : ""}EF ${card.ease_factor.toFixed(2)}</span>
      <button class="del-btn" title="Karte loeschen">&times;</button>`;
    row.querySelector(".del-btn").addEventListener("click", async () => {
      if (!confirm(`Karte "${card.term}" wirklich loeschen?`)) return;
      await apiJson(`/cards/${card.id}`, "DELETE");
      loadDeckDetail(deckId);
    });
    listEl.appendChild(row);
  });
}

async function loadDeckStats(deckId) {
  const { totals } = await apiJson(`/decks/${deckId}/stats`);
  const stripEl = document.getElementById("deck-stats");
  stripEl.innerHTML = `
    <div class="stat-tile"><div class="lb">Gesamt</div><div class="nb">${totals.total || 0}</div></div>
    <div class="stat-tile"><div class="lb">Faellig</div><div class="nb due">${totals.due || 0}</div></div>
    <div class="stat-tile"><div class="lb">In Arbeit</div><div class="nb">${totals.learning || 0}</div></div>
    <div class="stat-tile"><div class="lb">Gemeistert</div><div class="nb mastered">${totals.mastered || 0}</div></div>`;
}

function showAddCardForm(deckId) {
  if (document.getElementById("add-card-form")) return;
  const listEl = document.getElementById("card-list");
  const form = document.createElement("form");
  form.id = "add-card-form";
  form.className = "stack";
  form.style.marginBottom = "1rem";
  form.innerHTML = `
    <label>Begriff<input type="text" name="term" required></label>
    <label>Erklaerung / Uebersetzung<input type="text" name="definition" required></label>
    <label>Beispielsatz (optional)<input type="text" name="example"></label>
    <div class="btn-row">
      <button type="submit" class="btn primary">Speichern</button>
      <button type="button" class="btn ghost" id="cancel-add-card">Abbrechen</button>
    </div>
    <p class="error" id="add-card-error"></p>`;
  listEl.before(form);
  form.querySelector("#cancel-add-card").addEventListener("click", () => form.remove());
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    try {
      await apiJson(`/decks/${deckId}/cards`, "POST", {
        term: fd.get("term"),
        definition: fd.get("definition"),
        example: fd.get("example"),
      });
      form.remove();
      loadDeckDetail(deckId);
      loadDeckStats(deckId);
    } catch (err) {
      form.querySelector("#add-card-error").textContent = err.message;
    }
  });
}

// ---------- Import ----------

function renderImport(deckId) {
  mount("tpl-import");
  document.getElementById("import-back-btn").addEventListener("click", () => renderDeck(deckId));

  const fileInput = document.getElementById("file-input");
  document.getElementById("pick-file-btn").addEventListener("click", () => fileInput.click());

  fileInput.addEventListener("change", async () => {
    const file = fileInput.files[0];
    if (!file) return;
    document.getElementById("file-name").textContent = file.name;
    document.getElementById("import-error").textContent = "";
    document.getElementById("import-review").classList.add("hidden");
    document.getElementById("import-loading").classList.remove("hidden");

    const fd = new FormData();
    fd.append("file", file);

    try {
      const { items } = await apiUpload("/import/extract", fd);
      renderImportItems(deckId, items);
    } catch (err) {
      document.getElementById("import-error").textContent = err.message;
    } finally {
      document.getElementById("import-loading").classList.add("hidden");
    }
  });
}

function renderImportItems(deckId, items) {
  const reviewEl = document.getElementById("import-review");
  const itemsEl = document.getElementById("import-items");
  document.getElementById("import-count").textContent = items.length;
  itemsEl.innerHTML = "";

  if (items.length === 0) {
    itemsEl.innerHTML = '<p class="empty-note">Es konnten keine Begriffe erkannt werden.</p>';
    reviewEl.classList.remove("hidden");
    return;
  }

  items.forEach((item, i) => {
    const row = document.createElement("div");
    row.className = "import-item";
    row.innerHTML = `
      <input type="checkbox" checked data-idx="${i}" class="import-check">
      <input type="text" value="${escapeHtml(item.term)}" class="import-term" data-idx="${i}">
      <input type="text" value="${escapeHtml(item.definition)}" class="import-def" data-idx="${i}">`;
    itemsEl.appendChild(row);
  });
  reviewEl.classList.remove("hidden");

  document.getElementById("import-save-btn").onclick = async () => {
    const selected = [];
    itemsEl.querySelectorAll(".import-item").forEach((row) => {
      const checked = row.querySelector(".import-check").checked;
      if (!checked) return;
      selected.push({
        term: row.querySelector(".import-term").value,
        definition: row.querySelector(".import-def").value,
        example: items[Number(row.querySelector(".import-check").dataset.idx)]?.example || "",
      });
    });
    if (selected.length === 0) {
      document.getElementById("import-error").textContent = "Bitte mindestens eine Karte auswaehlen.";
      return;
    }
    try {
      await apiJson("/import/confirm", "POST", { deckId, items: selected });
      renderDeck(deckId);
    } catch (err) {
      document.getElementById("import-error").textContent = err.message;
    }
  };
}

// ---------- Study: flashcard + typing ----------

let studyQueue = [];
let studyIndex = 0;
let studyMode = "flashcard";
let studyDeckId = null;

async function startStudy(deckId, mode) {
  studyDeckId = deckId;
  studyMode = mode;
  mount("tpl-study");
  document.getElementById("study-back-btn").addEventListener("click", () => renderDeck(deckId));

  const { cards } = await apiJson(`/decks/${deckId}/study?limit=20`);
  studyQueue = cards;
  studyIndex = 0;

  if (cards.length === 0) {
    document.getElementById("study-empty").textContent =
      "Keine faelligen Karten - du bist auf dem aktuellen Stand. Komm spaeter wieder!";
    document.getElementById("study-empty").classList.remove("hidden");
    return;
  }

  if (mode === "flashcard") {
    document.getElementById("study-flashcard").classList.remove("hidden");
    showFlashcard();
  } else {
    document.getElementById("study-typing").classList.remove("hidden");
    showTypingPrompt();
  }
}

function updateStudyProgress() {
  const total = studyQueue.length;
  const done = studyIndex;
  document.getElementById("study-progress-fill").style.width = `${(done / total) * 100}%`;
  document.getElementById("study-progress-text").textContent = `${done} / ${total}`;
}

function finishStudy() {
  document.getElementById("study-flashcard").classList.add("hidden");
  document.getElementById("study-typing").classList.add("hidden");
  document.getElementById("study-empty").textContent = "Fertig! Alle faelligen Karten fuer heute abgeschlossen.";
  document.getElementById("study-empty").classList.remove("hidden");
}

function currentPromptTerm(card) {
  return studyDirection === "definition-term" ? card.definition : card.term;
}
function currentPromptAnswer(card) {
  return studyDirection === "definition-term" ? card.term : card.definition;
}

function showFlashcard() {
  updateStudyProgress();
  const card = studyQueue[studyIndex];
  const inner = document.getElementById("flip-card-inner");
  inner.classList.remove("flipped");
  document.getElementById("fc-front").textContent = currentPromptTerm(card);
  document.getElementById("fc-back").textContent = currentPromptAnswer(card);
  document.getElementById("fc-hint").classList.remove("hidden");
  document.getElementById("rate-row").classList.add("hidden");

  const flipCard = document.getElementById("flip-card");
  flipCard.onclick = () => {
    inner.classList.add("flipped");
    document.getElementById("fc-hint").classList.add("hidden");
    document.getElementById("rate-row").classList.remove("hidden");
  };

  document.querySelectorAll(".btn.rate").forEach((btn) => {
    btn.onclick = async () => {
      await apiJson(`/cards/${card.id}/review`, "POST", { mode: "flashcard", rating: btn.dataset.rating });
      studyIndex += 1;
      if (studyIndex >= studyQueue.length) {
        updateStudyProgress();
        finishStudy();
      } else {
        showFlashcard();
      }
    };
  });
}

function showTypingPrompt() {
  updateStudyProgress();
  const card = studyQueue[studyIndex];
  document.getElementById("typing-prompt").textContent = currentPromptTerm(card);
  const input = document.getElementById("typing-input");
  input.value = "";
  input.disabled = false;
  document.getElementById("typing-feedback").classList.add("hidden");
  document.getElementById("typing-next-btn").classList.add("hidden");
  document.getElementById("typing-form").classList.remove("hidden");
  input.focus();

  document.getElementById("typing-form").onsubmit = async (e) => {
    e.preventDefault();
    input.disabled = true;
    const { feedback } = await apiJson(`/cards/${card.id}/review`, "POST", {
      mode: "typing",
      userAnswer: input.value,
      direction: studyDirection,
    });

    const fbEl = document.getElementById("typing-feedback");
    fbEl.classList.remove("hidden", "correct", "close", "wrong");
    if (feedback.correct) {
      fbEl.classList.add("correct");
      fbEl.textContent = "Richtig!";
    } else if (feedback.closeMatch) {
      fbEl.classList.add("close");
      fbEl.innerHTML = `Fast richtig (kleiner Tippfehler). Korrekt: <span class="correct-answer">${escapeHtml(feedback.correctAnswer)}</span>`;
    } else {
      fbEl.classList.add("wrong");
      fbEl.innerHTML = `Leider falsch. Korrekt: <span class="correct-answer">${escapeHtml(feedback.correctAnswer)}</span>`;
    }
    document.getElementById("typing-form").classList.add("hidden");
    document.getElementById("typing-next-btn").classList.remove("hidden");
  };

  document.getElementById("typing-next-btn").onclick = () => {
    studyIndex += 1;
    if (studyIndex >= studyQueue.length) {
      updateStudyProgress();
      finishStudy();
    } else {
      showTypingPrompt();
    }
  };
}

// ---------- Init ----------

(async function init() {
  try {
    const { user } = await apiJson("/auth/me");
    currentUser = user;
    afterLogin();
  } catch {
    renderAuth();
  }
})();
