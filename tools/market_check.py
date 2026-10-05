#!/usr/bin/env python3
"""SR22T market check — the bridge aircraft's current market value, for information.

    python3 tools/market_check.py            # check, write data/market.json
    python3 tools/market_check.py --dry-run  # check and print only

Source: Cirrus's public listings feed behind cirrusaircraft.com/pre-owned/.

The comparables are listings that match the bridge aircraft's `market`
settings in data/costing.json (model, generation, variation, model years), are
available (not sold, not pending), carry a plausible price, and were updated
within `maxListingAgeDays`. Their median asking price, rounded to `roundTo`, is
the aircraft's estimated market value.

INFORMATION ONLY (Raymond, 2026-10-04): the costing holds the bridge aircraft's
PURCHASE PRICE ($880,000, what bop Aero paid), which the market never changes.
So this check proposes nothing and opens no issue; the costing editor shows the
market value beside the purchase price.

The new SR22T G7+ GTS price is NOT checked: the SR22T price Cirrus shows on
that page ($934,500 "SR22T GTS" in Oct 2026) is not the G7+ GTS list price
($1,304,900), so it can't be trusted to track it. Update the base price in the
editor from the Cirrus price list.

It never changes costing. It writes data/market.json, which the costing editor
shows, and prints a Markdown summary for the notification issue. Raymond
approves any change in the editor (decided 2026-10-02).

Exits non-zero if the feed looks broken (too few listings, or too few of the
bridge aircraft's model), so a silent failure can't pass for "no change".
"""
import datetime as dt
import html
import json
import os
import re
import statistics
import sys
import urllib.request

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FEED = 'https://cirrusaircraft.com/wp-json/wp/v2/aircraft-listings?per_page=100&page=%d'
PRICE_PAGE = 'https://cirrusaircraft.com/pre-owned/'
UA = 'bop-Aero-SR22T-market-check/1.0 (+https://bopaero.com)'
PLAUSIBLE = (150_000, 3_000_000)     # outside this, a listing price is treated as a typo
MIN_LISTINGS, MIN_MODEL = 100, 20    # below these, the feed is assumed broken


def get(url):
    req = urllib.request.Request(url, headers={'User-Agent': UA, 'Accept': 'application/json, text/html'})
    with urllib.request.urlopen(req, timeout=45) as r:
        # r.headers is case-insensitive — keep it that way. The feed sends
        # "X-Wp-Totalpages"; a plain dict lookup for "X-WP-TotalPages" misses it
        # and silently reads only page 1.
        return r.read().decode('utf-8', 'replace'), r.headers


def fetch_listings():
    """Every listing, and the total the feed says it holds (to prove none were missed)."""
    rows, page = [], 1
    while True:
        body, headers = get(FEED % page)
        batch = json.loads(body)
        rows += batch
        total, pages = int(headers.get('X-WP-Total') or 0), int(headers.get('X-WP-TotalPages') or 1)
        if page >= pages or not batch:
            return rows, total
        page += 1


def money(s):
    digits = re.sub(r'[^0-9]', '', s or '')
    return int(digits) if digits else None


def hours(s):
    digits = re.sub(r'[^0-9]', '', s or '')
    return int(digits) if digits else None


def generation(r):
    g = str(r.get('generation') or '').strip()
    if g:
        return g
    return ''


def normalize(rows, today, max_age, model):
    """Available, priced, recent listings of one model, one per airframe."""
    by_airframe = {}
    for r in rows:
        if str(r.get('model')) != model:
            continue
        a = r.get('acf') or {}
        price = money(a.get('price'))
        modified = dt.date.fromisoformat(r['modified'][:10])
        item = {
            'registration': re.sub(r'\s*\(.*\)', '', a.get('registration_number') or '').strip(),
            'serial': str(a.get('serial_number') or '').strip(),
            'year': int(r.get('year') or 0), 'generation': generation(r),
            'variation': str(r.get('variation') or ''), 'hours': hours(a.get('flight_hours')),
            'price': price, 'modified': str(modified), 'link': r.get('link'),
            'certified': bool(a.get('is_cirrus_certified')),
            'available': not a.get('is_sold') and not a.get('is_pending_sale'),
        }
        # The same airframe can appear twice (relisted under a new registration);
        # keep the most recently updated entry, keyed by serial number.
        key = item['serial'] or item['registration'] or str(r.get('id'))
        if key not in by_airframe or item['modified'] > by_airframe[key]['modified']:
            by_airframe[key] = item
    out, excluded = [], {'sold or pending': 0, 'no price': 0, 'implausible price': 0, 'stale': 0}
    cutoff = today - dt.timedelta(days=max_age)
    for it in by_airframe.values():
        if not it['available']:
            excluded['sold or pending'] += 1
        elif not it['price']:
            excluded['no price'] += 1
        elif not PLAUSIBLE[0] <= it['price'] <= PLAUSIBLE[1]:
            excluded['implausible price'] += 1
        elif dt.date.fromisoformat(it['modified']) < cutoff:
            excluded['stale'] += 1
        else:
            out.append(it)
    return out, excluded


