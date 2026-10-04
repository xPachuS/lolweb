#!/usr/bin/env python3
"""
Descarga de lolesports.com los partidos en directo, el calendario cercano y los
escudos de equipos y ligas, y los guarda en data/lolesports/*.json.

lolesports.com cambió su API a GraphQL (lolesports.com/api/gql, "persisted
queries"). No es pública ni documentada: puede cambiar sin aviso. Por eso:
  * se prueba primero la API nueva y, si falla, la antigua (esports-api);
  * nunca hace fallar el workflow;
  * deja en data/lolesports/status.json qué ha funcionado y qué no, para
    poder ajustarlo (p. ej. si Riot cambia los "hash" de las consultas).

Solo usa la librería estándar de Python.
"""
import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'data' / 'lolesports'
NOW = datetime.now(timezone.utc)
HL = 'es-ES'

# ---- API nueva (GraphQL). Los hash identifican cada consulta; si Riot publica
# una versión nueva de su web pueden cambiar. Se pueden sobrescribir sin tocar
# código con variables del workflow (LOLE_HASH_LIVE, LOLE_HASH_EVENTS, LOLE_HASH_LEAGUES).
GQL_URL = os.environ.get('LOLE_GQL_URL', 'https://lolesports.com/api/gql')
HASHES = {
    'watchLiveQuery': os.environ.get('LOLE_HASH_LIVE') or 'b67230b177d865a4ca5bd9c876fa884745f8fd2696e63c7214c9b5b718608ff0',
    'homeEvents': os.environ.get('LOLE_HASH_EVENTS') or '7246add6f577cf30b304e651bf9e25fc6a41fe49aeafb0754c16b5778060fc0a',
    'getLeagues': os.environ.get('LOLE_HASH_LEAGUES') or '6b0dd6c3cfb78f6bf2712db29496cdd8364f8c96d8a62704c5169c0ff8bd3086',
}

# Cabeceras de cliente que exige la API (si faltan responde 401 "No client headers set").
# La versión es el "build" de la web de lolesports y puede cambiar; se puede
# sobrescribir con la variable LOLE_CLIENT_VERSION sin tocar código.
CLIENT_NAME = os.environ.get('LOLE_CLIENT_NAME') or 'Esports Web'
CLIENT_VERSION = os.environ.get('LOLE_CLIENT_VERSION') or '1f05c07'
CLIENT_LIBRARY = {'name': os.environ.get('LOLE_APOLLO_PACKAGE') or '@apollo/client',
                  'version': os.environ.get('LOLE_APOLLO_VERSION') or '4.1.2'}

# ---- API antigua (por si sigue respondiendo a servidores)
LEGACY_URL = os.environ.get('LOLE_LEGACY_URL', 'https://esports-api.lolesports.com/persisted/gw')
LEGACY_KEY = os.environ.get('LOLE_LEGACY_KEY', '0TvQnueqKa5mxJntVWt0w4LpLiCqCq')

# slug de lolesports → slug de la web (js/config.js)
LEAGUE_SLUGS = {
    'lck': 'lck', 'lpl': 'lpl', 'lec': 'lec', 'lcs': 'lcs', 'lcp': 'lcp',
    'cblol-brazil': 'cblol', 'cblol': 'cblol', 'msi': 'msi',
    'first_stand': 'first-stand', 'first-stand': 'first-stand', 'worlds': 'worlds',
}

UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36'
status = {'checked': NOW.strftime('%Y-%m-%dT%H:%M:%SZ'), 'source': None, 'calls': []}


def log(*a):
    print(*a, flush=True)


def http_get(url, headers):
    req = urllib.request.Request(url, headers={'User-Agent': UA, 'Accept': 'application/json', **headers})
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return r.status, r.read().decode('utf-8', 'replace')
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode('utf-8', 'replace')
    except Exception as e:  # noqa: BLE001
        return 0, str(e)


QUIET = {'on': False}


