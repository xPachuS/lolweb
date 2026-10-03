// =============================================================
//  Proxy para Grieta Archivo — Cloudflare Worker (plan gratuito)
//
//  Por qué existe: la API de lolesports solo acepta peticiones del
//  navegador desde lolesports.com (CORS). Este Worker hace la
//  petición desde el servidor, añade la clave y devuelve la
//  respuesta con permiso para tu web. De paso cachea en el borde
//  para no saturar ni lolesports ni Leaguepedia.
//
//  Rutas:
//    /lolesports/<endpoint>?...   → esports-api.lolesports.com/persisted/gw/<endpoint>
//    /leaguepedia?...             → lol.fandom.com/api.php (solo action=cargoquery)
// =============================================================

const LOLESPORTS = 'https://esports-api.lolesports.com/persisted/gw/';
const LOLESPORTS_KEY = '0TvQnueqKa5mxJntVWt0w4LpLiCqCq';
const LEAGUEPEDIA = 'https://lol.fandom.com/api.php';

// Orígenes que pueden usar el proxy. Añade tu dominio si cambias de hosting.
const ALLOWED_ORIGINS = [
  'https://xpachus.github.io',
  'http://localhost:8000',
  'http://127.0.0.1:8000',
];

// Solo estos endpoints de lolesports (evita usar el proxy para otra cosa)
const LOLESPORTS_ENDPOINTS = new Set([
  'getLeagues', 'getTournamentsForLeague', 'getStandings', 'getSchedule', 'getLive', 'getEventDetails',
]);

// Segundos de caché en Cloudflare por endpoint
const TTL = { getLive: 20, getSchedule: 30, getStandings: 60, getTournamentsForLeague: 3600, getLeagues: 86400, getEventDetails: 30 };

export default {
  async fetch(request) {
    const origin = request.headers.get('Origin') || '';
    const allowOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
    const cors = {
      'Access-Control-Allow-Origin': allowOrigin,
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Vary': 'Origin',
    };

    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (request.method !== 'GET') return json({ error: 'Método no permitido' }, 405, cors);

    const url = new URL(request.url);
    let target, ttl, headers = {};

    if (url.pathname.startsWith('/lolesports/')) {
      const endpoint = url.pathname.slice('/lolesports/'.length);
      if (!LOLESPORTS_ENDPOINTS.has(endpoint)) return json({ error: 'Endpoint no permitido' }, 404, cors);
      target = LOLESPORTS + endpoint + url.search;
      ttl = TTL[endpoint] ?? 60;
      headers = { 'x-api-key': LOLESPORTS_KEY };
    } else if (url.pathname === '/leaguepedia') {
      if (url.searchParams.get('action') !== 'cargoquery') return json({ error: 'Solo cargoquery' }, 400, cors);
      url.searchParams.delete('origin');
      target = LEAGUEPEDIA + url.search;
      ttl = 300;
      headers = { 'User-Agent': 'GrietaArchivo/1.0 (fan site; github.com/xpachus)' };
    } else {
      return json({ ok: true, uso: ['/lolesports/getLeagues?hl=es-ES', '/leaguepedia?action=cargoquery&...'] }, 200, cors);
    }

    try {
      const upstream = await fetch(target, {
        headers,
        cf: { cacheTtl: ttl, cacheEverything: true },
      });
      const body = await upstream.text();
      return new Response(body, {
        status: upstream.status,
        headers: {
          ...cors,
          'Content-Type': upstream.headers.get('Content-Type') || 'application/json',
          'Cache-Control': `public, max-age=${Math.min(ttl, 60)}`,
        },
      });
    } catch (err) {
      return json({ error: 'No se pudo contactar con la API de origen', detalle: String(err) }, 502, cors);
    }
  },
};

function json(obj, status, cors) {
  return new Response(JSON.stringify(obj), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
}
