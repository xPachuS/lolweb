// =============================================================
//  Configuración general
// =============================================================

export const CONFIG = {
  // API no oficial de lolesports (la que usa lolesports.com).
  // La clave es pública y compartida; si Riot la cambia, basta con sustituirla aquí.
  LOLESPORTS_BASE: 'https://esports-api.lolesports.com/persisted/gw',
  LOLESPORTS_KEY: '0TvQnueqKa5mxJntVWt0w4LpLiCqCq',
  LOLESPORTS_LANG: 'es-ES',

  // API de Leaguepedia (MediaWiki + Cargo). origin=* habilita CORS anónimo.
  LEAGUEPEDIA_API: 'https://lol.fandom.com/api.php',
  LEAGUEPEDIA_WIKI: 'https://lol.fandom.com/wiki/',

  // Frecuencia de refresco automático
  REFRESH_LIVE_MS: 30_000,     // cuando hay partidos en directo
  REFRESH_IDLE_MS: 5 * 60_000, // resto del tiempo

  // Duración de la caché local
  CACHE_SHORT_MS: 60_000,               // calendarios / clasificaciones
  CACHE_LONG_MS: 7 * 24 * 3600_000,     // Mundiales ya terminados
};

// Ligas que aparecen en la sección "Ligas". `slug` es el identificador en lolesports.
export const LEAGUES = [
  { slug: 'lck',         name: 'LCK',          region: 'Corea del Sur', color: '#4FA3FF' },
  { slug: 'lpl',         name: 'LPL',          region: 'China',         color: '#FF5A5F' },
  { slug: 'lec',         name: 'LEC',          region: 'Europa (EMEA)', color: '#22D3A6' },
  { slug: 'lcs',         name: 'LCS',          region: 'Norteamérica',  color: '#5B8CFF' },
  { slug: 'lcp',         name: 'LCP',          region: 'Asia-Pacífico', color: '#F2A93B' },
  { slug: 'cblol-brazil',name: 'CBLOL',        region: 'Brasil',        color: '#3CCB5A' },
  { slug: 'msi',         name: 'MSI',          region: 'Internacional', color: '#C89B3C' },
  { slug: 'first_stand', name: 'First Stand',  region: 'Internacional', color: '#C89B3C' },
];

export const WORLDS_SLUG = 'worlds';

// =============================================================
//  Hemeroteca: Mundiales ya disputados.
//  Datos fijos (no cambian) para que la portada cargue al instante
//  aunque Leaguepedia esté lenta. Los partidos de cada edición se
//  piden a Leaguepedia. Las ediciones nuevas (2026 en adelante) se
//  descubren solas desde la API: no hay que tocar esta lista.
// =============================================================

export const WORLDS_HISTORY = [
  { year: 2011, page: 'Season 1 World Championship', host: 'Suecia', city: 'Jönköping',
    champion: 'Fnatic', champRegion: 'EU', runnerUp: 'against All authority', runnerRegion: 'EU', score: '2–1' },
  { year: 2012, page: 'Season 2 World Championship', host: 'EE. UU.', city: 'Los Ángeles',
    champion: 'Taipei Assassins', champRegion: 'TW', runnerUp: 'Azubu Frost', runnerRegion: 'KR', score: '3–1' },
  { year: 2013, page: 'Season 3 World Championship', host: 'EE. UU.', city: 'Los Ángeles',
    champion: 'SK Telecom T1', champRegion: 'KR', runnerUp: 'Royal Club', runnerRegion: 'CN', score: '3–0' },
  { year: 2014, page: '2014 Season World Championship', host: 'Corea del Sur', city: 'Seúl',
    champion: 'Samsung White', champRegion: 'KR', runnerUp: 'Star Horn Royal Club', runnerRegion: 'CN', score: '3–1' },
  { year: 2015, page: '2015 Season World Championship', host: 'Europa', city: 'Berlín',
    champion: 'SK Telecom T1', champRegion: 'KR', runnerUp: 'KOO Tigers', runnerRegion: 'KR', score: '3–1' },
  { year: 2016, page: '2016 Season World Championship', host: 'EE. UU.', city: 'Los Ángeles',
    champion: 'SK Telecom T1', champRegion: 'KR', runnerUp: 'Samsung Galaxy', runnerRegion: 'KR', score: '3–2' },
  { year: 2017, page: '2017 Season World Championship', host: 'China', city: 'Pekín',
    champion: 'Samsung Galaxy', champRegion: 'KR', runnerUp: 'SK Telecom T1', runnerRegion: 'KR', score: '3–0' },
  { year: 2018, page: '2018 Season World Championship', host: 'Corea del Sur', city: 'Incheon',
    champion: 'Invictus Gaming', champRegion: 'CN', runnerUp: 'Fnatic', runnerRegion: 'EU', score: '3–0' },
  { year: 2019, page: '2019 Season World Championship', host: 'Europa', city: 'París',
    champion: 'FunPlus Phoenix', champRegion: 'CN', runnerUp: 'G2 Esports', runnerRegion: 'EU', score: '3–0' },
  { year: 2020, page: '2020 Season World Championship', host: 'China', city: 'Shanghái',
    champion: 'DAMWON Gaming', champRegion: 'KR', runnerUp: 'Suning', runnerRegion: 'CN', score: '3–1' },
  { year: 2021, page: '2021 Season World Championship', host: 'Islandia', city: 'Reikiavik',
    champion: 'EDward Gaming', champRegion: 'CN', runnerUp: 'DWG KIA', runnerRegion: 'KR', score: '3–2' },
  { year: 2022, page: '2022 Season World Championship', host: 'EE. UU.', city: 'San Francisco',
    champion: 'DRX', champRegion: 'KR', runnerUp: 'T1', runnerRegion: 'KR', score: '3–2' },
  { year: 2023, page: '2023 Season World Championship', host: 'Corea del Sur', city: 'Seúl',
    champion: 'T1', champRegion: 'KR', runnerUp: 'Weibo Gaming', runnerRegion: 'CN', score: '3–0' },
  { year: 2024, page: '2024 Season World Championship', host: 'Europa', city: 'Londres',
    champion: 'T1', champRegion: 'KR', runnerUp: 'Bilibili Gaming', runnerRegion: 'CN', score: '3–2' },
  { year: 2025, page: '2025 Season World Championship', host: 'China', city: 'Chengdú',
    champion: 'T1', champRegion: 'KR', runnerUp: 'KT Rolster', runnerRegion: 'KR', score: '3–2' },
];

// Nombres "históricos" que en el palmarés cuentan como la misma organización
export const ORG_ALIASES = {
  'SK Telecom T1': 'T1',
  'Samsung White': 'Samsung Galaxy',
  'DAMWON Gaming': 'Dplus KIA',
  'DWG KIA': 'Dplus KIA',
};

export const REGION_NAMES = {
  KR: 'Corea', CN: 'China', EU: 'Europa', TW: 'Taiwán', NA: 'Norteamérica',
};

// Página de Leaguepedia de un Mundial a partir del año (patrón usado desde 2014)
export const worldsPageForYear = (year) =>
  year <= 2013 ? `Season ${year - 2010} World Championship` : `${year} Season World Championship`;
