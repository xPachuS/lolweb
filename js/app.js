// =============================================================
//  App: enrutado por hash, vistas y refresco automático
//  Fuente de datos: Leaguepedia (ver api.js)
// =============================================================
import { CONFIG, LEAGUES, WORLDS_HISTORY, ORG_ALIASES, REGION_NAMES } from './config.js';
import * as api from './api.js';

const $view = document.getElementById('view');
const $status = document.getElementById('status');

let refreshTimer = null;
let lastUpdate = null;
let liveNow = false;
let renderToken = 0;
let shorts = {}; // nombre corto de cada equipo, para móvil
let lole = { live: [], events: [], teams: {}, leagues: {} }; // datos de lolesports.com (opcionales)
let logoByName = {}; let logoByCode = {}; let lpLogos = {};
let dataChecked = null; // hora de los datos (data/meta.json)
let vods = {};          // vídeos de las finales (data/vods.json)
let liveChecked = null; // hora del último directo recibido del Worker
let ddragon = { version: '', ids: {} };   // iconos de campeones
let finalRosters = {};  // año -> plantillas de la final
let seriesLink = null;  // (partido) -> enlace a su detalle, en las páginas que tienen datos de partidas

// ---------- utilidades ----------
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmtDate = (d) => new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'short' }).format(new Date(d));
const fmtTime = (d) => new Intl.DateTimeFormat('es-ES', { hour: '2-digit', minute: '2-digit' }).format(new Date(d));
const initials = (name) => (name || '?').replace(/\(.*?\)/g, '').replace(/[^A-Za-z0-9 ]/g, '').split(/\s+/).filter(Boolean).slice(0, 3).map((w) => w[0]).join('').toUpperCase() || '?';
const shortOf = (name) => shorts[name] || initials(name);
const isTbd = (name) => !name || /^TBD$/i.test(name);
// Leaguepedia desambigua con paréntesis: "LYON (2024 American Team)" → "LYON"
const displayName = (n) => String(n || '').replace(/\s*\([^)]*\)\s*$/, '');

function leagueLogo(slug, cls) {
  const src = lole.leagues?.[slug]?.image;
  return src ? `<img class="${cls}" src="${esc(src.replace(/^http:/, 'https:'))}" alt="" loading="lazy" onerror="this.remove()">` : '';
}

const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');

// ---------- equipos: enlace a la ficha y equipo favorito ----------
const teamHref = (n) => `#/equipo/${encodeURIComponent(api.canonTeam(n))}`;
const FAV_KEY = 'lolweb:fav';
function getFav() { try { return localStorage.getItem(FAV_KEY) || ''; } catch { return ''; } }
function setFav(n) { try { n ? localStorage.setItem(FAV_KEY, n) : localStorage.removeItem(FAV_KEY); } catch { /* sin almacenamiento */ } }
const isFav = (n) => { const f = getFav(); return !!f && !isTbd(n) && api.canonTeam(n) === f; };
const inNames = (n, names) => names.some((x) => norm(x) === norm(n));
const winnerOf = (m) => m.winner || (m.score1 > m.score2 ? 1 : m.score2 > m.score1 ? 2 : 0);

// ---------- calendario ----------
const icsDate = (d) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
const matchEnd = (m) => new Date(m.date.getTime() + (m.bestOf ? m.bestOf * 50 : 60) * 60_000);
const tbdName = (t) => (isTbd(t) ? 'Por decidir' : displayName(t));
const matchTitle = (m, label) => `${tbdName(m.team1)} vs ${tbdName(m.team2)}${label ? ' · ' + label : ''}`;
function gcalUrl(m, label) {
  const p = new URLSearchParams({ action: 'TEMPLATE', text: matchTitle(m, label), dates: `${icsDate(m.date)}/${icsDate(matchEnd(m))}`,
    details: `${m.bestOf ? 'Al mejor de ' + m.bestOf + '. ' : ''}Grieta Archivo · ${location.href.split('#')[0]}` });
  return `https://calendar.google.com/calendar/render?${p}`;
}
const icsSets = new Map();   // id -> { name, matches } para los botones "Añadir al calendario"
function icsButton(matches, name, labelFn = (m) => m.comp || '') {
  const list = matches.filter((m) => m.date && m.state === 'upcoming');
  if (!list.length) return '';
  const id = 'ics' + icsSets.size;
  icsSets.set(id, { name, matches: list, labelFn });
  return `<button class="btn btn--small" type="button" data-ics="${id}">📅 Añadir ${list.length} partido${list.length > 1 ? 's' : ''} al calendario</button>`;
}
function downloadIcs(id) {
  const set = icsSets.get(id);
  if (!set) return;
  const escI = (t) => String(t).replace(/[\\;,]/g, (c) => '\\' + c);
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Grieta Archivo//ES', 'CALSCALE:GREGORIAN', `X-WR-CALNAME:${escI(set.name)}`];
  for (const m of set.matches) {
    lines.push('BEGIN:VEVENT', `UID:${icsDate(m.date)}-${norm(m.team1)}-${norm(m.team2)}@grieta-archivo`, `DTSTAMP:${icsDate(new Date())}`,
      `DTSTART:${icsDate(m.date)}`, `DTEND:${icsDate(matchEnd(m))}`, `SUMMARY:${escI(matchTitle(m, set.labelFn(m)))}`,
      `DESCRIPTION:${escI(m.bestOf ? 'Al mejor de ' + m.bestOf : '')}`, 'END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  const blob = new Blob([lines.join('\r\n')], { type: 'text/calendar' });
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: `${norm(set.name) || 'partidos'}.ics` });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
// En páginas históricas se prefiere el escudo de Leaguepedia (el de esa época);
// en el resto, el de lolesports (el actual).
let preferHistoric = false;
function logoOf(name) {
  if (isTbd(name)) return '';
  // Mismo nombre, nombre sin la aclaración de Leaguepedia, o mismas siglas
  const lole = logoByName[norm(name)] || logoByName[norm(displayName(name))] || logoByCode[norm(shorts[name])];
  const lp = lpLogos[name] ? `${CONFIG.DATA_PATH}/logos/${encodeURIComponent(lpLogos[name])}` : '';
  return (preferHistoric ? lp || lole : lole || lp) || '';
}

const lpLogoUrl = (name) => (lpLogos[name] ? `${CONFIG.DATA_PATH}/logos/${encodeURIComponent(lpLogos[name])}` : '');

function teamBadge(name) {
  const src = logoOf(name);
  if (src) {
    return `<img class="logo" src="${esc(src.replace(/^http:/, 'https:'))}" referrerpolicy="no-referrer" alt="" loading="lazy" onerror="this.outerHTML='<span class=&quot;logo logo--txt&quot;>${esc(shortOf(name).slice(0, 4))}</span>'">`;
  }
  return `<span class="logo logo--txt">${esc(isTbd(name) ? '?' : shortOf(name).slice(0, 4))}</span>`;
}

function loading() {
  const card = '<div class="sk sk--card"></div>';
  return `<div class="skeleton" aria-busy="true" aria-label="Cargando datos">
    <div class="sk sk--label"></div><div class="sk sk--title"></div><div class="sk sk--line"></div>
    <div class="sk-grid">${card.repeat(6)}</div>
  </div>`;
}

function errorBox(err, extra = '') {
  console.error(err);
  if (err instanceof api.NoDataError) {
    return `<div class="state"><p><strong>Los datos aún no se han generado.</strong></p>
      <p class="muted">${esc(err.message)}</p></div>`;
  }
  return `<div class="state state--error">
    <p><strong>No se han podido cargar los datos.</strong></p>
    <p class="muted">${esc(err?.message || err)}</p>${extra}
    <button class="btn" onclick="location.reload()">Reintentar</button>
  </div>`;
}

function paintStatus() {
  if (!lastUpdate) { $status.innerHTML = ''; return; }
  let txt = 'Datos de Leaguepedia';
  if (dataChecked) {
    const min = Math.max(0, Math.round((Date.now() - dataChecked) / 60000));
    txt = min < 1 ? 'Datos de hace un momento' : min < 90 ? `Datos de hace ${min} min` : `Datos del ${fmtDate(dataChecked)}, ${fmtTime(dataChecked)}`;
  }
  if (liveNow && liveChecked) {
    const s = Math.max(0, Math.round((Date.now() - liveChecked) / 1000));
    txt = `Directo · actualizado hace ${s < 60 ? s + ' s' : Math.round(s / 60) + ' min'}`;
  }
  $status.innerHTML = `<span class="dot ${liveNow ? 'dot--live' : ''}"></span><span class="status__txt">${liveNow && !liveChecked ? 'En juego · ' : ''}${txt}</span>`;
  $status.title = txt;
}
setInterval(paintStatus, 5000);

function scheduleRefresh() {
  clearTimeout(refreshTimer);
  refreshTimer = setTimeout(() => route({ refresh: true }), liveNow ? CONFIG.REFRESH_LIVE_MS : CONFIG.REFRESH_IDLE_MS);
}

async function loadShorts() {
  [shorts, lpLogos] = await Promise.all([api.getTeamShorts(), api.getLeaguepediaLogos()]);
  logoByName = {}; logoByCode = {};
  for (const [name, t] of Object.entries(lole.teams || {})) {
    if (!t?.image) continue;
    logoByName[norm(name)] = t.image;
    if (t.code) logoByCode[norm(t.code)] = t.image;
  }
}

/** El directo del Worker manda sobre los datos guardados: marcador al momento y estadísticas. */
function mergeLive(events) {
  lole.live = events;
  const byId = new Map(lole.events.map((e) => [e.id, e]));
  for (const e of events) byId.set(e.id, e);
  lole.events = [...byId.values()];
  for (const e of events) for (const t of e.teams) if (t.image && t.name && !lole.teams[t.name]) lole.teams[t.name] = { code: t.code, image: t.image };
}

/** Busca en lolesports el mismo partido (mismos equipos, ±8 h) y toma su estado y marcador,
 *  que se actualiza antes que Leaguepedia. Si no lo encuentra, deja el de Leaguepedia. */
function sameTeam(lpName, t) {
  return norm(lpName) === norm(t.name) || (shorts[lpName] && norm(shorts[lpName]) === norm(t.code));
}
function applyLolesports(matches) {
  if (!lole.events.length) return matches;
  return matches.map((m) => {
    if (m.state === 'done' || !m.date) return m;
    const e = lole.events.find((x) => {
      const [a, b] = x.teams;
      const t = x.start ? Date.parse(x.start) : NaN;
      if (Number.isFinite(t) && Math.abs(t - m.date.getTime()) > 8 * 3600_000) return false;
      return (sameTeam(m.team1, a) && sameTeam(m.team2, b)) || (sameTeam(m.team1, b) && sameTeam(m.team2, a));
    });
    if (!e) return m;
    const flip = sameTeam(m.team1, e.teams[1]) && !sameTeam(m.team1, e.teams[0]);
    const [a, b] = flip ? [e.teams[1], e.teams[0]] : e.teams;
    const out = { ...m, official: true };
    if (e.state === 'live') {
      out.state = 'live';
      out.score1 = a.wins ?? m.score1; out.score2 = b.wins ?? m.score2;
      out.currentGame = e.currentGame;
      if (e.stats) out.stats = flip ? flipStats(e.stats) : e.stats;
    } else if (e.state === 'done') {
      out.state = 'done';
      out.score1 = a.wins ?? m.score1; out.score2 = b.wins ?? m.score2;
      out.winner = a.outcome === 'win' ? 1 : b.outcome === 'win' ? 2 : m.winner;
    }
    return out;
  });
}

/** Convierte un partido de lolesports al formato de las tarjetas. */
const flipStats = (st) => Object.fromEntries(Object.entries(st).map(([k, v]) => [k, Array.isArray(v) ? [v[1], v[0]] : v]));

function loleToMatch(e) {
  const [a, b] = e.teams;
  return {
    currentGame: e.currentGame, stats: e.stats,
    team1: a.name, team2: b.name, score1: a.wins, score2: b.wins,
    winner: a.outcome === 'win' ? 1 : b.outcome === 'win' ? 2 : null,
    state: e.state === 'done' ? 'done' : e.state === 'live' ? 'live' : 'upcoming',
    date: e.start ? new Date(e.start) : null, bestOf: e.bestOf,
    label: [e.league, e.block].filter(Boolean).join(' · '),
  };
}

// ---------- fila de partido ----------
const TAB_ES = {
  'Quarterfinals': 'Cuartos de final', 'Semifinals': 'Semifinales', 'Finals': 'Final', 'Final': 'Final',
  'Round of 16': 'Octavos de final', 'Group Stage': 'Fase de grupos', '5th Place': 'Quinto puesto',
  'Elimination Round': 'Ronda de eliminación', 'Qualification Round': 'Ronda de clasificación', 'Qualifiers': 'Clasificación',
  'Tiebreakers': 'Desempates', 'Playoffs': 'Playoffs', 'Play-Ins': 'Play-In', 'Regular Season': 'Temporada regular',
};
const tabEs = (t) => TAB_ES[t] || String(t || '')
  .replace(/^Day (\d+)/, 'Día $1').replace(/^Week (\d+)/, 'Semana $1').replace(/^Round (\d+)/, 'Ronda $1')
  .replace(/^Group ([A-Z])/, 'Grupo $1').replace(/Upper Bracket/, 'Cuadro superior').replace(/Lower Bracket/, 'Cuadro inferior');

/** Bloque de partidos en tarjetas: en juego, próximos y últimos resultados. */
function matchesBlock(matches, { upcomingN = 8, doneN = 8, label = (m) => tabEs(m.tab) } = {}) {
  const live = matches.filter((m) => m.state === 'live');
  const upcoming = matches.filter((m) => m.state === 'upcoming');
  const done = matches.filter((m) => m.state === 'done' || m.state === 'pending').reverse();
  if (live.length) liveNow = true;
  return [
    live.length ? cardSection('En juego', live, label, { live: true }) : '',
    cardSection('Próximos partidos', upcoming.slice(0, upcomingN), label, { empty: 'No hay partidos programados.' }),
    cardSection('Últimos resultados', done.slice(0, doneN), label, { empty: 'Todavía no hay resultados.' }),
  ].join('');
}

function cardSection(title, list, label = (m) => m.label || '', { empty = '', live = false, note = '' } = {}) {
  return `<section class="block ${live ? 'block--live' : ''}">
    <header class="block__head"><h3 class="block__title">${live ? '<span class="dot dot--live"></span>' : ''}${esc(title)}</h3>${note}</header>
    ${list.length ? `<div class="cardgrid">${list.map((m) => matchCard(m, { label: label(m) })).join('')}</div>` : `<p class="muted block__empty">${esc(empty)}</p>`}
  </section>`;
}

// =============================================================
//  VISTAS
// =============================================================

// ---------- Inicio ----------
async function viewHome(opts) {
  const last = WORLDS_HISTORY[WORLDS_HISTORY.length - 1];
  let worldsHtml = '';
  let todayHtml = '';

  try {
    const cur = await api.getCurrentWorlds();
    if (cur) {
      await loadShorts();
      const ms = applyLolesports((await api.getWorldsMatches(cur.year, { force: opts.refresh })) || []);
      worldsHtml = `<div class="hero">
          <div class="hero__label">Campeonato del Mundo</div>
          <h1 class="hero__title">${leagueLogo('worlds', 'hero__logo')}Mundial ${cur.year}</h1>
          <p class="hero__sub">Resultados que se actualizan solos · <a href="#/mundial/${cur.year}">Ver la edición completa →</a> · <a href="#/pickem">🎯 Pick'em con tus amigos</a></p>
        </div>
        ${ms.length ? matchesBlock(ms, { label: (m) => [m.stage, tabEs(m.tab)].filter(Boolean).join(' · ') }) : '<p class="muted">Aún no hay partidos publicados.</p>'}`;
    }
  } catch (err) {
    worldsHtml = `<div class="notice">No se ha podido consultar el Mundial en curso (${esc(err.message)}).</div>`;
  }

  if (!worldsHtml.includes('hero__title')) {
    const next = await api.getUpcomingWorlds().catch(() => null);
    if (next) {
      // Hora del primer partido si ya está publicada; si no, el día de inicio
      const firstMs = ((await api.getWorldsMatches(next.year).catch(() => null)) || []).map((m) => m.date).filter(Boolean).sort((a, b) => a - b)[0];
      const target = firstMs || new Date(next.start + 'T00:00:00Z');
      worldsHtml = `<div class="hero hero--countdown">
        <div class="hero__label">Campeonato del Mundo</div>
        <h1 class="hero__title">${leagueLogo('worlds', 'hero__logo')}Mundial ${next.year}</h1>
        <p class="hero__sub">Empieza el ${fmtDate(target)}${next.country ? ' en ' + esc(COUNTRY_ES[next.country] || next.country) : ''}. Vigente campeón: ${esc(last.champion)}.</p>
        ${countdownHtml(target)}
        <div class="hero__actions"><a class="btn btn--gold" href="#/mundial/${next.year}">Ver calendario del Mundial ${next.year}</a>
          <a class="btn" href="#/pickem">🎯 Pick'em con tus amigos</a></div>
      </div>` + worldsHtml;
    }
  }
  if (!worldsHtml.includes('hero__title')) {
    worldsHtml = `<div class="hero">
        <div class="hero__label">Campeonato del Mundo</div>
        <h1 class="hero__title">Vigente campeón: ${esc(last.champion)}</h1>
        <p class="hero__sub">Mundial ${last.year} · ${esc(last.city)} · ${esc(last.champion)} ${last.score} ${esc(last.runnerUp)}.
        El próximo Mundial aparecerá aquí automáticamente en cuanto empiece.</p>
        <a class="btn btn--gold" href="#/mundiales">Explorar la hemeroteca</a>
      </div>` + worldsHtml;
  }

  try {
    await loadShorts();
    const around = applyLolesports((await api.getMatchesAroundNow({ force: opts.refresh })).filter((m) => m.league.slug));
    if (around.length) {
      const live = around.filter((m) => m.state === 'live');
      if (live.length) liveNow = true;
      const rest = around.filter((m) => m.state !== 'live');
      todayHtml = cardSection('Ligas · ayer, hoy y mañana', [...live, ...rest], (m) => m.league.name);
    }
  } catch { /* no es crítico */ }

  const leagueCards = LEAGUES.slice(0, 6).map((l) => `
    <a class="lcard" href="#/liga/${l.slug}" style="--accent:${l.color}">
      ${leagueLogo(l.slug, 'lcard__img')}<span class="lcard__name">${esc(l.name)}</span><span class="lcard__region">${esc(l.region)}</span>
    </a>`).join('');

  // Directo oficial de lolesports. Si el Mundial ya se muestra arriba, sus partidos no se repiten.
  const showsWorlds = worldsHtml.includes('Resultados que se actualizan solos');
  // Máximo 5: primero las ligas principales (Mundial y las de LEAGUES), después por hora de inicio.
  const LIVE_MAX = 5;
  const mainSlugs = ['worlds', 'msi', 'first-stand', ...LEAGUES.map((l) => l.slug)];
  const rank = (e) => { const i = mainSlugs.indexOf(e.leagueSlug); return i === -1 ? 99 : i; };
  const liveAll = lole.live
    .filter((e) => e.state === 'live' && !(showsWorlds && e.leagueSlug === 'worlds'))
    .sort((a, b) => rank(a) - rank(b) || String(a.start).localeCompare(String(b.start)));
  const liveList = liveAll.slice(0, LIVE_MAX);
  const hidden = liveAll.length - liveList.length;
  if (lole.live.length) liveNow = true;
  const liveHtml = liveList.length
    ? `<div class="panel--top">${cardSection('En directo ahora · lolesports', liveList.map(loleToMatch), (m) => m.label, {
        live: true,
        note: hidden > 0 ? `<span class="block__note">y ${hidden} más en otras competiciones</span>` : '',
      })}</div>`
    : '';

  // Tu equipo: próximo partido y últimos resultados
  let favHtml = '';
  const fav = getFav();
  if (fav) {
    try {
      const names = api.teamNames(fav);
      const mine = applyLolesports(await api.getAllMatches()).filter((m) => inNames(m.team1, names) || inNames(m.team2, names));
      const next = mine.filter((m) => m.state === 'live' || m.state === 'upcoming').slice(0, 2);
      const last = mine.filter((m) => m.state === 'done').slice(-2).reverse();
      if (next.length || last.length) {
        favHtml = cardSection(`★ Tu equipo · ${displayName(fav)}`, [...next, ...last], (m) => m.comp || '', {
          live: next.some((m) => m.state === 'live'),
          note: `<a class="block__note" href="${teamHref(fav)}">Ver ficha →</a>`,
        });
      }
    } catch { /* sin datos del favorito */ }
  }

  return `${liveHtml}${favHtml}${worldsHtml}${todayHtml}
    <h2 class="h2"><span>Ligas</span></h2>
    <div class="lgrid">${leagueCards}</div>`;
}

// ---------- Cuenta atrás ----------
function countdownParts(target) {
  const ms = Math.max(0, new Date(target) - Date.now());
  return { d: Math.floor(ms / 86400_000), h: Math.floor(ms / 3600_000) % 24, m: Math.floor(ms / 60_000) % 60 };
}
function countdownHtml(target) {
  const { d, h, m } = countdownParts(target);
  const tile = (v, l, k) => `<div class="cd__tile"><span class="cd__num" data-cd="${k}">${String(v).padStart(2, '0')}</span><span class="cd__lbl">${l}</span></div>`;
  return `<div class="cd" data-target="${new Date(target).toISOString()}">${tile(d, 'días', 'd')}${tile(h, 'horas', 'h')}${tile(m, 'minutos', 'm')}</div>`;
}
setInterval(() => {
  document.querySelectorAll('.cd[data-target]').forEach((el) => {
    const p = countdownParts(el.dataset.target);
    for (const k of ['d', 'h', 'm']) {
      const n = el.querySelector(`[data-cd="${k}"]`);
      if (n) n.textContent = String(p[k]).padStart(2, '0');
    }
  });
}, 15_000);

// ---------- Hemeroteca ----------
const COUNTRY_ES = { 'United States': 'EE. UU.', 'China': 'China', 'South Korea': 'Corea del Sur', 'Korea': 'Corea del Sur', 'United Kingdom': 'Reino Unido', 'Germany': 'Alemania', 'France': 'Francia', 'Spain': 'España', 'Canada': 'Canadá', 'Brazil': 'Brasil', 'Japan': 'Japón', 'Vietnam': 'Vietnam' };

async function viewWorlds(opts) {
  let extra = [];
  let note = '';
  try {
    extra = await api.getNewWorldsEditions({ force: opts.refresh });
  } catch (err) {
    note = `<div class="notice">No se han podido comprobar ediciones nuevas en Leaguepedia (${esc(err.message)}).</div>`;
  }
  await loadShorts();
  preferHistoric = true;
  await Promise.all(WORLDS_HISTORY.map(async (w) => { const r = await api.getFinalRosters(w.year); if (r) finalRosters[w.year] = r; }));
  const champRoster = (w) => {
    const r = finalRosters[w.year];
    const key = r && Object.keys(r).find((t) => api.canonTeam(t) === api.canonTeam(w.champion));
    return key ? r[key].map((p) => displayName(p.player)).join(' · ') : '';
  };

  const now = Date.now();
  const newItems = extra.filter((w) => !WORLDS_HISTORY.some((h) => h.year === w.year)).slice().reverse().map((w) => {
    const started = w.start && new Date(w.start) <= now;
    const ended = w.end && new Date(w.end).getTime() + 86400_000 < now;
    const status = ended ? 'Finalizado' : started ? 'En curso' : 'Próximamente';
    return `<li class="tl__item tl__item--new">
      <div class="tl__year">${w.year}</div>
      <a class="tl__card" href="#/mundial/${w.year}">
        <div class="tl__body">
          <span class="tag ${started && !ended ? 'tag--live' : 'tag--soon'}">${status}</span>
          <div class="tl__champ">Mundial ${w.year}</div>
          <div class="tl__where">${esc(COUNTRY_ES[w.country] || w.country || '')}${w.start ? ' · ' + fmtDate(w.start) : ''}${w.end ? ' – ' + fmtDate(w.end) : ''}</div>
        </div>
        <span class="tl__go">Ver →</span>
      </a>
    </li>`;
  }).join('');

  const histItems = WORLDS_HISTORY.slice().reverse().map((w) => `<li class="tl__item">
      <div class="tl__year">${w.year}</div>
      <a class="tl__card" href="#/mundial/${w.year}">
        <div class="tl__logo">${teamBadge(w.champion)}</div>
        <div class="tl__body">
          <div class="tl__champ">${esc(w.champion)} <span class="region">${w.champRegion}</span></div>
          <div class="tl__final"><span class="tl__score">${w.score}</span> en la final contra
            <span class="tl__runner">${teamBadge(w.runnerUp)}${esc(w.runnerUp)}</span></div>
          <div class="tl__where">${esc(w.city)}, ${esc(w.host)}</div>
          ${champRoster(w) ? `<div class="tl__roster" title="Plantilla en la final">${esc(champRoster(w))}</div>` : ''}
        </div>
        <span class="tl__go">Ver →</span>
      </a>
    </li>`).join('');

  const byOrg = {};
  const lastName = {};
  const byRegion = {};
  for (const w of WORLDS_HISTORY) {
    const org = ORG_ALIASES[w.champion] || w.champion;
    byOrg[org] = (byOrg[org] || []).concat(w.year);
    lastName[org] = w.champion;          // nombre con el que ganó por última vez (para el escudo)
    byRegion[w.champRegion] = (byRegion[w.champRegion] || 0) + 1;
  }
  const orgRows = Object.entries(byOrg).sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]));
  const max = orgRows[0][1].length;
  const regionRows = Object.entries(byRegion).sort((a, b) => b[1] - a[1]);
  const total = WORLDS_HISTORY.length;
  const html = `<div class="hero hero--small">
      <div class="hero__label">Hemeroteca</div>
      <h1 class="hero__title">Todos los Mundiales</h1>
      <p class="hero__sub">Desde Jönköping 2011 hasta hoy. Las ediciones nuevas se añaden solas desde Leaguepedia.</p>
      <div class="hero__actions"><a class="btn btn--small" href="#/records">📈 Récords</a><a class="btn btn--small" href="#/evolucion">📊 Evolución del juego</a></div>
    </div>
    ${note}
    <ol class="tl">${newItems}${histItems}</ol>

    <h2 class="h2"><span>Palmarés</span></h2>
    ${regionStrip()}
    <div class="grid2">
      <section class="panel">
        <h3 class="panel__title">Títulos por organización</h3>
        ${orgRows.map(([org, years]) => `<div class="bar bar--logo">
            <a class="bar__label" href="${teamHref(org)}">${teamBadge(lastName[org])}<span>${esc(org)}</span></a>
            <span class="bar__track"><span class="bar__fill" style="width:${(years.length / max) * 100}%"></span></span>
            <span class="bar__val">${years.length}</span>
            <span class="bar__years muted small">${years.join(', ')}</span>
          </div>`).join('')}
        <p class="muted small pad">SK Telecom T1 cuenta como T1; Samsung White como Samsung Galaxy; DAMWON Gaming y DWG KIA como Dplus Kia.</p>
      </section>
      <section class="panel">
        <h3 class="panel__title">Títulos por región</h3>
        ${regionRows.map(([r, n]) => `<div class="bar">
            <span class="bar__label">${esc(REGION_NAMES[r] || r)}</span>
            <span class="bar__track"><span class="bar__fill bar__fill--alt" style="width:${(n / total) * 100}%"></span></span>
            <span class="bar__val">${n}</span><span></span>
          </div>`).join('')}
      </section>
    </div>`;
  preferHistoric = false;
  return html;
}

