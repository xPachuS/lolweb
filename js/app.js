// =============================================================
//  App: enrutado por hash, vistas y refresco automático
// =============================================================
import { CONFIG, LEAGUES, WORLDS_SLUG, WORLDS_HISTORY, ORG_ALIASES, REGION_NAMES } from './config.js';
import * as api from './api.js';

const $view = document.getElementById('view');
const $status = document.getElementById('status');

let refreshTimer = null;
let lastUpdate = null;
let liveNow = false;
let renderToken = 0;

// ---------- utilidades ----------
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmtDate = (d) => new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'short' }).format(new Date(d));
const fmtTime = (d) => new Intl.DateTimeFormat('es-ES', { hour: '2-digit', minute: '2-digit' }).format(new Date(d));
const fmtDay = (d) => new Intl.DateTimeFormat('es-ES', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date(d));
const initials = (name) => (name || '?').replace(/[^A-Za-z0-9 ]/g, '').split(/\s+/).filter(Boolean).slice(0, 3).map((w) => w[0]).join('').toUpperCase() || '?';

function teamBadge(team) {
  if (team?.image) {
    const src = team.image.replace(/^http:/, 'https:');
    return `<img class="logo" src="${esc(src)}" alt="" loading="lazy" onerror="this.replaceWith(Object.assign(document.createElement('span'),{className:'logo logo--txt',textContent:'${esc(initials(team.name))}'}))">`;
  }
  return `<span class="logo logo--txt">${esc(initials(team?.name))}</span>`;
}

function loading(msg = 'Cargando datos…') {
  return `<div class="state"><div class="spinner"></div><p>${esc(msg)}</p></div>`;
}

function errorBox(err, extra = '') {
  console.error(err);
  return `<div class="state state--error">
    <p><strong>No se han podido cargar los datos.</strong></p>
    <p class="muted">${esc(err?.message || err)}</p>${extra}
    <button class="btn" onclick="location.reload()">Reintentar</button>
  </div>`;
}

function setUpdated() {
  lastUpdate = Date.now();
  paintStatus();
}

function paintStatus() {
  if (!lastUpdate) { $status.innerHTML = ''; return; }
  const s = Math.round((Date.now() - lastUpdate) / 1000);
  const ago = s < 60 ? `hace ${s} s` : `hace ${Math.round(s / 60)} min`;
  $status.innerHTML = `<span class="dot ${liveNow ? 'dot--live' : ''}"></span><span class="status__txt">${liveNow ? 'En directo · ' : ''}Actualizado ${ago}</span>`;
  $status.title = `Actualizado ${ago}`;
}
setInterval(paintStatus, 5000);

function scheduleRefresh() {
  clearTimeout(refreshTimer);
  refreshTimer = setTimeout(() => route({ refresh: true }), liveNow ? CONFIG.REFRESH_LIVE_MS : CONFIG.REFRESH_IDLE_MS);
}

// ---------- partidos de lolesports ----------
function eventRow(e, { showLeague = false } = {}) {
  const m = e.match;
  const [a, b] = m.teams;
  const live = e.state === 'inProgress';
  const done = e.state === 'completed';
  const wA = a.result?.outcome === 'win';
  const wB = b.result?.outcome === 'win';
  const mid = done || live
    ? `<span class="score ${live ? 'score--live' : ''}">${a.result?.gameWins ?? 0}<i>–</i>${b.result?.gameWins ?? 0}</span>`
    : `<span class="time">${fmtTime(e.startTime)}</span>`;
  const bo = m.strategy?.count ? `Bo${m.strategy.count}` : '';
  return `<div class="match ${live ? 'match--live' : ''}">
    <div class="match__meta">
      ${live ? '<span class="tag tag--live">EN DIRECTO</span>' : `<span>${fmtDate(e.startTime)}</span>`}
      <span class="muted">${esc(showLeague ? e.league?.name : e.blockName)} ${bo ? '· ' + bo : ''}</span>
    </div>
    <div class="match__teams">
      <div class="team ${done && !wA ? 'team--lost' : ''}">${teamBadge(a)}<span class="team__name">${esc(a.name)}</span><span class="team__code">${esc(a.code)}</span></div>
      ${mid}
      <div class="team team--right ${done && !wB ? 'team--lost' : ''}"><span class="team__code">${esc(b.code)}</span><span class="team__name">${esc(b.name)}</span>${teamBadge(b)}</div>
    </div>
  </div>`;
}

function splitEvents(events) {
  const live = events.filter((e) => e.state === 'inProgress');
  const upcoming = events.filter((e) => e.state === 'unstarted');
  const done = events.filter((e) => e.state === 'completed').reverse();
  return { live, upcoming, done };
}

