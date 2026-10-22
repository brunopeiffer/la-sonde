// La Sonde V2 — détecteur de bascule, baromètre d'incertitude, sondage décrypté, « ce qui a changé ».
// Fonctions pures appelées par model.mjs : elles reçoivent les tendances déjà calculées.
import { round1, normCdf, fromDay } from './lib.mjs';

const Z80 = 1.2816;
// Extrapolation amortie : la dynamique s'essouffle (3 % par jour), on ne prolonge pas une droite.
const DAMP = 0.97;
const S = k => { let s = 0; for (let j = 1; j <= k; j++) s += DAMP ** j; return s; };
const fr1 = x => x.toFixed(1).replace('.', ',');
const sg = (x, l) => (x > 0 ? '+' : x < 0 ? '−' : '±') + (l !== 'en' ? fr1(Math.abs(x)) : Math.abs(x).toFixed(1));

// ---------- 1. Momentum : pente sur les 5 dernières semaines, corrigée des effets instituts ----------
export function momentum(FR, standings) {
  const out = {};
  for (const s of standings) {
    const c = s.c;
    const pts = FR.r1.filter(p => c in p.results && FR.lastPoll - p.t <= 35)
      .map(p => ({ t: p.t - FR.lastPoll, x: p.results[c] - ((FR.house[c] || {})[p.institute] || 0), w: p.w, s: p.survey }));
    const surveys = new Set(pts.map(p => p.s)).size;
    const span = pts.length ? Math.max(...pts.map(p => p.t)) - Math.min(...pts.map(p => p.t)) : 0;
    if (pts.length < 5 || surveys < 3 || span < 10) { out[c] = { state: 'nd', surveys }; continue; }
    const mw = pts.reduce((a, p) => a + p.w, 0) / pts.length;
    pts.forEach(p => p.w /= mw);
    const W = pts.reduce((a, p) => a + p.w, 0);
    const tb = pts.reduce((a, p) => a + p.w * p.t, 0) / W, xb = pts.reduce((a, p) => a + p.w * p.x, 0) / W;
    const Stt = pts.reduce((a, p) => a + p.w * (p.t - tb) ** 2, 0);
    const b = pts.reduce((a, p) => a + p.w * (p.t - tb) * (p.x - xb), 0) / Stt;
    const s2 = Math.max(1, pts.reduce((a, p) => a + p.w * (p.x - xb - b * (p.t - tb)) ** 2, 0) / W * pts.length / Math.max(1, pts.length - 2));
    // Les hypothèses d'une même enquête ne sont pas indépendantes : on gonfle l'erreur.
    const se = Math.sqrt(s2 / Stt) * Math.sqrt(pts.length / surveys);
    const d14 = 14 * b, pUp = normCdf(b / se);
    const state = pUp >= 0.9 && d14 >= 0.4 ? 'up' : pUp <= 0.1 && d14 <= -0.4 ? 'down' : 'flat';
    const sd0 = (s.band || 1) / 1.96;
    const proj = [0, 5, 10, 15, 20, 25, 30].map(k => {
      const v = s.v + b * S(k), sd = Math.sqrt((S(k) * se) ** 2 + sd0 ** 2 * (k ? 1 : 0) + 0.05 * k);
      return { k, v: round1(v), lo: round1(Math.max(0, v - Z80 * sd)), hi: round1(v + Z80 * sd), sd };
    });
    out[c] = { state, d14: round1(d14), pUp: Math.round(pUp * 100), slope: b, se, surveys, polls: pts.length,
      proj: proj.map(({ sd, ...r }) => r), sd30: proj[6].sd };
  }
  return out;
}

// ---------- 2. Bascules possibles : deux candidats voisins qui peuvent s'inverser d'ici 30 jours ----------
export function crossings(standings, MOM) {
  const list = standings.filter(s => s.presence >= 30 && MOM[s.c] && MOM[s.c].state !== 'nd').slice(0, 8);
  const out = [];
  for (let i = 0; i < list.length - 1; i++) {
    const A = list[i], B = list[i + 1], a = MOM[A.c], b = MOM[B.c];
    const g = A.v - B.v, gp = g + (a.slope - b.slope) * S(30);
    const sd = Math.sqrt(a.sd30 ** 2 + b.sd30 ** 2);
    const p = normCdf(-gp / sd);
    if (p >= 0.25) out.push({ a: A.c, b: B.c, rank: standings.indexOf(A) + 1, gap: round1(g), p: Math.round(p * 100), converging: a.slope - b.slope < 0 });
  }
  return out.sort((x, y) => (x.rank <= 2 ? -1 : 0) - (y.rank <= 2 ? -1 : 0) || y.p - x.p).slice(0, 3);
}

