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
function logoOf(name) {
  if (isTbd(name)) return '';
  // Mismo nombre, nombre sin la aclaración de Leaguepedia, o mismas siglas
  const lole = logoByName[norm(name)] || logoByName[norm(displayName(name))] || logoByCode[norm(shorts[name])];
  if (lole) return lole;                                   // 1º lolesports (escudo actual)
  if (lpLogos[name]) return `${CONFIG.DATA_PATH}/logos/${encodeURIComponent(lpLogos[name])}`; // 2º Leaguepedia
  return '';
}

function teamBadge(name) {
  const src = logoOf(name);
  if (src) {
    return `<img class="logo" src="${esc(src.replace(/^http:/, 'https:'))}" referrerpolicy="no-referrer" alt="" loading="lazy" onerror="this.outerHTML='<span class=&quot;logo logo--txt&quot;>${esc(shortOf(name).slice(0, 4))}</span>'">`;
  }
  return `<span class="logo logo--txt">${esc(isTbd(name) ? '?' : shortOf(name).slice(0, 4))}</span>`;
}

function loading(msg = 'Cargando datos…') {
  return `<div class="state"><div class="spinner"></div><p>${esc(msg)}</p></div>`;
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
  $status.innerHTML = `<span class="dot ${liveNow ? 'dot--live' : ''}"></span><span class="status__txt">${liveNow ? 'En juego · ' : ''}${txt}</span>`;
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
    } else if (e.state === 'done') {
      out.state = 'done';
      out.score1 = a.wins ?? m.score1; out.score2 = b.wins ?? m.score2;
      out.winner = a.outcome === 'win' ? 1 : b.outcome === 'win' ? 2 : m.winner;
    }
    return out;
  });
}

