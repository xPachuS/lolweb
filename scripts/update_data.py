#!/usr/bin/env python3
"""
Descarga de Leaguepedia los datos que usa la web y los guarda en data/*.json.

Lo ejecuta GitHub Actions cada 10 minutos (.github/workflows/update-data.yml).
Así los visitantes nunca consultan Leaguepedia: leen ficheros estáticos del
propio repositorio, sin límites de uso ni problemas de CORS.

Solo usa la librería estándar de Python (no hay que instalar nada).

Opcional pero recomendado: un "bot password" de Fandom en los secretos
LP_USERNAME y LP_PASSWORD del repositorio (ver README). Con sesión iniciada
Leaguepedia da mucho más margen de consultas.
"""
import http.cookiejar
import json
import re
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timedelta, timezone
from pathlib import Path

API = os.environ.get('LP_API', 'https://lol.fandom.com/api.php')  # LP_API solo para pruebas
UA = 'GrietaArchivo/1.0 (fan site; GitHub Actions; https://github.com)'
ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / 'data'
STATE_FILE = DATA / '.state.json'

PAUSE = float(os.environ.get('LP_PAUSE', 2.5))  # segundos entre consultas
TIME_BUDGET = int(os.environ.get('LP_BUDGET', 8 * 60))  # tope de cada ejecución; lo pendiente sigue en la próxima
FIRST_WORLDS_YEAR = 2011

# Ligas: mismo `slug` que en js/config.js. `pages` y `names` son los patrones
# con los que Leaguepedia nombra sus torneos ("LCK/2026 Season/…", "LCK 2026 …").
LEAGUES = [
    {'slug': 'lck',   'name': 'LCK',   'pages': 'LCK/%',   'names': 'LCK 2%'},
    {'slug': 'lpl',   'name': 'LPL',   'pages': 'LPL/%',   'names': 'LPL 2%'},
    {'slug': 'lec',   'name': 'LEC',   'pages': 'LEC/%',   'names': 'LEC 2%'},
    {'slug': 'lcs',   'name': 'LCS',   'pages': 'LCS/%',   'names': 'LCS 2%'},
    {'slug': 'lcp',   'name': 'LCP',   'pages': 'LCP/%',   'names': 'LCP 2%'},
    {'slug': 'cblol', 'name': 'CBLOL', 'pages': 'CBLOL/%', 'names': 'CBLOL 2%'},
    {'slug': 'msi',   'name': 'MSI',   'pages': '% Mid-Season Invitational%', 'names': 'MSI 2%'},
    {'slug': 'first-stand', 'name': 'First Stand', 'pages': '% First Stand%', 'names': 'First Stand 2%'},
]

MATCH_FIELDS = ','.join([
    'MS.Team1=Team1', 'MS.Team2=Team2', 'MS.Winner=Winner',
    'MS.Team1Score=Score1', 'MS.Team2Score=Score2',
    'MS.DateTime_UTC=Date', 'MS.OverviewPage=Page', 'MS.Tab=Tab', 'MS.BestOf=BestOf',
])

NOW = datetime.now(timezone.utc)
START = time.monotonic()
stats = {'queries': 0, 'errors': [], 'halted': None, 'logged_in': False}


class Halt(Exception):
    """Se para la ejecución (límite de Leaguepedia o tiempo agotado). Lo pendiente sigue en la próxima."""


# ---------------------------------------------------------------- utilidades
def log(*a):
    print(*a, flush=True)


def iso(dt):
    return dt.strftime('%Y-%m-%dT%H:%M:%SZ')


def parse_date(s):
    """'2026-10-04', '2026-10-04 08:00:00' o ISO → datetime UTC (o None)."""
    if not s:
        return None
    s = s.replace('T', ' ').replace('Z', '')
    for fmt in ('%Y-%m-%d %H:%M:%S', '%Y-%m-%d'):
        try:
            return datetime.strptime(s[:19] if ' ' in s else s[:10], fmt).replace(tzinfo=timezone.utc)
        except ValueError:
            pass
    return None


def q(s):
    return str(s).replace('"', '\\"')


def worlds_page(year):
    return f'Season {year - 2010} World Championship' if year <= 2013 else f'{year} Season World Championship'


def read_json(path, default=None):
    try:
        return json.loads(Path(path).read_text(encoding='utf-8'))
    except (FileNotFoundError, json.JSONDecodeError):
        return default


def write_json(path, obj):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    text = json.dumps(obj, ensure_ascii=False, indent=1, sort_keys=False) + '\n'
    if path.exists() and path.read_text(encoding='utf-8') == text:
        return False
    path.write_text(text, encoding='utf-8')
    return True