// ---------- Edición concreta ----------
async function viewEdition(year, opts) {
  year = Number(year);
  const hist = WORLDS_HISTORY.find((w) => w.year === year);
  const finished = !!hist;
  const pageUrl = api.leaguepediaUrl(hist?.page || `${year} Season World Championship`);

  let matches;
  preferHistoric = finished;   // ediciones terminadas: escudos de esa época (Leaguepedia)
  try {
    await loadShorts();
    matches = await api.getWorldsMatches(year, { force: opts.refresh && !finished });
    if (matches) matches = applyLolesports(matches);
    if (matches == null) {
      return headerEdition(year, hist) + `<div class="state"><p>Los partidos de este Mundial aún no se han descargado.</p>
        <p class="muted">Se añaden en la próxima actualización automática (cada 10 minutos).</p>
        <p><a href="${pageUrl}" target="_blank" rel="noopener">Ver en Leaguepedia ↗</a></p></div>`;
    }
  } catch (err) {
    return headerEdition(year, hist) + errorBox(err, `<p><a href="${pageUrl}" target="_blank" rel="noopener">Ver la edición en Leaguepedia ↗</a></p>`);
  }

  if (matches.some((m) => m.state === 'live')) liveNow = true;

  let computed = null;
  if (!hist) {
    const finalM = matches.filter((m) => /^finals?$/i.test(m.tab) && m.state === 'done').pop();
    if (finalM) {
      const w = finalM.winner || (finalM.score1 > finalM.score2 ? 1 : 2);
      computed = { champion: w === 1 ? finalM.team1 : finalM.team2, runnerUp: w === 1 ? finalM.team2 : finalM.team1,
        score: `${Math.max(finalM.score1, finalM.score2)}–${Math.min(finalM.score1, finalM.score2)}` };
    }
  }

  if (!matches.length) {
    return headerEdition(year, hist, computed) + `<div class="state"><p>Todavía no hay partidos publicados para este Mundial.</p>
      <p><a href="${pageUrl}" target="_blank" rel="noopener">Ver en Leaguepedia ↗</a></p></div>`;
  }

  const [rosters, champStats, games] = await Promise.all([api.getFinalRosters(year), api.getChampionStats(year), api.getGames(year)]);
  if (rosters) finalRosters[year] = rosters;
  seriesLink = games?.length ? (m) => (m.state === 'done' && findSeries(games, m) ? seriesHref(year, m) : '') : null;
  const phases = buildPhases(matches, year);
  const focus = matches.find((m) => m.state === 'live') || matches.find((m) => m.state === 'upcoming');
  const active = (focus && phases.find((ph) => ph.matches.includes(focus))?.name)
    || phases.find((ph) => ph.name === 'Eliminatorias')?.name
    || phases[phases.length - 1].name;

  const tabsNav = phases.map((ph) => `<button class="chip ${ph.name === active ? 'chip--on' : ''}" data-stage="${esc(ph.name)}">${esc(ph.name)}</button>`).join('')
    + (champStats?.champions?.length ? `<button class="chip chip--alt" data-stage="Campeones">Campeones</button>` : '');
  const panels = phases.map((ph) => `<div class="stage" data-stage="${esc(ph.name)}" ${ph.name === active ? '' : 'hidden'}>
      ${ph.name === 'Eliminatorias' ? renderKnockout(ph.matches, year, hist) : renderRounds(ph.matches)}
    </div>`).join('')
    + (champStats?.champions?.length ? `<div class="stage" data-stage="Campeones" hidden>${renderChampions(champStats)}</div>` : '');

  const calBtn = icsButton(matches, `Mundial ${year}`, (m) => `Mundial ${year} · ${tabEs(m.tab)}`);
  const html = headerEdition(year, hist, computed, matches) + `
    <div class="chips" id="stageChips">${tabsNav}${calBtn ? `<span class="chips__end">${calBtn}</span>` : ''}</div>
    ${panels}
    <p class="muted small source">Datos: <a href="${pageUrl}" target="_blank" rel="noopener">Leaguepedia</a> (CC BY-SA).</p>`;
  preferHistoric = false;
  seriesLink = null;
  return html;
}

// ---------- Mundial: fases, rondas, cuadro y final ----------
const KO_TAB = /^(round of 16|quarterfinals|semifinals|finals?|grand finals?|5th place|3rd place|third place)$/i;
const FINAL_TAB = /^(grand )?finals?$/i;
const PLACE_TAB = /place$/i;
const PHASE_ORDER = ['Clasificatorios', 'Play-In', 'Fase de grupos', 'Fase suiza', 'Eliminatorias'];

/** Reparte los partidos en fases: clasificatorios, play-in, grupos/suiza y eliminatorias. */
function buildPhases(matches, year) {
  // Stages con cuartos de final: ahí las "Round N" son de grupos/suiza; sin ellos (2011) son del cuadro
  const stagesWithQF = new Set(matches.filter((m) => /quarterfinals/i.test(m.tab)).map((m) => m.page));
  const phaseOf = (m) => {
    if (/qualifier/i.test(m.page)) return 'Clasificatorios';
    if (/play-in/i.test(m.page)) return 'Play-In';
    if (KO_TAB.test(m.tab)) return 'Eliminatorias';
    if (/^round \d+$/i.test(m.tab) && !stagesWithQF.has(m.page) && matches.some((x) => x.page === m.page && /group stage/i.test(x.tab))) return 'Eliminatorias';
    return year >= 2023 ? 'Fase suiza' : 'Fase de grupos';
  };
  const map = new Map();
  for (const m of matches) {
    const ph = phaseOf(m);
    if (!map.has(ph)) map.set(ph, []);
    map.get(ph).push(m);
  }
  return [...map.entries()]
    .sort((a, b) => PHASE_ORDER.indexOf(a[0]) - PHASE_ORDER.indexOf(b[0]))
    .map(([name, list]) => ({ name, matches: list }));
}

/** Agrupa por ronda (pestaña de Leaguepedia), ordenadas por fecha del primer partido. */
function groupRounds(list) {
  const map = new Map();
  for (const m of list) {
    const key = m.tab || 'Partidos';
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(m);
  }
  const first = (ms) => Math.min(...ms.map((m) => (m.date ? m.date.getTime() : Infinity)));
  return [...map.entries()]
    .map(([tab, ms]) => ({ tab, matches: ms.sort((a, b) => (a.date || 0) - (b.date || 0)) }))
    .sort((a, b) => first(a.matches) - first(b.matches));
}

function dateRange(ms) {
  const ds = ms.map((m) => m.date).filter(Boolean).sort((a, b) => a - b);
  if (!ds.length) return '';
  const a = fmtDate(ds[0]); const b = fmtDate(ds[ds.length - 1]);
  return a === b ? a : `${a} – ${b}`;
}

const CAL_SVG = '<svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true"><rect x="1.5" y="2.5" width="13" height="12" rx="2" fill="none" stroke="currentColor" stroke-width="1.4"/><path d="M1.5 6.5h13M5 1v3M11 1v3M8 8.5v4M6 10.5h4" stroke="currentColor" stroke-width="1.4" fill="none"/></svg>';

// ---------- campeones ----------
const ROLE_ES = { top: 'TOP', jungle: 'JNG', mid: 'MID', bot: 'ADC', adc: 'ADC', support: 'SUP' };
function champIcon(name, cls = 'champ') {
  const id = ddragon.ids?.[norm(name)];
  const title = esc(name || '');
  if (id && ddragon.version) {
    return `<img class="${cls}" src="https://ddragon.leagueoflegends.com/cdn/${esc(ddragon.version)}/img/champion/${esc(id)}.png" alt="${title}" title="${title}" loading="lazy">`;
  }
  return `<span class="${cls} ${cls}--txt" title="${title}">${esc(String(name || '?').replace(/[^A-Za-z]/g, '').slice(0, 2))}</span>`;
}