function loleRow(e) {
  const [a, b] = e.teams;
  const live = e.state === 'live';
  const mid = live || e.state === 'done'
    ? `<span class="score ${live ? 'score--live' : ''}">${a.wins ?? 0}<i>–</i>${b.wins ?? 0}</span>`
    : `<span class="time">${e.start ? fmtTime(e.start) : 'vs'}</span>`;
  const img = (t) => (t.image
    ? `<img class="logo" src="${esc(t.image.replace(/^http:/, 'https:'))}" alt="" loading="lazy">`
    : `<span class="logo logo--txt">${esc((t.code || initials(t.name)).slice(0, 4))}</span>`);
  return `<div class="match ${live ? 'match--live' : ''}">
    <div class="match__meta">${live ? '<span class="tag tag--live">EN DIRECTO</span>' : `<span>${e.start ? fmtDate(e.start) : ''}</span>`}
      <span class="muted">${esc([e.league, e.block].filter(Boolean).join(' · '))}${e.bestOf ? ' · Bo' + e.bestOf : ''}</span></div>
    <div class="match__teams">
      <div class="team ${e.state === 'done' && a.outcome === 'loss' ? 'team--lost' : ''}">${img(a)}<span class="team__name">${esc(a.name)}</span><span class="team__code">${esc(a.code)}</span></div>
      ${mid}
      <div class="team team--right ${e.state === 'done' && b.outcome === 'loss' ? 'team--lost' : ''}"><span class="team__code">${esc(b.code)}</span><span class="team__name">${esc(b.name)}</span>${img(b)}</div>
    </div>
  </div>`;
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

function matchRow(m, { label = '' } = {}) {
  const live = m.state === 'live';
  const done = m.state === 'done';
  const hasScore = m.score1 != null || m.score2 != null;
  const s = (n) => (n == null ? 0 : n);
  let mid;
  if (done || (live && hasScore)) mid = `<span class="score ${live ? 'score--live' : ''}">${s(m.score1)}<i>–</i>${s(m.score2)}</span>`;
  else if (m.state === 'pending') mid = `<span class="time muted" title="Pendiente de que Leaguepedia publique el resultado">…</span>`;
  else mid = `<span class="time">${live ? 'vs' : m.date ? fmtTime(m.date) : 'vs'}</span>`;
  const w1 = done && m.winner === 2 || (done && !m.winner && m.score2 > m.score1);
  const w2 = done && m.winner === 1 || (done && !m.winner && m.score1 > m.score2);
  const name = (n) => (isTbd(n) ? 'Por decidir' : displayName(n));
  const tag = live ? '<span class="tag tag--live">EN JUEGO</span>' : `<span>${m.date ? fmtDate(m.date) : ''}</span>`;
  return `<div class="match ${live ? 'match--live' : ''}">
    <div class="match__meta">${tag}<span class="muted">${esc(label)}${label && m.bestOf ? ' · ' : ''}${m.bestOf ? 'Bo' + m.bestOf : ''}</span></div>
    <div class="match__teams">
      <div class="team ${w1 ? 'team--lost' : ''}">${teamBadge(m.team1)}<span class="team__name">${esc(name(m.team1))}</span><span class="team__code">${esc(isTbd(m.team1) ? '?' : shortOf(m.team1))}</span></div>
      ${mid}
      <div class="team team--right ${w2 ? 'team--lost' : ''}"><span class="team__code">${esc(isTbd(m.team2) ? '?' : shortOf(m.team2))}</span><span class="team__name">${esc(name(m.team2))}</span>${teamBadge(m.team2)}</div>
    </div>
  </div>`;
}

function matchesBlock(matches, { upcomingN = 8, doneN = 10, label = (m) => tabEs(m.tab) } = {}) {
  const live = matches.filter((m) => m.state === 'live');
  const upcoming = matches.filter((m) => m.state === 'upcoming');
  const done = matches.filter((m) => m.state === 'done' || m.state === 'pending').reverse();
  if (live.length) liveNow = true;
  const col = (title, list, empty) => `<section class="panel">
      <h3 class="panel__title">${title}</h3>
      ${list.length ? list.map((m) => matchRow(m, { label: label(m) })).join('') : `<p class="muted pad">${empty}</p>`}
    </section>`;
  return `${live.length ? col('En juego', live, '') : ''}
    <div class="grid2">
      ${col('Próximos partidos', upcoming.slice(0, upcomingN), 'No hay partidos programados.')}
      ${col('Últimos resultados', done.slice(0, doneN), 'Todavía no hay resultados.')}
    </div>`;
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
          <h1 class="hero__title">Mundial ${cur.year}</h1>
          <p class="hero__sub">Resultados que se actualizan solos · <a href="#/mundial/${cur.year}">Ver la edición completa →</a></p>
        </div>
        ${ms.length ? matchesBlock(ms, { label: (m) => [m.stage, tabEs(m.tab)].filter(Boolean).join(' · ') }) : '<p class="muted">Aún no hay partidos publicados.</p>'}`;
    }
  } catch (err) {
    worldsHtml = `<div class="notice">No se ha podido consultar el Mundial en curso (${esc(err.message)}).</div>`;
  }

  if (!worldsHtml.includes('class="hero"')) {
    const next = await api.getUpcomingWorlds().catch(() => null);
    if (next) {
      const days = Math.ceil((new Date(next.start + 'T00:00:00Z') - Date.now()) / 86400_000);
      worldsHtml = `<div class="hero">
        <div class="hero__label">Campeonato del Mundo</div>
        <h1 class="hero__title">${leagueLogo('worlds', 'hero__logo')}Mundial ${next.year}</h1>
        <p class="hero__sub">Empieza el ${fmtDate(next.start + 'T12:00:00Z')}${next.country ? ' en ' + esc(COUNTRY_ES[next.country] || next.country) : ''}
          · ${days <= 1 ? '¡mañana!' : `faltan ${days} días`}. Vigente campeón: ${esc(last.champion)}.</p>
        <a class="btn btn--gold" href="#/mundial/${next.year}">Ver calendario del Mundial ${next.year}</a>
      </div>` + worldsHtml;
    }
  }
  if (!worldsHtml.includes('class="hero"')) {
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
      todayHtml = `<section class="panel"><h3 class="panel__title">Ligas · ayer, hoy y mañana</h3>
        ${[...live, ...rest].map((m) => matchRow(m, { label: m.league.name })).join('')}</section>`;
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
    ? `<section class="panel panel--top"><h3 class="panel__title">En directo ahora · lolesports</h3>
      ${liveList.map(loleRow).join('')}
      ${hidden > 0 ? `<p class="muted small pad">Y ${hidden} partido${hidden > 1 ? 's' : ''} más en directo en otras competiciones.</p>` : ''}</section>`
    : '';

  return `${liveHtml}${worldsHtml}${todayHtml}
    <h2 class="h2">Ligas</h2>
    <div class="lgrid">${leagueCards}</div>`;
}

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

  const now = Date.now();
  const extraCards = extra.slice().reverse().map((w) => {
    const started = w.start && new Date(w.start) <= now;
    const ended = w.end && new Date(w.end).getTime() + 86400_000 < now;
    const status = ended ? 'Finalizado' : started ? 'En curso' : 'Próximamente';
    return `<a class="wcard wcard--new" href="#/mundial/${w.year}">
      <div class="wcard__year">${w.year}</div>
      <div class="wcard__body">
        <span class="tag ${started && !ended ? 'tag--live' : ''}">${status}</span>
        <div class="wcard__host">${esc(COUNTRY_ES[w.country] || w.country || '')}</div>
        <div class="muted small">${w.start ? fmtDate(w.start) : ''}${w.end ? ' – ' + fmtDate(w.end) : ''}</div>
      </div>
    </a>`;
  }).join('');

  const histCards = WORLDS_HISTORY.slice().reverse().map((w) => `
    <a class="wcard" href="#/mundial/${w.year}">
      <div class="wcard__year">${w.year}</div>
      <div class="wcard__body">
        <div class="wcard__champ"><span class="crown">♛</span>${esc(w.champion)} <span class="region">${w.champRegion}</span></div>
        <div class="wcard__final">${w.score} vs ${esc(w.runnerUp)}</div>
        <div class="muted small">${esc(w.city)}, ${esc(w.host)}</div>
      </div>
    </a>`).join('');

  const byOrg = {};
  const byRegion = {};
  for (const w of WORLDS_HISTORY) {
    const org = ORG_ALIASES[w.champion] || w.champion;
    byOrg[org] = (byOrg[org] || []).concat(w.year);
    byRegion[w.champRegion] = (byRegion[w.champRegion] || 0) + 1;
  }
  const orgRows = Object.entries(byOrg).sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]));
  const max = orgRows[0][1].length;
  const regionRows = Object.entries(byRegion).sort((a, b) => b[1] - a[1]);
  const total = WORLDS_HISTORY.length;

  return `<div class="hero hero--small">
      <div class="hero__label">Hemeroteca</div>
      <h1 class="hero__title">Todos los Mundiales</h1>
      <p class="hero__sub">Desde Jönköping 2011 hasta hoy. Las ediciones nuevas se añaden solas desde Leaguepedia.</p>
    </div>
    ${note}
    <div class="wgrid">${extraCards}${histCards}</div>

    <h2 class="h2">Palmarés</h2>
    <div class="grid2">
      <section class="panel">
        <h3 class="panel__title">Títulos por organización</h3>
        ${orgRows.map(([org, years]) => `<div class="bar">
            <span class="bar__label">${esc(org)}</span>
            <span class="bar__track"><span class="bar__fill" style="width:${(years.length / max) * 100}%"></span></span>
            <span class="bar__val">${years.length}</span>
            <span class="bar__years muted small">${years.join(', ')}</span>
          </div>`).join('')}
        <p class="muted small pad">SK Telecom T1 cuenta como T1; Samsung White como Samsung Galaxy; DAMWON y DWG KIA como Dplus KIA.</p>
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
}

// ---------- Edición concreta ----------
async function viewEdition(year, opts) {
  year = Number(year);
  const hist = WORLDS_HISTORY.find((w) => w.year === year);
  const finished = !!hist;
  const pageUrl = api.leaguepediaUrl(hist?.page || `${year} Season World Championship`);

  let matches;
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

  const phases = buildPhases(matches, year);
  const focus = matches.find((m) => m.state === 'live') || matches.find((m) => m.state === 'upcoming');
  const active = (focus && phases.find((ph) => ph.matches.includes(focus))?.name)
    || phases.find((ph) => ph.name === 'Eliminatorias')?.name
    || phases[phases.length - 1].name;

  const tabsNav = phases.map((ph) => `<button class="chip ${ph.name === active ? 'chip--on' : ''}" data-stage="${esc(ph.name)}">${esc(ph.name)}</button>`).join('');
  const panels = phases.map((ph) => `<div class="stage" data-stage="${esc(ph.name)}" ${ph.name === active ? '' : 'hidden'}>
      ${ph.name === 'Eliminatorias' ? renderKnockout(ph.matches, year, hist) : renderRounds(ph.matches)}
    </div>`).join('');

  return headerEdition(year, hist, computed) + `
    <div class="chips" id="stageChips">${tabsNav}</div>
    ${panels}
    <p class="muted small source">Datos: <a href="${pageUrl}" target="_blank" rel="noopener">Leaguepedia</a> (CC BY-SA).</p>`;
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

/** Tarjeta compacta de partido: dos filas (equipo · marcador), ganador resaltado. */
function matchCard(m, { showDate = true } = {}) {
  const live = m.state === 'live';
  const done = m.state === 'done';
  const hasScore = done || (live && (m.score1 != null || m.score2 != null));
  const win = done ? (m.winner || (m.score1 > m.score2 ? 1 : m.score2 > m.score1 ? 2 : 0)) : 0;
  const row = (team, score, n) => `<div class="mcard__team ${win === n ? 'is-win' : win ? 'is-lose' : ''}">
      ${teamBadge(team)}<span class="mcard__name" title="${esc(team)}">${esc(isTbd(team) ? 'Por decidir' : displayName(team))}</span>
      <span class="mcard__score">${hasScore ? (score ?? 0) : ''}</span></div>`;
  const when = live ? '<span class="tag tag--live">EN JUEGO</span>'
    : m.state === 'pending' ? '<span>Pendiente de resultado</span>'
    : `<span>${showDate && m.date ? fmtDate(m.date) + (done ? '' : ' · ' + fmtTime(m.date)) : (m.date && !done ? fmtTime(m.date) : '')}</span>`;
  return `<div class="mcard ${live ? 'mcard--live' : ''}">
    <div class="mcard__meta">${when}<span>${m.bestOf ? 'Bo' + m.bestOf : ''}</span></div>
    ${row(m.team1, m.score1, 1)}${row(m.team2, m.score2, 2)}
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
      <div class="final__name">${esc(isTbd(team) ? 'Por decidir' : displayName(team))}</div>
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
  </section>`;
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

function headerEdition(year, hist, computed) {
  const info = hist || computed;
  const prev = year > 2011 ? `<a class="navlink" href="#/mundial/${year - 1}">← ${year - 1}</a>` : '<span></span>';
  const next = `<a class="navlink" href="#/mundial/${year + 1}">${year + 1} →</a>`;
  return `<div class="edition-nav">${prev}<a class="navlink" href="#/mundiales">Hemeroteca</a>${next}</div>
    <div class="hero hero--small">
      <div class="hero__label">Mundial ${year}${hist ? ` · ${esc(hist.city)}, ${esc(hist.host)}` : ''}</div>
      ${info ? `<h1 class="hero__title"><span class="crown">♛</span> ${esc(info.champion)}</h1>
        <p class="hero__sub">Final: ${esc(info.champion)} ${info.score} ${esc(info.runnerUp)}</p>`
      : `<h1 class="hero__title">Mundial ${year}</h1><p class="hero__sub">Edición en curso o por disputar. Los resultados se actualizan solos.</p>`}
    </div>`;
}

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
  const standingsHtml = table.length ? `<section class="panel">
      <h3 class="panel__title">Balance de series · ${esc(current.name)}</h3>
      <table class="table"><thead><tr><th>#</th><th>Equipo</th><th>V</th><th>D</th><th title="Diferencia de partidas">±</th></tr></thead><tbody>
      ${table.map((t, i) => `<tr><td class="pos">${i + 1}</td>
        <td><div class="team">${teamBadge(t.team)}<span class="team__name">${esc(displayName(t.team))}</span><span class="team__code">${esc(shortOf(t.team))}</span></div></td>
        <td>${t.w}</td><td>${t.l}</td><td>${t.gw - t.gl > 0 ? '+' : ''}${t.gw - t.gl}</td></tr>`).join('')}
      </tbody></table>
      <p class="muted small pad">Calculado con los resultados del torneo. En playoffs refleja series ganadas y perdidas, no la posición final.</p>
    </section>` : '';

  const body = matches.length ? matchesBlock(matches) : '<div class="state"><p>Este torneo aún no tiene partidos publicados.</p></div>';

  return leagueHeader(meta, select) + body +
    (standingsHtml ? `<h2 class="h2">Clasificación</h2>${standingsHtml}` : '') +
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
  const token = ++renderToken;
  const hash = location.hash.replace(/^#\/?/, '');
  const [section, param, extra] = hash.split('/');
  liveNow = false;

  document.querySelectorAll('.nav a').forEach((a) => {
    const target = a.getAttribute('href').replace('#/', '');
    a.classList.toggle('active', target === (section === 'mundial' ? 'mundiales' : section === 'liga' ? 'ligas' : section || ''));
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
    dataChecked = meta?.checked ? new Date(meta.checked) : null;
    switch (section) {
      case 'mundiales': html = await viewWorlds(opts); break;
      case 'mundial': html = await viewEdition(param, opts); break;
      case 'ligas': html = viewLeagues(); break;
      case 'liga': html = await viewLeague(param, opts, extra); break;
      default: html = await viewHome(opts);
    }
  } catch (err) {
    html = errorBox(err);
  }
  if (token !== renderToken) return;

  const activeStage = document.querySelector('#stageChips .chip--on')?.dataset.stage;
  $view.innerHTML = html;
  if (refresh && activeStage) selectStage(activeStage);

  setUpdated();
  scheduleRefresh();
}

function selectStage(stage) {
  document.querySelectorAll('#stageChips .chip').forEach((c) => c.classList.toggle('chip--on', c.dataset.stage === stage));
  document.querySelectorAll('.stage').forEach((s) => { s.hidden = s.dataset.stage !== stage; });
}

$view.addEventListener('click', (e) => {
  const chip = e.target.closest('#stageChips .chip');
  if (chip) selectStage(chip.dataset.stage);
});
$view.addEventListener('change', (e) => {
  if (e.target.id === 'tSelect') {
    const slug = location.hash.split('/')[2];
    location.hash = `#/liga/${slug}/${e.target.value}`;
  }
});

document.addEventListener('visibilitychange', () => {
  if (!document.hidden && lastUpdate && Date.now() - lastUpdate > CONFIG.REFRESH_LIVE_MS) route({ refresh: true });
});
window.addEventListener('hashchange', () => route());
route();