def over_budget():
    return time.monotonic() - START > TIME_BUDGET


def active(start, end, before=timedelta(days=1), after=timedelta(days=2)):
    """¿El torneo se está jugando (con un margen a cada lado)?"""
    s, e = parse_date(start), parse_date(end)
    if s and s - before > NOW:
        return False
    if e and e + after < NOW:
        return False
    return bool(s or e)


# ---------------------------------------------------------------- Leaguepedia
jar = http.cookiejar.CookieJar()
opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))
_last_call = [0.0]


def _request(params, post=False):
    params = {**params, 'format': 'json'}
    data = urllib.parse.urlencode(params).encode()
    if post:
        req = urllib.request.Request(API, data=data, headers={'User-Agent': UA})
    else:
        req = urllib.request.Request(API + '?' + data.decode(), headers={'User-Agent': UA})
    wait = PAUSE - (time.monotonic() - _last_call[0])
    if wait > 0:
        time.sleep(wait)
    try:
        with opener.open(req, timeout=60) as r:
            return json.loads(r.read().decode('utf-8'))
    finally:
        _last_call[0] = time.monotonic()


def login():
    user, pw = os.environ.get('LP_USERNAME'), os.environ.get('LP_PASSWORD')
    if not (user and pw):
        log('Sin LP_USERNAME/LP_PASSWORD: se consulta como anónimo (más lento).')
        return
    try:
        tok = _request({'action': 'query', 'meta': 'tokens', 'type': 'login'})['query']['tokens']['logintoken']
        res = _request({'action': 'login', 'lgname': user, 'lgpassword': pw, 'lgtoken': tok}, post=True)
        result = res.get('login', {}).get('result')
        log(f'Inicio de sesión en Leaguepedia: {result}')
        stats['logged_in'] = result == 'Success'
    except Exception as e:  # noqa: BLE001
        log(f'No se pudo iniciar sesión ({e}); se continúa como anónimo.')


def api(params):
    """Llamada a la API de Leaguepedia. Si limita y no cede tras dos esperas cortas,
    se detiene la ejecución entera (Halt): mejor guardar lo que hay y seguir
    dentro de 10 minutos que quedarse media hora esperando."""
    if stats['halted']:
        raise Halt(stats['halted'])
    if over_budget():
        stats['halted'] = 'tiempo agotado'
        raise Halt(stats['halted'])
    scale = float(os.environ.get('LP_RETRY_SCALE', 1))
    delays = [d * scale for d in (20, 45)]
    for attempt in range(len(delays) + 1):
        try:
            res = _request(params)
            stats['queries'] += 1
        except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as e:
            res = {'error': {'code': 'network', 'info': str(e)}}
        err = res.get('error')
        if not err:
            return res
        code = err.get('code', '')
        limited = code in ('ratelimited', 'network') or 'rate limit' in err.get('info', '').lower()
        if not limited:
            raise RuntimeError(f"Leaguepedia: {err.get('info') or code}")
        if attempt < len(delays):
            log(f'  Leaguepedia pide esperar ({code}); reintento en {delays[attempt]:.0f} s')
            time.sleep(delays[attempt])
    stats['halted'] = 'Leaguepedia limita las consultas'
    log('  Leaguepedia sigue limitando: se guarda lo conseguido y se continúa en la próxima ejecución.')
    raise Halt(stats['halted'])


def cargo(**params):
    res = api({'action': 'cargoquery', 'limit': '500', **params})
    return [row['title'] for row in res.get('cargoquery', [])]


def matches(where):
    return cargo(tables='MatchSchedule=MS', fields=MATCH_FIELDS, where=where, order_by='MS.DateTime_UTC')


# ---------------------------------------------------------------- tareas
def update_new_worlds(state):
    """Mundiales a partir del año actual menos uno (los anteriores están fijos en la web)."""
    rows = cargo(
        tables='Tournaments=T',
        fields='T.OverviewPage=Page,T.DateStart=Start,T.Date=End,T.Year=Year,T.Country=Country',
        where=f'T.OverviewPage LIKE "% Season World Championship%" AND T.Year >= 2026',
        order_by='T.DateStart',
    )
    by_year = {}
    for r in rows:
        try:
            year = int(r.get('Year') or 0)
        except ValueError:
            continue
        if not year:
            continue
        e = by_year.setdefault(year, {'year': year, 'page': worlds_page(year), 'start': r.get('Start') or None,
                                      'end': r.get('End') or None, 'country': r.get('Country') or None})
        if r.get('Start') and (not e['start'] or r['Start'] < e['start']):
            e['start'] = r['Start']
        if r.get('End') and (not e['end'] or r['End'] > e['end']):
            e['end'] = r['End']
        if not e['country'] and r.get('Country'):
            e['country'] = r['Country']
    editions = sorted(by_year.values(), key=lambda x: x['year'])
    write_json(DATA / 'worlds-new.json', editions)
    return editions


