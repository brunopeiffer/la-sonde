// La Sonde — référencement : accueil lisible sans JavaScript (5 langues, /en/ /de/ /es/ /it/),
// pages « Derniers sondages », une page par institut, une par duel de second tour, un bilan par mois.
// Appelé à la fin de scripts/pages.mjs (aucun changement du workflow nécessaire).
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const LANGS = ['fr', 'en', 'de', 'es', 'it'];
const LOC = { fr: 'fr-FR', en: 'en-GB', de: 'de-DE', es: 'es-ES', it: 'it-IT' };
const OGL = { fr: 'fr_FR', en: 'en_GB', de: 'de_DE', es: 'es_ES', it: 'it_IT' };
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const slug = s => String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const f1 = (x, L = 'fr') => x == null ? '–' : (Math.round(x * 10) / 10).toFixed(1).replace('.', L === 'en' ? '.' : ',');
const pc = (x, L = 'fr') => `${f1(x, L)}${L === 'en' || L === 'it' ? '%' : ' %'}`;
const sg = (x, L = 'fr') => x == null ? '–' : (x > 0 ? '+' : x < 0 ? '−' : '±') + f1(Math.abs(x), L);
const fd = (d, L = 'fr', o = { day: 'numeric', month: 'long', year: 'numeric' }) => new Date(d.slice(0, 10) + 'T12:00:00Z').toLocaleDateString(LOC[L], o);
const fromDay = n => new Date(n * 864e5).toISOString().slice(0, 10);
const MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
// Même règle d'affichage que le site : candidats déclarés à 5 % ou plus (au moins 4).
const shown = D => { const d = D.standings.filter(s => s.declared); const t = d.filter(s => s.v >= 5); return t.length >= 4 ? t : d.slice(0, 4); };

function loadI18N(P) {
  const ctx = { window: {} }; vm.createContext(ctx);
  for (const f of ['i18n.js', 'i18n-de.js', 'i18n-es.js', 'i18n-it.js']) vm.runInContext(fs.readFileSync(P('site', f), 'utf8'), ctx);
  return ctx.window.I18N;
}

// ---------- 1. Accueil statique ----------
function staticHome(html, L, D, I, BASE) {
  const t = k => (I[L] || {})[k] ?? (I.en || {})[k] ?? (I.fr || {})[k] ?? '';
  const C = c => D.cands[c] || { name: c, short: c, color: '#888' };
  let h = html;
  // Textes fixes écrits en dur dans la langue de la page (le JavaScript les réécrit ensuite à l'identique).
  h = h.replace(/(<(\w+)\b[^>]*\bdata-i18n="([^"]+)"[^>]*>)([^<]*)(<\/\2>)/g, (m, open, tag, k, inner, close) => { const v = t(k); return v && !/\{\w+\}/.test(v) ? open + v + close : m; });
  h = h.replace(/<html lang="[^"]*"/, `<html lang="${L}"`);
  // Sans JavaScript, le haut de page doit rester visible (la vue « accueil » est celle par défaut).
  h = h.replace(/<body>/, '<body data-view="accueil">');
  if (t('meta.title')) h = h.replace(/<title>[^<]*<\/title>/, `<title>${esc(t('meta.title'))}</title>`);
  if (t('meta.desc')) h = h.replace(/<meta name="description" content="[^"]*">/, `<meta name="description" content="${esc(t('meta.desc'))}">`);
  const url = `${BASE}/${L === 'fr' ? '' : L + '/'}`;
  h = h.replace(/<link rel="canonical" href="[^"]*">/, `<link rel="canonical" href="${url}">`).replace(/<meta property="og:url" content="[^"]*">/, `<meta property="og:url" content="${url}">`);
  h = h.replace(/<link rel="alternate" hreflang="[^"]*" href="[^"]*">\s*/g, '');
  const alt = LANGS.map(l => `<link rel="alternate" hreflang="${l}" href="${BASE}/${l === 'fr' ? '' : l + '/'}">`).join('\n') + `\n<link rel="alternate" hreflang="x-default" href="${BASE}/">\n`;
  h = h.replace(/(<link rel="canonical" href="[^"]*">)/, `$1\n${alt}`);
  if (!/property="og:locale"/.test(h)) h = h.replace(/(<meta property="og:url"[^>]*>)/, `$1\n<meta property="og:locale" content="${OGL[L]}">`);
  else h = h.replace(/<meta property="og:locale" content="[^"]*">/, `<meta property="og:locale" content="${OGL[L]}">`);
  // Classement du jour en dur (même règle que le site).
  const top = shown(D), max = Math.max(...top.map(s => s.v)) * 1.08;
  const pd = `<h2><span>${esc(t('pod.title'))}</span><span>${esc(fd(D.asOf, L, { day: 'numeric', month: 'short', year: 'numeric' }))}</span></h2>` + top.map(s =>
    `<div class="prow"><a class="nm" href="${L === 'fr' ? '' : L + '/'}candidat/${C(s.c).slug}/"><i style="background:${C(s.c).color}"></i><span>${esc(C(s.c).name)}</span></a><div class="v num">${f1(s.v, L)}</div><div class="delta num">${sg(s.d30, L)}</div><div class="bar"><i style="width:${(s.v / max * 100).toFixed(1)}%;background:${C(s.c).color}"></i></div></div>`).join('');
  h = h.replace(/<div class="podium" id="podium">(?:<!--s-->[\s\S]*?<!--\/s-->)?<\/div>/, `<div class="podium" id="podium"><!--s-->${pd}<!--/s--></div>`);
  // Derniers sondages en dur.
  const seen = new Set();
  const polls = D.surveys.filter(s => { const k = s.inst + s.end; if (seen.has(k)) return false; seen.add(k); return true; }).slice(0, 8);
  const pl = polls.map(s => { const r1 = s.hyps.find(x => x.round === 1); const top3 = r1 ? Object.entries(r1.r).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([c, v]) => `${esc(C(c).short)} ${f1(v, L).replace(/[.,]0$/, '')}`).join(' · ') : '';
    return `<div class="poll"><div class="who"><b>${esc(s.inst)}</b><span>${esc(s.sponsor)}</span><span class="num">${fd(s.end, L)}</span></div><div>${top3}</div></div>`; }).join('');
  h = h.replace(/<div class="polls" id="pollList">(?:<!--s-->[\s\S]*?<!--\/s-->)?<\/div>/, `<div class="polls" id="pollList"><!--s-->${pl}<!--/s--></div>`);
  return h;
}