def record(name, code, body, ok, note=''):
    entry = {'call': name, 'http': code, 'ok': ok}
    if note:
        entry['note'] = note
    if not ok:
        entry['respuesta'] = body[:400]
    if QUIET['on'] and ok:
        return
    status['calls'].append(entry)
    log(f"  {name}: HTTP {code} {'OK' if ok else 'FALLO'} {note}")


# ------------------------------------------------------------------ GraphQL
def gql(op, variables, raw=True):
    params = {
        'operationName': op,
        'variables': json.dumps(variables, separators=(',', ':')),
        'extensions': json.dumps({'clientLibrary': CLIENT_LIBRARY,
                                  'persistedQuery': {'version': 1, 'sha256Hash': HASHES[op]}}, separators=(',', ':')),
    }
    url = GQL_URL + '?' + urllib.parse.urlencode(params)
    code, body = http_get(url, {
        'Origin': 'https://lolesports.com',
        'Referer': 'https://lolesports.com/',
        'apollo-require-preflight': 'true',
        'x-apollo-operation-name': op,
        'apollographql-client-name': CLIENT_NAME,
        'apollographql-client-version': CLIENT_VERSION,
    })
    try:
        data = json.loads(body)
    except json.JSONDecodeError:
        record(op, code, body, False, 'la respuesta no es JSON')
        return None
    errors = data.get('errors') or []
    if errors:
        msg = '; '.join(str(e.get('message', e))[:150] for e in errors[:3])
        note = 'el hash de la consulta ya no existe (Riot ha actualizado su web)' if 'PersistedQueryNotFound' in msg else msg
        if not data.get('data'):
            record(op, code, body, False, note)
            return None
        record(op, code, body, True, f'con avisos: {note}')
    elif code != 200 or not data.get('data'):
        record(op, code, body, False)
        return None
    else:
        record(op, code, body, True)
    if raw:
        save_raw(op, data)
    return data['data']


def save_raw(name, data):
    """Guarda una muestra de la respuesta (recortada) para poder ajustar el lector
    si lolesports cambia la estructura. No la usa la web."""
    def trim(o, depth=0):
        if depth > 12:
            return '…'
        if isinstance(o, dict):
            return {k: trim(v, depth + 1) for k, v in o.items()}
        if isinstance(o, list):
            return [trim(v, depth + 1) for v in o[:6]] + ([f'… {len(o) - 6} más'] if len(o) > 6 else [])
        return o
    (OUT / 'raw').mkdir(parents=True, exist_ok=True)
    text = json.dumps(trim(data), ensure_ascii=False, indent=1)[:60000]
    (OUT / 'raw' / f'{name}.json').write_text(text + '\n', encoding='utf-8')


# ------------------------------------------------------------------ API antigua
def legacy(endpoint, **params):
    url = f"{LEGACY_URL}/{endpoint}?" + urllib.parse.urlencode({'hl': HL, **params})
    code, body = http_get(url, {'x-api-key': LEGACY_KEY, 'Origin': 'https://lolesports.com', 'Referer': 'https://lolesports.com/'})
    try:
        data = json.loads(body)
    except json.JSONDecodeError:
        record('antigua/' + endpoint, code, body, False, 'la respuesta no es JSON')
        return None
    ok = code == 200 and isinstance(data.get('data'), dict)
    record('antigua/' + endpoint, code, body, ok)
    return data.get('data') if ok else None


# ------------------------------------------------------------------ normalización
# Las dos APIs devuelven objetos parecidos (evento → match → teams). Para no
# depender de la estructura exacta, se recorren todos los objetos buscando
# "algo con dos equipos".
def walk(obj):
    if isinstance(obj, dict):
        yield obj
        for v in obj.values():
            yield from walk(v)
    elif isinstance(obj, list):
        for v in obj:
            yield from walk(v)


def first(*vals):
    for v in vals:
        if v not in (None, '', [], {}):
            return v
    return None


