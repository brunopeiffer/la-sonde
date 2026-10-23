// La Sonde — pages par candidat (référencement Google) en 5 langues + plan du site.
// Entrée : site/data/site.json (produit par model.mjs).
// Sortie : site/candidat/<slug>/ (français) et site/<en|de|es|it>/candidat/<slug>/, site/sitemap.xml
import fs from 'node:fs';
import path from 'node:path';
import { readJSON } from './lib.mjs';
import { TXT, LOCALE } from './pages-i18n.mjs';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const P = (...a) => path.join(ROOT, ...a);
const D = readJSON(P('site/data/site.json'));
const BASE = D.site.url.replace(/\/$/, '');
const LANGS = ['fr', 'en', 'de', 'es', 'it'];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const f1 = x => x == null ? '–' : x.toFixed(1).replace('.', ',');
const fdate = s => new Date(s + 'T12:00:00Z').toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
const ARROW = { up: ['▲', 'up'], down: ['▼', 'down'], flat: ['→', 'flat'], nd: ['–', 'flat'] };
const pageUrl = (L, slug) => `${BASE}/${L === 'fr' ? '' : L + '/'}candidat/${slug}/`;

function chart(c, L) {
  const T = TXT[L];
  const S = D.series[c]; if (!S) return '';
  const W = 760, H = 300, m = { t: 14, r: 16, b: 30, l: 34 };
  const n = D.days.length; let i0 = Math.max(0, n - 183); while (i0 < n - 1 && S.v[i0] == null) i0++; i0 = Math.max(0, i0 - 3);
  // Densité : nombre de sondages à ± 21 jours de chaque point ; en dessous de 3 (ou marge trop large), pointillés sans marge.
  const pd = (D.points[c] || []).map(p => Date.parse(p[0]));
  const dens = d => { const t = Date.parse(d); return pd.filter(x => Math.abs(x - t) <= 21 * 864e5).length; };
  const pts = []; for (let i = i0; i < n; i++) if (S.v[i] != null) pts.push({ i, v: S.v[i], b: S.b[i] || 0, ok: dens(D.days[i]) >= 3 && (S.b[i] || 0) <= 2.5 });
  if (pts.length < 2) return '';
  const ymax = Math.ceil((Math.max(...pts.map(p => p.v + p.b)) + 2) / 5) * 5;
  const x = i => m.l + (i - i0) / (n - 1 - i0) * (W - m.l - m.r), y = v => m.t + (1 - v / ymax) * (H - m.t - m.b);
  const segs = [];
  pts.forEach((p, k) => { const Lg = segs[segs.length - 1]; if (Lg && Lg.ok === p.ok) Lg.p.push(p); else segs.push({ ok: p.ok, p: k ? [pts[k - 1], p] : [p] }); });
  const pathOf = a => a.map((p, k) => `${k ? 'L' : 'M'}${x(p.i).toFixed(1)},${y(p.v).toFixed(1)}`).join('');
  const bandOf = a => a.map((p, k) => `${k ? 'L' : 'M'}${x(p.i).toFixed(1)},${y(p.v + p.b).toFixed(1)}`).join('') +
    [...a].reverse().map(p => `L${x(p.i).toFixed(1)},${y(Math.max(0, p.v - p.b)).toFixed(1)}`).join('') + 'Z';
  const sparse = segs.some(g => !g.ok);
  const col = D.cands[c].color;
  const grid = []; for (let v = 0; v <= ymax; v += 5) grid.push(`<line x1="${m.l}" x2="${W - m.r}" y1="${y(v)}" y2="${y(v)}" class="g"/><text x="${m.l - 6}" y="${y(v) + 4}" text-anchor="end">${v}</text>`);
  const ticks = []; let lastM = '';
  for (let i = i0; i < n; i++) { const mo = D.days[i].slice(0, 7); if (mo !== lastM && D.days[i].slice(8) <= '02') { ticks.push(`<text x="${x(i)}" y="${H - 8}" text-anchor="middle">${new Date(D.days[i] + 'T12:00:00Z').toLocaleDateString(LOCALE[L], { month: 'short' })}</text>`); } lastM = mo; }
  const dots = (D.points[c] || []).filter(p => p[0] >= D.days[i0]).map(p => {
    const i = D.days.findIndex(d => d >= p[0]); return i < 0 ? '' : `<circle cx="${x(i).toFixed(1)}" cy="${y(p[1]).toFixed(1)}" r="2.6" fill="${col}" opacity=".3"/>`; }).join('');
  const last = pts[pts.length - 1];
  return `<svg class="cchart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(T.aria(D.cands[c].name))}">
  ${grid.join('')}${ticks.join('')}${segs.filter(g => g.ok && g.p.length > 1).map(g => `<path d="${bandOf(g.p)}" fill="${col}" opacity=".14"/>`).join('')}${dots}
  ${segs.filter(g => g.p.length > 1).map(g => `<path d="${pathOf(g.p)}" fill="none" stroke="${col}" stroke-width="${g.ok ? 2.5 : 1.8}" stroke-linejoin="round" ${g.ok ? '' : 'stroke-dasharray="5 5" opacity=".55"'}/>`).join('')}
  <circle cx="${x(last.i)}" cy="${y(last.v)}" r="4.5" fill="${col}" stroke="var(--surface)" stroke-width="2"/></svg>${sparse ? `<p class="note" style="margin:6px 0 0">${esc(T.sparse)}</p>` : ''}`;
}

