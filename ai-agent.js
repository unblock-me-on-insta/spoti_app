(function () {
  const root = document.querySelector("#ai-agent-root");
  const button = document.querySelector("#ai-fab");
  const events = Array.isArray(window.SPOTI_EVENTS) ? window.SPOTI_EVENTS : [];
  const preferences = { category: "Vse", time: "any", budget: "any", radius: 8 };
  let open = false;
  let step = 0;

  const questions = [
    {
      key: "category",
      text: "Kaj ti danes najbolj sede?",
      subtext: "Izberi vibe, jaz pa bom pregledal aktualne dogodke.",
      options: [["Glasba", "Glasba"], ["Kultura", "Kultura"], ["Hrana", "Hrana"], ["Na prostem", "Na prostem"], ["Preseneti me", "Vse"]]
    },
    {
      key: "time",
      text: "Kdaj želiš iti?",
      subtext: "Upošteval bom dejanske termine dogodkov.",
      options: [["Danes", "today"], ["Ta teden", "week"], ["Vikend", "weekend"], ["Kadarkoli", "any"]]
    },
    {
      key: "budget",
      text: "Kakšen je plan za budget?",
      subtext: "Lahko pokažem samo dogodke s prostim vstopom.",
      options: [["Samo brezplačno", "free"], ["Ni pomembno", "any"]]
    },
    {
      key: "radius",
      text: "Kako daleč greva?",
      subtext: "Za natančno bližino bo brskalnik vprašal za lokacijo.",
      options: [["Peš · 1 km", "1"], ["Blizu · 3 km", "3"], ["Po mestu · 8 km", "8"], ["Brez omejitve", "999"]]
    }
  ];

  const clean = value => String(value ?? "").replace(/[&<>'"]/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[char]);
  const currentLocation = () => window.SPOTI_AGENT_CONTEXT?.getLocation?.() || null;
  const toDate = event => new Date(`${event.date}T${event.startTime || "12:00"}:00`);
  const distance = (event, location) => {
    if (!location || !event.lat || !event.lng) return null;
    const rad = value => value * Math.PI / 180;
    const dLat = rad(event.lat - location.lat), dLng = rad(event.lng - location.lng);
    const value = Math.sin(dLat / 2) ** 2 + Math.cos(rad(location.lat)) * Math.cos(rad(event.lat)) * Math.sin(dLng / 2) ** 2;
    return 6371 * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
  };
  function isTimeMatch(event, choice) {
    if (choice === "any") return true;
    const now = new Date(), date = toDate(event), days = Math.ceil((date - now) / 86400000);
    if (choice === "today") return event.date === now.toISOString().slice(0, 10) || (event.endDate && new Date(event.date) <= now && new Date(`${event.endDate}T23:59:59`) >= now);
    if (choice === "week") return days >= 0 && days <= 7;
    if (choice === "weekend") return days >= 0 && days <= 10 && [0, 6].includes(date.getDay());
    return true;
  }
  function score(event, prefs = preferences, location = currentLocation()) {
    let value = 20;
    if (prefs.category === "Vse" || event.category === prefs.category) value += 42;
    else value -= 8;
    value += isTimeMatch(event, prefs.time) ? 28 : -18;
    const free = /prost|free/i.test(event.price || "");
    if (prefs.budget === "free") value += free ? 24 : -30;
    const km = distance(event, location);
    if (km !== null) value += km <= Number(prefs.radius) ? Math.max(5, 24 - km * 3) : -25;
    const daysAway = Math.max(0, (toDate(event) - new Date()) / 86400000);
    value += Math.max(0, 12 - daysAway);
    return value;
  }
  function ranked() {
    return events.map(event => ({ event, score: score(event) })).sort((a, b) => b.score - a.score).slice(0, 3);
  }
  function summary() {
    const time = { today: "danes", week: "ta teden", weekend: "za vikend", any: "kadarkoli" }[preferences.time];
    const budget = preferences.budget === "free" ? "brezplačno" : "poljuben budget";
    const radius = preferences.radius >= 999 ? "cela Ljubljana" : `do ${preferences.radius} km`;
    return `${preferences.category === "Vse" ? "vsi vibi" : preferences.category.toLowerCase()}, ${time}, ${budget}, ${radius}`;
  }
  function render() {
    button.classList.toggle("hidden", open);
    if (!open) { root.innerHTML = ""; return; }
    const complete = step >= questions.length;
    const question = questions[step];
    root.innerHTML = `<div class="ai-backdrop" data-ai-action="close"><aside class="ai-panel" onclick="event.stopPropagation()">
      <header class="ai-header"><div class="ai-mark">✦</div><div><b>SPOTi AI</b><span><i></i> tvoj mestni agent</span></div><button data-ai-action="close" aria-label="Zapri">×</button></header>
      <div class="ai-conversation"><div class="ai-bubble ai-bubble-agent"><span>SPOTi AI</span><p>${complete ? "Našel sem tri dogodke, ki se najbolje ujemajo s tabo." : clean(question.text)}</p>${complete ? `<small>${clean(summary())}</small>` : `<small>${clean(question.subtext)}</small>`}</div>
      ${complete ? `<div class="ai-results">${ranked().map(({ event }, index) => `<button class="ai-result" data-ai-event="${clean(event.id)}"><img src="${clean(event.image)}" alt="" loading="lazy"><span><em>#${index + 1} zate</em><b>${clean(event.title)}</b><small>${clean(event.place)} · ${clean(event.startTime)}</small></span></button>`).join("")}</div><button class="ai-primary" data-ai-action="apply">Prilagodi moj Explore →</button><button class="ai-restart" data-ai-action="restart">Spremeni odgovore</button>` : `<div class="ai-options">${question.options.map(([label, value]) => `<button data-ai-answer="${clean(value)}">${clean(label)}</button>`).join("")}</div><div class="ai-progress"><i style="width:${((step + 1) / questions.length) * 100}%"></i></div>`}
      </div>
      <form class="ai-freeform" id="ai-freeform"><input name="prompt" autocomplete="off" placeholder="Ali napiši: danes, jazz, brezplačno ..."><button>↑</button></form>
      <p class="ai-privacy">Priporočila se izračunajo v tvojem brskalniku. Lokacije ne pošiljamo nikamor.</p>
    </aside></div>`;
  }
  function parsePrompt(text) {
    const value = text.toLocaleLowerCase("sl");
    if (/glasb|koncert|jazz|rock|opera/.test(value)) preferences.category = "Glasba";
    if (/kultur|umet|razstav|balet|gledali/.test(value)) preferences.category = "Kultura";
    if (/hran|vino|kulinari/.test(value)) preferences.category = "Hrana";
    if (/zunaj|prostem|sprehod/.test(value)) preferences.category = "Na prostem";
    if (/danes/.test(value)) preferences.time = "today";
    else if (/vikend/.test(value)) preferences.time = "weekend";
    else if (/teden/.test(value)) preferences.time = "week";
    if (/brezpla|zastonj|free/.test(value)) preferences.budget = "free";
    const km = value.match(/(\d+)\s*km/); if (km) preferences.radius = Number(km[1]);
    step = questions.length;
  }
  button.addEventListener("click", () => { open = true; render(); });
  root.addEventListener("click", event => {
    const close = event.target.closest('[data-ai-action="close"]'); if (close) { open = false; render(); return; }
    const answer = event.target.closest("[data-ai-answer]");
    if (answer) { preferences[questions[step].key] = questions[step].key === "radius" ? Number(answer.dataset.aiAnswer) : answer.dataset.aiAnswer; step += 1; render(); return; }
    const action = event.target.closest("[data-ai-action]")?.dataset.aiAction;
    if (action === "restart") { step = 0; render(); return; }
    if (action === "apply") { window.dispatchEvent(new CustomEvent("spoti:preferences", { detail: { ...preferences } })); open = false; render(); return; }
    const result = event.target.closest("[data-ai-event]");
    if (result) { window.dispatchEvent(new CustomEvent("spoti:open-event", { detail: { id: result.dataset.aiEvent } })); open = false; render(); }
  });
  root.addEventListener("submit", event => {
    if (event.target.id !== "ai-freeform") return;
    event.preventDefault();
    const text = new FormData(event.target).get("prompt")?.trim();
    if (text) { parsePrompt(text); render(); }
  });
  window.SPOTIAgent = { score, rank: list => list.slice().sort((a, b) => score(b) - score(a)), preferences };
  if (new URLSearchParams(location.search).get("agent") === "open") { open = true; render(); }
})();