// ---------- 3. Baromètre d'incertitude : probabilité que le duel actuel ne soit PAS le duel final ----------
export function openness(SC, standings) {
  const duo = standings.filter(s => s.presence >= 30).slice(0, 2).map(s => s.c), top2 = [...duo].sort();
  const tot = SC.reduce((a, s) => a + s.surveys, 0);
  let p = 0;
  for (const s of SC) {
    const d = s.mc.duels.find(x => [x.a, x.b].sort().join() === top2.join());
    p += (d ? d.p : 0) * s.surveys / tot;
  }
  return { duo, pDuo: round1(p), open: Math.round(100 - p) };
}

// ---------- 4. Le dernier sondage, décrypté ----------
export function decode(FR, standings, SC) {
  const last = [...FR.r1].sort((a, b) => b.end.localeCompare(a.end) || b.t - a.t)[0];
  if (!last) return null;
  const hyps = FR.r1.filter(p => p.survey === last.survey);
  const keyOf = p => Object.keys(p.results).sort().join(',');
  // On compare l'hypothèse à la moyenne de la MÊME liste de candidats (sinon l'écart mesure l'effet de liste,
  // pas l'institut). À défaut, on compare à la moyenne générale, sans conclure.
  let h = null, sc = null;
  for (const s of SC) { const m = hyps.find(p => keyOf(p) === s.key); if (m) { h = m; sc = s; break; } }
  const same = !!h;
  if (!h) h = [...hyps].sort((a, b) => Object.keys(b.results).length - Object.keys(a.results).length)[0];
  const rows = Object.entries(h.results).filter(([c]) => standings.some(s => s.c === c))
    .map(([c, raw]) => {
      const he = (FR.house[c] || {})[h.institute] || 0;
      const avg = same ? sc.set.find(x => x.c === c).share : standings.find(s => s.c === c).v;
      return { c, raw, he: round1(he), corr: round1(raw - he), avg: round1(avg), diff: round1(raw - he - avg) };
    }).sort((a, b) => b.raw - a.raw).slice(0, 8);
  const big = [...rows].sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff))[0];
  return { survey: last.survey, inst: h.institute, sponsor: h.sponsor, end: h.end, n: h.n, hyps: hyps.length, listSize: Object.keys(h.results).length,
    sameList: same, rows, outlier: same && big && Math.abs(big.diff) > 1.5 ? big : null };
}

// ---------- 5. Historique quotidien (pour mesurer ce qui a bougé d'un jour à l'autre) ----------
export function updateHistory(hist, today, entry) {
  const h = (hist || []).filter(x => x.d !== today);
  h.push({ d: today, ...entry });
  return h.sort((a, b) => a.d.localeCompare(b.d)).slice(-400);
}

