/* La Sonde — « Qui gagne le débat ? » : réactions en direct + vote final des internautes.
   Sans serveur configuré (config.json → api) ou sans débat programmé, un mode démonstration
   clairement signalé montre le fonctionnement avec des données fictives. */
window.Debate = (function () {
  'use strict';
  const GRACE = 60 * 60 * 1000, COOL = 8000, POLL = 5000;
  const S = { key: null, data: null, token: null, cool: {}, timer: null, sel: null, intent: '', consent: false, msg: '', demo: false };
  let C0; // contexte brut
  let C; // contexte fourni par app.js : { D, lang, t, col, nm, sh, fmt, esc, css, tipFor }
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch { /* indisponible */ } }
  };
  const C0nm = c => (C0 && C0.D.cands[c] ? C0.D.cands[c].name : c);
  const phase = (d, t = Date.now()) => {
    if (S.demo) return 'live';
    const s = Date.parse(d.start), e = Date.parse(d.end);
    return t < s ? 'upcoming' : t <= e ? 'live' : t <= e + GRACE ? 'verdict' : 'closed';
  };
  const silence = () => C.D.election.blackout.some(b => Date.now() >= Date.parse(b.from) && Date.now() <= Date.parse(b.to));
  const duration = d => Math.round((Date.parse(d.end) - Date.parse(d.start)) / 60000);

  function pick() {
    const now = Date.now(), real = C.D.debates.filter(d => !d.demo);
    const live = real.find(d => ['live', 'verdict'].includes(phase(d, now)));
    const next = real.filter(d => phase(d, now) === 'upcoming').sort((a, b) => a.start.localeCompare(b.start))[0];
    const past = real.filter(d => phase(d, now) === 'closed').sort((a, b) => b.start.localeCompare(a.start))[0];
    return live || next || past || null;
  }

  // ---------- Données de démonstration (fictives, graine fixe) ----------
  function demoData(d) {
    let s = 7; const r = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
    const now = 74, buckets = {}, drift = { [d.candidates[0]]: 0.05, [d.candidates[1]]: -0.02 };
    const lvl = {}; d.candidates.forEach(c => lvl[c] = 0);
    for (let m = 0; m < now; m++) {
      const b = buckets[m] = {};
      for (const c of d.candidates) {
        lvl[c] = Math.max(-0.6, Math.min(0.6, lvl[c] * 0.85 + (r() - 0.5) * 0.35 + drift[c] * (m > 35 && m < 70 ? -1.5 : 1)));
        const n = Math.round(300 + r() * 500), pos = Math.round(n * (0.5 + lvl[c] / 2));
        b[c] = [pos, n - pos];
      }
    }
    const [A, B] = d.candidates;
    return { demoNow: now, buckets, reactors: 8412, voters: 10600, verdict: { [A]: 5120, [B]: 4870, none: 610 },
      byIntent: { other: { [A]: 1420, [B]: 1310, none: 280 }, blank: { [A]: 120, [B]: 150, none: 90 }, undecided: { [A]: 410, [B]: 470, none: 95 } } };
  }

  // ---------- Réseau ----------
  const api = p => C.D.site.api.replace(/\/$/, '') + p;
  async function token() {
    if (S.token) return S.token;
    try { const t = sessionStorage.getItem('lasonde-token'); if (t && +t.split('.')[1] > Date.now()) return (S.token = t); } catch { /* */ }
    let turnstile = '';
    if (C.D.site.turnstile) turnstile = await turnstileToken();
    const r = await fetch(api('/api/session'), { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ turnstile }) });
    if (!r.ok) throw new Error('session');
    S.token = (await r.json()).token;
    try { sessionStorage.setItem('lasonde-token', S.token); } catch { /* */ }
    return S.token;
  }
  function turnstileToken() {
    return new Promise((resolve, reject) => {
      const go = () => {
        const el = document.getElementById('ts-box') || Object.assign(document.createElement('div'), { id: 'ts-box' });
        document.body.appendChild(el);
        window.turnstile.render(el, { sitekey: C.D.site.turnstile, size: 'invisible', callback: resolve, 'error-callback': reject, appearance: 'interaction-only' });
      };
      if (window.turnstile) return go();
      const sc = document.createElement('script');
      sc.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'; sc.async = true; sc.onload = go; sc.onerror = reject;
      document.head.appendChild(sc);
    });
  }
  async function refresh() {
    if (S.demo || !S.key) return;
    try {
      const r = await fetch(api('/api/debate/' + S.key.id), { cache: 'no-store' });
      if (r.ok) { S.data = await r.json(); drawResults(); drawCurve(); counters(); }
    } catch { /* réseau indisponible : on réessaie au prochain tour */ }
  }
  async function send(path, body) {
    if (S.demo) return { status: 200 };
    const tk = await token();
    const r = await fetch(api(`/api/debate/${S.key.id}/${path}`), { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...body, token: tk }) });
    if (r.status === 401) { S.token = null; try { sessionStorage.removeItem('lasonde-token'); } catch { /* */ } }
    return r;
  }

  // ---------- Actions ----------
  async function react(c, v) {
    const k = c; if (S.cool[k] && Date.now() - S.cool[k] < COOL) return;
    S.cool[k] = Date.now(); cooldown(c);
    const r = await send('react', { c, v }).catch(() => ({ status: 0 }));
    if (r.status === 200) {
      const m = S.demo ? S.data.demoNow - 1 : Math.max(0, Math.floor((Date.now() - Date.parse(S.key.start)) / 60000));
      const b = S.data.buckets[m] || (S.data.buckets[m] = {}); const cell = b[c] || (b[c] = [0, 0]); cell[v === 1 ? 0 : 1]++;
      drawCurve(); counters();
    } else if (r.status === 429) flash(C.t('deb.wait')); else flash(C.t('deb.err'));
  }
  async function vote() {
    if (!S.sel) return;
    const r = await send('verdict', { c: S.sel, intent: S.consent ? S.intent : '', consent: S.consent && !!S.intent }).catch(() => ({ status: 0 }));
    if (r.status === 200 || r.status === 409) {
      store.set('voted:' + S.key.id, S.sel);
      if (S.demo || r.status === 200) {
        S.data.verdict[S.sel] = (S.data.verdict[S.sel] || 0) + 1; S.data.voters++;
      }
      S.msg = r.status === 409 ? C.t('deb.already') : C.t('deb.thanks');
      drawVote(); drawResults(); counters();
    } else flash(C.t('deb.err'));
  }
  function flash(m) { const el = document.getElementById('debMsg'); if (el) { el.textContent = m; setTimeout(() => { if (el.textContent === m) el.textContent = ''; }, 3500); } }
  function cooldown(c) {
    const card = document.querySelector(`.react[data-c="${c}"]`); if (!card) return;
    const bar = card.querySelector('.cool i'), btns = card.querySelectorAll('button');
    btns.forEach(b => b.disabled = true); bar.style.transition = 'none'; bar.style.width = '100%';
    requestAnimationFrame(() => { bar.style.transition = `width ${COOL}ms linear`; bar.style.width = '0%'; });
    setTimeout(() => btns.forEach(b => b.disabled = false), COOL);
  }

  // ---------- Calculs ----------
  function curves() {
    const d = S.key, minN = S.demo ? 1 : 15, out = {};
    const last = S.demo ? S.data.demoNow : Math.min(duration(d), Math.floor((Math.min(Date.now(), Date.parse(d.end)) - Date.parse(d.start)) / 60000));
    for (const c of d.candidates) {
      const raw = [];
      for (let m = 0; m <= last; m++) { const x = (S.data.buckets[m] || {})[c]; const n = x ? x[0] + x[1] : 0; raw.push(n >= minN ? { m, v: (x[0] - x[1]) / n * 100, n } : { m, v: null, n }); }
      out[c] = raw.map((p, i) => {
        const w = raw.slice(Math.max(0, i - 2), i + 1).filter(q => q.v != null);
        return { m: p.m, v: w.length ? w.reduce((s, q) => s + q.v * q.n, 0) / w.reduce((s, q) => s + q.n, 0) : null };
      });
    }
    return { out, last };
  }

  // ---------- Rendu ----------
  // En démonstration, candidats fictifs : jamais de faux chiffres associés à de vrais noms.
  function wrap(ctx, demoDef) {
    if (!demoDef) return ctx;
    const n = c => demoDef.names && demoDef.names[c] ? demoDef.names[c][ctx.lang] : ctx.nm(c);
    return { ...ctx, nm: n, sh: n, col: c => (demoDef.colors && demoDef.colors[c]) || ctx.col(c) };
  }
  function render(ctx) {
    C = ctx; C0 = ctx;
    const host = document.getElementById('debate');
    clearInterval(S.timer);
    const real = pick();
    S.demo = !C.D.site.api || !real;
    S.key = S.demo ? C.D.debates.find(d => d.demo) : real;
    C = wrap(ctx, S.demo ? S.key : null);
    if (!S.key) { host.innerHTML = `<p>${C.t('deb.none_scheduled')}</p>`; return; }
    if (S.demo) { if (!S.data || !S.data.demoNow) S.data = demoData(S.key); }
    else if (!S.data || S.data.demoNow) S.data = { buckets: {}, verdict: {}, byIntent: {}, voters: 0, reactors: 0 };
    const d = S.key, ph = phase(d), L = C.lang;
    const when = new Date(d.start).toLocaleString(L === 'fr' ? 'fr-FR' : 'en-GB', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });
    const statusTxt = { live: C.t('deb.live'), upcoming: C.t('deb.upcoming'), verdict: C.t('deb.verdict'), closed: C.t('deb.closed') }[ph];
    host.innerHTML = `
      ${!real && C.D.site.api ? `<p class="note" style="margin-top:0">${C.t('deb.none_scheduled')}</p>` : ''}
      <div class="debate-head"><div><h3>${C.esc(d.title[L])}</h3><div class="note" style="margin:4px 0 0">${C.esc(typeof d.channel === 'object' ? d.channel[L] : d.channel)}${S.demo ? '' : ' · ' + C.esc(when)}</div></div>
        <div style="display:grid;gap:6px;justify-items:end"><span class="status ${ph === 'live' ? 'on' : ''}">${ph === 'live' ? '<span class="live"></span>' : ''}${statusTxt}</span><span class="note num" style="margin:0" id="debCount"></span></div></div>
      <div class="disclaimer ${S.demo ? 'demo-flag' : ''}"><span aria-hidden="true">ⓘ</span><span>${S.demo ? C.t('deb.demo') + ' ' : ''}${C.t('deb.notpoll')}</span></div>
      ${silence() ? `<p class="disclaimer">${C.t('deb.silence')}</p>` : ''}
      ${ph === 'upcoming' ? `<p class="big num" style="font-size:32px">${C.t('deb.starts', { t: countdown(d) })}</p>` : ''}
      ${ph === 'live' && !silence() ? `<div class="react-grid">${d.candidates.map(c => `<div class="react" data-c="${c}" style="--c:${C.col(c)}">
          <h4><span>${C.esc(C.nm(c))}</span><small class="num" data-net="${c}"></small></h4>
          <div class="btns"><button class="yes" data-v="1" data-c="${c}">${C.t('deb.yes')}</button><button class="no" data-v="-1" data-c="${c}">${C.t('deb.no')}</button></div>
          <div class="cool"><i></i></div></div>`).join('')}</div>` : ''}
      <p class="note" id="debMsg" role="status" aria-live="polite" style="min-height:1.2em;margin:0"></p>
      ${ph !== 'upcoming' ? `<h4 style="margin:10px 0 2px">${C.t('deb.curve')}</h4><p class="note" style="margin:0 0 6px">${C.t('deb.curveDesc')}</p><div class="chart" id="debCurve"></div>` : ''}
      <div class="grid2" style="margin-top:8px"><div class="vote-box" id="debVote"></div><div class="vote-box" id="debRes"></div></div>`;
    host.querySelectorAll('.react button').forEach(b => b.onclick = () => react(b.dataset.c, +b.dataset.v));
    drawCurve(); drawVote(); drawResults(); counters();
    if (!S.demo && ph !== 'closed') { refresh(); S.timer = setInterval(() => { const p2 = phase(S.key); if (p2 !== ph) render(C); else if (p2 !== 'upcoming') refresh(); }, p2Interval(ph)); }
    else if (!S.demo) refresh();
  }
  const p2Interval = ph => ph === 'upcoming' ? 30000 : POLL;
  function countdown(d) {
    const ms = Date.parse(d.start) - Date.now(), j = Math.floor(ms / 864e5), h = Math.floor(ms % 864e5 / 36e5), m = Math.floor(ms % 36e5 / 6e4);
    return (j ? `${j} j ` : '') + `${h} h ${String(m).padStart(2, '0')}`;
  }
  function counters() {
    const el = document.getElementById('debCount'); if (!el) return;
    el.textContent = C.t('deb.people', { r: S.data.reactors.toLocaleString(C.lang === 'fr' ? 'fr-FR' : 'en-GB'), v: S.data.voters.toLocaleString(C.lang === 'fr' ? 'fr-FR' : 'en-GB') });
    const { out } = curves();
    for (const c of S.key.candidates) {
      const tag = document.querySelector(`[data-net="${c}"]`); if (!tag) continue;
      const vals = out[c].slice(-5).filter(p => p.v != null).map(p => p.v);
      const v = vals.length ? vals.reduce((a, b) => a + b) / vals.length : null;
      tag.textContent = v == null ? '' : C.t('deb.net5', { v: (v > 0 ? '+' : v < 0 ? '−' : '') + Math.abs(Math.round(v)) });
    }
  }
  function drawCurve() {
    const host = document.getElementById('debCurve'); if (!host || !window.d3) return;
    host.querySelectorAll('svg').forEach(n => n.remove());
    const d = S.key, dur = duration(d), { out, last } = curves();
    const W = host.clientWidth || 600, mobile = W < 600, H = mobile ? 260 : 300, m = { t: 26, r: mobile ? 76 : 96, b: 32, l: 36 };
    const x = d3.scaleLinear().domain([0, dur]).range([m.l, W - m.r]);
    const y = d3.scaleLinear().domain([-100, 100]).range([H - m.b, m.t]);
    const svg = d3.select(host).append('svg').attr('viewBox', `0 0 ${W} ${H}`).attr('role', 'img').attr('aria-label', C.t('deb.curve'));
    const segs = d.segments || [];
    segs.forEach((s, i) => {
      const x0 = x(s.min), x1 = x(segs[i + 1] ? segs[i + 1].min : dur);
      if (i % 2 === 0) svg.append('rect').attr('x', x0).attr('y', m.t).attr('width', x1 - x0).attr('height', H - m.t - m.b).attr('fill', C.css('--surface-2')).attr('opacity', .7);
      svg.append('text').attr('x', x0 + 6).attr('y', m.t - 8).attr('fill', C.css('--muted')).attr('font-size', 11).attr('font-weight', 700).text(s[C.lang]);
    });
    svg.append('g').attr('class', 'axis').attr('transform', `translate(0,${H - m.b})`).call(d3.axisBottom(x).ticks(mobile ? 4 : 8).tickFormat(v => v + ' ' + C.t('deb.min')));
    svg.append('g').attr('class', 'axis').attr('transform', `translate(${m.l},0)`).call(d3.axisLeft(y).tickValues([-100, -50, 0, 50, 100]).tickSize(0).tickFormat(v => (v > 0 ? '+' : '') + v)).select('.domain').remove();
    svg.append('line').attr('x1', m.l).attr('x2', W - m.r).attr('y1', y(0)).attr('y2', y(0)).attr('stroke', C.css('--ink-2')).attr('stroke-width', 1);
    if (phase(d) === 'live') svg.append('line').attr('x1', x(last)).attr('x2', x(last)).attr('y1', m.t).attr('y2', H - m.b).attr('stroke', '#e8174a').attr('stroke-dasharray', '3 3');
    const line = d3.line().defined(p => p.v != null).x(p => x(p.m)).y(p => y(p.v)).curve(d3.curveMonotoneX);
    const labels = [];
    for (const c of d.candidates) {
      svg.append('path').datum(out[c]).attr('fill', 'none').attr('stroke', C.col(c)).attr('stroke-width', 2.5).attr('stroke-linecap', 'round').attr('d', line);
      const lp = [...out[c]].reverse().find(p => p.v != null);
      if (lp) { svg.append('circle').attr('cx', x(lp.m)).attr('cy', y(lp.v)).attr('r', 4).attr('fill', C.col(c)).attr('stroke', C.css('--surface')).attr('stroke-width', 2); labels.push({ c, y: y(lp.v), x: x(lp.m) }); }
    }
    labels.sort((a, b) => a.y - b.y).forEach((l, i, a) => { if (i && l.y - a[i - 1].y < 14) l.y = a[i - 1].y + 14; });
    labels.forEach(l => svg.append('text').attr('class', 'lbl').attr('x', Math.min(l.x + 8, W - m.r + 8)).attr('y', l.y + 4).text(C.sh(l.c)));
    const tip = C.tipFor(host);
    const cross = svg.append('line').attr('stroke', C.css('--ink-2')).attr('y1', m.t).attr('y2', H - m.b).attr('opacity', 0);
    svg.append('rect').attr('x', m.l).attr('y', m.t).attr('width', W - m.l - m.r).attr('height', H - m.t - m.b).attr('fill', 'transparent')
      .on('pointermove', ev => {
        const [px, py] = d3.pointer(ev), mm = Math.max(0, Math.min(last, Math.round(x.invert(px))));
        cross.attr('x1', x(mm)).attr('x2', x(mm)).attr('opacity', .4);
        const seg = [...segs].reverse().find(s => s.min <= mm);
        tip.show(`<h4>${mm} ${C.t('deb.min')}${seg ? ' · ' + C.esc(seg[C.lang]) : ''}</h4>` + d.candidates.map(c => { const p = out[c][mm]; return `<div class="r"><span><i style="background:${C.col(c)}"></i>${C.esc(C.sh(c))}</span><b class="num">${p && p.v != null ? (p.v > 0 ? '+' : '') + Math.round(p.v) : '–'}</b></div>`; }).join(''), x(mm), py);
      }).on('pointerleave', () => { tip.hide(); cross.attr('opacity', 0); });
  }
  function drawVote() {
    const el = document.getElementById('debVote'); if (!el) return;
    const d = S.key, ph = phase(d), done = store.get('voted:' + d.id);
    if (ph === 'upcoming' || ph === 'closed' || silence()) { el.innerHTML = ''; el.style.display = 'none'; return; }
    el.style.display = '';
    if (done && !S.demo) { el.innerHTML = `<h4 style="margin:0 0 6px">${C.t('deb.vq')}</h4><p>${S.msg || C.t('deb.already')}</p>`; return; }
    const opts = [...d.candidates, 'none'];
    const intents = [...new Set([...C.D.standings.slice(0, 8).map(s => s.c)])];
    el.innerHTML = `<h4 style="margin:0 0 6px">${C.t('deb.vq')}</h4>
      <div class="vote-opts">${opts.map(c => `<button type="button" aria-pressed="${S.sel === c}" data-c="${c}">${c === 'none' ? '' : `<i style="background:${C.col(c)}"></i>`}${C.esc(c === 'none' ? C.t('deb.none') : C.nm(c))}</button>`).join('')}</div>
      <label class="consent"><input type="checkbox" id="debConsent" ${S.consent ? 'checked' : ''}><span>${C.t('deb.consent')}</span></label>
      <label class="field" style="max-width:280px;margin-bottom:10px"><span>${C.t('deb.intent')}</span><select id="debIntent" ${S.consent ? '' : 'disabled'}><option value="">—</option>
        ${intents.map(c => `<option value="${c}" ${S.intent === c ? 'selected' : ''}>${C.esc(C0nm(c))}</option>`).join('')}
        ${['other', 'blank', 'abstain', 'undecided'].map(k => `<option value="${k}" ${S.intent === k ? 'selected' : ''}>${C.t('deb.intent.' + k)}</option>`).join('')}</select></label>
      <div><button class="btn-main" id="debSend" ${S.sel ? '' : 'disabled'}>${C.t('deb.send')}</button> <span class="note">${S.msg}</span></div>`;
    el.querySelectorAll('.vote-opts button').forEach(b => b.onclick = () => { S.sel = b.dataset.c; drawVote(); });
    el.querySelector('#debConsent').onchange = e => { S.consent = e.target.checked; if (!S.consent) S.intent = ''; drawVote(); };
    el.querySelector('#debIntent').onchange = e => { S.intent = e.target.value; };
    el.querySelector('#debSend').onclick = vote;
  }
  function drawResults() {
    const el = document.getElementById('debRes'); if (!el) return;
    const d = S.key, v = S.data.verdict, tot = Object.values(v).reduce((a, b) => a + b, 0);
    if (!tot) { el.innerHTML = ''; return; }
    const opts = [...d.candidates, 'none'];
    const lbl = k => k === 'none' ? C.t('deb.none') : C.nm(k);
    const intentLbl = k => C.D.cands[k] ? C0nm(k) : C.t('deb.intent.' + k);
    const rows = Object.entries(S.data.byIntent || {});
    el.innerHTML = `<h4 style="margin:0 0 8px">${C.t('deb.results')}</h4>` + opts.map(c => {
      const p = (v[c] || 0) / tot * 100;
      return `<div class="prob"><div class="nm"><i style="background:${c === 'none' ? 'var(--muted)' : C.col(c)}"></i>${C.esc(lbl(c))}</div><div class="track"><i style="width:${p}%;background:${c === 'none' ? 'var(--muted)' : C.col(c)}"></i></div><b class="num">${C.fmt(p, 0)}${C.lang === 'fr' ? ' %' : '%'}</b></div>`;
    }).join('') + (rows.length ? `<h4 style="margin:16px 0 4px">${C.t('deb.byIntent')}</h4><div class="scroll"><table class="tbl seg-table"><thead><tr><th></th>${opts.map(c => `<th class="c">${C.esc(c === 'none' ? C.t('deb.none') : C.sh(c))}</th>`).join('')}<th class="c">n</th></tr></thead><tbody>
      ${rows.map(([k, r]) => { const n = Object.values(r).reduce((a, b) => a + b, 0); return `<tr><td><b>${C.esc(intentLbl(k))}</b></td>${opts.map(c => `<td class="c num">${C.fmt((r[c] || 0) / n * 100, 0)}</td>`).join('')}<td class="c num">${n.toLocaleString(C.lang === 'fr' ? 'fr-FR' : 'en-GB')}</td></tr>`; }).join('')}</tbody></table></div><p class="note">${C.t('deb.byIntentNote')}</p>` : '');
  }
  function liveDebate(D) { const now = Date.now(); return D.debates.find(d => !d.demo && D.site.api && now >= Date.parse(d.start) && now <= Date.parse(d.end)); }
  return { render, liveDebate, redraw: () => { if (S.key) drawCurve(); } };
})();
