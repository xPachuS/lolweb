// =============================================================
//  Capa de datos: lolesports (directo) + Leaguepedia (histórico)
//  con caché en localStorage para no saturar las APIs.
// =============================================================
import { CONFIG, WORLDS_HISTORY, worldsPageForYear } from './config.js';

// ---------- caché ----------
const mem = new Map();

function cacheGet(key) {
  const hit = mem.get(key);
  if (hit && hit.exp > Date.now()) return hit.data;
  try {
    const raw = localStorage.getItem('lolweb:' + key);
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
  try { localStorage.setItem('lolweb:' + key, JSON.stringify(obj)); } catch { /* lleno o bloqueado */ }
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

async function fetchJSON(url, opts = {}, timeoutMs = 15000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...opts, signal: ctrl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status} en ${new URL(url).hostname}`);
    return await res.json();
  } finally {
    clearTimeout(t);
  }
}

// =============================================================
//  lolesports
// =============================================================
async function lolesports(endpoint, params = {}) {
  const url = new URL(`${CONFIG.LOLESPORTS_BASE}/${endpoint}`);
  url.searchParams.set('hl', CONFIG.LOLESPORTS_LANG);
  for (const [k, v] of Object.entries(params)) if (v != null) url.searchParams.set(k, v);
  const json = await fetchJSON(url, { headers: { 'x-api-key': CONFIG.LOLESPORTS_KEY } });
  return json.data;
}

export async function getLeagues() {
  return cached('leagues', 24 * 3600_000, async () => (await lolesports('getLeagues')).leagues);
}

export async function getLeagueBySlug(slug) {
  const leagues = await getLeagues();
  return leagues.find((l) => l.slug === slug);
}

export async function getTournaments(leagueId) {
  return cached(`tournaments:${leagueId}`, 6 * 3600_000, async () => {
    const d = await lolesports('getTournamentsForLeague', { leagueId });
    return d.leagues?.[0]?.tournaments ?? [];
  });
}

/** Torneo en curso o, si no hay, el más reciente ya empezado. */
export function pickCurrentTournament(tournaments) {
  const now = Date.now();
  const sorted = [...tournaments].sort((a, b) => new Date(b.startDate) - new Date(a.startDate));
  return (
    sorted.find((t) => new Date(t.startDate) <= now && now <= new Date(t.endDate).getTime() + 86400_000) ||
    sorted.find((t) => new Date(t.startDate) <= now) ||
    sorted[sorted.length - 1]
  );
}

export async function getStandings(tournamentId, opts) {
  return cached(`standings:${tournamentId}`, CONFIG.CACHE_SHORT_MS, async () => {
    const d = await lolesports('getStandings', { tournamentId });
    return d.standings?.[0]?.stages ?? [];
  }, opts);
}

/** Calendario de una liga. Trae la página actual y una anterior para tener más resultados. */
export async function getSchedule(leagueId, opts) {
  return cached(`schedule:${leagueId}`, CONFIG.CACHE_SHORT_MS, async () => {
    const first = (await lolesports('getSchedule', { leagueId })).schedule;
    let events = first.events ?? [];
    if (first.pages?.older) {
      try {
        const older = (await lolesports('getSchedule', { leagueId, pageToken: first.pages.older })).schedule;
        events = [...(older.events ?? []), ...events];
      } catch { /* con la primera página basta */ }
    }
    const seen = new Set();
    return events
      .filter((e) => e.type === 'match' && e.match)
      .filter((e) => (seen.has(e.match.id) ? false : seen.add(e.match.id)))
      .sort((a, b) => new Date(a.startTime) - new Date(b.startTime));
  }, opts);
}

export async function getLive(opts) {
  return cached('live', 20_000, async () => {
    const d = await lolesports('getLive');
    return (d.schedule?.events ?? []).filter((e) => e.type === 'match');
  }, opts);
}

// =============================================================
//  Leaguepedia (Cargo)
// =============================================================
async function cargo(params) {
  const url = new URL(CONFIG.LEAGUEPEDIA_API);
  const all = { action: 'cargoquery', format: 'json', origin: '*', limit: '500', ...params };
  for (const [k, v] of Object.entries(all)) url.searchParams.set(k, v);
  const json = await fetchJSON(url, {}, 20000);
  if (json.error) throw new Error(`Leaguepedia: ${json.error.info || json.error.code}`);
  return (json.cargoquery ?? []).map((r) => r.title);
}

/** Mundiales posteriores a la lista fija (2026, 2027…). Así la hemeroteca crece sola. */
export async function getNewWorldsEditions() {
  const lastKnown = Math.max(...WORLDS_HISTORY.map((w) => w.year));
  return cached(`worlds-new:${lastKnown}`, 12 * 3600_000, async () => {
    const rows = await cargo({
      tables: 'Tournaments=T',
      fields: 'T.Name=Name,T.OverviewPage=Page,T.DateStart=Start,T.Date=End,T.Year=Year,T.Country=Country',
      where: `T.Name LIKE "%World Championship%" AND T.Year > ${lastKnown} AND T.Name NOT LIKE "%Qualifier%" AND T.Name NOT LIKE "%Wild Rift%"`,
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
  });
}

/** Todas las series de un Mundial (play-in, fase suiza / grupos, eliminatorias). */
export async function getWorldsMatches(year, { finished = true, force = false } = {}) {
  const page = worldsPageForYear(year);
  const ttl = finished ? CONFIG.CACHE_LONG_MS : CONFIG.CACHE_SHORT_MS;
  return cached(`worlds-matches:${year}`, ttl, async () => {
    const rows = await cargo({
      tables: 'MatchSchedule=MS',
      fields: [
        'MS.Team1=Team1', 'MS.Team2=Team2', 'MS.Winner=Winner',
        'MS.Team1Score=Score1', 'MS.Team2Score=Score2',
        'MS.DateTime_UTC=Date', 'MS.OverviewPage=Page', 'MS.Tab=Tab',
        'MS.BestOf=BestOf', 'MS.Round=Round', 'MS.N_MatchInPage=N',
      ].join(','),
      where: `MS.OverviewPage = "${page}" OR MS.OverviewPage LIKE "${page}/%"`,
      order_by: 'MS.DateTime_UTC, MS.N_MatchInPage',
    });
    return rows.map((r) => ({
      team1: r.Team1, team2: r.Team2,
      score1: r.Score1 === '' ? null : Number(r.Score1),
      score2: r.Score2 === '' ? null : Number(r.Score2),
      winner: r.Winner === '1' ? 1 : r.Winner === '2' ? 2 : null,
      date: r.Date ? new Date(r.Date.replace(' ', 'T') + 'Z') : null,
      stage: stageName(r.Page, page),
      tab: r.Tab || '',
      bestOf: Number(r.BestOf) || null,
    }));
  }, { force });
}

function stageName(overviewPage, base) {
  const sub = (overviewPage || '').slice(base.length).replace(/^\//, '');
  const map = {
    '': 'Fase principal', 'Main Event': 'Fase principal', 'Play-In': 'Play-In',
    'Swiss Stage': 'Fase suiza', 'Knockout Stage': 'Eliminatorias', 'Group Stage': 'Fase de grupos',
  };
  return map[sub] ?? sub;
}

export const leaguepediaUrl = (page) => CONFIG.LEAGUEPEDIA_WIKI + encodeURIComponent(page.replace(/ /g, '_'));