/** Plantillas de los dos equipos de la Gran Final (campeón primero). */
function renderRosters(year, champion) {
  const r = finalRosters[year];
  if (!r || !Object.keys(r).length) return '';
  const teams = Object.keys(r).sort((a, b) => (api.canonTeam(b) === api.canonTeam(champion)) - (api.canonTeam(a) === api.canonTeam(champion)));
  return `<div class="rosters">${teams.map((t) => {
    const isChamp = champion && api.canonTeam(t) === api.canonTeam(champion);
    return `<div class="roster ${isChamp ? 'is-champion' : ''}">
      <a class="roster__head" href="${teamHref(t)}">${teamBadge(t)}<span>${esc(displayName(t))}</span>${isChamp ? '<b>♛ Campeón</b>' : '<b class="muted">Subcampeón</b>'}</a>
      ${r[t].map((p) => `<div class="roster__row">
        <span class="roster__role">${ROLE_ES[String(p.role).toLowerCase()] || esc(p.role)}</span>
        <a class="roster__player" href="${playerHref(p.player)}" title="${esc(p.player)}">${esc(displayName(p.player))}</a>
        <span class="roster__champs">${p.champions.map((c) => champIcon(c, 'champ champ--sm')).join('')}</span>
        <span class="roster__kda" title="Asesinatos / muertes / asistencias en la final">${p.k}/${p.d}/${p.a}</span>
      </div>`).join('')}
    </div>`;
  }).join('')}</div>`;
}

/** Pestaña "Campeones" de un Mundial. */
function renderChampions(stats) {
  if (!stats?.champions?.length) return '<div class="state"><p>Todavía no hay estadísticas de campeones de este Mundial.</p></div>';
  const g = stats.games || 1;
  const list = stats.champions;
  const top = list.slice(0, 10);
  const rest = list.slice(10);
  const pct = (n) => Math.round((n / g) * 100);
  const wr = (c) => (c.picks ? Math.round((c.wins / c.picks) * 100) + '%' : '—');
  return `<p class="muted champs__intro">${stats.games} partidas · ${list.length} campeones distintos${stats.bans ? '' : ' · sin datos de vetos'}.
      Presencia = partidas en las que fue elegido o vetado.</p>
    <div class="champs">${top.map((c, i) => `<div class="champcard">
      <span class="champcard__rank">${i + 1}</span>${champIcon(c.champion, 'champ champ--lg')}
      <div class="champcard__body"><b>${esc(c.champion)}</b>
        <span class="champcard__bar"><i style="width:${Math.min(100, pct(c.picks + c.bans))}%"></i></span>
        <span class="champcard__nums"><b>${Math.min(100, pct(c.picks + c.bans))}%</b> presencia · ${c.picks} elegido · ${c.bans} vetado · ${wr(c)} victorias</span></div>
    </div>`).join('')}</div>
    ${rest.length ? `<details class="champs__more"><summary>Ver los otros ${rest.length} campeones</summary>
      <table class="table table--champs"><thead><tr><th>Campeón</th><th>Presencia</th><th>Elegido</th><th>Vetado</th><th>Victorias</th></tr></thead><tbody>
      ${rest.map((c) => `<tr><td><span class="champrow">${champIcon(c.champion, 'champ champ--sm')}${esc(c.champion)}</span></td><td>${Math.min(100, pct(c.picks + c.bans))}%</td><td>${c.picks}</td><td>${c.bans}</td><td>${wr(c)}</td></tr>`).join('')}
      </tbody></table></details>` : ''}`;
}

/** Tarjeta compacta de partido: dos filas (equipo · marcador), ganador resaltado. */
function matchCard(m, { showDate = true, label = '' } = {}) {
  const live = m.state === 'live';
  const done = m.state === 'done';
  const hasScore = done || (live && (m.score1 != null || m.score2 != null));
  const win = done ? (m.winner || (m.score1 > m.score2 ? 1 : m.score2 > m.score1 ? 2 : 0)) : 0;
  const row = (team, score, n) => `<div class="mcard__team ${win === n ? 'is-win' : win ? 'is-lose' : ''}${isFav(team) ? ' is-fav' : ''}">
      ${teamBadge(team)}${isTbd(team) ? '<span class="mcard__name">Por decidir</span>'
        : `<a class="mcard__name" href="${teamHref(team)}" title="${esc(team)}">${esc(displayName(team))}</a>`}
      <span class="mcard__score">${hasScore ? (score ?? 0) : ''}</span></div>`;
  const when = live ? '<span class="tag tag--live">EN JUEGO</span>'
    : m.state === 'pending' ? '<span>Pendiente de resultado</span>'
    : `<span>${showDate && m.date ? fmtDate(m.date) + (done ? '' : ' · ' + fmtTime(m.date)) : (m.date && !done ? fmtTime(m.date) : '')}</span>`;
  const key = `${m.team1}|${m.team2}|${m.date ? m.date.getTime() : ''}`;
  const side = [label, m.bestOf ? 'Bo' + m.bestOf : ''].filter(Boolean).join(' · ');
  const cal = m.state === 'upcoming' && m.date && m.date > Date.now() && !isTbd(m.team1) && !isTbd(m.team2)
    ? `<a class="mcard__cal" href="${esc(gcalUrl(m, label))}" target="_blank" rel="noopener" title="Añadir a Google Calendar" aria-label="Añadir a Google Calendar">${CAL_SVG}</a>` : '';
  const fav = isFav(m.team1) || isFav(m.team2);
  const liveLine = live ? liveStatsHtml(m) : '';
  const more = seriesLink ? seriesLink(m) : '';
  const moreHtml = more ? `<a class="mcard__more" href="${esc(more)}" title="Partidas, campeones y jugadores de la serie">Detalle ›</a>` : '';
  return `<div class="mcard ${live ? 'mcard--live' : ''}${fav ? ' mcard--fav' : ''}" data-k="${esc(key)}" data-s="${hasScore ? `${m.score1 ?? 0}-${m.score2 ?? 0}` : ''}">
    <div class="mcard__meta">${when}<span class="mcard__label" title="${esc(side)}">${esc(side)}</span>${cal}${moreHtml}</div>
    ${row(m.team1, m.score1, 1)}${row(m.team2, m.score2, 2)}
    ${liveLine}
  </div>`;
}

/** Partida en curso: asesinatos, oro, torres, dragones y barones (si lolesports los publica). */
function liveStatsHtml(m) {
  const st = m.stats;
  const n = st?.game || m.currentGame;
  if (!st) return n ? `<div class="mcard__live"><span>Partida ${n} en juego</span></div>` : '';
  const k = (v) => (v >= 1000 ? (v / 1000).toLocaleString('es-ES', { maximumFractionDigits: 1 }) + 'k' : v);
  const [g1, g2] = st.gold;
  const share = g1 + g2 ? (g1 / (g1 + g2)) * 100 : 50;
  const diff = g1 - g2;
  const item = (icon, title, [x, y]) => `<span title="${title}">${icon} ${x}–${y}</span>`;
  return `<div class="mcard__live">
    <span class="mcard__game" title="${st.state === 'finished' ? 'Partida terminada; la siguiente aún no ha empezado' : 'Partida en curso'}">P${n}${st.state === 'finished' ? ' · fin' : ''}</span>
    ${item('⚔', 'Asesinatos', st.kills)}${item('♜', 'Torres', st.towers)}${item('🐉', 'Dragones', st.dragons)}${st.barons.some(Boolean) ? item('◆', 'Barones', st.barons) : ''}
    <span class="goldbar" title="Oro: ${g1.toLocaleString('es-ES')} – ${g2.toLocaleString('es-ES')}"><i style="width:${share}%"></i></span>
    <span class="mcard__gold" title="Diferencia de oro">${diff === 0 ? '=' : (diff > 0 ? '▲ ' : '▼ ') + k(Math.abs(diff))}</span>
  </div>`;
}

function renderRounds(list) {
  return groupRounds(list).map(({ tab, matches: ms }) => `<section class="round">
      <header class="round__head">
        <h3 class="round__title">${esc(tabEs(tab))}</h3>
        <span class="round__meta">${dateRange(ms)} · ${ms.length} ${ms.length === 1 ? 'partido' : 'partidos'}</span>
      </header>
      <div class="round__grid">${ms.map((m) => matchCard(m)).join('')}</div>
    </section>`).join('');
}

const TROPHY_SVG = `<svg class="final__cup" viewBox="0 0 64 64" aria-hidden="true"><path d="M20 8h24v14c0 9-5.4 15-12 15s-12-6-12-15V8z" fill="none" stroke="currentColor" stroke-width="2.5"/><path d="M20 13h-8c0 8 3.5 12 9 13M44 13h8c0 8-3.5 12-9 13" fill="none" stroke="currentColor" stroke-width="2.5"/><path d="M32 37v9M24 56h16M27 46h10l2 10H25z" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linejoin="round"/></svg>`;

function renderFinal(m, year, hist) {
  // El campeón siempre a la izquierda
  if (m.state === 'done' && (m.winner === 2 || (!m.winner && m.score2 > m.score1))) {
    m = { ...m, team1: m.team2, team2: m.team1, score1: m.score2, score2: m.score1, winner: 1 };
  }
  const done = m.state === 'done';
  const live = m.state === 'live';
  const win = done ? (m.winner || (m.score1 > m.score2 ? 1 : 2)) : 0;
  const side = (team, n) => `<div class="final__team ${win === n ? 'is-champion' : win ? 'is-runnerup' : ''}">
      <div class="final__logo">${teamBadge(team)}</div>
      <div class="final__name">${isTbd(team) ? 'Por decidir' : `<a href="${teamHref(team)}">${esc(displayName(team))}</a>`}</div>
      <div class="final__role">${win === n ? '♛ Campeón' : win ? 'Subcampeón' : '&nbsp;'}</div>
    </div>`;
  const center = done || live
    ? `<div class="final__score ${live ? 'is-live' : ''}">${m.score1 ?? 0}<i>–</i>${m.score2 ?? 0}</div>`
    : `<div class="final__score final__score--tbd">${m.date ? fmtTime(m.date) : 'vs'}</div>`;
  const where = hist ? `${hist.city}, ${hist.host}` : '';
  const when = m.date ? new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'long', year: 'numeric' }).format(m.date) : '';
  return `<section class="final">
    ${TROPHY_SVG}
    <div class="final__label">${live ? '<span class="tag tag--live">EN JUEGO</span> ' : ''}Gran Final · Mundial ${year}</div>
    <div class="final__meta">${esc([when, where, m.bestOf ? 'al mejor de ' + m.bestOf : ''].filter(Boolean).join(' · '))}</div>
    <div class="final__match">${side(m.team1, 1)}${center}${side(m.team2, 2)}</div>
    ${done ? finalVideo(year, m) : ''}
    ${done ? renderRosters(year, m.team1) : ''}
    ${done && seriesLink?.(m) ? `<a class="btn final__more" href="${esc(seriesLink(m))}">Ver la final partida a partida →</a>` : ''}
  </section>`;
}

/** Vídeo de la final: miniatura que carga YouTube solo al pulsar, y un botón por partida.
 *  Si Leaguepedia no tiene el vídeo, enlace a la búsqueda en el canal de LoL Esports. */
function finalVideo(year, m) {
  const games = vods[year]?.games || [];
  if (!games.length) {
    const q = encodeURIComponent(`Worlds ${year} Final ${displayName(m.team1)} vs ${displayName(m.team2)}`);
    return `<div class="fvideo fvideo--search">
      <a class="btn" href="https://www.youtube.com/@lolesports/search?query=${q}" target="_blank" rel="noopener">▶ Buscar la final en el canal de LoL Esports</a>
    </div>`;
  }
  const g = games[0];
  return `<div class="fvideo">
    <div class="fvideo__player" data-yt="${esc(g.id)}" data-start="${g.start || 0}">
      <button class="fvideo__thumb" type="button" aria-label="Reproducir la partida ${g.n} de la final">
        <img src="https://i.ytimg.com/vi/${esc(g.id)}/hqdefault.jpg" alt="" loading="lazy">
        <span class="fvideo__play" aria-hidden="true"></span>
        <span class="fvideo__cap">Gran Final ${year} · Partida <b>${g.n}</b></span>
      </button>
    </div>
    <div class="fvideo__games">
      ${games.map((x, i) => `<button type="button" class="chip fvideo__game ${i === 0 ? 'chip--on' : ''}" data-yt="${esc(x.id)}" data-start="${x.start || 0}" data-n="${x.n}">Partida ${x.n}</button>`).join('')}
      <a class="fvideo__yt" href="https://www.youtube.com/watch?v=${esc(g.id)}${g.start ? '&t=' + g.start + 's' : ''}" target="_blank" rel="noopener">Ver en YouTube ↗</a>
    </div>
  </div>`;
}

function playVideo(player, id, start) {
  const src = `https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}?autoplay=1&rel=0${start ? '&start=' + start : ''}`;
  player.innerHTML = `<iframe src="${src}" title="Vídeo de la final" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen></iframe>`;
}

/** Cuadro de eliminatorias alineado: cada partido queda a la altura del que alimenta en la ronda siguiente. */
function renderKnockout(list, year, hist) {
  const rounds = groupRounds(list);
  const finalR = rounds.find((r) => FINAL_TAB.test(r.tab));
  const places = rounds.filter((r) => PLACE_TAB.test(r.tab));
  const cols = rounds.filter((r) => r !== finalR && !places.includes(r)).map((r) => ({ ...r, matches: [...r.matches] }));

  // Ordenar de derecha a izquierda: cada partido junto al de la ronda siguiente en el que juega su ganador
  const feeds = (m, next) => {
    const w = m.state === 'done' ? (m.winner === 2 || (!m.winner && m.score2 > m.score1) ? m.team2 : m.team1) : null;
    const i = next.findIndex((n) => (w && (n.team1 === w || n.team2 === w)) || [m.team1, m.team2].some((t) => !isTbd(t) && (n.team1 === t || n.team2 === t)));
    return i === -1 ? 99 : i;
  };
  const target = finalR ? [finalR.matches[finalR.matches.length - 1]] : null;
  for (let i = cols.length - 1; i >= 0; i--) {
    const next = i === cols.length - 1 ? target : cols[i + 1].matches;
    if (next) cols[i].matches.sort((a, b) => feeds(a, next) - feeds(b, next));
  }

  const finalM = finalR ? finalR.matches[finalR.matches.length - 1] : null;
  const finalHtml = finalM ? renderFinal(finalM, year, hist) : '';
  // El cuadro termina en la final (tarjeta pequeña); la grande va arriba
  const columns = finalM ? [...cols, { tab: finalR.tab, matches: [finalM], isFinal: true }] : cols;
  const bracket = cols.length ? `<h2 class="h2 h2--small">Camino a la final</h2>
    <div class="bracket" style="--cols:${columns.length}">
      ${columns.map((c, i) => {
        const next = columns[i + 1];
        const paired = next && next.matches.length * 2 === c.matches.length;   // corchetes solo si encajan 2→1
        const fed = i > 0 && columns[i - 1].matches.length === c.matches.length * 2;
        return `<div class="bracket__col">
          <h4 class="bracket__title">${esc(tabEs(c.tab))}<span>${dateRange(c.matches)}</span></h4>
          <div class="bracket__list">${c.matches.map((m, j) => `<div class="bracket__cell${paired ? (j % 2 ? ' is-pair-bottom' : ' is-pair-top') : ''}${fed ? ' is-fed' : ''}">
              <div class="bracket__card${c.isFinal ? ' is-final' : ''}">${matchCard(m)}</div></div>`).join('')}</div>
        </div>`;
      }).join('')}
    </div>` : '';
  const placeHtml = places.length ? renderRounds(places.flatMap((r) => r.matches)) : '';
  return finalHtml + bracket + placeHtml;
}

