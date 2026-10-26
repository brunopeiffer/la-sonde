// La Sonde — le post du jour pour les réseaux : un format différent chaque jour de la semaine,
// chacun avec son texte et sa propre image (1200 × 630), et jamais deux fois le même texte.
//   lundi    : le classement (carte du jour)          vendredi : il y a cinq ans (2022 à la même date)
//   mardi    : les duels de second tour               samedi   : focus sur un candidat (rotation hebdomadaire)
//   mercredi : qui ira au second tour ? (probabilités) dimanche : effet institut (rotation hebdomadaire)
//   jeudi    : où iraient ses électeurs ? (reports mesurés, rotation)
// Un format sans données (ou dont le texte a déjà été publié récemment) cède la place au suivant.
import { readJSON, themeSvg } from './lib.mjs';
const CFG = (() => { try { return readJSON(new URL('../config.json', import.meta.url).pathname); } catch { return {}; } })();
const CANDS = (() => { try { return readJSON(new URL('../data/candidates.json', import.meta.url).pathname); } catch { return {}; } })();

const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const f1 = x => (Math.round(x * 10) / 10).toFixed(1).replace('.', ',');
const sg = x => (x > 0 ? '+' : x < 0 ? '−' : '±') + f1(Math.abs(x));
const fd = x => f1(x).replace(/,0$/, '');
const pc = p => p < 1 ? '< 1 %' : p > 99 ? '> 99 %' : `${Math.round(p)} %`;
const NB = s => s.replace(/ (%|pts?\b)/g, ' $1');

// Cadre commun des images : même en-tête et même pied que la carte du jour.
function frame(o) { return themeSvg(frame0(o), CANDS, (CFG.bluesky || {}).style || 'dark'); }
function frame0({ kicker, title, body, note }) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630" font-family="Inter">
  <defs><linearGradient id="g" x1="0" x2="1"><stop offset="0" stop-color="#5b2cff"/><stop offset=".6" stop-color="#ff3d7f"/><stop offset="1" stop-color="#ff8a00"/></linearGradient></defs>
  <rect width="1200" height="630" fill="#fbf7f1"/><rect width="1200" height="10" fill="url(#g)"/>
  <rect x="56" y="44" width="52" height="52" rx="15" fill="url(#g)"/>
  <circle cx="82" cy="70" r="5.5" fill="#fff"/><circle cx="82" cy="70" r="13" fill="none" stroke="#fff" stroke-width="3.5" opacity=".85"/><circle cx="82" cy="70" r="20.5" fill="none" stroke="#fff" stroke-width="3" opacity=".45"/>
  <text x="124" y="82" font-size="36" font-weight="800" fill="#15131f">La Sonde</text>
  <text x="1144" y="80" font-size="20" font-weight="800" fill="#5b2cff" letter-spacing="2" text-anchor="end">${esc(kicker.toUpperCase())}</text>
  <text x="56" y="148" font-size="36" font-weight="800" fill="#15131f" letter-spacing="-0.5">${esc(title)}</text>
  ${body}
  <text x="56" y="600" font-size="17" font-weight="600" fill="#7d788c">${esc(note)}</text>
  <text x="1144" y="600" font-size="22" font-weight="800" fill="#5b2cff" text-anchor="end">la-sonde.fr</text>
