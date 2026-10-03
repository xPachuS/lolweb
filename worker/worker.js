// =============================================================
//  Proxy-caché para Grieta Archivo — Cloudflare Worker (plan gratuito)
//
//  Reenvía las consultas Cargo a Leaguepedia y guarda la respuesta
//  60 segundos en Cloudflare. Así, aunque tengas muchas visitas,
//  Leaguepedia recibe como mucho una consulta por minuto de cada tipo
//  y tu web no choca con sus límites para usuarios anónimos.
//
//  Ruta:  /leaguepedia?action=cargoquery&...  → lol.fandom.com/api.php
// =============================================================

const LEAGUEPEDIA = 'https://lol.fandom.com/api.php';
const CACHE_SECONDS = 60;

// Orígenes que pueden usar el proxy. Añade tu dominio si cambias de hosting.
const ALLOWED_ORIGINS = [
  'https://xpachus.github.io',
  'http://localhost:8000',
  'http://127.0.0.1:8000',
];

export default {
  async fetch(request) {
    const origin = request.headers.get('Origin') || '';
    const cors = {
      'Access-Control-Allow-Origin': ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0],
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Vary': 'Origin',
    };

    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (request.method !== 'GET') return json({ error: 'Método no permitido' }, 405, cors);

    const url = new URL(request.url);
    if (url.pathname !== '/leaguepedia') {
      return json({ ok: true, prueba: '/leaguepedia?action=cargoquery&format=json&tables=Tournaments&fields=Name&limit=3' }, 200, cors);
    }
    if (url.searchParams.get('action') !== 'cargoquery') return json({ error: 'Solo se permite action=cargoquery' }, 400, cors);
    url.searchParams.delete('origin');

    try {
      const upstream = await fetch(LEAGUEPEDIA + url.search, {
        headers: { 'User-Agent': 'GrietaArchivo/1.0 (fan site; https://xpachus.github.io)' },
        cf: { cacheTtl: CACHE_SECONDS, cacheEverything: true, cacheTtlByStatus: { '200-299': CACHE_SECONDS, '400-599': 0 } },
      });
      const body = await upstream.text();
      return new Response(body, {
        status: upstream.status,
        headers: { ...cors, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': `public, max-age=${CACHE_SECONDS}` },
      });
    } catch (err) {
      return json({ error: 'No se pudo contactar con Leaguepedia', detalle: String(err) }, 502, cors);
    }
  },
};

function json(obj, status, cors) {
  return new Response(JSON.stringify(obj), { status, headers: { ...cors, 'Content-Type': 'application/json; charset=utf-8' } });
}