function headerEdition(year, hist, computed, matches = []) {
  const info = hist || computed;
  const prev = year > 2011 ? `<a class="navlink" href="#/mundial/${year - 1}">← ${year - 1}</a>` : '<span></span>';
  const next = `<a class="navlink" href="#/mundial/${year + 1}">${year + 1} →</a>`;
  // Cifras de la edición (sin clasificatorios)
  const ms = matches.filter((m) => !/qualifier/i.test(m.page));
  const teams = new Set(ms.flatMap((m) => [m.team1, m.team2]).filter((t) => !isTbd(t)));
  const games = ms.reduce((n, m) => n + (m.score1 || 0) + (m.score2 || 0), 0);
  const days = new Set(ms.filter((m) => m.date).map((m) => m.date.toISOString().slice(0, 10)));
  const stat = (n, l) => `<div class="stat"><span class="stat__num">${n}</span><span class="stat__lbl">${l}</span></div>`;
  const stats = ms.length ? `<div class="stats">${stat(teams.size, 'equipos')}${stat(ms.length, 'series')}${games ? stat(games, 'partidas') : ''}${stat(days.size, 'días de competición')}</div>` : '';
  return `<div class="edition-nav">${prev}<a class="navlink" href="#/mundiales">Hemeroteca</a>${next}</div>
    <div class="hero hero--small hero--edition">
      ${info ? `<div class="hero__champ" data-tint="${esc(lpLogoUrl(info.champion))}">${teamBadge(info.champion)}</div>` : ''}
      <div class="hero__text">
        <div class="hero__label">Mundial ${year}${hist ? ` · ${esc(hist.city)}, ${esc(hist.host)}` : ''}</div>
        ${info ? `<h1 class="hero__title"><span class="crown">♛</span> ${esc(displayName(info.champion))}</h1>
          <p class="hero__sub">Campeón del mundo · Final: ${info.score} contra ${esc(displayName(info.runnerUp))}</p>`
        : `<h1 class="hero__title">Mundial ${year}</h1><p class="hero__sub">Edición en curso o por disputar. Los resultados se actualizan solos. <a href="#/pickem">🎯 Pick'em con tus amigos →</a></p>`}
        ${stats}
      </div>
    </div>`;
}

// =============================================================
//  FICHA DE EQUIPO
// =============================================================
const LEVELS = [
  { key: 'playin', label: 'Play-In', short: 'Play-In', n: 1 },
  { key: 'groups', label: 'Fase de grupos', short: 'Grupos', n: 2 },
  { key: 'ko', label: 'Eliminatorias', short: 'Elim.', n: 3 },
  { key: 'qf', label: 'Cuartos de final', short: 'Cuartos', n: 3 },
  { key: 'sf', label: 'Semifinales', short: 'Semis', n: 4 },
  { key: 'f', label: 'Subcampeón', short: 'Final', n: 5 },
  { key: 'champ', label: 'Campeón', short: 'Campeón', n: 6 },
];
const lvl = (k) => LEVELS.find((l) => l.key === k);

/** Hasta dónde llegó un equipo en un Mundial. */
function worldsPlacement(yearMatches, names, year) {
  const own = yearMatches.filter((m) => inNames(m.team1, names) || inNames(m.team2, names));
  if (!own.length) return null;
  const hist = WORLDS_HISTORY.find((w) => w.year === year);
  const final = own.find((m) => /^(grand )?finals?$/i.test(m.tab));
  if (final && final.state === 'done') {
    const won = inNames(winnerOf(final) === 1 ? final.team1 : final.team2, names);
    return lvl(won ? 'champ' : 'f');
  }
  if (hist && inNames(hist.champion, names)) return lvl('champ');
  if (final) return lvl('f');
  if (own.some((m) => /semifinals/i.test(m.tab))) return lvl('sf');
  if (own.some((m) => /quarterfinals|round of 16/i.test(m.tab))) return lvl('qf');
  const ph = buildPhases(yearMatches, year);
  const phaseOfM = (m) => ph.find((p) => p.matches.includes(m))?.name;
  if (own.some((m) => phaseOfM(m) === 'Eliminatorias')) return lvl('ko');
  if (own.some((m) => ['Fase de grupos', 'Fase suiza'].includes(phaseOfM(m)))) return { ...lvl('groups'), label: year >= 2023 ? 'Fase suiza' : 'Fase de grupos', short: year >= 2023 ? 'Suiza' : 'Grupos' };
  return lvl('playin');
}

async function viewTeam(rawName, opts) {
  const name = decodeURIComponent(rawName || '');
  await loadShorts();
  const all = applyLolesports(await api.getAllMatches());
  const canon = api.canonTeam(name);
  const names = api.teamNames(canon);
  const ms = all.filter((m) => inNames(m.team1, names) || inNames(m.team2, names));
  if (!ms.length) {
    return `<div class="state"><p><strong>No hay datos de «${esc(name)}».</strong></p>
      <p class="muted">Solo hay fichas de equipos que han jugado un Mundial o las ligas de la web en las últimas temporadas.</p>
      <a class="btn" href="#/mundiales">Ir a la hemeroteca</a></div>`;
  }
  const us = (m) => (inNames(m.team1, names) ? 1 : 2);
  const done = ms.filter((m) => m.state === 'done');
  const wins = done.filter((m) => winnerOf(m) === us(m)).length;
  const losses = done.length - wins;
  const games = done.reduce((a, m) => { const mine = us(m) === 1 ? m.score1 : m.score2; const theirs = us(m) === 1 ? m.score2 : m.score1; a.w += mine || 0; a.l += theirs || 0; return a; }, { w: 0, l: 0 });

  // Mundiales: trayectoria por año
  const byYear = new Map();
  for (const m of all) if (m.kind === 'worlds') { if (!byYear.has(m.year)) byYear.set(m.year, []); byYear.get(m.year).push(m); }
  const path = [...byYear.entries()].map(([y, list]) => ({ year: y, place: worldsPlacement(list, names, y) })).filter((x) => x.place).sort((a, b) => a.year - b.year);
  const titles = path.filter((x) => x.place.key === 'champ').map((x) => x.year);
  const finalsLost = path.filter((x) => x.place.key === 'f').map((x) => x.year);

  // Títulos de liga (finales ganadas en los torneos de liga descargados)
  const leagueTitles = done.filter((m) => m.kind === 'league' && /^(grand )?finals?$/i.test(m.tab) && winnerOf(m) === us(m));

  // Rivales más habituales
  const rivals = new Map();
  for (const m of done) {
    const opp = api.canonTeam(us(m) === 1 ? m.team2 : m.team1);
    const r = rivals.get(opp) || { name: opp, w: 0, l: 0 };
    winnerOf(m) === us(m) ? r.w++ : r.l++;
    rivals.set(opp, r);
  }
  const topRivals = [...rivals.values()].sort((a, b) => (b.w + b.l) - (a.w + a.l)).slice(0, 6);

  const upcoming = ms.filter((m) => m.state === 'upcoming' || m.state === 'live');
  const recent = done.slice(-8).reverse();
  const label = (m) => [m.comp, m.kind === 'worlds' ? tabEs(m.tab) : ''].filter(Boolean).join(' · ');
  const fav = getFav() === canon;
  const stat = (n, l) => `<div class="stat"><span class="stat__num">${n}</span><span class="stat__lbl">${l}</span></div>`;
  const aliases = names.filter((n) => n !== canon && ms.some((m) => inNames(m.team1, [n]) || inNames(m.team2, [n])));
  const maxN = 6;
  const playersHtml = await teamPlayersHtml(names).catch(() => '');

  const html = `<div class="hero hero--small hero--edition hero--team">
      <div class="hero__champ" data-tint="${esc(lpLogoUrl(canon) || names.map(lpLogoUrl).find(Boolean) || '')}">${teamBadge(canon)}</div>
      <div class="hero__text">
        <div class="hero__label">Equipo${shorts[canon] ? ' · ' + esc(shorts[canon]) : ''}</div>
        <h1 class="hero__title">${esc(displayName(canon))}</h1>
        <p class="hero__sub">${aliases.length ? `También como ${aliases.map(esc).join(', ')} · ` : ''}${titles.length ? `♛ Campeón del mundo ${titles.length > 1 ? titles.length + ' veces' : ''} (${titles.join(', ')})` : path.length ? `${path.length} ${path.length === 1 ? 'Mundial' : 'Mundiales'} disputados` : 'Ligas'}</p>
        <div class="stats">
          ${stat(titles.length, titles.length === 1 ? 'título mundial' : 'títulos mundiales')}
          ${stat(path.length, path.length === 1 ? 'Mundial' : 'Mundiales')}
          ${stat(`${wins}–${losses}`, 'series ganadas–perdidas')}
          ${done.length ? stat(Math.round((wins / done.length) * 100) + '%', 'de victorias') : ''}
          ${games.w + games.l ? stat(`${games.w}–${games.l}`, 'partidas') : ''}
        </div>
        <div class="hero__actions">
          <button class="btn btn--small ${fav ? 'btn--on' : ''}" type="button" data-fav="${esc(canon)}">${fav ? '★ Tu equipo' : '☆ Marcar como mi equipo'}</button>
          <a class="btn btn--small" href="#/cara/${encodeURIComponent(canon)}">⚔ Cara a cara</a>
        </div>
      </div>
    </div>

    ${path.length ? `<h2 class="h2"><span>Trayectoria en los Mundiales</span></h2>
    <div class="path" style="--n:${path.length}">
      ${path.map((x) => `<a class="path__col lv-${x.place.key}" href="#/mundial/${x.year}" title="Mundial ${x.year}: ${esc(x.place.label)}">
        <span class="path__lbl">${esc(x.place.short)}</span>
        <span class="path__bar" style="--h:${(x.place.n / maxN) * 100}%">${x.place.key === 'champ' ? '♛' : ''}</span>
        <span class="path__year">${x.year}</span></a>`).join('')}
    </div>
    <div class="path__legend muted small">${titles.length ? `♛ Campeón: ${titles.join(', ')}` : ''}${finalsLost.length ? `${titles.length ? ' · ' : ''}Subcampeón: ${finalsLost.join(', ')}` : ''}</div>` : ''}
    ${playersHtml}

    ${upcoming.length ? cardSection('Próximos partidos', upcoming.slice(0, 8), label, { live: upcoming.some((m) => m.state === 'live'), note: icsButton(upcoming, `Partidos de ${displayName(canon)}`) }) : ''}
    ${cardSection('Últimos resultados', recent, label, { empty: 'Sin resultados.' })}

    ${leagueTitles.length ? `<h2 class="h2"><span>Finales de liga ganadas</span></h2>
      <div class="cardgrid">${leagueTitles.reverse().map((m) => matchCard(m, { label: m.comp })).join('')}</div>` : ''}

    ${topRivals.length ? `<h2 class="h2"><span>Rivales más habituales</span></h2>
    <div class="rivals">${topRivals.map((r) => `<a class="rival" href="#/cara/${encodeURIComponent(canon)}/${encodeURIComponent(r.name)}">
        ${teamBadge(r.name)}<span class="rival__name">${esc(displayName(r.name))}</span>
        <span class="rival__rec"><b class="${r.w >= r.l ? 'pos-diff' : 'neg-diff'}">${r.w}–${r.l}</b><small>cara a cara →</small></span></a>`).join('')}</div>` : ''}
    <p class="muted small source">Datos: Leaguepedia y lolesports. Incluye todos los Mundiales y las dos últimas temporadas de las ligas de la web.</p>`;
  return html;
}

// =============================================================
//  CARA A CARA
// =============================================================
async function teamOptions() {
  const all = await api.getAllMatches();
  const count = new Map();
  for (const m of all) for (const t of [m.team1, m.team2]) if (!isTbd(t)) { const c = api.canonTeam(t); count.set(c, (count.get(c) || 0) + 1); }
  return [...count.entries()].sort((a, b) => b[1] - a[1]).map(([n]) => n);
}

async function viewH2H(rawA, rawB) {
  const a = rawA ? api.canonTeam(decodeURIComponent(rawA)) : '';
  const b = rawB ? api.canonTeam(decodeURIComponent(rawB)) : '';
  await loadShorts();
  const opts = await teamOptions();
  const form = `<form class="h2h-form" id="h2hForm" autocomplete="off">
      <input class="input" name="a" list="teamList" placeholder="Primer equipo" value="${esc(a)}" required>
      <span class="h2h-vs">vs</span>
      <input class="input" name="b" list="teamList" placeholder="Segundo equipo" value="${esc(b)}" required>
      <button class="btn btn--gold" type="submit">Comparar</button>
      <datalist id="teamList">${opts.map((n) => `<option value="${esc(n)}">`).join('')}</datalist>
    </form>`;
  const head = `<div class="hero hero--small">
      <div class="hero__label">Cara a cara</div>
      <h1 class="hero__title">${a && b ? `${esc(displayName(a))} <span class="muted">vs</span> ${esc(displayName(b))}` : 'Cara a cara'}</h1>
      <p class="hero__sub">Todos los enfrentamientos entre dos equipos en los Mundiales y en las ligas de la web.</p>
      ${form}
    </div>`;
  if (!a || !b) {
    const famous = [['T1', 'Gen.G'], ['T1', 'Bilibili Gaming'], ['G2 Esports', 'Fnatic'], ['T1', 'Dplus Kia'], ['Gen.G', 'Hanwha Life Esports'], ['EDward Gaming', 'Royal Never Give Up']];
    return head + `<h2 class="h2"><span>Duelos clásicos</span></h2><div class="rivals">${famous.map(([x, y]) => `<a class="rival rival--duo" href="#/cara/${encodeURIComponent(x)}/${encodeURIComponent(y)}">
      ${teamBadge(x)}<span class="rival__name">${esc(x)} <span class="muted">vs</span> ${esc(y)}</span>${teamBadge(y)}</a>`).join('')}</div>`;
  }
  const all = applyLolesports(await api.getAllMatches());
  const na = api.teamNames(a); const nb = api.teamNames(b);
  const ms = all.filter((m) => (inNames(m.team1, na) && inNames(m.team2, nb)) || (inNames(m.team1, nb) && inNames(m.team2, na)));
  if (!ms.length) return head + `<div class="state"><p>No hay enfrentamientos registrados entre ${esc(a)} y ${esc(b)}.</p></div>`;
  const done = ms.filter((m) => m.state === 'done');
  const sideA = (m) => (inNames(m.team1, na) ? 1 : 2);
  const wa = done.filter((m) => winnerOf(m) === sideA(m)).length;
  const wb = done.length - wa;
  const ga = done.reduce((n, m) => n + ((sideA(m) === 1 ? m.score1 : m.score2) || 0), 0);
  const gb = done.reduce((n, m) => n + ((sideA(m) === 1 ? m.score2 : m.score1) || 0), 0);
  const worldsM = done.filter((m) => m.kind === 'worlds');
  const finals = done.filter((m) => /^(grand )?finals?$/i.test(m.tab));
  const label = (m) => [m.comp, tabEs(m.tab)].filter(Boolean).join(' · ');
  const side = (t, w, g, cls) => `<a class="h2h__team ${cls}" href="${teamHref(t)}">
      <span class="h2h__logo">${teamBadge(t)}</span><span class="h2h__name">${esc(displayName(t))}</span>
      <span class="h2h__wins">${w}</span><span class="h2h__sub">${g} partidas</span></a>`;
  return head + `<section class="h2h">
      ${side(a, wa, ga, wa > wb ? 'is-lead' : '')}
      <div class="h2h__mid"><span class="h2h__total">${done.length}</span><span class="h2h__sub">series</span>
        ${worldsM.length ? `<span class="h2h__chip">${worldsM.length} en Mundiales</span>` : ''}
        ${finals.length ? `<span class="h2h__chip h2h__chip--gold">${finals.length} ${finals.length === 1 ? 'final' : 'finales'}</span>` : ''}</div>
      ${side(b, wb, gb, wb > wa ? 'is-lead' : '')}
    </section>
    ${finals.length ? `<h2 class="h2 h2--small"><span>Finales</span></h2><div class="cardgrid">${finals.slice().reverse().map((m) => matchCard(m, { label: label(m) })).join('')}</div>` : ''}
    ${cardSection('Todos los enfrentamientos', ms.slice().reverse(), label)}`;
}

// =============================================================
//  RÉCORDS DE LOS MUNDIALES
// =============================================================
async function viewRecords() {
  await loadShorts();
  preferHistoric = true;
  const all = await api.getAllMatches();
  const wm = all.filter((m) => m.kind === 'worlds' && m.state === 'done');
  const hist = WORLDS_HISTORY;
  const org = (n) => api.canonTeam(n);

  const titles = new Map();
  for (const w of hist) titles.set(org(w.champion), [...(titles.get(org(w.champion)) || []), w.year]);
  const topTitles = [...titles.entries()].sort((a, b) => b[1].length - a[1].length)[0];

  let streak = { org: '', n: 0, from: 0, to: 0 };
  for (let i = 0; i < hist.length; i++) {
    let j = i;
    while (j + 1 < hist.length && org(hist[j + 1].champion) === org(hist[i].champion) && hist[j + 1].year === hist[j].year + 1) j++;
    if (j - i + 1 > streak.n) streak = { org: org(hist[i].champion), n: j - i + 1, from: hist[i].year, to: hist[j].year };
  }

  const years = new Map(); const wins = new Map(); const finalsCount = new Map();
  for (const m of wm) {
    for (const t of [m.team1, m.team2]) { const o = org(t); if (!years.has(o)) years.set(o, new Set()); years.get(o).add(m.year); }
    const w = org(winnerOf(m) === 1 ? m.team1 : m.team2);
    wins.set(w, (wins.get(w) || 0) + 1);
  }
  for (const w of hist) for (const t of [w.champion, w.runnerUp]) finalsCount.set(org(t), (finalsCount.get(org(t)) || 0) + 1);
  const top = (map, f = (v) => v) => [...map.entries()].sort((a, b) => f(b[1]) - f(a[1]))[0];
  const topYears = top(years, (v) => v.size);
  const topWins = top(wins);
  const topFinals = top(finalsCount);

  const close = hist.filter((w) => /3–2|2–1/.test(w.score) && (w.score === '3–2' || w.year === 2011));
  const sweeps = hist.filter((w) => w.score === '3–0');

  // Campeón más dominante: menos series perdidas en su Mundial
  const champRecord = hist.map((w) => {
    const names = api.teamNames(org(w.champion)).concat(w.champion);
    const own = wm.filter((m) => m.year === w.year && (inNames(m.team1, names) || inNames(m.team2, names)));
    const won = own.filter((m) => inNames(winnerOf(m) === 1 ? m.team1 : m.team2, names)).length;
    return { w, won, lost: own.length - won };
  }).filter((x) => x.won + x.lost > 0);
  const dominant = champRecord.slice().sort((a, b) => a.lost - b.lost || b.won - a.won)[0];
  const suffered = champRecord.slice().sort((a, b) => b.lost - a.lost)[0];

  const regionFinals = {};
  for (const w of hist) for (const r of [w.champRegion, w.runnerRegion]) regionFinals[r] = (regionFinals[r] || 0) + 1;
  const totalGames = wm.reduce((n, m) => n + (m.score1 || 0) + (m.score2 || 0), 0);

  const card = (title, value, holderHtml, detail) => `<div class="rec">
      <div class="rec__title">${title}</div><div class="rec__value">${value}</div>${holderHtml || ''}<div class="rec__detail">${detail || ''}</div></div>`;
  const holder = (name) => `<a class="rec__holder" href="${teamHref(name)}">${teamBadge(name)}<span>${esc(displayName(name))}</span></a>`;
  // Campeones (personajes) sumando todos los Mundiales con estadísticas
  const champTotals = new Map(); let champGames = 0; let champYears = 0;
  for (const w of hist) {
    const st = await api.getChampionStats(w.year);
    if (!st?.champions?.length) continue;
    champYears++; champGames += st.games || 0;
    for (const c of st.champions) {
      const t = champTotals.get(c.champion) || { champion: c.champion, picks: 0, wins: 0, bans: 0, years: 0 };
      t.picks += c.picks; t.wins += c.wins; t.bans += c.bans; t.years++;
      champTotals.set(c.champion, t);
    }
  }
  const champsAll = [...champTotals.values()];
  const mostPicked = champsAll.slice().sort((a, b) => b.picks - a.picks)[0];
  const mostBanned = champsAll.slice().sort((a, b) => b.bans - a.bans)[0];
  const bestWr = champsAll.filter((c) => c.picks >= 50).sort((a, b) => b.wins / b.picks - a.wins / a.picks)[0];
  const champHolder = (c) => `<span class="rec__holder">${champIcon(c.champion, 'champ champ--sm')}<span>${esc(c.champion)}</span></span>`;
  const champCards = champYears ? [
    mostPicked ? card('Campeón más elegido', mostPicked.picks, champHolder(mostPicked), `partidas en ${mostPicked.years} Mundiales`) : '',
    mostBanned?.bans ? card('Campeón más vetado', mostBanned.bans, champHolder(mostBanned), 'vetos en todos los Mundiales') : '',
    bestWr ? card('Mejor % de victorias', Math.round((bestWr.wins / bestWr.picks) * 100) + '%', champHolder(bestWr), `en ${bestWr.picks} partidas (mínimo 50)`) : '',
  ].join('') : '';
  const yearsLinks = (ws) => ws.map((w) => `<a href="#/mundial/${w.year}">${w.year}</a>`).join(' · ');

  const html = `<div class="hero hero--small">
      <div class="hero__label">Mundiales 2011 – ${hist[hist.length - 1].year}</div>
      <h1 class="hero__title">Récords</h1>
      <p class="hero__sub">Calculados con todas las series de los Mundiales (sin clasificatorios). Se actualizan solos con cada edición.</p>
      <div class="hero__actions"><a class="btn btn--small" href="#/evolucion">📊 Evolución del juego</a></div>
    </div>
    <div class="recs">
      ${card('Más títulos', topTitles[1].length, holder(topTitles[0]), topTitles[1].join(', '))}
      ${card('Más títulos seguidos', streak.n, holder(streak.org), `${streak.from} – ${streak.to}`)}
      ${card('Más Mundiales disputados', topYears[1].size, holder(topYears[0]), [...topYears[1]].sort().join(', '))}
      ${card('Más series ganadas', topWins[1], holder(topWins[0]), 'en todos los Mundiales')}
      ${card('Más finales disputadas', topFinals[1], holder(topFinals[0]), `${(titles.get(topFinals[0]) || []).length} ganadas`)}
      ${dominant ? card('Campeón más dominante', `${dominant.won}–${dominant.lost}`, holder(dominant.w.champion), `series en el Mundial <a href="#/mundial/${dominant.w.year}">${dominant.w.year}</a>`) : ''}
      ${suffered ? card('Campeón más sufrido', `${suffered.won}–${suffered.lost}`, holder(suffered.w.champion), `series en el Mundial <a href="#/mundial/${suffered.w.year}">${suffered.w.year}</a>`) : ''}
      ${card('Finales al límite', close.length, '', `Decididas en la última partida: ${yearsLinks(close)}`)}
      ${card('Finales sin historia', sweeps.length, '', `Ganadas 3–0: ${yearsLinks(sweeps)}`)}
      ${card('Partidas jugadas', totalGames.toLocaleString('es-ES'), '', `en ${wm.length.toLocaleString('es-ES')} series de ${hist.length} Mundiales`)}
      ${champCards}
    </div>
    <h2 class="h2"><span>Finales por región</span></h2>
    <div class="panel">${Object.entries(regionFinals).sort((a, b) => b[1] - a[1]).map(([r, n]) => `<div class="bar">
        <span class="bar__label">${esc(REGION_NAMES[r] || r)}</span>
        <span class="bar__track"><span class="bar__fill bar__fill--alt" style="width:${(n / (hist.length * 2)) * 100}%"></span></span>
        <span class="bar__val">${n}</span><span class="bar__years muted small">${hist.filter((w) => w.champRegion === r).length} ganadas · ${hist.filter((w) => w.runnerRegion === r).length} perdidas</span></div>`).join('')}</div>`;
  preferHistoric = false;
  return html;
}

/** Banda año a año con la región del campeón (hemeroteca). */
const REGION_COLORS = { KR: '#4FA3FF', CN: '#FF5A5F', EU: '#22D3A6', TW: '#F2A93B', NA: '#5B8CFF' };
function regionStrip() {
  const regions = [...new Set(WORLDS_HISTORY.map((w) => w.champRegion))];
  return `<section class="panel strip-panel">
    <h3 class="panel__title">Hegemonía por regiones</h3>
    <div class="strip">${WORLDS_HISTORY.map((w) => `<a class="strip__cell" href="#/mundial/${w.year}" style="--c:${REGION_COLORS[w.champRegion] || '#888'}" title="${w.year}: ${esc(w.champion)} (${esc(REGION_NAMES[w.champRegion] || w.champRegion)})">
        <span class="strip__year">${String(w.year).slice(2)}</span></a>`).join('')}</div>
    <div class="strip__legend">${regions.map((r) => `<span><i style="background:${REGION_COLORS[r] || '#888'}"></i>${esc(REGION_NAMES[r] || r)}</span>`).join('')}</div>
  </section>`;
}

// =============================================================
//  DETALLE DE UNA SERIE (partida a partida)
// =============================================================
const playerHref = (n) => `#/jugador/${encodeURIComponent(n)}`;
const seriesHref = (year, m) => `#/serie/${year}/${encodeURIComponent(m.team1)}/${encodeURIComponent(m.team2)}/${m.date ? m.date.getTime() : 0}`;
const lpDate = (s) => (s ? Date.parse(String(s).replace(' ', 'T') + 'Z') : NaN);
const sameTeamName = (a, b) => !!a && !!b && (norm(a) === norm(b) || api.canonTeam(a) === api.canonTeam(b));
const fmtLen = (sec) => (sec ? `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}` : '');
const fmtGold = (g) => (g >= 1000 ? (g / 1000).toLocaleString('es-ES', { maximumFractionDigits: 1 }) + 'k' : String(g || 0));
const kdaRatio = (k, d, a) => ((k + a) / Math.max(1, d)).toLocaleString('es-ES', { maximumFractionDigits: 1 });
const ytLink = (v) => `https://www.youtube.com/watch?v=${encodeURIComponent(v.id)}${v.start ? '&t=' + v.start + 's' : ''}`;

/** La serie de data/games que corresponde a un partido: mismos equipos y la fecha más cercana. */
function findSeries(games, m) {
  const cands = games.filter((s) => s.teams.length === 2 &&
    ((sameTeamName(s.teams[0], m.team1) && sameTeamName(s.teams[1], m.team2)) || (sameTeamName(s.teams[0], m.team2) && sameTeamName(s.teams[1], m.team1))));
  if (!cands.length) return null;
  if (!m.date) return cands[0];
  const dist = (s) => Math.abs((lpDate(s.date) || 0) - m.date.getTime());
  const best = cands.sort((x, y) => dist(x) - dist(y))[0];
  return dist(best) < 4 * 86400_000 ? best : null;
}

async function viewSeries(year, rawA, rawB, rawT) {
  year = Number(year);
  const a = decodeURIComponent(rawA || ''); const b = decodeURIComponent(rawB || ''); const t = Number(rawT) || 0;
  await loadShorts();
  preferHistoric = WORLDS_HISTORY.some((w) => w.year === year);
  const [matches, games] = await Promise.all([api.getWorldsMatches(year).catch(() => null), api.getGames(year)]);
  const probe = { team1: a, team2: b, date: t ? new Date(t) : null };
  const same = (x) => (sameTeamName(x.team1, a) && sameTeamName(x.team2, b)) || (sameTeamName(x.team1, b) && sameTeamName(x.team2, a));
  const m = (matches || []).filter(same).sort((x, y) => Math.abs((x.date || 0) - t) - Math.abs((y.date || 0) - t))[0] || probe;
  const s = games ? findSeries(games, m) : null;
  const nav = `<div class="edition-nav"><a class="navlink" href="#/mundial/${year}">← Mundial ${year}</a><span></span></div>`;

  const label = [`Mundial ${year}`, m.stage, m.tab ? tabEs(m.tab) : ''].filter(Boolean).join(' · ');
  const when = m.date ? new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'long', year: 'numeric' }).format(m.date) : '';
  const win = m.state === 'done' ? winnerOf(m) : 0;
  const side = (team, score, n) => `<a class="h2h__team ${win === n ? 'is-lead' : ''}" href="${teamHref(team)}">
      <span class="h2h__logo">${teamBadge(team)}</span><span class="h2h__name">${esc(displayName(team))}</span>
      <span class="h2h__wins">${score ?? ''}</span></a>`;
  const head = `${nav}<div class="hero hero--small">
      <div class="hero__label">${esc(label)}</div>
      <h1 class="hero__title">${esc(displayName(m.team1))} <span class="muted">vs</span> ${esc(displayName(m.team2))}</h1>
      <p class="hero__sub">${esc([when, m.bestOf ? 'al mejor de ' + m.bestOf : ''].filter(Boolean).join(' · '))}</p>
    </div>
    <section class="h2h series-head">${side(m.team1, m.score1, 1)}
      <div class="h2h__mid"><span class="h2h__sub">${esc(m.tab ? tabEs(m.tab) : 'Serie')}</span>${s ? `<span class="h2h__chip">${s.games.length} ${s.games.length === 1 ? 'partida' : 'partidas'}</span>` : ''}</div>
      ${side(m.team2, m.score2, 2)}</section>`;
  preferHistoric = false;
  if (!s) {
    return head + `<div class="state"><p>Leaguepedia todavía no tiene el detalle de las partidas de esta serie.</p>
      <p><a href="${api.leaguepediaUrl(m.page || worldsPage(year))}" target="_blank" rel="noopener">Ver en Leaguepedia ↗</a></p></div>`;
  }
  preferHistoric = WORLDS_HISTORY.some((w) => w.year === year);
  // Mejor KDA de la serie
  const tot = new Map();
  for (const g of s.games) g.p.forEach((line) => line.forEach(([pl, , , k, d, a2]) => {
    const x = tot.get(pl) || { pl, k: 0, d: 0, a: 0 }; x.k += k; x.d += d; x.a += a2; tot.set(pl, x);
  }));
  const mvp = [...tot.values()].sort((x, y) => (y.k + y.a) / Math.max(1, y.d) - (x.k + x.a) / Math.max(1, x.d))[0];
  const totalLen = s.games.reduce((n, g) => n + (g.len || 0), 0);
  const chips = [
    totalLen ? `<span class="h2h__chip">⏱ ${totalLen >= 3600 ? `${Math.floor(totalLen / 3600)} h ${Math.round((totalLen % 3600) / 60)} min` : Math.round(totalLen / 60) + ' min'} de juego</span>` : '',
    mvp ? `<a class="h2h__chip h2h__chip--gold" href="${playerHref(mvp.pl)}">Mejor KDA: ${esc(displayName(mvp.pl))} · ${mvp.k}/${mvp.d}/${mvp.a}</a>` : '',
  ].join('');
  const html = head + (chips ? `<div class="series-chips">${chips}</div>` : '') + s.games.map((g) => renderGame(g, m.team1)).join('') +
    `<p class="muted small source">Datos: <a href="${api.leaguepediaUrl(m.page || worldsPage(year))}" target="_blank" rel="noopener">Leaguepedia</a> (CC BY-SA). Campeones: Data Dragon (Riot Games).</p>`;
  preferHistoric = false;
  return html;
}
const worldsPage = (y) => (y <= 2013 ? `Season ${y - 2010} World Championship` : `${y} Season World Championship`);

