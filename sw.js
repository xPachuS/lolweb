// =============================================================
//  Service worker de Grieta Archivo
//  · Web instalable (móvil y escritorio).
//  · Sin conexión: muestra lo último descargado (hemeroteca, equipos…).
//  · Con conexión siempre pide la versión nueva primero, así que los
//    resultados nunca se quedan antiguos.
// =============================================================
const VERSION = 'v1';
const SHELL = `grieta-shell-${VERSION}`;
const IMG = 'grieta-img';
const IMG_MAX = 800;   // iconos de campeones y escudos guardados como mucho

const SHELL_FILES = [
  './', 'index.html', 'css/styles.css', 'js/app.js', 'js/api.js', 'js/config.js',
  'manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png',
];
// La hemeroteca se guarda en segundo plano al instalar, para poder verla sin conexión
const ARCHIVE = () => {
  const now = new Date().getFullYear();
  const files = ['meta.json', 'teams.json', 'logos.json', 'vods.json', 'worlds-new.json', 'ddragon.json', 'players.json', 'evolution.json'];
  for (let y = 2011; y <= now; y++) files.push(`worlds/${y}.json`, `finals/${y}.json`, `champions/${y}.json`);
  return files.map((f) => `data/${f}`);
};

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(SHELL).then((c) => c.addAll(SHELL_FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k !== SHELL && k !== IMG) await caches.delete(k);
    await self.clients.claim();
    const c = await caches.open(SHELL);
    // Uno a uno: si falta alguno (edición aún sin datos) no pasa nada
    for (const url of ARCHIVE()) {
      if (await c.match(url, { ignoreSearch: true })) continue;
      try { const r = await fetch(url, { cache: 'no-cache' }); if (r.ok) await c.put(url, r); } catch { /* sin red */ }
    }
  })());
});

async function networkFirst(req) {
  const c = await caches.open(SHELL);
  try {
    const res = await fetch(req);
    if (res.ok && res.type === 'basic') c.put(req, res.clone());
    return res;
  } catch (err) {
    const hit = await c.match(req, { ignoreSearch: true });
    if (hit) return hit;
    if (req.mode === 'navigate') return (await c.match('index.html')) || Response.error();
    throw err;
  }
}

async function cacheFirst(req) {
  const c = await caches.open(IMG);
  const hit = await c.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok || res.type === 'opaque') {
    await c.put(req, res.clone());
    const keys = await c.keys();
    for (let i = 0; i < keys.length - IMG_MAX; i++) await c.delete(keys[i]);
  }
  return res;
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin === location.origin) {
    // escudos descargados (no cambian): primero la caché
    if (url.pathname.includes('/data/logos/')) { e.respondWith(cacheFirst(req)); return; }
    e.respondWith(networkFirst(req));
    return;
  }
  // Iconos de campeones, miniaturas de vídeos, escudos de lolesports y fuentes
  if (/(^|\.)ddragon\.leagueoflegends\.com$|(^|\.)ytimg\.com$|lolesports\.com$|akamaihd\.net$|fonts\.(googleapis|gstatic)\.com$/.test(url.hostname)
      && (req.destination === 'image' || req.destination === 'font' || req.destination === 'style')) {
    e.respondWith(cacheFirst(req).catch(() => fetch(req)));
  }
  // El resto (directo del Worker, YouTube…) va siempre a la red
});
