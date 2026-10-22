// La Sonde — pages par candidat (référencement Google) + plan du site.
// Entrée : site/data/site.json (produit par model.mjs). Sortie : site/candidat/<slug>/index.html, site/sitemap.xml
import fs from 'node:fs';
import path from 'node:path';
import { readJSON } from './lib.mjs';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const P = (...a) => path.join(ROOT, ...a);
const D = readJSON(P('site/data/site.json'));
const BASE = D.site.url.replace(/\/$/, '');
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const f1 = x => x == null ? '–' : x.toFixed(1).replace('.', ',');
const sg = x => x == null ? '–' : (x > 0 ? '+' : x < 0 ? '−' : '±') + f1(Math.abs(x));
const fdate = s => new Date(s + 'T12:00:00Z').toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
const fshort = s => new Date(s + 'T12:00:00Z').toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: '2-digit' });
const ord = n => n === 1 ? '1er' : n + 'e';
const STATE = { up: ['▲', 'en hausse nette', 'up'], down: ['▼', 'en baisse nette', 'down'], flat: ['→', 'stable', 'flat'], nd: ['–', 'trop peu testé pour dégager une tendance', 'flat'] };

function chart(c) {
  const S = D.series[c]; if (!S) return '';
  const W = 760, H = 300, m = { t: 14, r: 16, b: 30, l: 34 };
  const n = D.days.length; let i0 = Math.max(0, n - 183); while (i0 < n - 1 && S.v[i0] == null) i0++; i0 = Math.max(0, i0 - 3);
  const pts = []; for (let i = i0; i < n; i++) if (S.v[i] != null) pts.push({ i, v: S.v[i], b: S.b[i] || 0 });
  if (pts.length < 2) return '';
  const ymax = Math.ceil((Math.max(...pts.map(p => p.v + p.b)) + 2) / 5) * 5;
  const x = i => m.l + (i - i0) / (n - 1 - i0) * (W - m.l - m.r), y = v => m.t + (1 - v / ymax) * (H - m.t - m.b);
  const line = pts.map((p, k) => `${k ? 'L' : 'M'}${x(p.i).toFixed(1)},${y(p.v).toFixed(1)}`).join('');
  const band = pts.map((p, k) => `${k ? 'L' : 'M'}${x(p.i).toFixed(1)},${y(p.v + p.b).toFixed(1)}`).join('') +
    [...pts].reverse().map(p => `L${x(p.i).toFixed(1)},${y(Math.max(0, p.v - p.b)).toFixed(1)}`).join('') + 'Z';
  const col = D.cands[c].color;
  const grid = []; for (let v = 0; v <= ymax; v += 5) grid.push(`<line x1="${m.l}" x2="${W - m.r}" y1="${y(v)}" y2="${y(v)}" class="g"/><text x="${m.l - 6}" y="${y(v) + 4}" text-anchor="end">${v}</text>`);
  const ticks = []; let lastM = '';
  for (let i = i0; i < n; i++) { const mo = D.days[i].slice(0, 7); if (mo !== lastM && D.days[i].slice(8) <= '02') { ticks.push(`<text x="${x(i)}" y="${H - 8}" text-anchor="middle">${new Date(D.days[i] + 'T12:00:00Z').toLocaleDateString('fr-FR', { month: 'short' })}</text>`); } lastM = mo; }
  const dots = (D.points[c] || []).filter(p => p[0] >= D.days[i0]).map(p => {
    const i = D.days.findIndex(d => d >= p[0]); return i < 0 ? '' : `<circle cx="${x(i).toFixed(1)}" cy="${y(p[1]).toFixed(1)}" r="2.6" fill="${col}" opacity=".3"/>`; }).join('');
  const last = pts[pts.length - 1];
  return `<svg class="cchart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Évolution de ${esc(D.cands[c].name)} dans la moyenne des sondages, six derniers mois">
  ${grid.join('')}${ticks.join('')}<path d="${band}" fill="${col}" opacity=".14"/>${dots}<path d="${line}" fill="none" stroke="${col}" stroke-width="2.5" stroke-linejoin="round"/>
  <circle cx="${x(last.i)}" cy="${y(last.v)}" r="4.5" fill="${col}" stroke="var(--surface)" stroke-width="2"/></svg>`;
}