// Liens relatifs d'une copie placée dans /xx/ : un niveau plus bas.
function relocate(html, L) {
  return html.replace(/\b(href|src)="(?!https?:|#|mailto:|data:|\/|\.\.\/|javascript:)([^"]*)"/g, (m, a, u) => `${a}="../${u}"`)
    .replace(/<script src="\.\.\/vendor\/d3\.min\.js"><\/script>/, `<script>window.SITE_ROOT='../';window.PAGE_LANG='${L}';</script>\n<script src="../vendor/d3.min.js"></script>`);
}

// ---------- 2. Pages thématiques (français) ----------
function shell({ D, BASE, depth, title, desc, url, crumbs, body, ld }) {
  const R = '../'.repeat(depth);
  return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${url}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:image" content="${BASE}/share/carte-du-jour.png">
<meta property="og:url" content="${url}">
<meta property="og:type" content="article">
<meta property="og:locale" content="fr_FR">
<meta name="twitter:card" content="summary_large_image">
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='8' fill='%235b2cff'/%3E%3Ccircle cx='16' cy='16' r='3.6' fill='white'/%3E%3Ccircle cx='16' cy='16' r='9' fill='none' stroke='white' stroke-width='2.4'/%3E%3C/svg%3E">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,600;12..96,800&family=Inter:wght@400;600;700;800&display=swap" rel="stylesheet">
<link rel="stylesheet" href="${R}styles.css?v=${Date.now().toString(36)}">
<script data-goatcounter="https://lasonde.goatcounter.com/count" async src="https://gc.zgo.at/count.js"></script>
<script type="application/ld+json">${JSON.stringify([{ '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: [{ name: 'La Sonde', item: BASE + '/' }, ...crumbs].map((x, i) => ({ '@type': 'ListItem', position: i + 1, name: x.name, item: x.item })) }, ...(ld || [])]).replace(/</g, '\\u003c')}</script>
</head>
<body class="cpage seo">
<header class="top"><div class="wrap">
  <a class="brand" href="${R}"><svg width="30" height="30" viewBox="0 0 32 32" aria-hidden="true"><defs><linearGradient id="lg" x1="0" x2="1"><stop offset="0" stop-color="#5b2cff"/><stop offset=".6" stop-color="#ff3d7f"/><stop offset="1" stop-color="#ff8a00"/></linearGradient></defs><rect width="32" height="32" rx="9" fill="url(#lg)"/><circle cx="16" cy="16" r="3.4" fill="#fff"/><circle cx="16" cy="16" r="8" fill="none" stroke="#fff" stroke-width="2.2" opacity=".85"/><circle cx="16" cy="16" r="12.5" fill="none" stroke="#fff" stroke-width="1.8" opacity=".45"/></svg><span>La <b>Sonde</b></span></a>
  <nav class="nav"><a href="${R}">Moyenne</a><a href="${R}sondages/">Derniers sondages</a><a href="${R}second-tour/">Seconds tours</a><a href="${R}instituts/">Instituts</a><a href="${R}bilan/">Bilans mensuels</a></nav>
  <div class="tools"><a class="pill donate" href="${esc(D.site.donate)}" target="_blank" rel="noopener"><span aria-hidden="true">♥</span> <span>Soutenir</span></a></div>
</div></header>
<main class="wrap">
  <p class="crumb"><a href="${R}">La Sonde</a>${crumbs.map((c, i) => i === crumbs.length - 1 ? ` › ${esc(c.name)}` : ` › <a href="${c.rel}">${esc(c.name)}</a>`).join('')}</p>
${body}
  <p class="note" style="margin:22px 0">Données au ${fd(D.asOf)} · moyenne de tous les sondages publiés (notices de la Commission des sondages), corrigée des effets instituts : ce n'est pas un sondage. <a href="${R}a-propos/">Méthode et sources</a></p>
</main>
<footer><div class="wrap"><p>La Sonde · ${esc(D.site.author)} · <a href="${R}lettre/">Le point du lundi</a> · <a href="mailto:${esc(D.site.contact)}">${esc(D.site.contact)}</a></p></div></footer>
</body>
</html>
`;
}

function lineChart(pts, { color = '#5b2cff', ref = null, W = 680, H = 220, fmtY = v => f1(v) } = {}) {
  if (pts.length < 2) return '';
  const xs = pts.map(p => Date.parse(p[0])), ys = pts.map(p => p[1]);
  const x0 = Math.min(...xs), x1 = Math.max(...xs);
  let lo = Math.min(...ys, ref ?? Infinity), hi = Math.max(...ys, ref ?? -Infinity); const pad = Math.max(1, (hi - lo) * .15); lo -= pad; hi += pad;
  const X = x => 40 + (x - x0) / (x1 - x0 || 1) * (W - 56), Y = y => 12 + (1 - (y - lo) / (hi - lo)) * (H - 40);
  const d = pts.map((p, i) => `${i ? 'L' : 'M'}${X(xs[i]).toFixed(1)},${Y(p[1]).toFixed(1)}`).join('');
  const ticks = [lo + pad, (lo + hi) / 2, hi - pad].map(v => `<text x="34" y="${(Y(v) + 4).toFixed(1)}" font-size="11" text-anchor="end" fill="currentColor" opacity=".6">${fmtY(v)}</text><line x1="40" x2="${W - 16}" y1="${Y(v).toFixed(1)}" y2="${Y(v).toFixed(1)}" stroke="currentColor" opacity=".08"/>`).join('');
  const xl = [0, Math.floor(pts.length / 2), pts.length - 1].map(i => `<text x="${X(xs[i]).toFixed(1)}" y="${H - 8}" font-size="11" text-anchor="${i === 0 ? 'start' : i === pts.length - 1 ? 'end' : 'middle'}" fill="currentColor" opacity=".6">${fd(pts[i][0], 'fr', { month: 'short', year: 'numeric' })}</text>`).join('');
  const r = ref != null ? `<line x1="40" x2="${W - 16}" y1="${Y(ref).toFixed(1)}" y2="${Y(ref).toFixed(1)}" stroke="currentColor" stroke-dasharray="4 4" opacity=".45"/>` : '';
  return `<svg viewBox="0 0 ${W} ${H}" class="attsvg" role="img">${ticks}${r}<path d="${d}" fill="none" stroke="${color}" stroke-width="2.6"/>${xl}</svg>`;
}

export function buildSEO({ D, P, BASE }) {
  const I = loadI18N(P);
  const C = c => D.cands[c] || { name: c, short: c, color: '#888' };
  const urls = [];
  const write = (rel, html) => { const dir = P('site', rel); fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(path.join(dir, 'index.html'), html); urls.push(`${BASE}/${rel}/`); };
  for (const d of ['sondages', 'instituts', 'institut', 'second-tour', 'bilan']) fs.rmSync(P('site', d), { recursive: true, force: true });

  // Sondages dédoublonnés (1er et 2nd tours d'une même enquête réunis).
  const byK = new Map();
  for (const s of D.surveys) { const k = s.inst + s.end; const m = byK.get(k); if (m) m.hyps = [...m.hyps, ...s.hyps]; else byK.set(k, { ...s, hyps: [...s.hyps] }); }
  const SV = [...byK.values()].sort((a, b) => b.end.localeCompare(a.end));
  const sid = s => slug(`${s.inst}-${s.end}`);
  const instSlug = i => slug(i);
  const notice = s => s.source && /commission-des-sondages/.test(s.source) ? `<a href="${esc(s.source)}" target="_blank" rel="noopener">notice officielle</a>` : s.file ? `notice n° ${esc((s.file.match(/^\d+/) || [''])[0])}` : '';
  const hypTable = (s, R) => {
    const r1 = s.hyps.filter(h => h.round === 1), r2 = s.hyps.filter(h => h.round === 2);
    const cs = [...new Set(r1.flatMap(h => Object.keys(h.r)))].sort((a, b) => Math.max(...r1.map(h => h.r[b] ?? -1)) - Math.max(...r1.map(h => h.r[a] ?? -1)));
    const t1 = r1.length ? `<div class="scroll"><table class="tbl"><thead><tr><th>Candidat</th>${r1.map((h, i) => `<th class="c">H${i + 1}</th>`).join('')}</tr></thead><tbody>${cs.map(c => `<tr><td>${C(c).slug ? `<a href="${R}candidat/${C(c).slug}/">${esc(C(c).name)}</a>` : esc(C(c).name)}</td>${r1.map(h => `<td class="c num">${h.r[c] == null ? '–' : f1(h.r[c]).replace(/,0$/, '')}</td>`).join('')}</tr>`).join('')}</tbody></table></div>` : '';
    const t2 = r2.length ? `<p class="note" style="margin-top:8px"><b>Second tour :</b> ${r2.map(h => Object.entries(h.r).map(([c, v]) => `${esc(C(c).short)} ${f1(v).replace(/,0$/, '')} %`).join(' – ')).join(' · ')}</p>` : '';
    return t1 + t2;
  };

  // /sondages/
  {
    const body = `<section class="chero" style="grid-template-columns:1fr"><div><div class="tag"><i style="background:#5b2cff"></i>Présidentielle 2027</div>
      <h1>Derniers sondages de la présidentielle 2027<span>${SV.length} enquêtes récentes, avec toutes leurs hypothèses</span></h1>
      <p class="lead">Chaque enquête d'intentions de vote publiée, avec l'institut, le commanditaire, les dates de terrain, l'échantillon et le score de chaque candidat dans chaque hypothèse testée (H1, H2…). Dernière enquête : <b>${esc(SV[0].inst)}</b> pour ${esc(SV[0].sponsor)}, terrain achevé le ${fd(SV[0].end)}.</p></div></section>
      ${SV.map(s => `<section class="card" id="${sid(s)}" style="margin-top:14px"><h2 style="margin:0 0 4px">${esc(s.inst)} pour ${esc(s.sponsor)} · ${fd(s.end)}</h2>
        <p class="note" style="margin:0 0 10px">Terrain du ${fd(s.start)} au ${fd(s.end)} · ${s.n.toLocaleString('fr-FR')} personnes · ${s.hyps.filter(h => h.round === 1).length} hypothèse(s) de 1er tour · <a href="../institut/${instSlug(s.inst)}/">tous les sondages ${esc(s.inst)}</a>${notice(s) ? ' · ' + notice(s) : ''}</p>
        ${hypTable(s, '../')}</section>`).join('')}
      <section class="card" style="margin-top:18px"><h2>Aller plus loin</h2><p><a href="../second-tour/">Les seconds tours testés</a> · <a href="../instituts/">Les instituts et leurs écarts</a> · <a href="../bilan/">Les bilans mensuels</a></p></section>`;
    write('sondages', shell({ D, BASE, depth: 1, title: `Derniers sondages présidentielle 2027 : ${SV[0].inst} (${fd(SV[0].end, 'fr', { day: 'numeric', month: 'long' })}) et les autres | La Sonde`,
      desc: `Tous les derniers sondages de la présidentielle 2027 : ${SV.slice(0, 4).map(s => s.inst).join(', ')}… Scores de chaque candidat dans chaque hypothèse, dates, échantillons et notices officielles.`,
      url: `${BASE}/sondages/`, crumbs: [{ name: 'Derniers sondages', item: `${BASE}/sondages/`, rel: './' }], body,
      ld: [{ '@context': 'https://schema.org', '@type': 'ItemList', name: 'Derniers sondages présidentielle 2027', itemListElement: SV.slice(0, 20).map((s, i) => ({ '@type': 'ListItem', position: i + 1, name: `${s.inst} pour ${s.sponsor}, ${s.end}`, url: `${BASE}/sondages/#${sid(s)}` })) }] }));
  }

  // /institut/<slug>/ et /instituts/
  const profiles = D.instituteProfiles || [];
  const majors = shown(D).map(s => s.c);
  for (const p of profiles) {
    const mine = SV.filter(s => s.inst === p.inst);
    const he = majors.map(c => [c, ((D.houseAll || {})[c] || {})[p.inst]]).filter(([, v]) => v != null);
    const body = `<section class="chero" style="grid-template-columns:1fr"><div><div class="tag"><i style="background:#5b2cff"></i>Institut de sondage</div>
      <h1>Sondages ${esc(p.inst)} présidentielle 2027<span>${p.surveys} enquêtes, ${p.hyps} hypothèses depuis ${fd(p.first, 'fr', { month: 'long', year: 'numeric' })}</span></h1>
      <p class="lead">${esc(p.inst)} a publié ${p.surveys} enquêtes d'intentions de vote pour la présidentielle 2027 suivies par La Sonde, la dernière le ${fd(p.last)} pour ${esc(p.lastSponsor)}. Échantillon médian : ${p.medianN.toLocaleString('fr-FR')} personnes. Principaux commanditaires : ${p.sponsors.slice(0, 4).map(x => `${esc(x.k)} (${x.n})`).join(', ')}.${p.site ? ` <a href="${esc(p.site)}" target="_blank" rel="noopener">Site de l'institut</a>.` : ''}</p></div></section>
      ${he.length ? `<section class="card" style="margin-top:14px"><h2>L'effet institut ${esc(p.inst)}</h2><p class="note">Écart moyen entre ${esc(p.inst)} et la tendance commune à tous les instituts, pour chaque candidat. Un écart positif signifie que l'institut mesure habituellement ce candidat un peu plus haut que les autres. La Sonde corrige ces écarts avant de calculer sa moyenne ; ils ne signifient pas que l'institut se trompe.</p>
        <div class="helist">${he.map(([c, v]) => `<div><span>${esc(C(c).short)}</span><i class="hb"><b class="${v >= 0 ? 'pos' : 'neg'}" style="width:${Math.min(50, Math.abs(v) / 4 * 50)}%;${v >= 0 ? 'left:50%' : `right:50%`}"></b></i><em class="num">${sg(v)}</em></div>`).join('')}</div></section>` : ''}
      ${mine.length ? `<h2 style="margin-top:22px">Ses derniers sondages</h2>${mine.map(s => `<section class="card" style="margin-top:12px"><h3 style="margin:0 0 4px">${esc(s.sponsor)} · ${fd(s.end)}</h3><p class="note" style="margin:0 0 8px">Terrain du ${fd(s.start)} au ${fd(s.end)} · ${s.n.toLocaleString('fr-FR')} personnes${notice(s) ? ' · ' + notice(s) : ''}</p>${hypTable(s, '../../')}</section>`).join('')}` : ''}
      <section class="card" style="margin-top:18px"><h2>Les autres instituts</h2><div class="olist">${profiles.filter(x => x.inst !== p.inst).map(x => `<a href="../${instSlug(x.inst)}/">${esc(x.inst)}</a>`).join('')}</div></section>`;
    write(`institut/${instSlug(p.inst)}`, shell({ D, BASE, depth: 2, title: `Sondage ${p.inst} présidentielle 2027 : derniers résultats et effet institut | La Sonde`,
      desc: `Tous les sondages ${p.inst} sur la présidentielle 2027 (${p.surveys} enquêtes), le dernier du ${fd(p.last)} pour ${p.lastSponsor}, et l'écart habituel de l'institut pour chaque candidat.`,
      url: `${BASE}/institut/${instSlug(p.inst)}/`, crumbs: [{ name: 'Instituts', item: `${BASE}/instituts/`, rel: '../../instituts/' }, { name: p.inst, item: `${BASE}/institut/${instSlug(p.inst)}/` }], body }));
  }
  write('instituts', shell({ D, BASE, depth: 1, title: 'Instituts de sondage présidentielle 2027 : Ifop, Elabe, Harris, OpinionWay… | La Sonde',
    desc: `Les ${profiles.length} instituts qui sondent la présidentielle 2027 : nombre d'enquêtes, derniers sondages et effet institut de chacun.`,
    url: `${BASE}/instituts/`, crumbs: [{ name: 'Instituts', item: `${BASE}/instituts/` }],
    body: `<section class="chero" style="grid-template-columns:1fr"><div><h1>Les instituts de sondage<span>présidentielle 2027</span></h1><p class="lead">Chaque institut a ses méthodes et ses écarts habituels. La Sonde les mesure et les corrige avant de calculer sa moyenne.</p></div></section>
      <section class="card"><div class="scroll"><table class="tbl"><thead><tr><th>Institut</th><th class="c">Enquêtes</th><th class="c">Hypothèses</th><th class="c">Dernière</th><th>Commanditaire</th></tr></thead><tbody>${profiles.map(p => `<tr><td><a href="../institut/${instSlug(p.inst)}/"><b>${esc(p.inst)}</b></a></td><td class="c num">${p.surveys}</td><td class="c num">${p.hyps}</td><td class="c">${fd(p.last, 'fr', { day: 'numeric', month: 'short', year: 'numeric' })}</td><td>${esc(p.lastSponsor)}</td></tr>`).join('')}</tbody></table></div></section>` }));

  // /second-tour/<a>-<b>/ et /second-tour/
  // Le candidat en tête est nommé en premier (« Le Pen – Mélenchon »), comme dans les recherches.
  const duels = (D.duels || []).filter(d => d.n >= 2).map(d => d.vb > d.va ? { ...d, a: d.b, b: d.a, va: d.vb, vb: d.va, polls: (d.polls || []).map(p => ({ ...p, va: p.vb, vb: p.va })), series: (d.series || []).map(([x, v]) => [x, Math.round((100 - v) * 10) / 10]) } : d);
  const dslug = d => `${C(d.a).slug || slug(C(d.a).name)}-${C(d.b).slug || slug(C(d.b).name)}`;
  for (const d of duels) {
    const [A, B] = [C(d.a), C(d.b)];
    const lead = d.va >= d.vb ? [A, d.va, B, d.vb] : [B, d.vb, A, d.va];
    const pts = (d.series || []).map(([day, v]) => [fromDay(day), v]);
    const body = `<section class="chero" style="grid-template-columns:1fr"><div><div class="tag"><i style="background:${A.color}"></i>Second tour</div>
      <h1>Sondage second tour ${esc(A.name)} – ${esc(B.name)}<span>présidentielle 2027</span></h1>
      <p class="lead">Dans la moyenne des ${d.n} sondages ayant testé ce duel, <b>${esc(lead[0].name)}</b> obtient <b>${pc(lead[1])}</b> contre ${pc(lead[3])} pour ${esc(lead[2].name)} (dernier sondage le ${fd(d.last)}). Un second tour testé aujourd'hui n'est pas une prévision : il mesure un rapport de force à date.</p></div></section>
      ${pts.length > 1 ? `<section class="card" style="margin-top:14px"><h2>Évolution : score de ${esc(A.name)}</h2><p class="note">Moyenne lissée des sondages ; la ligne pointillée marque 50 %.</p>${lineChart(pts, { color: A.color, ref: 50, fmtY: v => Math.round(v) + ' %' })}</section>` : ''}
      <section class="card" style="margin-top:14px"><h2>Les sondages de ce duel</h2><div class="scroll"><table class="tbl"><thead><tr><th>Institut</th><th class="c">Fin du terrain</th><th class="c">${esc(A.short)}</th><th class="c">${esc(B.short)}</th></tr></thead><tbody>${[...(d.polls || [])].sort((x, y) => y.end.localeCompare(x.end)).map(p => `<tr><td><a href="../../institut/${instSlug(p.inst)}/">${esc(p.inst)}</a></td><td class="c">${fd(p.end, 'fr', { day: 'numeric', month: 'short', year: 'numeric' })}</td><td class="c num">${f1(p.va).replace(/,0$/, '')} %</td><td class="c num">${f1(p.vb).replace(/,0$/, '')} %</td></tr>`).join('')}</tbody></table></div></section>
      <section class="card" style="margin-top:14px"><h2>Les fiches des candidats</h2><div class="olist">${[A, B].filter(x => x.slug).map(x => `<a href="../../candidat/${x.slug}/"><i style="background:${x.color}"></i>${esc(x.name)}</a>`).join('')}</div>
        <h2 style="margin-top:18px">Les autres duels</h2><div class="olist">${duels.filter(x => x !== d).map(x => `<a href="../${dslug(x)}/">${esc(C(x.a).short)} – ${esc(C(x.b).short)}</a>`).join('')}</div></section>`;
    write(`second-tour/${dslug(d)}`, shell({ D, BASE, depth: 2, title: `Sondage second tour ${A.short} ${B.short} 2027 : ${lead[0].short} ${f1(lead[1])} % | La Sonde`,
      desc: `${A.name} contre ${B.name} au second tour de la présidentielle 2027 : moyenne des ${d.n} sondages (${lead[0].short} ${pc(lead[1])}), évolution et détail de chaque sondage.`,
      url: `${BASE}/second-tour/${dslug(d)}/`, crumbs: [{ name: 'Seconds tours', item: `${BASE}/second-tour/`, rel: '../' }, { name: `${A.short} – ${B.short}`, item: `${BASE}/second-tour/${dslug(d)}/` }], body }));
  }
  write('second-tour', shell({ D, BASE, depth: 1, title: 'Sondages second tour présidentielle 2027 : tous les duels testés | La Sonde',
    desc: `Tous les seconds tours testés pour la présidentielle 2027 : ${duels.slice(0, 4).map(d => `${C(d.a).short}-${C(d.b).short}`).join(', ')}… moyenne des sondages et évolution.`,
    url: `${BASE}/second-tour/`, crumbs: [{ name: 'Seconds tours', item: `${BASE}/second-tour/` }],
    body: `<section class="chero" style="grid-template-columns:1fr"><div><h1>Les seconds tours testés<span>présidentielle 2027</span></h1><p class="lead">Moyenne des sondages pour chaque duel de second tour testé par les instituts. Ce sont des rapports de force à date, pas des prévisions.</p></div></section>
      <section class="card"><div class="scroll"><table class="tbl"><thead><tr><th>Duel</th><th class="c">Moyenne</th><th class="c">Sondages</th><th class="c">Dernier</th></tr></thead><tbody>${duels.map(d => `<tr><td><a href="../second-tour/${dslug(d)}/"><b>${esc(C(d.a).name)} – ${esc(C(d.b).name)}</b></a></td><td class="c num">${f1(d.va)} – ${f1(d.vb)}</td><td class="c num">${d.n}</td><td class="c">${fd(d.last, 'fr', { day: 'numeric', month: 'short' })}</td></tr>`).join('')}</tbody></table></div></section>` }));

  // /bilan/AAAA-MM/ et /bilan/
  const days = D.days || [];
  const valAt = (c, date) => { const S = D.series[c]; if (!S) return null; let k = -1; for (let i = 0; i < days.length; i++) { if (days[i] <= date && S.v[i] != null) k = i; } return k < 0 ? null : S.v[k]; };
  const firstCovered = SV.length ? SV[SV.length - 1].end.slice(0, 7) : null;
  const months = [];
  if (firstCovered) { let [y, m] = firstCovered.split('-').map(Number); m++; if (m > 12) { m = 1; y++; }
    const last = D.asOf.slice(0, 7); while (`${y}-${String(m).padStart(2, '0')}` <= last) { months.push(`${y}-${String(m).padStart(2, '0')}`); m++; if (m > 12) { m = 1; y++; } } }
  const declared = D.standings.filter(s => s.declared && s.v >= 2).map(s => s.c);
  for (const ym of months) {
    const [y, m] = ym.split('-').map(Number);
    const start = `${ym}-01`, endD = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10), end = endD < D.asOf ? endD : D.asOf, cur = endD >= D.asOf;
    const label = `${MONTHS[m - 1]} ${y}`;
    const prevEnd = new Date(Date.UTC(y, m - 1, 0)).toISOString().slice(0, 10);
    const rows = declared.map(c => ({ c, a: valAt(c, prevEnd), b: valAt(c, end) })).filter(r => r.a != null && r.b != null).map(r => ({ ...r, d: r.b - r.a })).sort((x, y2) => y2.b - x.b);
    const mv = [...rows].sort((x, y2) => y2.d - x.d), up = mv[0], dn = mv[mv.length - 1];
    const inMonth = SV.filter(s => s.end >= start && s.end <= end);
    const ev = (D.events || []).filter(e => e.date >= start && e.date <= end);
    const body = `<section class="chero" style="grid-template-columns:1fr"><div><div class="tag"><i style="background:#5b2cff"></i>Bilan mensuel${cur ? ' · en cours' : ''}</div>
      <h1>Sondages présidentielle 2027 : le bilan de ${label}<span>${inMonth.length} sondages publiés${cur ? `, données au ${fd(D.asOf)}` : ''}</span></h1>
      <p class="lead">${rows.length ? `Fin ${cur ? 'provisoire ' : ''}de ${MONTHS[m - 1]}, la moyenne des sondages place ${rows.slice(0, 3).map(r => `${esc(C(r.c).name)} à ${pc(r.b)}`).join(', ')}. Sur le mois, la plus forte progression est celle de ${esc(C(up.c).name)} (${sg(up.d)} pt) et le plus fort recul celui de ${esc(C(dn.c).name)} (${sg(dn.d)} pt).` : ''}</p></div></section>
      ${rows.length ? `<section class="card" style="margin-top:14px"><h2>La moyenne, début et fin de mois</h2><div class="scroll"><table class="tbl"><thead><tr><th>Candidat</th><th class="c">Fin du mois précédent</th><th class="c">Fin ${cur ? '(provisoire)' : 'de mois'}</th><th class="c">Évolution</th></tr></thead><tbody>${rows.map(r => `<tr><td>${C(r.c).slug ? `<a href="../../candidat/${C(r.c).slug}/">${esc(C(r.c).name)}</a>` : esc(C(r.c).name)}</td><td class="c num">${pc(r.a)}</td><td class="c num"><b>${pc(r.b)}</b></td><td class="c num ${r.d >= .5 ? 'up' : r.d <= -.5 ? 'down' : 'flat'}">${sg(r.d)}</td></tr>`).join('')}</tbody></table></div><p class="note">Candidats déclarés à 2 % ou plus. Moyenne corrigée des effets instituts ; une évolution de moins d'un point reste généralement dans la marge.</p></section>` : ''}
      ${ev.length ? `<section class="card" style="margin-top:14px"><h2>Les événements du mois</h2><ul class="cev">${ev.map(e => `<li><b>${fd(e.date)}</b> · ${esc(e.fr)}</li>`).join('')}</ul></section>` : ''}
      ${inMonth.length ? `<section class="card" style="margin-top:14px"><h2>Les sondages du mois</h2><ul class="cev">${inMonth.map(s => `<li><b>${fd(s.end, 'fr', { day: 'numeric', month: 'short' })}</b> · <a href="../../institut/${instSlug(s.inst)}/">${esc(s.inst)}</a> pour ${esc(s.sponsor)}, ${s.n.toLocaleString('fr-FR')} personnes</li>`).join('')}</ul></section>` : ''}
      <section class="card" style="margin-top:14px"><h2>Les autres mois</h2><div class="olist">${months.filter(x => x !== ym).map(x => `<a href="../${x}/">${MONTHS[+x.slice(5) - 1]} ${x.slice(0, 4)}</a>`).join('')}</div></section>`;
    write(`bilan/${ym}`, shell({ D, BASE, depth: 2, title: `Sondages présidentielle 2027 : bilan de ${label} | La Sonde`,
      desc: `Ce qui a bougé dans les sondages de la présidentielle 2027 en ${label} : ${rows.slice(0, 3).map(r => `${C(r.c).short} ${pc(r.b)}`).join(', ')}. Évolutions du mois, événements et ${inMonth.length} sondages publiés.`,
      url: `${BASE}/bilan/${ym}/`, crumbs: [{ name: 'Bilans mensuels', item: `${BASE}/bilan/`, rel: '../' }, { name: label, item: `${BASE}/bilan/${ym}/` }], body,
      ld: [{ '@context': 'https://schema.org', '@type': 'Article', headline: `Sondages présidentielle 2027 : bilan de ${label}`, datePublished: end, dateModified: D.asOf, author: { '@type': 'Person', name: D.site.author }, publisher: { '@type': 'Organization', name: 'La Sonde', url: BASE + '/' } }] }));
  }
  write('bilan', shell({ D, BASE, depth: 1, title: 'Sondages présidentielle 2027 : les bilans mois par mois | La Sonde',
    desc: 'Mois après mois, ce qui a bougé dans les sondages de la présidentielle 2027 : moyennes, évolutions, événements et sondages publiés.',
    url: `${BASE}/bilan/`, crumbs: [{ name: 'Bilans mensuels', item: `${BASE}/bilan/` }],
    body: `<section class="chero" style="grid-template-columns:1fr"><div><h1>Les bilans mensuels<span>présidentielle 2027</span></h1></div></section><section class="card"><ul class="cev">${[...months].reverse().map(x => `<li><a href="${x}/"><b>${MONTHS[+x.slice(5) - 1]} ${x.slice(0, 4)}</b></a></li>`).join('')}</ul></section>` }));

  // ---------- 1 + 3. Accueil statique et accueils par langue ----------
  const idx = P('site/index.html');
  let root = fs.readFileSync(idx, 'utf8');
  // Liens « Explorer » en bas de l'accueil (maillage interne vers les nouvelles pages).
  const explore = `<nav class="seolinks wrap" id="seolinks" aria-label="Explorer"><a href="sondages/">Derniers sondages</a><a href="second-tour/">Seconds tours</a><a href="instituts/">Instituts</a><a href="bilan/">Bilans mensuels</a>${duels.slice(0, 4).map(d => `<a href="second-tour/${dslug(d)}/">${esc(C(d.a).short)} – ${esc(C(d.b).short)}</a>`).join('')}${profiles.slice(0, 5).map(p => `<a href="institut/${instSlug(p.inst)}/">Sondages ${esc(p.inst)}</a>`).join('')}</nav>`;
  root = /<nav class="seolinks[^"]*" id="seolinks"/.test(root) ? root.replace(/<nav class="seolinks[^"]*" id="seolinks"[\s\S]*?<\/nav>/, explore) : root.replace(/<footer/, `${explore}\n<footer`);
  const fr = staticHome(root, 'fr', D, I, BASE);
  fs.writeFileSync(idx, fr);
  for (const L of LANGS.slice(1)) {
    const dir = P('site', L); fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'index.html'), relocate(staticHome(root, L, D, I, BASE), L));
    urls.push(`${BASE}/${L}/`);
  }
  return urls;
}