def update_worlds(state, editions, only_active):
    """Partidos de cada Mundial: el que está en juego en cada ejecución (only_active=True);
    los demás, una sola vez y del más reciente al más antiguo."""
    new_by_year = {e['year']: e for e in editions}
    current = None
    for year in range(NOW.year + 1, FIRST_WORLDS_YEAR - 1, -1):
        path = DATA / 'worlds' / f'{year}.json'
        ed = new_by_year.get(year)
        if year >= 2026 and not ed:
            continue
        is_active = bool(ed and active(ed['start'], ed['end']))
        if is_active:
            current = year
        if only_active != is_active:
            continue
        fetched = parse_date(state.get('worlds', {}).get(str(year)))
        end = parse_date(ed['end']) if ed else None
        needs = (not path.exists()) or is_active or (end and fetched and fetched < end + timedelta(days=2))
        if not needs:
            continue
        page = worlds_page(year)
        try:
            rows = matches(f'MS.OverviewPage = "{q(page)}" OR MS.OverviewPage LIKE "{q(page)}/%"')
            write_json(path, rows)
            state.setdefault('worlds', {})[str(year)] = iso(NOW)
            log(f'Mundial {year}: {len(rows)} series')
        except Halt:
            raise
        except Exception as e:  # noqa: BLE001
            stats['errors'].append(f'Mundial {year}: {e}')
            log(f'  ERROR Mundial {year}: {e}')
    return current


def update_league(state, lg, only_active):
    """Torneos de una liga y sus partidos. Primera pasada (only_active=True): lista de
    torneos y los que se están jugando. Segunda pasada: los terminados que falten."""
    path = DATA / 'leagues' / f"{lg['slug']}.json"
    data = read_json(path, {'tournaments': [], 'matches': {}})
    lstate = state.setdefault('leagues', {}).setdefault(lg['slug'], {})
    try:
        # 1) lista de torneos (cada 6 h)
        last_list = parse_date(lstate.get('tournaments'))
        if only_active and (not last_list or NOW - last_list > timedelta(hours=6)):
            rows = cargo(
                tables='Tournaments=T',
                fields='T.Name=Name,T.OverviewPage=Page,T.DateStart=Start,T.Date=End',
                where=(f'(T.OverviewPage LIKE "{q(lg["pages"])}" OR T.Name LIKE "{q(lg["names"])}")'
                       f' AND T.Year >= {NOW.year - 1}'),
                order_by='T.DateStart DESC',
            )
            seen, tournaments = set(), []
            for r in rows:
                if r.get('Page') and r['Page'] not in seen:
                    seen.add(r['Page'])
                    tournaments.append({'name': r.get('Name') or r['Page'], 'page': r['Page'],
                                        'start': r.get('Start') or None, 'end': r.get('End') or None})
            data['tournaments'] = tournaments
            lstate['tournaments'] = iso(NOW)
            log(f"{lg['name']}: {len(tournaments)} torneos")

        # 2) partidos de cada torneo
        pages = {t['page'] for t in data['tournaments']}
        data['matches'] = {p: v for p, v in data.get('matches', {}).items() if p in pages}
        mstate = lstate.setdefault('matches', {})
        for t in data['tournaments']:
            page = t['page']
            is_active = active(t['start'], t['end'])
            if only_active != is_active:
                continue
            fetched = parse_date(mstate.get(page))
            end = parse_date(t['end'])
            needs = page not in data['matches'] or is_active or (end and fetched and fetched < end + timedelta(days=2))
            if not needs:
                continue
            try:
                data['matches'][page] = matches(f'MS.OverviewPage = "{q(page)}"')
                mstate[page] = iso(NOW)
                log(f"  {page}: {len(data['matches'][page])} series")
            except Halt:
                raise
            except Exception as e:  # noqa: BLE001
                stats['errors'].append(f"{lg['name']} {page}: {e}")
                log(f'  ERROR {page}: {e}')
    finally:
        if data['tournaments'] or path.exists():
            write_json(path, data)