function page(s, rank, all) {
  const c = s.c, K = D.cands[c], name = K.name, M = (D.momentum || {})[c] || { state: 'nd' };
  const st = STATE[M.state] || STATE.nd;
  const qa = (D.mc.qualify || []).find(q => q.c === c);
  const allScen = (D.scenarios || []).find(x => x.key === 'all');
  const qb = !qa && allScen ? allScen.mc.qualify.find(q => q.c === c) : null;
  const q = D.features.probabilities !== false ? (qa || qb) : null;
  const he = Object.entries((D.houseAll || {})[c] || {}).filter(([, v]) => v != null).sort((a, b) => b[1] - a[1]);
  const polls = (D.recentPolls || {})[c] || [];
  const place = rank === 1 ? '1re' : rank + 'e';
  const lead = `${esc(name)}${K.party ? ` (${esc(K.party)})` : ''} recueille <b>${f1(s.v)} %</b> des intentions de vote au premier tour dans la moyenne des sondages calculée par La Sonde : ${place} place sur ${all.length} candidats suivis. ` +
    `Sur 30 jours, sa moyenne a évolué de ${sg(s.d30)} pt. ` +
    (M.state === 'up' || M.state === 'down' ? `Verdict du détecteur de bascule : <b>${st[1]}</b> (${sg(M.d14)} pt en 14 jours, certitude ${M.state === 'up' ? M.pUp : 100 - M.pUp} %). ` : M.state === 'flat' ? 'Sur 14 jours, sa tendance reste dans le bruit statistique : verdict « stable ». ' : '') +
    `${esc(name)} figure dans ${Math.round(s.presence)} % des hypothèses testées par les instituts sur 45 jours${s.presence < 30 ? ' : cette moyenne repose donc sur peu de sondages et doit être lue avec prudence' : ''}.`;
  const title = `Sondages ${name} présidentielle 2027 : ${f1(s.v)} % dans la moyenne | La Sonde`;
  const desc = `${name} est à ${f1(s.v)} % dans la moyenne des sondages de la présidentielle 2027 (${ord(rank)}), ${sg(s.d30)} pt en 30 jours. Tendance, probabilités, derniers sondages, effets instituts.`;
  const url = `${BASE}/candidat/${K.slug}/`;
  const others = all.filter(x => x.c !== c).map(x => `<a href="../${D.cands[x.c].slug}/"><i style="background:${D.cands[x.c].color}"></i>${esc(D.cands[x.c].short)}</a>`).join('');
  return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${url}">
<meta property="og:title" content="${esc(`${name} : ${f1(s.v)} % dans la moyenne des sondages 2027`)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:image" content="${BASE}/share/carte-du-jour.png">
<meta property="og:url" content="${url}">
<meta property="og:type" content="article">
<meta name="twitter:card" content="summary_large_image">
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='8' fill='%235b2cff'/%3E%3Ccircle cx='16' cy='16' r='3.6' fill='white'/%3E%3Ccircle cx='16' cy='16' r='9' fill='none' stroke='white' stroke-width='2.4'/%3E%3C/svg%3E">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,600;12..96,800&family=Inter:wght@400;600;700;800&display=swap" rel="stylesheet">
<link rel="stylesheet" href="../../styles.css">
<script data-goatcounter="https://lasonde.goatcounter.com/count" async src="https://gc.zgo.at/count.js"></script>
<script type="application/ld+json">${JSON.stringify({ '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: [
    { '@type': 'ListItem', position: 1, name: 'La Sonde', item: BASE + '/' }, { '@type': 'ListItem', position: 2, name: `Sondages ${name}`, item: url }] })}</script>
</head>
<body class="cpage">
<header class="top"><div class="wrap">
  <a class="brand" href="../../"><svg width="30" height="30" viewBox="0 0 32 32" aria-hidden="true"><defs><linearGradient id="lg" x1="0" x2="1"><stop offset="0" stop-color="#5b2cff"/><stop offset=".6" stop-color="#ff3d7f"/><stop offset="1" stop-color="#ff8a00"/></linearGradient></defs><rect width="32" height="32" rx="9" fill="url(#lg)"/><circle cx="16" cy="16" r="3.4" fill="#fff"/><circle cx="16" cy="16" r="8" fill="none" stroke="#fff" stroke-width="2.2" opacity=".85"/><circle cx="16" cy="16" r="12.5" fill="none" stroke="#fff" stroke-width="1.8" opacity=".45"/></svg><span>La <b>Sonde</b></span></a>
  <nav class="nav"><a href="../../#bascule">Bascule</a><a href="../../#course">La course</a><a href="../../#proba">Probabilités</a><a href="../../#sondages">Sondages</a></nav>
  <div class="tools"><a class="pill donate" href="${esc(D.site.donate)}" target="_blank" rel="noopener"><span aria-hidden="true">♥</span> <span>Soutenir</span></a></div>