// ---------- 6. « Ce qui a changé » : trois faits, générés automatiquement ----------
export function changes({ MOM, cross, dec, hist, today, qualify, nm, features, fmtDate }) {
  const items = { fr: [], en: [], de: [], es: [], it: [] };
  // a) Le mouvement le plus net
  const moves = Object.entries(MOM).filter(([, m]) => m.state === 'up' || m.state === 'down')
    .sort((a, b) => Math.abs(b[1].slope / b[1].se) - Math.abs(a[1].slope / a[1].se));
  if (moves.length) {
    const [c, m] = moves[0], up = m.state === 'up', cert = up ? m.pUp : 100 - m.pUp;
    items.fr.push({ k: up ? 'up' : 'down', c, t: `${nm(c)} ${up ? 'en hausse' : 'en baisse'} nette : ${sg(m.d14, 'fr')} pt en 14 jours (certitude ${cert} %).` });
    items.en.push({ k: up ? 'up' : 'down', c, t: `${nm(c)} clearly ${up ? 'rising' : 'falling'}: ${sg(m.d14, 'en')} pts in 14 days (${cert}% confidence).` });
    items.de.push({ k: up ? 'up' : 'down', c, t: `${nm(c)} ${up ? 'deutlich im Aufwind' : 'deutlich im Abwind'}: ${sg(m.d14, 'de')} Pkt. in 14 Tagen (${cert} % Sicherheit).` });
    items.es.push({ k: up ? 'up' : 'down', c, t: `${nm(c)}, en ${up ? 'clara subida' : 'clara bajada'}: ${sg(m.d14, 'es')} pts en 14 días (certeza del ${cert} %).` });
    items.it.push({ k: up ? 'up' : 'down', c, t: `${nm(c)} in ${up ? 'netta crescita' : 'netto calo'}: ${sg(m.d14, 'it')} punti in 14 giorni (certezza ${cert}%).` });
  } else {
    items.fr.push({ k: 'flat', t: 'Aucun mouvement net sur 14 jours : les variations restent dans le bruit statistique.' });
    items.en.push({ k: 'flat', t: 'No clear movement over 14 days: changes are within statistical noise.' });
    items.de.push({ k: 'flat', t: 'Keine deutliche Bewegung in 14 Tagen: Die Schwankungen bleiben im statistischen Rauschen.' });
    items.es.push({ k: 'flat', t: 'Ningún movimiento claro en 14 días: las variaciones siguen dentro del ruido estadístico.' });
    items.it.push({ k: 'flat', t: 'Nessun movimento netto in 14 giorni: le variazioni restano nel rumore statistico.' });
  }
  // b) Le dernier sondage
  if (dec) {
    const o = dec.outlier;
    items.fr.push({ k: 'poll', t: `Dernier sondage : ${dec.inst} pour ${dec.sponsor} (${fmtDate(dec.end, 'fr')}). ` +
      (!dec.sameList ? 'Liste de candidats inédite : pas de comparaison directe possible avec la moyenne.' : o ? `Après correction de l'effet institut, il place ${nm(o.c)} ${o.diff > 0 ? 'au-dessus' : 'en dessous'} de la moyenne (${sg(o.diff, 'fr')} pt).` : 'Une fois corrigé de l\'effet institut, il est conforme à la moyenne.') });
    items.en.push({ k: 'poll', t: `Latest survey: ${dec.inst} for ${dec.sponsor} (${fmtDate(dec.end, 'en')}). ` +
      (!dec.sameList ? 'New candidate list: no direct comparison with the average.' : o ? `After adjusting for the pollster's house effect, it puts ${nm(o.c)} ${o.diff > 0 ? 'above' : 'below'} the average (${sg(o.diff, 'en')} pts).` : 'Once adjusted for house effect, it is in line with the average.') });
    items.de.push({ k: 'poll', t: `Neueste Umfrage: ${dec.inst} für ${dec.sponsor} (${fmtDate(dec.end, 'de')}). ` +
      (!dec.sameList ? 'Neue Kandidatenliste: kein direkter Vergleich mit dem Durchschnitt möglich.' : o ? `Nach Bereinigung des Instituts-Effekts sieht sie ${nm(o.c)} ${o.diff > 0 ? 'über' : 'unter'} dem Durchschnitt (${sg(o.diff, 'de')} Pkt.).` : 'Nach Bereinigung des Instituts-Effekts liegt sie im Durchschnitt.') });
    items.es.push({ k: 'poll', t: `Última encuesta: ${dec.inst} para ${dec.sponsor} (${fmtDate(dec.end, 'es')}). ` +
      (!dec.sameList ? 'Lista de candidatos inédita: no se puede comparar directamente con la media.' : o ? `Corregido el efecto de instituto, sitúa a ${nm(o.c)} ${o.diff > 0 ? 'por encima' : 'por debajo'} de la media (${sg(o.diff, 'es')} pts).` : 'Corregido el efecto de instituto, está en línea con la media.') });
    items.it.push({ k: 'poll', t: `Ultimo sondaggio: ${dec.inst} per ${dec.sponsor} (${fmtDate(dec.end, 'it')}). ` +
      (!dec.sameList ? 'Lista di candidati inedita: nessun confronto diretto possibile con la media.' : o ? `Corretto l'effetto istituto, colloca ${nm(o.c)} ${o.diff > 0 ? 'sopra' : 'sotto'} la media (${sg(o.diff, 'it')} punti).` : "Corretto l'effetto istituto, è in linea con la media.") });
  }
  // c) La probabilité qui a le plus bougé en 7 jours, sinon la bascule la plus probable
  const ref = (hist || []).filter(x => x.d <= fromDayStr(today, -6)).pop();
  let done = false;
  if (features.probabilities && ref && ref.q) {
    const ch = qualify.filter(q => ref.q[q.c] != null).map(q => ({ c: q.c, p: q.p, d: q.p - ref.q[q.c] })).sort((a, b) => Math.abs(b.d) - Math.abs(a.d))[0];
    if (ch && Math.abs(ch.d) >= 3) {
      items.fr.push({ k: 'proba', c: ch.c, t: `Probabilité de qualification de ${nm(ch.c)} : ${Math.round(ch.p)} % (${ch.d > 0 ? '+' : '−'}${Math.round(Math.abs(ch.d))} pts depuis le ${fmtDate(ref.d, 'fr')}).` });
      items.en.push({ k: 'proba', c: ch.c, t: `${nm(ch.c)}'s probability of reaching the run-off: ${Math.round(ch.p)}% (${ch.d > 0 ? '+' : '−'}${Math.round(Math.abs(ch.d))} pts since ${fmtDate(ref.d, 'en')}).` });
      const dd = `${ch.d > 0 ? '+' : '−'}${Math.round(Math.abs(ch.d))}`;
      items.de.push({ k: 'proba', c: ch.c, t: `Chance von ${nm(ch.c)} auf die Stichwahl: ${Math.round(ch.p)} % (${dd} Pkt. seit dem ${fmtDate(ref.d, 'de')}).` });
      items.es.push({ k: 'proba', c: ch.c, t: `Probabilidad de ${nm(ch.c)} de pasar a la segunda vuelta: ${Math.round(ch.p)} % (${dd} pts desde el ${fmtDate(ref.d, 'es')}).` });
      items.it.push({ k: 'proba', c: ch.c, t: `Probabilità di ${nm(ch.c)} di arrivare al ballottaggio: ${Math.round(ch.p)}% (${dd} punti in una settimana).` });
      done = true;
    }
  }
  if (!done && cross.length) {
    const x = cross[0];
    items.fr.push({ k: 'swap', t: `Bascule possible : ${nm(x.a)} et ${nm(x.b)} (${x.rank}e et ${x.rank + 1}e) ont ${x.p} % de chances d'échanger leur place d'ici un mois si la tendance se poursuit.` });
    items.en.push({ k: 'swap', t: `Possible swap: ${nm(x.a)} and ${nm(x.b)} (#${x.rank} and #${x.rank + 1}) have a ${x.p}% chance of trading places within a month if trends continue.` });
    items.de.push({ k: 'swap', t: `Möglicher Platztausch: ${nm(x.a)} und ${nm(x.b)} (Plätze ${x.rank} und ${x.rank + 1}) tauschen mit ${x.p} % Wahrscheinlichkeit innerhalb eines Monats die Plätze, wenn der Trend anhält.` });
    items.es.push({ k: 'swap', t: `Posible vuelco: ${nm(x.a)} y ${nm(x.b)} (puestos ${x.rank} y ${x.rank + 1}) tienen un ${x.p} % de probabilidad de intercambiar sus puestos en un mes si la tendencia continúa.` });
    items.it.push({ k: 'swap', t: `Possibile sorpasso: ${nm(x.a)} e ${nm(x.b)} (${x.rank}° e ${x.rank + 1}° posto) hanno il ${x.p}% di probabilità di scambiarsi di posto entro un mese se la tendenza continua.` });
  }
  return items;
}
function fromDayStr(d, delta) { const t = new Date(d + 'T00:00:00Z'); t.setUTCDate(t.getUTCDate() + delta); return t.toISOString().slice(0, 10); }
export { fromDay };