def league_of(page):
    import fnmatch
    for lg in LEAGUES:
        if fnmatch.fnmatchcase(page, lg['pages'].replace('%', '*')):
            return lg
    return None


def update_around():
    """Partidos entre ayer y mañana en todas las ligas (para la portada)."""
    frm = (NOW - timedelta(hours=18)).strftime('%Y-%m-%d %H:%M:%S')
    to = (NOW + timedelta(hours=30)).strftime('%Y-%m-%d %H:%M:%S')
    conds = ' OR '.join(f'MS.OverviewPage LIKE "{q(lg["pages"])}"' for lg in LEAGUES)
    rows = matches(f'MS.DateTime_UTC >= "{frm}" AND MS.DateTime_UTC <= "{to}" AND ({conds})')
    out = []
    for r in rows:
        lg = league_of(r.get('Page', ''))
        if lg:
            out.append({**r, 'League': lg['name'], 'LeagueSlug': lg['slug']})
    write_json(DATA / 'around.json', out)
    log(f'Partidos de ayer a mañana: {len(out)}')


def all_team_names():
    names = set()

    def add(rows):
        for r in rows or []:
            for k in ('Team1', 'Team2'):
                if r.get(k) and r[k] != 'TBD':
                    names.add(r[k])
    for f in (DATA / 'worlds').glob('*.json'):
        add(read_json(f, []))
    for f in (DATA / 'leagues').glob('*.json'):
        for rows in read_json(f, {}).get('matches', {}).values():
            add(rows)
    add(read_json(DATA / 'around.json', []))
    return names


def update_teams():
    teams = read_json(DATA / 'teams.json', {})
    missing = sorted(n for n in all_team_names() if n not in teams)
    for i in range(0, len(missing), 50):
        chunk = missing[i:i + 50]
        try:
            rows = cargo(tables='Teams=TM', fields='TM.OverviewPage=Page,TM.Short=Short',
                         where='TM.OverviewPage IN (' + ','.join(f'"{q(n)}"' for n in chunk) + ')')
            found = {r['Page']: r.get('Short') or '' for r in rows if r.get('Page')}
            for n in chunk:
                teams[n] = found.get(n, '')
        except Halt:
            break
        except Exception as e:  # noqa: BLE001
            stats['errors'].append(f'Equipos: {e}')
            break
    write_json(DATA / 'teams.json', dict(sorted(teams.items())))
    log(f'Equipos con siglas: {sum(1 for v in teams.values() if v)}')


# ---------------------------------------------------------------- escudos
LOGOS = DATA / 'logos'
LOGO_WIDTH = 96
LOGO_PATTERNS = ['{}logo square.png', '{}logo std.png']  # nombres de fichero que usa Leaguepedia
LOGO_RETRY = timedelta(days=7)                         # volver a buscar los que no se encontraron


def logo_file(name, ext):
    """Nombre de fichero seguro y estable para cada equipo."""
    import hashlib
    import re
    slug = re.sub(r'[^a-z0-9]+', '-', name.lower()).strip('-')[:40] or 'equipo'
    return f"{slug}-{hashlib.sha1(name.encode()).hexdigest()[:6]}{ext}"


def download(url, path):
    url = urllib.parse.quote(url, safe=':/?&=%#+~@!$,;')  # nombres con tildes, Ø, ç…
    req = urllib.request.Request(url, headers={'User-Agent': UA})
    with urllib.request.urlopen(req, timeout=30) as r:
        data = r.read()
    if len(data) < 50:
        raise RuntimeError('imagen vacía')
    path.write_bytes(data)


def find_logos(names, pattern):
    """Busca en Leaguepedia el fichero de escudo de cada equipo (50 por consulta).
    Devuelve {equipo: url de la miniatura}."""
    titles = {f'File:{pattern.format(n)}': n for n in names}
    res = api({'action': 'query', 'prop': 'imageinfo', 'iiprop': 'url', 'iiurlwidth': str(LOGO_WIDTH),
               'redirects': '1', 'titles': '|'.join(titles)})
    query = res.get('query', {})
    # Leaguepedia normaliza títulos y sigue redirecciones: se deshace el camino
    back = {}
    for item in query.get('normalized', []) + query.get('redirects', []):
        back[item['to']] = back.get(item['from'], item['from'])
    found = {}
    for page in query.get('pages', {}).values():
        info = (page.get('imageinfo') or [{}])[0]
        url = info.get('thumburl') or info.get('url')
        if not url or 'missing' in page:
            continue
        title = page.get('title', '')
        original = title
        while original in back:
            original = back[original]
        team = titles.get(original) or titles.get(title)
        if team:
            found[team] = url
    return found


