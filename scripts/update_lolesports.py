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


def record(name, code, body, ok, note=''):
    entry = {'call': name, 'http': code, 'ok': ok}
    if note:
        entry['note'] = note
    if not ok:
        entry['respuesta'] = body[:400]
    status['calls'].append(entry)
    log(f"  {name}: HTTP {code} {'OK' if ok else 'FALLO'} {note}")


# ------------------------------------------------------------------ GraphQL
def gql(op, variables):
    params = {
        'operationName': op,
        'variables': json.dumps(variables, separators=(',', ':')),
        'extensions': json.dumps({'persistedQuery': {'version': 1, 'sha256Hash': HASHES[op]}}, separators=(',', ':')),
    }
    url = GQL_URL + '?' + urllib.parse.urlencode(params)
    code, body = http_get(url, {
        'Origin': 'https://lolesports.com',
        'Referer': 'https://lolesports.com/',
        'apollo-require-preflight': 'true',
        'x-apollo-operation-name': op,
        'apollographql-client-name': 'Esports Web',
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
    return data['data']


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
    res = t.get('result') if isinstance(t.get('result'), dict) else {}
    name = first(t.get('name'), t.get('displayName'))
    if not name:
        return None
    return {
        'name': name,
        'code': first(t.get('code'), t.get('shortName'), t.get('acronym')) or '',
        'image': first(t.get('image'), t.get('logoUrl'), t.get('lightImage'), t.get('darkImage')) or '',
        'wins': first(res.get('gameWins'), t.get('gameWins'), t.get('score')),
        'outcome': first(res.get('outcome'), t.get('outcome')),
    }


STATE_MAP = {'inprogress': 'live', 'in_progress': 'live', 'live': 'live', 'unstarted': 'upcoming',
             'upcoming': 'upcoming', 'completed': 'done', 'finished': 'done', 'final': 'done'}


def norm_event(ev, parent_league=None):
    match = ev.get('match') if isinstance(ev.get('match'), dict) else ev
    teams = match.get('teams') if isinstance(match, dict) else None
    if not isinstance(teams, list) or len(teams) != 2:
        return None
    t = [norm_team(x) for x in teams]
    if not all(t):
        return None
    league = ev.get('league') if isinstance(ev.get('league'), dict) else (parent_league or {})
    strategy = match.get('strategy') if isinstance(match.get('strategy'), dict) else {}
    raw_state = str(first(ev.get('state'), match.get('state'), ev.get('status')) or '').lower()
    start = first(ev.get('startTime'), ev.get('startDate'), match.get('startTime'))
    lslug = str(league.get('slug') or '').lower()
    return {
        'id': str(first(match.get('id'), ev.get('id')) or f"{t[0]['name']}-{t[1]['name']}-{start}"),
        'start': start,
        'state': STATE_MAP.get(raw_state.replace(' ', ''), raw_state or 'upcoming'),
        'league': first(league.get('name'), league.get('displayName')) or '',
        'leagueSlug': LEAGUE_SLUGS.get(lslug, lslug),
        'leagueImage': league.get('image') or '',
        'block': first(ev.get('blockName'), ev.get('blockTitle'), match.get('blockName')) or '',
        'bestOf': first(strategy.get('count'), match.get('bestOf')),
        'teams': t,
    }


def extract_events(data):
    out, seen = [], set()
    for node in walk(data):
        if not isinstance(node, dict):
            continue
        if not ('match' in node or 'teams' in node):
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
    d = gql('getLeagues', {'hl': HL, 'sport': ['lol']})
    if d is not None:
        leagues = extract_leagues(d)
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
    write('teams.json', team_logos((live or []) + (schedule or []), prev))

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
