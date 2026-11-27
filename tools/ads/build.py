#!/usr/bin/env python3
"""Build ads.json (the ads source of truth) from raw Meta pulls + tags.

Inputs (in ~/sot):
  raw/*.json         rows [ad_id, ad_name, date_start, spend, revenue, purchases, impressions, v3s, thruplays]
  tags.json          concept -> {angle, avatar, format, desc, src}
  queue.json         Brief Queue rows (Live/Queue/Statics) for author/editor/concept names
Output: ads.json
"""
import json, re, glob, collections, datetime, sys, os

HERE = os.path.dirname(os.path.abspath(__file__))
SPEND_LINE = 5000      # breakthrough spend
BAR = 1.1              # account ROAS target
KPI_MIN_PUR = 3
MIN_TEST = 100         # under this lifetime spend the concept never really got tested

def concept_key(name):
    n = name.strip()
    m = re.search(r'^(.*?)_Lumeo®.*trybe', n)
    if m or 'trybe=' in n:
        who = re.split(r'_Lumeo', n)[0].strip()
        return 'Creator: ' + who
    m = re.match(r'SAN_W\d+_DCT(\d+)', n)
    if m: return 'SAN-%03d' % int(m.group(1))
    m = re.match(r'W\d+_DCT(\d+)', n)
    if m: return '#%d' % int(m.group(1))
    m = re.search(r'CS-victor\s*\[DCT#?(\d+)', n, re.I)
    if m: return 'VS-%03d' % int(m.group(1))
    m = re.match(r'Alex_DCT#?(\d+)', n, re.I)
    if m: return 'ALEX-%03d' % int(m.group(1))
    m = re.match(r'BFCM#?(\d+)', n, re.I)
    if m: return 'BFCM-%03d' % int(m.group(1))
    m = re.match(r'TEMPLATE#\s*(\((\d+)\))?', n, re.I)
    if m: return 'TEMPLATE#' + (' (%s)' % m.group(2) if m.group(2) else '')
    m = re.match(r'JKX\s*(\d+)', n, re.I)
    if m: return 'JKX-%d' % int(m.group(1))
    if re.match(r'SANTI?V?\d', n, re.I): return 'SANTI'
    m = re.search(r'DCT\s*#?\s*(\d{1,4})', n, re.I)
    if m: return '#%d' % int(m.group(1))
    m = re.match(r'(?:ad|lumeos?#?|batch#?)\s*(\d{1,4})', n, re.I)
    if m: return '#%d' % int(m.group(1))
    m = re.match(r'(\d{1,4})(?!\d)', n)
    if m: return '#%d' % int(m.group(1))
    base = re.sub(r'\s*-\s*Copy.*$', '', n)
    base = re.sub(r'\s*\(\d+\)$', '', base)
    base = re.sub(r'[\s_-]*(v|h)\d+\w*$', '', base, flags=re.I).strip()
    return base or n


ANGLE_KW = [
  ('medical', r'vasectom|\btrt\b|snip|finasteride|prescription'),
  ('offer', r'offer|sale|deadline|bfcm|black ?friday|price|discount|stock|last ?call|subscribe|value|risk ?free'),
  ('failed', r'pill|other brand|counterfeit|scam|\bvs\b|stack|tried|nobody tests|tested ?5|ruined|dont get|do ?not recommend|blue ?pill'),
  ('hard', r'hard|\bed\b|soft|stay ?hard|premature|last ?longer|erect|wood|morning'),
  ('age', r'\bage\b|after ?50|at ?52|\bold\b|decline|years|man i used to be|written ?off|four ?signs|aging'),
  ('her', r'\bher\b|she|wife|girl|partner|boyfriend|husband|woman|roommate|apology|confession|noticed|alicia'),
  ('timeline', r'14 ?days|first ?14|timeline|weeks|day ?\d|week ?\d'),
  ('mechanism', r'mechanism|inside|blood|ingredient|doctor|urologist|plumbing|x-?ray|hypovol|skeleton|explainer|reasons'),
  ('gummy', r'taste|gumm|flavor|eggplant'),
  ('proof', r'review|testimonial|proof|refund|guarantee'),
  ('volume', r'rope|load|volume|bigger|dribbl|spill|finish|towel|laundry|c\*?m|surprised|amount'),
]
FORMAT_KW = [
  ('animation', r'lego|skeleton|clay|toy|cartoon|3d|animation|animated|mannequin|monkey|1900s|whiteboard animation|ai ?absurd|gta'),
  ('podcast', r'podcast|panel clip'),
  ('ai-ugc', r'ai[ -]?ugc|ai ugc|realistic ai'),
  ('ugc', r'\bugc\b|talking head|selfie|voice-?note|car selfie'),
  ('static-whiteboard', r'whiteboard'),
  ('static-native', r'comment|screenshot|imessage|notes app|reddit|forum'),
]
CU_ANGLE = {'more-is-better':'volume','ropes-not-drops':'volume','measurable-result':'volume','her-reaction':'her','buy-it-for-him':'her',
  'hard-and-lasting':'hard','goes-soft':'hard','blood-flow':'mechanism','the-marker-nobody-checks':'mechanism','decline-not-age':'age','after-35-drop':'age',
  'get-back-what-you-lost':'age','failed-solutions':'failed','diy-stack':'failed','other-brands':'failed','offer':'offer','side-effect':'medical','vasectomy':'medical',
  'week-by-week':'timeline','taste':'gummy','the-gummy':'gummy'}
