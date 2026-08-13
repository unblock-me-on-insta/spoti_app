const baseEvents = Array.isArray(window.SPOTI_EVENTS) ? window.SPOTI_EVENTS : [];
const categoryStyles = {
  Glasba: { color: "#b7f34b", emoji: "♪", art: "linear-gradient(140deg,#1f2947,#7257e8 48%,#44d9da)" },
  Kultura: { color: "#39dfe8", emoji: "◒", art: "linear-gradient(135deg,#28c9d1,#e4f1ff 50%,#7357e8)" },
  Hrana: { color: "#ff775f", emoji: "✦", art: "linear-gradient(145deg,#ff775f,#ffbb62 52%,#f6e6ae)" },
  Sejem: { color: "#ffd863", emoji: "◆", art: "linear-gradient(145deg,#ffd863,#ff8e68 60%,#fff1c9)" },
  "Na prostem": { color: "#4ad5ad", emoji: "↟", art: "linear-gradient(145deg,#1c796d,#4ad5ad 56%,#d7ffd7)" },
  Družina: { color: "#a9c8ff", emoji: "☀", art: "linear-gradient(145deg,#739df1,#a9c8ff 55%,#f0f5ff)" }
};

const events = baseEvents.map((event, index) => ({
  ...event,
  id: String(event.id ?? index + 1),
  likes: event.likes ?? 40 + (index * 17) % 170,
  ...categoryStyles[event.category],
  color: event.color || categoryStyles[event.category]?.color || "#b7f34b",
  emoji: event.emoji || categoryStyles[event.category]?.emoji || "●",
  art: event.art || categoryStyles[event.category]?.art || "linear-gradient(145deg,#1f2947,#39dfe8)"
}));

const LJUBLJANA_CENTER = { lat: 46.0511, lng: 14.5051, label: "Središče Ljubljane" };
const allowedScreens = new Set(["home", "explore", "map", "calendar", "saved", "profile"]);
const initialScreen = allowedScreens.has(location.hash.slice(1)) ? location.hash.slice(1) : "home";
const state = {
  screen: initialScreen,
  activeEvent: events[0],
  filter: "Vse",
  saved: new Set(JSON.parse(localStorage.getItem("spoti-saved") || "[]")),
  liked: new Set(),
  welcomeStep: 1,
  persona: 0,
  avatarColor: "#b7f34b",
  avatarHat: "#19213a",
  avatarTab: "Dodatki",
  userLocation: null,
  locating: false,
  search: "",
  agentPrefs: null
};

