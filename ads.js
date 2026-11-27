// Ads source of truth. Reads ads.json (built from every Lumeo Meta ad with spend).
(function () {
  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const money = (v) => v >= 1e6 ? '$' + (v / 1e6).toFixed(2) + 'M' : v >= 1e4 ? '$' + Math.round(v / 1e3) + 'K' : v >= 1e3 ? '$' + (v / 1e3).toFixed(1) + 'K' : '$' + Math.round(v);
  const pct = (v) => v == null ? '–' : Math.round(v * 100) + '%';
  const rx = (v) => v ? v.toFixed(2) : '–';
  const day = (s) => s ? s.slice(0, 10) : '';

  const LABEL = {
    angle: { volume: 'Volume / load size', her: 'Her (partner)', age: 'Age / decline', hard: 'Harder / stamina', medical: 'Medical / condition', failed: 'Failed solutions', mechanism: 'Mechanism', timeline: 'Timeline / results', offer: 'Offer / urgency', gummy: 'Gummy format', proof: 'Proof / guarantee', curiosity: 'Curiosity / pattern interrupt', taste: 'Taste / flavor', size: 'Size / girth', benefits: 'Product benefits', untagged: 'Not tagged yet' },
    format: { 'static-image': 'Static image', 'static-whiteboard': 'Static whiteboard', 'static-native': 'Static native (comment, screenshot)', animation: 'Animation / claymation', video: 'Video', 'creator-ugc': 'Creator UGC', ugc: 'UGC', 'ai-ugc': 'AI UGC', podcast: 'Podcast clip', 'talking-head': 'Talking head', untagged: 'Not tagged yet' },
    avatar: { 'faded-firehose': 'Faded Firehose', 'partner-pleaser': 'Partner Pleaser', amplifier: 'Amplifier', 'the-partner': 'The Partner', untagged: 'Not tagged yet' },
    verdict: { breakthrough: 'Breakthrough', 'spend-winner': 'Spend winner', 'kpi-winner': 'KPI winner', loser: 'Did not win', untested: 'Under test spend' }
  };
  const lab = (dim, v) => (LABEL[dim] && LABEL[dim][v || 'untagged']) || v || 'Not tagged yet';
  const WIN = new Set(['breakthrough', 'spend-winner', 'kpi-winner']);
  const roasCls = (r, bar) => r >= bar ? 'roas-good' : r >= 1 ? 'roas-mid' : 'roas-low';
  const pill = (v) => `<span class="pill v-${v}">${esc(lab('verdict', v))}</span>`;

  let D, C, bar, minTest;

  fetch('ads.json', { cache: 'no-store' }).then((r) => r.json()).then((d) => {
    D = d; C = d.concepts.slice().sort((a, b) => b.spend - a.spend);
    bar = d.rules.bar; minTest = d.rules.min_test;
    document.querySelectorAll('.mintest').forEach((e) => (e.textContent = minTest));
    lede(); kpis(); dimTable('angle'); matrix(); winners(); setupAll(); months(); how();
  }).catch((e) => { $('#lede').textContent = 'Could not load ads.json (' + e.message + ').'; });

  function lede() {
    const t = D.totals;
    $('#lede').innerHTML = `Every Lumeo ad that spent money on Meta from ${esc(D.window.first)} to ${esc(D.window.last)}: ${t.ads.toLocaleString()} ads grouped into ${t.concepts.toLocaleString()} concepts. Built ${esc(D.generated_at.replace('T', ' ').replace('Z', ' UTC'))}.`;
  }

  function kpis() {
    const t = D.totals, tested = C.filter((c) => c.spend >= minTest), wins = tested.filter((c) => WIN.has(c.verdict));
    const bt = C.filter((c) => c.verdict === 'breakthrough').length;
    const items = [
      [money(t.spend), 'spend'], [rx(t.revenue / t.spend), 'blended ROAS (Meta)'],
      [tested.length, `concepts tested (≥$${minTest})`], [wins.length, `winners, ${bt} breakthrough`],
      [pct(tested.length ? wins.length / tested.length : 0), 'hit rate']
    ];
    $('#kpis').innerHTML = items.map(([b, s]) => `<div class="kpi"><b>${b}</b><span>${s}</span></div>`).join('');
  }

  function group(dim) {
    const g = {};
    C.forEach((c) => {
      const k = c[dim] || 'untagged';
      const x = g[k] || (g[k] = { k, concepts: 0, tested: 0, wins: 0, ads: 0, spend: 0, rev: 0, best: null });
      x.concepts++; x.ads += c.ads; x.spend += c.spend; x.rev += c.revenue;
      if (c.spend >= minTest) x.tested++;
      if (WIN.has(c.verdict)) { x.wins++; if (!x.best || c.spend > x.best.spend) x.best = c; }
    });
    return Object.values(g).sort((a, b) => (a.k === 'untagged') - (b.k === 'untagged') || b.spend - a.spend);
  }

  function dimTable(dim) {
    const rows = group(dim), tot = D.totals.spend, maxHit = 1;
    $('#dimtbl').innerHTML = `<thead><tr><th>${dim[0].toUpperCase() + dim.slice(1)}</th><th class="n">Concepts tried</th><th class="n">Ads</th><th class="n">Winners</th><th>Hit rate</th><th class="n">Spend</th><th class="n">Share</th><th class="n">ROAS</th><th>Best winner</th></tr></thead><tbody>` +
      rows.map((r) => {
        const hit = r.tested ? r.wins / r.tested : 0, roas = r.spend ? r.rev / r.spend : 0;
        return `<tr><td>${esc(lab(dim, r.k))}</td><td class="n">${r.concepts}</td><td class="n">${r.ads}</td><td class="n">${r.wins}</td>
          <td><div class="hit"><i style="width:${Math.round((hit / maxHit) * 80)}px"></i><span>${r.tested ? pct(hit) : '–'}</span></div></td>
          <td class="n">${money(r.spend)}</td><td class="n">${pct(r.spend / tot)}</td><td class="n ${roasCls(roas, bar)}">${rx(roas)}</td>
          <td>${r.best ? `<b>${esc(r.best.key)}</b> <small>${rx(r.best.roas)} on ${money(r.best.spend)}</small>` : '<small>none yet</small>'}</td></tr>`;
      }).join('') + '</tbody>';
  }
  document.querySelectorAll('#dimseg button').forEach((b) => b.addEventListener('click', () => {
    document.querySelectorAll('#dimseg button').forEach((x) => x.setAttribute('aria-pressed', x === b));
    dimTable(b.dataset.dim);
  }));

  function matrix() {
    const A = group('angle').map((r) => r.k), F = group('format').map((r) => r.k);
    const cell = {};
    C.forEach((c) => {
      const k = (c.angle || 'untagged') + '|' + (c.format || 'untagged');
      const x = cell[k] || (cell[k] = { n: 0, w: 0, s: 0 });
      x.n++; x.s += c.spend; if (WIN.has(c.verdict)) x.w++;
    });
    const maxW = Math.max(1, ...Object.values(cell).map((x) => x.w));
    $('#mtx').innerHTML = `<thead><tr><th>Angle ↓ / format →</th>${F.map((f) => `<th>${esc(lab('format', f))}</th>`).join('')}</tr></thead><tbody>` +
      A.map((a) => `<tr><td>${esc(lab('angle', a))}</td>` + F.map((f) => {
        const x = cell[a + '|' + f];
        if (!x) return '<td class="c"></td>';
        const alpha = x.w ? 0.15 + 0.55 * (x.w / maxW) : 0.04;
        return `<td class="c" style="background:rgba(226,185,59,${alpha.toFixed(2)})" title="${x.n} concepts, ${x.w} winners, ${money(x.s)} spend"><b>${x.n}</b><em> / ${x.w}</em></td>`;
      }).join('') + '</tr>').join('') + '</tbody>';
  }

  function winners() {
    const w = C.filter((c) => WIN.has(c.verdict));
    const order = { breakthrough: 0, 'spend-winner': 1, 'kpi-winner': 2 };
    w.sort((a, b) => order[a.verdict] - order[b.verdict] || b.spend - a.spend);
    $('#winsub').textContent = `${w.length} concepts beat the bar. Breakthrough = $${D.rules.spend_line.toLocaleString()}+ spend at ${bar}+ ROAS. Spend winner = $${D.rules.spend_line.toLocaleString()}+ at 1.0 to ${bar}. KPI winner = ${bar}+ ROAS with ${D.rules.kpi_min_purchases}+ purchases at lower spend.`;
    $('#wins').innerHTML = w.slice(0, 24).map((c) => `<div class="win ${c.verdict === 'breakthrough' ? 'v-breakthrough-card' : ''}">
      <div>${pill(c.verdict)}</div><h3>${esc(c.key)}</h3>
      <p>${esc(c.desc || c.concept || c.names[0] || '')}</p>
      <div class="nums"><div><b>${money(c.spend)}</b>spend</div><div><b class="${roasCls(c.roas, bar)}">${rx(c.roas)}</b>ROAS</div><div><b>${c.purchases}</b>purch.</div><div><b>${c.ads}</b>ads</div></div>
      <div>${tags(c)}</div></div>`).join('') + (w.length > 24 ? `<p class="sub">+${w.length - 24} more in the table below (filter by verdict).</p>` : '');
  }

  function tags(c) {
    return ['angle', 'format', 'avatar'].map((d) => `<span class="tag ${!c[d] || c[d] === 'untagged' ? 'untagged' : ''}">${esc(lab(d, c[d]))}</span>`).join('');
  }

  let sortKey = 'spend', sortDir = -1, shown = 60;
  function setupAll() {
    const opt = (sel, dim, vals) => { $(sel).innerHTML = `<option value="">All ${dim}s</option>` + vals.map((v) => `<option value="${esc(v)}">${esc(lab(dim, v))}</option>`).join(''); };
    opt('#fAngle', 'angle', group('angle').map((r) => r.k));
    opt('#fFormat', 'format', group('format').map((r) => r.k));
    opt('#fAvatar', 'avatar', group('avatar').map((r) => r.k));
    opt('#fVerdict', 'verdict', ['breakthrough', 'spend-winner', 'kpi-winner', 'loser', 'untested']);
    ['#q', '#fAngle', '#fFormat', '#fAvatar', '#fVerdict'].forEach((s) => $(s).addEventListener('input', () => { shown = 60; allTable(); }));
    $('#more').addEventListener('click', () => { shown += 100; allTable(); });
    allTable();
  }

  const COLS = [
    ['key', 'Concept'], ['verdict', 'Verdict'], ['spend', 'Spend', 1], ['roas', 'ROAS', 1], ['purchases', 'Purch.', 1], ['cpa', 'CPA', 1],
    ['hook_rate', 'Hook rate', 1], ['ads', 'Ads', 1], ['tags', 'Angle / format / avatar'], ['who', 'CS / editor'], ['first', 'Ran']
  ];
  function allTable() {
    const q = $('#q').value.trim().toLowerCase();
    const f = { angle: $('#fAngle').value, format: $('#fFormat').value, avatar: $('#fAvatar').value, verdict: $('#fVerdict').value };
    let rows = C.filter((c) => Object.entries(f).every(([k, v]) => !v || (c[k] || 'untagged') === v));
    if (q) rows = rows.filter((c) => [c.key, c.desc, c.concept, c.cs, c.editor, ...(c.names || [])].join(' ').toLowerCase().includes(q));
    rows.sort((a, b) => {
      const x = a[sortKey], y = b[sortKey];
      if (x == null) return 1; if (y == null) return -1;
      return (typeof x === 'string' ? x.localeCompare(y) : x - y) * sortDir;
    });
    const sp = rows.reduce((s, c) => s + c.spend, 0);
    $('#allsub').textContent = `${rows.length} concepts, ${money(sp)} spend. Click a column to sort. Hover a concept for the ad names behind it.`;
    $('#alltbl').innerHTML = '<thead><tr>' + COLS.map(([k, l, n]) => {
      const s = ['tags', 'who'].includes(k) ? '' : 'sort';
      return `<th class="${s} ${n ? 'n' : ''}" data-k="${k}" ${k === sortKey ? `aria-sort="${sortDir < 0 ? 'descending' : 'ascending'}"` : ''}>${l}</th>`;
    }).join('') + '</tr></thead><tbody>' + rows.slice(0, shown).map((c) => `<tr>
      <td class="name" title="${esc((c.names || []).join('\n'))}"><b>${esc(c.key)}</b><small>${esc(c.desc || c.concept || (c.names || [])[0] || '')}</small>${c.tag_src ? `<small>Tags: ${esc(c.tag_src)}</small>` : ''}</td>
      <td>${pill(c.verdict)}</td><td class="n">${money(c.spend)}</td><td class="n ${roasCls(c.roas, bar)}">${rx(c.roas)}</td>
      <td class="n">${c.purchases}</td><td class="n">${c.cpa ? '$' + Math.round(c.cpa) : '–'}</td><td class="n">${pct(c.hook_rate)}</td><td class="n">${c.ads}</td>
      <td>${tags(c)}</td><td><small>${esc([c.cs, c.editor].filter(Boolean).join(' / ') || '–')}</small></td>
      <td><small>${day(c.first)}${day(c.last) !== day(c.first) ? ' to ' + day(c.last) : ''}</small></td></tr>`).join('') + '</tbody>';
    $('#alltbl').querySelectorAll('th.sort').forEach((th) => th.addEventListener('click', () => {
      const k = th.dataset.k; if (k === sortKey) sortDir *= -1; else { sortKey = k; sortDir = ['key', 'verdict', 'first'].includes(k) ? 1 : -1; }
      allTable();
    }));
    $('#more').hidden = rows.length <= shown;
  }

  function months() {
    const m = Object.entries(D.months).sort();
    const max = Math.max(...m.map(([, v]) => v));
    const name = (k) => new Date(k + '-01T00:00:00Z').toLocaleString('en', { month: 'short', year: '2-digit', timeZone: 'UTC' });
    $('#mbars').innerHTML = m.map(([k, v]) => `<div class="mbar"><b>${money(v)}</b><i style="height:${Math.max(2, Math.round((v / max) * 150))}px"></i><span>${name(k)}</span></div>`).join('');
  }

  function how() {
    const tagged = (d) => C.filter((c) => c[d] && c[d] !== 'untagged').reduce((s, c) => s + c.spend, 0) / D.totals.spend;
    const src = {};
    C.forEach((c) => { const t = c.tag_src || ''; const s = !c.angle || c.angle === 'untagged' ? 'No angle tag yet' : /Claude/.test(t) ? 'Angle tagged by Claude from the ad copy and image in Ads Manager (my read)' : /keyword/.test(t) ? 'Angle from keyword match on the ad name (my read)' : /Ad set name/.test(t) && !/ClickUp|Brief|doc/i.test(t) ? 'Angle from the ad set name (A-, F-, PE- codes)' : /ClickUp/.test(t) && !/Statics|Live \(/.test(t) ? 'Angle from ClickUp fields' : 'Angle hand-tagged from Brief Queue notes or project docs'; src[s] = (src[s] || 0) + c.spend; });
    const guessed = C.filter((c) => /guessed/.test(c.tag_src || '')).reduce((s, c) => s + c.spend, 0) / D.totals.spend;
    $('#howbox').innerHTML = `
      <p><b>Data.</b> Spend, revenue and purchases per ad per day come from Meta (Facebook Insights through Make), for the Lumeo ad account and the VFO account. VFO ads before Sep 2026 are excluded because that account ran a different product then. The Lumeo 2.0 account only ran engagement ads, so it is left out, and so are ads named "Engagement". ROAS is Meta-reported (7-day click, 1-day view), not Triple Whale.</p>
      <p><b>Concepts.</b> Hooks, versions and copies of the same creative are merged into one concept by the DCT number in the ad name (for example "ad 332 v1", "DCT 332 V2" and "332HI(V1)" all count as #332). Santi's W37 to W41 batch is shown as SAN-###, Victor's early statics as VS-###, Alex's as ALEX-###, Black Friday as BFCM-###, creator ads by creator name.</p>
      <p><b>Verdicts</b> use the same bar as the weekly scorecards: breakthrough at $${D.rules.spend_line.toLocaleString()}+ spend and ${bar}+ ROAS, spend winner at $${D.rules.spend_line.toLocaleString()}+ and 1.0 to ${bar}, KPI winner at ${bar}+ ROAS with ${D.rules.kpi_min_purchases}+ purchases. Concepts under $${minTest} are counted as not tested.</p>
      <p><b>Tags.</b> Meta does not store angle, avatar or format, so each concept is tagged from the best source available, and the source is shown under each concept in the table. Share of spend with a tag: angle ${pct(tagged('angle'))}, format ${pct(tagged('format'))}, avatar ${pct(tagged('avatar'))}.</p>
      <ul>${Object.entries(src).sort((a, b) => b[1] - a[1]).map(([k, v]) => `<li>${esc(k)}: ${pct(v / D.totals.spend)} of spend</li>`).join('')}<li>Format guessed from video view data (static if Meta logged no 3-second views): ${pct(guessed)} of spend</li></ul>
      <p><b>Known gaps.</b> Some DCT numbers were reused across eras (for example Lumeo-account #102 to #115 in July and Victor's #107 to #169 from W44), so a few concepts mix two creatives. Untagged concepts sit in "Not tagged yet" until someone tags them in <code>tags_manual.json</code> or ClickUp. New ads made through ClickUp (DCT 1000+) get tagged automatically from the ClickUp fields.</p>`;
  }
})();
