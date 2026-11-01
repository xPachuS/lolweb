// =============================================================
//  Panel de administración del Pick'em  (#/pickem-admin/<sección>)
//
//  Secciones: Resumen · Partidos · Pronósticos · Combinadas · Jugadores ·
//  Grupos · Puntos · Registro · Ajustes. Solo para las cuentas de la
//  variable PICKEM_ADMINS del Worker; el servidor comprueba cada petición.
//
//  app.js lo crea con createAdmin(helpers) y llama a view(sección, extra).
// =============================================================

const SECTIONS = [
  { id: 'resumen', icon: '◈', label: 'Resumen', desc: 'Estado del Pick\'em de un vistazo: cifras, avisos y últimos movimientos.' },
  { id: 'partidos', icon: '⚔', label: 'Partidos', desc: 'Corrige resultados y horas de cierre. Tus correcciones mandan sobre las de Leaguepedia.' },
  { id: 'pronosticos', icon: '✎', label: 'Pronósticos', desc: 'Todos los pronósticos de un partido: cámbialos, bórralos o pon uno a alguien.' },
  { id: 'combinadas', icon: '⧉', label: 'Combinadas', desc: 'Todas las combinadas del Mundial, con su estado y sus puntos.' },
  { id: 'jugadores', icon: '◉', label: 'Jugadores', desc: 'Cuentas: PIN, apodo, bloqueos, sesiones, grupos y pronósticos de cada uno.' },
  { id: 'grupos', icon: '⬡', label: 'Grupos', desc: 'Grupos, sus jugadores y su clasificación.' },
  { id: 'puntos', icon: '±', label: 'Puntos', desc: 'Puntos sumados o restados a mano, con su motivo. Cuentan en la clasificación del grupo.' },
  { id: 'registro', icon: '☰', label: 'Registro', desc: 'Todo lo que pasa: cuentas nuevas, grupos y cada cambio hecho desde este panel.' },
  { id: 'ajustes', icon: '⚙', label: 'Ajustes', desc: 'Reglas del juego, límites, aviso para todos y copias de seguridad.' },
];