/** Una partida: equipos (el primero de la serie a la izquierda), objetivos, oro, jugadores y vetos. */
function renderGame(g, leftTeam) {
  const L = sameTeamName(g.t[1], leftTeam) && !sameTeamName(g.t[0], leftTeam) ? 1 : 0;
  const order = [L, 1 - L];
  const sum = (i, idx) => (g.p[i] || []).reduce((n, p) => n + (p[idx] || 0), 0);
  const kills = order.map((i) => sum(i, 3));
  const gold = order.map((i) => sum(i, 6));
  const hasGold = gold[0] + gold[1] > 0;
  const hasCs = g.p.some((line) => line.some((p) => p[7]));
  const obj = (key) => (g[key] ? order.map((i) => g[key][i]) : null);
  const share = hasGold ? (gold[0] / (gold[0] + gold[1])) * 100 : 50;
  const teamHead = (i, right) => {
    const won = g.win === i + 1;
    return `<div class="gside ${right ? 'gside--r' : ''} ${won ? 'is-win' : 'is-lose'}">
      ${teamBadge(g.t[i])}<span class="gside__txt"><a href="${teamHref(g.t[i])}"><span class="gside__full">${esc(displayName(g.t[i]))}</span><span class="gside__short">${esc(shortOf(g.t[i]))}</span></a>
      <small><i class="sidedot sidedot--${i === 0 ? 'blue' : 'red'}"></i>Lado ${i === 0 ? 'azul' : 'rojo'}${won ? ' · <b>Victoria</b>' : ''}</small></span></div>`;
  };
  const objRow = (icon, title, v) => (v ? `<div class="gobj"><b>${v[0]}</b><span title="${title}">${icon} ${title}</span><b>${v[1]}</b></div>` : '');
  const line = (i) => `<div class="gline">${(g.p[i] || []).map(([pl, role, champ, k, d, a, gd, cs]) => `<div class="gline__row">
      ${champIcon(champ, 'champ')}
      <span class="gline__who"><a href="${playerHref(pl)}">${esc(displayName(pl))}</a><small>${ROLE_ES[String(role).toLowerCase()] || esc(role)} · ${esc(champ)}</small></span>
      <span class="gline__kda" title="Asesinatos / muertes / asistencias">${k}/${d}/${a}</span>
      ${hasCs ? `<span class="gline__cs" title="Súbditos">${cs}</span>` : ''}
      ${hasGold ? `<span class="gline__gold" title="Oro">${fmtGold(gd)}</span>` : ''}
    </div>`).join('')}</div>`;
  const bans = (i) => (g.bans?.[i]?.length ? `<div class="gbans"><span>Vetos</span>${g.bans[i].map((c) => champIcon(c, 'champ champ--sm champ--ban')).join('')}</div>` : '');
  return `<section class="game">
    <header class="game__head">
      <h3 class="game__title">Partida ${g.n || ''}</h3>
      <span class="game__meta">${[g.len ? '⏱ ' + fmtLen(g.len) : '', g.patch ? 'Parche ' + esc(g.patch) : ''].filter(Boolean).join(' · ')}</span>
      ${g.vod ? `<a class="game__vod" href="${esc(ytLink(g.vod))}" target="_blank" rel="noopener">▶ Ver la partida</a>` : ''}
    </header>
    <div class="game__top">${teamHead(order[0], false)}<div class="game__kills"><b>${kills[0]}</b><i>⚔</i><b>${kills[1]}</b></div>${teamHead(order[1], true)}</div>
    <div class="game__stats">
      ${hasGold ? `<div class="gobj gobj--gold"><b>${fmtGold(gold[0])}</b><span class="goldbar goldbar--big" title="Oro total"><i style="width:${share}%"></i></span><b>${fmtGold(gold[1])}</b></div>` : ''}
      ${objRow('♜', 'Torres', obj('towers'))}${objRow('🐉', 'Dragones', obj('dragons'))}${objRow('◆', 'Barones', obj('barons'))}
    </div>
    <div class="game__lines">
      ${order.map((i) => `<div class="gcol"><div class="gcol__head">${teamBadge(g.t[i])}${esc(displayName(g.t[i]))}</div>${line(i)}${bans(i)}</div>`).join('')}
    </div>
  </section>`;
}

// =============================================================
//  FICHA DE JUGADOR
// =============================================================
function findPlayerKey(players, name) {
  if (players[name]) return name;
  const n = norm(name);
  return Object.keys(players).find((k) => norm(k) === n) || Object.keys(players).find((k) => norm(displayName(k)) === n) || null;
}

async function viewPlayer(raw) {
  const name = decodeURIComponent(raw || '');
  await loadShorts();
  const players = await api.getPlayers();
  const key = findPlayerKey(players, name);
  if (!key) {
    return `<div class="state"><p><strong>No hay datos de «${esc(name)}».</strong></p>
      <p class="muted">Las fichas incluyen a los jugadores que han disputado algún Mundial (datos de Leaguepedia).</p>
      <a class="btn" href="#/mundiales">Ir a la hemeroteca</a></div>`;
  }
  preferHistoric = true;
  const pl = players[key];
  const years = Object.entries(pl.y).map(([y, v]) => ({ year: Number(y), ...v })).sort((x, y) => x.year - y.year);
  await Promise.all(years.map(async (yy) => {
    const ms = await api.getWorldsMatches(yy.year).catch(() => null);
    yy.place = ms ? worldsPlacement(ms.filter((m) => !/qualifier/i.test(m.page)), [yy.t], yy.year) : null;
  }));
  const tot = years.reduce((o, y) => ({ g: o.g + y.g, w: o.w + y.w, k: o.k + y.k, d: o.d + y.d, a: o.a + y.a }), { g: 0, w: 0, k: 0, d: 0, a: 0 });
  const titles = years.filter((y) => y.place?.key === 'champ').map((y) => y.year);
  const finals = years.filter((y) => y.place?.key === 'f').map((y) => y.year);
  const teams = [];
  for (const y of years) if (!teams.some((t) => api.canonTeam(t) === api.canonTeam(y.t) && t === y.t)) teams.push(y.t);
  const last = years[years.length - 1];
  const real = (key.match(/\(([^)]+)\)\s*$/) || [])[1];
  const role = ROLE_ES[String(pl.r).toLowerCase()] || pl.r;
  const stat = (n, l) => `<div class="stat"><span class="stat__num">${n}</span><span class="stat__lbl">${l}</span></div>`;
  const maxN = 6;
  const maxC = Math.max(1, ...pl.c.map((c) => c[1]));

  const html = `<div class="hero hero--small hero--edition hero--team">
      <div class="hero__champ" data-tint="${esc(lpLogoUrl(last.t) || '')}">${teamBadge(last.t)}</div>
      <div class="hero__text">
        <div class="hero__label">Jugador${role ? ' · ' + esc(role) : ''}${real ? ' · ' + esc(real) : ''}</div>
        <h1 class="hero__title">${esc(displayName(key))}</h1>
        <p class="hero__sub">${teams.map((t) => `<a href="${teamHref(t)}">${esc(displayName(t))}</a>`).join(' → ')}${titles.length ? ` · ♛ Campeón del mundo (${titles.join(', ')})` : ''}</p>
        <div class="stats">
          ${stat(titles.length, titles.length === 1 ? 'título mundial' : 'títulos mundiales')}
          ${stat(years.length, years.length === 1 ? 'Mundial' : 'Mundiales')}
          ${stat(tot.g, 'partidas')}
          ${stat(Math.round((tot.w / Math.max(1, tot.g)) * 100) + '%', 'de victorias')}
          ${stat(kdaRatio(tot.k, tot.d, tot.a), 'KDA')}
        </div>
      </div>
    </div>

    <h2 class="h2"><span>Trayectoria en los Mundiales</span></h2>
    <div class="path" style="--n:${years.length}">
      ${years.map((x) => `<a class="path__col lv-${x.place?.key || 'groups'}" href="#/mundial/${x.year}" title="Mundial ${x.year} con ${esc(x.t)}: ${esc(x.place?.label || '')}">
        <span class="path__lbl">${esc(x.place?.short || '')}</span>
        <span class="path__bar" style="--h:${((x.place?.n || 1) / maxN) * 100}%">${x.place?.key === 'champ' ? '♛' : ''}</span>
        <span class="path__year">${x.year}</span></a>`).join('')}
    </div>
    <div class="path__legend muted small">${titles.length ? `♛ Campeón: ${titles.join(', ')}` : ''}${finals.length ? `${titles.length ? ' · ' : ''}Subcampeón: ${finals.join(', ')}` : ''}</div>

    <section class="panel">
      <table class="table table--player"><thead><tr><th>Año</th><th>Equipo</th><th>Resultado</th><th>V–D</th><th>K/D/A</th><th class="col-champs">Campeones</th></tr></thead><tbody>
      ${years.slice().reverse().map((y) => `<tr>
        <td><a class="pos" href="#/mundial/${y.year}">${y.year}</a></td>
        <td><a class="team" href="${teamHref(y.t)}">${teamBadge(y.t)}<span class="team__name">${esc(displayName(y.t))}</span></a></td>
        <td class="${y.place?.key === 'champ' ? 'is-gold' : ''}">${esc(y.place?.label || '—')}</td>
        <td>${y.w}–${y.g - y.w}</td>
        <td title="KDA ${kdaRatio(y.k, y.d, y.a)}">${y.k}/${y.d}/${y.a}</td>
        <td class="col-champs"><span class="roster__champs">${y.c.map(([c, n]) => champIcon(c, 'champ champ--sm').replace('title="', `title="${n}× `)).join('')}</span></td></tr>`).join('')}
      </tbody></table>
    </section>

    ${pl.c.length ? `<h2 class="h2"><span>Campeones más jugados</span></h2>
    <div class="champs">${pl.c.map(([c, n, w]) => `<div class="champcard">
      ${champIcon(c, 'champ champ--lg')}
      <div class="champcard__body"><b>${esc(c)}</b>
        <span class="champcard__bar"><i style="width:${(n / maxC) * 100}%"></i></span>
        <span class="champcard__nums"><b>${n}</b> ${n === 1 ? 'partida' : 'partidas'} · ${Math.round((w / n) * 100)}% victorias</span></div>
    </div>`).join('')}</div>` : ''}
    <p class="muted small source">Datos de los Mundiales en Leaguepedia (CC BY-SA). Solo incluye partidas de Mundiales.</p>`;
  preferHistoric = false;
  return html;
}