function eventsBlock(events, { upcomingN = 6, doneN = 10, showLeague = false } = {}) {
  const { live, upcoming, done } = splitEvents(events);
  liveNow = liveNow || live.length > 0;
  const col = (title, list, empty) => `<section class="panel">
      <h3 class="panel__title">${title}</h3>
      ${list.length ? list.map((e) => eventRow(e, { showLeague })).join('') : `<p class="muted pad">${empty}</p>`}
    </section>`;
  return `${live.length ? col('En directo', live, '') : ''}
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
  let liveHtml = '';

  try {
    const league = await api.getLeagueBySlug(WORLDS_SLUG);
    const tournaments = await api.getTournaments(league.id);
    const current = api.pickCurrentTournament(tournaments);
    const now = Date.now();
    const active = current && now <= new Date(current.endDate).getTime() + 3 * 86400_000;
    if (active) {
      const year = new Date(current.startDate).getFullYear();
      const events = await api.getSchedule(league.id, opts);
      const yearEvents = events.filter((e) => new Date(e.startTime) >= new Date(current.startDate) - 86400_000);
      worldsHtml = `<div class="hero">
          <div class="hero__label">Campeonato del Mundo</div>
          <h1 class="hero__title">Mundial ${year}</h1>
          <p class="hero__sub">Resultados en tiempo real · <a href="#/mundial/${year}">Ver la edición completa →</a></p>
        </div>
        ${eventsBlock(yearEvents, { upcomingN: 8, doneN: 8 })}`;
    }
  } catch (err) {
    worldsHtml = `<div class="notice">No se ha podido conectar con lolesports para el Mundial en curso (${esc(err.message)}).</div>`;
  }

  if (!worldsHtml) {
    worldsHtml = `<div class="hero">
        <div class="hero__label">Campeonato del Mundo</div>
        <h1 class="hero__title">Vigente campeón: ${esc(last.champion)}</h1>
        <p class="hero__sub">Mundial ${last.year} · ${esc(last.city)} · ${esc(last.champion)} ${last.score} ${esc(last.runnerUp)}.
        El próximo Mundial aparecerá aquí automáticamente en cuanto empiece.</p>
        <a class="btn btn--gold" href="#/mundiales">Explorar la hemeroteca</a>
      </div>`;
  }

  try {
    const live = await api.getLive(opts);
    const others = live.filter((e) => e.league?.slug !== WORLDS_SLUG);
    if (others.length) {
      liveNow = true;
      liveHtml = `<section class="panel"><h3 class="panel__title">Ahora mismo en otras ligas</h3>
        ${others.map((e) => eventRow(e, { showLeague: true })).join('')}</section>`;
    }
  } catch { /* no es crítico */ }

  const leagueCards = LEAGUES.slice(0, 6).map((l) => `
    <a class="lcard" href="#/liga/${l.slug}" style="--accent:${l.color}">
      <span class="lcard__name">${esc(l.name)}</span><span class="lcard__region">${esc(l.region)}</span>
    </a>`).join('');

  return `${worldsHtml}${liveHtml}
    <h2 class="h2">Ligas</h2>
    <div class="lgrid">${leagueCards}</div>`;
}

// ---------- Hemeroteca ----------
const COUNTRY_ES = { 'United States': 'EE. UU.', 'China': 'China', 'South Korea': 'Corea del Sur', 'Korea': 'Corea del Sur', 'United Kingdom': 'Reino Unido', 'Germany': 'Alemania', 'France': 'Francia', 'Spain': 'España', 'Canada': 'Canadá', 'Brazil': 'Brasil', 'Japan': 'Japón', 'Vietnam': 'Vietnam' };
async function viewWorlds() {
  let extra = [];
  let note = '';
  try {
    extra = await api.getNewWorldsEditions();
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

  // Palmarés
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
const TAB_ES = {
  'Quarterfinals': 'Cuartos de final', 'Semifinals': 'Semifinales', 'Finals': 'Final', 'Final': 'Final',
  'Round 1': 'Ronda 1', 'Round 2': 'Ronda 2', 'Round 3': 'Ronda 3', 'Round 4': 'Ronda 4', 'Round 5': 'Ronda 5',
  'Tiebreakers': 'Desempates',
};
const tabEs = (t) => TAB_ES[t] || t.replace(/^Day (\d+)/, 'Día $1').replace(/^Week (\d+)/, 'Semana $1').replace(/^Group ([A-Z])/, 'Grupo $1');

function lpMatchRow(m) {
  const done = m.winner != null;
  const s = (n) => (n == null ? '–' : n);
  return `<div class="match">
    <div class="match__meta">
      <span>${m.date ? fmtDate(m.date) : ''}</span>
      <span class="muted">${m.bestOf ? 'Bo' + m.bestOf : ''}</span>
    </div>
    <div class="match__teams">
      <div class="team ${done && m.winner !== 1 ? 'team--lost' : ''}">${teamBadge({ name: m.team1 })}<span class="team__name">${esc(m.team1 || 'Por decidir')}</span></div>
      ${done || m.score1 != null ? `<span class="score">${s(m.score1)}<i>–</i>${s(m.score2)}</span>` : `<span class="time">${m.date ? fmtTime(m.date) : 'vs'}</span>`}
      <div class="team team--right ${done && m.winner !== 2 ? 'team--lost' : ''}"><span class="team__name">${esc(m.team2 || 'Por decidir')}</span>${teamBadge({ name: m.team2 })}</div>
    </div>
  </div>`;
}

async function viewEdition(year, opts) {
  year = Number(year);
  const hist = WORLDS_HISTORY.find((w) => w.year === year);
  const finished = !!hist;
  const pageUrl = api.leaguepediaUrl(hist?.page || `${year} Season World Championship`);

  let matches;
  try {
    matches = await api.getWorldsMatches(year, { finished, force: opts.refresh && !finished });
  } catch (err) {
    return headerEdition(year, hist) + errorBox(err, `<p><a href="${pageUrl}" target="_blank" rel="noopener">Ver la edición en Leaguepedia ↗</a></p>`);
  }

  if (!finished) {
    const now = Date.now();
    liveNow = matches.some((m) => m.winner == null && m.date && m.date <= now && now - m.date < 6 * 3600_000);
  }

  // Campeón calculado para ediciones nuevas: ganador de la última serie decidida de eliminatorias
  let computed = null;
  if (!hist) {
    const finalM = matches.filter((m) => /final/i.test(m.tab) && !/semi|quarter/i.test(m.tab) && m.winner).pop();
    if (finalM) computed = { champion: finalM.winner === 1 ? finalM.team1 : finalM.team2, runnerUp: finalM.winner === 1 ? finalM.team2 : finalM.team1, score: `${Math.max(finalM.score1, finalM.score2)}–${Math.min(finalM.score1, finalM.score2)}` };
  }

  if (!matches.length) {
    return headerEdition(year, hist, computed) + `<div class="state"><p>Todavía no hay partidos publicados para este Mundial.</p>
      <p><a href="${pageUrl}" target="_blank" rel="noopener">Ver en Leaguepedia ↗</a></p></div>`;
  }

  // Agrupar por fase y, dentro, por pestaña (día / ronda)
  const stages = new Map();
  for (const m of matches) {
    if (!stages.has(m.stage)) stages.set(m.stage, new Map());
    const tabs = stages.get(m.stage);
    if (!tabs.has(m.tab)) tabs.set(m.tab, []);
    tabs.get(m.tab).push(m);
  }
  const order = ['Play-In', 'Fase de grupos', 'Fase suiza', 'Fase principal', 'Eliminatorias'];
  const stageList = [...stages.keys()].sort((a, b) => (order.indexOf(a) + 99) % 99 - (order.indexOf(b) + 99) % 99);
  const active = stageList[stageList.length - 1];

  const tabsNav = stageList.map((s) => `<button class="chip ${s === active ? 'chip--on' : ''}" data-stage="${esc(s)}">${esc(s)}</button>`).join('');
  const stagePanels = stageList.map((s) => {
    const groups = [...stages.get(s).entries()];
    return `<div class="stage" data-stage="${esc(s)}" ${s === active ? '' : 'hidden'}>
      <div class="cols">${groups.map(([tab, list]) => `<section class="panel">
          <h3 class="panel__title">${esc(tabEs(tab) || s)}</h3>${list.map(lpMatchRow).join('')}
        </section>`).join('')}</div>
    </div>`;
  }).join('');

  return headerEdition(year, hist, computed) + `
    <div class="chips" id="stageChips">${tabsNav}</div>
    ${stagePanels}
    <p class="muted small source">Datos: <a href="${pageUrl}" target="_blank" rel="noopener">Leaguepedia</a> (CC BY-SA).</p>`;
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
async function viewLeagues() {
  let images = {};
  try {
    const leagues = await api.getLeagues();
    for (const l of leagues) images[l.slug] = l.image;
  } catch { /* sin logos */ }
  return `<div class="hero hero--small">
      <div class="hero__label">Competiciones</div>
      <h1 class="hero__title">Ligas</h1>
      <p class="hero__sub">Clasificación, calendario y resultados de cada liga, directamente de lolesports.</p>
    </div>
    <div class="lgrid lgrid--big">${LEAGUES.map((l) => `
      <a class="lcard" href="#/liga/${l.slug}" style="--accent:${l.color}">
        ${images[l.slug] ? `<img class="lcard__img" src="${esc(images[l.slug].replace(/^http:/, 'https:'))}" alt="" loading="lazy">` : ''}
        <span class="lcard__name">${esc(l.name)}</span><span class="lcard__region">${esc(l.region)}</span>
      </a>`).join('')}</div>`;
}

async function viewLeague(slug, opts, tournamentId) {
  const meta = LEAGUES.find((l) => l.slug === slug) || { name: slug, region: '' };
  let league, tournaments, current;
  try {
    league = await api.getLeagueBySlug(slug);
    if (!league) throw new Error(`La liga "${slug}" no existe en lolesports`);
    tournaments = (await api.getTournaments(league.id)).slice().sort((a, b) => new Date(b.startDate) - new Date(a.startDate));
    current = tournaments.find((t) => t.id === tournamentId) || api.pickCurrentTournament(tournaments);
  } catch (err) {
    return errorBox(err);
  }

  const [standings, schedule] = await Promise.allSettled([
    current ? api.getStandings(current.id, { force: opts.refresh }) : Promise.resolve([]),
    api.getSchedule(league.id, { force: opts.refresh }),
  ]);

  const select = `<select id="tSelect" class="select">${tournaments.slice(0, 20).map((t) =>
    `<option value="${t.id}" ${t.id === current?.id ? 'selected' : ''}>${esc(prettySlug(t.slug))}</option>`).join('')}</select>`;

  let standingsHtml = '';
  if (standings.status === 'fulfilled') {
    const stages = standings.value;
    standingsHtml = stages.map((st) => st.sections.map((sec) => {
      const rows = (sec.rankings || []).flatMap((r) => r.teams.map((t) => ({ ...t, ordinal: r.ordinal })));
      if (!rows.length) return '';
      return `<section class="panel">
        <h3 class="panel__title">${esc(st.name)}${sec.name && sec.name !== st.name ? ' · ' + esc(sec.name) : ''}</h3>
        <table class="table"><thead><tr><th>#</th><th>Equipo</th><th>V</th><th>D</th></tr></thead><tbody>
        ${rows.map((t) => `<tr><td class="pos">${t.ordinal}</td><td><div class="team">${teamBadge(t)}<span class="team__name">${esc(t.name)}</span></div></td>
          <td>${t.record?.wins ?? '–'}</td><td>${t.record?.losses ?? '–'}</td></tr>`).join('')}
        </tbody></table></section>`;
    }).join('')).join('');
  } else {
    standingsHtml = `<div class="notice">Clasificación no disponible (${esc(standings.reason?.message)}).</div>`;
  }

  let scheduleHtml;
  if (schedule.status === 'fulfilled') {
    let events = schedule.value;
    if (current) {
      const from = new Date(current.startDate).getTime() - 86400_000;
      const to = new Date(current.endDate).getTime() + 2 * 86400_000;
      const inT = events.filter((e) => { const t = new Date(e.startTime).getTime(); return t >= from && t <= to; });
      if (inT.length) events = inT;
    }
    scheduleHtml = eventsBlock(events);
  } else {
    scheduleHtml = errorBox(schedule.reason);
  }

  return `<div class="hero hero--small" style="--accent:${meta.color || 'var(--gold)'}">
      <div class="hero__label">${esc(meta.region || league.region)}</div>
      <h1 class="hero__title">${league.image ? `<img class="hero__logo" src="${esc(league.image.replace(/^http:/, 'https:'))}" alt="">` : ''}${esc(league.name)}</h1>
      <div class="hero__sub">Torneo: ${select}</div>
    </div>
    ${scheduleHtml}
    ${standingsHtml ? `<h2 class="h2">Clasificación</h2><div class="cols">${standingsHtml}</div>` : ''}`;
}

const prettySlug = (s) => s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

// =============================================================
//  Enrutado
// =============================================================
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

  const opts = { refresh, force: refresh };
  let html;
  try {
    switch (section) {
      case 'mundiales': html = await viewWorlds(opts); break;
      case 'mundial': html = await viewEdition(param, opts); break;
      case 'ligas': html = await viewLeagues(opts); break;
      case 'liga': html = await viewLeague(param, opts, extra); break;
      default: html = await viewHome(opts);
    }
  } catch (err) {
    html = errorBox(err);
  }
  if (token !== renderToken) return; // el usuario ya ha navegado a otra parte

  // Conservar la fase seleccionada al refrescar una edición
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