def update_logos():
    """Descarga a data/logos/ el escudo de cada equipo que aparece en los datos."""
    LOGOS.mkdir(parents=True, exist_ok=True)
    index = read_json(DATA / 'logos.json', {})
    misses = read_json(DATA / '.logos-missing.json', {})
    pending = []
    for n in sorted(all_team_names()):
        if n in index and (LOGOS / index[n]).exists():
            continue
        seen = parse_date(misses.get(n))
        if seen and NOW - seen < LOGO_RETRY:
            continue
        pending.append(n)
    if not pending:
        log(f'Escudos de Leaguepedia: {len(index)} (todos al día)')
        return
    log(f'Escudos de Leaguepedia: {len(index)} guardados, {len(pending)} por buscar')
    new = 0
    try:
        for i in range(0, len(pending), 50):
            chunk = pending[i:i + 50]
            urls = {}
            left = list(chunk)
            for pattern in LOGO_PATTERNS:
                if not left:
                    break
                got = find_logos(left, pattern)
                urls.update(got)
                left = [n for n in left if n not in got]
            for n, url in urls.items():
                ext = '.' + url.split('?')[0].rsplit('.', 1)[-1].lower()
                if ext not in ('.png', '.jpg', '.jpeg', '.webp', '.gif', '.svg'):
                    ext = '.png'
                fname = logo_file(n, ext)
                try:
                    download(url, LOGOS / fname)
                    index[n] = fname
                    misses.pop(n, None)
                    new += 1
                except Exception as e:  # noqa: BLE001
                    log(f'  no se pudo descargar el escudo de {n}: {e}')
                    misses[n] = iso(NOW)
                time.sleep(0.2)
            for n in left:
                misses[n] = iso(NOW)
    except Halt:
        pass
    finally:
        write_json(DATA / 'logos.json', dict(sorted(index.items())))
        write_json(DATA / '.logos-missing.json', dict(sorted(misses.items())))
        log(f'Escudos de Leaguepedia: {new} nuevos · {len(index)} en total · {len(misses)} sin escudo')


# ---------------------------------------------------------------- vídeos de las finales
# Leaguepedia guarda el enlace al vídeo de cada partida en MatchScheduleGame.
# No todas las versiones de la tabla usan el mismo nombre de campo: se prueban en orden.
VOD_FIELDS = ['Vod', 'VodGameStart', 'VodPB', 'VodPostgame', 'VodHighlights']


def youtube_id(url):
    """Extrae el id de vídeo y el segundo de inicio de un enlace de YouTube (o None)."""
    import re
    if not url:
        return None
    m = re.search(r'(?:youtu\.be/|youtube\.com/(?:watch\?(?:.*&)?v=|embed/|live/|shorts/))([A-Za-z0-9_-]{11})', url)
    if not m:
        return None
    t = re.search(r'[?&#](?:t|start)=(?:(\d+)h)?(?:(\d+)m)?(\d+)s?', url)
    start = 0
    if t:
        start = int(t.group(1) or 0) * 3600 + int(t.group(2) or 0) * 60 + int(t.group(3) or 0)
    return {'id': m.group(1), 'start': start}


VODS_VERSION = 2   # al cambiar la forma de buscar, se reintentan todas las finales sin vídeo


