/* La Sonde — application. Données : data/site.json (ou window.SITE_DATA pour l'aperçu autonome). */
(async function () {
  'use strict';
  const D = window.SITE_DATA || await fetch('data/site.json', { cache: 'no-cache' }).then(r => r.json());
  const $ = s => document.querySelector(s);
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch { /* stockage indisponible */ } }
  };

  // ---------- Langue, thème, formats ----------
  const qs = new URLSearchParams(location.search);
  const LANGS = { fr: 'fr-FR', en: 'en-GB', de: 'de-DE', es: 'es-ES', it: 'it-IT' };
  const nav0 = (navigator.language || 'fr').slice(0, 2).toLowerCase();
  let lang = qs.get('lang') || store.get('lang') || (LANGS[nav0] ? nav0 : 'en');
  if (!window.I18N[lang] || !LANGS[lang]) lang = 'fr';
  const loc = () => LANGS[lang];
  // Textes des données : { fr, en, de… } → langue courante, sinon anglais, sinon français.
  const tr = o => o == null ? '' : typeof o === 'string' ? o : (o[lang] ?? o.en ?? o.fr ?? '');
  const t = (k, v = {}) => (window.I18N[lang][k] ?? window.I18N.en[k] ?? window.I18N.fr[k] ?? k).replace(/\{(\w+)\}/g, (_, x) => v[x] ?? '');
  const fmt = (x, d = 1) => x == null ? '–' : x.toLocaleString(loc(), { minimumFractionDigits: d, maximumFractionDigits: d });
  const sgn = (x, d = 1) => x == null ? '' : (x > 0 ? '+' : x < 0 ? '−' : '±') + fmt(Math.abs(x), d);
  const fdate = (s, o = { day: 'numeric', month: 'short', year: 'numeric' }) => new Date(s + 'T12:00:00Z').toLocaleDateString(loc(), o);
  const pctOf = () => ['fr', 'de', 'es'].includes(lang) ? ' %' : '%';
  let pct = pctOf();
  const pf = p => (p >= 99.5 ? '>99' : p < 0.5 ? '<1' : fmt(p, 0)) + pct;
  const savedTheme = store.get('theme'); if (savedTheme) document.documentElement.dataset.theme = savedTheme;
  const isDark = () => document.documentElement.dataset.theme === 'dark' || (document.documentElement.dataset.theme !== 'light' && matchMedia('(prefers-color-scheme: dark)').matches);
  const col = c => { const k = D.cands[c]; if (!k) return '#9aa0ad'; return isDark() ? k.colorDark : k.color; };
  const nm = c => (D.cands[c] || { name: c }).name;
  const sh = c => (D.cands[c] || { short: c }).short;
  const DAY = 864e5;
  const daysTo = s => Math.max(0, Math.ceil((Date.parse(s + 'T00:00:00+02:00') - Date.now()) / DAY));
  const css = v => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  // Infobulle partagée
  function tipFor(host) {
    let el = host.querySelector('.tip');
    if (!el) { el = document.createElement('div'); el.className = 'tip'; host.appendChild(el); }
    return {
      show(html, x, y) {
        el.innerHTML = html; el.classList.add('on');
        const w = el.offsetWidth, hw = host.clientWidth;
        el.style.left = Math.max(0, Math.min(hw - w, x + 16 > hw - w ? x - w - 16 : x + 16)) + 'px';
        el.style.top = Math.max(0, y - 20) + 'px';
      },
      hide() { el.classList.remove('on'); }
    };
  }
  // Évite le chevauchement des étiquettes de fin de ligne.
  function declutter(items, minGap, lo, hi) {
    items.sort((a, b) => a.y - b.y);
    for (let i = 1; i < items.length; i++) if (items[i].y - items[i - 1].y < minGap) items[i].y = items[i - 1].y + minGap;
    const over = items.length ? items[items.length - 1].y - hi : 0;
    if (over > 0) { for (const it of items) it.y -= over; for (let i = items.length - 2; i >= 0; i--) if (items[i + 1].y - items[i].y < minGap) items[i].y = items[i + 1].y - minGap; }
    for (const it of items) it.y = Math.max(lo, it.y);
    return items;
  }

  // ---------- Textes statiques ----------
  function renderStatic() {
    document.documentElement.lang = lang;
    document.title = t('meta.title');
    const md = document.querySelector('meta[name="description"]'); if (md) md.setAttribute('content', t('meta.desc'));
    document.querySelectorAll('[data-i18n]').forEach(el => { el.innerHTML = t(el.dataset.i18n); });
    $('#langSel').value = lang;
    const now = Date.now();
    $('#blackout').classList.toggle('on', D.election.blackout.some(b => now >= Date.parse(b.from) && now <= Date.parse(b.to)));
    $('#method').innerHTML = tr(window.METHOD) + `<p class="meta">a = ${fmt(D.mc.sdParams.a, 2)} · b = ${fmt(D.mc.sdParams.b, 3)} · σ₂ = ${fmt(D.mc.sdParams.sd2)} pt</p>` + (D.whatif ? `<p class="meta">${t('wi.posT')}${lang === 'fr' ? ' : ' : ': '}${D.whatif.base.filter(b => D.whatif.pos[b.c] != null).sort((x, y) => D.whatif.pos[x.c] - D.whatif.pos[y.c]).map(b => `${esc(sh(b.c))} ${fmt(D.whatif.pos[b.c])}`).join(' · ')}</p>${D.whatif.calib ? `<p class="meta">${t('wi.calT', { n: D.whatif.calib.n, a: fmt(D.whatif.abst * 100, 0), l: fmt(D.whatif.lambda), s: fmt(D.whatif.alpha, 2) })}</p>` : ''}` : '');
    $('#ftAuthor').textContent = t('ft.author', { a: D.site.author }) + ' ' + t('ft.lcen', { a: D.site.author, c: D.site.contact });
    $('#ftGen').textContent = t('ft.gen', { d: new Date(D.generated).toLocaleString(loc(), { dateStyle: 'long', timeStyle: 'short' }) });
  }

  // ---------- Héros ----------
  function renderHero() {
    $('#countdown').innerHTML = [
      [daysTo(D.election.round1), t('cd.r1')], [daysTo(D.election.round2), t('cd.r2')], [D.counts.surveys, t('cd.polls')]
    ].map(([n, l]) => `<div class="cd"><b class="num">${n}</b><span>${l}</span></div>`).join('');
    const top = D.standings.slice(0, 6), max = Math.max(...top.map(s => s.v)) * 1.08;
    $('#podium').innerHTML = `<h2><span>${t('pod.title')}</span><span>${t('pod.d30')}</span></h2>` + top.map(s => {
      const cls = s.d30 > 0.4 ? 'up' : s.d30 < -0.4 ? 'down' : 'flat', ar = s.d30 > 0.4 ? '▲' : s.d30 < -0.4 ? '▼' : '•';
      return `<div class="prow"><a class="nm" href="${page(s.c)}"><i style="background:${col(s.c)}"></i><span>${esc(nm(s.c))}</span></a>
        <div class="v num">${fmt(s.v, 0)}<small style="font-size:12px">${pct}</small></div><div class="delta ${cls} num">${ar} ${sgn(s.d30)}</div>
        <div class="bar"><i style="width:${s.v / max * 100}%;background:${col(s.c)}"></i></div></div>`;
    }).join('') + (() => {
      const shown = new Set(top.map(s => s.c));
      const rest = D.standings.filter(s => s.declared && !shown.has(s.c));
      if (!rest.length) return '';
      return `<div class="pothers"><h3>${t('pod.others')}</h3><div class="pchips">` + rest.map(s =>
        `<a class="pchip" href="${page(s.c)}" title="${esc(nm(s.c))}"><i style="background:${col(s.c)}"></i>${esc(sh(s.c))} <b class="num">${fmt(s.v, 0)}${pct}</b>${s.presence < 30 ? '<sup>*</sup>' : ''}</a>`).join('') +
        `</div>${rest.some(s => s.presence < 30) ? `<p class="pnote">* ${t('pod.few')}</p>` : ''}<p class="pnote"><a href="#candidats">${t('cf.hint')} →</a></p></div>`;
    })();
    $('#summary').innerHTML = tr(D.summary).map(x => `<li>${esc(x)}</li>`).join('');
    $('#sumMeta').textContent = t('sum.meta', { d: fdate(D.asOf, { day: 'numeric', month: 'long', year: 'numeric' }) });
  }

  // ---------- « Et si… ? » : simulateur de retraits ----------
  const wi = { out: new Set() };
  function whatIf(out) {
    const W = D.whatif;
    const v = Object.fromEntries(W.base.map(b => [b.c, b.v]));
    const meas = Object.fromEntries(W.base.map(b => [b.c, 0])), est = Object.fromEntries(W.base.map(b => [b.c, 0]));
    const alive = () => W.base.map(b => b.c).filter(c => !out.has(c));
    const prox = (x, amount) => {
      // Une part s'abstient (après renormalisation, cela revient à une répartition proportionnelle) ;
      // le reste va surtout aux candidats proches sur l'axe gauche-droite, pondérés par leur poids électoral.
      const A = alive(), px = W.pos[x];
      const tot = A.reduce((a, c) => a + v[c], 0);
      const wts = A.map(c => px == null || W.pos[c] == null ? 0 : Math.pow(v[c], W.alpha ?? 1) * Math.exp(-Math.abs(px - W.pos[c]) / W.lambda));
      const sw = wts.reduce((a, b) => a + b, 0);
      A.forEach((c, i) => {
        const g = amount * (W.abst * v[c] / tot + (1 - W.abst) * (sw ? wts[i] / sw : v[c] / tot));
        v[c] += g; est[c] += g;
      });
    };
    // Retraits dans l'ordre décroissant des scores : les voix déjà reçues suivent en cascade.
    const order = [...out].filter(c => v[c] != null).sort((a, b) => v[b] - v[a]);
    for (const x of order) {
      const amount = v[x]; v[x] = 0;
      const T = (D.transfers || []).find(t => t.c === x);
      if (T) {
        let given = 0;
        for (const f of T.flows) {
          if (f.pts <= 0 || out.has(f.c) || v[f.c] == null) continue;
          const g = amount * f.pts / T.score; v[f.c] += g; meas[f.c] += g; given += g;
        }
        if (amount - given > 0) prox(x, amount - given);
      } else prox(x, amount);
    }
    const A = alive(), tot = A.reduce((a, c) => a + v[c], 0);
    A.forEach(c => { v[c] *= 100 / tot; });
    // Niveau 1 : une liste réellement testée par les instituts, avec les mêmes candidats principaux.
    const major = W.base.filter(b => b.v >= 5).map(b => b.c);
    const keyOf = cs => major.filter(c => cs.includes(c)).sort().join(',');
    const target = keyOf(A);
    const match = out.size ? W.tested.filter(tl => keyOf(tl.cs) === target).sort((a, b) => b.surveys - a.surveys)[0] || null : null;
    const level = {};
    if (match) {
      const inL = A.filter(c => match.set[c] != null), minor = A.filter(c => match.set[c] == null);
      const sMin = minor.reduce((a, c) => a + v[c], 0), sL = inL.reduce((a, c) => a + match.set[c], 0);
      inL.forEach(c => { v[c] = match.set[c] * (100 - sMin) / sL; level[c] = 'poll'; });
    }
    const rows = W.base.filter(b => !out.has(b.c)).map(b => {
      const gain = v[b.c] - b.v, m = meas[b.c], e = est[b.c];
      const lv = Math.abs(gain) < 0.3 ? 'same' : level[b.c] || (m >= e ? 'meas' : 'est');
      const k = lv === 'poll' ? 0.25 : lv === 'meas' ? 0.3 : lv === 'est' ? 0.6 : 0;
      const half = Math.sqrt(b.band ** 2 + (k * Math.max(gain, 0)) ** 2 + (lv === 'poll' ? 0.06 * v[b.c] : 0));
      return { c: b.c, before: b.v, after: v[b.c], lo: Math.max(0, v[b.c] - half), hi: v[b.c] + half, lv };
    }).sort((a, b) => b.after - a.after);
    return { rows, match };
  }
  function renderWhatIf() {
    const W = D.whatif; if (!W || D.features.whatif === false) return;
    const ids = W.base.map(b => b.c);
    const presets = [];
    for (const tr0 of D.transfers || []) if (ids.includes(tr0.c)) presets.push([tr0.c]);
    if (ids.includes('GA') && ids.includes('BR')) presets.push(['GA', 'BR']);
    if (ids.includes('EP') && ids.includes('BR')) presets.push(['EP', 'BR']);
    $('#wiPresets').innerHTML = presets.map(p => `<button class="pill" data-p="${p.join(',')}">${t('wi.preset', { c: p.map(c => esc(sh(c))).join(' + ') })}</button>`).join('') + `<button class="pill" data-p="">${t('wi.reset')}</button>`;
    $('#wiPresets').onclick = e => { const b = e.target.closest('button'); if (!b) return; wi.out = new Set(b.dataset.p ? b.dataset.p.split(',') : []); renderWhatIf(); };
    $('#wiChips').innerHTML = ids.map(c => `<button class="chip wi" aria-pressed="${wi.out.has(c)}" data-c="${c}" style="color:${col(c)}"><i style="background:${col(c)}"></i><span style="color:var(--ink)">${esc(sh(c))}</span></button>`).join('');
    $('#wiChips').onclick = e => { const b = e.target.closest('.chip'); if (!b) return; const c = b.dataset.c; wi.out.has(c) ? wi.out.delete(c) : wi.out.add(c); renderWhatIf(); };
    const { rows, match } = whatIf(wi.out), on = wi.out.size > 0;
    const max = Math.max(...rows.map(r => r.hi), ...W.base.map(b => b.v)) * 1.05;
    const badge = { poll: t('wi.lvPoll'), meas: t('wi.lvMeas'), est: t('wi.lvEst') };
    $('#wiRes').innerHTML = (on ? '' : `<p class="note" style="margin:0 0 10px">${t('wi.pick')}</p>`) + rows.map(r => {
      const d = r.after - r.before, show = on && r.lv !== 'same';
      return `<div class="wirow"><div class="nm"><i style="background:${col(r.c)}"></i>${esc(sh(r.c))}${show ? ` <span class="wib ${r.lv}">${badge[r.lv]}</span>` : ''}</div>
        <div class="wibar"><i class="was" style="width:${r.before / max * 100}%"></i><i class="now" style="width:${r.after / max * 100}%;background:${col(r.c)}"></i>${show ? `<b class="rng" style="left:${r.lo / max * 100}%;width:${(r.hi - r.lo) / max * 100}%"></b>` : ''}</div>
        <div class="wiv num"><b>${fmt(r.after)}${pct}</b>${on && Math.abs(d) >= 0.1 ? `<small class="${d > 0 ? 'up' : 'down'}">${sgn(d)}</small>` : ''}${show ? `<small class="rgt">${fmt(r.lo, 0)}–${fmt(r.hi, 0)}${pct}</small>` : ''}</div></div>`;
    }).join('');
    $('#wiNote').innerHTML = !on ? t('wi.base') : match ? t('wi.noteMatch', { n: match.surveys, d: fdate(match.last) }) : t('wi.noteChain');
  }

  // ---------- Fiches candidats ----------
  function renderFiches() {
    $('#cfiches').innerHTML = D.standings.filter(s => D.cands[s.c] && D.cands[s.c].slug).map(s => {
      const K = D.cands[s.c];
      return `<a class="cfiche" href="${page(s.c)}" style="--c:${col(s.c)}"><span class="cf-nm"><i></i>${esc(K.name)}</span><span class="cf-pt">${esc(K.party || '')}</span><b class="num">${fmt(s.v, 0)}${pct}</b><span class="cf-go">${t('cf.go')} →</span></a>`;
    }).join('');
  }

  // ---------- V2 : ce qui a changé ----------
  const page = c => (D.cands[c] && D.cands[c].slug) ? `candidat/${D.cands[c].slug}/` : '#course';
  const ICON = { up: '▲', down: '▼', flat: '●', poll: '◆', proba: '%', swap: '⇅', transfer: '⇢', ghost: '◷' };
  // Boutons de partage pour les visiteurs : le texte du premier signal + le lien du site.
  function shareRow(txt) {
    const url = (D.site.url || location.origin).replace(/\/$/, '') + '/' + (lang === 'fr' ? '' : '?lang=' + lang);
    const msg = (txt || t('meta.title')).slice(0, 220);
    const enc = encodeURIComponent;
    return `<div class="sharerow"><span>${t('sh.title')}</span>
      <a target="_blank" rel="noopener" href="https://twitter.com/intent/tweet?text=${enc(msg)}&url=${enc(url)}">X</a>
      <a target="_blank" rel="noopener" href="https://bsky.app/intent/compose?text=${enc(msg + ' ' + url)}">Bluesky</a>
      <a target="_blank" rel="noopener" href="https://wa.me/?text=${enc(msg + ' ' + url)}">WhatsApp</a>
      <a target="_blank" rel="noopener" href="https://www.linkedin.com/sharing/share-offsite/?url=${enc(url)}">LinkedIn</a>
      <button type="button" data-u="${esc(url)}" onclick="navigator.clipboard && navigator.clipboard.writeText(this.dataset.u); this.textContent='✓'">${t('sh.copy')}</button>
      <a class="sharelink" href="share/carte-du-jour.png" target="_blank" rel="noopener">↗ ${t('chg.card')}</a></div>`;
  }
  function renderChanges() {
    const it = D.changes ? (D.changes[lang] || D.changes.en || []) : [];
    $('#changes').innerHTML = it.length ? `<h3>${t('chg.title')}</h3><div class="chg-grid">` + it.map(x =>
      `<div class="chg k-${x.k}"><span class="ico" aria-hidden="true">${ICON[x.k] || '•'}</span><p>${esc(x.t)}</p></div>`).join('') + `</div>${shareRow(it[0] && it[0].t)}` : '';
  }

  // ---------- V2 : détecteur de bascule ----------
  const proj = { on: null };
  function renderBascule() {
    const MOM = D.momentum || {};
    const rows = D.standings.filter(s => MOM[s.c]);
    const maxD = Math.max(1.5, ...rows.map(s => Math.abs(MOM[s.c].d14 || 0)));
    $('#momList').innerHTML = rows.map(s => {
      const m = MOM[s.c], st = m.state;
      const conf = st === 'nd' ? t('bas.nd') : st === 'flat' ? t('bas.flat') : t('bas.conf', { p: st === 'up' ? m.pUp : 100 - m.pUp });
      const w = st === 'nd' ? 0 : Math.abs(m.d14) / maxD * 50;
      const bar = st === 'nd' ? '' : `<i class="${m.d14 >= 0 ? 'pos' : 'neg'} ${st === 'flat' ? 'weak' : ''}" style="width:${w}%;${m.d14 >= 0 ? 'left:50%' : `left:${50 - w}%`}"></i>`;
      return `<button class="mrow s-${st}" data-c="${s.c}" aria-pressed="${proj.on ? proj.on.has(s.c) : false}">
        <span class="st" title="${t('bas.st.' + st)}">${ICON[st] || '·'}</span>
        <span class="nm"><i style="background:${col(s.c)}"></i>${esc(sh(s.c))}</span>
        <span class="mbar"><b></b>${bar}</span>
        <span class="d num">${st === 'nd' ? '–' : sgn(m.d14)}</span>
        <span class="cf">${conf}</span></button>`;
    }).join('');
    $('#momList').onclick = e => { const b = e.target.closest('.mrow'); if (!b || !proj.on) return; const c = b.dataset.c; if (!(MOM[c] && MOM[c].proj)) return; proj.on.has(c) ? proj.on.delete(c) : proj.on.add(c); renderBascule(); drawProj(); };
    // Baromètre d'incertitude
    const O = D.openness;
    if (O && D.features.probabilities !== false) {
      const h = (O.hist || []).filter(x => x[1] != null);
      let spark = '';
      if (h.length >= 3) {
        const W = 220, H = 40, xs = i => i / (h.length - 1) * W, ys = v => H - v / 100 * H;
        spark = `<svg class="spark" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true"><path d="${h.map((p, i) => `${i ? 'L' : 'M'}${xs(i).toFixed(1)},${ys(p[1]).toFixed(1)}`).join('')}" fill="none" stroke="currentColor" stroke-width="2"/></svg>`;
      }
      $('#baro').hidden = false;
      $('#baro').innerHTML = `<h3>${t('baro.title')}</h3>
        <div class="baro-n"><b class="num">${O.open}${pct}</b><span>${t(O.open >= 60 ? 'baro.very' : O.open >= 35 ? 'baro.open' : 'baro.closed')}</span></div>
        <div class="gauge"><i style="left:${O.open}%"></i></div><div class="gauge-l"><span>${t('baro.lo')}</span><span>${t('baro.hi')}</span></div>
        <p class="note">${t('baro.desc', { a: esc(nm(O.duo[0])), b: esc(nm(O.duo[1])), p: fmt(O.pDuo, 0) })}</p>${spark}`;
    } else $('#baro').hidden = true;
    // Alertes de bascule
    const X = D.crossings || [];
    $('#alerts').innerHTML = `<h3>${t('alt.title')}</h3>` + (X.length ? X.map(x =>
      `<div class="alert"><div class="pair"><span><i style="background:${col(x.a)}"></i>${esc(sh(x.a))}</span><span class="sw">⇅</span><span><i style="background:${col(x.b)}"></i>${esc(sh(x.b))}</span></div>
       <div class="ameta">${t('alt.rank', { r: x.rank, r2: x.rank + 1 })} · ${t('alt.gap', { g: fmt(x.gap) })}${x.converging ? ' · ' + t('alt.conv') : ''}</div>
       <div class="ap"><b class="num">${x.p}${pct}</b><span>${t('alt.p')}</span></div></div>`).join('') : `<p class="note">${t('alt.none')}</p>`);
  }
  function renderProjChips() {
    const MOM = D.momentum || {};
    const ids = D.standings.filter(s => MOM[s.c] && MOM[s.c].proj).map(s => s.c);
    if (!proj.on) proj.on = new Set(D.standings.filter(s => s.presence >= 30 && MOM[s.c] && MOM[s.c].proj).slice(0, 5).map(s => s.c));
    $('#projChips').innerHTML = ids.map(c => `<button class="chip" aria-pressed="${proj.on.has(c)}" data-c="${c}" style="color:${col(c)}"><i style="background:${col(c)}"></i><span style="color:var(--ink)">${esc(sh(c))}</span></button>`).join('');
    $('#projChips').onclick = e => { const b = e.target.closest('.chip'); if (!b) return; const c = b.dataset.c; proj.on.has(c) ? proj.on.delete(c) : proj.on.add(c); renderProjChips(); renderBascule(); drawProj(); };
  }
  function drawProj() {
    const host = $('#projChart'); if (!host || D.features.projection === false) return;
    host.querySelectorAll('svg').forEach(n => n.remove());
    renderProjChips();
    const MOM = D.momentum || {};
    const W = host.clientWidth, mobile = W < 600, H = mobile ? 300 : 360;
    const m = { t: 14, r: mobile ? 100 : 120, b: 40, l: 34 };
    const last = new Date(D.days[D.days.length - 1] + 'T12:00:00Z');
    const x0 = new Date(+last - 75 * DAY), x1 = new Date(+last + 30 * DAY);
    const days = D.days.map(d => new Date(d + 'T12:00:00Z'));
    const vis = D.standings.map(s => s.c).filter(c => proj.on.has(c) && MOM[c] && MOM[c].proj && D.series[c]);
    let ymax = 5, ymin = 100;
    for (const c of vis) {
      D.series[c].v.forEach((v, i) => { if (v != null && days[i] >= x0) { ymax = Math.max(ymax, v); ymin = Math.min(ymin, v); } });
      MOM[c].proj.forEach(p => { ymax = Math.max(ymax, p.hi); ymin = Math.min(ymin, p.lo); });
    }
    if (!vis.length) ymin = 0;
    const x = d3.scaleTime().domain([x0, x1]).range([m.l, W - m.r]);
    const y = d3.scaleLinear().domain([Math.max(0, Math.floor((ymin - 1) / 5) * 5), Math.ceil((ymax + 1) / 5) * 5]).range([H - m.b, m.t]);
    const svg = d3.select(host).append('svg').attr('viewBox', `0 0 ${W} ${H}`).attr('role', 'img').attr('aria-label', t('bas.proj'));
    svg.append('g').attr('class', 'gridl').attr('transform', `translate(${m.l},0)`).call(d3.axisLeft(y).ticks(5).tickSize(-(W - m.l - m.r)).tickFormat(''));
    svg.append('g').attr('class', 'axis').attr('transform', `translate(0,${H - m.b})`).call(d3.axisBottom(x).ticks(mobile ? 3 : 6).tickSizeOuter(0)
      .tickFormat(d => d.toLocaleDateString(loc(), { day: 'numeric', month: 'short' })));
    svg.append('g').attr('class', 'axis').attr('transform', `translate(${m.l},0)`).call(d3.axisLeft(y).ticks(5).tickSize(0).tickFormat(d => d + (pct === '%' ? '%' : ''))).select('.domain').remove();
    // Zone « futur »
    svg.append('rect').attr('x', x(last)).attr('y', m.t).attr('width', x(x1) - x(last)).attr('height', H - m.b - m.t).attr('fill', css('--surface-2')).attr('opacity', .55);
    svg.append('line').attr('x1', x(last)).attr('x2', x(last)).attr('y1', m.t).attr('y2', H - m.b).attr('stroke', css('--ink-2')).attr('stroke-dasharray', '3 3');
    svg.append('text').attr('class', 'lbl').attr('x', x(last) + 6).attr('y', m.t + 12).attr('fill', css('--muted')).style('font-size', '11px').text(t('bas.future'));
    const g = svg.append('g');
    const ends = [];
    for (const c of vis) {
      const S = D.series[c], pts = days.map((d, i) => ({ d, v: S.v[i] })).filter(p => p.d >= x0 && p.v != null);
      const P = MOM[c].proj.map(p => ({ d: new Date(+last + p.k * DAY), ...p }));
      g.append('path').datum(P).attr('fill', col(c)).attr('opacity', .13)
        .attr('d', d3.area().x(p => x(p.d)).y0(p => y(p.lo)).y1(p => y(p.hi)).curve(d3.curveMonotoneX));
      g.append('path').datum(pts).attr('fill', 'none').attr('stroke', col(c)).attr('stroke-width', 2.25)
        .attr('d', d3.line().x(p => x(p.d)).y(p => y(p.v)).curve(d3.curveMonotoneX));
      g.append('path').datum(P).attr('fill', 'none').attr('stroke', col(c)).attr('stroke-width', 2).attr('stroke-dasharray', '5 4')
        .attr('d', d3.line().x(p => x(p.d)).y(p => y(p.v)).curve(d3.curveMonotoneX));
      ends.push({ c, v: P[P.length - 1].v, y: y(P[P.length - 1].v) });
    }
    const li = declutter(ends, 15, m.t + 6, H - m.b);
    li.forEach(l => {
      svg.append('text').attr('class', 'lbl v').attr('x', x(x1) + 8).attr('y', l.y + 4).text(fmt(l.v));
      svg.append('text').attr('class', 'lbl').attr('x', x(x1) + (mobile ? 40 : 44)).attr('y', l.y + 4).text(sh(l.c));
    });
  }

  // ---------- V2 : le dernier sondage décrypté ----------
  function renderDecoded() {
    const X = D.decoded, el = $('#decoded'); if (!X) { el.hidden = true; return; }
    const verdict = !X.sameList ? t('dec.newList') : X.outlier ? t('dec.out', { c: esc(nm(X.outlier.c)), d: sgn(X.outlier.diff), dir: t(X.outlier.diff > 0 ? 'dec.above' : 'dec.below') }) : t('dec.ok');
    el.innerHTML = `<div class="dec-head"><div><div class="tag" style="margin:0 0 6px">${t('dec.tag')}</div><h3 style="margin:0">${esc(X.inst)} <span class="note" style="margin:0;font-weight:600">${t('dec.for')} ${esc(X.sponsor)}</span></h3>
      <p class="note" style="margin:4px 0 0">${t('dec.meta', { d: fdate(X.end), n: X.n.toLocaleString(loc()), h: X.hyps })}</p></div>
      <div class="verdict ${X.outlier ? 'warn' : 'ok'}">${verdict}</div></div>
      <div class="scroll"><table class="tbl"><thead><tr><th>${t('tab.cand')}</th><th class="c">${t('dec.raw')}</th><th class="c">${t('dec.he')}</th><th class="c">${t('dec.corr')}</th><th class="c">${t(X.sameList ? 'dec.avgList' : 'dec.avg')}</th><th class="c">${t('dec.diff')}</th></tr></thead><tbody>`
      + X.rows.map(r => `<tr><td><span style="display:inline-flex;gap:8px;align-items:center"><i style="width:10px;height:10px;border-radius:50%;background:${col(r.c)};display:inline-block"></i><b>${esc(sh(r.c))}</b></span></td>
        <td class="c num">${fmt(r.raw, 0)}</td><td class="c num">${r.he ? sgn(r.he) : '0'}</td><td class="c num"><b>${fmt(r.corr)}</b></td><td class="c num">${fmt(r.avg)}</td>
        <td class="c num"><span class="dpill ${Math.abs(r.diff) > 1.5 ? (r.diff > 0 ? 'hi' : 'lo') : ''}">${sgn(r.diff)}</span></td></tr>`).join('')
      + `</tbody></table></div><p class="note">${t('dec.note')}</p>`;
  }

  // ---------- La course ----------
  const race = { range: store.get('range') || '6m', on: null, dots: true, ev: true };
  function renderRaceControls() {
    const seg = $('#rangeSeg');
    seg.innerHTML = ['3m', '6m', '1y', 'all'].map(r => `<button aria-pressed="${race.range === r}" data-r="${r}">${t('range.' + r)}</button>`).join('');
    seg.onclick = e => { const b = e.target.closest('button'); if (!b) return; race.range = b.dataset.r; store.set('range', race.range); renderRaceControls(); drawRace(); };
    if (!race.on) race.on = new Set(D.standings.filter(s => s.presence >= 30).slice(0, 8).map(s => s.c));
    const ids = D.standings.map(s => s.c);
    $('#chips').innerHTML = ids.map(c => `<button class="chip" aria-pressed="${race.on.has(c)}" data-c="${c}" style="color:${col(c)}"><i style="background:${col(c)}"></i><span style="color:var(--ink)">${esc(sh(c))}</span></button>`).join('');
    $('#chips').onclick = e => { const b = e.target.closest('.chip'); if (!b) return; const c = b.dataset.c; race.on.has(c) ? race.on.delete(c) : race.on.add(c); renderRaceControls(); drawRace(); };
    $('#dotsTgl').onchange = e => { race.dots = e.target.checked; drawRace(); };
    $('#evTgl').onchange = e => { race.ev = e.target.checked; drawRace(); };
  }
  function drawRace() {
    const host = $('#raceChart'); host.querySelectorAll('svg').forEach(n => n.remove());
    const W = host.clientWidth, mobile = W < 600, H = mobile ? 360 : 440;
    const m = { t: 12, r: mobile ? 92 : 128, b: 46, l: 34 };
    const last = new Date(D.days[D.days.length - 1] + 'T12:00:00Z');
    const span = { '3m': 92, '6m': 183, '1y': 366, all: 4000 }[race.range];
    const x0 = new Date(Math.max(Date.parse(D.days[0] + 'T12:00:00Z'), last - span * DAY));
    const days = D.days.map(d => new Date(d + 'T12:00:00Z'));
    const vis = D.standings.map(s => s.c).filter(c => race.on.has(c) && D.series[c]);
    let ymax = 10;
    for (const c of vis) D.series[c].v.forEach((v, i) => { if (v != null && days[i] >= x0) ymax = Math.max(ymax, v + (D.series[c].b[i] || 0)); });
    const x = d3.scaleTime().domain([x0, last]).range([m.l, W - m.r]);
    const y = d3.scaleLinear().domain([0, Math.ceil((ymax + 2) / 5) * 5]).range([H - m.b, m.t]);
    const svg = d3.select(host).append('svg').attr('viewBox', `0 0 ${W} ${H}`).attr('role', 'img').attr('aria-label', t('race.title'));
    svg.append('g').attr('class', 'gridl').attr('transform', `translate(${m.l},0)`).call(d3.axisLeft(y).ticks(6).tickSize(-(W - m.l - m.r)).tickFormat(''));
    svg.append('g').attr('class', 'axis').attr('transform', `translate(0,${H - m.b})`).call(d3.axisBottom(x).ticks(mobile ? 4 : 7).tickSizeOuter(0)
      .tickFormat(d => d.toLocaleDateString(loc(), { month: 'short', year: span > 200 ? '2-digit' : undefined })));
    svg.append('g').attr('class', 'axis').attr('transform', `translate(${m.l},0)`).call(d3.axisLeft(y).ticks(6).tickSize(0).tickFormat(d => d + (pct === '%' ? '%' : ''))).select('.domain').remove();
    const clip = 'clip' + Math.random().toString(36).slice(2);
    svg.append('clipPath').attr('id', clip).append('rect').attr('x', m.l).attr('y', 0).attr('width', W - m.l - m.r).attr('height', H);
    const g = svg.append('g').attr('clip-path', `url(#${clip})`);
    // Événements
    if (race.ev) {
      const evs = D.events.filter(e => new Date(e.date + 'T12:00:00Z') >= x0 && (!e.c || vis.includes(e.c) || e.major));
      const eg = svg.append('g');
      evs.forEach(e => {
        const ex = x(new Date(e.date + 'T12:00:00Z'));
        eg.append('line').attr('x1', ex).attr('x2', ex).attr('y1', m.t).attr('y2', H - m.b).attr('stroke', css('--line')).attr('stroke-dasharray', '2 4');
        eg.append('path').attr('d', d3.symbol(d3.symbolDiamond, 64)()).attr('transform', `translate(${ex},${H - m.b - 8})`)
          .attr('fill', e.c ? col(e.c) : css('--ink')).attr('stroke', css('--surface')).attr('stroke-width', 2).style('cursor', 'pointer')
          .on('pointerenter', ev => tip.show(`<h4>${fdate(e.date)}</h4>${esc(tr(e))}`, ex, H - m.b - 70)).on('pointerleave', () => tip.hide());
      });
    }
    // Points de sondage
    if (race.dots) for (const c of vis) {
      g.append('g').selectAll('circle').data((D.points[c] || []).filter(p => new Date(p[0] + 'T12:00:00Z') >= x0)).join('circle')
        .attr('cx', p => x(new Date(p[0] + 'T12:00:00Z'))).attr('cy', p => y(p[1])).attr('r', 2.6)
        .attr('fill', col(c)).attr('opacity', .28);
    }
    // Bandes et lignes
    for (const c of vis) {
      const S = D.series[c], pts = days.map((d, i) => ({ d, v: S.v[i], b: S.b[i] })).filter(p => p.d >= x0 - 3 * DAY);
      g.append('path').datum(pts).attr('fill', col(c)).attr('opacity', .14)
        .attr('d', d3.area().defined(p => p.v != null).x(p => x(p.d)).y0(p => y(p.v - p.b)).y1(p => y(p.v + p.b)).curve(d3.curveMonotoneX));
      g.append('path').datum(pts).attr('fill', 'none').attr('stroke', col(c)).attr('stroke-width', 2.25).attr('stroke-linejoin', 'round').attr('stroke-linecap', 'round')
        .attr('d', d3.line().defined(p => p.v != null).x(p => x(p.d)).y(p => y(p.v)).curve(d3.curveMonotoneX));
    }
    // Étiquettes de fin de ligne
    // Étiquette au dernier point disponible (un candidat peu testé peut s'arrêter avant la fin).
    const li = declutter(vis.map(c => { let i = days.length - 1; while (i >= 0 && D.series[c].v[i] == null) i--; if (i < 0 || days[i] < x0) return null; const v = D.series[c].v[i]; return { c, v, y: y(v), i }; }).filter(Boolean), 15, m.t + 6, H - m.b);
    const lg = svg.append('g');
    li.forEach(l => {
      lg.append('circle').attr('cx', x(days[l.i])).attr('cy', y(l.v)).attr('r', 4).attr('fill', col(l.c)).attr('stroke', css('--surface')).attr('stroke-width', 2);
      lg.append('text').attr('class', 'lbl v').attr('x', x(last) + 9).attr('y', l.y + 4).text(fmt(l.v));
      lg.append('text').attr('class', 'lbl').attr('x', x(last) + (mobile ? 40 : 44)).attr('y', l.y + 4).text(sh(l.c));
    });
    // Survol : réticule + infobulle
    const tip = tipFor(host);
    const cross = svg.append('line').attr('stroke', css('--ink-2')).attr('stroke-width', 1).attr('y1', m.t).attr('y2', H - m.b).attr('opacity', 0);
    const hov = svg.append('g');
    svg.append('rect').attr('x', m.l).attr('y', m.t).attr('width', W - m.l - m.r).attr('height', H - m.t - m.b - 18).attr('fill', 'transparent')
      .on('pointermove', ev => {
        const [px] = d3.pointer(ev); const dt = x.invert(px);
        const i = Math.max(0, Math.min(days.length - 1, d3.bisectCenter(days.map(d => +d), +dt)));
        const cx = x(days[i]); cross.attr('x1', cx).attr('x2', cx).attr('opacity', .5);
        const rows = vis.map(c => ({ c, v: D.series[c].v[i] })).filter(r => r.v != null).sort((a, b) => b.v - a.v);
        hov.selectAll('circle').data(rows).join('circle').attr('cx', cx).attr('cy', r => y(r.v)).attr('r', 4.5).attr('fill', r => col(r.c)).attr('stroke', css('--surface')).attr('stroke-width', 2);
        tip.show(`<h4>${fdate(D.days[i])}</h4>` + rows.map(r => `<div class="r"><span><i style="background:${col(r.c)}"></i>${esc(sh(r.c))}</span><b class="num">${fmt(r.v)}${pct}</b></div>`).join(''), cx, d3.pointer(ev)[1]);
      })
      .on('pointerleave', () => { tip.hide(); cross.attr('opacity', 0); hov.selectAll('*').remove(); });
  }

  function renderTable() {
    $('#allTable').innerHTML = `<table class="tbl"><thead><tr><th>${t('tab.cand')}</th><th class="c">${t('tab.avg')}</th><th class="c">${t('tab.d30')}</th><th class="c">${t('tab.pres')}</th><th class="c">${t('tab.last')}</th></tr></thead><tbody>`
      + D.standings.map(s => `<tr><td><span style="display:inline-flex;gap:8px;align-items:center"><i style="width:10px;height:10px;border-radius:50%;background:${col(s.c)};display:inline-block"></i><a class="clink" href="${page(s.c)}"><b>${esc(nm(s.c))}</b></a></span> <span class="note" style="margin:0">${esc((D.cands[s.c] || {}).party || '')}</span>${s.presence < 30 ? ` <span class="badge">${t('tab.low')}</span>` : ''}</td>
        <td class="c num"><b>${fmt(s.v)}${pct}</b></td><td class="c num">${s.d30 == null ? '–' : sgn(s.d30)}</td><td class="c num">${fmt(s.presence, 0)}${pct}</td><td class="c">${s.lastTest ? fdate(s.lastTest, { day: 'numeric', month: 'short' }) : '–'}</td></tr>`).join('')
      + `</tbody></table><p class="note">${t('tab.note')}</p>`;
  }

  // ---------- Probabilités ----------
  let scen = -1;
  function renderProba() {
    const S = D.scenarios;
    const label = s => {
      if (s.label) return tr(s.label);
      const w = s.with.map(sh).join(' + '), wo = s.without.map(sh).join(', ');
      return [w && `${t('proba.with')} ${w}`, wo && `${t('proba.without')} ${wo}`].filter(Boolean).join(' · ');
    };
    $('#scenSeg').innerHTML = `<button aria-pressed="${scen === -1}" data-i="-1">${t('proba.all')}</button>` + S.map((s, i) => `<button aria-pressed="${scen === i}" data-i="${i}">${esc(label(s))}</button>`).join('');
    $('#scenSeg').style.flexWrap = 'wrap';
    $('#scenSeg').onclick = e => { const b = e.target.closest('button'); if (!b) return; scen = +b.dataset.i; renderProba(); };
    const mc = scen === -1 ? D.mc : S[scen].mc;
    $('#scenDesc').textContent = scen === -1 ? t('proba.synth') : S[scen].model ? t('proba.allDesc', { c: (S[scen].added || []).map(nm).join(', ') }) : t('proba.scen', { n: S[scen].surveys, d: fdate(S[scen].last) });
    const bars = (list, n) => list.slice(0, n).map(q => `<div class="prob"><div class="nm"><i style="background:${col(q.c)}"></i>${esc(sh(q.c))}</div>
      <div class="track"><i style="width:${q.p}%;background:${col(q.c)}"></i></div><b class="num">${pf(q.p)}</b></div>`).join('');
    $('#qualif').innerHTML = bars(mc.qualify.filter(q => q.p >= 0.1), 8);
    $('#winp').innerHTML = bars(mc.win, 5) + `<p class="note">${t('proba.cov', { p: fmt(100 - mc.coverage, 0) })}</p>`;
    const duels = (scen === -1 ? S[0].mc : mc).duels;
    $('#duelp').innerHTML = duels.slice(0, 4).map(d => `<div class="duel"><span><b>${esc(sh(d.a))}</b> – <b>${esc(sh(d.b))}</b></span><b class="num">${fmt(d.p, 0)}${pct}</b>
      ${d.pa != null ? `<div class="split"><i style="flex:${d.pa};background:${col(d.a)}"></i><i style="flex:${100 - d.pa};background:${col(d.b)}"></i></div><small class="note" style="grid-column:1/-1;margin:0">${esc(sh(d.a))} ${pf(d.pa)} · ${esc(sh(d.b))} ${pf(100 - d.pa)}</small>` : ''}</div>`).join('');
  }

  // ---------- Fantômes 2022 ----------
  // Candidats affichés : les 6 premiers + tout candidat déclaré à 3 % ou plus ; les autres en un clic.
  const ghost = { on: null };
  function renderGhostChips() {
    if (!ghost.on) ghost.on = new Set(D.standings.filter((s, i) => (i < 6 || (s.declared && s.v >= 3)) && D.series[s.c]).map(s => s.c));
    const ids = D.standings.map(s => s.c).filter(c => D.series[c]);
    $('#ghostChips').innerHTML = ids.map(c => `<button class="chip" aria-pressed="${ghost.on.has(c)}" data-c="${c}" style="color:${col(c)}"><i style="background:${col(c)}"></i><span style="color:var(--ink)">${esc(sh(c))}</span></button>`).join('');
    $('#ghostChips').onclick = e => { const b = e.target.closest('.chip'); if (!b) return; const c = b.dataset.c; ghost.on.has(c) ? ghost.on.delete(c) : ghost.on.add(c); drawGhosts(); };
  }
  function drawGhosts() {
    const host = $('#ghostChart'); host.querySelectorAll('svg').forEach(n => n.remove());
    const W = host.clientWidth, mobile = W < 600, H = mobile ? 420 : 420, m = { t: 14, r: mobile ? 86 : 150, b: 44, l: 28 };
    const G = D.ghosts, R1 = Date.parse(D.election.round1 + 'T12:00:00Z');
    const dNow = Math.round((R1 - Date.parse(D.days[D.days.length - 1] + 'T12:00:00Z')) / DAY);
    const x = d3.scaleLinear().domain([420, 0]).range([m.l, W - m.r]);
    const y = d3.scaleLinear().domain([0, 40]).range([H - m.b, m.t]);
    const svg = d3.select(host).append('svg').attr('viewBox', `0 0 ${W} ${H}`).attr('role', 'img').attr('aria-label', t('ghost.title'));
    svg.append('g').attr('class', 'gridl').attr('transform', `translate(${m.l},0)`).call(d3.axisLeft(y).ticks(5).tickSize(-(W - m.l - m.r)).tickFormat(''));
    svg.append('g').attr('class', 'axis').attr('transform', `translate(0,${H - m.b})`).call(d3.axisBottom(x).ticks(mobile ? 4 : 8).tickFormat(d => d === 0 ? t('gh.vote') : t('gh.dm', { d })));
    svg.append('g').attr('class', 'axis').attr('transform', `translate(${m.l},0)`).call(d3.axisLeft(y).ticks(5).tickSize(0)).select('.domain').remove();
    svg.append('text').attr('class', 'axis').attr('x', W - m.r).attr('y', H - 6).attr('text-anchor', 'end').attr('fill', css('--muted')).attr('font-size', 12).text(t('ghost.days'));
    // Aujourd'hui
    svg.append('line').attr('x1', x(dNow)).attr('x2', x(dNow)).attr('y1', m.t).attr('y2', H - m.b).attr('stroke', css('--accent')).attr('stroke-width', 1.5).attr('stroke-dasharray', '4 3');
    svg.append('text').attr('class', 'lbl').attr('x', x(dNow) + 6).attr('y', m.t + 12).attr('fill', css('--accent')).text(t('gh.last', { d: dNow }));
    const line = d3.line().defined(p => p[1] != null).x(p => x(p[0])).y(p => y(p[1])).curve(d3.curveMonotoneX);
    const tip = tipFor(host);
    // 2022 (pointillés)
    const labels22 = [];
    for (const [name, s] of Object.entries(G.series)) {
      svg.append('path').datum(G.daysBack.map((d, i) => [d, s.v[i]])).attr('fill', 'none').attr('stroke', s.color).attr('stroke-width', 1.75).attr('stroke-dasharray', '5 4').attr('opacity', .8).attr('d', line);
      svg.append('circle').attr('cx', x(0)).attr('cy', y(s.result)).attr('r', 5).attr('fill', s.color).attr('stroke', css('--surface')).attr('stroke-width', 2);
      labels22.push({ name, v: s.result, y: y(s.result) });
    }
    declutter(labels22, 14, m.t + 6, H - m.b).forEach(l => svg.append('text').attr('class', 'lbl').attr('x', x(0) + 10).attr('y', l.y + 4).text(mobile ? `${l.name} ${fmt(l.v)}` : `${l.name} ${fmt(l.v)} (2022)`));
    // 2027 (traits pleins)
    renderGhostChips();
    const top = D.standings.map(s => s.c).filter(c => ghost.on.has(c) && D.series[c]);
    const lab27 = [];
    for (const c of top) {
      const pts = D.days.map((d, i) => [Math.round((R1 - Date.parse(d + 'T12:00:00Z')) / DAY), D.series[c].v[i]]).filter(p => p[0] <= 420 && p[0] >= 0);
      svg.append('path').datum(pts).attr('fill', 'none').attr('stroke', col(c)).attr('stroke-width', 2.75).attr('stroke-linecap', 'round').attr('d', line);
      const lp = [...pts].reverse().find(p => p[1] != null); if (lp && lp[1] != null) lab27.push({ c, v: lp[1], y: y(lp[1]) });
    }
    declutter(lab27, 14, m.t + 20, H - m.b).forEach(l => svg.append('text').attr('class', 'lbl v').attr('x', x(dNow) - 8).attr('y', l.y + 4).attr('text-anchor', 'end').text(sh(l.c)));
    // Survol
    const cross = svg.append('line').attr('stroke', css('--ink-2')).attr('y1', m.t).attr('y2', H - m.b).attr('opacity', 0);
    svg.append('rect').attr('x', m.l).attr('y', m.t).attr('width', W - m.l - m.r).attr('height', H - m.t - m.b).attr('fill', 'transparent')
      .on('pointermove', ev => {
        const [px, py] = d3.pointer(ev); const d = Math.round(x.invert(px) / 2) * 2; const gi = G.daysBack.indexOf(d);
        cross.attr('x1', x(d)).attr('x2', x(d)).attr('opacity', .4);
        const di = D.days.findIndex(s => Math.round((R1 - Date.parse(s + 'T12:00:00Z')) / DAY) <= d);
        let html = `<h4>J-${d}</h4>`;
        if (di >= 0 && d >= dNow) html += top.map(c => ({ c, v: D.series[c].v[di] })).filter(r => r.v != null).sort((a, b) => b.v - a.v)
          .map(r => `<div class="r"><span><i style="background:${col(r.c)}"></i>${esc(sh(r.c))} 2027</span><b class="num">${fmt(r.v)}${pct}</b></div>`).join('');
        if (gi >= 0) html += Object.entries(G.series).map(([n, s]) => ({ n, v: s.v[gi], c: s.color })).filter(r => r.v != null).sort((a, b) => b.v - a.v)
          .map(r => `<div class="r" style="opacity:.8"><span><i style="background:${r.c}"></i>${esc(r.n)} 2022</span><b class="num">${fmt(r.v)}${pct}</b></div>`).join('');
        tip.show(html, x(d), py);
      }).on('pointerleave', () => { tip.hide(); cross.attr('opacity', 0); });
    const gi = G.daysBack.indexOf(Math.round(dNow / 2) * 2);
    const list = gi >= 0 ? Object.entries(G.series).filter(([, s]) => s.v[gi] != null).sort((a, b) => b[1].v[gi] - a[1].v[gi]).slice(0, 5).map(([n, s]) => `${n} ${fmt(s.v[gi])}${pct}`).join(', ') : '';
    $('#ghostNote').textContent = t('ghost.note', { d: dNow, list });
  }

  // ---------- Reports ----------
  function renderTransfers() {
    $('#transfers').innerHTML = D.transfers.slice(0, 5).map(T => {
      const pos = T.flows.filter(f => f.pts > 0), tot = T.score;
      const segs = pos.map(f => `<i style="flex:${f.pts};background:${col(f.c)}" title="${esc(nm(f.c))} ${fmt(f.pts)} pt">${f.pts / tot > .09 ? esc(sh(f.c)) + ' ' + f.pct + pct : ''}</i>`).join('')
        + (T.unassigned > 0.2 ? `<i class="rest" style="flex:${T.unassigned}" title="${t('tr.rest')}">${T.unassigned / tot > .12 ? t('tr.rest') : ''}</i>` : '');
      const legend = pos.slice(0, 6).map(f => `<span><i style="background:${col(f.c)}"></i>${esc(sh(f.c))} <b class="num">${sgn(f.pts)} pt</b></span>`).join('');
      return `<div class="flow"><h4><span>${t('tr.when', { x: esc(nm(T.c)), s: fmt(T.score) })}</span><small>${t('tr.pairs', { n: T.pairs, s: T.surveys })}</small></h4>
        <div class="stack">${segs}</div><div class="mini" style="margin-top:8px">${legend}</div></div>`;
    }).join('') || '<p class="note">–</p>';
  }

  // ---------- Second tour ----------
  function renderDuels() {
    $('#duels').innerHTML = D.duels.map(d => `<div class="duel"><span><b>${esc(nm(d.a))}</b> – <b>${esc(nm(d.b))}</b></span><small class="note" style="margin:0">${t('r2.n', { n: d.n, d: fdate(d.last) })}</small>
      <div class="split" style="height:30px;border-radius:8px"><i style="flex:${d.va};background:${col(d.a)};color:#fff;font-weight:800;display:flex;align-items:center;padding-left:10px">${fmt(d.va)}</i><i style="flex:${d.vb};background:${col(d.b)};color:#fff;font-weight:800;display:flex;align-items:center;justify-content:flex-end;padding-right:10px">${fmt(d.vb)}</i></div></div>`).join('');
  }
  const sim = { a: null, b: null, rates: {} };
  function renderSim(resetRates) {
    const set = D.scenarios[0].set.map(x => x.c);
    if (!sim.a) { sim.a = set[0]; sim.b = set[1]; }
    const opts = sel => set.map(c => `<option value="${c}" ${c === sel ? 'selected' : ''}>${esc(nm(c))}</option>`).join('');
    $('#simA').innerHTML = opts(sim.a); $('#simB').innerHTML = opts(sim.b);
    $('#simA').onchange = e => { sim.a = e.target.value; if (sim.a === sim.b) sim.b = set.find(c => c !== sim.a); renderSim(); };
    $('#simB').onchange = e => { sim.b = e.target.value; if (sim.a === sim.b) sim.a = set.find(c => c !== sim.b); renderSim(); };
    $('#simReset').onclick = () => { sim.rates = {}; renderSim(); };
    const others = set.filter(c => c !== sim.a && c !== sim.b);
    for (const c of others) if (!sim.rates[c] || resetRates) sim.rates[c] = sim.rates[c] || { a: 33, b: 33 };
    $('#simRows').innerHTML = others.map(c => `<div class="sim-row" data-c="${c}"><span class="nm" style="display:flex;gap:8px;align-items:center"><i style="width:10px;height:10px;border-radius:50%;background:${col(c)}"></i>${esc(sh(c))}</span>
      <label>${t('r2.to', { c: esc(sh(sim.a)) })} <b class="num" data-o="a">${sim.rates[c].a}${pct}</b><input type="range" min="0" max="100" value="${sim.rates[c].a}" data-k="a"></label>
      <label>${t('r2.to', { c: esc(sh(sim.b)) })} <b class="num" data-o="b">${sim.rates[c].b}${pct}</b><input type="range" min="0" max="100" value="${sim.rates[c].b}" data-k="b"></label></div>`).join('');
    $('#simRows').oninput = e => {
      const row = e.target.closest('.sim-row'); if (!row) return; const c = row.dataset.c, k = e.target.dataset.k, o = k === 'a' ? 'b' : 'a';
      sim.rates[c][k] = +e.target.value;
      if (sim.rates[c].a + sim.rates[c].b > 100) { sim.rates[c][o] = 100 - sim.rates[c][k]; row.querySelector(`[data-k="${o}"]`).value = sim.rates[c][o]; }
      row.querySelector('[data-o="a"]').textContent = sim.rates[c].a + pct; row.querySelector('[data-o="b"]').textContent = sim.rates[c].b + pct;
      simResult(others);
    };
    simResult(others);
  }
  function simResult(others) {
    const sh1 = Object.fromEntries(D.scenarios[0].set.map(x => [x.c, x.share]));
    let A = sh1[sim.a], B = sh1[sim.b];
    for (const c of others) { A += sh1[c] * sim.rates[c].a / 100; B += sh1[c] * sim.rates[c].b / 100; }
    const pa = A / (A + B) * 100;
    $('#simRes').innerHTML = `<i style="flex-basis:${pa}%;background:${col(sim.a)}">${esc(sh(sim.a))} ${fmt(pa)}</i><i style="flex-basis:${100 - pa}%;background:${col(sim.b)}">${fmt(100 - pa)} ${esc(sh(sim.b))}</i>`;
    const [x, y] = [sim.a, sim.b].sort(); const d = D.duels.find(z => z.a === x && z.b === y);
    $('#simCmp').textContent = d ? t('r2.cmp', { a: fmt(x === sim.a ? d.va : d.vb), b: fmt(x === sim.a ? d.vb : d.va), n: d.n }) : t('r2.nocmp');
  }

  // ---------- Test de l'écart ----------
  function renderGap() {
    const ids = D.standings.map(s => s.c);
    const a0 = $('#gapA').value || ids[1], b0 = $('#gapB').value || ids[2];
    const opts = sel => ids.map(c => `<option value="${c}" ${c === sel ? 'selected' : ''}>${esc(nm(c))}</option>`).join('');
    $('#gapA').innerHTML = opts(a0); $('#gapB').innerHTML = opts(b0);
    const upd = () => {
      const A = D.standings.find(s => s.c === $('#gapA').value), B = D.standings.find(s => s.c === $('#gapB').value), n = +$('#gapN').value;
      $('#gapNv').textContent = n.toLocaleString(loc());
      const p1 = A.v / 100, p2 = B.v / 100, gap = Math.abs(A.v - B.v);
      const v = p1 + p2 - (p1 - p2) ** 2, moe = 196 * Math.sqrt(v / n), ok = gap > moe;
      const need = gap > 0 ? Math.ceil(1.96 ** 2 * v / (gap / 100) ** 2 / 100) * 100 : null;
      $('#gapOut').innerHTML = `<div class="big num">${fmt(A.v)} <small style="font-size:18px">vs</small> ${fmt(B.v)}</div>
        <p style="margin:6px 0 0">${t('gap.res', { g: fmt(gap), m: fmt(moe) })}</p>
        <span class="verdict ${ok ? 'yes' : 'no'}">${ok ? '✓ ' + t('gap.yes') : '≈ ' + t('gap.no')}</span>
        ${!ok && need ? `<p class="note">${t('gap.need', { n: need.toLocaleString(loc()) })}</p>` : ''}<p class="note">${t('gap.note')}</p>`;
    };
    $('#gapA').onchange = upd; $('#gapB').onchange = upd; $('#gapN').oninput = upd; upd();
  }

  // ---------- Préoccupations ----------
  function renderConcerns() {
    const C = D.concerns, S = C.series[0], th = C.themes;
    const waves = S.waves.slice().sort((a, b) => a.date.localeCompare(b.date)), first = waves[0], last = waves[waves.length - 1];
    $('#baroDesc').innerHTML = `${esc(S.institute)} · ${esc(S.sponsor)} · ${esc(tr(S.question))}`;
    const keys = [...new Set(waves.flatMap(w => Object.keys(w.values)))].sort((a, b) => (last.values[b] ?? -1) - (last.values[a] ?? -1));
    const host = $('#concernChart'); host.querySelectorAll('svg').forEach(n => n.remove());
    const W = host.clientWidth, narrow = W < 500, rowH = narrow ? 54 : 40, m = { t: 34, r: 40, b: 10, l: narrow ? 8 : 170 }, H = m.t + keys.length * rowH + m.b;
    const x = d3.scaleLinear().domain([0, 70]).range([m.l, W - m.r]);
    const svg = d3.select(host).append('svg').attr('viewBox', `0 0 ${W} ${H}`).attr('role', 'img').attr('aria-label', t('is.baro'));
    svg.append('g').attr('class', 'gridl').attr('transform', `translate(0,${H - m.b})`).call(d3.axisBottom(x).ticks(5).tickSize(-(H - m.t - m.b)).tickFormat(''));
    svg.append('g').attr('class', 'axis').attr('transform', `translate(0,${m.t - 8})`).call(d3.axisTop(x).ticks(narrow ? 4 : 5).tickSize(0).tickFormat(d => d + pct)).select('.domain').remove();
    const acc = css('--accent'), mut = css('--muted');
    keys.forEach((k, i) => {
      const a = first.values[k], b = last.values[k], cy = m.t + i * rowH + rowH / 2 + (narrow ? 9 : 0);
      svg.append('text').attr('x', narrow ? 0 : m.l - 12).attr('y', narrow ? cy - 15 : cy + 4).attr('text-anchor', narrow ? 'start' : 'end').attr('fill', css('--ink')).attr('font-size', 13).attr('font-weight', 700).text(`${th[k].icon} ${tr(th[k])}`);
      if (a != null && b != null && first !== last) svg.append('line').attr('x1', x(a)).attr('x2', x(b)).attr('y1', cy).attr('y2', cy).attr('stroke', css('--line')).attr('stroke-width', 4).attr('stroke-linecap', 'round');
      if (a != null && first !== last) svg.append('circle').attr('cx', x(a)).attr('cy', cy).attr('r', 6).attr('fill', css('--surface')).attr('stroke', mut).attr('stroke-width', 2);
      if (b != null) {
        svg.append('circle').attr('cx', x(b)).attr('cy', cy).attr('r', 8).attr('fill', acc).attr('stroke', css('--surface')).attr('stroke-width', 2);
        svg.append('text').attr('class', 'lbl v').attr('x', x(b) + (a != null && a > b ? -14 : 14)).attr('text-anchor', a != null && a > b ? 'end' : 'start').attr('y', cy + 4).text(b + pct);
      } else svg.append('text').attr('class', 'lbl').attr('x', x(a) + 12).attr('y', cy + 4).attr('fill', mut).text(`${a}${pct} (${fdate(first.date, { month: 'short', year: 'numeric' })})`);
    });
    $('#baroSrc').innerHTML = `<span style="display:inline-flex;gap:6px;align-items:center"><i style="width:10px;height:10px;border-radius:50%;border:2px solid var(--muted);display:inline-block"></i>${fdate(first.date, { month: 'long', year: 'numeric' })}</span> &nbsp; <span style="display:inline-flex;gap:6px;align-items:center"><i style="width:12px;height:12px;border-radius:50%;background:var(--accent);display:inline-block"></i>${fdate(last.date, { month: 'long', year: 'numeric' })}</span><br>`
      + waves.map(w => `<a href="${esc(w.source)}" rel="noopener" target="_blank">${esc(w.field)}</a> (n = ${w.n.toLocaleString(loc())})`).join(' · ')
      + t('is.missing');
    const st = C.stakes;
    $('#stakesDesc').innerHTML = `<a href="${esc(st.source)}" rel="noopener" target="_blank">${esc(tr(st.label))}</a>`;
    $('#stakes').innerHTML = st.ranking.map(r => `<div class="stake"><span class="rk" style="background:${th[r.theme].color}">${r.rank}</span><div><b>${th[r.theme].icon} ${esc(tr(th[r.theme]))}</b><div class="note" style="margin:0">${lang === 'fr' ? (r.rank === 1 ? '1er enjeu cité' : r.rank + 'e enjeu cité') : 'Ranked #' + r.rank}</div></div></div>`).join('')
      + `<ul style="margin:12px 0 0;padding-left:18px;font-size:14px;color:var(--ink-2)">${tr(st.facts).map(f => `<li>${esc(f)}</li>`).join('')}</ul>`;
    $('#byElec').innerHTML = `<ul>${st.byElectorate.map(e => `<li><b>${esc(tr(e.who))}</b> : ${esc(tr(e.themes))}</li>`).join('')}</ul><p class="meta">${esc(tr(st.label))}</p>`;
  }

  // ---------- Liste des sondages + effets instituts ----------
  let showAll = false;
  function renderPolls() {
    const list = D.surveys.slice(0, showAll ? 40 : 10);
    $('#pollList').innerHTML = list.map(s => {
      const r1 = s.hyps.filter(h => h.round === 1), r2 = s.hyps.filter(h => h.round === 2);
      const first = r1[0] ? Object.entries(r1[0].r).sort((a, b) => b[1] - a[1]).slice(0, 7) : [];
      return `<div class="poll"><div class="who"><b>${esc(s.inst)}</b><span>${esc(s.sponsor)}</span><span class="num">${fdate(s.start, { day: 'numeric', month: 'short' })} → ${fdate(s.end)}</span>
        <span>${t('po.sample', { n: s.n.toLocaleString(loc()) })} · ${t('po.hyp', { n: s.hyps.length })}</span>
        ${s.provisional ? `<span class="badge">${t('po.prov')}</span>` : ''}
        <span>${s.source ? `<a href="${esc(s.source)}" target="_blank" rel="noopener">${t('po.source')}</a>` : s.file ? `<a href="https://www.commission-des-sondages.fr/" target="_blank" rel="noopener" title="${esc(s.file)}">${t('po.notice')} n° ${esc((s.file.match(/^\d+/) || [''])[0])}</a>` : ''}</span></div>
        <div>${first.length ? `<div class="mini">${first.map(([c, v]) => `<span><i style="background:${col(c)}"></i>${esc(sh(c))} <b class="num">${fmt(v, v % 1 ? 1 : 0)}</b></span>`).join('')}</div>` : ''}
        ${r2.length ? `<div class="mini" style="margin-top:6px"><b>${t('po.r2')} :</b> ${r2.map(h => Object.entries(h.r).map(([c, v]) => `${esc(sh(c))} ${fmt(v, 0)}`).join(' – ')).join(' · ')}</div>` : ''}</div></div>`;
    }).join('') + (showAll ? '' : `<button class="pill" id="moreBtn" style="justify-self:start">${t('po.more')}</button>`);
    const mb = $('#moreBtn'); if (mb) mb.onclick = () => { showAll = true; renderPolls(); };
    const top = Object.keys(D.house[0]?.he || {});
    const tint = v => { if (v == null) return 'transparent'; const a = Math.min(Math.abs(v) / 3, 1) * 38; return `color-mix(in srgb, ${v > 0 ? 'var(--pos)' : 'var(--neg)'} ${a}%, var(--surface))`; };
    $('#house').innerHTML = `<table class="tbl"><thead><tr><th>${t('po.inst')}</th><th>${t('po.nsurv')}</th>${top.map(c => `<th class="c">${esc(sh(c))}</th>`).join('')}</tr></thead><tbody>`
      + D.house.map(h => `<tr><td><b>${esc(h.inst)}</b></td><td class="c num">${h.n}</td>${top.map(c => `<td class="c"><span class="he num" style="background:${tint(h.he[c])}">${h.he[c] == null ? '–' : sgn(h.he[c])}</span></td>`).join('')}</tr>`).join('') + '</tbody></table>';
  }


  // ---------- V2 : soutien, liens ----------
  function renderSupport() {
    ['#donateTop', '#donateBtn', '#donateHero'].forEach(sel => { const a = $(sel); if (a) a.href = D.site.donate; });
    $('#contactMail').textContent = D.site.contact;
    const live = window.Debate && window.Debate.liveDebate(D), bar = $('#liveBar');
    bar.hidden = !live; if (live) bar.innerHTML = `<span class="live"></span>${t('live.bar')}`;
  }

  // ---------- V2 : quiz des priorités ----------
  const quiz = new Set();
  function renderQuiz() {
    const Q = D.quiz;
    $('#qzThemes').innerHTML = Object.entries(Q.themes).map(([k, v]) => `<button class="chip theme" aria-pressed="${quiz.has(k)}" data-k="${k}">${esc(tr(v))}</button>`).join('');
    $('#qzThemes').onclick = e => {
      const b = e.target.closest('.chip'); if (!b) return; const k = b.dataset.k;
      if (quiz.has(k)) quiz.delete(k); else if (quiz.size < Q.max) quiz.add(k);
      renderQuiz();
    };
    $('#qzCount').textContent = t('qz.count', { n: quiz.size, m: Q.max });
    if (!quiz.size) { $('#qzRes').innerHTML = `<p class="note">${t('qz.empty')}</p><p class="note">${t('qz.national')}</p>`; return; }
    const res = Q.profiles.map(p => {
      const common = p.themes.filter(x => quiz.has(x));
      return { p, common, score: common.length / Math.sqrt(p.themes.length * quiz.size) * 100 };
    }).sort((a, b) => b.score - a.score);
    $('#qzRes').innerHTML = res.map(r => `<div class="qz-row"><div><b>${esc(tr(r.p.label))}</b><small>${t('qz.common', { n: r.common.length })}${r.common.length ? ' : ' + r.common.map(k => esc(tr(Q.themes[k]))).join(', ') : ''}</small>${r.p.note ? `<small>${esc(tr(r.p.note))}</small>` : ''}</div>
      <div class="track"><i style="width:${r.score}%;background:${r.p.color}"></i></div><b class="num" style="text-align:right">${fmt(r.score, 0)}${pct}</b></div>`).join('')
      + `<p class="note">${t('qz.national')}</p><p class="note"><a href="${esc(Q.source)}" target="_blank" rel="noopener">${t('qz.src')}</a></p>`;
  }

  // ---------- V2 : fiches instituts ----------
  function renderInstitutes() {
    const top = Object.keys(D.house[0]?.he || {}).slice(0, 4);
    $('#insts').innerHTML = D.instituteProfiles.map(p => {
      const h = D.house.find(x => x.inst === p.inst);
      const bars = h ? top.map(c => { const v = h.he[c]; if (v == null) return ''; const w = Math.min(Math.abs(v) / 4, 1) * 50;
        return `<div class="he-bar"><span>${esc(sh(c))}</span><span class="t"><i style="${v >= 0 ? 'left:50%' : `left:${50 - w}%`};width:${w}%;background:${col(c)}"></i></span><b class="num" style="text-align:right">${sgn(v)}</b></div>`; }).join('') : '';
      return `<article class="inst"><h4><span>${esc(p.inst)}</span>${p.site ? `<a href="${esc(p.site)}" target="_blank" rel="noopener">${t('ins.site')} ↗</a>` : ''}</h4>
        <dl><dt>${t('ins.surveys')}</dt><dd class="num">${p.surveys} · ${t('po.hyp', { n: p.hyps })}</dd>
        <dt>${t('ins.period')}</dt><dd>${fdate(p.first, { month: 'short', year: 'numeric' })} → ${fdate(p.last, { day: 'numeric', month: 'short' })}</dd>
        <dt>${t('ins.median')}</dt><dd class="num">${p.medianN.toLocaleString(loc())}</dd>
        <dt>${t('ins.sponsors')}</dt><dd>${p.sponsors.slice(0, 3).map(s => esc(s.k)).join(' · ')}</dd></dl>
        ${bars ? `<div class="note" style="margin:4px 0 0">${t('ins.he')}</div><div class="he-bars">${bars}</div>` : ''}</article>`;
    }).join('');
  }

  // ---------- V2 : frise ----------
  function renderTimeline() {
    const items = D.events.map(e => ({ date: e.date, text: tr(e), c: e.c, future: false, src: e.source }));
    for (const d of D.debates.filter(x => !x.demo)) items.push({ date: d.start.slice(0, 10), text: t('tl.debate', { t: tr(d.title), c: d.channel }), future: Date.parse(d.start) > Date.now() });
    items.push({ date: D.election.round1, text: t('tl.r1'), future: true }, { date: D.election.round2, text: t('tl.r2'), future: true });
    items.sort((a, b) => a.date.localeCompare(b.date));
    let month = '', html = '';
    for (const it of items.filter(i => i.date >= '2025-01-01')) {
      const mo = fdate(it.date, { month: 'long', year: 'numeric' });
      if (mo !== month) { month = mo; html += `<li class="month">${esc(mo)}</li>`; }
      html += `<li class="${it.future || Date.parse(it.date) > Date.now() ? 'future' : ''}" style="--dot:${it.c ? col(it.c) : 'var(--ink)'}"><span class="d">${fdate(it.date, { day: 'numeric', month: 'long' })}</span>${esc(it.text)}${it.src ? ` · <a href="${esc(it.src)}" target="_blank" rel="noopener">source</a>` : ''}</li>`;
    }
    $('#timeline').innerHTML = html;
  }

  // ---------- V2 : intégration (iframe) ----------
  const embedId = qs.get('embed');
  function renderEmbeds() {
    const base = (D.site.url || location.origin + location.pathname).replace(/\/$/, '');
    document.querySelectorAll('.embed-tool').forEach(el => {
      const id = el.dataset.embed, code = `<iframe src="${base}/?embed=${id}&lang=${lang}" width="100%" height="${id === 'proba' ? 760 : 640}" style="border:0;max-width:100%" loading="lazy" title="${esc(D.site.name)}"></iframe>`;
      el.innerHTML = `<button class="pill" type="button">${esc(t('emb.btn'))}</button><div hidden><textarea rows="3" readonly>${esc(code)}</textarea><button class="pill" type="button" data-copy>${t('emb.copy')}</button></div>`;
      const [btn, box] = [el.querySelector('button'), el.querySelector('div')];
      btn.onclick = () => { box.hidden = !box.hidden; };
      el.querySelector('[data-copy]').onclick = async e => {
        const ta = el.querySelector('textarea');
        try { await navigator.clipboard.writeText(ta.value); e.target.textContent = t('emb.copied'); } catch { ta.select(); }
      };
    });
    if (embedId) {
      document.body.classList.add('embed');
      document.querySelectorAll('main > section').forEach(s => s.classList.toggle('embed-target', s.id === embedId));
      const src = $('#embedSrc'); src.hidden = false; document.body.appendChild(src);
      src.innerHTML = `<a href="${esc(base)}" target="_blank" rel="noopener">${esc(t('emb.src', { s: D.site.name }))}</a> · ${fdate(D.asOf)}`;
    }
  }

  // ---------- V2 : réglages (modules masquables) ----------
  function applyFeatures() {
    const F = D.features || {};
    const hide = (id, off) => { const s = document.getElementById(id); if (s) s.hidden = off; document.querySelectorAll(`header a[href="#${id}"]`).forEach(a => { a.hidden = off; }); };
    hide('proba', F.probabilities === false);
    hide('debats', F.debates === false);
    hide('quiz', F.quiz === false);
    hide('bascule', F.bascule === false);
    hide('etsi', F.whatif === false);
    const pc = $('#projCard'); if (pc) pc.hidden = F.projection === false;
    const sim = $('#sim'); if (sim) sim.hidden = F.simulator === false;
  }

  // ---------- Assemblage ----------
  function renderAll() {
    pct = pctOf();
    renderStatic(); renderHero(); renderFiches(); renderChanges(); renderBascule(); drawProj(); renderDecoded(); renderRaceControls(); drawRace(); renderTable(); renderProba(); drawGhosts();
    renderTransfers(); renderWhatIf(); renderDuels(); renderSim(); renderGap(); renderConcerns(); renderPolls();
    renderSupport(); renderQuiz(); renderInstitutes(); renderTimeline(); renderEmbeds(); applyFeatures();
    if (window.Debate) window.Debate.render({ D, lang, t, tr, loc, pct: () => pct, col, nm, sh, fmt, esc, css, tipFor });
  }
  $('#langSel').onchange = e => { lang = e.target.value; store.set('lang', lang); const u = new URL(location.href); u.searchParams.delete('lang'); history.replaceState(null, '', u); renderAll(); };
  $('#themeBtn').onclick = () => {
    const next = isDark() ? 'light' : 'dark'; document.documentElement.dataset.theme = next; store.set('theme', next); renderAll();
  };
  matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', renderAll);
  let rt; addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(() => { drawRace(); drawProj(); drawGhosts(); renderConcerns(); window.Debate && window.Debate.redraw(); }, 150); });
  // Menu « Plus » : se referme après un clic sur un lien ou en dehors.
  const more = $('#navMore');
  if (more) {
    more.addEventListener('click', e => { if (e.target.closest('a')) more.open = false; });
    document.addEventListener('click', e => { if (more.open && !more.contains(e.target)) more.open = false; });
  }
  renderAll();
})();
