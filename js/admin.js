// =============================================================
//  Panel de administración del Pick'em  (#/pickem-admin/<sección>)
//
//  Secciones: Resumen · Partidos · Pronósticos · Combinadas · Jugadores ·
//  Grupos · Puntos · Registro · Ajustes. Solo para las cuentas de la
//  variable PICKEM_ADMINS del Worker; el servidor comprueba cada petición.
//
//  app.js lo crea con createAdmin(helpers) y llama a view(sección, extra).
// =============================================================

// Iconos de línea (24×24, trazo) · originales y ligeros
const ICON = {
  resumen: '<rect x="3" y="3" width="7.5" height="7.5" rx="2"/><rect x="13.5" y="3" width="7.5" height="7.5" rx="2"/><rect x="3" y="13.5" width="7.5" height="7.5" rx="2"/><rect x="13.5" y="13.5" width="7.5" height="7.5" rx="2"/>',
  partidos: '<rect x="3" y="4.5" width="18" height="16" rx="2.5"/><path d="M3 9.5h18M8 2.5v4M16 2.5v4M7.5 14h3M13.5 14h3M7.5 17.5h3"/>',
  pronosticos: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.3" fill="currentColor"/>',
  combinadas: '<path d="M12 3 3 7.8l9 4.8 9-4.8L12 3Z"/><path d="m3 12.2 9 4.8 9-4.8"/><path d="m3 16.4 9 4.6 9-4.6"/>',
  jugadores: '<circle cx="12" cy="8" r="4"/><path d="M4 21c.6-4.2 3.8-6.5 8-6.5s7.4 2.3 8 6.5"/>',
  grupos: '<circle cx="9" cy="8.5" r="3.5"/><path d="M2.5 20c.4-3.6 3-5.8 6.5-5.8s6.1 2.2 6.5 5.8"/><path d="M15.5 5.2a3.4 3.4 0 0 1 0 6.6M17.8 14.6c2 .7 3.3 2.6 3.7 5.4"/>',
  puntos: '<path d="M6.5 3.5v6M3.5 6.5h6M14.5 17.5h6"/><path d="M19.5 4.5 4.5 19.5"/>',
  registro: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5.2l3.4 2"/>',
  ajustes: '<path d="M4 6h9M17 6h3M4 12h3M11 12h9M4 18h11M19 18h1"/><circle cx="15" cy="6" r="2"/><circle cx="9" cy="12" r="2"/><circle cx="17" cy="18" r="2"/>',
  reload: '<path d="M20 11.5A8 8 0 1 1 17.7 6"/><path d="M20.5 3.5V9H15"/>',
  back: '<path d="M19 12H5M11 6l-6 6 6 6"/>',
  alert: '<path d="M12 3.5 2.5 20h19L12 3.5Z"/><path d="M12 10v4.2M12 17.2v.1"/>',
  ok: '<circle cx="12" cy="12" r="9"/><path d="m8 12.2 2.8 2.8L16.2 9"/>',
  edit: '<path d="M4 20h4L19.5 8.5l-4-4L4 16v4Z"/><path d="m13.5 6.5 4 4"/>',
  trash: '<path d="M4 7h16M9.5 7V4h5v3M6 7l1 13h10l1-13"/>',
  download: '<path d="M12 4v11M7 10.5l5 4.5 5-4.5M5 20h14"/>',
  megaphone: '<path d="M3 10v4h3.5l8 4.5v-13L6.5 10H3Z"/><path d="M18 9a4 4 0 0 1 0 6"/>',
  lock: '<rect x="5" y="10.5" width="14" height="10" rx="2.5"/><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3"/>',
  bolt: '<path d="M13 2.5 4.5 13.5h6.5l-1 8 8.5-11h-6.5l1-8Z"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c.6-4.2 3.8-6.5 8-6.5s7.4 2.3 8 6.5"/>',
  reset: '<path d="M4 12a8 8 0 1 0 2.3-5.7"/><path d="M3.5 3.5V9H9"/>',
  danger: '<circle cx="12" cy="12" r="9"/><path d="M12 7.5v5.5M12 16.3v.1"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5.2l3.4 2"/>',
  final: '<path d="M7 4h10v5a5 5 0 0 1-10 0V4Z"/><path d="M7 6H4v1.5A3.5 3.5 0 0 0 7.5 11M17 6h3v1.5a3.5 3.5 0 0 1-3.5 3.5M12 14v3M8.5 20.5h7M9.5 17.5h5v3h-5z"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="m16 16 4.5 4.5"/>',
};
const ic = (name, cls = '') => `<svg class="adm-ic ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON[name] || ''}</svg>`;

const SECTIONS = [
  { id: 'resumen', group: 'Juego', label: 'Resumen', desc: 'El estado del Pick\'em de un vistazo: cifras, avisos y últimos movimientos.' },
  { id: 'partidos', group: 'Juego', label: 'Partidos', desc: 'Corrige resultados y horas de cierre. Tus correcciones mandan sobre las de Leaguepedia.' },
  { id: 'pronosticos', group: 'Juego', label: 'Pronósticos', desc: 'Todos los pronósticos de un partido: cámbialos, bórralos o pon uno a alguien.' },
  { id: 'combinadas', group: 'Juego', label: 'Combinadas', desc: 'Todas las combinadas del Mundial, con su estado y sus puntos.' },
  { id: 'final', group: 'Juego', label: 'Final', desc: 'Apuestas de la final: mercados (kills, torres, dragones, jugadores…), resultados y apuestas de todos.' },
  { id: 'jugadores', group: 'Personas', label: 'Jugadores', desc: 'Cuentas: PIN, apodo, bloqueos, sesiones, grupos y pronósticos de cada uno.' },
  { id: 'grupos', group: 'Personas', label: 'Grupos', desc: 'Grupos, sus jugadores y su clasificación.' },
  { id: 'puntos', group: 'Personas', label: 'Puntos', desc: 'Puntos sumados o restados a mano, con su motivo. Cuentan en la clasificación del grupo.' },
  { id: 'registro', group: 'Sistema', label: 'Registro', desc: 'Todo lo que pasa: cuentas nuevas, grupos y cada cambio hecho desde este panel.' },
  { id: 'ajustes', group: 'Sistema', label: 'Ajustes', desc: 'Reglas del juego, límites y copias de seguridad.' },
];