</svg>`;
}

// Barres horizontales génériques : [{label, color, v, txt}]
function bars(rows, { x0 = 300, y0 = 190, rh = 50, bw = 640, max } = {}) {
  const m = max || Math.max(...rows.map(r => r.v), 1);
  return rows.map((r, i) => {
    const y = y0 + i * rh, w = Math.max(6, r.v / m * bw);
    return `<circle cx="70" cy="${y + 18}" r="8" fill="${r.color}"/>
    <text x="88" y="${y + 25}" font-size="22" font-weight="600" fill="#15131f">${esc(r.label)}</text>
    <rect x="${x0}" y="${y + 6}" width="${w}" height="24" rx="12" fill="${r.color}"/>
    <text x="${x0 + w + 12}" y="${y + 26}" font-size="24" font-weight="800" fill="#15131f">${esc(r.txt)}</text>`;
  }).join('');
}

export function buildPosts(D, now = new Date()) {
  const C = c => D.cands[c] || { name: c, short: c, color: '#888' };
  const base = D.site.url.replace(/\/$/, '');
  const week = Math.floor((now - Date.UTC(2026, 0, 5)) / (7 * 864e5)); // n° de semaine, pour les rotations
  const asOf = new Date(D.asOf + 'T12:00:00Z').toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' });
  const J = D.mc?.daysToR1;
  const posts = {};

  // 1. Lundi — le classement (image = carte du jour déjà produite par share.mjs)
  {
    const top = (() => { const d = D.standings.filter(s => s.declared); const t = d.filter(s => s.v >= 5); return (t.length >= 4 ? t : d.slice(0, 4)).slice(0, 8); })().slice(0, 4).map(s => `${C(s.c).short} ${f1(s.v)} %`).join(' · ');
    const head = (D.changes?.fr || [])[0]?.t || '';
    posts.classement = {
      text: `📊 Présidentielle 2027, moyenne des sondages :\n${top}\n\n${head}`, link: `${base}/`, png: 'site/share/carte-du-jour.png',
      alt: `Moyenne des sondages de la présidentielle 2027 au ${asOf} : ` + (() => { const d = D.standings.filter(s => s.declared); const t = d.filter(s => s.v >= 5); return (t.length >= 4 ? t : d.slice(0, 4)).slice(0, 8); })().map(x => `${C(x.c).name} ${f1(x.v)} %`).join(', ') + '.'
    };
  }

  // 2. Mardi — les duels de second tour
  if (D.duels?.length) {
    const ds = [...D.duels].sort((a, b) => b.n - a.n).slice(0, 5).map(d => (d.va >= d.vb ? d : { a: d.b, b: d.a, va: d.vb, vb: d.va, n: d.n }));
    const close = [...ds].sort((a, b) => (a.va - a.vb) - (b.va - b.vb))[0];
    const body = ds.map((d, i) => {
      const y = 190 + i * 74, W = 760, wa = W * d.va / (d.va + d.vb), x0 = 380;
      return `<text x="56" y="${y + 28}" font-size="22" font-weight="700" fill="#15131f">${esc(C(d.a).short)} – ${esc(C(d.b).short)}</text>
      <text x="56" y="${y + 52}" font-size="16" font-weight="600" fill="#7d788c">${d.n} sondage${d.n > 1 ? 's' : ''}</text>
      <rect x="${x0}" y="${y + 8}" width="${wa - 2}" height="36" rx="10" fill="${C(d.a).color}"/>
      <rect x="${x0 + wa + 2}" y="${y + 8}" width="${W - wa - 2}" height="36" rx="10" fill="${C(d.b).color}" opacity=".85"/>
      <text x="${x0 + 14}" y="${y + 34}" font-size="21" font-weight="800" fill="#fff">${esc(C(d.a).short)} ${fd(d.va)} %</text>
      <text x="${x0 + W - 14}" y="${y + 34}" font-size="21" font-weight="800" fill="#fff" text-anchor="end">${fd(d.vb)} % ${esc(C(d.b).short)}</text>
      <line x1="${x0 + W / 2}" y1="${y}" x2="${x0 + W / 2}" y2="${y + 52}" stroke="#15131f" stroke-width="2" stroke-dasharray="4 4" opacity=".5"/>`;
    }).join('');
    posts.duels = {
      text: `🥊 Et si le second tour avait lieu aujourd'hui ? Moyenne des sondages de 2nd tour :\n` + ds.slice(0, 4).map(d => `${C(d.a).short} ${fd(d.va)} % – ${C(d.b).short} ${fd(d.vb)} %`).join('\n')
        + `\n\nLe duel le plus serré : ${C(close.a).short} – ${C(close.b).short}, ${fd(close.va - close.vb)} pts d'écart.`,
      link: `${base}/#second`, svg: frame({ kicker: 'Second tour', title: 'Si le second tour avait lieu aujourd\'hui', body, note: 'Moyenne des sondages testant chaque duel · la ligne pointillée marque 50 % · ce n\'est pas un sondage' }),
      alt: 'Duels de second tour, moyenne des sondages : ' + ds.map(d => `${C(d.a).name} ${f1(d.va)} % contre ${C(d.b).name} ${f1(d.vb)} %`).join(' ; ') + '.'
    };
  }

  // 3. Mercredi — qui ira au second tour ?
  if (D.mc?.qualify?.length && D.features?.probabilities !== false) {
    const q = D.mc.qualify.filter(x => x.p >= 0.5).slice(0, 7);
    const O = D.openness;
    const body = bars(q.map(x => ({ label: C(x.c).short, color: C(x.c).color, v: x.p, txt: pc(x.p) })), { max: 100, bw: 700, rh: 52 });
    posts.qualif = {
      text: `🎯 Qui sera au second tour ? Chances de qualification${J ? ` à J-${J}` : ''}, simulées à partir des sondages :\n`
        + q.slice(0, 4).map(x => `${C(x.c).short} ${pc(x.p)}`).join(' · ')
        + (O ? `\n\nLe duel le plus probable, ${C(O.duo[0]).short} – ${C(O.duo[1]).short}, n'a que ${O.pDuo} % de chances.` : ''),
      link: `${base}/#proba`, svg: frame({ kicker: 'Qualification', title: 'Chances d\'accéder au second tour', body, note: `Simulation à partir des sondages et de leur erreur historique · ce n'est pas un sondage` }),
      alt: 'Probabilités de qualification au second tour : ' + q.map(x => `${C(x.c).name} ${pc(x.p)}`).join(', ') + '.'
    };
  }

  // 4. Jeudi — où iraient ses électeurs ? (reports mesurés, un candidat différent chaque semaine)
  if (D.transfers?.length) {
    const t = D.transfers[week % D.transfers.length];
    const fl = t.flows.filter(f => f.pct >= 2).sort((a, b) => b.pct - a.pct).slice(0, 7);
    const body = bars(fl.map(f => ({ label: C(f.c).short, color: C(f.c).color, v: f.pct, txt: `${f.pct} %` })), { rh: 50, bw: 640 });
    const n = C(t.c).name;
    posts.reports = {
      text: `🔀 Si ${n} ne se présentait pas, où iraient ses électeurs ?\nD'après ${t.surveys} sondages qui testent les deux listes : `
        + fl.slice(0, 3).map(f => `${C(f.c).short} ${f.pct} %`).join(', ') + '.\n\nMesuré, pas supposé. Testez vos propres hypothèses avec le simulateur « Et si… ? »',
      link: `${base}/#etsi`, svg: frame({ kicker: 'Reports de voix', title: `Sans ${n}, où iraient ses électeurs ?`, body, note: `Part de ses électeurs reportée sur chaque candidat · ${t.surveys} sondages avec et sans lui` }),
      alt: `Reports mesurés si ${n} se retirait : ` + fl.map(f => `${C(f.c).name} ${f.pct} %`).join(', ') + '.'
    };
  }

  // 5. Vendredi — il y a cinq ans, à la même distance du 1er tour
  const G = D.ghosts;
  if (G?.series && J != null) {
    let i = 0; G.daysBack.forEach((d, k) => { if (Math.abs(d - J) < Math.abs(G.daysBack[i] - J)) i = k; });
    if (Math.abs(G.daysBack[i] - J) <= 4) {
      const rows = Object.entries(G.series).filter(([, s]) => s.result != null && s.v[i] != null).map(([k, s]) => ({ k, color: s.color, then: s.v[i], res: s.result }))
        .sort((a, b) => b.res - a.res).slice(0, 6);
      const big = [...rows].sort((a, b) => Math.abs(b.res - b.then) - Math.abs(a.res - a.then))[0];
      const x0 = 300, bw = 560, m = Math.max(...rows.flatMap(r => [r.then, r.res]));
      const body = `<text x="${x0}" y="182" font-size="16" font-weight="700" fill="#7d788c">● À J-${J} en 2022     ◆ Résultat du 1er tour</text>` + rows.map((r, k) => {
        const y = 200 + k * 58, a = x0 + r.then / m * bw, b = x0 + r.res / m * bw, d = r.res - r.then;
        return `<text x="56" y="${y + 25}" font-size="22" font-weight="600" fill="#15131f">${esc(r.k)}</text>
        <line x1="${x0}" y1="${y + 18}" x2="${x0 + bw}" y2="${y + 18}" stroke="#e6dfd4" stroke-width="2"/>
        <line x1="${a}" y1="${y + 18}" x2="${b}" y2="${y + 18}" stroke="${r.color}" stroke-width="8" stroke-linecap="round" opacity=".55"/>
        <circle cx="${a}" cy="${y + 18}" r="10" fill="#fbf7f1" stroke="${r.color}" stroke-width="4"/>
        <rect x="${b - 9}" y="${y + 9}" width="18" height="18" transform="rotate(45 ${b} ${y + 18})" fill="${r.color}"/>
        <text x="${x0 + bw + 30}" y="${y + 26}" font-size="21" font-weight="800" fill="#15131f">${f1(r.then)} → ${f1(r.res)} %</text>
        <text x="${x0 + bw + 210}" y="${y + 26}" font-size="18" font-weight="800" fill="${d >= 0 ? '#0f8a5f' : '#d23a5f'}">${sg(d)}</text>`;
      }).join('');
      posts.y2022 = {
        text: `⏳ 2022, à J-${J} du 1er tour, les sondages donnaient : ` + rows.slice(0, 4).map(r => `${r.k} ${f1(r.then)} %`).join(', ')
          + `.\nRésultat : ` + rows.slice(0, 4).map(r => `${r.k} ${f1(r.res)} %`).join(', ')
          + `.\n\nPlus gros écart : ${big.k}, ${sg(big.res - big.then)} pts. Rien n'est joué.`,
        link: `${base}/#fantomes`, svg: frame({ kicker: 'Il y a cinq ans', title: `2022 : les sondages à J-${J}, puis le résultat`, body, note: 'Moyenne des sondages 2022 à la même distance du 1er tour, puis résultat officiel · Ministère de l\'Intérieur' }),
        alt: `Présidentielle 2022 à ${J} jours du premier tour, puis résultat : ` + rows.map(r => `${r.k} ${f1(r.then)} % puis ${f1(r.res)} %`).join(', ') + '.'
      };
    }
  }

  // 6. Samedi — focus sur un candidat (rotation hebdomadaire, ordre alphabétique : chacun son tour)
  {
    const pool = D.standings.filter(s => s.presence >= 30 || s.declared).map(s => s.c).sort((a, b) => C(a).name.localeCompare(C(b).name, 'fr'));
    const c = pool[week % pool.length], s = D.standings.find(x => x.c === c), M = (D.momentum || {})[c] || {};
    const ser = (D.series[c]?.v || []).slice(-90), q = (D.mc?.qualify || []).find(x => x.c === c);
    if (s && ser.filter(v => v != null).length > 10) {
      const vals = ser.filter(v => v != null), lo = Math.floor(Math.min(...vals) - 1), hi = Math.ceil(Math.max(...vals) + 1);
      const X = k => 56 + k / (ser.length - 1) * 640, Y = v => 540 - (v - lo) / (hi - lo) * 300;
      const path = ser.map((v, k) => v == null ? null : `${X(k)},${Y(v)}`).filter(Boolean).join(' ');
      const st = M.state === 'up' ? 'en hausse' : M.state === 'down' ? 'en baisse' : 'stable';
      const body = `<text x="56" y="200" font-size="18" font-weight="600" fill="#7d788c">Six derniers mois</text>
      <text x="40" y="${Y(hi) + 6}" font-size="15" fill="#7d788c" text-anchor="end">${hi}</text><text x="40" y="${Y(lo) + 6}" font-size="15" fill="#7d788c" text-anchor="end">${lo}</text>
      <line x1="56" y1="${Y(lo)}" x2="696" y2="${Y(lo)}" stroke="#e6dfd4" stroke-width="2"/>
      <polyline points="${path}" fill="none" stroke="${C(c).color}" stroke-width="5" stroke-linejoin="round" stroke-linecap="round"/>
      <circle cx="${X(ser.length - 1)}" cy="${Y(s.v)}" r="8" fill="${C(c).color}"/>
      <line x1="770" y1="190" x2="770" y2="550" stroke="#e6dfd4" stroke-width="2"/>
      <text x="810" y="230" font-size="18" font-weight="600" fill="#7d788c" letter-spacing="1.5">MOYENNE DES SONDAGES</text>
      <text x="810" y="300" font-size="72" font-weight="800" fill="${C(c).color}">${f1(s.v)} %</text>
      <text x="810" y="340" font-size="21" font-weight="600" fill="#4a4659">${sg(s.d30)} pt en 30 jours · ${st}</text>
      ${q && D.features?.probabilities !== false ? `<text x="810" y="420" font-size="18" font-weight="600" fill="#7d788c" letter-spacing="1.5">QUALIFICATION</text>
      <text x="810" y="470" font-size="44" font-weight="800" fill="#15131f">${pc(q.p)}</text>
      <text x="810" y="502" font-size="19" font-weight="600" fill="#4a4659">de chances d'être au 2nd tour</text>` : ''}`;
      posts.focus = {
        text: `🔎 Focus de la semaine : ${C(c).name}${C(c).party ? ` (${C(c).party})` : ''}\n${f1(s.v)} % dans la moyenne des sondages, ${sg(s.d30)} pt en 30 jours, tendance ${st}.`
          + (q && D.features?.probabilities !== false ? `\nChances d'être au second tour : ${pc(q.p)}.` : '') + `\n\nSa fiche complète :`,
        link: `${base}/candidat/${C(c).slug}/`, svg: frame({ kicker: 'Focus candidat', title: C(c).name, body, note: 'Chaque samedi un candidat différent, par ordre alphabétique · moyenne corrigée des effets instituts' }),
        alt: `${C(c).name} : ${f1(s.v)} % dans la moyenne des sondages, ${sg(s.d30)} point en 30 jours, tendance ${st}.`
      };
    }
  }

  // 7. Dimanche — effet institut (un candidat du top 4 différent chaque semaine)
  if (D.houseAll) {
    const top = D.standings.filter(s => s.presence >= 30).slice(0, 4).map(s => s.c).filter(c => D.houseAll[c]);
    if (top.length) {
      const c = top[week % top.length];
      const h = Object.entries(D.houseAll[c]).filter(([, v]) => v != null).sort((a, b) => b[1] - a[1]);
      const mid = 700, sc = 70, body = `<line x1="${mid}" y1="180" x2="${mid}" y2="${190 + h.length * 40}" stroke="#15131f" stroke-width="2" opacity=".4"/>
      <text x="${mid}" y="176" font-size="15" font-weight="700" fill="#7d788c" text-anchor="middle">moyenne</text>` + h.map(([i, v], k) => {
        const y = 190 + k * 40, w = Math.min(Math.abs(v) * sc, 420);
        return `<text x="56" y="${y + 24}" font-size="20" font-weight="600" fill="#15131f">${esc(i)}</text>
        <rect x="${v >= 0 ? mid : mid - w}" y="${y + 6}" width="${Math.max(w, 3)}" height="24" rx="8" fill="${C(c).color}" opacity="${v >= 0 ? 1 : .55}"/>
        <text x="${v >= 0 ? mid + w + 10 : mid - w - 10}" y="${y + 25}" font-size="19" font-weight="800" fill="#15131f" text-anchor="${v >= 0 ? 'start' : 'end'}">${sg(v)}</text>`;
      }).join('');
      const [hiI, hiV] = h[0], [loI, loV] = h[h.length - 1];
      posts.instituts = {
        text: `🧪 Pourquoi les sondages ne disent pas tous la même chose ?\nPour ${C(c).name}, ${hiI} donne en moyenne ${sg(hiV)} pt par rapport aux autres instituts, ${loI} ${sg(loV)} pt.\n\nLa Sonde mesure ces « effets instituts » et les corrige avant de calculer sa moyenne.`,
        link: `${base}/#ecart`, svg: frame({ kicker: 'Effet institut', title: `${C(c).name} : l'écart de chaque institut`, body, note: 'Écart moyen de chaque institut à la tendance commune, sur les derniers mois · méthode détaillée sur le site' }),
        alt: `Effets instituts pour ${C(c).name} : ` + h.map(([i, v]) => `${i} ${sg(v)} point`).join(', ') + '.'
      };
    }
  }

  for (const p of Object.values(posts)) p.text = NB(p.text);
  return posts;
}

// Ordre des formats selon le jour (0 = dimanche … 6 = samedi), heure de Paris.
export const BY_DAY = ['instituts', 'classement', 'duels', 'qualif', 'reports', 'y2022', 'focus'];
export function dayIndex(now = new Date()) {
  const wd = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Paris', weekday: 'short' }).format(now);
  return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(wd);
}
export const parisDate = (now = new Date()) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris' }).format(now);