def update_vods(state):
    """Vídeos (YouTube) de las partidas de cada Gran Final → data/vods.json.
    Cada partida puede tener el vídeo en un campo distinto según el año; se miran
    todos y se usa el primer enlace de YouTube que aparezca."""
    vods = read_json(DATA / 'vods.json', {})
    vstate = state.setdefault('vods', {})
    if vstate.get('version') != VODS_VERSION:
        vstate.clear()
        vstate['version'] = VODS_VERSION
    missing_fields = set(vstate.get('missing_fields', []))
    debug = read_json(DATA / 'vods-debug.json', {})
    for f in sorted((DATA / 'worlds').glob('*.json'), reverse=True):   # de la más reciente a la más antigua
        year = f.stem
        rows = read_json(f, [])
        finals = [r for r in rows if re.fullmatch(r'(Grand )?Finals?', r.get('Tab') or '', re.I)]
        if not finals:
            continue
        done = any(r.get('Winner') for r in finals)
        if done and vods.get(year, {}).get('games'):
            continue
        last = parse_date(vstate.get(year))
        if last and NOW - last < timedelta(hours=24 if done else 1):
            continue
        page = finals[-1]['Page']
        by_game = {}          # n -> {'id','start'}
        raw = {}              # muestra para diagnóstico
        for fld in VOD_FIELDS:
            if fld in missing_fields:
                continue
            try:
                got = cargo(tables='MatchScheduleGame=MSG',
                            fields=f'MSG.MatchId=MatchId,MSG.N_GameInMatch=N,MSG.{fld}=Vod',
                            where=f'MSG.OverviewPage = "{q(page)}" AND MSG.MatchId LIKE "%Final%"',
                            order_by='MSG.N_GameInMatch')
            except Halt:
                raise
            except RuntimeError as e:          # ese campo no existe en la tabla
                log(f'  vídeos: el campo {fld} no existe ({e})')
                missing_fields.add(fld)
                continue
            for r in got:
                mid = r.get('MatchId') or ''
                tab = mid.rsplit('_', 2)[-2] if mid.count('_') >= 2 else ''
                if not re.fullmatch(r'(Grand )?Finals?', tab, re.I):
                    continue                    # descarta semifinales, cuartos…
                n = int(r.get('N') or 0) or len(by_game) + 1
                raw.setdefault(str(n), {})[fld] = (r.get('Vod') or '')[:200]
                yt = youtube_id(r.get('Vod'))
                if yt and n not in by_game:
                    by_game[n] = yt
            if by_game and len(by_game) >= len(raw):   # todas las partidas tienen vídeo: no hace falta mirar más campos
                break
        vstate['missing_fields'] = sorted(missing_fields)
        vstate[year] = iso(NOW)
        if by_game:
            vods[year] = {'games': [{'n': n, **v} for n, v in sorted(by_game.items())]}
            debug.pop(year, None)
            log(f'Vídeos de la final {year}: {len(by_game)} partidas')
        else:
            debug[year] = raw or 'Leaguepedia no devuelve partidas de la final'
            log(f'Vídeos de la final {year}: sin enlaces de YouTube (detalle en data/vods-debug.json)')
    write_json(DATA / 'vods.json', dict(sorted(vods.items(), reverse=True)))
    write_json(DATA / 'vods-debug.json', dict(sorted(debug.items(), reverse=True)))


# ---------------------------------------------------------------- main
# ---------------------------------------------------------------- plantillas y campeones
DDRAGON = os.environ.get('DDRAGON', 'https://ddragon.leagueoflegends.com')
FINAL_RE = re.compile(r'(Grand )?Finals?', re.I)
ROLE_ORDER = {'top': 0, 'jungle': 1, 'mid': 2, 'bot': 3, 'adc': 3, 'support': 4}


def tab_of(match_id):
    """'2024 Season World Championship/Main Event_Finals_1' -> 'Finals'"""
    return match_id.rsplit('_', 2)[-2] if match_id and match_id.count('_') >= 2 else ''


def edition_where(page, alias):
    return f'({alias}.OverviewPage = "{q(page)}" OR {alias}.OverviewPage LIKE "{q(page)}/%")'


def cargo_all(**params):
    """Cargo con paginación (Leaguepedia devuelve como mucho 500 filas por consulta)."""
    out, offset = [], 0
    while True:
        rows = cargo(**params, offset=str(offset))
        out += rows
        if len(rows) < 500:
            return out
        offset += 500


def update_ddragon(state):
    """Nombre de campeón -> id de Data Dragon (para los iconos). Una vez por semana."""
    path = DATA / 'ddragon.json'
    last = parse_date(state.get('ddragon'))
    if path.exists() and last and NOW - last < timedelta(days=7):
        return
    try:
        req = urllib.request.Request(f'{DDRAGON}/api/versions.json', headers={'User-Agent': UA})
        with urllib.request.urlopen(req, timeout=30) as r:
            version = json.loads(r.read())[0]
        req = urllib.request.Request(f'{DDRAGON}/cdn/{version}/data/es_ES/champion.json', headers={'User-Agent': UA})
        with urllib.request.urlopen(req, timeout=30) as r:
            data = json.loads(r.read())['data']
    except Exception as e:  # noqa: BLE001
        log(f'  Data Dragon no disponible ({e}); los campeones saldrán sin icono')
        return
    ids = {}
    for cid, c in data.items():
        ids[re.sub(r'[^a-z0-9]', '', c['name'].lower())] = cid
        ids[re.sub(r'[^a-z0-9]', '', cid.lower())] = cid
    ids.update({'nunu': 'Nunu', 'nunuwillump': 'Nunu', 'wukong': 'MonkeyKing', 'monkeyking': 'MonkeyKing',
                'renata': 'Renata', 'renataglasc': 'Renata', 'leblanc': 'Leblanc', 'chogath': 'Chogath',
                'kogmaw': 'KogMaw', 'reksai': 'RekSai', 'kaisa': 'Kaisa', 'khazix': 'Khazix', 'velkoz': 'Velkoz',
                'belveth': 'Belveth', 'ksante': 'KSante', 'drmundo': 'DrMundo', 'jarvaniv': 'JarvanIV',
                'masteryi': 'MasterYi', 'missfortune': 'MissFortune', 'twistedfate': 'TwistedFate',
                'xinzhao': 'XinZhao', 'aurelionsol': 'AurelionSol', 'tahmkench': 'TahmKench', 'leesin': 'LeeSin'})
    write_json(path, {'version': version, 'ids': dict(sorted(ids.items()))})
    state['ddragon'] = iso(NOW)
    log(f'Data Dragon {version}: {len(data)} campeones')