/** Jugadores de un equipo en los Mundiales (para su ficha). */
async function teamPlayersHtml(names) {
  const players = await api.getPlayers();
  const list = [];
  for (const [k, p] of Object.entries(players)) {
    const ys = Object.entries(p.y).filter(([, v]) => inNames(v.t, names));
    if (!ys.length) continue;
    list.push({ k, r: p.r, years: ys.map(([y]) => Number(y)), g: ys.reduce((n, [, v]) => n + v.g, 0) });
  }
  if (!list.length) return '';
  list.sort((a, b) => b.years.length - a.years.length || b.g - a.g || a.k.localeCompare(b.k));
  const range = (ys) => (ys.length === 1 ? ys[0] : `${ys[0]}–${ys[ys.length - 1]}`);
  const item = (p) => `<a class="pchip" href="${playerHref(p.k)}"><b>${esc(displayName(p.k))}</b>
      <small>${ROLE_ES[String(p.r).toLowerCase()] || esc(p.r)} · ${range(p.years)}${p.years.length > 1 ? ` · ${p.years.length} Mundiales` : ''}</small></a>`;
  const top = list.slice(0, 15); const rest = list.slice(15);
  return `<h2 class="h2"><span>Jugadores en los Mundiales</span></h2>
    <div class="pchips">${top.map(item).join('')}</div>
    ${rest.length ? `<details class="champs__more"><summary>Ver los otros ${rest.length}</summary><div class="pchips">${rest.map(item).join('')}</div></details>` : ''}`;
}

// =============================================================
//  EVOLUCIÓN DEL JUEGO
// =============================================================
const EVO_COLORS = ['#F0D58A', '#0AC8B9', '#FF5A5F', '#5B8CFF', '#B57BFF', '#3CCB8A', '#FF9F43', '#E86FB4'];
let evo = { years: [], pres: new Map(), sel: [], names: [] };

function evoChart() {
  const { years, pres, sel } = evo;
  if (!years.length) return '';
  const W = 800; const H = 300; const pl = 40; const pr = 16; const pt = 14; const pb = 30;
  const x = (i) => pl + (years.length === 1 ? 0 : (i / (years.length - 1)) * (W - pl - pr));
  const y = (v) => pt + (1 - v / 100) * (H - pt - pb);
  const grid = [0, 25, 50, 75, 100].map((v) => `<line x1="${pl}" x2="${W - pr}" y1="${y(v)}" y2="${y(v)}" class="evo__grid"/><text x="${pl - 6}" y="${y(v) + 4}" class="evo__ax" text-anchor="end">${v}%</text>`).join('');
  const xs = years.map((yr, i) => `<text x="${x(i)}" y="${H - 8}" class="evo__ax" text-anchor="middle">${String(yr).slice(2)}</text>`).join('');
  const lines = sel.map((c, si) => {
    const col = EVO_COLORS[si % EVO_COLORS.length];
    const pts = years.map((yr, i) => [x(i), y(pres.get(c)?.[yr] || 0), yr, pres.get(c)?.[yr] || 0]);
    return `<g style="--c:${col}"><polyline class="evo__line" points="${pts.map((p) => p[0].toFixed(1) + ',' + p[1].toFixed(1)).join(' ')}"/>
      ${pts.map((p) => `<circle class="evo__pt" cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="${p[3] ? 3.5 : 2}"><title>${esc(c)} · ${p[2]}: ${p[3]}%</title></circle>`).join('')}</g>`;
  }).join('');
  const legend = sel.map((c, si) => `<button type="button" class="evo__leg" data-evo-del="${esc(c)}" style="--c:${EVO_COLORS[si % EVO_COLORS.length]}" title="Quitar">${champIcon(c, 'champ champ--sm')}${esc(c)} <span aria-hidden="true">×</span></button>`).join('');
  return `<svg class="evo__svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="Presencia por año de los campeones elegidos">${grid}${xs}${lines}</svg>
    <div class="evo__legend">${legend || '<span class="muted small">Elige campeones abajo para compararlos.</span>'}</div>`;
}

async function viewEvolution() {
  const editions = await api.getNewWorldsEditions().catch(() => []);
  const allYears = [...new Set([...WORLDS_HISTORY.map((w) => w.year), ...editions.map((w) => w.year)])].sort((a, b) => a - b);
  const [stats, summary] = await Promise.all([Promise.all(allYears.map((y) => api.getChampionStats(y))), api.getEvolution()]);
  const rows = allYears.map((y, i) => ({ year: y, st: stats[i] })).filter((r) => r.st?.champions?.length);
  if (!rows.length) {
    return `<div class="state"><p>Todavía no se han descargado las estadísticas de campeones.</p><p class="muted">Aparecen solas tras las próximas actualizaciones de los datos.</p></div>`;
  }
  const pres = new Map();
  for (const { year, st } of rows) {
    for (const c of st.champions) {
      const v = Math.min(100, Math.round(((c.picks + c.bans) / Math.max(1, st.games)) * 100));
      if (!pres.has(c.champion)) pres.set(c.champion, {});
      pres.get(c.champion)[year] = v;
    }
  }
  const totalOf = (c) => Object.values(pres.get(c)).reduce((a, b) => a + b, 0);
  const names = [...pres.keys()].sort((a, b) => totalOf(b) - totalOf(a));
  evo = { years: rows.map((r) => r.year), pres, sel: evo.sel.length ? evo.sel.filter((c) => pres.has(c)) : names.slice(0, 5), names };

  const topRows = rows.slice().reverse().map(({ year, st }) => {
    const top = st.champions.slice(0, 5);
    return `<div class="evo-row">
      <a class="evo-row__year" href="#/mundial/${year}">${year}</a>
      <div class="evo-row__champs">${top.map((c) => {
        const v = Math.min(100, Math.round(((c.picks + c.bans) / Math.max(1, st.games)) * 100));
        return `<button type="button" class="evo-champ" data-evo-add="${esc(c.champion)}" title="${esc(c.champion)}: ${v}% de presencia (${c.picks} elegido, ${c.bans} vetado). Pulsa para añadirlo al gráfico">
          ${champIcon(c.champion, 'champ')}<span class="evo-champ__name">${esc(c.champion)}</span><b>${v}%</b></button>`;
      }).join('')}</div>
      <span class="evo-row__games muted small">${st.games} partidas</span></div>`;
  }).join('');

  const champCount = Object.fromEntries(rows.map((r) => [r.year, r.st.champions.filter((c) => c.picks > 0).length]));
  const bars = (title, getter, fmt, note = '') => {
    const vals = evo.years.map((y) => ({ y, v: getter(y) })).filter((d) => d.v != null);
    if (!vals.length) return '';
    const max = Math.max(...vals.map((d) => d.v)); const min = Math.min(...vals.map((d) => d.v));
    return `<section class="panel minibars"><h3 class="panel__title">${title}</h3>
      <div class="minibars__grid" style="--n:${vals.length}">${vals.map((d) => `<a class="minibars__col" href="#/mundial/${d.y}" title="${d.y}: ${fmt(d.v)}">
        <span class="minibars__val">${fmt(d.v)}</span>
        <span class="minibars__bar ${d.v === max ? 'is-max' : d.v === min ? 'is-min' : ''}" style="--h:${max > min ? 18 + ((d.v - min) / (max - min)) * 82 : 60}%"></span>
        <span class="minibars__year">${String(d.y).slice(2)}</span></a>`).join('')}</div>
      ${note ? `<p class="muted small pad">${note}</p>` : ''}</section>`;
  };
  const minutes = (s) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;

  return `<div class="hero hero--small">
      <div class="hero__label">Mundiales ${evo.years[0]} – ${evo.years[evo.years.length - 1]}</div>
      <h1 class="hero__title">Evolución del juego</h1>
      <p class="hero__sub">Qué campeones han dominado cada Mundial y cómo han cambiado las partidas. Presencia = partidas en las que un campeón fue elegido o vetado.</p>
    </div>

    <h2 class="h2"><span>Presencia año a año</span></h2>
    <section class="panel evo">
      <div id="evoChart">${evoChart()}</div>
      <form class="evo__form" id="evoForm" autocomplete="off">
        <input class="input" name="c" list="evoList" placeholder="Añadir un campeón (p. ej. Azir)">
        <button class="btn btn--small" type="submit">Añadir</button>
        <datalist id="evoList">${names.map((n) => `<option value="${esc(n)}">`).join('')}</datalist>
      </form>
      <div class="evo__pick">${names.slice(0, 20).map((c) => `<button type="button" class="evo-mini" data-evo-add="${esc(c)}" title="${esc(c)}">${champIcon(c, 'champ champ--sm')}</button>`).join('')}</div>
    </section>

    <h2 class="h2"><span>Los cinco más presentes de cada Mundial</span></h2>
    <div class="evo-rows">${topRows}</div>

    <h2 class="h2"><span>Cómo han cambiado las partidas</span></h2>
    <div class="grid2">
      ${bars('Duración media', (y) => summary[y]?.len ?? null, minutes)}
      ${bars('Asesinatos por partida', (y) => summary[y]?.kills ?? null, (v) => v.toLocaleString('es-ES'))}
      ${bars('Campeones distintos elegidos', (y) => champCount[y] ?? null, (v) => String(v))}
      ${bars('Victorias del lado azul', (y) => summary[y]?.blue ?? null, (v) => Math.round(v) + '%', 'Por encima del 50% significa que el lado azul gana más a menudo.')}
    </div>
    <p class="muted small source">Datos: Leaguepedia (CC BY-SA). Iconos: Data Dragon (Riot Games).</p>`;
}

function evoToggle(c, add) {
  if (!c || !evo.pres.has(c)) return;
  if (add) { if (!evo.sel.includes(c)) evo.sel = [...evo.sel, c].slice(-EVO_COLORS.length); } else evo.sel = evo.sel.filter((x) => x !== c);
  const box = document.getElementById('evoChart');
  if (box) box.innerHTML = evoChart();
}

// =============================================================
//  PICK'EM ENTRE AMIGOS
//  Los datos viven en el Worker (Cloudflare D1). En el navegador solo se
//  guarda la sesión de cada grupo (código, apodo y token).
// =============================================================
const PK_KEY = 'lolweb:pickem';
const PK_RULES = [
  ['Ganador acertado', '1 punto'],
  ['Resultado exacto (series al mejor de 3 o de 5)', '+1 punto'],
  ['Cuartos y semifinales', 'puntos ×2'],
  ['Gran Final', 'puntos ×3'],
  ['Campeón del Mundial (antes del primer partido)', '5 puntos'],
];
const pkMult = (m) => (FINAL_TAB.test(m.tab) ? 3 : /^(round of 16|quarterfinals|semifinals)$/i.test(m.tab) ? 2 : 1);
function pkLoad() { try { return JSON.parse(localStorage.getItem(PK_KEY)) || { sessions: {} }; } catch { return { sessions: {} }; } }
function pkSave(st) { try { localStorage.setItem(PK_KEY, JSON.stringify(st)); } catch { /* sin almacenamiento */ } }
let pk = null;   // { code, token, nick, year, picks: Map(key -> {team, score}), matches }

async function pickemYear() {
  const cur = await api.getCurrentWorlds().catch(() => null) || await api.getUpcomingWorlds().catch(() => null);
  if (cur) return cur.year;
  const eds = await api.getNewWorldsEditions().catch(() => []);
  const now = Date.now();
  const next = eds.find((e) => !e.end || Date.parse(e.end) + 2 * 86400_000 >= now);
  return next ? next.year : WORLDS_HISTORY[WORLDS_HISTORY.length - 1].year + 1;
}

function pkHero(year, title, sub, extra = '') {
  return `<div class="hero hero--small hero--pickem">
      <div class="hero__label">Pick'em · Mundial ${year}</div>
      <h1 class="hero__title">🎯 ${title}</h1>
      ${sub ? `<p class="hero__sub">${sub}</p>` : ''}${extra}
    </div>`;
}
const pkRulesHtml = () => `<section class="panel pk-rules"><h3 class="panel__title">Cómo se puntúa</h3>
    ${PK_RULES.map(([a, b]) => `<div class="pk-rules__row"><span>${a}</span><b>${b}</b></div>`).join('')}
    <p class="muted small pad">Los pronósticos de cada partido se cierran a la hora de empezar y entonces se ven los de todo el grupo.
      Los resultados se apuntan solos con los datos de la web.</p></section>`;