def round_to(n, step):
    return int((n + step / 2) // step * step)       # half-up, not banker's rounding


def main():
    dry = '--dry-run' in sys.argv
    costing = json.load(open(os.path.join(REPO, 'data', 'costing.json')))
    mconf = costing['common'].get('market', {'roundTo': 25000, 'maxListingAgeDays': 90})
    today = dt.datetime.now(dt.timezone(dt.timedelta(hours=-4))).date()
    bridge = costing.get('bridge') or {}
    m = bridge.get('market')
    if not m:
        sys.exit('No bridge aircraft comparables configured in data/costing.json')

    rows, total = fetch_listings()
    of_model = [r for r in rows if str(r.get('model')) == m['model']]
    problems = []
    if len(rows) != total:
        problems.append('read %d listings but the feed reports %d' % (len(rows), total))
    if len(rows) < MIN_LISTINGS:
        problems.append('feed returned only %d listings' % len(rows))
    if len(of_model) < MIN_MODEL:
        problems.append('feed returned only %d %s listings' % (len(of_model), m['model']))
    if problems:
        sys.exit('MARKET CHECK FAILED — ' + '; '.join(problems))

    listings, excluded = normalize(rows, today, mconf['maxListingAgeDays'], m['model'])
    comps = sorted((it for it in listings if it['generation'] == m['generation']
                    and (not m.get('variation') or it['variation'] == m['variation'])
                    and m['yearFrom'] <= it['year'] <= m['yearTo']), key=lambda it: it['price'])
    entry = {'purchasePrice': bridge['purchasePrice'], 'model': m['model'], 'generation': m['generation'], 'variation': m.get('variation', ''),
             'years': [m['yearFrom'], m['yearTo']], 'count': len(comps), 'comparables': comps}
    result = {'checkedAt': dt.datetime.now(dt.timezone.utc).isoformat(timespec='seconds'),
              'source': 'cirrusaircraft.com pre-owned listings', 'roundTo': mconf['roundTo'],
              'maxListingAgeDays': mconf['maxListingAgeDays'], 'costingVersion': costing['version'],
              'feedListings': len(rows), 'modelListings': len(of_model), 'excluded': excluded,
              'bridge': entry, 'proposals': []}
    if comps:
        med = statistics.median(it['price'] for it in comps)
        entry.update(median=med, marketValue=round_to(med, mconf['roundTo']))
    # result['proposals'] stays empty: nothing in the costing follows the market

    print(summary(result))
    if not dry:
        with open(os.path.join(REPO, 'data', 'market.json'), 'w') as f:
            json.dump(result, f, indent=2)
            f.write('\n')


def summary(r):
    def usd(n): return '$' + format(int(round(n)), ',')
    e = r['bridge']
    lines = ['**SR22T market check** — %s, against costing %s' % (r['checkedAt'][:16].replace('T', ' ') + ' UTC', r['costingVersion']), '']
    lines += ['| Aircraft | Purchase price | Market median | Est. market value | Comparables |', '|---|---|---|---|---|']
    lines.append('| Bridge aircraft (%s %s %s %d–%d) | %s | %s | %s | %d |' % (
        e['model'], e['generation'], e['variation'], e['years'][0], e['years'][1], usd(e['purchasePrice']),
        usd(e['median']) if e.get('median') else '—', usd(e['marketValue']) if e.get('marketValue') else 'no comparables',
        e['count']))
    ex = ', '.join('%d %s' % (v, k) for k, v in r['excluded'].items() if v)
    lines += ['', 'From %d %s listings in the feed%s.' % (r['modelListings'], e['model'], ' (excluded: ' + ex + ')' if ex else '')]
    lines += ['', 'Information only: the costing keeps the purchase price. The new SR22T G7+ GTS price is not checked automatically: update it from the Cirrus price list.']
    return '\n'.join(lines)


if __name__ == '__main__':
    main()