</div></header>
<main class="wrap">
  <p class="crumb"><a href="../../">La Sonde</a> › Sondages ${esc(name)}</p>
  <section class="chero">
    <div>
      <div class="tag"><i style="background:${K.color}"></i>${esc(K.party || 'Candidat')}</div>
      <h1>Sondages ${esc(name)}<span>présidentielle 2027</span></h1>
      <p class="lead">${lead}</p>
    </div>
    <div class="cstats">
      <div><span>Moyenne</span><b class="num" style="color:${K.color}">${f1(s.v)} %</b><small>± ${f1(s.band)} pt</small></div>
      <div><span>Rang</span><b class="num">${rank === 1 ? '1re' : rank + 'e'}</b><small>sur ${all.length}</small></div>
      <div><span>Tendance 14 j</span><b class="num ${st[2]}">${st[0]} ${M.state === 'nd' ? '' : sg(M.d14)}</b><small>${st[1]}</small></div>
      ${q ? `<div><span>Qualification</span><b class="num">${f1(q.p)} %</b><small>${qa ? 'au second tour (modèle)' : 'scénario « tous déclarés »'}</small></div>` : `<div><span>30 jours</span><b class="num">${sg(s.d30)}</b><small>points</small></div>`}
    </div>
  </section>
  <section class="card"><h2>Six mois de sondages</h2><p class="note">Ligne : moyenne corrigée des effets instituts. Zone : marge d'incertitude. Points : chaque sondage publié.</p>${chart(c)}</section>
  <div class="grid2" style="margin-top:18px">
    <section class="card"><h2>Derniers sondages</h2>
      ${polls.length ? `<div class="scroll"><table class="tbl"><thead><tr><th>Institut</th><th>Fin du terrain</th><th class="c">Score</th><th class="c">Hypothèses</th></tr></thead><tbody>${polls.map(p => `<tr><td><b>${esc(p.inst)}</b><br><span class="note" style="margin:0">${esc(p.sponsor)}</span></td><td>${fshort(p.end)}</td><td class="c num"><b>${p.lo === p.hi ? f1(p.lo) : f1(p.lo) + "–" + f1(p.hi)} %</b></td><td class="c num">${p.h}</td></tr>`).join('')}</tbody></table></div>` : '<p class="note">Aucun sondage récent.</p>'}
      <p class="note">Un même sondage teste souvent plusieurs listes de candidats (hypothèses) : le score varie selon la liste, d'où les fourchettes.</p>
    </section>
    <section class="card"><h2>Effets instituts</h2>
      <p class="note">Écart habituel de chaque institut pour ${esc(name)} par rapport à la moyenne, mesuré sur 8 mois. Positif : l'institut le mesure plus haut que les autres.</p>
      ${he.length ? `<div class="helist">${he.map(([i, v]) => `<div><span>${esc(i)}</span><i class="hb"><b class="${v >= 0 ? 'pos' : 'neg'}" style="width:${Math.min(50, Math.abs(v) / 4 * 50)}%;${v >= 0 ? 'left:50%' : `right:50%`}"></b></i><em class="num">${sg(v)}</em></div>`).join('')}</div>` : '<p class="note">Pas assez de sondages pour mesurer les effets instituts.</p>'}
    </section>
  </div>
  <section class="card" style="margin-top:18px"><h2>Les autres candidats</h2><div class="olist">${others}</div>
    <p style="margin:16px 0 0"><a class="cta" href="../../#course">Voir la course complète →</a></p></section>
  <p class="note" style="margin:22px 0">Données au ${fdate(D.asOf)} (dernier terrain pris en compte). Page mise à jour automatiquement. Ces chiffres sont une moyenne de sondages publiés, pas un sondage. Méthode : <a href="../../#methode">voir la méthode</a>. Notices des sondages : Commission des sondages.</p>
</main>
<footer><div class="wrap"><p>La Sonde · ${esc(D.site.author)} · <a href="${esc(D.site.donate)}" target="_blank" rel="noopener">Soutenir le site</a> · <a href="mailto:${esc(D.site.contact)}">${esc(D.site.contact)}</a></p></div></footer>
</body>
</html>
`;
}

const all = D.standings;
fs.rmSync(P('site/candidat'), { recursive: true, force: true });
const urls = [];
all.forEach((s, i) => {
  const K = D.cands[s.c]; if (!K || !K.slug) return;
  const dir = P('site/candidat', K.slug); fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'index.html'), page(s, i + 1, all));
  urls.push(`${BASE}/candidat/${K.slug}/`);
});
fs.writeFileSync(P('site/sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
  [`${BASE}/`, ...["en", "de", "es", "it"].map(l => `${BASE}/?lang=${l}`), ...urls].map((u, i) => `  <url><loc>${u.replace(/&/g, "&amp;")}</loc><lastmod>${D.asOf}</lastmod><changefreq>daily</changefreq><priority>${i < 5 ? '1.0' : '0.8'}</priority></url>`).join('\n') + '\n</urlset>\n');
console.log(`Pages candidats : ${urls.length}`);