AVATAR_FROM_ANGLE = {'age':'faded-firehose','medical':'faded-firehose','her':'partner-pleaser','hard':'partner-pleaser','volume':'amplifier'}

def kw(text, table):
    t = (text or '').lower()
    for k, pat in table:
        if re.search(pat, t): return k
    return None

def load_queue():
    p = os.path.join(HERE, 'raw', 'queue2.json')
    if not os.path.exists(p): return {}
    out = {}
    for vr in json.load(open(p)):
        tab = vr['range'].split('!')[0].strip("'")
        vals = vr.get('values', [])
        if not vals: continue
        hdr = [h.strip().upper() for h in vals[0]]
        for r in vals[1:]:
            row = dict(zip(hdr, r + [''] * (len(hdr) - len(r))))
            d = row.get('DCT #', '')
            m = re.search(r'(\d+)', d)
            if not m or not d.upper().startswith(('DCT', 'JKX')): continue
            n = int(m.group(1)); auth = row.get('AUTHOR', '')
            if tab == 'Statics': key = 'VS-%03d' % n
            elif d.upper().startswith('JKX'): key = 'JKX-%d' % n
            elif tab == 'Live' and auth == 'Santi' and n < 100: key = 'SAN-%03d' % n
            elif tab == 'Queue' and auth == 'Alex' and n < 100: key = 'ALEX-%03d' % n
            else: key = '#%d' % n
            text = ' '.join([row.get('AD CONCEPT', ''), row.get('NOTES', ''), row.get("QUICK HYPOTHESIS/WHY WE'RE TESTING", '')])
            out.setdefault(key, dict(concept=row.get('AD CONCEPT', ''), cs=auth, editor=row.get('ASSIGNED', '') if row.get('ASSIGNED', '') not in ('N/A',) else '',
                                     ad_type=row.get('AD TYPE', ''), file_type=row.get('FILE TYPE', ''), text=text, tab=tab, week=row.get('WEEK', '')))
    return out

def load_clickup():
    p = os.path.join(HERE, 'clickup_tasks.json')
    if not os.path.exists(p): return {}
    out = {}
    for t in json.load(open(p)):
        if t.get('dct'): out['#%d' % t['dct']] = t
    return out

def enrich(c, manual, queue, cu):
    k = c['key']; tag = dict(angle=None, avatar=None, format=None, desc='', src=[], cs='', editor='', concept='')
    q = queue.get(k)
    if q:
        tag['concept'] = q['concept']; tag['cs'] = q['cs']; tag['editor'] = q['editor']
        tag['src'].append('Brief Queue ' + q['tab'])
    t = cu.get(k)
    if t:
        if t.get('angle'):
            for a in t['angle'].split(','):
                a = CU_ANGLE.get(a.strip())
                if a: tag['angle'] = a; break
        if t.get('avatar'): tag['avatar'] = t['avatar']
        if t.get('format'): tag['format'] = t['format'].split(',')[0].strip()
        tag['cs'] = tag['cs'] or (t.get('cs') or '').title(); tag['editor'] = tag['editor'] or (t.get('editor') or '')
        tag['src'].append('ClickUp')
    names = [re.split(r'_Lumeo', n)[0] for n in c['names']]
    text = ' '.join([(q or {}).get('text', ''), ' '.join(names)])
    if not tag['angle']:
        a = kw(text, ANGLE_KW)
        if a: tag['angle'] = a; tag['src'].append('keyword match (my read)')
    if not tag['format']:
        f = kw(text, FORMAT_KW)
        if k.startswith('Creator: '): f = 'creator-ugc'
        if f: tag['format'] = f
    if not tag['format']:
        no_views = c['v3'] == 0 and c['tp'] == 0
        tag['format'] = 'static-image' if no_views else 'video'
        tag['src'].append('format guessed from view data')
    m = manual.get(k, {})
    for f in ('angle', 'avatar', 'format', 'desc'):
        if m.get(f) and m[f] != 'untagged': tag[f] = m[f]
    if m.get('src'): tag['src'] = [m['src']] + [s for s in tag['src'] if s.startswith('Brief') or s == 'ClickUp']
    if not tag['avatar'] and tag['angle']: tag['avatar'] = AVATAR_FROM_ANGLE.get(tag['angle'])
    tag['src'] = '; '.join(dict.fromkeys(tag['src']))
    return tag