export function createAdmin(h) {
  const { api, esc, $view, route, teamBadge, displayName, fmtDate, fmtTime, tabEs, pkLoad, pickemYear, loadShorts, getWorldsMatches } = h;
  const A = { token: '', year: 0, section: 'resumen', matches: [], byKey: new Map(), cache: {}, admin: '' };

  // ---------------------------------------------------------------- utilidades
  const call = (method, path, body) => api.pickem(method, `/admin/${path}`, { token: A.token, body: body ? { year: A.year, ...body } : undefined });
  const get = (path) => call('GET', `${path}${path.includes('?') ? '&' : '?'}year=${A.year}`);
  const post = (path, body) => call('POST', path, body);
  const lpDate = (s) => (s ? new Date(String(s).replace(' ', 'T') + (String(s).endsWith('Z') ? '' : 'Z')) : null);
  const when = (s) => { const d = lpDate(s); return d && !isNaN(d) ? `${fmtDate(d)} ${fmtTime(d)}` : '—'; };
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
  const empty = (txt) => `<div class="adm-empty">${txt}</div>`;
  const toolbar = (inner) => `<div class="adm-toolbar">${inner}</div>`;
  const badge = (txt, kind = '') => `<span class="adm-badge ${kind ? 'adm-badge--' + kind : ''}">${txt}</span>`;

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
      body = await SECTION_RENDER[A.section]();
    } catch (err) {
      if (err.status === 403 || err.status === 401) {
        return `<div class="state state--error"><p><strong>${esc(err.message)}</strong></p>
          <p class="muted">Los administradores se configuran en Cloudflare con la variable <code>PICKEM_ADMINS</code> del Worker (ver README).</p>
          <a class="btn" href="#/pickem">Volver al Pick'em</a></div>`;
      }
      body = `<div class="state state--error"><p><strong>${esc(err.message)}</strong></p><button class="btn" type="button" data-adm="reload">Reintentar</button></div>`;
    }
    const sec = SECTIONS.find((s) => s.id === A.section);
    return `<div class="adm">
      <aside class="adm-side" aria-label="Secciones de administración">
        <div class="adm-side__brand"><b>Administración</b><small>Pick'em · Mundial ${A.year}</small></div>
        <nav class="adm-nav">${SECTIONS.map((s) => `<a class="adm-nav__item ${s.id === A.section ? 'is-on' : ''}" href="#/pickem-admin/${s.id}" ${s.id === A.section ? 'aria-current="page"' : ''}>
          <span class="adm-nav__icon" aria-hidden="true">${s.icon}</span><span>${s.label}</span>${A.cache.counts?.[s.id] != null ? `<span class="adm-nav__n">${A.cache.counts[s.id]}</span>` : ''}</a>`).join('')}</nav>
        <a class="adm-side__back" href="#/pickem">← Volver al Pick'em</a>
      </aside>
      <section class="adm-main">
        <header class="adm-head"><div><h1 class="adm-head__title">${sec.label}</h1><p class="adm-head__desc">${sec.desc}</p></div>
          <button class="btn btn--small" type="button" data-adm="reload" title="Volver a cargar los datos">↻ Actualizar</button></header>
        <div class="adm-body" id="admBody">${body}</div>
      </section>
      <dialog class="adm-dialog" id="admDialog" aria-labelledby="admDialogTitle"><div class="adm-dialog__box" id="admDialogBox"></div></dialog>
    </div>`;
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
    const d = await get('overview');
    A.admin = d.admin;
    A.cache.settings = d.settings;
    A.cache.counts = { jugadores: d.stats.users, grupos: d.stats.leagues, combinadas: d.stats.combos, puntos: d.stats.adjustments };
    const tile = (n, label, href) => `<a class="adm-tile" href="#/pickem-admin/${href}"><b>${n}</b><span>${label}</span></a>`;
    const s = d.stats;
    const late = d.late.map((m) => `<li><span><b>${esc(displayName(m.team1))} vs ${esc(displayName(m.team2))}</b><small>${esc(tabEs(m.tab))} · empezó ${when(m.date)}</small></span>
      <button class="btn btn--small btn--gold" type="button" data-adm="fix-open" data-key="${esc(m.key)}">Poner resultado</button></li>`).join('');
    const locked = d.locked.map((u) => `<li><span><b>${esc(u.nick)}</b><small>bloqueada por fallar el PIN</small></span>
      <button class="btn btn--small" type="button" data-adm="user-unlock" data-user="${u.id}">Desbloquear</button></li>`).join('');
    const upcoming = d.upcoming.map((m) => `<li><span><b>${esc(displayName(m.team1))} vs ${esc(displayName(m.team2))}</b><small>${esc(tabEs(m.tab))} · ${when(m.date)}</small></span>
      ${badge(`${m.picks} ${m.picks === 1 ? 'pronóstico' : 'pronósticos'}`)}</li>`).join('');
    return `<div class="adm-tiles">
        ${tile(s.users, 'cuentas', 'jugadores')}${tile(s.leagues, 'grupos', 'grupos')}${tile(s.picks, 'pronósticos', 'pronosticos')}${tile(s.combos, 'combinadas', 'combinadas')}
        ${tile(s.fixes, 'partidos corregidos', 'partidos')}${tile(s.adjustments, 'ajustes de puntos', 'puntos')}${tile(s.newUsers7d, 'cuentas nuevas (7 días)', 'jugadores')}${tile(s.active24h, 'activos hoy', 'jugadores')}
      </div>
      <div class="adm-grid2">
        <section class="adm-card">
          <h3 class="adm-card__title">Estado del juego</h3>
          <div class="adm-switches">
            <label class="adm-switch"><input type="checkbox" data-adm="quick-toggle" data-field="picksOpen" ${d.settings.picksOpen ? 'checked' : ''}><span></span><b>Pronósticos abiertos</b></label>
            <label class="adm-switch"><input type="checkbox" data-adm="quick-toggle" data-field="registrationOpen" ${d.settings.registrationOpen ? 'checked' : ''}><span></span><b>Se pueden crear cuentas</b></label>
            <label class="adm-switch"><input type="checkbox" data-adm="quick-toggle" data-field="combo.enabled" ${d.settings.combo.enabled ? 'checked' : ''}><span></span><b>Combinadas activadas</b></label>
          </div>
          <form class="adm-form adm-form--inline" data-adm-form="banner">
            <label>Aviso para todos<input class="input" name="banner" maxlength="280" value="${esc(d.settings.banner)}" placeholder="Ej.: Hoy a las 18:00 se juega la final"></label>
            <button class="btn btn--small btn--gold" type="submit">Guardar aviso</button>
          </form>
        </section>
        <section class="adm-card">
          <h3 class="adm-card__title">Necesita atención ${d.late.length + d.locked.length ? badge(d.late.length + d.locked.length, 'warn') : ''}</h3>
          ${late || locked ? `<ul class="adm-list">${late}${locked}</ul>` : empty('Todo en orden: no hay partidos sin resultado ni cuentas bloqueadas.')}
        </section>
        <section class="adm-card">
          <h3 class="adm-card__title">Próximos partidos (48 h)</h3>
          ${upcoming ? `<ul class="adm-list">${upcoming}</ul>` : empty('No hay partidos con equipos confirmados en las próximas 48 horas.')}
        </section>
        <section class="adm-card">
          <h3 class="adm-card__title">Actividad reciente <a class="adm-card__more" href="#/pickem-admin/registro">Ver todo</a></h3>
          ${d.recent.length ? `<ul class="adm-log adm-log--compact">${d.recent.map(logItem).join('')}</ul>` : empty('Todavía no hay actividad.')}
        </section>
      </div>`;
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
    const list = d.matches.filter((m) => !isTbd(m.team1) || !isTbd(m.team2))
      .filter((m) => !f.round || `${m.page}|${m.tab}` === f.round)
      .filter((m) => !f.state || (f.state === 'fixed' ? !!m.fix : stateOf(m) === f.state))
      .filter((m) => !f.q || `${m.team1} ${m.team2}`.toLowerCase().includes(f.q.toLowerCase()))
      .sort((a, b) => (lpDate(b.fix?.date || b.date) || 0) - (lpDate(a.fix?.date || a.date) || 0));
    const stLabel = { done: badge('Jugado'), late: badge('Sin resultado', 'warn'), live: badge('En juego', 'live'), upcoming: badge('Por jugar', 'soft') };
    const res = (r) => (r && r.winner ? `${r.score1 ?? '?'}–${r.score2 ?? '?'}` : '—');
    return toolbar(`
        <select class="select" data-adm-filter="round"><option value="">Todas las rondas</option>${rounds.map(([k, m]) => `<option value="${esc(k)}" ${f.round === k ? 'selected' : ''}>${esc([stageOf(m.page), tabEs(m.tab)].join(' · '))}</option>`).join('')}</select>
        <select class="select" data-adm-filter="state"><option value="">Todos los estados</option>
          ${[['late', 'Sin resultado'], ['live', 'En juego'], ['upcoming', 'Por jugar'], ['done', 'Jugados'], ['fixed', 'Corregidos']].map(([v, l]) => `<option value="${v}" ${f.state === v ? 'selected' : ''}>${l}</option>`).join('')}</select>
        <input class="input" type="search" data-adm-filter="q" placeholder="Buscar equipo…" value="${esc(f.q)}">
        <span class="adm-toolbar__count">${list.length} partidos</span>`) +
      (list.length ? `<div class="adm-table adm-table--matches" role="table">
        <div class="adm-tr adm-tr--head" role="row"><span>Partido</span><span>Cierre</span><span>Leaguepedia</span><span>Pick'em</span><span>Pronóst.</span><span>Estado</span><span></span></div>
        ${list.map((m) => `<div class="adm-tr ${m.fix ? 'is-fixed' : ''}" role="row">
          <span class="adm-td-main"><b>${esc(displayName(m.team1))} <i>vs</i> ${esc(displayName(m.team2))}</b><small>${esc([stageOf(m.page), tabEs(m.tab)].filter(Boolean).join(' · '))} · Bo${m.bestOf}</small></span>
          <span>${when(m.fix?.date || m.date)}${m.fix?.date ? ' ' + badge('cambiada', 'gold') : ''}</span>
          <span>${res(m.lp)}</span>
          <span><b>${res(m.fix?.winner ? m.fix : m.lp)}</b>${m.fix?.winner ? ' ' + badge('corregido', 'gold') : ''}</span>
          <span>${m.picks}${m.combos ? ` <small class="muted">+${m.combos} comb.</small>` : ''}</span>
          <span>${stLabel[stateOf(m)]}</span>
          <span class="adm-td-act"><button class="btn btn--small" type="button" data-adm="fix-open" data-key="${esc(m.key)}">Editar</button></span>
        </div>`).join('')}</div>` : empty('Ningún partido con esos filtros.'));
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
        <span class="adm-td-main"><b>${esc(p.nick)}</b><small>${p.first ? 'elegido ' + ago(p.updated) : 'puesto por el administrador o definitivo'}</small></span>
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
    const list = d.combos.filter((c) => !f.status || c.status === f.status).filter((c) => !f.q || c.nick.toLowerCase().includes(f.q.toLowerCase()));
    const st = { win: badge('Acertada', 'ok'), lose: badge('Fallada', 'bad'), live: badge('Pendiente', 'soft') };
    return toolbar(`<select class="select" data-adm-filter="comboStatus"><option value="">Todas</option>${[['live', 'Pendientes'], ['win', 'Acertadas'], ['lose', 'Falladas']].map(([v, l]) => `<option value="${v}" ${f.status === v ? 'selected' : ''}>${l}</option>`).join('')}</select>
        <input class="input" type="search" data-adm-filter="comboQ" placeholder="Buscar jugador…" value="${esc(f.q)}"><span class="adm-toolbar__count">${list.length} combinadas</span>`) +
      (list.length ? `<div class="adm-cards">${list.map((c, i) => `<article class="adm-combo is-${c.status}">
        <header><span><b>${esc(c.nick)}</b><small>${esc(roundLabel(c.round))} · ${ago(c.updated)}</small></span>${st[c.status]}</header>
        <ul>${c.legs.map((l) => `<li class="is-${l.result}">${teamBadge(l.team)}<span><b>${esc(displayName(l.team))}</b>${l.score ? ' ' + l.score.replace('-', '–') : ''}<small>vs ${esc(displayName(l.team === l.team1 ? l.team2 : l.team1))}</small></span><i>${l.result === 'ok' ? '✓' : l.result === 'ko' ? '✗' : '…'}</i></li>`).join('')}</ul>
        <footer><span>${c.status === 'win' ? `<b>+${c.points}</b> puntos` : c.status === 'lose' ? '0 puntos' : `${c.potential} en juego`}</span>
          <span class="adm-td-act"><button class="btn btn--small" type="button" data-adm="combo-edit" data-i="${i}">Editar</button><button class="btn btn--small" type="button" data-adm="combo-del" data-user="${c.user}" data-round="${esc(c.round)}">Borrar</button></span></footer>
      </article>`).join('')}</div>` : empty('Ninguna combinada con esos filtros.'));
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
    const list = d.users.filter((u) => !f.q || u.nick.toLowerCase().includes(f.q.toLowerCase()))
      .filter((u) => f.only !== 'locked' || u.lockedUntil > now).filter((u) => f.only !== 'admins' || d.admins.includes(u.nick.toLowerCase()))
      .filter((u) => f.only !== 'inactive' || !u.picks);
    return toolbar(`<input class="input" type="search" data-adm-filter="userQ" placeholder="Buscar apodo…" value="${esc(f.q)}">
        <select class="select" data-adm-filter="userOnly"><option value="">Todas las cuentas</option>${[['locked', 'Bloqueadas'], ['admins', 'Administradores'], ['inactive', 'Sin pronósticos este Mundial']].map(([v, l]) => `<option value="${v}" ${f.only === v ? 'selected' : ''}>${l}</option>`).join('')}</select>
        <span class="adm-toolbar__count">${list.length} de ${d.users.length}</span>`) +
      (list.length ? `<div class="adm-table adm-table--users">
        <div class="adm-tr adm-tr--head"><span>Apodo</span><span>Grupos</span><span>Pronóst.</span><span>Combin.</span><span>Último pronóstico</span><span>Alta</span><span></span></div>
        ${list.map((u) => `<div class="adm-tr">
          <span class="adm-td-main"><b>${esc(u.nick)}</b><small>${d.admins.includes(u.nick.toLowerCase()) ? badge('admin', 'gold') : ''}${u.lockedUntil > now ? badge('bloqueada', 'warn') : ''}</small></span>
          <span>${u.groups}</span><span>${u.picks}</span><span>${u.combos}</span><span>${u.lastPick ? ago(u.lastPick) : '—'}</span><span>${u.created ? fmtDate(new Date(u.created)) : '—'}</span>
          <span class="adm-td-act"><button class="btn btn--small" type="button" data-adm="user-open" data-user="${u.id}">Ficha</button></span>
        </div>`).join('')}</div>` : empty('Ninguna cuenta con esos filtros.'));
  }

  async function openUser(id, tab = 'datos') {
    const d = await get(`user/${id}`);
    const u = d.user;
    const locked = u.lockedUntil > d.now;
    const tabs = [['datos', 'Datos'], ['grupos', `Grupos (${d.groups.length})`], ['pronosticos', `Pronósticos (${d.picks.length})`], ['combinadas', `Combinadas (${d.combos.length})`], ['actividad', 'Actividad']];
    const champ = d.picks.find((p) => p.key === 'champion');
    const picks = d.picks.filter((p) => p.key !== 'champion').map((p) => ({ ...p, m: A.byKey.get(p.key) })).filter((p) => p.m).sort((a, b) => (b.m.date || 0) - (a.m.date || 0));
    const panes = {
      datos: `<div class="adm-kv"><span>Apodo</span><b>${esc(u.nick)}</b><span>Alta</span><b>${u.created ? fmtDate(new Date(u.created)) + ' ' + fmtTime(new Date(u.created)) : '—'}</b>
          <span>Estado</span><b>${locked ? badge('Bloqueada hasta ' + fmtTime(new Date(u.lockedUntil)), 'warn') : badge('Activa', 'ok')}</b></div>
        <div class="adm-actions-grid">
          <form class="adm-form" data-adm-form="user-pin" data-user="${u.id}"><label>PIN nuevo<input class="input" name="pin" inputmode="numeric" pattern="\\d{4}" maxlength="4" required placeholder="4 cifras"></label><button class="btn btn--small btn--gold" type="submit">Cambiar PIN</button></form>
          <form class="adm-form" data-adm-form="user-rename" data-user="${u.id}"><label>Apodo nuevo<input class="input" name="nick" maxlength="20" required value="${esc(u.nick)}"></label><label>PIN (obligatorio al cambiar el apodo)<input class="input" name="pin" inputmode="numeric" pattern="\\d{4}" maxlength="4" required placeholder="4 cifras"></label><button class="btn btn--small btn--gold" type="submit">Cambiar apodo</button></form>
        </div>
        <div class="adm-actions">
          <button class="btn btn--small" type="button" data-adm="user-unlock" data-user="${u.id}" ${locked ? '' : 'disabled'}>Desbloquear</button>
          <button class="btn btn--small" type="button" data-adm="user-logout" data-user="${u.id}">Cerrar sus sesiones</button>
          <button class="btn btn--small adm-danger" type="button" data-adm="user-delete" data-user="${u.id}" data-nick="${esc(u.nick)}">Borrar cuenta</button>
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
      combinadas: d.combos.length ? `<ul class="adm-list">${d.combos.map((c) => `<li><span><b>${esc(roundLabel(c.round))}</b><small>${c.legs.map((l) => esc(displayName(l.team)) + (l.score ? ' ' + l.score.replace('-', '–') : '')).join(' + ')} · ${c.status === 'win' ? `acertada (+${c.points})` : c.status === 'lose' ? 'fallada' : `pendiente (${c.potential} pts)`}</small></span>
          <span class="adm-td-act"><button class="btn btn--small" type="button" data-adm="combo-del" data-user="${u.id}" data-round="${esc(c.round)}" data-back="${u.id}">Borrar</button></span></li>`).join('')}</ul>` : empty('Sin combinadas en este Mundial.'),
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
    return toolbar(`<input class="input" type="search" data-adm-filter="leagueQ" placeholder="Buscar grupo o código…" value="${esc(q)}"><span class="adm-toolbar__count">${list.length} grupos</span>`) +
      (list.length ? `<div class="adm-table adm-table--groups">
        <div class="adm-tr adm-tr--head"><span>Grupo</span><span>Código</span><span>Jugadores</span><span>Creador</span><span>Creado</span><span></span></div>
        ${list.map((l) => `<div class="adm-tr"><span class="adm-td-main"><b>${esc(l.name)}</b></span><span><code>${esc(l.code)}</code></span><span>${l.players}</span><span>${esc(l.owner || '—')}</span><span>${fmtDate(new Date(l.created))}</span>
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
        ${d.board.map((r, i) => `<div class="adm-tr"><span class="adm-pos">${i + 1}</span><span class="adm-td-main"><b>${esc(r.nick)}</b></span><span><b>${r.points}</b></span><span>${r.hits}/${r.played}</span><span>${r.exact}</span><span>${r.comboWon}/${r.comboPlayed} · +${r.comboPoints}</span><span>${r.adjust ? (r.adjust > 0 ? '+' : '') + r.adjust : '—'}</span>
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
  const LOG_ICON = { admin: '⚙', user: '◉' };
  function logItem(l) {
    return `<li class="adm-log__item adm-log__item--${esc(l.kind || '')}"><span class="adm-log__icon" aria-hidden="true">${LOG_ICON[l.kind] || '•'}</span>
      <span class="adm-log__txt"><b>${esc(l.action)}</b>${l.detail ? ` <span>${esc(l.detail)}</span>` : ''}<small>${esc(l.actor || '')} · ${ago(l.at)}</small></span></li>`;
  }
  async function renderRegistro() {
    const f = A.cache.logFilter || { kind: '', q: '' };
    const d = await get(`log?kind=${encodeURIComponent(f.kind)}&q=${encodeURIComponent(f.q)}`);
    A.cache.log = d.log;
    return toolbar(`<select class="select" data-adm-filter="logKind"><option value="">Todo</option><option value="admin" ${f.kind === 'admin' ? 'selected' : ''}>Administración</option><option value="user" ${f.kind === 'user' ? 'selected' : ''}>Jugadores</option></select>
        <input class="input" type="search" data-adm-filter="logQ" placeholder="Buscar…" value="${esc(f.q)}"><span class="adm-toolbar__count">${d.log.length} entradas</span>`) +
      (d.log.length ? `<ul class="adm-log" id="admLog">${d.log.map(logItem).join('')}</ul>
        ${d.log.length === 100 ? '<div class="adm-actions"><button class="btn btn--small" type="button" data-adm="log-more">Cargar más</button></div>' : ''}` : empty('Nada que mostrar con esos filtros.'));
  }

  // ---------------------------------------------------------------- AJUSTES
  async function renderAjustes() {
    const d = await get('settings');
    const s = d.settings; const def = d.defaults;
    A.cache.settings = s;
    const num = (name, val, label, hint, min, max, dv) => `<label>${label}<input class="input" name="${name}" type="number" min="${min}" max="${max}" step="1" value="${val}" required><small class="adm-hint">${hint} · por defecto ${dv}</small></label>`;
    const sw = (name, val, label, hint) => `<label class="adm-switch adm-switch--block"><input type="checkbox" name="${name}" ${val ? 'checked' : ''}><span></span><b>${label}</b><small class="adm-hint">${hint}</small></label>`;
    return `<form class="adm-form adm-settings" data-adm-form="settings">
        <section class="adm-card"><h3 class="adm-card__title">Estado</h3>
          <div class="adm-grid2 adm-grid2--tight">
            ${sw('picksOpen', s.picksOpen, 'Pronósticos abiertos', 'Si lo apagas, nadie puede pronosticar ni guardar combinadas.')}
            ${sw('registrationOpen', s.registrationOpen, 'Se pueden crear cuentas', 'Si lo apagas, solo entran las cuentas que ya existen.')}
          </div>
          <label>Aviso para todos<textarea class="input" name="banner" rows="2" maxlength="280" placeholder="Se muestra arriba en el Pick'em. Vacío = sin aviso.">${esc(s.banner)}</textarea></label>
        </section>
        <section class="adm-card"><h3 class="adm-card__title">Tiempo y límites</h3>
          <div class="adm-grid3">
            ${num('graceMinutes', s.graceMinutes, 'Minutos para cambiar', 'tras elegir un pronóstico o una combinada', 0, 120, def.graceMinutes)}
            ${num('maxPlayers', s.maxPlayers, 'Jugadores por grupo', 'máximo', 2, 500, def.maxPlayers)}
            ${num('maxGroups', s.maxGroups, 'Grupos por cuenta', 'máximo', 1, 100, def.maxGroups)}
          </div>
        </section>
        <section class="adm-card"><h3 class="adm-card__title">Puntos de los pronósticos</h3>
          <div class="adm-grid3">
            ${num('points.win', s.points.win, 'Ganador acertado', 'puntos', 0, 50, def.points.win)}
            ${num('points.exact', s.points.exact, 'Resultado exacto', 'puntos extra', 0, 50, def.points.exact)}
            ${num('points.champion', s.points.champion, 'Campeón acertado', 'puntos', 0, 100, def.points.champion)}
            ${num('points.koMult', s.points.koMult, 'Multiplicador eliminatorias', 'cuartos y semifinales', 1, 10, def.points.koMult)}
            ${num('points.finalMult', s.points.finalMult, 'Multiplicador final', 'Gran Final', 1, 10, def.points.finalMult)}
          </div>
        </section>
        <section class="adm-card"><h3 class="adm-card__title">Combinadas</h3>
          ${sw('combo.enabled', s.combo.enabled, 'Combinadas activadas', 'Si las desactivas, desaparecen del Pick\'em (las ya hechas siguen contando).')}
          <div class="adm-grid3">
            ${num('combo.p2', s.combo.p2, '2 partidos', 'puntos', 0, 100, def.combo.p2)}
            ${num('combo.p3', s.combo.p3, '3 partidos', 'puntos', 0, 100, def.combo.p3)}
            ${num('combo.p4', s.combo.p4, '4 partidos', 'puntos', 0, 100, def.combo.p4)}
            ${num('combo.exact', s.combo.exact, 'Por resultado exacto', 'puntos extra', 0, 50, def.combo.exact)}
            ${num('combo.koMult', s.combo.koMult, 'Multiplicador eliminatorias', 'si incluye cuartos, semis o final', 1, 10, def.combo.koMult)}
          </div>
        </section>
        <div class="adm-actions adm-actions--sticky">
          <button class="btn btn--gold" type="submit">Guardar ajustes</button>
          <button class="btn" type="button" data-adm="settings-reset">Restablecer valores por defecto</button>
          <span class="adm-hint">Los cambios de puntos recalculan todas las clasificaciones al momento.</span>
        </div>
      </form>
      <section class="adm-card"><h3 class="adm-card__title">Copia de seguridad</h3>
        <p class="adm-sub">Descarga todos los datos del Pick'em (cuentas sin PIN, grupos, pronósticos, combinadas, correcciones, ajustes y registro) en un fichero JSON.</p>
        <button class="btn btn--small" type="button" data-adm="export">Descargar copia (JSON)</button>
      </section>`;
  }

  const SECTION_RENDER = {
    resumen: renderResumen, partidos: renderPartidos, pronosticos: renderPronosticos, combinadas: renderCombinadas,
    jugadores: renderJugadores, grupos: renderGrupos, puntos: renderPuntos, registro: renderRegistro, ajustes: renderAjustes,
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
    if (k === 'reload') { A.cache.matches = null; route({ refresh: true }); return; }
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
        document.getElementById('admLog')?.insertAdjacentHTML('beforeend', d.log.map(logItem).join(''));
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
      if (await act(async () => { const r = await post('settings', { settings: s }); A.cache.settings = r.settings; }, 'Guardado')) return;
      t.checked = !t.checked;
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
        const r = await post('settings', { settings: s }); A.cache.settings = r.settings; toast('Aviso guardado');
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
      } else if (kind === 'settings') {
        const s = structuredClone(A.cache.settings);
        for (const [name, val] of Object.entries(fd)) {
          if (name === 'banner') { s.banner = val; continue; }
          const [a, b] = name.split('.');
          if (b) s[a][b] = Number(val); else s[a] = Number(val);
        }
        for (const name of ['picksOpen', 'registrationOpen', 'combo.enabled']) {
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