function page(s, rank, all, L) {
  const T = TXT[L], loc = LOCALE[L];
  const R = L === 'fr' ? '../../' : '../../../';           // racine du site
  const home = L === 'fr' ? R : `${R}?lang=${L}`;
  const num = x => x == null ? '–' : x.toFixed(1).replace('.', T.dec);
  const sgn = x => x == null ? '–' : (x > 0 ? '+' : x < 0 ? '−' : '±') + num(Math.abs(x));
  const pc = x => L === 'en' ? `${num(x)}%` : `${num(x)} %`;
  const fdL = d => new Date(d + 'T12:00:00Z').toLocaleDateString(loc, { day: 'numeric', month: 'long', year: 'numeric' });
  const fsL = d => new Date(d + 'T12:00:00Z').toLocaleDateString(loc, { day: 'numeric', month: 'short', year: '2-digit' });
  const c = s.c, K = D.cands[c], name = K.name, M = (D.momentum || {})[c] || { state: 'nd' };
  const ar = ARROW[M.state] || ARROW.nd, stTxt = T.st[M.state] || T.st.nd;
  const qa = (D.mc.qualify || []).find(q => q.c === c);
  const allScen = (D.scenarios || []).find(x => x.key === 'all');
  const qb = !qa && allScen ? allScen.mc.qualify.find(q => q.c === c) : null;
  const q = D.features.probabilities !== false ? (qa || qb) : null;
  const he = Object.entries((D.houseAll || {})[c] || {}).filter(([, v]) => v != null).sort((a, b) => b[1] - a[1]);
  const polls = (D.recentPolls || {})[c] || [];
  const party = K.party ? ` (${esc(K.party)})` : '';
  const placeTxt = L === 'fr' ? `${T.ord(rank)}` : T.ord(rank);
  const lead = T.lead(esc(name), party, num(s.v), placeTxt, all.length, sgn(s.d30)) +
    (M.state === 'up' || M.state === 'down' ? T.leadM(stTxt, sgn(M.d14), M.state === 'up' ? M.pUp : 100 - M.pUp) : M.state === 'flat' ? T.leadF : '') +
    `${T.pres(esc(name), Math.round(s.presence))}${s.presence < 30 ? T.presLow : ''}.`;
  const url = pageUrl(L, K.slug);
  // Second tour.
  const duels = (D.duels || []).filter(d => d.a === c || d.b === c).map(d => d.a === c ? { o: d.b, v: d.va, w: d.vb, n: d.n, last: d.last } : { o: d.a, v: d.vb, w: d.va, n: d.n, last: d.last })
    .sort((a, b) => b.n - a.n);
  const fd = x => (Math.round(x * 10) / 10).toFixed(1).replace('.', T.dec).replace(/[.,]0$/, '');
  const pd = x => L === 'en' ? `${fd(x)}%` : `${fd(x)} %`;
  const duelHtml = duels.length ? `<div class="cduels">${duels.map(d => `<div class="cduel"><div class="cdl"><b>${esc(K.short)}</b> ${T.vs} <b>${esc(D.cands[d.o].short)}</b><span class="note" style="margin:0"> · ${T.r2n(d.n, fsL(d.last))}</span></div>
      <div class="cdbar"><i style="width:${d.v}%;background:${K.color}">${pd(d.v)}</i><i style="width:${d.w}%;background:${D.cands[d.o].color}">${pd(d.w)}</i><u></u></div></div>`).join('')}</div>`
    : `<p class="note">${esc(T.r2none(name))}</p>`;
  // Reports si le candidat se retire.
  const TR = (D.transfers || []).find(t => t.c === c);
  const trHtml = TR ? `<p>${esc(T.wdYes(TR.surveys, name))}</p>
      <div class="helist">${TR.flows.filter(f => f.pct >= 2).slice(0, 6).map(f => `<div><span>${esc(D.cands[f.c] ? D.cands[f.c].short : f.c)}</span><i class="hb"><b class="pos" style="width:${Math.min(100, f.pct)}%;left:0;background:${D.cands[f.c] ? D.cands[f.c].color : '#999'}"></b></i><em class="num">${L === 'en' ? f.pct + '%' : f.pct + ' %'}</em></div>`).join('')}</div>`
    : `<p>${esc(T.wdNo(name))}</p>`;
  const ev = (D.events || []).filter(e => e.c === c).sort((a, b) => b.date.localeCompare(a.date));
  const EVK = { de: { in: n => `${n} gibt die Kandidatur bekannt`, out: n => `${n} zieht die Kandidatur zurück` },
    es: { in: n => `${n} anuncia su candidatura`, out: n => `${n} retira su candidatura` },
    it: { in: n => `${n} annuncia la sua candidatura`, out: n => `${n} ritira la sua candidatura` } };
  const evText = e => e[L] || (EVK[L] && EVK[L][e.kind] ? EVK[L][e.kind](name) : e.en || e.fr);
  const evHtml = ev.length ? `<ul class="cev">${ev.map(e => `<li><b>${fdL(e.date)}</b> · ${esc(evText(e))}</li>`).join('')}</ul>` : '';
  const msg = T.msg(name, num(s.v)), enc = encodeURIComponent;
  const share = `<div class="sharerow"><span>${T.share}</span>
      <a target="_blank" rel="noopener" href="https://bsky.app/intent/compose?text=${enc(msg + ' ' + url)}">Bluesky</a>
      <a target="_blank" rel="noopener" href="https://twitter.com/intent/tweet?text=${enc(msg)}&url=${enc(url)}">X</a>
      <a target="_blank" rel="noopener" href="https://wa.me/?text=${enc(msg + ' ' + url)}">WhatsApp</a>
      <a target="_blank" rel="noopener" href="https://www.linkedin.com/sharing/share-offsite/?url=${enc(url)}">LinkedIn</a>
      <button type="button" data-u="${url}" onclick="navigator.clipboard && navigator.clipboard.writeText(this.dataset.u); this.textContent='${T.copied}'">${T.copy}</button></div>`;
  const others = all.filter(x => x.c !== c && D.cands[x.c] && D.cands[x.c].slug).map(x => `<a href="../${D.cands[x.c].slug}/"><i style="background:${D.cands[x.c].color}"></i>${esc(D.cands[x.c].short)}</a>`).join('');
  const alt = LANGS.map(l => `<link rel="alternate" hreflang="${l}" href="${pageUrl(l, K.slug)}">`).join('') + `<link rel="alternate" hreflang="x-default" href="${pageUrl('fr', K.slug)}">`;
  const langLinks = LANGS.map(l => l === L ? `<b>${l.toUpperCase()}</b>` : `<a href="${R}${l === 'fr' ? '' : l + '/'}candidat/${K.slug}/" hreflang="${l}">${l.toUpperCase()}</a>`).join(' · ');
  const nav = T.nav, sec = ['bascule', 'etsi', 'course', 'proba', 'sondages'];
  const sim = `${R}?${L === 'fr' ? '' : 'lang=' + L + '&'}retrait=${c}#etsi`;
  return `<!doctype html>
<html lang="${L}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(T.title(name, num(s.v)))}</title>
<meta name="description" content="${esc(T.desc(name, num(s.v), T.ord(rank), sgn(s.d30)))}">
<link rel="canonical" href="${url}">${alt}
<meta property="og:title" content="${esc(T.og(name, num(s.v)))}">
<meta property="og:description" content="${esc(T.desc(name, num(s.v), T.ord(rank), sgn(s.d30)))}">
<meta property="og:image" content="${BASE}/share/carte-du-jour.png">
<meta property="og:url" content="${url}">
<meta property="og:type" content="article">
<meta name="twitter:card" content="summary_large_image">
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='8' fill='%235b2cff'/%3E%3Ccircle cx='16' cy='16' r='3.6' fill='white'/%3E%3Ccircle cx='16' cy='16' r='9' fill='none' stroke='white' stroke-width='2.4'/%3E%3C/svg%3E">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,600;12..96,800&family=Inter:wght@400;600;700;800&display=swap" rel="stylesheet">
<link rel="stylesheet" href="${R}styles.css?v=${Date.now().toString(36)}">
<script data-goatcounter="https://lasonde.goatcounter.com/count" async src="https://gc.zgo.at/count.js"></script>
<script type="application/ld+json">${JSON.stringify({ '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: [
    { '@type': 'ListItem', position: 1, name: 'La Sonde', item: BASE + '/' }, { '@type': 'ListItem', position: 2, name: T.crumb(name), item: url }] })}</script>
</head>
<body class="cpage">
<header class="top"><div class="wrap">
  <a class="brand" href="${home}"><svg width="30" height="30" viewBox="0 0 32 32" aria-hidden="true"><defs><linearGradient id="lg" x1="0" x2="1"><stop offset="0" stop-color="#5b2cff"/><stop offset=".6" stop-color="#ff3d7f"/><stop offset="1" stop-color="#ff8a00"/></linearGradient></defs><rect width="32" height="32" rx="9" fill="url(#lg)"/><circle cx="16" cy="16" r="3.4" fill="#fff"/><circle cx="16" cy="16" r="8" fill="none" stroke="#fff" stroke-width="2.2" opacity=".85"/><circle cx="16" cy="16" r="12.5" fill="none" stroke="#fff" stroke-width="1.8" opacity=".45"/></svg><span>La <b>Sonde</b></span></a>
  <nav class="nav">${nav.map((t, i) => `<a href="${home}#${sec[i]}">${esc(t)}</a>`).join('')}</nav>
  <div class="tools"><a class="pill donate" href="${esc(D.site.donate)}" target="_blank" rel="noopener"><span aria-hidden="true">♥</span> <span>${T.donate}</span></a></div>
</div></header>
<main class="wrap">
  <p class="crumb"><a href="${home}">La Sonde</a> › ${esc(T.crumb(name))} <span style="float:right">${langLinks}</span></p>
  <section class="chero">
    <div>
      <div class="tag"><i style="background:${K.color}"></i>${esc(K.party || T.cand)}</div>
      <h1>${esc(T.h1(name))}<span>${T.h1b}</span></h1>
      <p class="lead">${lead}</p>
    </div>
    <div class="cstats">
      <div><span>${T.sAvg}</span><b class="num" style="color:${K.color}">${pc(s.v)}</b><small>± ${num(s.band)} pt</small></div>
      <div><span>${T.sRank}</span><b class="num">${T.ord(rank)}</b><small>${T.sOf(all.length)}</small></div>
      <div><span>${T.sTrend}</span><b class="num ${ar[1]}">${ar[0]} ${M.state === 'nd' ? '' : sgn(M.d14)}</b><small>${stTxt}</small></div>
      ${q ? `<div><span>${T.sQ}</span><b class="num">${pc(q.p)}</b><small>${qa ? T.sQa : T.sQb}</small></div>` : `<div><span>${T.s30}</span><b class="num">${sgn(s.d30)}</b><small>${T.pts}</small></div>`}
    </div>
  </section>
  ${share}
  <section class="card"><h2>${T.chartT}</h2><p class="note">${T.chartN}</p>${chart(c, L)}</section>
  <div class="grid2" style="margin-top:18px">
    <section class="card"><h2>${T.r2T}</h2><p class="note">${T.r2N}</p>${duelHtml}</section>
    <section class="card"><h2>${T.wdT}</h2>${trHtml}
      <p style="margin:14px 0 0"><a class="cta" href="${sim}">${T.wdBtn}</a></p>
      ${evHtml ? `<h2 style="margin-top:22px">${T.camp}</h2>${evHtml}` : ''}</section>
  </div>
  <div class="grid2" style="margin-top:18px">
    <section class="card"><h2>${T.lastT}</h2>
      ${polls.length ? `<div class="scroll"><table class="tbl"><thead><tr><th>${T.thI}</th><th>${T.thE}</th><th class="c">${T.thS}</th><th class="c">${T.thH}</th></tr></thead><tbody>${polls.map(p => `<tr><td><b>${esc(p.inst)}</b><br><span class="note" style="margin:0">${esc(p.sponsor)}</span></td><td>${fsL(p.end)}</td><td class="c num"><b>${p.lo === p.hi ? pc(p.lo) : num(p.lo) + '–' + pc(p.hi)}</b></td><td class="c num">${p.h}</td></tr>`).join('')}</tbody></table></div>` : `<p class="note">${T.noPoll}</p>`}
      <p class="note">${T.lastN}</p>
    </section>
    <section class="card"><h2>${T.heT}</h2>
      <p class="note">${esc(T.heN(name))}</p>
      ${he.length ? `<div class="helist">${he.map(([i, v]) => `<div><span>${esc(i)}</span><i class="hb"><b class="${v >= 0 ? 'pos' : 'neg'}" style="width:${Math.min(50, Math.abs(v) / 4 * 50)}%;${v >= 0 ? 'left:50%' : `right:50%`}"></b></i><em class="num">${sgn(v)}</em></div>`).join('')}</div>` : `<p class="note">${T.heNo}</p>`}
    </section>
  </div>
  <section class="card" style="margin-top:18px"><h2>${T.othT}</h2><div class="olist">${others}</div>
    <p style="margin:16px 0 0"><a class="cta" href="${home}#course">${T.othBtn}</a></p></section>
  <p class="note" style="margin:22px 0">${T.foot(fdL(D.asOf)).replace('ROOT', home)}</p>
</main>
<footer><div class="wrap"><p>La Sonde · ${esc(D.site.author)} · <a href="${esc(D.site.donate)}" target="_blank" rel="noopener">${T.support}</a> · <a href="mailto:${esc(D.site.contact)}">${esc(D.site.contact)}</a></p></div></footer>
</body>
</html>
`;
}