def norm_team(t):
    if not isinstance(t, dict):
        return None
    if isinstance(t.get('team'), dict):  # {team: {...}, result: {...}}
        t = {**t['team'], **{k: v for k, v in t.items() if k != 'team'}}
    res = t.get('result') if isinstance(t.get('result'), dict) else {}
    name = first(t.get('name'), t.get('displayName'), t.get('teamName'))
    if not name:
        return None
    return {
        'name': name,
        'code': first(t.get('code'), t.get('shortName'), t.get('acronym')) or '',
        'image': first(t.get('image'), t.get('logo'), t.get('logoUrl'), t.get('imageUrl'),
                       t.get('lightImage'), t.get('darkImage'), t.get('lightLogo'), t.get('darkLogo')) or '',
        'wins': first(res.get('gameWins'), t.get('gameWins'), t.get('score')),
        'outcome': first(res.get('outcome'), t.get('outcome')),
    }


STATE_MAP = {'inprogress': 'live', 'in_progress': 'live', 'live': 'live', 'unstarted': 'upcoming',
             'upcoming': 'upcoming', 'completed': 'done', 'finished': 'done', 'final': 'done'}


def team_list(*objs):
    """Lista de los dos equipos: en la API nueva está en `matchTeams` del evento
    (calendario) o del partido (directo); en la antigua, en `match.teams`."""
    for o in objs:
        if not isinstance(o, dict):
            continue
        for key in ('matchTeams', 'teams', 'competitors', 'participants'):
            v = o.get(key)
            if isinstance(v, list) and len(v) == 2 and all(isinstance(x, dict) and (x.get('name') or x.get('team')) for x in v):
                return v
    return None