export function createAdmin(h) {
  const { api, esc, $view, route, teamBadge, displayName, fmtDate, fmtTime, tabEs, pkLoad, pickemYear, loadShorts, getWorldsMatches } = h;
  const A = { token: '', year: 0, section: 'resumen', matches: [], byKey: new Map(), cache: {}, admin: '' };

  // ---------------------------------------------------------------- utilidades
  const call = (method, path, body) => api.pickem(method, `/admin/${path}`, { token: A.token, body: body ? { year: A.year, ...body } : undefined });
  const get = (path) => call('GET', `${path}${path.includes('?') ? '&' : '?'}year=${A.year}`);
  const post = (path, body) => call('POST', path, body);
  const lpDate = (s) => (s ? new Date(String(s).replace(' ', 'T') + (String(s).endsWith('Z') ? '' : 'Z')) : null);
  const when = (s) => { const d = s instanceof Date ? s : lpDate(s); return d && !isNaN(d) ? `${fmtDate(d)} ${fmtTime(d)}` : '—'; };
  const ago = (s) => {
    const d = new Date(s); if (isNaN(d)) return '';
    const m = Math.round((Date.now() - d) / 60000);
    return m < 1 ? 'ahora' : m < 60 ? `hace ${m} min` : m < 1440 ? `hace ${Math.round(m / 60)} h` : `${fmtDate(d)} ${fmtTime(d)}`;
  };
  const roundOf = (m) => `${m.page}|${m.tab}`;
  const roundLabel = (round) => {
    const m = A.matches.find((x) => roundOf(x) === round);
    return m ? [stageOf(m.page), tabEs(m.tab)].filter(Boolean).join(' · ') : tabEs(String(round).split('|').pop());
  };
  const stageOf = (page) => {
    const sub = String(page || '').split('/').slice(1).join('/');
    return { 'Main Event': 'Fase principal', 'Play-In': 'Play-In', 'Swiss Stage': 'Fase suiza', 'Knockout Stage': 'Eliminatorias', 'Group Stage': 'Fase de grupos' }[sub] || sub;
  };
  const matchName = (m) => (m ? `${displayName(m.team1)} vs ${displayName(m.team2)}` : '');
  const isTbd = (t) => !t || /^TBD$/i.test(t);
  const scoresFor = (bo) => { const need = Math.ceil((bo || 1) / 2); return bo > 1 ? Array.from({ length: need }, (_, i) => `${need}-${i}`) : []; };
  const toLocalInput = (s) => { const d = lpDate(s); if (!d || isNaN(d)) return ''; const p = (n) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`; };
  const toolbar = (inner) => `<div class="adm-toolbar">${inner}</div>`;
  const badge = (txt, kind = '') => `<span class="adm-badge ${kind ? 'adm-badge--' + kind : ''}">${txt}</span>`;
  const empty = (txt, icon = 'ok') => `<div class="adm-empty">${ic(icon)}<span>${txt}</span></div>`;
  const initials = (nick) => esc(String(nick || '?').replace(/[^\p{L}\p{N}]/gu, '').slice(0, 2).toUpperCase() || '?');
  const hue = (s) => [...String(s || '')].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 17);
  const avatar = (nick) => `<span class="adm-ava" style="--h:${hue(String(nick).toLowerCase())}" aria-hidden="true">${initials(nick)}</span>`;
  /** Selector segmentado (filtros de un toque) */
  const seg = (f, cur, opts) => `<div class="adm-seg" role="tablist">${opts.map(([v, l, n]) => `<button type="button" role="tab" class="adm-seg__btn ${String(cur || '') === v ? 'is-on' : ''}" data-adm="seg" data-f="${f}" data-v="${esc(v)}" aria-selected="${String(cur || '') === v}">${l}${n != null ? `<span>${n}</span>` : ''}</button>`).join('')}</div>`;
  const search = (f, val, ph) => `<label class="adm-search">${ic('search')}<input class="input" type="search" data-adm-filter="${f}" placeholder="${ph}" value="${esc(val || '')}"></label>`;
  const cardHead = (icon, title, extra = '') => `<h3 class="adm-card__title"><span class="adm-card__ic">${ic(icon)}</span>${title}${extra}</h3>`;

  function toast(msg, kind = 'ok') {
    let t = document.getElementById('admToast');
    if (!t) { t = document.createElement('div'); t.id = 'admToast'; t.className = 'adm-toast'; t.setAttribute('role', 'status'); document.body.append(t); }
    t.textContent = msg; t.className = `adm-toast is-${kind} is-on`;
    clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove('is-on'), 3200);
  }
  async function act(fn, okMsg) {
    try { await fn(); if (okMsg) toast(okMsg); return true; } catch (err) { toast(err.message, 'error'); return false; }
  }


  // ---------------------------------------------------------------- vista principal
  async function view(section = 'resumen', extra = '') {
    const store = pkLoad();
    if (!store.token) return `<div class="state"><p><strong>Entra con tu cuenta del Pick'em para administrarlo.</strong></p><a class="btn" href="#/pickem">Ir al Pick'em</a></div>`;
    A.token = store.token;
    A.section = SECTIONS.some((s) => s.id === section) ? section : 'resumen';
    A.extra = decodeURIComponent(extra || '');
    await loadShorts();
    A.year = A.year || await pickemYear();
    A.matches = ((await getWorldsMatches(A.year).catch(() => null)) || []).filter((m) => !/qualifier/i.test(m.page));
    A.byKey = new Map(A.matches.map((m) => [m.key, m]));
    let body;
    try {
      // las cifras del menú salen del resumen; si entras directo en otra sección se piden aparte
      const counts = A.section !== 'resumen' && !A.cache.counts ? get('overview').then(setCounts).catch(() => null) : null;
      body = await SECTION_RENDER[A.section]();
      await counts;
    } catch (err) {
      if (err.status === 403 || err.status === 401) {
        return `<div class="state state--error"><p><strong>${esc(err.message)}</strong></p>
          <p class="muted">Los administradores se configuran en Cloudflare con la variable <code>PICKEM_ADMINS</code> del Worker (ver README).</p>
          <a class="btn" href="#/pickem">Volver al Pick'em</a></div>`;
      }
      body = `<div class="state state--error"><p><strong>${esc(err.message)}</strong></p><button class="btn" type="button" data-adm="reload">Reintentar</button></div>`;
    }
    const sec = SECTIONS.find((s) => s.id === A.section);
    const c = A.cache.counts || {};
    const groups = [...new Set(SECTIONS.map((s) => s.group))];
    const item = (s) => `<a class="adm-nav__item ${s.id === A.section ? 'is-on' : ''}" href="#/pickem-admin/${s.id}" ${s.id === A.section ? 'aria-current="page"' : ''}>
        ${ic(s.id, 'adm-nav__icon')}<span class="adm-nav__label">${s.label}</span>${c[s.id] ? `<span class="adm-nav__n ${c.warn?.[s.id] ? 'is-warn' : ''}">${c[s.id]}</span>` : ''}</a>`;
    const me = A.admin || pkLoad().nick || '';
    return `<div class="adm">
      <aside class="adm-side" aria-label="Secciones de administración">
        <div class="adm-side__brand"><span class="adm-side__logo">${ic('ajustes')}</span><span><b>Admin</b><small>Pick'em · Mundial ${A.year}</small></span></div>
        <nav class="adm-nav">${groups.map((g) => `<div class="adm-nav__group"><span class="adm-nav__title">${g}</span>${SECTIONS.filter((s) => s.group === g).map(item).join('')}</div>`).join('')}</nav>
        <div class="adm-side__foot">
          ${me ? `<div class="adm-side__me">${avatar(me)}<span><b>${esc(me)}</b><small>Administrador</small></span></div>` : ''}
          <a class="adm-side__back" href="#/pickem">${ic('back')}<span>Volver al Pick'em</span></a>
        </div>
      </aside>
      <section class="adm-main">
        <header class="adm-head">
          <span class="adm-head__ic">${ic(sec.id)}</span>
          <div class="adm-head__txt"><p class="adm-head__crumb">Administración · ${sec.group}</p><h1 class="adm-head__title">${sec.label}</h1><p class="adm-head__desc">${sec.desc}</p></div>
          <button class="btn btn--small adm-head__btn" type="button" data-adm="reload" title="Volver a cargar los datos">${ic('reload')}<span>Actualizar</span></button>
        </header>
        <div class="adm-body" id="admBody">${body}</div>
      </section>
      <dialog class="adm-dialog" id="admDialog" aria-labelledby="admDialogTitle"><div class="adm-dialog__box" id="admDialogBox"></div></dialog>
    </div>`;
  }
  function setCounts(d) {
    A.admin = d.admin;
    A.cache.settings = d.settings;
    A.cache.counts = { jugadores: d.stats.users, grupos: d.stats.leagues, combinadas: d.stats.combos, final: d.stats.markets, puntos: d.stats.adjustments, partidos: d.late.length, warn: { partidos: d.late.length > 0 } };
    return d;
  }

  async function reloadBody() {
    const box = document.getElementById('admBody');
    if (!box) return;
    try { box.innerHTML = await SECTION_RENDER[A.section](); } catch (err) { toast(err.message, 'error'); }
  }

  // ---------------------------------------------------------------- diálogo
  function openDialog(title, html, { wide = false } = {}) {
    const dlg = document.getElementById('admDialog');
    const box = document.getElementById('admDialogBox');
    if (!dlg || !box) return;
    box.innerHTML = `<header class="adm-dialog__head"><h2 id="admDialogTitle">${title}</h2><button type="button" class="adm-x" data-adm="close" aria-label="Cerrar">×</button></header>
      <div class="adm-dialog__body">${html}</div>`;
    dlg.classList.toggle('is-wide', wide);
    if (!dlg.open) dlg.showModal();
  }
  const closeDialog = () => document.getElementById('admDialog')?.close();


  // ---------------------------------------------------------------- RESUMEN
  async function renderResumen() {
    const d = setCounts(await get('overview'));
    const s = d.stats; const st = d.settings;
    const plural = (n, a, b) => `${n} ${n === 1 ? a : b}`;
    const kpi = (icon, n, label, sub, href, tone = '') => `<a class="adm-kpi ${tone ? 'adm-kpi--' + tone : ''}" href="#/pickem-admin/${href}">
        <span class="adm-kpi__ic">${ic(icon)}</span><b class="adm-kpi__n">${n}</b><span class="adm-kpi__label">${label}</span><small class="adm-kpi__sub">${sub}</small></a>`;
    const state = (field, on, icon, title, yes, no) => `<label class="adm-state ${on ? 'is-on' : 'is-off'}">
        <span class="adm-state__ic">${ic(icon)}</span>
        <span class="adm-state__txt"><b>${title}</b><small>${on ? yes : no}</small></span>
        <span class="adm-switch"><input type="checkbox" data-adm="quick-toggle" data-field="${field}" ${on ? 'checked' : ''}><span></span></span></label>`;
    const late = d.late.map((m) => `<li>${ic('alert', 'adm-li__ic adm-li__ic--warn')}<span class="adm-li__txt"><b>${esc(displayName(m.team1))} vs ${esc(displayName(m.team2))}</b><small>${esc(tabEs(m.tab))} · empezó ${when(m.date)} · sin resultado</small></span>
      <button class="btn btn--small btn--gold" type="button" data-adm="fix-open" data-key="${esc(m.key)}">Poner resultado</button></li>`).join('');
    const locked = d.locked.map((u) => `<li>${ic('lock', 'adm-li__ic adm-li__ic--warn')}<span class="adm-li__txt"><b>${esc(u.nick)}</b><small>Cuenta bloqueada por fallar el PIN</small></span>
      <button class="btn btn--small" type="button" data-adm="user-unlock" data-user="${u.id}">Desbloquear</button></li>`).join('');
    const upcoming = d.upcoming.map((m) => `<li><span class="adm-li__teams">${teamBadge(m.team1)}${teamBadge(m.team2)}</span><span class="adm-li__txt"><b>${esc(displayName(m.team1))} vs ${esc(displayName(m.team2))}</b><small>${esc(tabEs(m.tab))} · ${when(m.date)}</small></span>
      ${badge(plural(m.picks, 'pronóstico', 'pronósticos'), m.picks ? 'gold' : '')}</li>`).join('');
    const attention = d.late.length + d.locked.length;
    return `<div class="adm-kpis">
        ${kpi('jugadores', s.users, 'Cuentas', `${s.active24h} activos hoy · +${s.newUsers7d} en 7 días`, 'jugadores')}
        ${kpi('grupos', s.leagues, 'Grupos', plural(s.adjustments, 'ajuste de puntos', 'ajustes de puntos'), 'grupos')}
        ${kpi('pronosticos', s.picks, 'Pronósticos', plural(s.fixes, 'partido corregido', 'partidos corregidos'), 'pronosticos')}
        ${kpi('combinadas', s.combos, 'Combinadas', st.combo.enabled ? 'activadas' : 'desactivadas', 'combinadas', st.combo.enabled ? '' : 'off')}
      </div>
      <section class="adm-card">
        ${cardHead('bolt', 'Estado del juego', '<small class="adm-card__aside">Se aplica al momento a todos los grupos</small>')}
        <div class="adm-states">
          ${state('picksOpen', st.picksOpen, 'pronosticos', 'Pronósticos', 'Abiertos', 'Cerrados')}
          ${state('registrationOpen', st.registrationOpen, 'jugadores', 'Cuentas nuevas', 'Permitidas', 'Bloqueadas')}
          ${state('combo.enabled', st.combo.enabled, 'combinadas', 'Combinadas', 'Activadas', 'Desactivadas')}
        </div>
        <form class="adm-banner" data-adm-form="banner">
          <span class="adm-banner__ic">${ic('megaphone')}</span>
          <label class="adm-banner__field"><span>Aviso para todos los jugadores</span><input class="input" name="banner" maxlength="280" value="${esc(st.banner)}" placeholder="Ej.: Hoy a las 18:00 se juega la final. ¡Pronosticad!"></label>
          <div class="adm-banner__btns">${st.banner ? '<button class="btn btn--small" type="button" data-adm="banner-clear">Quitar</button>' : ''}<button class="btn btn--small btn--gold" type="submit">${st.banner ? 'Actualizar' : 'Publicar'}</button></div>
        </form>
      </section>
      <div class="adm-grid2">
        <section class="adm-card adm-card--fixed">
          ${cardHead('alert', 'Necesita atención', attention ? badge(attention, 'warn') : badge('todo en orden', 'ok'))}
          ${late || locked ? `<ul class="adm-list">${late}${locked}</ul>` : empty('No hay partidos sin resultado ni cuentas bloqueadas.')}
        </section>
        <section class="adm-card adm-card--fixed">
          ${cardHead('partidos', 'Próximas 48 horas', badge(d.upcoming.length))}
          ${upcoming ? `<ul class="adm-list">${upcoming}</ul>` : empty('No hay partidos con equipos confirmados en las próximas 48 horas.', 'clock')}
        </section>
      </div>
      <section class="adm-card">
        ${cardHead('registro', 'Actividad reciente', '<a class="adm-card__more" href="#/pickem-admin/registro">Ver todo el registro →</a>')}
        ${d.recent.length ? logList(d.recent, true) : empty('Todavía no hay actividad.', 'clock')}
      </section>`;
  }

  // ---------------------------------------------------------------- PARTIDOS
  async function renderPartidos() {
    const d = await get('matches');
    A.cache.matches = d.matches;
    const f = A.cache.matchFilter || { round: '', state: '', q: '' };
    const rounds = [...new Map(d.matches.map((m) => [`${m.page}|${m.tab}`, m])).entries()];
    const now = Date.now();
    const stateOf = (m) => {
      const eff = m.fix?.winner ? m.fix : m.lp.winner ? m.lp : null;
      const t = lpDate(m.fix?.date || m.date)?.getTime();
      if (eff) return 'done';
      if (t && t < now - (m.bestOf * 75 + 60) * 60000) return 'late';
      if (t && t < now) return 'live';
      return 'upcoming';
    };
    const base = d.matches.filter((m) => !isTbd(m.team1) || !isTbd(m.team2))
      .filter((m) => !f.round || `${m.page}|${m.tab}` === f.round)
      .filter((m) => !f.q || `${m.team1} ${m.team2}`.toLowerCase().includes(f.q.toLowerCase()));
    const n = (st) => base.filter((m) => (st === 'fixed' ? !!m.fix : stateOf(m) === st)).length;
    const list = base.filter((m) => !f.state || (f.state === 'fixed' ? !!m.fix : stateOf(m) === f.state))
      .sort((a, b) => (lpDate(b.fix?.date || b.date) || 0) - (lpDate(a.fix?.date || a.date) || 0));
    const stLabel = { done: badge('Jugado', 'ok'), late: badge('Sin resultado', 'warn'), live: badge('En juego', 'live'), upcoming: badge('Por jugar', 'soft') };
    const res = (r) => (r && r.winner ? `${r.score1 ?? '?'}–${r.score2 ?? '?'}` : '—');
    return `<div class="adm-filters">
        ${seg('state', f.state, [['', 'Todos', base.length], ['late', 'Sin resultado', n('late')], ['live', 'En juego', n('live')], ['upcoming', 'Por jugar', n('upcoming')], ['done', 'Jugados', n('done')], ['fixed', 'Corregidos', n('fixed')]])}
        <div class="adm-toolbar">
          <select class="select" data-adm-filter="round"><option value="">Todas las rondas</option>${rounds.map(([k, m]) => `<option value="${esc(k)}" ${f.round === k ? 'selected' : ''}>${esc([stageOf(m.page), tabEs(m.tab)].join(' · '))}</option>`).join('')}</select>
          ${search('q', f.q, 'Buscar equipo…')}
          <span class="adm-toolbar__count">${list.length} ${list.length === 1 ? 'partido' : 'partidos'}</span>
        </div>
      </div>` +
      (list.length ? `<div class="adm-table adm-table--matches" role="table">
        <div class="adm-tr adm-tr--head" role="row"><span>Partido</span><span>Cierre</span><span>Resultado</span><span>Pronóst.</span><span>Estado</span><span></span></div>
        ${list.map((m) => `<div class="adm-tr ${m.fix ? 'is-fixed' : ''}" role="row" title="${m.fix ? 'Corregido por el administrador' : ''}">
          <span class="adm-td-main adm-td-match"><span class="adm-td-logos">${teamBadge(m.team1)}${teamBadge(m.team2)}</span><span><b>${esc(displayName(m.team1))} <i>vs</i> ${esc(displayName(m.team2))}</b><small>${esc(tabEs(m.tab))} · Bo${m.bestOf}</small></span></span>
          <span class="adm-td-res">${when(m.fix?.date || m.date)}${m.fix?.date ? '<small class="is-gold">hora cambiada</small>' : ''}</span>
          <span class="adm-num adm-td-res"><b>${res(m.fix?.winner ? m.fix : m.lp)}</b>${m.fix?.winner ? `<small>Leaguepedia: ${res(m.lp)}</small>` : ''}</span>
          <span class="adm-num">${m.picks}${m.combos ? ` <small class="muted">+${m.combos}c</small>` : ''}</span>
          <span>${stLabel[stateOf(m)]}</span>
          <span class="adm-td-act"><button class="btn btn--small adm-btn-ic" type="button" data-adm="fix-open" data-key="${esc(m.key)}">${ic('edit')}<span>Editar</span></button></span>
        </div>`).join('')}</div>` : empty('Ningún partido con esos filtros.', 'search'));
  }

  async function openFix(key) {
    const m = (A.cache.matches || []).find((x) => x.key === key) || null;
    let mm = m;
    if (!mm) { const d = await get('matches'); A.cache.matches = d.matches; mm = d.matches.find((x) => x.key === key); }
    if (!mm) return toast('No se encuentra ese partido.', 'error');
    const picks = await get(`match?key=${encodeURIComponent(key)}`);
    const eff = mm.fix?.winner ? mm.fix : mm.lp;
    openDialog(`${esc(displayName(mm.team1))} vs ${esc(displayName(mm.team2))}`, `
      <p class="adm-sub">${esc([stageOf(mm.page), tabEs(mm.tab)].filter(Boolean).join(' · '))} · al mejor de ${mm.bestOf} · Leaguepedia: ${mm.lp.winner ? `${mm.lp.score1}–${mm.lp.score2}` : 'sin resultado'}</p>
      <form class="adm-form" data-adm-form="fix" data-key="${esc(key)}">
        <fieldset class="adm-fieldset"><legend>Resultado</legend>
          <div class="adm-row3">
            <label>Ganador<select class="select" name="winner"><option value="">Sin corregir</option>
              <option value="1" ${mm.fix?.winner === 1 ? 'selected' : ''}>${esc(displayName(mm.team1))}</option><option value="2" ${mm.fix?.winner === 2 ? 'selected' : ''}>${esc(displayName(mm.team2))}</option></select></label>
            <label>Partidas de ${esc(displayName(mm.team1))}<input class="input" name="score1" type="number" min="0" max="4" value="${eff?.winner ? eff.score1 ?? '' : ''}"></label>
            <label>Partidas de ${esc(displayName(mm.team2))}<input class="input" name="score2" type="number" min="0" max="4" value="${eff?.winner ? eff.score2 ?? '' : ''}"></label>
          </div>
        </fieldset>
        <fieldset class="adm-fieldset"><legend>Hora de cierre de los pronósticos</legend>
          <label>Fecha y hora (tu hora local)<input class="input" name="date" type="datetime-local" value="${esc(mm.fix?.date ? toLocalInput(mm.fix.date) : '')}"></label>
          <p class="adm-hint">Déjalo vacío para usar la de Leaguepedia (${when(mm.date)}). Sirve si un partido se retrasa o la hora publicada está mal.</p>
        </fieldset>
        <div class="adm-actions"><button class="btn btn--gold" type="submit">Guardar corrección</button>
          <button class="btn" type="button" data-adm="fix-clear" data-key="${esc(key)}" ${mm.fix ? '' : 'disabled'}>Quitar corrección</button></div>
      </form>
      <h3 class="adm-h3">Pronósticos (${picks.picks.length})</h3>
      ${picksTable(mm, picks.picks, picks.users)}`, { wide: true });
  }

  function picksTable(m, picks, users) {
    const scores = scoresFor(m.bestOf);
    const teamSel = (sel) => `<select class="select" name="team"><option value="${esc(m.team1)}" ${sel === m.team1 ? 'selected' : ''}>${esc(displayName(m.team1))}</option><option value="${esc(m.team2)}" ${sel === m.team2 ? 'selected' : ''}>${esc(displayName(m.team2))}</option></select>`;
    const scoreSel = (sel) => (scores.length ? `<select class="select" name="score"><option value="">Sin resultado</option>${scores.map((s) => `<option value="${s}" ${sel === s ? 'selected' : ''}>${s.replace('-', '–')}</option>`).join('')}</select>` : '<span class="muted small">Bo1</span>');
    const have = new Set(picks.map((p) => p.user));
    const free = users.filter((u) => !have.has(u.id));
    return `<div class="adm-table adm-table--picks">
      <div class="adm-tr adm-tr--head"><span>Jugador</span><span>Equipo</span><span>Resultado</span><span></span></div>
      ${picks.map((p) => `<form class="adm-tr" data-adm-form="pick" data-user="${p.user}" data-key="${esc(m.key)}">
        <span class="adm-td-main adm-td-user">${avatar(p.nick)}<span><b>${esc(p.nick)}</b><small>${p.first ? 'elegido ' + ago(p.updated) : 'puesto por el administrador o definitivo'}</small></span></span>
        <span>${teamSel(p.team)}</span><span>${scoreSel(p.score)}</span>
        <span class="adm-td-act"><button class="btn btn--small btn--gold" type="submit">Guardar</button><button class="btn btn--small" type="button" data-adm="pick-del" data-user="${p.user}" data-key="${esc(m.key)}">Borrar</button></span>
      </form>`).join('') || `<div class="adm-tr"><span class="muted">Nadie ha pronosticado este partido.</span></div>`}
      ${free.length ? `<form class="adm-tr adm-tr--add" data-adm-form="pick-new" data-key="${esc(m.key)}">
        <span><select class="select" name="user" required><option value="">Añadir a…</option>${free.map((u) => `<option value="${u.id}">${esc(u.nick)}</option>`).join('')}</select></span>
        <span>${teamSel(m.team1)}</span><span>${scoreSel('')}</span>
        <span class="adm-td-act"><button class="btn btn--small btn--gold" type="submit">Añadir</button></span></form>` : ''}
    </div>`;
  }

  // ---------------------------------------------------------------- PRONÓSTICOS
  async function renderPronosticos() {
    const d = A.cache.matches ? { matches: A.cache.matches } : await get('matches');
    A.cache.matches = d.matches;
    const list = d.matches.filter((m) => !isTbd(m.team1) && !isTbd(m.team2)).sort((a, b) => (lpDate(b.date) || 0) - (lpDate(a.date) || 0));
    if (!list.length) return empty('Todavía no hay partidos con los dos equipos conocidos.');
    const key = A.extra && list.some((m) => m.key === A.extra) ? A.extra : (A.cache.pickKey && list.some((m) => m.key === A.cache.pickKey) ? A.cache.pickKey : (list.find((m) => m.picks) || list[0]).key);
    A.cache.pickKey = key;
    const m = list.find((x) => x.key === key);
    const picks = await get(`match?key=${encodeURIComponent(key)}`);
    const n1 = picks.picks.filter((p) => p.team === m.team1).length;
    const n2 = picks.picks.length - n1;
    const pct = (n) => (picks.picks.length ? Math.round((n / picks.picks.length) * 100) : 0);
    return toolbar(`<select class="select adm-grow" data-adm-filter="pickKey">${list.map((x) => `<option value="${esc(x.key)}" ${x.key === key ? 'selected' : ''}>${esc(matchName(x))} · ${esc(tabEs(x.tab))} · ${when(x.date)} (${x.picks})</option>`).join('')}</select>`) +
      `<div class="adm-split">
        <div class="adm-split__side">${teamBadge(m.team1)}<b>${esc(displayName(m.team1))}</b><span>${n1} · ${pct(n1)}%</span></div>
        <div class="adm-split__bar"><i style="width:${pct(n1)}%"></i></div>
        <div class="adm-split__side adm-split__side--r"><span>${n2} · ${pct(n2)}%</span><b>${esc(displayName(m.team2))}</b>${teamBadge(m.team2)}</div>
      </div>
      ${picksTable(m, picks.picks, picks.users)}`;
  }

  // ---------------------------------------------------------------- COMBINADAS
  async function renderCombinadas() {
    const d = await get('combos');
    A.cache.combos = d.combos;
    const f = A.cache.comboFilter || { status: '', q: '' };
    const byQ = d.combos.filter((c) => !f.q || c.nick.toLowerCase().includes(f.q.toLowerCase()));
    const n = (s) => byQ.filter((c) => c.status === s).length;
    const list = byQ.filter((c) => !f.status || c.status === f.status);
    const st = { win: badge('Acertada', 'ok'), lose: badge('Fallada', 'bad'), live: badge('Pendiente', 'soft') };
    return `<div class="adm-filters">
        ${seg('comboStatus', f.status, [['', 'Todas', byQ.length], ['live', 'Pendientes', n('live')], ['win', 'Acertadas', n('win')], ['lose', 'Falladas', n('lose')]])}
        <div class="adm-toolbar">${search('comboQ', f.q, 'Buscar jugador…')}<span class="adm-toolbar__count">${list.length} ${list.length === 1 ? 'combinada' : 'combinadas'}</span>
          <button class="btn btn--small btn--gold adm-btn-ic" type="button" data-adm="combo-new">＋ <span>Nueva combinada</span></button></div>
      </div>` +
      (list.length ? `<div class="adm-cards">${list.map((c) => `<article class="adm-combo is-${c.status}">
        <header>${avatar(c.nick)}<span><b>${esc(c.nick)}</b><small>${esc(roundLabel(c.round))} · ${ago(c.updated)}</small></span>${st[c.status]}</header>
        <ul>${c.legs.map((l) => `<li class="is-${l.result}">${teamBadge(l.team)}<span><b>${esc(displayName(l.team))}</b>${l.score ? ' ' + l.score.replace('-', '–') : ''}<small>vs ${esc(displayName(l.team === l.team1 ? l.team2 : l.team1))}</small></span><i>${l.result === 'ok' ? '✓' : l.result === 'ko' ? '✗' : '…'}</i></li>`).join('')}</ul>
        <footer><span class="adm-combo__pts">${c.status === 'win' ? `<b>+${c.points}</b> puntos` : c.status === 'lose' ? '<b>0</b> puntos' : `<b>${c.potential}</b> en juego`}</span>
          <span class="adm-td-act"><button class="btn btn--small adm-btn-ic" type="button" data-adm="combo-edit" data-i="${d.combos.indexOf(c)}" title="Editar">${ic('edit')}</button><button class="btn btn--small adm-btn-ic adm-danger" type="button" data-adm="combo-del" data-user="${c.user}" data-round="${esc(c.round)}" title="Borrar">${ic('trash')}</button></span></footer>
      </article>`).join('')}</div>` : empty('Ninguna combinada con esos filtros.', 'combinadas'));
  }

  /** Partidos de una ronda con casilla, equipo y resultado (para crear o editar combinadas). */
  function legsTable(round, legs = []) {
    const inRound = A.matches.filter((m) => roundOf(m) === round && !isTbd(m.team1) && !isTbd(m.team2));
    const legBy = new Map(legs.map((l) => [l.key, l]));
    if (!inRound.length) return empty('Esta ronda todavía no tiene partidos con los dos equipos confirmados.', 'partidos');
    return `<div class="adm-table adm-table--legs">
          <div class="adm-tr adm-tr--head"><span></span><span>Partido</span><span>Equipo</span><span>Resultado</span></div>
          ${inRound.map((m) => { const l = legBy.get(m.key); const sc = scoresFor(m.bestOf); return `<div class="adm-tr" data-leg="${esc(m.key)}">
            <span><input type="checkbox" name="on" ${l ? 'checked' : ''} aria-label="Incluir"></span>
            <span class="adm-td-main"><b>${esc(matchName(m))}</b><small>${when(m.date)}</small></span>
            <span><select class="select" name="team"><option value="${esc(m.team1)}" ${l?.team === m.team1 ? 'selected' : ''}>${esc(displayName(m.team1))}</option><option value="${esc(m.team2)}" ${l?.team === m.team2 ? 'selected' : ''}>${esc(displayName(m.team2))}</option></select></span>
            <span>${sc.length ? `<select class="select" name="score"><option value="">—</option>${sc.map((x) => `<option value="${x}" ${l?.score === x ? 'selected' : ''}>${x.replace('-', '–')}</option>`).join('')}</select>` : '<span class="muted small">Bo1</span>'}</span>
          </div>`; }).join('')}
        </div>`;
  }

  /** Crear una combinada a cualquier jugador (si ya tiene una en esa ronda, se reemplaza). */
  async function openComboNew({ user = '', round = '', back = '' } = {}) {
    const [users, combos] = await Promise.all([
      A.cache.users ? A.cache.users : get('users').then((d) => (A.cache.users = d.users)),
      get('combos').then((d) => (A.cache.combos = d.combos)),
    ]);
    // rondas con partidos confirmados, en orden; por defecto la primera que aún no ha empezado del todo
    const rounds = [...new Map(A.matches.filter((m) => !isTbd(m.team1) && !isTbd(m.team2))
      .sort((a, b) => (a.date || 0) - (b.date || 0)).map((m) => [roundOf(m), m])).keys()];
    const openRound = rounds.find((r) => A.matches.some((m) => roundOf(m) === r && m.state === 'upcoming')) || rounds[rounds.length - 1] || '';
    round = rounds.includes(round) ? round : openRound;
    const uid = Number(user) || 0;
    const ex = uid ? combos.find((c) => c.user === uid && c.round === round) : null;
    const nick = users.find((u) => u.id === uid)?.nick;
    openDialog(ex ? `Combinada de ${esc(nick)}` : nick ? `Nueva combinada para ${esc(nick)}` : 'Nueva combinada', `
      <form class="adm-form" data-adm-form="combo-new" data-back="${esc(back)}">
        <div class="adm-grid2 adm-grid2--tight">
          <label>Jugador<select class="select" name="user" data-adm-combo-pick required>
            <option value="" ${uid ? '' : 'selected'} disabled>Elige un jugador…</option>
            ${[...users].sort((a, b) => a.nick.localeCompare(b.nick)).map((u) => `<option value="${u.id}" ${u.id === uid ? 'selected' : ''}>${esc(u.nick)}</option>`).join('')}</select></label>
          <label>Ronda<select class="select" name="round" data-adm-combo-pick>
            ${rounds.map((r) => `<option value="${esc(r)}" ${r === round ? 'selected' : ''}>${esc(roundLabel(r))}</option>`).join('')}</select></label>
        </div>
        ${ex ? `<p class="adm-note adm-note--warn">${ic('alert')}<span><b>${esc(nick)}</b> ya tiene una combinada en esta ronda (${ex.legs.map((l) => esc(displayName(l.team))).join(' + ')}). Está cargada abajo: al guardar se reemplaza.</span></p>`
          : '<p class="adm-sub">Marca de 2 a 4 partidos de la ronda y elige el equipo (y si quieres el resultado) de cada uno. Como administrador puedes usar partidos ya empezados o jugados.</p>'}
        ${round ? legsTable(round, ex?.legs || []) : empty('Todavía no hay partidos con equipos confirmados.', 'partidos')}
        <div class="adm-actions adm-actions--end"><button class="btn" type="button" data-adm="close">Cancelar</button><button class="btn btn--gold" type="submit">${ex ? 'Reemplazar combinada' : 'Crear combinada'}</button></div>
      </form>`, { wide: true });
  }

  function openComboEdit(c) {
    const inRound = A.matches.filter((m) => roundOf(m) === c.round && !isTbd(m.team1) && !isTbd(m.team2));
    const legBy = new Map(c.legs.map((l) => [l.key, l]));
    openDialog(`Combinada de ${esc(c.nick)}`, `
      <p class="adm-sub">${esc(roundLabel(c.round))}. Marca de 2 a 4 partidos y elige el equipo de cada uno.</p>
      <form class="adm-form" data-adm-form="combo" data-user="${c.user}" data-round="${esc(c.round)}">
        <div class="adm-table adm-table--legs">
          <div class="adm-tr adm-tr--head"><span></span><span>Partido</span><span>Equipo</span><span>Resultado</span></div>
          ${inRound.map((m) => { const l = legBy.get(m.key); const sc = scoresFor(m.bestOf); return `<div class="adm-tr" data-leg="${esc(m.key)}">
            <span><input type="checkbox" name="on" ${l ? 'checked' : ''} aria-label="Incluir"></span>
            <span class="adm-td-main"><b>${esc(matchName(m))}</b><small>${when(m.date)}</small></span>
            <span><select class="select" name="team"><option value="${esc(m.team1)}" ${l?.team === m.team1 ? 'selected' : ''}>${esc(displayName(m.team1))}</option><option value="${esc(m.team2)}" ${l?.team === m.team2 ? 'selected' : ''}>${esc(displayName(m.team2))}</option></select></span>
            <span>${sc.length ? `<select class="select" name="score"><option value="">—</option>${sc.map((s) => `<option value="${s}" ${l?.score === s ? 'selected' : ''}>${s.replace('-', '–')}</option>`).join('')}</select>` : '<span class="muted small">Bo1</span>'}</span>
          </div>`; }).join('')}
        </div>
        <div class="adm-actions"><button class="btn btn--gold" type="submit">Guardar combinada</button></div>
      </form>`, { wide: true });
  }

  // ---------------------------------------------------------------- JUGADORES
  async function renderJugadores() {
    const d = await get('users');
    A.cache.users = d.users; A.cache.admins = d.admins;
    const f = A.cache.userFilter || { q: '', only: '' };
    const now = d.now;
    const isAdm = (u) => d.admins.includes(u.nick.toLowerCase());
    const byQ = d.users.filter((u) => !f.q || u.nick.toLowerCase().includes(f.q.toLowerCase()));
    const only = { locked: (u) => u.lockedUntil > now, admins: isAdm, inactive: (u) => !u.picks };
    const list = byQ.filter((u) => !f.only || only[f.only](u));
    return `<div class="adm-filters">
        ${seg('userOnly', f.only, [['', 'Todas', byQ.length], ['inactive', 'Sin pronósticos', byQ.filter(only.inactive).length], ['locked', 'Bloqueadas', byQ.filter(only.locked).length], ['admins', 'Administradores', byQ.filter(isAdm).length]])}
        <div class="adm-toolbar">${search('userQ', f.q, 'Buscar apodo…')}<span class="adm-toolbar__count">${list.length} de ${d.users.length} cuentas</span></div>
      </div>` +
      (list.length ? `<div class="adm-table adm-table--users">
        <div class="adm-tr adm-tr--head"><span>Jugador</span><span>Grupos</span><span>Pronóst.</span><span>Combin.</span><span>Último pronóstico</span><span>Alta</span><span></span></div>
        ${list.map((u) => `<div class="adm-tr">
          <span class="adm-td-main adm-td-user">${avatar(u.nick)}<span><b>${esc(u.nick)}</b><small>${isAdm(u) ? badge('admin', 'gold') : ''}${u.lockedUntil > now ? badge('bloqueada', 'warn') : ''}${!isAdm(u) && !(u.lockedUntil > now) ? 'jugador' : ''}</small></span></span>
          <span class="adm-num">${u.groups}</span><span class="adm-num">${u.picks}</span><span class="adm-num">${u.combos}</span><span>${u.lastPick ? ago(u.lastPick) : '—'}</span><span>${u.created ? fmtDate(new Date(u.created)) : '—'}</span>
          <span class="adm-td-act"><button class="btn btn--small" type="button" data-adm="user-open" data-user="${u.id}">Ver ficha</button></span>
        </div>`).join('')}</div>` : empty('Ninguna cuenta con esos filtros.', 'search'));
  }

  async function openUser(id, tab = 'datos') {
    const d = await get(`user/${id}`);
    const u = d.user;
    const locked = u.lockedUntil > d.now;
    const tabs = [['datos', 'Datos'], ['grupos', `Grupos (${d.groups.length})`], ['pronosticos', `Pronósticos (${d.picks.length})`], ['combinadas', `Combinadas (${d.combos.length})`], ['actividad', 'Actividad']];
    const champ = d.picks.find((p) => p.key === 'champion');
    const picks = d.picks.filter((p) => p.key !== 'champion').map((p) => ({ ...p, m: A.byKey.get(p.key) })).filter((p) => p.m).sort((a, b) => (b.m.date || 0) - (a.m.date || 0));
    const panes = {
      datos: `<div class="adm-profile">${avatar(u.nick)}<span><b>${esc(u.nick)}</b><small>${locked ? 'Bloqueada' : 'Activa'} · ${d.groups.length} ${d.groups.length === 1 ? 'grupo' : 'grupos'} · ${d.picks.length} pronósticos</small></span></div>
        <div class="adm-kv"><span>Apodo</span><b>${esc(u.nick)}</b><span>Alta</span><b>${u.created ? fmtDate(new Date(u.created)) + ' ' + fmtTime(new Date(u.created)) : '—'}</b>
          <span>Estado</span><b>${locked ? badge('Bloqueada hasta ' + fmtTime(new Date(u.lockedUntil)), 'warn') : badge('Activa', 'ok')}</b></div>
        <div class="adm-actions-grid">
          <form class="adm-form" data-adm-form="user-pin" data-user="${u.id}"><label>PIN nuevo<input class="input" name="pin" inputmode="numeric" pattern="\\d{4}" maxlength="4" required placeholder="4 cifras"></label><button class="btn btn--small btn--gold" type="submit">Cambiar PIN</button></form>
          <form class="adm-form" data-adm-form="user-rename" data-user="${u.id}"><label>Apodo nuevo<input class="input" name="nick" maxlength="20" required value="${esc(u.nick)}"></label><label>PIN (obligatorio al cambiar el apodo)<input class="input" name="pin" inputmode="numeric" pattern="\\d{4}" maxlength="4" required placeholder="4 cifras"></label><button class="btn btn--small btn--gold" type="submit">Cambiar apodo</button></form>
        </div>
        <div class="adm-zone">
          <div class="adm-zone__row"><span><b>Desbloquear</b><small>Si ha fallado el PIN demasiadas veces.</small></span><button class="btn btn--small" type="button" data-adm="user-unlock" data-user="${u.id}" ${locked ? '' : 'disabled'}>Desbloquear</button></div>
          <div class="adm-zone__row"><span><b>Cerrar sus sesiones</b><small>Tendrá que volver a entrar con su PIN en todos sus dispositivos.</small></span><button class="btn btn--small" type="button" data-adm="user-logout" data-user="${u.id}">Cerrar sesiones</button></div>
          <div class="adm-zone__row adm-zone__row--danger"><span><b>Borrar la cuenta</b><small>Borra sus pronósticos, combinadas y ajustes. No se puede deshacer.</small></span><button class="btn btn--small adm-danger" type="button" data-adm="user-delete" data-user="${u.id}" data-nick="${esc(u.nick)}">Borrar cuenta</button></div>
        </div>`,
      grupos: d.groups.length ? `<ul class="adm-list">${d.groups.map((g) => `<li><span><b>${esc(g.name)}</b><small>código ${esc(g.code)} · desde ${fmtDate(new Date(g.joined))}</small></span>
          <span class="adm-td-act"><button class="btn btn--small" type="button" data-adm="league-open" data-code="${esc(g.code)}">Ver grupo</button><button class="btn btn--small" type="button" data-adm="league-kick" data-code="${esc(g.code)}" data-user="${u.id}" data-nick="${esc(u.nick)}" data-back="${u.id}">Quitar</button></span></li>`).join('')}</ul>` : empty('No está en ningún grupo.'),
      pronosticos: `${champ ? `<p class="adm-sub">Campeón: <b>${esc(displayName(champ.team))}</b> <button class="btn btn--small" type="button" data-adm="pick-del" data-user="${u.id}" data-key="champion" data-back="${u.id}">Borrar</button></p>` : ''}
        ${picks.length ? `<div class="adm-table adm-table--picks">
          <div class="adm-tr adm-tr--head"><span>Partido</span><span>Equipo</span><span>Resultado</span><span></span></div>
          ${picks.map((p) => { const m = p.m; const sc = scoresFor(m.bestOf); return `<form class="adm-tr" data-adm-form="pick" data-user="${u.id}" data-key="${esc(p.key)}" data-back="${u.id}">
            <span class="adm-td-main"><b>${esc(matchName(m))}</b><small>${esc(tabEs(m.tab))} · ${m.date ? fmtDate(m.date) : ''}</small></span>
            <span><select class="select" name="team"><option value="${esc(m.team1)}" ${p.team === m.team1 ? 'selected' : ''}>${esc(displayName(m.team1))}</option><option value="${esc(m.team2)}" ${p.team === m.team2 ? 'selected' : ''}>${esc(displayName(m.team2))}</option></select></span>
            <span>${sc.length ? `<select class="select" name="score"><option value="">Sin resultado</option>${sc.map((s) => `<option value="${s}" ${p.score === s ? 'selected' : ''}>${s.replace('-', '–')}</option>`).join('')}</select>` : '<span class="muted small">Bo1</span>'}</span>
            <span class="adm-td-act"><button class="btn btn--small btn--gold" type="submit">Guardar</button><button class="btn btn--small" type="button" data-adm="pick-del" data-user="${u.id}" data-key="${esc(p.key)}" data-back="${u.id}">Borrar</button></span>
          </form>`; }).join('')}</div>` : empty('Sin pronósticos de partidos en este Mundial.')}`,
      combinadas: `<div class="adm-actions"><button class="btn btn--small btn--gold" type="button" data-adm="combo-new" data-user="${u.id}" data-back="${u.id}">＋ Nueva combinada</button></div>` + (d.combos.length ? `<ul class="adm-list">${d.combos.map((c) => `<li><span><b>${esc(roundLabel(c.round))}</b><small>${c.legs.map((l) => esc(displayName(l.team)) + (l.score ? ' ' + l.score.replace('-', '–') : '')).join(' + ')} · ${c.status === 'win' ? `acertada (+${c.points})` : c.status === 'lose' ? 'fallada' : `pendiente (${c.potential} pts)`}</small></span>
          <span class="adm-td-act"><button class="btn btn--small" type="button" data-adm="combo-new" data-user="${u.id}" data-round="${esc(c.round)}" data-back="${u.id}">Editar</button><button class="btn btn--small" type="button" data-adm="combo-del" data-user="${u.id}" data-round="${esc(c.round)}" data-back="${u.id}">Borrar</button></span></li>`).join('')}</ul>` : empty('Sin combinadas en este Mundial.')),
      actividad: d.activity.length ? `<ul class="adm-log">${d.activity.map(logItem).join('')}</ul>` : empty('Sin actividad registrada.'),
    };
    openDialog(`Ficha de ${esc(u.nick)}`, `<div class="adm-tabs" role="tablist">${tabs.map(([k, l]) => `<button type="button" role="tab" class="adm-tab ${k === tab ? 'is-on' : ''}" data-adm="user-tab" data-tab="${k}" data-user="${u.id}">${l}</button>`).join('')}</div>
      <div class="adm-pane">${panes[tab]}</div>`, { wide: true });
  }

  // ---------------------------------------------------------------- GRUPOS
  async function renderGrupos() {
    const d = await get('leagues');
    A.cache.leagues = d.leagues;
    const q = A.cache.leagueQ || '';
    const list = d.leagues.filter((l) => !q || `${l.name} ${l.code}`.toLowerCase().includes(q.toLowerCase()));
    return toolbar(`${search('leagueQ', q, 'Buscar grupo o código…')}<span class="adm-toolbar__count">${list.length} grupos</span>`) +
      (list.length ? `<div class="adm-table adm-table--groups">
        <div class="adm-tr adm-tr--head"><span>Grupo</span><span>Código</span><span>Jugadores</span><span>Creador</span><span>Creado</span><span></span></div>
        ${list.map((l) => `<div class="adm-tr"><span class="adm-td-main adm-td-user"><span class="adm-ava adm-ava--sq" style="--h:${hue(l.code)}" aria-hidden="true">${ic('grupos')}</span><span><b>${esc(l.name)}</b><small>${l.players} ${l.players === 1 ? 'jugador' : 'jugadores'}</small></span></span><span><code>${esc(l.code)}</code></span><span>${l.players}</span><span>${esc(l.owner || '—')}</span><span>${fmtDate(new Date(l.created))}</span>
          <span class="adm-td-act"><button class="btn btn--small" type="button" data-adm="league-open" data-code="${esc(l.code)}">Abrir</button></span></div>`).join('')}</div>` : empty('Todavía no hay grupos.'));
  }

  async function openLeague(code) {
    const d = await get(`league/${encodeURIComponent(code)}`);
    const users = A.cache.users || (await get('users')).users;
    A.cache.users = users;
    const lg = d.league;
    A.cache.lastBoard = { league: lg, board: d.board };
    openDialog(`Grupo «${esc(lg.name)}»`, `
      <div class="adm-grid2 adm-grid2--tight">
        <form class="adm-form adm-form--inline" data-adm-form="league-rename" data-code="${esc(lg.code)}"><label>Nombre<input class="input" name="name" maxlength="40" value="${esc(lg.name)}" required></label><button class="btn btn--small btn--gold" type="submit">Renombrar</button></form>
        <form class="adm-form adm-form--inline" data-adm-form="league-add" data-code="${esc(lg.code)}"><label>Añadir jugador<input class="input" name="nick" list="admUsers" placeholder="Apodo" required></label><button class="btn btn--small btn--gold" type="submit">Añadir</button>
          <datalist id="admUsers">${users.map((u) => `<option value="${esc(u.nick)}">`).join('')}</datalist></form>
      </div>
      <h3 class="adm-h3">Clasificación <button class="btn btn--small" type="button" data-adm="board-csv">Descargar CSV</button></h3>
      ${d.board.length ? `<div class="adm-table adm-table--board">
        <div class="adm-tr adm-tr--head"><span>#</span><span>Jugador</span><span>Puntos</span><span>Aciertos</span><span>Exactos</span><span>Combin.</span><span>Ajustes</span><span></span></div>
        ${d.board.map((r, i) => `<div class="adm-tr"><span class="adm-pos">${i + 1}</span><span class="adm-td-main adm-td-user">${avatar(r.nick)}<span><b>${esc(r.nick)}</b></span></span><span><b>${r.points}</b></span><span>${r.hits}/${r.played}</span><span>${r.exact}</span><span>${r.comboWon}/${r.comboPlayed} · +${r.comboPoints}</span><span>${r.adjust ? (r.adjust > 0 ? '+' : '') + r.adjust : '—'}</span>
          <span class="adm-td-act"><button class="btn btn--small" type="button" data-adm="user-open" data-user="${r.id}">Ficha</button><button class="btn btn--small" type="button" data-adm="league-kick" data-code="${esc(lg.code)}" data-user="${r.id}" data-nick="${esc(r.nick)}">Quitar</button></span></div>`).join('')}
      </div>` : empty('El grupo no tiene jugadores.')}
      <h3 class="adm-h3">Ajustes de puntos</h3>
      ${adjustForm(lg.code, d.board)}
      ${d.adjustments.length ? `<ul class="adm-list">${d.adjustments.map(adjustItem).join('')}</ul>` : empty('Sin ajustes en este grupo.')}
      <div class="adm-actions adm-actions--end"><button class="btn btn--small adm-danger" type="button" data-adm="league-delete" data-code="${esc(lg.code)}" data-name="${esc(lg.name)}">Borrar grupo</button></div>`, { wide: true });
  }

  const adjustForm = (code, members) => (members.length ? `<form class="adm-form adm-adjust" data-adm-form="adjust-add" data-code="${esc(code)}">
      <label>Jugador<select class="select" name="user" required><option value="">Elige…</option>${members.map((m) => `<option value="${m.id}">${esc(m.nick)}</option>`).join('')}</select></label>
      <label>Puntos<input class="input" name="points" type="number" min="-999" max="999" step="1" required placeholder="+3 o -2"></label>
      <label class="adm-grow">Motivo<input class="input" name="reason" maxlength="120" required placeholder="Ej.: compensación por un fallo de la web"></label>
      <button class="btn btn--small btn--gold" type="submit">Añadir ajuste</button></form>` : '');
  const adjustItem = (a) => `<li><span><b>${a.points > 0 ? '+' : ''}${a.points} · ${esc(a.nick || '')}</b><small>${esc(a.reason || '')}${a.leagueName ? ' · ' + esc(a.leagueName) : ''} · ${esc(a.by || '')} · ${ago(a.created)}</small></span>
      <button class="btn btn--small" type="button" data-adm="adjust-del" data-id="${a.id}">Quitar</button></li>`;

  // ---------------------------------------------------------------- PUNTOS
  async function renderPuntos() {
    const [d, lg] = await Promise.all([get('adjustments'), get('leagues')]);
    A.cache.leagues = lg.leagues;
    const code = A.cache.adjCode && lg.leagues.some((l) => l.code === A.cache.adjCode) ? A.cache.adjCode : (lg.leagues[0]?.code || '');
    A.cache.adjCode = code;
    let members = [];
    if (code) members = (await get(`league/${encodeURIComponent(code)}`)).board;
    const total = d.adjustments.reduce((n, a) => n + a.points, 0);
    return `<section class="adm-card">
        <h3 class="adm-card__title">Nuevo ajuste</h3>
        ${lg.leagues.length ? `${toolbar(`<label class="adm-inline">Grupo <select class="select" data-adm-filter="adjCode">${lg.leagues.map((l) => `<option value="${esc(l.code)}" ${l.code === code ? 'selected' : ''}>${esc(l.name)} (${esc(l.code)})</option>`).join('')}</select></label>`)}${adjustForm(code, members)}` : empty('Crea primero algún grupo.')}
      </section>
      <section class="adm-card">
        <h3 class="adm-card__title">Todos los ajustes ${badge(`${d.adjustments.length} · total ${total > 0 ? '+' : ''}${total}`)}</h3>
        ${d.adjustments.length ? `<ul class="adm-list">${d.adjustments.map(adjustItem).join('')}</ul>` : empty('No hay ajustes de puntos.')}
      </section>`;
  }

  // ---------------------------------------------------------------- REGISTRO
  const dayKey = (s) => { const d = new Date(s); return isNaN(d) ? '' : d.toDateString(); };
  const dayLabel = (s) => {
    const d = new Date(s); const t = new Date(); const y = new Date(Date.now() - 864e5);
    return d.toDateString() === t.toDateString() ? 'Hoy' : d.toDateString() === y.toDateString() ? 'Ayer' : fmtDate(d);
  };
  function logItem(l) {
    const adm = l.kind === 'admin';
    return `<li class="adm-log__item adm-log__item--${esc(l.kind || '')}"><span class="adm-log__icon">${ic(adm ? 'ajustes' : 'user')}</span>
      <span class="adm-log__txt"><b>${esc(l.action)}</b>${l.detail ? `<span>${esc(l.detail)}</span>` : ''}</span>
      <span class="adm-log__meta"><b>${esc(l.actor || '')}</b><small>${fmtTime(new Date(l.at))}</small></span></li>`;
  }
  /** Lista del registro agrupada por días (continúa los días de una página anterior). */
  function logList(items, compact = false, prevDay = '') {
    let day = prevDay; let html = '';
    for (const l of items) {
      const k = dayKey(l.at);
      if (!compact && k !== day) { html += `<li class="adm-log__day">${dayLabel(l.at)}</li>`; day = k; }
      html += logItem(l);
    }
    A.cache.logDay = day;
    return compact ? `<ul class="adm-log adm-log--compact">${html}</ul>` : html;
  }
  async function renderRegistro() {
    const f = A.cache.logFilter || { kind: '', q: '' };
    const d = await get(`log?kind=${encodeURIComponent(f.kind)}&q=${encodeURIComponent(f.q)}`);
    A.cache.log = d.log;
    return `<div class="adm-filters">
        ${seg('logKind', f.kind, [['', 'Todo'], ['admin', 'Administración'], ['user', 'Jugadores']])}
        <div class="adm-toolbar">${search('logQ', f.q, 'Buscar en el registro…')}<span class="adm-toolbar__count">${d.log.length}${d.log.length === 100 ? '+' : ''} entradas</span></div>
      </div>` +
      (d.log.length ? `<section class="adm-card adm-card--flush"><ul class="adm-log" id="admLog">${logList(d.log)}</ul>
        ${d.log.length === 100 ? '<div class="adm-more"><button class="btn btn--small" type="button" data-adm="log-more">Cargar más</button></div>' : ''}</section>` : empty('Nada que mostrar con esos filtros.', 'search'));
  }

  // ---------------------------------------------------------------- AJUSTES
  async function renderAjustes() {
    const d = await get('settings');
    const s = d.settings; const def = d.defaults;
    A.cache.settings = s;
    const get2 = (o, path) => path.split('.').reduce((x, k) => x?.[k], o);
    const step = (name, label, hint, min, max) => {
      const v = get2(s, name); const dv = get2(def, name);
      return `<div class="adm-setrow"><span class="adm-setrow__txt"><b>${label}${v !== dv ? ' ' + badge('cambiado', 'gold') : ''}</b><small>${hint} · por defecto ${dv}</small></span>
        <span class="adm-step"><button type="button" data-adm="step" data-d="-1" aria-label="Menos">−</button><input class="input" name="${name}" type="number" min="${min}" max="${max}" step="1" value="${v}" required aria-label="${label}"><button type="button" data-adm="step" data-d="1" aria-label="Más">+</button></span></div>`;
    };
    const sw = (name, label, hint) => `<label class="adm-setrow adm-setrow--sw"><span class="adm-setrow__txt"><b>${label}</b><small>${hint}</small></span>
        <span class="adm-switch"><input type="checkbox" name="${name}" ${get2(s, name) ? 'checked' : ''}><span></span></span></label>`;
    return `<form class="adm-settings" data-adm-form="settings">
        <div class="adm-grid2">
          <section class="adm-card">${cardHead('bolt', 'Estado')}
            <div class="adm-setlist">
              ${sw('picksOpen', 'Pronósticos abiertos', 'Si lo apagas, nadie puede pronosticar ni guardar combinadas.')}
              ${sw('registrationOpen', 'Se pueden crear cuentas', 'Si lo apagas, solo entran las cuentas que ya existen.')}
              <label class="adm-setrow adm-setrow--col"><span class="adm-setrow__txt"><b>Aviso para todos</b><small>Se muestra arriba en el Pick'em. Vacío = sin aviso.</small></span><textarea class="input" name="banner" rows="2" maxlength="280">${esc(s.banner)}</textarea></label>
            </div></section>
          <section class="adm-card">${cardHead('clock', 'Tiempo y límites')}
            <div class="adm-setlist">
              <div class="adm-setrow adm-setrow--col"><span class="adm-setrow__txt"><b>Cuándo se cierran los pronósticos</b><small>Vale para los pronósticos, las combinadas y el campeón. Cada partido se cierra siempre, como muy tarde, cuando empieza.</small></span>
                <div class="adm-choice" role="radiogroup">${[
                  ['grace', 'clock', 'Unos minutos después de elegir', `Cada pronóstico se puede cambiar durante ${s.graceMinutes} min; luego es definitivo.`],
                  ['round', 'partidos', 'Al empezar el primer partido de la ronda', 'Se pueden cambiar libremente hasta entonces; luego se cierran todos los de la ronda.'],
                  ['day', 'resumen', 'Al empezar el primer partido del día', 'Igual, pero se cierran todos los partidos de ese día (hora de España).'],
                ].map(([v, icon, t, h]) => `<label class="adm-choice__opt"><input type="radio" name="lockMode" value="${v}" ${s.lockMode === v ? 'checked' : ''}><span class="adm-choice__ic">${ic(icon)}</span><span class="adm-choice__txt"><b>${t}</b><small>${h}</small></span><span class="adm-choice__dot" aria-hidden="true"></span></label>`).join('')}</div></div>
              ${step('graceMinutes', 'Minutos para cambiar', 'solo con «Unos minutos después de elegir»', 0, 120)}
              ${step('maxPlayers', 'Jugadores por grupo', 'máximo', 2, 500)}
              ${step('maxGroups', 'Grupos por cuenta', 'máximo', 1, 100)}
            </div></section>
          <section class="adm-card">${cardHead('pronosticos', 'Puntos de los pronósticos')}
            <div class="adm-setlist">
              ${step('points.win', 'Ganador acertado', 'puntos', 0, 50)}
              ${step('points.exact', 'Resultado exacto', 'puntos extra', 0, 50)}
              ${step('points.koMult', 'Multiplicador eliminatorias', 'cuartos y semifinales', 1, 10)}
              ${step('points.finalMult', 'Multiplicador de la final', 'Gran Final', 1, 10)}
              ${step('points.champion', 'Campeón acertado', 'puntos', 0, 100)}
            </div></section>
          <section class="adm-card">${cardHead('combinadas', 'Combinadas')}
            <div class="adm-setlist">
              ${sw('combo.enabled', 'Combinadas activadas', 'Si las desactivas se ocultan (las hechas siguen contando).')}
              ${step('combo.p2', '2 partidos', 'puntos', 0, 100)}
              ${step('combo.p3', '3 partidos', 'puntos', 0, 100)}
              ${step('combo.p4', '4 partidos', 'puntos', 0, 100)}
              ${step('combo.exact', 'Por resultado exacto', 'puntos extra', 0, 50)}
              ${step('combo.koMult', 'Multiplicador eliminatorias', 'si incluye cuartos, semis o final', 1, 10)}
            </div></section>
        </div>
        <section class="adm-card">${cardHead('final', 'Apuestas de la final')}
          <div class="adm-grid2">
            <div class="adm-setlist">
              ${sw('final.enabled', 'Apuestas de la final activadas', 'Si las desactivas desaparece la pestaña «Final» (lo ya ganado sigue contando).')}
              ${step('final.maxBets', 'Apuestas por persona', 'máximo', 1, 10)}
              ${step('final.maxSels', 'Selecciones por apuesta', 'máximo', 1, 10)}
            </div>
            <div class="adm-setlist">
              ${step('final.b2', 'Bonus con 2 selecciones', 'si se aciertan todas', 0, 100)}
              ${step('final.b3', 'Bonus con 3 selecciones', 'si se aciertan todas', 0, 100)}
              ${step('final.b4', 'Bonus con 4 selecciones', 'si se aciertan todas', 0, 100)}
              ${step('final.b5', 'Bonus con 5 selecciones', 'si se aciertan todas', 0, 100)}
            </div>
          </div>
        </section>
        <div class="adm-savebar" role="status">
          <span class="adm-savebar__txt">${ic('alert')}<span><b>Tienes cambios sin guardar</b><small>Al guardar se recalculan todas las clasificaciones.</small></span></span>
          <span class="adm-savebar__btns"><button class="btn btn--small" type="button" data-adm="settings-discard">Descartar</button><button class="btn btn--small btn--gold" type="submit">Guardar cambios</button></span>
        </div>
      </form>
      <div class="adm-grid2">
        <section class="adm-card adm-card--action">${cardHead('download', 'Copia de seguridad')}
          <p class="adm-sub">Todos los datos del Pick'em (cuentas sin PIN, grupos, pronósticos, combinadas, correcciones, ajustes y registro) en un fichero JSON.</p>
          <button class="btn btn--small adm-btn-ic" type="button" data-adm="export">${ic('download')}<span>Descargar copia</span></button></section>
        <section class="adm-card adm-card--action">${cardHead('reset', 'Valores por defecto')}
          <p class="adm-sub">Vuelve a las reglas originales: ${def.points.win} por ganador, +${def.points.exact} por exacto, ×${def.points.koMult} y ×${def.points.finalMult}, ${def.graceMinutes} minutos para cambiar… Se recalculan las clasificaciones.</p>
          <button class="btn btn--small adm-btn-ic adm-danger" type="button" data-adm="settings-reset">${ic('reset')}<span>Restablecer</span></button></section>
      </div>`;
  }

  // ---------------------------------------------------------------- APUESTAS DE LA FINAL
  const FX_TYPES = [
    ['score|', 'Marcador exacto', 'serie'], ['winner|', 'Ganador'],
    ['ou|kills', 'Más/menos · kills'], ['ou|towers', 'Más/menos · torres'], ['ou|dragons', 'Más/menos · dragones'], ['ou|barons', 'Más/menos · barones'], ['ou|length', 'Más/menos · duración'],
    ['team|kills', 'Qué equipo · más kills'], ['team|deaths', 'Qué equipo · muere más'], ['team|towers', 'Qué equipo · más torres'], ['team|dragons', 'Qué equipo · más dragones'], ['team|barons', 'Qué equipo · más barones'],
    ['player|kills', 'Jugador · más kills'], ['player|deaths', 'Jugador · menos muertes'], ['player|assists', 'Jugador · más asistencias'],
  ];
  const fxClock = (s) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;
  const fxLineTxt = (m) => (m.kind !== 'ou' ? '—' : m.stat === 'length' ? fxClock(m.line) : String(m.line).replace('.', ','));
  const fxScopeTxt = (s) => (s === 'series' ? 'Serie' : `Partida ${String(s).slice(1)}`);
  const fxOptTxt = (d, m, id) => {
    const o = m.options.find((x) => x.id === id);
    if (!o) return id;
    if (m.kind === 'score') { const g = id.split('-').map(Number); return `${displayName(o.team === 't1' ? d.match.team1 : d.match.team2)} ${Math.max(...g)}–${Math.min(...g)}`; }
    if (o.team && m.kind !== 'player') return displayName(o.team === 't1' ? d.match.team1 : d.match.team2);
    return o.label;
  };
  function fxStateBadge(d, m) {
    const r = m.result || {};
    if (r.state === 'void') return badge(r.manual ? 'Anulado a mano' : 'Anulado', '');
    if (r.state === 'done') {
      const txt = r.win.map((w) => fxOptTxt(d, m, w)).join(' / ');
      return r.manual ? badge(`A mano: ${txt}`, 'gold') : badge(`Resuelto: ${txt}`, 'ok');
    }
    return d.lockAt && Date.now() >= d.lockAt ? badge('Pendiente', 'warn') : badge('Abierto', 'soft');
  }
  async function renderFinal() {
    const d = await get('final');
    A.cache.final = d;
    const t1 = d.match ? displayName(d.match.team1) : '?'; const t2 = d.match ? displayName(d.match.team2) : '?';
    const locked = d.lockAt && Date.now() >= d.lockAt;
    const head = `<section class="adm-card">
        ${cardHead('pronosticos', d.match ? `Gran Final · ${esc(t1)} vs ${esc(t2)}` : 'Gran Final', `<small class="adm-card__aside">${d.match?.date ? when(d.match.date) + ' · ' : ''}${locked ? 'apuestas cerradas' : 'apuestas abiertas hasta que empiece'}</small>`)}
        ${!d.ready ? `<p class="adm-note adm-note--warn">${ic('alert')}<span>Todavía no se conocen los dos equipos de la final. Podrás crear los mercados cuando Leaguepedia los publique.</span></p>` : ''}
        <div class="adm-fxrules">
          <span><b>${d.rules.maxBets}</b><small>apuestas por persona</small></span><span><b>1–${d.rules.maxSels}</b><small>selecciones por apuesta</small></span>
          <span><b>+${d.rules.b2} · +${d.rules.b3} · +${d.rules.b4} · +${d.rules.b5}</b><small>bonus con 2 · 3 · 4 · 5</small></span>
          <span><b>${d.rules.enabled ? 'Activadas' : 'Desactivadas'}</b><small><a href="#/pickem-admin/ajustes">cambiar en Ajustes</a></small></span>
        </div>
        ${d.ready ? `<div class="adm-actions"><button class="btn btn--small btn--gold" type="button" data-adm="fx-templates">⚡ Crear mercados típicos</button>
          <span class="adm-hint">Marcador, kills, torres, dragones, barones, duración, muertes, jugador con más kills y partida 1. Las líneas salen de las medias del Mundial (${d.avg.games} partidas: ${String(Math.round(d.avg.kills * 10) / 10).replace('.', ',')} kills y ${String(Math.round(d.avg.dragons * 10) / 10).replace('.', ',')} dragones de media). No repite los que ya existan.</span></div>` : ''}
      </section>`;
    const table = d.markets.length ? `<div class="adm-table adm-table--fx">
        <div class="adm-tr adm-tr--head"><span>Mercado</span><span>Ámbito</span><span>Línea</span><span>Puntos</span><span>Apuestas</span><span>Estado</span><span></span></div>
        ${d.markets.map((m) => `<div class="adm-tr ${m.manual ? 'is-fixed' : ''}">
          <span class="adm-td-main"><b>${esc(m.title)}</b><small>${m.options.length} opciones</small></span>
          <span>${fxScopeTxt(m.scope)}</span><span class="adm-num">${fxLineTxt(m)}</span><span class="adm-num">${m.points}</span><span class="adm-num">${m.bets}</span>
          <span>${fxStateBadge(d, m)}</span>
          <span class="adm-td-act"><button class="btn btn--small adm-btn-ic" type="button" data-adm="fx-edit" data-id="${m.id}" title="Editar">${ic('edit')}</button><button class="btn btn--small" type="button" data-adm="fx-result" data-id="${m.id}">Resultado</button></span>
        </div>`).join('')}</div>` : empty('Todavía no hay mercados. Créalos de golpe con «Crear mercados típicos» o uno a uno abajo.', 'pronosticos');
    const form = d.ready ? `<section class="adm-card">${cardHead('edit', 'Nuevo mercado')}
        <form class="adm-form adm-fxform" data-adm-form="fx-add">
          <label>Mercado<select class="select" name="type">${FX_TYPES.map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}</select></label>
          <label>Ámbito<select class="select" name="scope"><option value="series">Toda la serie</option>${[1, 2, 3, 4, 5].slice(0, d.match?.bestOf || 5).map((n) => `<option value="g${n}">Partida ${n}</option>`).join('')}</select></label>
          <label>Línea (más/menos)<input class="input" name="line" placeholder="85,5 o 38:30"></label>
          <label>Puntos<input class="input" name="points" type="number" min="0" max="100" value="2" required></label>
          <button class="btn btn--gold" type="submit">Crear mercado</button>
        </form>
        <p class="adm-hint">En «Qué equipo» de dragones y barones se añade la opción Empate. En «Jugador» entran los 5 titulares de cada equipo en su última serie.</p></section>` : '';
    const bets = d.bets.length ? `<div class="adm-table adm-table--fxbets">
        <div class="adm-tr adm-tr--head"><span>Jugador</span><span>Selecciones</span><span>Estado</span><span>Puntos</span><span></span></div>
        ${d.bets.map((b) => `<div class="adm-tr">
          <span class="adm-td-main adm-td-user">${avatar(b.nick)}<span><b>${esc(b.nick)}</b><small>Apuesta ${b.slot} · ${ago(b.updated)}</small></span></span>
          <span class="adm-fxsels">${b.sels.map((s) => { const m = d.markets.find((x) => x.id === Number(s.m)); return `<span class="is-${s.result}">${m ? esc(m.title) + ': <b>' + esc(fxOptTxt(d, m, s.o)) + '</b>' : 'Mercado borrado'}</span>`; }).join('')}</span>
          <span>${{ win: badge('Acertada', 'ok'), lose: badge('Fallada', 'bad'), live: badge('En juego', 'soft'), void: badge('Anulada') }[b.status]}</span>
          <span class="adm-num">${b.status === 'win' ? '+' + b.points : b.status === 'live' ? b.potential + ' en juego' : '0'}</span>
          <span class="adm-td-act"><button class="btn btn--small adm-btn-ic adm-danger" type="button" data-adm="fx-bet-del" data-user="${b.user}" data-slot="${b.slot}" title="Borrar">${ic('trash')}</button></span>
        </div>`).join('')}</div>` : empty('Nadie ha apostado todavía.', 'jugadores');
    return head + `<h3 class="adm-h3">Mercados <span class="adm-badge">${d.markets.length}</span></h3>` + table + form
      + `<h3 class="adm-h3">Apuestas <span class="adm-badge">${d.bets.length}</span></h3>` + bets;
  }
  function openFxEdit(id) {
    const d = A.cache.final; const m = d.markets.find((x) => x.id === Number(id));
    if (!m) return;
    openDialog(esc(m.title), `<form class="adm-form" data-adm-form="fx-edit" data-id="${m.id}">
        <div class="adm-grid2 adm-grid2--tight">
          ${m.kind === 'ou' ? `<label>Línea<input class="input" name="line" value="${fxLineTxt(m)}" required></label>` : ''}
          <label>Puntos<input class="input" name="points" type="number" min="0" max="100" value="${m.points}" required></label>
          ${m.kind !== 'score' ? `<label>Ámbito<select class="select" name="scope"><option value="series" ${m.scope === 'series' ? 'selected' : ''}>Toda la serie</option>${[1, 2, 3, 4, 5].slice(0, d.match?.bestOf || 5).map((n) => `<option value="g${n}" ${m.scope === 'g' + n ? 'selected' : ''}>Partida ${n}</option>`).join('')}</select></label>` : ''}
        </div>
        ${m.bets ? `<p class="adm-note adm-note--warn">${ic('alert')}<span>Este mercado está en ${m.bets} ${m.bets === 1 ? 'apuesta' : 'apuestas'}. Si cambias la línea o el ámbito, las apuestas siguen con la opción elegida (más/menos, equipo…) sobre el mercado nuevo.</span></p>` : ''}
        <div class="adm-actions adm-actions--end"><button class="btn adm-danger" type="button" data-adm="fx-del" data-id="${m.id}">Borrar mercado</button><button class="btn btn--gold" type="submit">Guardar</button></div>
      </form>`);
  }
  function openFxResult(id) {
    const d = A.cache.final; const m = d.markets.find((x) => x.id === Number(id));
    if (!m) return;
    const r = m.result || {};
    const cur = m.manual ? (r.state === 'void' ? 'void' : r.win[0]) : '';
    openDialog(`Resultado · ${esc(m.title)}`, `<form class="adm-form" data-adm-form="fx-result" data-id="${m.id}">
        <p class="adm-sub">${m.manual ? 'Ahora mismo está puesto a mano.' : r.state === 'done' ? `Automático (Leaguepedia): <b>${esc(r.win.map((w) => fxOptTxt(d, m, w)).join(' / '))}</b>${r.value != null ? ` · dato: ${esc(Array.isArray(r.value) ? r.value.join('–') : m.stat === 'length' ? fxClock(r.value) : r.value)}` : ''}.` : r.state === 'void' ? 'Automático: anulado (esa partida no se jugó o hubo empate en la línea).' : 'Todavía no hay datos: se resolverá solo cuando Leaguepedia publique las estadísticas.'}</p>
        <div class="adm-choice" role="radiogroup">
          <label class="adm-choice__opt"><input type="radio" name="result" value="" ${cur === '' ? 'checked' : ''}><span class="adm-choice__ic">${ic('reload')}</span><span class="adm-choice__txt"><b>Automático</b><small>Con los datos de Leaguepedia</small></span><span class="adm-choice__dot"></span></label>
          ${m.options.map((o) => `<label class="adm-choice__opt"><input type="radio" name="result" value="${esc(o.id)}" ${cur === o.id ? 'checked' : ''}><span class="adm-choice__ic">${ic('ok')}</span><span class="adm-choice__txt"><b>${esc(fxOptTxt(d, m, o.id))}</b><small>Poner esta opción como ganadora</small></span><span class="adm-choice__dot"></span></label>`).join('')}
          <label class="adm-choice__opt"><input type="radio" name="result" value="void" ${cur === 'void' ? 'checked' : ''}><span class="adm-choice__ic">${ic('danger')}</span><span class="adm-choice__txt"><b>Anular</b><small>Se quita de todas las apuestas</small></span><span class="adm-choice__dot"></span></label>
        </div>
        <div class="adm-actions adm-actions--end"><button class="btn btn--gold" type="submit">Guardar resultado</button></div>
      </form>`, { wide: true });
  }

  const SECTION_RENDER = {
    resumen: renderResumen, partidos: renderPartidos, pronosticos: renderPronosticos, combinadas: renderCombinadas,
    jugadores: renderJugadores, grupos: renderGrupos, puntos: renderPuntos, registro: renderRegistro, ajustes: renderAjustes, final: renderFinal,
  };

  // ---------------------------------------------------------------- descargas
  function download(name, text, type) {
    const blob = new Blob([text], { type });
    const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: name });
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }
  const csvCell = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;

  // ---------------------------------------------------------------- etiquetas para móvil
  // En pantallas estrechas las tablas pasan a fichas: cada celda muestra el título de su columna.
  function labelTables(root) {
    for (const t of root.querySelectorAll?.('.adm-table') || []) {
      const head = [...(t.querySelector('.adm-tr--head')?.children || [])].map((c) => c.textContent.trim());
      for (const tr of t.querySelectorAll('.adm-tr:not(.adm-tr--head)')) {
        [...tr.children].forEach((c, i) => { if (head[i] && !c.classList.contains('adm-td-main') && !c.dataset.l) c.dataset.l = head[i]; });
      }
    }
  }
  new MutationObserver((list) => { if (list.some((m) => m.addedNodes.length)) labelTables($view); }).observe($view, { childList: true, subtree: true });

  // ---------------------------------------------------------------- eventos
  const inAdmin = () => !!$view.querySelector('.adm');
  async function afterChange(back) {
    await reloadBody();
    if (back) await openUser(Number(back), document.querySelector('.adm-tab.is-on')?.dataset.tab || 'datos');
  }

  $view.addEventListener('click', async (e) => {
    if (!inAdmin()) return;
    const b = e.target.closest('[data-adm]');
    if (!b || b.tagName === 'INPUT') return;
    const k = b.dataset.adm; const ds = b.dataset;
    if (k === 'reload') { A.cache.matches = null; A.cache.counts = null; route({ refresh: true }); return; }
    if (k === 'seg') {
      const map = { state: ['matchFilter', 'state'], comboStatus: ['comboFilter', 'status'], userOnly: ['userFilter', 'only'], logKind: ['logFilter', 'kind'] };
      const [obj, key] = map[ds.f] || []; if (!obj) return;
      A.cache[obj] = { ...(A.cache[obj] || {}), [key]: ds.v };
      await reloadBody(); return;
    }
    if (k === 'step') {
      const inp = b.parentElement.querySelector('input');
      const v = Math.min(Number(inp.max), Math.max(Number(inp.min), (Number(inp.value) || 0) + Number(ds.d)));
      inp.value = v; inp.dispatchEvent(new Event('input', { bubbles: true })); return;
    }
    if (k === 'settings-discard') { await reloadBody(); return; }
    if (k === 'banner-clear') {
      const s = structuredClone(A.cache.settings || (await get('settings')).settings); s.banner = '';
      if (await act(async () => { const r = await post('settings', { settings: s }); A.cache.settings = r.settings; }, 'Aviso quitado')) await reloadBody();
      return;
    }
    if (k === 'close') { closeDialog(); return; }
    if (k === 'fix-open') { try { await openFix(ds.key); } catch (err) { toast(err.message, 'error'); } return; }
    if (k === 'fix-clear') { if (await act(() => post('fix-clear', { key: ds.key }), 'Corrección quitada')) { A.cache.matches = null; await reloadBody(); await openFix(ds.key); } return; }
    if (k === 'pick-del') {
      if (!confirm('¿Borrar este pronóstico? No se puede deshacer.')) return;
      if (await act(() => post('pick', { user: Number(ds.user), key: ds.key, team: null }), 'Pronóstico borrado')) {
        A.cache.matches = null;
        if (ds.back) await afterChange(ds.back); else { await reloadBody(); if (document.getElementById('admDialog')?.open) await openFix(ds.key); }
      }
      return;
    }
    if (k === 'fx-templates') { if (await act(async () => { const r = await post('market-templates', {}); toast(`${r.created} mercados creados`, 'ok'); })) await reloadBody(); return; }
    if (k === 'fx-edit') { openFxEdit(ds.id); return; }
    if (k === 'fx-result') { openFxResult(ds.id); return; }
    if (k === 'fx-del') { if (!confirm('¿Borrar este mercado? Se quitará de todas las apuestas.')) return; if (await act(() => post('market-delete', { id: Number(ds.id) }), 'Mercado borrado')) { closeDialog(); await reloadBody(); } return; }
    if (k === 'fx-bet-del') { if (!confirm('¿Borrar esta apuesta?')) return; if (await act(() => post('bet', { user: Number(ds.user), slot: Number(ds.slot), sels: [] }), 'Apuesta borrada')) await reloadBody(); return; }
    if (k === 'combo-new') { await act(() => openComboNew({ user: ds.user, round: ds.round, back: ds.back })); return; }
    if (k === 'combo-edit') { const c = A.cache.combos?.[Number(ds.i)]; if (c) openComboEdit(c); return; }
    if (k === 'combo-del') {
      if (!confirm('¿Borrar esta combinada? No se puede deshacer.')) return;
      if (await act(() => post('combo', { user: Number(ds.user), round: ds.round, legs: null }), 'Combinada borrada')) await afterChange(ds.back);
      return;
    }
    if (k === 'user-open') { try { await openUser(Number(ds.user)); } catch (err) { toast(err.message, 'error'); } return; }
    if (k === 'user-tab') { try { await openUser(Number(ds.user), ds.tab); } catch (err) { toast(err.message, 'error'); } return; }
    if (k === 'user-unlock') { if (await act(() => post('user-unlock', { user: Number(ds.user) }), 'Cuenta desbloqueada')) { await reloadBody(); if (document.getElementById('admDialog')?.open) await openUser(Number(ds.user)); } return; }
    if (k === 'user-logout') { if (confirm('¿Cerrar la sesión de esta cuenta en todos sus dispositivos? Tendrá que volver a entrar con su PIN.')) await act(() => post('user-logout', { user: Number(ds.user) }), 'Sesiones cerradas'); return; }
    if (k === 'user-delete') {
      if (prompt(`Esto borra la cuenta «${ds.nick}» con todos sus pronósticos, combinadas y ajustes. Escribe su apodo para confirmar:`) !== ds.nick) return;
      if (await act(() => post('user-delete', { user: Number(ds.user) }), 'Cuenta borrada')) { closeDialog(); await reloadBody(); }
      return;
    }
    if (k === 'league-open') { try { await openLeague(ds.code); } catch (err) { toast(err.message, 'error'); } return; }
    if (k === 'league-kick') {
      if (!confirm(`¿Quitar a ${ds.nick} de este grupo?`)) return;
      if (await act(() => post('league-kick', { code: ds.code, user: Number(ds.user) }), 'Jugador quitado')) { await reloadBody(); if (ds.back) await openUser(Number(ds.back), 'grupos'); else await openLeague(ds.code); }
      return;
    }
    if (k === 'league-delete') {
      if (prompt(`Esto borra el grupo «${ds.name}» (sus jugadores conservan su cuenta y sus pronósticos). Escribe el código ${ds.code} para confirmar:`)?.toUpperCase() !== ds.code) return;
      if (await act(() => post('league-delete', { code: ds.code }), 'Grupo borrado')) { closeDialog(); await reloadBody(); }
      return;
    }
    if (k === 'adjust-del') {
      if (!confirm('¿Quitar este ajuste de puntos?')) return;
      if (await act(() => post('adjust-delete', { id: Number(ds.id) }), 'Ajuste quitado')) {
        await reloadBody();
        const code = document.querySelector('#admDialog[open] [data-adm-form="league-rename"]')?.dataset.code;
        if (code) await openLeague(code);
      }
      return;
    }
    if (k === 'board-csv') {
      const lb = A.cache.lastBoard; if (!lb) return;
      const rows = [['Posición', 'Jugador', 'Puntos', 'Aciertos', 'Jugados', 'Exactos', 'Combinadas acertadas', 'Puntos de combinadas', 'Ajustes']]
        .concat(lb.board.map((r, i) => [i + 1, r.nick, r.points, r.hits, r.played, r.exact, r.comboWon, r.comboPoints, r.adjust]));
      download(`clasificacion-${lb.league.code}.csv`, '﻿' + rows.map((r) => r.map(csvCell).join(';')).join('\r\n'), 'text/csv');
      return;
    }
    if (k === 'log-more') {
      const last = A.cache.log?.[A.cache.log.length - 1]; if (!last) return;
      const f = A.cache.logFilter || { kind: '', q: '' };
      try {
        const d = await get(`log?before=${last.id}&kind=${encodeURIComponent(f.kind)}&q=${encodeURIComponent(f.q)}`);
        A.cache.log = A.cache.log.concat(d.log);
        document.getElementById('admLog')?.insertAdjacentHTML('beforeend', logList(d.log, false, A.cache.logDay));
        if (d.log.length < 100) b.remove();
      } catch (err) { toast(err.message, 'error'); }
      return;
    }
    if (k === 'settings-reset') {
      if (!confirm('¿Volver a las reglas por defecto? Se recalculan todas las clasificaciones.')) return;
      if (await act(() => post('settings-reset', {}), 'Ajustes restablecidos')) await reloadBody();
      return;
    }
    if (k === 'export') {
      try { const d = await get('export'); download(`pickem-copia-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(d, null, 1), 'application/json'); toast('Copia descargada'); } catch (err) { toast(err.message, 'error'); }
    }
  });

  // Interruptores rápidos del resumen y filtros de las listas
  $view.addEventListener('change', async (e) => {
    if (!inAdmin()) return;
    const t = e.target;
    if (t.dataset.adm === 'quick-toggle') {
      const s = structuredClone(A.cache.settings || (await get('settings')).settings);
      const [a, b] = t.dataset.field.split('.');
      if (b) s[a][b] = t.checked; else s[a] = t.checked;
      if (await act(async () => { const r = await post('settings', { settings: s }); A.cache.settings = r.settings; }, 'Guardado')) { await reloadBody(); return; }
      t.checked = !t.checked;
      return;
    }
    if (t.closest('[data-adm-form="settings"]')) { t.closest('form').classList.add('is-dirty'); return; }
    if (t.matches('[data-adm-combo-pick]')) {            // cambiar jugador o ronda en «Nueva combinada»
      const fm = t.closest('form');
      await act(() => openComboNew({ user: fm.user.value, round: fm.round.value, back: fm.dataset.back }));
      return;
    }
    const f = t.dataset.admFilter;
    if (!f) return;
    const set = (obj, key) => { A.cache[obj] = { ...(A.cache[obj] || {}), [key]: t.value }; };
    if (f === 'round' || f === 'state') set('matchFilter', f);
    else if (f === 'pickKey') A.cache.pickKey = t.value, A.extra = t.value;
    else if (f === 'comboStatus') set('comboFilter', 'status');
    else if (f === 'userOnly') set('userFilter', 'only');
    else if (f === 'logKind') set('logFilter', 'kind');
    else if (f === 'adjCode') A.cache.adjCode = t.value;
    else return;
    await reloadBody();
  });
  let typing = null;
  $view.addEventListener('input', (e) => {
    if (!inAdmin()) return;
    const t = e.target; const f = t.dataset.admFilter;
    if (t.closest('[data-adm-form="settings"]')) { t.closest('form').classList.add('is-dirty'); return; }
    if (!['q', 'comboQ', 'userQ', 'leagueQ', 'logQ'].includes(f)) return;
    clearTimeout(typing);
    typing = setTimeout(async () => {
      if (f === 'q') A.cache.matchFilter = { ...(A.cache.matchFilter || {}), q: t.value };
      if (f === 'comboQ') A.cache.comboFilter = { ...(A.cache.comboFilter || {}), q: t.value };
      if (f === 'userQ') A.cache.userFilter = { ...(A.cache.userFilter || {}), q: t.value };
      if (f === 'leagueQ') A.cache.leagueQ = t.value;
      if (f === 'logQ') A.cache.logFilter = { ...(A.cache.logFilter || {}), q: t.value };
      const pos = t.selectionStart;
      await reloadBody();
      const again = $view.querySelector(`[data-adm-filter="${f}"]`);
      if (again) { again.focus(); try { again.setSelectionRange(pos, pos); } catch { /* type=search */ } }
    }, 300);
  });

  // Formularios
  $view.addEventListener('submit', async (e) => {
    if (!inAdmin()) return;
    const form = e.target; const kind = form.dataset.admForm;
    if (!kind) return;
    e.preventDefault();
    const fd = Object.fromEntries(new FormData(form));
    const ds = form.dataset;
    const btn = form.querySelector('button[type=submit]');
    if (btn) btn.disabled = true;
    try {
      if (kind === 'banner') {
        const s = structuredClone(A.cache.settings || (await get('settings')).settings);
        s.banner = fd.banner || '';
        const r = await post('settings', { settings: s }); A.cache.settings = r.settings; toast('Aviso guardado'); await reloadBody();
      } else if (kind === 'fix') {
        const body = { key: ds.key };
        if (fd.winner) Object.assign(body, { winner: Number(fd.winner), score1: Number(fd.score1), score2: Number(fd.score2) });
        if (fd.date) body.date = new Date(fd.date).toISOString();
        await post('fix', body); toast('Corrección guardada');
        A.cache.matches = null; await reloadBody(); await openFix(ds.key);
      } else if (kind === 'pick' || kind === 'pick-new') {
        await post('pick', { user: Number(kind === 'pick-new' ? fd.user : ds.user), key: ds.key, team: fd.team, score: fd.score || null });
        toast(kind === 'pick-new' ? 'Pronóstico añadido' : 'Pronóstico guardado');
        A.cache.matches = null;
        if (ds.back) await afterChange(ds.back);
        else { await reloadBody(); if (document.getElementById('admDialog')?.open) await openFix(ds.key); }
      } else if (kind === 'combo') {
        const legs = [...form.querySelectorAll('[data-leg]')].filter((r) => r.querySelector('[name=on]').checked)
          .map((r) => ({ key: r.dataset.leg, team: r.querySelector('[name=team]').value, score: r.querySelector('[name=score]')?.value || null }));
        await post('combo', { user: Number(ds.user), round: ds.round, legs }); toast('Combinada guardada');
        closeDialog(); await reloadBody();
      } else if (kind === 'combo-new') {
        const legs = [...form.querySelectorAll('[data-leg]')].filter((r) => r.querySelector('[name=on]').checked)
          .map((r) => ({ key: r.dataset.leg, team: r.querySelector('[name=team]').value, score: r.querySelector('[name=score]')?.value || null }));
        if (!fd.user) throw new Error('Elige un jugador.');
        if (legs.length < 2 || legs.length > 4) throw new Error('Marca entre 2 y 4 partidos.');
        await post('combo', { user: Number(fd.user), round: fd.round, legs }); toast('Combinada guardada');
        closeDialog(); await reloadBody();
        if (ds.back) await openUser(Number(ds.back), 'combinadas');
      } else if (kind === 'user-pin') {
        await post('user-pin', { user: Number(ds.user), pin: fd.pin }); toast('PIN cambiado: díselo a su dueño'); form.reset();
      } else if (kind === 'user-rename') {
        await post('user-rename', { user: Number(ds.user), nick: fd.nick, pin: fd.pin }); toast('Apodo cambiado');
        await reloadBody(); await openUser(Number(ds.user));
      } else if (kind === 'league-rename') {
        await post('league-rename', { code: ds.code, name: fd.name }); toast('Grupo renombrado'); await reloadBody(); await openLeague(ds.code);
      } else if (kind === 'league-add') {
        await post('league-add', { code: ds.code, nick: fd.nick }); toast('Jugador añadido'); await reloadBody(); await openLeague(ds.code);
      } else if (kind === 'adjust-add') {
        await post('adjust-add', { code: ds.code, user: Number(fd.user), points: Number(fd.points), reason: fd.reason }); toast('Ajuste añadido');
        await reloadBody();
        if (document.querySelector('#admDialog[open]')) await openLeague(ds.code);
      } else if (kind === 'fx-add') {
        const [kd, stat] = fd.type.split('|');
        await post('market-add', { kind: kd, stat, scope: fd.scope, line: fd.line, points: Number(fd.points) }); toast('Mercado creado');
        await reloadBody();
      } else if (kind === 'fx-edit') {
        await post('market-edit', { id: Number(ds.id), ...(fd.line != null ? { line: fd.line } : {}), points: Number(fd.points), ...(fd.scope ? { scope: fd.scope } : {}) }); toast('Mercado guardado');
        closeDialog(); await reloadBody();
      } else if (kind === 'fx-result') {
        await post('market-result', { id: Number(ds.id), result: fd.result || null }); toast('Resultado guardado');
        closeDialog(); await reloadBody();
      } else if (kind === 'settings') {
        const s = structuredClone(A.cache.settings);
        for (const [name, val] of Object.entries(fd)) {
          if (name === 'banner') { s.banner = val; continue; }
          if (name === 'lockMode') { s.lockMode = val; continue; }
          const [a, b] = name.split('.');
          if (b) s[a][b] = Number(val); else s[a] = Number(val);
        }
        for (const name of ['picksOpen', 'registrationOpen', 'combo.enabled', 'final.enabled']) {
          const on = !!form.querySelector(`[name="${name}"]`)?.checked; const [a, b] = name.split('.');
          if (b) s[a][b] = on; else s[a] = on;
        }
        const r = await post('settings', { settings: s }); A.cache.settings = r.settings; toast('Ajustes guardados');
        await reloadBody();
      }
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      if (btn && document.contains(btn)) btn.disabled = false;
    }
  });

  return { view, isOpen: () => !!document.querySelector('#admDialog[open]') };
}