SP_FIELDS = ['SP.MatchId=MatchId', 'SP.GameId=GameId', 'SP.Link=Player', 'SP.Team=Team', 'SP.Role=Role',
             'SP.Champion=Champion', 'SP.Kills=K', 'SP.Deaths=D', 'SP.Assists=A', 'SP.PlayerWin=Win']


def final_rosters(page):
    """Jugadores de los dos equipos en la Gran Final, con campeones y K/D/A."""
    rows = cargo_all(tables='ScoreboardPlayers=SP', fields=','.join(SP_FIELDS),
                     where=f'{edition_where(page, "SP")} AND SP.MatchId LIKE "%Final%"', order_by='SP.GameId')
    rows = [r for r in rows if FINAL_RE.fullmatch(tab_of(r.get('MatchId')))]
    teams = {}
    for r in rows:
        team = r.get('Team') or ''
        player = r.get('Player') or ''
        if not team or not player:
            continue
        t = teams.setdefault(team, {})
        p = t.setdefault(player, {'player': player, 'role': r.get('Role') or '', 'champions': [], 'k': 0, 'd': 0, 'a': 0, 'games': 0})
        p['champions'].append(r.get('Champion') or '')
        p['games'] += 1
        for k, f in (('k', 'K'), ('d', 'D'), ('a', 'A')):
            try:
                p[k] += int(r.get(f) or 0)
            except ValueError:
                pass
    return {team: sorted(ps.values(), key=lambda p: (ROLE_ORDER.get(p['role'].lower(), 9), -p['games']))
            for team, ps in teams.items()}


def champion_stats(page):
    """Elecciones, victorias y vetos de cada campeón en todo el Mundial."""
    rows = cargo_all(tables='ScoreboardPlayers=SP', fields='SP.GameId=GameId,SP.Champion=Champion,SP.PlayerWin=Win',
                     where=edition_where(page, 'SP'), order_by='SP.GameId')
    games = {r.get('GameId') for r in rows if r.get('GameId')}
    stats = {}
    for r in rows:
        c = r.get('Champion')
        if not c:
            continue
        s = stats.setdefault(c, {'champion': c, 'picks': 0, 'wins': 0, 'bans': 0})
        s['picks'] += 1
        if str(r.get('Win')).lower() in ('yes', '1', 'true'):
            s['wins'] += 1
    bans_ok = False
    try:
        ban_fields = [f'PB.Team{t}Ban{i}=T{t}B{i}' for t in (1, 2) for i in range(1, 6)]
        pb = cargo_all(tables='PicksAndBansS7=PB', fields='PB.GameId=GameId,' + ','.join(ban_fields),
                       where=edition_where(page, 'PB'), order_by='PB.GameId')
        for r in pb:
            for t in (1, 2):
                for i in range(1, 6):
                    c = r.get(f'T{t}B{i}')
                    if c and c.lower() not in ('none', 'loss of ban', '-'):
                        stats.setdefault(c, {'champion': c, 'picks': 0, 'wins': 0, 'bans': 0})['bans'] += 1
        bans_ok = bool(pb)
        games |= {r.get('GameId') for r in pb if r.get('GameId')}
    except Halt:
        raise
    except RuntimeError as e:
        log(f'  vetos no disponibles ({e})')
    out = sorted(stats.values(), key=lambda s: (-(s['picks'] + s['bans']), -s['picks'], s['champion']))
    return {'games': len(games), 'bans': bans_ok, 'champions': out}