async function viewPickem(rawCode) {
  const year = await pickemYear();
  const store = pkLoad();
  const code = String(decodeURIComponent(rawCode || '') || store.last || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  const sess = code && store.sessions[code];
  if (!code) return pkLanding(year);
  if (!sess) return pkJoin(year, code);
  return pkMain(year, code, sess);
}

function pkLanding(year) {
  const store = pkLoad();
  const mine = Object.entries(store.sessions);
  return pkHero(year, 'Pick\'em entre amigos', 'Crea un grupo, pasa el código a tus amigos y pronosticad quién gana cada serie del Mundial. La clasificación se actualiza sola con los resultados.') + `
    ${mine.length ? `<h2 class="h2 h2--small"><span>Tus grupos</span></h2><div class="pchips">${mine.map(([c, s]) => `<a class="pchip" href="#/pickem/${c}"><b>${esc(s.name || c)}</b><small>${c} · como ${esc(s.nick)}</small></a>`).join('')}</div>` : ''}
    <div class="grid2 pk-forms">
      <form class="panel pk-form" id="pkCreate" autocomplete="off">
        <h3 class="panel__title">Crear un grupo</h3>
        <label>Nombre del grupo<input class="input" name="name" maxlength="40" placeholder="Los de clase" required></label>
        <label>Tu apodo<input class="input" name="nick" maxlength="20" placeholder="Faker2" required></label>
        <label>PIN de 4 cifras<input class="input" name="pin" inputmode="numeric" pattern="\\d{4}" maxlength="4" placeholder="••••" required></label>
        <button class="btn btn--gold" type="submit">Crear grupo</button>
        <p class="pk-form__msg" role="alert"></p>
      </form>
      <form class="panel pk-form" id="pkJoin" autocomplete="off">
        <h3 class="panel__title">Entrar en un grupo</h3>
        <label>Código del grupo<input class="input pk-code" name="code" maxlength="6" placeholder="ABC123" required></label>
        <label>Tu apodo<input class="input" name="nick" maxlength="20" required></label>
        <label>PIN de 4 cifras<input class="input" name="pin" inputmode="numeric" pattern="\\d{4}" maxlength="4" placeholder="••••" required></label>
        <button class="btn" type="submit">Entrar</button>
        <p class="muted small">¿Ya tienes apodo en el grupo? Usa el mismo PIN. Si es nuevo, se crea al entrar.</p>
        <p class="pk-form__msg" role="alert"></p>
      </form>
    </div>
    ${pkRulesHtml()}`;
}

async function pkJoin(year, code) {
  let lg;
  try { lg = (await api.pickem('GET', `/league/${code}`)).league; } catch (err) {
    return pkHero(year, 'Pick\'em entre amigos', '') + `<div class="state state--error"><p><strong>${esc(err.message)}</strong></p>
      <a class="btn" href="#/pickem">Crear o buscar otro grupo</a></div>`;
  }
  return pkHero(year, esc(lg.name), `Te han invitado a este grupo (${lg.players} ${lg.players === 1 ? 'jugador' : 'jugadores'}). Elige un apodo y un PIN de 4 cifras para entrar desde cualquier dispositivo.`) + `
    <form class="panel pk-form pk-form--narrow" id="pkJoin" autocomplete="off">
      <h3 class="panel__title">Entrar en «${esc(lg.name)}»</h3>
      <input type="hidden" name="code" value="${esc(code)}">
      <label>Tu apodo<input class="input" name="nick" maxlength="20" required></label>
      <label>PIN de 4 cifras<input class="input" name="pin" inputmode="numeric" pattern="\\d{4}" maxlength="4" placeholder="••••" required></label>
      <button class="btn btn--gold" type="submit">Entrar</button>
      <p class="muted small">¿Ya tienes apodo en el grupo? Usa el mismo PIN.</p>
      <p class="pk-form__msg" role="alert"></p>
    </form>
    ${pkRulesHtml()}`;
}

async function pkMain(year, code, sess) {
  await loadShorts();
  let me, board;
  try {
    [me, board] = await Promise.all([
      api.pickem('GET', `/me?year=${year}`, { token: sess.token }),
      api.pickem('GET', `/board/${code}?year=${year}`),
    ]);
  } catch (err) {
    if (err.status === 401) { const st = pkLoad(); delete st.sessions[code]; pkSave(st); return pkJoin(year, code); }
    return pkHero(year, esc(sess.name || code), '') + `<div class="state state--error"><p><strong>${esc(err.message)}</strong></p>
      <button class="btn" onclick="location.reload()">Reintentar</button></div>`;
  }
  const st = pkLoad(); st.last = code; st.sessions[code] = { ...sess, name: me.league.name, nick: me.player.nick }; pkSave(st);
  const matches = ((await api.getWorldsMatches(year).catch(() => null)) || []).filter((m) => !/qualifier/i.test(m.page));
  pk = { code, token: sess.token, nick: me.player.nick, year, picks: new Map(me.picks.map((p) => [p.key, p])), matches };
  const now = Date.now();
  const started = (m) => m.state !== 'upcoming' || (m.date && m.date.getTime() <= now);
  const open = matches.filter((m) => !started(m) && !isTbd(m.team1) && !isTbd(m.team2)).sort((a, b) => (a.date || 0) - (b.date || 0));
  const waiting = matches.filter((m) => !started(m) && (isTbd(m.team1) || isTbd(m.team2))).length;
  const closed = matches.filter((m) => started(m) && !isTbd(m.team1)).sort((a, b) => (b.date || 0) - (a.date || 0));
  const editionStart = Math.min(...matches.map((m) => (m.date ? m.date.getTime() : Infinity)));
  const champOpen = !Number.isFinite(editionStart) || now < editionStart;
  let teams = await api.getWorldsTeams(year);
  if (!teams.length) teams = [...new Set(matches.flatMap((m) => [m.team1, m.team2]).filter((t) => !isTbd(t)))].sort((a, b) => a.localeCompare(b));
  const champPick = pk.picks.get('champion');
  const invite = `${location.origin}${location.pathname}#/pickem/${code}`;
  const myRow = board.board.find((r) => r.nick.toLowerCase() === pk.nick.toLowerCase());
  const myPos = myRow ? board.board.indexOf(myRow) + 1 : null;

  const champHtml = `<section class="panel pk-champ">
      <h3 class="panel__title">♛ Campeón del Mundial ${year} <span class="pk-badge">5 puntos</span></h3>
      ${champOpen ? `<form class="pk-champ__form" id="pkChamp">
          <select class="select" name="team"><option value="">Elige un equipo…</option>${teams.map((t) => `<option value="${esc(t)}" ${champPick?.team === t ? 'selected' : ''}>${esc(displayName(t))}</option>`).join('')}</select>
          <span class="pk-champ__status" aria-live="polite">${champPick ? '✓ Guardado' : ''}</span>
          <span class="pk-champ__note muted small">${Number.isFinite(editionStart) ? `Se cierra el ${fmtDate(editionStart)} a las ${fmtTime(editionStart)}` : 'Se cierra al empezar el primer partido'}${teams.length ? '' : ' · los equipos aparecerán en cuanto Leaguepedia los publique'}</span>
        </form>`
      : `<div class="pk-champ__done">${champPick ? `Tu campeón: ${teamBadge(champPick.team)} <b>${esc(displayName(champPick.team))}</b>${board.champion ? (champPick.team === board.champion ? ' <span class="pk-ok">✓ +5</span>' : ' <span class="pk-ko">✗</span>') : ''}` : '<span class="muted">No elegiste campeón.</span>'}
          ${(board.revealed.champion || []).filter((x) => x.nick !== pk.nick).length ? `<div class="pk-others">${board.revealed.champion.filter((x) => x.nick !== pk.nick).map((x) => `<span>${esc(x.nick)}: ${esc(displayName(x.team))}</span>`).join('')}</div>` : ''}</div>`}
    </section>`;

  const byDay = new Map();
  for (const m of open) { const d = m.date ? fmtDate(m.date) : 'Sin fecha'; if (!byDay.has(d)) byDay.set(d, []); byDay.get(d).push(m); }
  const openHtml = open.length ? [...byDay.entries()].map(([d, ms]) => `<div class="pk-day"><h4 class="pk-day__title">${esc(d)}</h4>
      <div class="pk-grid">${ms.map(pkCard).join('')}</div></div>`).join('')
    : `<p class="muted block__empty">${matches.length ? 'Ahora mismo no hay partidos con los dos equipos confirmados.' : `Leaguepedia aún no ha publicado el calendario del Mundial ${year}.`}</p>`;
  const closedHtml = closed.length ? `<div class="pk-grid">${closed.map((m) => pkResultCard(m, board.revealed[m.key] || [])).join('')}</div>` : '<p class="muted block__empty">Todavía no ha empezado ningún partido.</p>';

  const boardHtml = board.board.length ? `<section class="panel"><table class="table pk-table"><thead><tr><th>#</th><th>Jugador</th><th>Puntos</th><th title="Ganadores acertados / partidos ya jugados">Aciertos</th><th>Exactos</th></tr></thead><tbody>
      ${board.board.map((r, i) => `<tr class="${r.nick.toLowerCase() === pk.nick.toLowerCase() ? 'is-me' : ''}"><td class="pos">${i + 1}</td><td><b>${esc(r.nick)}</b>${i === 0 && r.points > 0 ? ' 👑' : ''}</td>
        <td class="pk-pts">${r.points}</td><td>${r.hits}/${r.played}</td><td>${r.exact}</td></tr>`).join('')}
    </tbody></table></section>` : '<p class="muted">Aún no hay nadie en el grupo.</p>';

  const pending = open.filter((m) => !pk.picks.has(m.key)).length;
  return pkHero(year, esc(me.league.name), `Juegas como <b>${esc(pk.nick)}</b>${myPos ? ` · vas ${myPos}º con ${myRow.points} ${myRow.points === 1 ? 'punto' : 'puntos'}` : ''} · código del grupo <b class="pk-code-big">${code}</b>`,
    `<div class="hero__actions">
      <button class="btn btn--small btn--gold" type="button" data-pk-invite="${esc(invite)}" data-pk-name="${esc(me.league.name)}">📨 Invitar amigos</button>
      <a class="btn btn--small" href="#/mundial/${year}">Mundial ${year}</a>
      <button class="btn btn--small" type="button" data-pk-logout="${code}">Salir del grupo</button>
    </div>`) + `
    <div class="chips" id="stageChips">
      <button class="chip chip--on" data-stage="pk-picks">Pronósticos <span class="pk-count" title="Partidos sin pronosticar" ${pending ? '' : 'hidden'}>${pending}</span></button>
      <button class="chip" data-stage="pk-board">Clasificación</button>
      <button class="chip" data-stage="pk-done">Jugados</button>
      <button class="chip chip--alt" data-stage="pk-rules">Reglas</button>
    </div>
    <div class="stage" data-stage="pk-picks">${champHtml}
      <h2 class="h2 h2--small"><span>Próximos partidos</span></h2>${openHtml}
      ${waiting ? `<p class="muted small">${waiting} ${waiting === 1 ? 'partido más espera' : 'partidos más esperan'} a que se conozcan los equipos.</p>` : ''}</div>
    <div class="stage" data-stage="pk-board" hidden>${boardHtml}</div>
    <div class="stage" data-stage="pk-done" hidden>${closedHtml}</div>
    <div class="stage" data-stage="pk-rules" hidden>${pkRulesHtml()}</div>`;
}

function pkScores(bo) {
  const need = Math.ceil(bo / 2);
  return Array.from({ length: need }, (_, i) => `${need}-${i}`);
}
function pkCard(m) {
  const p = pk.picks.get(m.key) || {};
  const mult = pkMult(m);
  const bo = m.bestOf || 1;
  const left = m.date ? m.date.getTime() - Date.now() : null;
  const closes = left == null ? '' : left < 3600_000 ? `cierra en ${Math.max(1, Math.round(left / 60_000))} min` : left < 86400_000 ? `cierra en ${Math.round(left / 3600_000)} h` : `${fmtTime(m.date)}`;
  const team = (t) => `<button type="button" class="pk__team ${p.team === t ? 'is-on' : ''}" data-pk-team="${esc(t)}">${teamBadge(t)}<span class="pk__name">${esc(displayName(t))}</span></button>`;
  return `<div class="pk ${p.team ? 'is-picked' : ''}" data-pk-key="${esc(m.key)}" data-bo="${bo}">
    <div class="pk__meta"><span>${esc([m.stage, tabEs(m.tab)].filter(Boolean).join(' · '))}${bo > 1 ? ' · Bo' + bo : ''}</span>
      ${mult > 1 ? `<span class="pk-badge">×${mult}</span>` : ''}<span class="pk__close">${closes}</span></div>
    <div class="pk__teams">${team(m.team1)}<span class="pk__vs">vs</span>${team(m.team2)}</div>
    ${bo > 1 ? `<div class="pk__scores" ${p.team ? '' : 'hidden'}><span class="muted small">Resultado (opcional):</span>${pkScores(bo).map((s) => `<button type="button" class="chip pk__score ${p.score === s ? 'chip--on' : ''}" data-pk-score="${s}">${s.replace('-', '–')}</button>`).join('')}</div>` : ''}
    <div class="pk__status" aria-live="polite">${p.team ? '✓ Guardado' : ''}</div>
  </div>`;
}
function pkResultCard(m, picks) {
  const mine = pk.picks.get(m.key);
  const done = m.state === 'done';
  const w = done ? winnerOf(m) : 0;
  const winner = w === 1 ? m.team1 : w === 2 ? m.team2 : null;
  const real = done ? `${Math.max(m.score1 || 0, m.score2 || 0)}-${Math.min(m.score1 || 0, m.score2 || 0)}` : '';
  const pts = (pkx) => (!done || !pkx || pkx.team !== winner ? 0 : pkMult(m) * (1 + (pkx.score && pkx.score === real ? 1 : 0)));
  const mineHtml = mine ? `Tu pronóstico: <b>${esc(displayName(mine.team))}</b>${mine.score ? ' ' + mine.score.replace('-', '–') : ''}
      ${done ? (mine.team === winner ? `<span class="pk-ok">✓ +${pts(mine)}</span>` : '<span class="pk-ko">✗</span>') : '<span class="muted">· en juego</span>'}`
    : '<span class="muted">Sin pronóstico</span>';
  const others = picks.filter((x) => x.nick.toLowerCase() !== pk.nick.toLowerCase());
  return `<div class="pk pk--done">
    ${matchCard(m, { label: [tabEs(m.tab), pkMult(m) > 1 ? '×' + pkMult(m) : ''].filter(Boolean).join(' · ') })}
    <div class="pk__mine">${mineHtml}</div>
    ${others.length ? `<div class="pk-others">${others.map((x) => `<span class="${done ? (x.team === winner ? 'is-ok' : 'is-ko') : ''}">${esc(x.nick)}: ${esc(shortOf(x.team))}${x.score ? ' ' + x.score.replace('-', '–') : ''}</span>`).join('')}</div>` : ''}
  </div>`;
}

async function pkSend(card, team, score) {
  const key = card.dataset.pkKey;
  const status = card.querySelector('.pk__status');
  status.textContent = 'Guardando…'; status.className = 'pk__status';
  try {
    await api.pickem('PUT', '/pick', { token: pk.token, body: { year: pk.year, key, team, score } });
    if (team) pk.picks.set(key, { key, team, score }); else pk.picks.delete(key);
    card.classList.toggle('is-picked', !!team);
    card.querySelectorAll('[data-pk-team]').forEach((b) => b.classList.toggle('is-on', b.dataset.pkTeam === team));
    card.querySelectorAll('[data-pk-score]').forEach((b) => b.classList.toggle('chip--on', b.dataset.pkScore === score));
    const sc = card.querySelector('.pk__scores'); if (sc) sc.hidden = !team;
    status.textContent = team ? '✓ Guardado' : 'Pronóstico quitado';
    const left = $view.querySelectorAll('.pk[data-pk-key]:not(.is-picked)').length;
    const badge = $view.querySelector('[data-stage="pk-picks"] .pk-count');
    if (badge) { badge.textContent = left; badge.hidden = !left; }
  } catch (err) {
    status.textContent = err.message; status.className = 'pk__status is-error';
  }
}

async function pkFormSubmit(form) {
  const f = Object.fromEntries(new FormData(form));
  const msg = form.querySelector('.pk-form__msg');
  const btn = form.querySelector('button[type=submit]');
  msg.textContent = ''; btn.disabled = true;
  try {
    let code = String(f.code || '').toUpperCase();
    if (form.id === 'pkCreate') code = (await api.pickem('POST', '/league', { body: { name: f.name } })).league.code;
    const r = await api.pickem('POST', '/join', { body: { code, nick: f.nick, pin: f.pin } });
    const st = pkLoad();
    st.sessions[r.league.code] = { token: r.token, nick: r.player.nick, name: r.league.name };
    st.last = r.league.code; pkSave(st);
    if (location.hash === `#/pickem/${r.league.code}`) route(); else location.hash = `#/pickem/${r.league.code}`;
  } catch (err) {
    msg.textContent = err.message;
  } finally { btn.disabled = false; }
}

$view.addEventListener('click', async (e) => {
  const teamBtn = e.target.closest('[data-pk-team]');
  if (teamBtn && pk) {
    const card = teamBtn.closest('[data-pk-key]');
    const cur = pk.picks.get(card.dataset.pkKey);
    const team = cur?.team === teamBtn.dataset.pkTeam ? null : teamBtn.dataset.pkTeam;   // pulsar otra vez = quitar
    return pkSend(card, team, team && cur?.team === team ? cur.score : null);
  }
  const scoreBtn = e.target.closest('[data-pk-score]');
  if (scoreBtn && pk) {
    const card = scoreBtn.closest('[data-pk-key]');
    const cur = pk.picks.get(card.dataset.pkKey);
    if (!cur) return;
    return pkSend(card, cur.team, cur.score === scoreBtn.dataset.pkScore ? null : scoreBtn.dataset.pkScore);
  }
  const inv = e.target.closest('[data-pk-invite]');
  if (inv) {
    const url = inv.dataset.pkInvite;
    const text = `Únete a mi Pick'em del Mundial «${inv.dataset.pkName}» en Grieta Archivo:`;
    if (navigator.share) { navigator.share({ title: 'Pick\'em del Mundial', text, url }).catch(() => {}); return; }
    try { await navigator.clipboard.writeText(`${text} ${url}`); inv.textContent = '✓ Enlace copiado'; } catch { prompt('Copia este enlace:', url); }
    setTimeout(() => { inv.textContent = '📨 Invitar amigos'; }, 2500);
  }
  const out = e.target.closest('[data-pk-logout]');
  if (out && confirm('¿Salir de este grupo en este dispositivo? Podrás volver con tu apodo y PIN.')) {
    const st = pkLoad(); delete st.sessions[out.dataset.pkLogout]; if (st.last === out.dataset.pkLogout) delete st.last; pkSave(st);
    location.hash = '#/pickem';
  }
});
$view.addEventListener('submit', async (e) => {
  if (e.target.id === 'pkCreate' || e.target.id === 'pkJoin') { e.preventDefault(); pkFormSubmit(e.target); }
  if (e.target.id === 'pkChamp' && pk) {
    e.preventDefault();
    const team = new FormData(e.target).get('team') || null;
    const note = e.target.querySelector('.pk-champ__status');
    note.textContent = 'Guardando…'; note.className = 'pk-champ__status';
    try {
      await api.pickem('PUT', '/pick', { token: pk.token, body: { year: pk.year, key: 'champion', team } });
      if (team) pk.picks.set('champion', { key: 'champion', team }); else pk.picks.delete('champion');
      note.textContent = team ? '✓ Guardado' : 'Pronóstico quitado';
      e.target.querySelector('select').blur();   // para que el refresco automático no se quede esperando
    } catch (err) { note.textContent = err.message; note.className = 'pk-champ__status is-error'; }
  }
});

// ---------- Ligas ----------
function viewLeagues() {
  return `<div class="hero hero--small">
      <div class="hero__label">Competiciones</div>
      <h1 class="hero__title">Ligas</h1>
      <p class="hero__sub">Calendario, resultados y clasificación de cada liga, actualizados desde Leaguepedia.</p>
    </div>
    <div class="lgrid lgrid--big">${LEAGUES.map((l) => `
      <a class="lcard" href="#/liga/${l.slug}" style="--accent:${l.color}">
        ${leagueLogo(l.slug, 'lcard__img')}<span class="lcard__name">${esc(l.name)}</span><span class="lcard__region">${esc(l.region)}</span>
      </a>`).join('')}</div>`;
}

async function viewLeague(slug, opts, tIndex) {
  const meta = LEAGUES.find((l) => l.slug === slug);
  if (!meta) return errorBox(new Error(`La liga "${slug}" no está configurada`));

  let tournaments, current, matches;
  try {
    tournaments = await api.getLeagueTournaments(slug, { force: false });
    if (!tournaments.length) {
      return leagueHeader(meta, '') + `<div class="state"><p>Todavía no hay torneos de ${esc(meta.name)}.</p>
        <p class="muted">Aparecerán en la próxima actualización automática de los datos.</p></div>`;
    }
    current = tournaments[Number(tIndex)] || api.pickCurrentTournament(tournaments);
    await loadShorts();
    matches = applyLolesports(await api.getTournamentMatches(slug, current.page, { force: opts.refresh }));
  } catch (err) {
    return leagueHeader(meta, '') + errorBox(err);
  }

  const select = `<select id="tSelect" class="select">${tournaments.slice(0, 20).map((t, i) =>
    `<option value="${i}" ${t.page === current.page ? 'selected' : ''}>${esc(t.name)}</option>`).join('')}</select>`;

  const table = api.computeStandings(matches);
  // Racha: últimos 5 resultados de cada equipo (el más reciente a la derecha)
  const form = {};
  for (const m of matches.filter((x) => x.state === 'done').sort((a, b) => (a.date || 0) - (b.date || 0))) {
    const w = m.winner || (m.score1 > m.score2 ? 1 : 2);
    (form[m.team1] ||= []).push(w === 1 ? 'W' : 'L');
    (form[m.team2] ||= []).push(w === 2 ? 'W' : 'L');
  }
  const formHtml = (team) => `<span class="form">${(form[team] || []).slice(-5).map((r) =>
    `<i class="form__dot form__dot--${r === 'W' ? 'w' : 'l'}" title="${r === 'W' ? 'Victoria' : 'Derrota'}"></i>`).join('')}</span>`;
  const standingsHtml = table.length ? `<section class="panel">
      <h3 class="panel__title">Balance de series · ${esc(current.name)}</h3>
      <table class="table table--standings"><thead><tr><th>#</th><th>Equipo</th><th>V</th><th>D</th><th title="Diferencia de partidas">±</th><th class="col-form">Racha</th></tr></thead><tbody>
      ${table.map((t, i) => `<tr><td class="pos">${i + 1}</td>
        <td><div class="team">${teamBadge(t.team)}<a class="team__name" href="${teamHref(t.team)}">${esc(displayName(t.team))}</a><a class="team__code" href="${teamHref(t.team)}">${esc(shortOf(t.team))}</a></div></td>
        <td>${t.w}</td><td>${t.l}</td><td class="${t.gw - t.gl > 0 ? 'pos-diff' : t.gw - t.gl < 0 ? 'neg-diff' : ''}">${t.gw - t.gl > 0 ? '+' : ''}${t.gw - t.gl}</td>
        <td class="col-form">${formHtml(t.team)}</td></tr>`).join('')}
      </tbody></table>
      <p class="muted small pad">Calculado con los resultados del torneo. En playoffs refleja series ganadas y perdidas, no la posición final.</p>
    </section>` : '';

  const body = matches.length ? matchesBlock(matches) : '<div class="state"><p>Este torneo aún no tiene partidos publicados.</p></div>';

  return leagueHeader(meta, select) + body +
    (standingsHtml ? `<h2 class="h2"><span>Clasificación</span></h2>${standingsHtml}` : '') +
    `<p class="muted small source">Datos: <a href="${api.leaguepediaUrl(current.page)}" target="_blank" rel="noopener">Leaguepedia</a> (CC BY-SA).</p>`;
}

function leagueHeader(meta, select) {
  return `<div class="hero hero--small" style="--accent:${meta.color}">
      <div class="hero__label">${esc(meta.region)}</div>
      <h1 class="hero__title">${leagueLogo(meta.slug, 'hero__logo')}${esc(meta.name)}</h1>
      ${select ? `<div class="hero__sub">Torneo: ${select}</div>` : ''}
    </div>`;
}

// =============================================================
//  Enrutado
// =============================================================
function setUpdated() { lastUpdate = Date.now(); paintStatus(); }

async function route({ refresh = false } = {}) {
  // Al refrescar solo: no cortar un vídeo que se está viendo ni un formulario a medio escribir
  if (refresh && ($view.querySelector('.fvideo__player iframe') || document.activeElement?.closest?.('#view input, #view select'))) {
    scheduleRefresh();
    return;
  }
  const token = ++renderToken;
  const hash = location.hash.replace(/^#\/?/, '');
  const parts = hash.split('/');
  const [section, param, extra] = parts;
  liveNow = false;
  icsSets.clear();

  document.querySelectorAll('.nav a').forEach((a) => {
    const target = a.getAttribute('href').replace('#/', '');
    const navOf = { mundial: 'mundiales', serie: 'mundiales', liga: 'ligas', evolucion: 'records' };
    a.classList.toggle('active', target === (navOf[section] || section || ''));
    if (section === 'cara' && target === 'records') a.classList.remove('active');
  });

  if (!refresh) {
    $view.innerHTML = loading();
    window.scrollTo(0, 0);
  }

  const opts = { refresh };
  let html;
  try {
    const meta = await api.getMeta({ force: refresh }).catch(() => null);
    lole = await api.getLolesports({ force: refresh }).catch(() => ({ live: [], events: [], teams: {}, leagues: {} }));
    vods = await api.getVods().catch(() => ({}));
    const now = await api.getLiveNow();
    liveChecked = now ? new Date(now.checked) : null;
    if (now) mergeLive(now.events);
    ddragon = await api.getDdragon();
    dataChecked = meta?.checked ? new Date(meta.checked) : null;
    switch (section) {
      case 'mundiales': html = await viewWorlds(opts); break;
      case 'mundial': html = await viewEdition(param, opts); break;
      case 'ligas': html = viewLeagues(); break;
      case 'liga': html = await viewLeague(param, opts, extra); break;
      case 'equipo': html = await viewTeam(param, opts); break;
      case 'cara': html = await viewH2H(param, extra); break;
      case 'records': html = await viewRecords(); break;
      case 'serie': html = await viewSeries(param, extra, parts[3], parts[4]); break;
      case 'jugador': html = await viewPlayer(param); break;
      case 'evolucion': html = await viewEvolution(); break;
      case 'pickem': html = await viewPickem(param); break;
      default: html = await viewHome(opts);
    }
  } catch (err) {
    html = errorBox(err);
  }
  if (token !== renderToken) return;

  const activeStage = document.querySelector('#stageChips .chip--on')?.dataset.stage;
  // Marcadores antes de redibujar, para destacar los que cambien
  const before = new Map([...$view.querySelectorAll('.mcard[data-k]')].map((c) => [c.dataset.k, c.dataset.s]));
  $view.innerHTML = html;
  if (refresh && activeStage) selectStage(activeStage);
  if (refresh) {
    $view.querySelectorAll('.mcard[data-k]').forEach((c) => {
      const old = before.get(c.dataset.k);
      if (old !== undefined && c.dataset.s && old !== c.dataset.s) c.classList.add('mcard--flash');
    });
  } else {
    $view.classList.remove('view-enter'); void $view.offsetWidth; $view.classList.add('view-enter');
  }
  $view.style.removeProperty('--ed');
  tintHero();

  setUpdated();
  scheduleRefresh();
}

/** Resplandor de la cabecera con el color dominante del escudo del campeón.
 *  Solo funciona con escudos servidos desde la propia web (los de Leaguepedia);
 *  con los de otro dominio el navegador no deja leer los píxeles y se queda el dorado. */
function tintHero() {
  const box = $view.querySelector('[data-tint]');
  if (!box) return;
  // Para leer el color hace falta una imagen del propio dominio: el escudo de Leaguepedia si existe
  let img = box.querySelector('img');
  if (box.dataset.tint) { img = new Image(); img.src = box.dataset.tint; }
  if (!img) return;
  const run = () => {
    try {
      const c = document.createElement('canvas'); c.width = c.height = 24;
      const ctx = c.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(img, 0, 0, 24, 24);
      const d = ctx.getImageData(0, 0, 24, 24).data;
      let r = 0, g = 0, b = 0, n = 0;
      for (let i = 0; i < d.length; i += 4) {
        const [R, G, B, A] = [d[i], d[i + 1], d[i + 2], d[i + 3]];
        const mx = Math.max(R, G, B), mn = Math.min(R, G, B);
        if (A < 200 || mx - mn < 40 || mx < 60) continue;   // ignora transparente, grises y negros
        r += R; g += G; b += B; n++;
      }
      if (n > 8) {
        const c = `rgb(${Math.round(r / n)}, ${Math.round(g / n)}, ${Math.round(b / n)})`;
        $view.querySelector('.hero--edition')?.style.setProperty('--glow', c);
        $view.style.setProperty('--ed', c);     // color del campeón / del equipo en toda la página
      }
    } catch { /* imagen de otro dominio: se queda el dorado */ }
  };
  if (img.complete && img.naturalWidth) run(); else img.addEventListener('load', run, { once: true });
}

function selectStage(stage) {
  document.querySelectorAll('#stageChips .chip').forEach((c) => c.classList.toggle('chip--on', c.dataset.stage === stage));
  document.querySelectorAll('.stage').forEach((s) => { s.hidden = s.dataset.stage !== stage; });
}

$view.addEventListener('click', (e) => {
  const chip = e.target.closest('#stageChips .chip');
  if (chip) selectStage(chip.dataset.stage);
  // Vídeo de la final: miniatura → reproductor; botones de partida → cambia de vídeo
  const thumb = e.target.closest('.fvideo__thumb');
  if (thumb) {
    const p = thumb.closest('.fvideo__player');
    playVideo(p, p.dataset.yt, Number(p.dataset.start));
  }
  const favBtn = e.target.closest('[data-fav]');
  if (favBtn) {
    const n = favBtn.dataset.fav;
    setFav(getFav() === n ? '' : n);
    route({ refresh: true });
  }
  const evoAdd = e.target.closest('[data-evo-add]');
  if (evoAdd) evoToggle(evoAdd.dataset.evoAdd, true);
  const evoDel = e.target.closest('[data-evo-del]');
  if (evoDel) evoToggle(evoDel.dataset.evoDel, false);
  const icsBtn = e.target.closest('[data-ics]');
  if (icsBtn) downloadIcs(icsBtn.dataset.ics);
  const game = e.target.closest('.fvideo__game');
  if (game) {
    const box = game.closest('.fvideo');
    box.querySelectorAll('.fvideo__game').forEach((b) => b.classList.toggle('chip--on', b === game));
    const yt = box.querySelector('.fvideo__yt');
    yt.href = `https://www.youtube.com/watch?v=${game.dataset.yt}${Number(game.dataset.start) ? '&t=' + game.dataset.start + 's' : ''}`;
    playVideo(box.querySelector('.fvideo__player'), game.dataset.yt, Number(game.dataset.start));
  }
});
$view.addEventListener('submit', (e) => {
  if (e.target.id === 'evoForm') {
    e.preventDefault();
    const v = String(new FormData(e.target).get('c') || '').trim();
    const c = evo.names.find((n) => norm(n) === norm(v));
    if (c) { evoToggle(c, true); e.target.reset(); }
    return;
  }
  if (e.target.id !== 'h2hForm') return;
  e.preventDefault();
  const f = new FormData(e.target);
  location.hash = `#/cara/${encodeURIComponent(f.get('a').trim())}/${encodeURIComponent(f.get('b').trim())}`;
});
$view.addEventListener('change', (e) => {
  // Pick'em: el campeón se guarda nada más elegirlo
  if (e.target.closest('#pkChamp')) { e.target.form.requestSubmit(); return; }
  if (e.target.id === 'tSelect') {
    const slug = location.hash.split('/')[2];
    location.hash = `#/liga/${slug}/${e.target.value}`;
  }
});

// =============================================================
//  BUSCADOR (cabecera)
// =============================================================
const $search = document.getElementById('search');
const $searchInput = document.getElementById('searchInput');
const $searchResults = document.getElementById('searchResults');
let searchIndex = null;
async function buildSearchIndex() {
  if (searchIndex) return searchIndex;
  await loadShorts();
  const teamNamesAll = new Set(Object.keys(shorts).map((n) => api.canonTeam(n)));
  const editions = await api.getNewWorldsEditions().catch(() => []);
  const years = [...new Set([...WORLDS_HISTORY.map((w) => w.year), ...editions.map((w) => w.year)])].sort((a, b) => b - a);
  searchIndex = [
    ...years.map((y) => { const h = WORLDS_HISTORY.find((w) => w.year === y); return { t: `Mundial ${y}`, sub: h ? `♛ ${h.champion} · ${h.city}` : 'Próximo / en curso', href: `#/mundial/${y}`, k: `mundial worlds ${y} ${h ? h.champion + ' ' + h.city + ' ' + h.host : ''}`, icon: '🏆' }; }),
    ...LEAGUES.map((l) => ({ t: l.name, sub: l.region, href: `#/liga/${l.slug}`, k: `liga ${l.name} ${l.region}`, icon: '🏟' })),
    ...[...teamNamesAll].map((n) => ({ t: displayName(n), sub: [shorts[n], api.teamNames(n).filter((x) => x !== n).join(', ')].filter(Boolean).join(' · ') || 'Equipo', href: teamHref(n), k: `${api.teamNames(n).map((x) => `${x} ${shorts[x] || ''}`).join(' ')}`, team: n })),
    ...Object.entries(await api.getPlayers().catch(() => ({}))).map(([k, p]) => {
      const ys = Object.keys(p.y); const lastY = p.y[ys[ys.length - 1]];
      return { t: displayName(k), sub: [ROLE_ES[String(p.r).toLowerCase()] || p.r, lastY ? displayName(lastY.t) : '', ys.length > 1 ? `${ys[0]}–${ys[ys.length - 1]}` : ys[0]].filter(Boolean).join(' · '),
        href: playerHref(k), k: `jugador ${k}`, icon: '👤', player: true };
    }),
    { t: 'Récords', sub: 'Récords de los Mundiales', href: '#/records', k: 'records récords estadísticas', icon: '📈' },
    { t: 'Pick\'em', sub: 'Pronósticos del Mundial con tus amigos', href: '#/pickem', k: 'pickem pick em pronosticos pronósticos porra apuestas amigos quiniela', icon: '🎯' },
    { t: 'Evolución del juego', sub: 'Campeones más presentes y duración de las partidas por año', href: '#/evolucion', k: 'evolucion evolución meta campeones gráfico historia', icon: '📊' },
    { t: 'Cara a cara', sub: 'Compara dos equipos', href: '#/cara', k: 'cara a cara head to head vs comparar', icon: '⚔' },
  ];
  return searchIndex;
}
const fold = (t) => String(t).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
async function runSearch() {
  const q = fold($searchInput.value.trim());
  if (!q) { $searchResults.innerHTML = '<li class="search__hint">Equipos, jugadores («Faker»), años («2019»), ligas, siglas («SKT», «G2»)…</li>'; return; }
  const idx = await buildSearchIndex();
  const words = q.split(/\s+/);
  const scored = idx.map((it) => {
    const k = fold(it.k + ' ' + it.t);
    if (!words.every((w) => k.includes(w))) return null;
    const t = fold(it.t);
    return { it, score: (t === q ? 0 : t.startsWith(q) ? 1 : 2) + (it.team ? 0.5 : it.player ? 1.6 : 0) };
  }).filter(Boolean).sort((a, b) => a.score - b.score).slice(0, 12);
  $searchResults.innerHTML = scored.length
    ? scored.map(({ it }, i) => `<li><a class="search__item ${i === 0 ? 'is-active' : ''}" href="${it.href}">
        <span class="search__icon">${it.team ? teamBadge(it.team) : it.icon}</span>
        <span class="search__text"><b>${esc(it.t)}</b><small>${esc(it.sub)}</small></span></a></li>`).join('')
    : '<li class="search__hint">Sin resultados.</li>';
}
function openSearch() { $search.hidden = false; $searchInput.value = ''; runSearch(); $searchInput.focus(); }
function closeSearch() { $search.hidden = true; }
document.getElementById('searchBtn').addEventListener('click', () => ($search.hidden ? openSearch() : closeSearch()));
$searchInput.addEventListener('input', runSearch);
$searchInput.addEventListener('keydown', (e) => {
  const items = [...$searchResults.querySelectorAll('.search__item')];
  const i = items.findIndex((x) => x.classList.contains('is-active'));
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault();
    const j = Math.max(0, Math.min(items.length - 1, i + (e.key === 'ArrowDown' ? 1 : -1)));
    items.forEach((x, k) => x.classList.toggle('is-active', k === j));
  } else if (e.key === 'Enter' && items[Math.max(0, i)]) {
    location.hash = items[Math.max(0, i)].getAttribute('href'); closeSearch();
  } else if (e.key === 'Escape') closeSearch();
});
$searchResults.addEventListener('click', (e) => { if (e.target.closest('a')) closeSearch(); });
document.addEventListener('keydown', (e) => {
  if (e.key === '/' && !/input|textarea|select/i.test(document.activeElement.tagName)) { e.preventDefault(); openSearch(); }
});
document.addEventListener('click', (e) => { if (!$search.hidden && !e.target.closest('#search, #searchBtn')) closeSearch(); });

document.addEventListener('visibilitychange', () => {
  if (!document.hidden && lastUpdate && Date.now() - lastUpdate > CONFIG.REFRESH_LIVE_MS) route({ refresh: true });
});
// =============================================================
//  MODO CLARO / OSCURO
// =============================================================
const THEME_KEY = 'lolweb:theme';
function applyTheme(t) {
  if (t === 'light') document.documentElement.dataset.theme = 'light'; else delete document.documentElement.dataset.theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', t === 'light' ? '#F4F1EA' : '#0A0E14');
}
document.getElementById('themeBtn')?.addEventListener('click', () => {
  const t = document.documentElement.dataset.theme === 'light' ? 'dark' : 'light';
  try { localStorage.setItem(THEME_KEY, t); } catch { /* sin almacenamiento */ }
  applyTheme(t);
});
applyTheme(document.documentElement.dataset.theme === 'light' ? 'light' : 'dark');

// =============================================================
//  WEB INSTALABLE: service worker (hemeroteca sin conexión)
// =============================================================
if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}

window.addEventListener('hashchange', () => route());
route();
