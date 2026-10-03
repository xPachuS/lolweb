// =============================================================
//  Capa de datos: todo sale de Leaguepedia (tablas Cargo).
//  Ruta: primero tu Worker de Cloudflare (caché compartida);
//  si falla, Leaguepedia directamente. Caché local en localStorage.
// =============================================================
import { CONFIG, LEAGUES, WORLDS_HISTORY, worldsPageForYear } from './config.js';

// ---------- caché ----------
const mem = new Map();

function cacheGet(key) {
  const hit = mem.get(key);
  if (hit && hit.exp > Date.now()) return hit.data;
  try {
    const raw = localStorage.getItem('lolweb2:' + key);
    if (raw) {
      const obj = JSON.parse(raw);
      if (obj.exp > Date.now()) { mem.set(key, obj); return obj.data; }
    }
  } catch { /* almacenamiento no disponible */ }
  return undefined;
}

function cacheSet(key, data, ttl) {
  const obj = { data, exp: Date.now() + ttl };
  mem.set(key, obj);
  try { localStorage.setItem('lolweb2:' + key, JSON.stringify(obj)); } catch { /* lleno o bloqueado */ }
}

async function cached(key, ttl, fn, { force = false } = {}) {
  if (!force) {
    const hit = cacheGet(key);
    if (hit !== undefined) return hit;
  }
  const data = await fn();
  cacheSet(key, data, ttl);
  return data;
}