const stage = document.querySelector("#screen-stage");
const overlayRoot = document.querySelector("#overlay-root");
const toast = document.querySelector("#toast");
const icon = (name, cls = "") => `<svg class="${cls}"><use href="#i-${name}"></use></svg>`;
const escapeHtml = value => String(value ?? "").replace(/[&<>'"]/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[char]);
const photo = (event, className = "event-photo") => event?.image ? `<img class="${className}" src="${escapeHtml(event.image)}" alt="Fotografija dogodka ${escapeHtml(event.title)}" loading="lazy" onerror="this.remove()">` : "";

function dateValue(event) { return new Date(`${event.date}T${event.startTime || "12:00"}:00`); }
function sortDateValue(event) {
  const start = dateValue(event), today = new Date();
  today.setHours(0, 0, 0, 0);
  if (start < today && event.endDate && new Date(`${event.endDate}T23:59:59`) >= today) {
    const ongoing = new Date(today);
    ongoing.setHours(23, 50, 0, 0);
    return ongoing;
  }
  return start;
}
function isCurrent(event) {
  const now = new Date();
  const end = new Date(`${event.endDate || event.date}T23:59:59`);
  return end >= now;
}
function formatDate(event, compact = false) {
  const value = dateValue(event);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (value < today && event.endDate && new Date(`${event.endDate}T23:59:59`) >= today) {
    const end = new Intl.DateTimeFormat("sl-SI", { day: "numeric", month: "short" }).format(new Date(`${event.endDate}T12:00:00`));
    return `Poteka do ${end}`;
  }
  const date = new Intl.DateTimeFormat("sl-SI", compact ? { day: "numeric", month: "short" } : { weekday: "short", day: "numeric", month: "short" }).format(value);
  return `${date} · ${event.startTime || "ves dan"}`;
}
function haversine(from, to) {
  const rad = value => value * Math.PI / 180;
  const dLat = rad(to.lat - from.lat), dLng = rad(to.lng - from.lng);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(from.lat)) * Math.cos(rad(to.lat)) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
function distanceFor(event) {
  if (!state.userLocation || !Number.isFinite(event.lat) || !Number.isFinite(event.lng)) return null;
  return haversine(state.userLocation, event);
}
function distanceLabel(event) {
  const km = distanceFor(event);
  if (km === null) return event.place;
  return km < 1 ? `${Math.max(50, Math.round(km * 1000 / 50) * 50)} m stran` : `${km.toFixed(1).replace(".", ",")} km stran`;
}
function activeEvents() {
  return events.filter(isCurrent).sort((a, b) => sortDateValue(a) - sortDateValue(b));
}
function filteredEvents() {
  const query = state.search.trim().toLocaleLowerCase("sl");
  const list = activeEvents().filter(event => (state.filter === "Vse" || event.category === state.filter) && (!query || `${event.title} ${event.place} ${event.category}`.toLocaleLowerCase("sl").includes(query)));
  return state.agentPrefs && window.SPOTIAgent ? window.SPOTIAgent.rank(list) : list;
}
function categories() { return ["Vse", ...new Set(activeEvents().map(event => event.category))]; }
function saveState() { localStorage.setItem("spoti-saved", JSON.stringify([...state.saved])); }

function eventCard(event, options = {}) {
  const distance = distanceLabel(event);
  return `<article class="discover-card" data-event="${escapeHtml(event.id)}">
    <div class="discover-art" style="--art:${event.art}">${photo(event)}<span>${escapeHtml(event.category)}</span><button class="card-save ${state.saved.has(event.id) ? "active" : ""}" data-save-card="${escapeHtml(event.id)}" aria-label="Shrani dogodek">${icon("bookmark")}</button></div>
    <div class="discover-body"><div class="eyebrow">${escapeHtml(formatDate(event, true))}</div><h3>${escapeHtml(event.title)}</h3><p>${icon("location")} ${escapeHtml(distance)}</p><div class="card-footer"><span>${escapeHtml(event.price)}</span>${options.nearby && distanceFor(event) !== null ? `<b>${escapeHtml(distance)}</b>` : `<b>${escapeHtml(event.place)}</b>`}</div></div>
  </article>`;
}

function renderHome() {
  const upcoming = activeEvents().slice(0, 6);
  const featured = upcoming[0] || events[0];
  return `<section class="screen home-screen">
    <header class="home-top"><button class="brand home-brand" data-action="welcome"><span>SP</span><i></i><span>Ti</span></button><div><button class="home-icon" data-screen="saved" aria-label="Shranjeno">${icon("bookmark")}<em>${state.saved.size}</em></button><button class="mini-avatar" data-screen="profile">S</button></div></header>
    <div class="home-hero"><div class="hero-orb orb-one"></div><div class="hero-orb orb-two"></div><div class="home-hero-copy"><span class="hero-kicker">${activeEvents().length} aktualnih dogodkov</span><h1>Ljubljana<br><strong>živi tukaj.</strong></h1><p>Izberi svoj naslednji večer, sprehod ali kulturni pobeg.</p><div class="hero-buttons"><button class="primary-btn" data-screen="explore">Dogodki v bližini ${icon("arrow")}</button><button class="secondary-btn" data-screen="map">Odpri zemljevid</button></div></div><button class="hero-event" data-event="${featured.id}" style="--art:${featured.art}">${photo(featured, "hero-event-photo")}<span>Danes v mestu</span><strong>${escapeHtml(featured.title)}</strong><small>${escapeHtml(featured.place)} · ${escapeHtml(featured.startTime)}</small></button></div>
    <section class="home-section"><div class="section-heading"><div><span class="section-label">IZBOR SPOTi</span><h2>Naslednje v mestu</h2></div><button data-screen="explore">Prikaži vse ${icon("arrow")}</button></div><div class="discover-grid">${upcoming.map(event => eventCard(event)).join("")}</div></section>
    <section class="source-strip"><span class="source-live"></span><b>Samodejno osveženo</b><span>${escapeHtml(window.SPOTI_EVENTS_META?.source || "javni viri")} · ${new Date(window.SPOTI_EVENTS_META?.updatedAt || Date.now()).toLocaleDateString("sl-SI")}</span><button data-action="refresh-data">Osveži podatke</button></section>
  </section>`;
}

function renderExplore() {
  const list = filteredEvents().slice().sort((a, b) => {
    if (state.userLocation) return distanceFor(a) - distanceFor(b);
    return sortDateValue(a) - sortDateValue(b);
  });
  return `<section class="screen content-screen explore-screen"><header class="explore-header"><div><span class="section-label">${state.agentPrefs ? "PRILAGOJENO S SPOTi AI" : "PAMETNO ODKRIVANJE"}</span><h1>${state.agentPrefs ? "Priporočila" : "Dogodki"} <em>${state.agentPrefs ? "zate." : "blizu tebe."}</em></h1><p>${state.agentPrefs ? "Rezultati upoštevajo tvoje interese, termin, budget in želeno razdaljo." : state.userLocation ? `Lokacija: ${escapeHtml(state.userLocation.label)}. Razvrščeno po oddaljenosti.` : "Dovoli lokacijo in pokažemo ti, kaj se dogaja okoli tebe."}</p></div><button class="location-cta ${state.locating ? "loading" : ""}" data-action="use-location">${icon("navigation")}<span>${state.locating ? "Iščem lokacijo ..." : state.userLocation ? "Osveži lokacijo" : "Uporabi mojo lokacijo"}</span></button></header>
    <div class="explore-toolbar"><label class="search-box">${icon("search")}<input id="event-search" value="${escapeHtml(state.search)}" placeholder="Išči dogodek ali lokacijo ..." autocomplete="off"></label><div class="filter-row">${categories().map(category => `<button class="filter-chip ${state.filter === category ? "active" : ""}" data-filter="${escapeHtml(category)}">${escapeHtml(category)}</button>`).join("")}</div></div>
    <div class="results-row"><b>${list.length} dogodkov</b><span>${state.userLocation ? "najbližji najprej" : "kronološko"}</span></div>
    ${list.length ? `<div class="discover-grid explore-grid">${list.map(event => eventCard(event, { nearby: true })).join("")}</div>` : `<div class="empty-state"><div class="empty-illustration">${icon("search")}</div><h2>Ničesar nismo našli</h2><p>Poskusi drugo kategorijo ali iskalni izraz.</p><button class="primary-btn" data-action="clear-filters">Počisti filtre</button></div>`}
  </section>`;
}

function mapPosition(event) {
  const minLat = 46.044, maxLat = 46.057, minLng = 14.495, maxLng = 14.514;
  const x = 12 + Math.max(0, Math.min(1, (event.lng - minLng) / (maxLng - minLng))) * 76;
  const y = 14 + (1 - Math.max(0, Math.min(1, (event.lat - minLat) / (maxLat - minLat)))) * 70;
  return [x.toFixed(1), y.toFixed(1)];
}
function renderMap() {
  const shown = filteredEvents();
  const selected = state.activeEvent || shown[0];
  return `<section class="screen map-screen"><div class="map-canvas"><span class="street-label" style="left:43%;top:42%">Tivolska cesta</span><span class="street-label" style="left:70%;top:73%">Ljubljanica</span>${shown.map(event => { const pos = mapPosition(event); return `<button class="map-marker ${selected?.id === event.id ? "active" : ""}" data-map-event="${event.id}" style="left:${pos[0]}%;top:${pos[1]}%;--marker:${event.color}" aria-label="${escapeHtml(event.title)}"><span class="marker-dot"><span>${event.emoji}</span></span><span class="marker-label">${escapeHtml(event.title)}</span></button>`; }).join("")}${state.userLocation ? `<div class="user-map-dot" style="left:50%;top:50%"><i></i><span>Ti si tukaj</span></div>` : ""}</div>
    <div class="map-top"><div class="map-heading-row"><h1 class="map-heading">Zemljevid <span>dogajanja.</span></h1><div class="weather-pill">${shown.length} dogodkov na zemljevidu</div></div><div class="search-row"><label class="search-box">${icon("search")}<input id="event-search" value="${escapeHtml(state.search)}" placeholder="Išči na zemljevidu ..."></label><button class="round-button" data-action="use-location" aria-label="Moja lokacija">${icon("navigation")}</button></div><div class="filter-row">${categories().map(category => `<button class="filter-chip ${state.filter === category ? "active" : ""}" data-filter="${escapeHtml(category)}">${escapeHtml(category)}</button>`).join("")}</div></div>
    ${selected ? `<article class="feature-card"><div class="feature-art" style="--art:${selected.art}">${photo(selected)}</div><div class="feature-copy"><div class="eyebrow">${escapeHtml(selected.category)} · ${escapeHtml(distanceLabel(selected))}</div><h2>${escapeHtml(selected.title)}</h2><p>${escapeHtml(formatDate(selected))} · ${escapeHtml(selected.place)}</p></div><button class="open-event" data-action="open-event">${icon("arrow")}</button></article>` : ""}
  </section>`;
}

function renderCalendar() {
  const list = activeEvents();
  return `<section class="screen content-screen"><header class="screen-header"><div><h1>Tvoj mestni koledar</h1><p>Avgust je poln dobrih razlogov, da greš ven.</p></div><span class="today-badge">${list.length} dogodkov</span></header><div class="calendar-layout"><article class="calendar-card"><div class="month-title"><button>‹</button><h2>Avgust 2026</h2><button>›</button></div><div class="weekdays">${["Pon","Tor","Sre","Čet","Pet","Sob","Ned"].map(day => `<span>${day}</span>`).join("")}</div><div class="days">${[27,28,29,30,31,...Array.from({length:30},(_,i)=>i+1)].map((day,index) => `<button class="day ${index < 5 ? "muted" : ""} ${[17,18,19,20,21,22,23,25,26,28,30].includes(index) ? "has-event" : ""} ${index === 17 ? "active" : ""}">${day}</button>`).join("")}</div></article><div class="agenda"><div class="agenda-title"><h2>Prihajajoči dogodki</h2><span>uradni viri</span></div>${list.slice(0,8).map(event => `<article class="agenda-event" data-event="${event.id}"><div class="event-time">${escapeHtml(event.startTime || "—")}</div><div><h3>${escapeHtml(event.title)}</h3><p>${escapeHtml(formatDate(event, true))} · ${escapeHtml(event.place)}</p></div><i class="category-dot" style="background:${event.color}"></i></article>`).join("")}</div></div></section>`;
}

function renderSaved() {
  const savedEvents = events.filter(event => state.saved.has(event.id));
  if (!savedEvents.length) return `<section class="screen content-screen"><header class="screen-header"><div><h1>Shranjeno zate</h1><p>Dogodki, h katerim se želiš vrniti.</p></div></header><div class="empty-state"><div class="empty-illustration">${icon("bookmark")}</div><h2>Tukaj je še malo tiho</h2><p>Ko najdeš dogodek, ki ti je všeč, ga shrani. Počakal te bo prav tukaj.</p><button class="primary-btn" data-screen="explore">Odkrij dogodke</button></div></section>`;
  return `<section class="screen content-screen"><header class="screen-header"><div><h1>Shranjeno zate</h1><p>Tvoji favoriti na enem mestu.</p></div><span class="today-badge">${savedEvents.length}</span></header><div class="discover-grid explore-grid">${savedEvents.map(event => eventCard(event)).join("")}</div></section>`;
}

function renderProfile() {
  return `<section class="screen content-screen"><header class="screen-header"><div><h1>Tvoj SPOTi obraz</h1><p>Ustvari avatar, ki je tako unikaten kot tvoj mestni vibe.</p></div><button class="today-badge" data-action="save-avatar" style="border:0;cursor:pointer">Shrani spremembe</button></header><div class="profile-layout"><article class="panel-card avatar-card" style="--avatar-color:${state.avatarColor}"><div class="avatar"><i class="avatar-ear left"></i><i class="avatar-ear right"></i><i class="avatar-body"></i><i class="avatar-head"><i class="avatar-eye left"></i><i class="avatar-eye right"></i><i class="avatar-snout"><i class="avatar-nose"></i></i></i><i class="avatar-hat" style="--hat:${state.avatarHat}"></i><i class="avatar-scarf"></i></div><div class="profile-name"><h2>Sara raziskuje</h2><p>Urbana raziskovalka · Ljubljana</p></div></article><article class="panel-card customizer"><div><h2>Po svoje</h2><p>Izberi stil in barve svojega avatarja.</p></div><div class="tabs">${["Obraz","Lasje","Dodatki","Obleka"].map(tab => `<button class="tab ${state.avatarTab === tab ? "active" : ""}" data-avatar-tab="${tab}">${tab}</button>`).join("")}</div><div class="option-grid">${["🧢","🎧","👓","✨","🌼","⚡"].map((item,index) => `<button class="avatar-option ${index === 0 ? "active" : ""}">${item}</button>`).join("")}</div><div><div class="section-label">Barva ozadja</div><div class="palette" style="margin-top:14px">${["#b7f34b","#39dfe8","#ff775f","#7357e8","#ffd863"].map(color => `<button class="swatch ${state.avatarColor === color ? "active" : ""}" data-color="${color}" style="--swatch:${color}"></button>`).join("")}</div></div><div><div class="section-label">Barva kape</div><div class="palette" style="margin-top:14px">${["#19213a","#456c08","#f2a355","#7357e8"].map(color => `<button class="swatch ${state.avatarHat === color ? "active" : ""}" data-hat="${color}" style="--swatch:${color}"></button>`).join("")}</div></div></article></div></section>`;
}

function render() {
  const templates = { home: renderHome, explore: renderExplore, map: renderMap, calendar: renderCalendar, saved: renderSaved, profile: renderProfile };
  stage.innerHTML = (templates[state.screen] || renderHome)();
  document.querySelectorAll("[data-screen]").forEach(element => element.classList.toggle("active", element.dataset.screen === state.screen));
}

function showDetail(event = state.activeEvent) {
  if (!event) return;
  state.activeEvent = event;
  const saved = state.saved.has(event.id), liked = state.liked.has(event.id);
  overlayRoot.className = "overlay-root open";
  overlayRoot.innerHTML = `<div class="detail-overlay" data-action="close-overlay"><article class="detail-sheet" onclick="event.stopPropagation()"><div class="detail-hero" style="background:${event.art}">${photo(event, "detail-photo")}<div class="hero-actions"><button class="glass-button" data-action="close-overlay">${icon("back")}</button><button class="glass-button" data-action="share">${icon("share")}</button></div></div><div class="detail-content"><div class="eyebrow">${escapeHtml(event.category)} · preverjen vir</div><div class="detail-topline"><div><h1>${escapeHtml(event.title)}</h1><p class="subtitle">${escapeHtml(event.description)}</p></div><div class="price">${escapeHtml(event.price)}</div></div><div class="detail-actions"><button class="like-btn ${liked ? "active" : ""}" data-action="like">${icon("heart")}</button><button class="primary-btn" data-action="visit-source">${icon("external")} &nbsp; Uradna stran</button><button class="like-btn ${saved ? "active" : ""}" data-action="save-event">${icon("bookmark")}</button></div><div class="meta-grid"><div class="meta-box">${icon("calendar")}<div><b>${escapeHtml(formatDate(event))}</b><span>${event.endTime ? `do ${escapeHtml(event.endTime)}` : "Preveri urnik pri viru"}</span></div></div><div class="meta-box">${icon("location")}<div><b>${escapeHtml(event.place)}</b><span>${escapeHtml(event.address || "Ljubljana")}</span></div></div></div><div class="description"><h2>O dogodku</h2><p>${escapeHtml(event.description)}</p></div><a class="source-link" href="${escapeHtml(event.source)}" target="_blank" rel="noopener noreferrer">Vir: ${escapeHtml(event.sourceName || "organizator")} ${icon("external")}</a></div></article></div>`;
}

function showShare() {
  const event = state.activeEvent;
  overlayRoot.innerHTML = `<div class="share-overlay" data-action="close-overlay"><section class="share-sheet" onclick="event.stopPropagation()"><div class="drag-handle"></div><div class="share-header"><h2>Deli dogodek</h2><button data-action="close-overlay">${icon("close")}</button></div><div class="share-preview"><div class="feature-art" style="--art:${event.art}">${photo(event)}</div><div><h3>${escapeHtml(event.title)}</h3><p>${escapeHtml(formatDate(event))} · ${escapeHtml(event.place)}</p></div></div><div class="section-label">Deli prek</div><div class="app-row"><button class="share-app" data-share="WhatsApp"><i style="--app:#27c76f">W</i>WhatsApp</button><button class="share-app" data-share="Zgodbe"><i style="--app:linear-gradient(145deg,#ff925a,#a743d8)">◎</i>Zgodbe</button><button class="share-app" data-share="Messenger"><i style="--app:#218bff">M</i>Messenger</button><button class="share-app" data-action="copy"><i style="--app:#121a2e">${icon("share")}</i>Kopiraj</button></div></section></div>`;
}

function closeOverlay() { overlayRoot.className = "overlay-root"; overlayRoot.innerHTML = ""; }
let toastTimer;
function notify(message) { toast.textContent = message; toast.classList.add("show"); clearTimeout(toastTimer); toastTimer = setTimeout(() => toast.classList.remove("show"), 2400); }
function findEvent(id) { return events.find(event => event.id === String(id)); }

function requestLocation() {
  state.locating = true;
  render();
  if (!navigator.geolocation) {
    state.userLocation = LJUBLJANA_CENTER;
    state.locating = false;
    render();
    notify("Brskalnik ne podpira lokacije; uporabljamo središče Ljubljane.");
    return;
  }
  navigator.geolocation.getCurrentPosition(position => {
    state.userLocation = { lat: position.coords.latitude, lng: position.coords.longitude, label: "Tvoja trenutna lokacija" };
    state.locating = false;
    render();
    notify("Dogodki so razvrščeni po bližini.");
  }, () => {
    state.userLocation = LJUBLJANA_CENTER;
    state.locating = false;
    render();
    notify("Lokacija ni bila dovoljena; uporabljamo središče Ljubljane.");
  }, { enableHighAccuracy: true, timeout: 9000, maximumAge: 300000 });
}

document.addEventListener("click", event => {
  const screenButton = event.target.closest("[data-screen]");
  if (screenButton) { state.screen = screenButton.dataset.screen; history.replaceState(null, "", `#${state.screen}`); closeOverlay(); render(); return; }
  const mapMarker = event.target.closest("[data-map-event]");
  if (mapMarker) { state.activeEvent = findEvent(mapMarker.dataset.mapEvent); render(); return; }
  const saveCard = event.target.closest("[data-save-card]");
  if (saveCard) { event.stopPropagation(); const id = saveCard.dataset.saveCard; state.saved.has(id) ? state.saved.delete(id) : state.saved.add(id); saveState(); render(); notify(state.saved.has(id) ? "Dogodek je shranjen" : "Dogodek odstranjen"); return; }
  const card = event.target.closest("[data-event]");
  if (card) { const selected = findEvent(card.dataset.event); if (selected) showDetail(selected); return; }
  const filter = event.target.closest("[data-filter]");
  if (filter) { state.filter = filter.dataset.filter; render(); return; }
  const color = event.target.closest("[data-color]"); if (color) { state.avatarColor = color.dataset.color; render(); return; }
  const hat = event.target.closest("[data-hat]"); if (hat) { state.avatarHat = hat.dataset.hat; render(); return; }
  const avatarTab = event.target.closest("[data-avatar-tab]"); if (avatarTab) { state.avatarTab = avatarTab.dataset.avatarTab; render(); return; }
  const shareTarget = event.target.closest("[data-share]"); if (shareTarget) { notify(`Pripravljeno za ${shareTarget.dataset.share}`); return; }
  const action = event.target.closest("[data-action]")?.dataset.action;
  if (!action) return;
  if (action === "open-event") showDetail();
  if (action === "close-overlay") closeOverlay();
  if (action === "share") showShare();
  if (action === "visit-source") window.open(state.activeEvent.source, "_blank", "noopener,noreferrer");
  if (action === "like") { state.liked.has(state.activeEvent.id) ? state.liked.delete(state.activeEvent.id) : state.liked.add(state.activeEvent.id); showDetail(); }
  if (action === "save-event") { state.saved.has(state.activeEvent.id) ? state.saved.delete(state.activeEvent.id) : state.saved.add(state.activeEvent.id); saveState(); showDetail(); notify(state.saved.has(state.activeEvent.id) ? "Dogodek je shranjen" : "Dogodek odstranjen"); }
  if (action === "use-location") requestLocation();
  if (action === "clear-filters") { state.filter = "Vse"; state.search = ""; render(); }
  if (action === "copy") { navigator.clipboard?.writeText(`${state.activeEvent.title} — ${state.activeEvent.source}`); notify("Povezava je kopirana"); }
  if (action === "save-avatar") notify("Tvoj novi videz je shranjen ✨");
  if (action === "refresh-data") notify("Podatke samodejno osveži tools/update-events.ps1.");
});

document.addEventListener("input", event => {
  if (event.target.id !== "event-search") return;
  state.search = event.target.value;
  const caret = event.target.selectionStart;
  render();
  const input = document.querySelector("#event-search");
  if (input) { input.focus(); input.setSelectionRange(caret, caret); }
});
document.addEventListener("keydown", event => { if (event.key === "Escape") closeOverlay(); });
window.SPOTI_AGENT_CONTEXT = { getLocation: () => state.userLocation };
window.addEventListener("spoti:preferences", event => {
  state.agentPrefs = event.detail;
  state.filter = "Vse";
  state.search = "";
  state.screen = "explore";
  history.replaceState(null, "", "#explore");
  if (!state.userLocation) requestLocation(); else render();
});
window.addEventListener("spoti:open-event", event => {
  const selected = findEvent(event.detail?.id);
  if (selected) showDetail(selected);
});
render();