def derive_state(ev, match, teams, best_of):
    """Estado del partido. Si la API no lo da (el directo no lo trae), se deduce
    del resultado y del estado de cada partida."""
    raw = str(first(ev.get('state'), match.get('state'), ev.get('status')) or '').lower().replace(' ', '')
    if raw in STATE_MAP:
        return STATE_MAP[raw]
    if any(t.get('outcome') in ('win', 'loss') for t in teams):
        return 'done'
    need = (int(best_of) // 2 + 1) if best_of else None
    if need and any((t.get('wins') or 0) >= need for t in teams):
        return 'done'
    games = [g for g in (match.get('games') or []) if isinstance(g, dict)]
    states = [str(g.get('state') or '').lower() for g in games]
    if any(st in ('inprogress', 'in_progress', 'live') for st in states):
        return 'live'
    if states and all(st == 'completed' for st in states):
        return 'done'
    if any(st == 'completed' for st in states):
        return 'live'  # serie empezada y sin decidir
    return 'upcoming'


def norm_event(ev, parent_league=None):
    match = ev.get('match') if isinstance(ev.get('match'), dict) else {}
    teams = team_list(ev, match)
    if not teams:
        return None
    t = [norm_team(x) for x in teams]
    if not all(t):
        return None
    league = ev.get('league') if isinstance(ev.get('league'), dict) else (parent_league or {})
    strategy = match.get('strategy') if isinstance(match.get('strategy'), dict) else {}
    best_of = first(strategy.get('count'), match.get('bestOf'))
    start = first(ev.get('startTime'), ev.get('startDate'), match.get('startTime'))
    lslug = str(league.get('slug') or '').lower()
    return {
        'id': str(first(match.get('id'), ev.get('id')) or f"{t[0]['name']}-{t[1]['name']}-{start}"),
        'start': start,
        'state': derive_state(ev, match, t, best_of),
        'league': first(league.get('name'), league.get('displayName')) or '',
        'leagueSlug': LEAGUE_SLUGS.get(lslug, lslug),
        'leagueImage': league.get('image') or '',
        'block': first(ev.get('blockName'), ev.get('blockTitle'), match.get('blockName')) or '',
        'bestOf': best_of,
        'teams': t,
    }


def extract_events(data):
    out, seen = [], set()
    for node in walk(data):
        if not isinstance(node, dict):
            continue
        if not ('startTime' in node or 'league' in node or 'match' in node):
            continue
        e = norm_event(node)
        if e and e['id'] not in seen:
            seen.add(e['id'])
            out.append(e)
    out.sort(key=lambda e: e['start'] or '')
    return out


def extract_leagues(data):
    out = {}
    for node in walk(data):
        if isinstance(node, dict) and node.get('slug') and node.get('name') and ('image' in node or 'region' in node):
            slug = str(node['slug']).lower()
            out[LEAGUE_SLUGS.get(slug, slug)] = {'name': node['name'], 'image': node.get('image') or '', 'id': node.get('id')}
    return out


def team_logos(events, previous):
    logos = dict(previous or {})
    for e in events:
        for t in e['teams']:
            if t['image'] and t['name'] and 'TBD' not in t['name'].upper():
                logos[t['name']] = {'code': t['code'], 'image': t['image']}
    return dict(sorted(logos.items()))


# Ligas cuyos equipos interesan (slugs de lolesports) y páginas de historial por liga
HARVEST_LEAGUES = ['worlds', 'msi', 'first_stand', 'lck', 'lpl', 'lec', 'lcs', 'lcp', 'cblol-brazil']
HARVEST_PAGES = 5            # ~500 partidos por liga: cubre más de una temporada
HARVEST_EVERY = timedelta(hours=24)


def harvest_team_logos(league_ids, logos):
    """Recorre el historial de cada liga (homeEvents paginado hacia atrás) para
    reunir los escudos de todos sus equipos. Se hace una vez al día."""
    found = 0
    QUIET['on'] = True
    try:
        for slug in HARVEST_LEAGUES:
            lid = league_ids.get(slug)
            if not lid:
                continue
            token, before = None, len(logos)
            for _ in range(HARVEST_PAGES):
                variables = {'hl': HL, 'sport': ['lol'], 'leagues': [lid], 'pageSize': 100}
                if token:
                    variables['pageToken'] = token
                d = gql('homeEvents', variables, raw=False)
                if d is None:
                    break
                for e in extract_events(d):
                    for t in e['teams']:
                        if t['image'] and t['name'] and 'TBD' not in t['name'].upper():
                            logos[t['name']] = {'code': t['code'], 'image': t['image']}
                pages = next((n.get('pages') for n in walk(d) if isinstance(n, dict) and isinstance(n.get('pages'), dict)), None)
                token = (pages or {}).get('older')
                if not token:
                    break
                time.sleep(0.5)
            found += len(logos) - before
            log(f"  escudos {slug}: {len(logos) - before} nuevos")
    finally:
        QUIET['on'] = False
    return found


def write(name, obj):
    OUT.mkdir(parents=True, exist_ok=True)
    path = OUT / name
    text = json.dumps(obj, ensure_ascii=False, indent=1) + '\n'
    if not path.exists() or path.read_text(encoding='utf-8') != text:
        path.write_text(text, encoding='utf-8')


# ------------------------------------------------------------------ main
def run():
    live = schedule = leagues = None

    # 1) API nueva
    log('lolesports (GraphQL):')
    d = gql('watchLiveQuery', {'hl': HL, 'sport': ['lol'], 'pageSize': 50})
    if d is not None:
        live = [e for e in extract_events(d) if e['state'] == 'live']
    d = gql('homeEvents', {
        'hl': HL, 'sport': ['lol'], 'pageSize': 100,
        'eventDateStart': (NOW - timedelta(days=3)).strftime('%Y-%m-%dT00:00:00.000Z'),
        'eventDateEnd': (NOW + timedelta(days=8)).strftime('%Y-%m-%dT23:59:59.000Z'),
    })
    if d is not None:
        schedule = extract_events(d)
    if not schedule:
        log('  homeEvents sin partidos con filtro de fechas; reintento sin fechas')
        d = gql('homeEvents', {'hl': HL, 'sport': ['lol'], 'pageSize': 100})
        if d is not None:
            schedule = extract_events(d)
    d = gql('getLeagues', {'hl': HL, 'sport': ['lol']})
    league_ids = {}
    if d is not None:
        leagues = extract_leagues(d)
        for node in walk(d):
            if isinstance(node, dict) and node.get('slug') and node.get('id') and node.get('name'):
                league_ids[str(node['slug']).lower()] = node['id']
    if live is not None or schedule:
        status['source'] = 'graphql'

    # 2) API antigua si la nueva no ha dado partidos
    if live is None and not schedule:
        log('lolesports (API antigua):')
        d = legacy('getLive')
        if d is not None:
            live = [e for e in extract_events(d) if e['state'] == 'live']
        d = legacy('getSchedule')
        if d is not None:
            schedule = extract_events(d)
        if leagues is None:
            d = legacy('getLeagues')
            if d is not None:
                leagues = extract_leagues(d)
        if live is not None or schedule:
            status['source'] = 'antigua'

    # 3) guardar (solo lo que se ha conseguido; lo demás conserva su versión anterior)
    lo = NOW - timedelta(days=3)
    hi = NOW + timedelta(days=8)

    def in_window(e):
        try:
            t = datetime.fromisoformat(str(e['start']).replace('Z', '+00:00'))
            return lo <= t <= hi
        except ValueError:
            return True

    if live is not None:
        write('live.json', live)
    if schedule:
        write('schedule.json', [e for e in schedule if in_window(e)])
    if leagues:
        write('leagues.json', leagues)
    prev = {}
    try:
        prev = json.loads((OUT / 'teams.json').read_text(encoding='utf-8'))
    except (FileNotFoundError, json.JSONDecodeError):
        pass
    logos = team_logos((live or []) + (schedule or []), prev)
    state = {}
    try:
        state = json.loads((OUT / '.state.json').read_text(encoding='utf-8'))
    except (FileNotFoundError, json.JSONDecodeError):
        pass
    last = state.get('harvest')
    due = not last or NOW - datetime.fromisoformat(last.replace('Z', '+00:00')) > HARVEST_EVERY
    if league_ids and due:
        log('Recogiendo escudos de equipos (una vez al día):')
        harvest_team_logos(league_ids, logos)
        state['harvest'] = NOW.strftime('%Y-%m-%dT%H:%M:%SZ')
        write('.state.json', state)
    write('teams.json', dict(sorted(logos.items())))
    status['counts_escudos'] = len(logos)

    status['counts'] = {'directo': len(live or []), 'calendario': len(schedule or []), 'ligas': len(leagues or {})}
    status['ok'] = status['source'] is not None
    log(f"Resultado: fuente={status['source']} · en directo={len(live or [])} · calendario={len(schedule or [])} · ligas={len(leagues or {})}")
    if not status['ok']:
        log('AVISO: lolesports no ha devuelto datos. La web seguirá funcionando solo con Leaguepedia.')
        log('       Detalles en data/lolesports/status.json')


def main():
    try:
        run()
    except Exception as e:  # noqa: BLE001  — nunca se rompe el workflow por lolesports
        status['ok'] = False
        status['error'] = f'{type(e).__name__}: {e}'
        log('ERROR inesperado en lolesports:', status['error'])
    # status.json solo se reescribe si cambia algo más que la hora
    old = {}
    try:
        old = json.loads((OUT / 'status.json').read_text(encoding='utf-8'))
    except (FileNotFoundError, json.JSONDecodeError):
        pass
    strip = lambda s: {k: v for k, v in s.items() if k != 'checked'}  # noqa: E731
    if strip(old) != strip(status):
        write('status.json', status)
    sys.exit(0)


if __name__ == '__main__':
    main()