def verdict(c):
    s, r, p = c['spend'], c['roas'], c['purchases']
    if s < MIN_TEST: return 'untested'
    if s >= SPEND_LINE and r >= BAR: return 'breakthrough'
    if s >= SPEND_LINE and r >= 1.0: return 'spend-winner'
    if r >= BAR and p >= KPI_MIN_PUR: return 'kpi-winner'
    return 'loser'

def main():
    rows = []
    for f in sorted(glob.glob(os.path.join(HERE, 'raw', '*.json'))):
        b = os.path.basename(f)
        if not (b.startswith('vfo_q') or b.startswith('lumeo_acct')): continue
        acct = 'VFO' if b.startswith('vfo') else 'Lumeo'
        for x in json.load(open(f)):
            d = x[2][:10]
            if acct == 'VFO' and d < '2026-09-01': continue   # VFO ran another product before Lumeo moved in
            if 'Engagement' in x[1]: continue
            rows.append((acct,) + tuple(x))
    manual = json.load(open(os.path.join(HERE, 'tags_manual.json')))
    queue = load_queue(); cu = load_clickup()

    ads = {}
    for acct, aid, name, d, sp, rev, pur, imp, v3, tp in rows:
        a = ads.setdefault(aid, dict(id=aid, name=name, acct=acct, spend=0, rev=0, pur=0, imp=0, v3=0, tp=0, first=d, last=d))
        a['spend'] += sp; a['rev'] += rev; a['pur'] += pur; a['imp'] += imp; a['v3'] += v3; a['tp'] += tp
        a['first'] = min(a['first'], d); a['last'] = max(a['last'], d)

    concepts = {}
    for a in ads.values():
        k = concept_key(a['name'])
        c = concepts.setdefault(k, dict(key=k, spend=0, rev=0, purchases=0, imp=0, v3=0, tp=0, ads=0, names=collections.Counter(), first=a['first'], last=a['last'], accts=set()))
        c['spend'] += a['spend']; c['rev'] += a['rev']; c['purchases'] += a['pur']; c['imp'] += a['imp']; c['v3'] += a['v3']; c['tp'] += a['tp']
        c['ads'] += 1; c['names'][re.sub(r'\s*-\s*Copy.*$', '', a['name'])] += a['spend']
        c['first'] = min(c['first'], a['first']); c['last'] = max(c['last'], a['last']); c['accts'].add(a['acct'])

    total = sum(c['spend'] for c in concepts.values())
    out = []
    for c in concepts.values():
        c['roas'] = c['rev'] / c['spend'] if c['spend'] else 0
        c['verdict'] = verdict(c)
        hooks = [n for n, _ in c['names'].most_common(12)]
        t = enrich(dict(c, names=hooks), manual, queue, cu)
        out.append(dict(
            key=c['key'], spend=round(c['spend'], 2), revenue=round(c['rev'], 2), roas=round(c['roas'], 3),
            purchases=int(c['purchases']), cpa=round(c['spend'] / c['purchases'], 2) if c['purchases'] else None,
            hook_rate=round(c['v3'] / c['imp'], 4) if c['imp'] and c['v3'] else None,
            share=round(c['spend'] / total, 4) if total else 0,
            ads=c['ads'], variants=len(c['names']), names=hooks, first=c['first'], last=c['last'],
            accounts=sorted(c['accts']), verdict=c['verdict'],
            angle=t.get('angle') or 'untagged', avatar=t.get('avatar') or 'untagged', format=t.get('format') or 'untagged',
            desc=t.get('desc', ''), tag_src=t.get('src', ''), cs=t.get('cs', ''), editor=t.get('editor', ''), concept=t.get('concept', ''),
        ))
    out.sort(key=lambda z: -z['spend'])
    months = collections.defaultdict(float)
    for r in rows: months[r[3][:7]] += r[4]
    res = dict(
        generated_at=datetime.datetime.now(datetime.timezone.utc).strftime('%Y-%m-%dT%H:%MZ'),
        window=dict(first=min(r[3] for r in rows)[:10], last=max(r[3] for r in rows)[:10]),
        rules=dict(spend_line=SPEND_LINE, bar=BAR, kpi_min_purchases=KPI_MIN_PUR, min_test=MIN_TEST),
        totals=dict(spend=round(total, 2), revenue=round(sum(c['rev'] for c in concepts.values()), 2), ads=len(ads), concepts=len(out)),
        months={k: round(v) for k, v in sorted(months.items())},
        concepts=out,
    )
    json.dump(res, open(sys.argv[1] if len(sys.argv) > 1 else os.path.join(HERE, 'ads.json'), 'w'), separators=(',', ':'))
    print('ads', len(ads), 'concepts', len(out), 'spend', round(total))

if __name__ == '__main__':
    main()
