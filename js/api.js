// =============================================================
//  Capa de datos: la web lee ficheros JSON del propio repositorio
//  (carpeta data/). Los genera cada 10 minutos el script
//  scripts/update_data.py desde GitHub Actions, consultando
//  Leaguepedia. Los visitantes nunca llaman a Leaguepedia.
// =============================================================
import { CONFIG, LEAGUES, worldsPageForYear } from './config.js';

// ---------- lectura de ficheros con caché en memoria ----------
const mem = new Map();
const MEM_TTL = 30_000;

export class NoDataError extends Error {
  constructor(file) {
    super(`Todavía no existe ${file}. Lanza el workflow «Actualizar datos de Leaguepedia» en la pestaña Actions de GitHub.`);
    this.name = 'NoDataError';
  }
}

async function getJSON(file, { force = false, optional = false } = {}) {
  const hit = mem.get(file);
  if (!force && hit && Date.now() - hit.t < MEM_TTL) return hit.data;
  const res = await fetch(`${CONFIG.DATA_PATH}/${file}`, { cache: 'no-cache' });
  if (res.status === 404) {
    if (optional) return null;
    throw new NoDataError(`data/${file}`);
  }
  if (!res.ok) throw new Error(`HTTP ${res.status} al leer data/${file}`);
  const data = await res.json();
  mem.set(file, { data, t: Date.now() });
  return data;
}

// ---------- utilidades ----------
const parseUtc = (s) => (s ? new Date(String(s).replace(' ', 'T') + (String(s).length > 10 ? 'Z' : 'T00:00:00Z')) : null);

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

/** done · live · upcoming · pending (pasado pero aún sin resultado publicado) */
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

// ---------- metadatos ----------
/** { checked: ISO de la última comprobación, currentWorlds, errors } */
export async function getMeta(opts) {
  return getJSON('meta.json', { ...opts, optional: true });
}

// ---------- Mundiales ----------
export async function getNewWorldsEditions({ force = false } = {}) {
  return (await getJSON('worlds-new.json', { force, optional: true })) || [];
}

/** El Mundial que se está jugando ahora (o null). */
export async function getCurrentWorlds() {
  const now = Date.now();
  const list = await getNewWorldsEditions();
  return list.find((w) => w.start && parseUtc(w.start).getTime() - 86400_000 <= now &&
    (!w.end || parseUtc(w.end).getTime() + 2 * 86400_000 >= now)) || null;
}

/** Todas las series de un Mundial. */
export async function getWorldsMatches(year, { force = false } = {}) {
  const page = worldsPageForYear(year);
  const rows = await getJSON(`worlds/${year}.json`, { force, optional: true });
  if (rows == null) return null; // aún no descargado
  return rows.map(normalizeMatch).map((m) => ({ ...m, stage: stageName(m.page, page) }));
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
async function getLeagueFile(slug, force) {
  if (!LEAGUES.find((x) => x.slug === slug)) throw new Error(`Liga desconocida: ${slug}`);
  return (await getJSON(`leagues/${slug}.json`, { force, optional: true })) || { tournaments: [], matches: {} };
}

/** Torneos de una liga, del más reciente al más antiguo. */
export async function getLeagueTournaments(slug, { force = false } = {}) {
  return (await getLeagueFile(slug, force)).tournaments || [];
}

/** Torneo en curso; si no hay, el último empezado; si no, el próximo. */
export function pickCurrentTournament(list) {
  const now = Date.now();
  const day = 86400_000;
  const started = list.filter((t) => t.start && parseUtc(t.start).getTime() <= now + day);
  return (
    started.find((t) => !t.end || parseUtc(t.end).getTime() + 2 * day >= now) ||
    started[0] ||
    list[list.length - 1] ||
    null
  );
}

export async function getTournamentMatches(slug, page, { force = false } = {}) {
  const file = await getLeagueFile(slug, force);
  return (file.matches?.[page] || []).map(normalizeMatch);
}

/** Partidos entre ayer y mañana en todas las ligas. */
export async function getMatchesAroundNow({ force = false } = {}) {
  const rows = (await getJSON('around.json', { force, optional: true })) || [];
  return rows.map((r) => ({ ...normalizeMatch(r), league: { name: r.League || '', slug: r.LeagueSlug || null } }));
}

/** Balance de series calculado a partir de los resultados. */
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

/** Siglas de cada equipo (T1, GEN, G2…), para móvil. */
export async function getTeamShorts() {
  return (await getJSON('teams.json', { optional: true })) || {};
}

export const leaguepediaUrl = (page) => CONFIG.LEAGUEPEDIA_WIKI + encodeURIComponent(page.replace(/ /g, '_')).replace(/%2F/g, '/');