def update_finals_and_champions(state):
    """data/finals/<año>.json (plantillas de la final) y data/champions/<año>.json (campeones)."""
    cstate = state.setdefault('champs', {})
    for f in sorted((DATA / 'worlds').glob('*.json'), reverse=True):
        year = f.stem
        rows = read_json(f, [])
        if not rows:
            continue
        finals = [r for r in rows if FINAL_RE.fullmatch(r.get('Tab') or '')]
        done = bool(finals) and any(r.get('Winner') for r in finals)
        played = any(r.get('Winner') for r in rows)
        if not played:
            continue                       # aún no ha empezado
        page = worlds_page(int(year))
        fpath, cpath = DATA / 'finals' / f'{year}.json', DATA / 'champions' / f'{year}.json'
        last = parse_date(cstate.get(year))
        miss = parse_date(cstate.get(year + ':sin-final'))
        if done and cpath.exists() and (fpath.exists() or (miss and NOW - miss < timedelta(days=7))):
            continue                       # edición cerrada y ya descargada (o sin datos: reintento semanal)
        if last and NOW - last < timedelta(hours=6):
            continue                       # en curso: como mucho cada 6 h
        stats = champion_stats(page)
        if stats['champions']:
            write_json(cpath, stats)
            log(f"Campeones {year}: {len(stats['champions'])} distintos en {stats['games']} partidas")
        if done:
            rosters = final_rosters(page)
            if rosters:
                write_json(fpath, rosters)
                cstate.pop(year + ':sin-final', None)
                log(f"Plantillas de la final {year}: {', '.join(f'{t} ({len(p)})' for t, p in rosters.items())}")
            else:
                log(f'Plantillas de la final {year}: Leaguepedia no tiene las partidas de la final')
                cstate[year + ':sin-final'] = iso(NOW)
        cstate[year] = iso(NOW)


def step(name, fn, *args):
    """Ejecuta una tarea; si Leaguepedia corta (Halt) se deja para la próxima vez."""
    if stats['halted']:
        return None
    try:
        return fn(*args)
    except Halt:
        return None
    except Exception as e:  # noqa: BLE001
        stats['errors'].append(f'{name}: {e}')
        log(f'  ERROR {name}: {e}')
        return None


def main():
    DATA.mkdir(exist_ok=True)
    state = read_json(STATE_FILE, {})
    login()

    # Orden de prioridad: lo que cambia ahora mismo primero, el histórico al final.
    # La lista de Mundiales cambia muy poco: se consulta como mucho cada 6 h
    editions = None
    last_ed = parse_date(state.get('worlds_new'))
    if not (DATA / 'worlds-new.json').exists() or not last_ed or NOW - last_ed > timedelta(hours=6):
        editions = step('Mundiales nuevos', update_new_worlds, state)
        if editions is not None:
            state['worlds_new'] = iso(NOW)
    if editions is None:
        editions = read_json(DATA / 'worlds-new.json', [])
    current = step('Mundial en curso', update_worlds, state, editions, True)
    step('Partidos cercanos', update_around)
    for lg in LEAGUES:
        step(lg['name'], update_league, state, lg, True)
    step('Mundiales anteriores', update_worlds, state, editions, False)
    for lg in LEAGUES:
        step(lg['name'] + ' (torneos terminados)', update_league, state, lg, False)
    step('Equipos', update_teams)
    step('Escudos', update_logos)
    step('Vídeos de las finales', update_vods, state)
    step('Data Dragon', update_ddragon, state)
    step('Plantillas y campeones', update_finals_and_champions, state)
    if current is None:  # si no se pudo consultar, se deduce de las fechas guardadas
        current = next((e['year'] for e in editions if active(e.get('start'), e.get('end'))), None)

    write_json(STATE_FILE, state)
    write_json(DATA / 'meta.json', {
        'checked': iso(NOW), 'currentWorlds': current,
        'complete': not stats['halted'], 'errors': stats['errors'][:20],
    })

    log(f"\nConsultas: {stats['queries']} · errores: {len(stats['errors'])} · {time.monotonic() - START:.0f} s")
    for e in stats['errors']:
        log('  -', e)
    if stats['halted']:
        log(f"Ejecución detenida ({stats['halted']}). Lo pendiente se descargará en las próximas ejecuciones.")
        if not stats['logged_in']:
            log('CONSEJO: añade LP_USERNAME y LP_PASSWORD (bot password de Leaguepedia) en los secretos del '
                'repositorio. Sin sesión, Leaguepedia limita mucho las consultas desde GitHub.')
    # Nunca termina en error por el límite: así se guarda lo descargado y GitHub no envía avisos.


if __name__ == '__main__':
    main()