async function fetchJSON(url, timeoutMs = 20000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status} en ${new URL(url).hostname}`);
    return await res.json();
  } finally {
    clearTimeout(t);
  }
}

// ---------- Leaguepedia ----------
let proxyBroken = false;

async function cargo(params) {
  const all = { action: 'cargoquery', format: 'json', origin: '*', limit: '500', ...params };
  const build = (base) => {
    const url = new URL(base);
    for (const [k, v] of Object.entries(all)) url.searchParams.set(k, v);
    return url;
  };
  const tryUrl = async (url) => {
    const json = await fetchJSON(url);
    if (json.error) throw new Error(`Leaguepedia: ${json.error.info || json.error.code || json.error}`);
    return (json.cargoquery ?? []).map((r) => r.title);
  };
  if (CONFIG.PROXY_URL && !proxyBroken) {
    try {
      return await tryUrl(build(`${CONFIG.PROXY_URL.replace(/\/$/, '')}/leaguepedia`));
    } catch (err) {
      console.warn('Proxy no disponible, consultando Leaguepedia directamente:', err.message);
      proxyBroken = true;
    }
  }
  return tryUrl(build(CONFIG.LEAGUEPEDIA_API));
}

const q = (s) => String(s).replace(/"/g, '\\"');
const utc = (d) => new Date(d).toISOString().slice(0, 19).replace('T', ' ');
const parseUtc = (s) => (s ? new Date(s.replace(' ', 'T') + 'Z') : null);

// ---------- partidos ----------
const MATCH_FIELDS = [
  'MS.Team1=Team1', 'MS.Team2=Team2', 'MS.Winner=Winner',
  'MS.Team1Score=Score1', 'MS.Team2Score=Score2',
  'MS.DateTime_UTC=Date', 'MS.OverviewPage=Page', 'MS.Tab=Tab', 'MS.BestOf=BestOf',
].join(',');

function normalizeMatch(r) {
  const m = {
    team1: r.Team1 || '', team2: r.Team2 || '',
    score1: r.Score1 === '' || r.Score1 == null ? null : Number(r.Score1),
    score2: r.Score2 === '' || r.Score2 == null ? null : Number(r.Score2),
    winner: r.Winner === '1' ? 1 : r.Winner === '2' ? 2 : null,
    date: parseUtc(r.Date),
    page: r.Page || '',
    tab: r.Tab || '',
    bestOf: Number(r.BestOf) || null,
  };
  m.state = matchState(m);
  return m;
}

/** done · live · upcoming · pending (pasado pero aún sin resultado en la wiki) */
export function matchState(m, now = Date.now()) {
  if (m.winner) return 'done';
  const need = m.bestOf ? Math.ceil(m.bestOf / 2) : null;
  if (need && (m.score1 >= need || m.score2 >= need)) return 'done';
  if (!m.date) return 'upcoming';
  const t = m.date.getTime();
  if (t > now) return 'upcoming';
  const maxLen = (m.bestOf || 3) * 75 * 60_000; // ~75 min por partida
  if (now - t < maxLen) return 'live';
  return 'pending';
}

async function getMatches(where, cacheKey, ttl, force) {
  return cached(cacheKey, ttl, async () => {
    const rows = await cargo({ tables: 'MatchSchedule=MS', fields: MATCH_FIELDS, where, order_by: 'MS.DateTime_UTC' });
    return rows;
  }, { force }).then((rows) => rows.map(normalizeMatch)); // el estado se recalcula siempre con la hora actual
}

// ---------- Mundiales ----------
/** Mundiales posteriores a la lista fija (2026, 2027…). Así la hemeroteca crece sola. */
export async function getNewWorldsEditions({ force = false } = {}) {
  const lastKnown = Math.max(...WORLDS_HISTORY.map((w) => w.year));
  return cached(`worlds-new:${lastKnown}`, 6 * 3600_000, async () => {
    const rows = await cargo({
      tables: 'Tournaments=T',
      fields: 'T.Name=Name,T.OverviewPage=Page,T.DateStart=Start,T.Date=End,T.Year=Year,T.Country=Country',
      where: `T.OverviewPage LIKE "% Season World Championship%" AND T.Year > ${lastKnown}`,
      order_by: 'T.DateStart',
    });
    const byYear = new Map();
    for (const r of rows) {
      const year = Number(r.Year);
      if (!year) continue;
      const prev = byYear.get(year) ?? { year, page: worldsPageForYear(year), start: r.Start, end: r.End, country: r.Country };
      if (r.Start && (!prev.start || r.Start < prev.start)) prev.start = r.Start;
      if (r.End && (!prev.end || r.End > prev.end)) prev.end = r.End;
      if (!prev.country && r.Country) prev.country = r.Country;
      byYear.set(year, prev);
    }
    return [...byYear.values()];
  }, { force });
}

/** El Mundial que se está jugando ahora (o null). */
export async function getCurrentWorlds() {
  const now = Date.now();
  const list = await getNewWorldsEditions();
  return list.find((w) => w.start && new Date(w.start).getTime() - 86400_000 <= now &&
    (!w.end || new Date(w.end).getTime() + 2 * 86400_000 >= now)) || null;
}

/** Todas las series de un Mundial (play-in, fase suiza / grupos, eliminatorias). */
export async function getWorldsMatches(year, { finished = true, force = false } = {}) {
  const page = worldsPageForYear(year);
  const ttl = finished ? CONFIG.CACHE_LONG_MS : CONFIG.CACHE_SHORT_MS;
  const ms = await getMatches(`MS.OverviewPage = "${q(page)}" OR MS.OverviewPage LIKE "${q(page)}/%"`, `worlds-matches:${year}`, ttl, force);
  return ms.map((m) => ({ ...m, stage: stageName(m.page, page) }));
}

function stageName(overviewPage, base) {
  const sub = (overviewPage || '').slice(base.length).replace(/^\//, '');
  const map = {
    '': 'Fase principal', 'Main Event': 'Fase principal', 'Play-In': 'Play-In',
    'Swiss Stage': 'Fase suiza', 'Knockout Stage': 'Eliminatorias', 'Group Stage': 'Fase de grupos',
  };
  return map[sub] ?? sub;
}

// ---------- Ligas ----------
const leagueWhere = (l, alias = 'T') =>
  `(${alias}.OverviewPage LIKE "${q(l.pages)}" OR ${alias}.Name LIKE "${q(l.names)}")`;

/** Torneos de una liga (este año y el anterior), del más reciente al más antiguo. */
export async function getLeagueTournaments(slug, { force = false } = {}) {
  const l = LEAGUES.find((x) => x.slug === slug);
  if (!l) throw new Error(`Liga desconocida: ${slug}`);
  const year = new Date().getFullYear();
  return cached(`tournaments:${slug}:${year}`, 6 * 3600_000, async () => {
    const rows = await cargo({
      tables: 'Tournaments=T',
      fields: 'T.Name=Name,T.OverviewPage=Page,T.DateStart=Start,T.Date=End,T.Year=Year',
      where: `${leagueWhere(l)} AND T.Year >= ${year - 1}`,
      order_by: 'T.DateStart DESC',
    });
    const seen = new Set();
    return rows
      .filter((r) => r.Page && !seen.has(r.Page) && seen.add(r.Page))
      .map((r) => ({ name: r.Name || r.Page, page: r.Page, start: r.Start || null, end: r.End || null }));
  }, { force });
}

/** Torneo en curso; si no hay, el último empezado; si no, el próximo. */
export function pickCurrentTournament(list) {
  const now = Date.now();
  const day = 86400_000;
  const started = list.filter((t) => t.start && new Date(t.start).getTime() <= now + day);
  return (
    started.find((t) => !t.end || new Date(t.end).getTime() + 2 * day >= now) ||
    started[0] ||
    list[list.length - 1] ||
    null
  );
}

export async function getTournamentMatches(page, { force = false } = {}) {
  return getMatches(`MS.OverviewPage = "${q(page)}"`, `matches:${page}`, CONFIG.CACHE_SHORT_MS, force);
}

/** Partidos entre ayer y mañana en todas las ligas configuradas + Mundial. */
export async function getMatchesAroundNow({ force = false } = {}) {
  const now = Date.now();
  const from = utc(now - 18 * 3600_000);
  const to = utc(now + 30 * 3600_000);
  const pageConds = [
    ...LEAGUES.map((l) => `MS.OverviewPage LIKE "${q(l.pages)}"`),
    'MS.OverviewPage LIKE "% Season World Championship%"',
  ].join(' OR ');
  const ms = await getMatches(`MS.DateTime_UTC >= "${from}" AND MS.DateTime_UTC <= "${to}" AND (${pageConds})`,
    `around-now:${from.slice(0, 13)}`, CONFIG.CACHE_SHORT_MS, force);
  return ms.map((m) => ({ ...m, league: leagueOfPage(m.page) }));
}

export function leagueOfPage(page) {
  if (/Season World Championship/.test(page)) return { name: 'Mundial', slug: null };
  const l = LEAGUES.find((x) => new RegExp('^' + x.pages.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/%/g, '.*') + '$').test(page));
  return l ? { name: l.name, slug: l.slug } : { name: '', slug: null };
}

/** Balance de series calculado a partir de los resultados (no depende de otra tabla). */
export function computeStandings(matches) {
  const t = new Map();
  const row = (name) => {
    if (!t.has(name)) t.set(name, { team: name, w: 0, l: 0, gw: 0, gl: 0 });
    return t.get(name);
  };
  for (const m of matches) {
    if (!m.team1 || !m.team2 || /TBD/i.test(m.team1 + m.team2)) continue;
    const a = row(m.team1); const b = row(m.team2);
    if (m.state !== 'done') continue;
    const win = m.winner || (m.score1 > m.score2 ? 1 : 2);
    (win === 1 ? a : b).w++; (win === 1 ? b : a).l++;
    a.gw += m.score1 || 0; a.gl += m.score2 || 0;
    b.gw += m.score2 || 0; b.gl += m.score1 || 0;
  }
  return [...t.values()].sort((x, y) => y.w - x.w || x.l - y.l || (y.gw - y.gl) - (x.gw - x.gl) || x.team.localeCompare(y.team));
}

/** Nombre corto de cada equipo (T1, GEN, G2…), para móvil. */
export async function getTeamShorts(names) {
  const unique = [...new Set(names.filter(Boolean))].sort();
  if (!unique.length) return {};
  const missing = unique.filter((n) => cacheGet('short:' + n) === undefined);
  if (missing.length) {
    try {
      for (let i = 0; i < missing.length; i += 40) {
        const chunk = missing.slice(i, i + 40);
        const rows = await cargo({
          tables: 'Teams=TM',
          fields: 'TM.OverviewPage=Page,TM.Short=Short',
          where: `TM.OverviewPage IN (${chunk.map((n) => `"${q(n)}"`).join(',')})`,
        });
        const found = Object.fromEntries(rows.map((r) => [r.Page, r.Short]));
        for (const n of chunk) cacheSet('short:' + n, found[n] || '', 30 * 86400_000);
      }
    } catch { /* sin nombres cortos no pasa nada */ }
  }
  return Object.fromEntries(unique.map((n) => [n, cacheGet('short:' + n) || '']));
}

export const leaguepediaUrl = (page) => CONFIG.LEAGUEPEDIA_WIKI + encodeURIComponent(page.replace(/ /g, '_')).replace(/%2F/g, '/');