const all = D.standings;
fs.rmSync(P('site/candidat'), { recursive: true, force: true });
for (const L of LANGS.slice(1)) fs.rmSync(P('site', L), { recursive: true, force: true });
const urls = [];
for (const L of LANGS) all.forEach((s, i) => {
  const K = D.cands[s.c]; if (!K || !K.slug) return;
  const dir = L === 'fr' ? P('site/candidat', K.slug) : P('site', L, 'candidat', K.slug); fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'index.html'), page(s, i + 1, all, L));
  urls.push(pageUrl(L, K.slug));
});
fs.writeFileSync(P('site/sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
  [`${BASE}/`, ...["en", "de", "es", "it"].map(l => `${BASE}/?lang=${l}`), ...urls].map((u, i) => `  <url><loc>${u.replace(/&/g, "&amp;")}</loc><lastmod>${D.asOf}</lastmod><changefreq>daily</changefreq><priority>${i < 5 ? '1.0' : '0.8'}</priority></url>`).join('\n') + '\n</urlset>\n');
console.log(`Pages candidats : ${urls.length} (${LANGS.length} langues)`);

// ---------- Page d'accueil : contenu lisible sans JavaScript (Google, aperçus de liens) ----------
{
  const idx = P('site/index.html');
  let h = fs.readFileSync(idx, 'utf8');
  const top = D.standings.filter(s => s.presence >= 30).slice(0, 3);
  const dateFr = fdate(D.asOf);
  const headline = `Présidentielle 2027 : ${top.map(s => `${D.cands[s.c].short} ${Math.round(s.v)} %`).join(', ')} (moyenne des sondages au ${dateFr})`;
  const firstSignal = ((D.changes || {}).fr || [])[0];
  h = h.replace(/<meta property="og:title" content="[^"]*">/, `<meta property="og:title" content="${esc(headline)}">`);
  if (firstSignal) h = h.replace(/<meta property="og:description" content="[^"]*">/, `<meta property="og:description" content="${esc(firstSignal.t)}">`);
  // Résumé et liens vers les fiches, écrits en dur (le JavaScript les remplace ensuite).
  h = h.replace(/<ul id="summary">[\s\S]*?<\/ul>/, `<ul id="summary">${(D.summary.fr || []).map(x => `<li>${esc(x)}</li>`).join('')}</ul>`);
  h = h.replace(/<div class="cfiches" id="cfiches">[\s\S]*?<\/div>/, `<div class="cfiches" id="cfiches">${all.filter(s => D.cands[s.c] && D.cands[s.c].slug).map(s => `<a class="cfiche" href="candidat/${D.cands[s.c].slug}/">Sondages ${esc(D.cands[s.c].name)} : ${f1(s.v)} %</a>`).join('')}</div>`);
  // Données structurées (schema.org) : site, éditeur et jeu de données.
  const ld = [
    { '@context': 'https://schema.org', '@type': 'WebSite', name: 'La Sonde', url: BASE + '/', inLanguage: ['fr', 'en', 'de', 'es', 'it'] },
    { '@context': 'https://schema.org', '@type': 'Dataset', name: 'Moyenne des sondages de l\'élection présidentielle française de 2027',
      description: 'Moyenne quotidienne des intentions de vote au premier tour, corrigée des effets instituts, avec tendances et probabilités de qualification.',
      url: BASE + '/', creator: { '@type': 'Person', name: D.site.author }, dateModified: D.asOf, license: 'https://opensource.org/licenses/MIT',
      isBasedOn: 'https://github.com/MieuxVoter/presidentielle2027', temporalCoverage: '2025/2027', spatialCoverage: 'France',
      variableMeasured: all.slice(0, 10).map(s => ({ '@type': 'PropertyValue', name: D.cands[s.c].name, value: s.v, unitText: '%' })) }
  ];
  h = h.replace(/<script type="application\/ld\+json" id="ldjson">[\s\S]*?<\/script>/, `<script type="application/ld+json" id="ldjson">${JSON.stringify(ld).replace(/</g, '\\u003c')}</script>`);
  fs.writeFileSync(idx, h);
}

// ---------- Page /partager/ : la publication du jour, prête à poster sur X ou Bluesky en un clic ----------
{
  const top = D.standings.filter(s => s.presence >= 30).slice(0, 4).map(s => `${D.cands[s.c].short} ${f1(s.v)} %`).join(' · ');
  // X compte un lien pour 23 caractères : on garde le chapeau chiffré seulement s'il tient avec le signal entier.
  const head = `Présidentielle 2027, moyenne des sondages :\n${top}`;
  const posts = ((D.changes || {}).fr || []).map(sig => (head.length + sig.t.length + 2 + 25 <= 280) ? `${head}\n\n${sig.t}` : `${sig.t}\n\n#Présidentielle2027`);
  if (!posts.length) posts.push(`Présidentielle 2027, moyenne des sondages :\n${top}`);
  const link = BASE + '/';
  const fit = (txt, max) => txt.length + link.length + 2 <= max ? txt : txt.slice(0, max - link.length - 4).replace(/\s+\S*$/, '') + '…';
  const card = (txt, i) => {
    const x = fit(txt, 280), b = fit(txt, 300);
    return `<div class="card" style="margin-bottom:16px"><h2 style="font:800 18px var(--display);margin:0 0 8px">Publication ${i + 1}</h2>
      <pre style="white-space:pre-wrap;font:15px/1.5 var(--font);margin:0 0 12px">${esc(x)}\n\n${link}</pre>
      <p style="display:flex;gap:8px;flex-wrap:wrap;margin:0">
        <a class="cta" target="_blank" rel="noopener" href="https://twitter.com/intent/tweet?text=${encodeURIComponent(x)}&url=${encodeURIComponent(link)}">Publier sur X</a>
        <a class="cta" style="background:#1185fe" target="_blank" rel="noopener" href="https://bsky.app/intent/compose?text=${encodeURIComponent(b + '\n\n' + link)}">Publier sur Bluesky</a>
        <button class="pill" onclick="navigator.clipboard.writeText(this.dataset.t);this.textContent='Copié'" data-t="${esc(x + '\n\n' + link)}">Copier le texte</button></p></div>`;
  };
  const html = `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Publication du jour | La Sonde</title><meta name="robots" content="noindex">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,600;12..96,800&family=Inter:wght@400;600;700;800&display=swap" rel="stylesheet">
<link rel="stylesheet" href="../styles.css?v=${Date.now().toString(36)}"></head>
<body class="cpage"><main class="wrap" style="max-width:720px;padding:28px 16px">
<h1 style="font:800 30px var(--display);margin:0 0 6px">Publication du jour</h1>
<p class="note" style="margin:0 0 20px">Données au ${fdate(D.asOf)}. Choisissez une publication et cliquez : le texte est prérempli, l'image du jour s'affiche automatiquement en aperçu du lien. Page non référencée par Google.</p>
${posts.map(card).join('')}
<p class="note"><a href="../share/carte-du-jour.png" target="_blank">Télécharger l'image du jour</a> (à joindre si l'aperçu n'apparaît pas).</p>
</main></body></html>`;
  fs.mkdirSync(P('site/partager'), { recursive: true });
  fs.writeFileSync(P('site/partager/index.html'), html);
}
