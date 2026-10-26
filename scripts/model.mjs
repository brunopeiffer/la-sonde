// La Sonde — modèle d'agrégation.
// Entrées : data/sources/*.csv (MieuxVoter, nsppolls 2022), data/agent_polls.json, data/*.json
// Sortie  : site/data/site.json (tout ce dont le site a besoin)
import fs from 'node:fs';
import path from 'node:path';
import { readJSON, writeJSON, parseCSV, toDay, fromDay, round1, randn, normCdf, seed } from './lib.mjs';
import { momentum, crossings, openness, decode, updateHistory } from './v2.mjs';
import { signals } from './signals.mjs';
seed(2027); // tirages reproductibles d'une exécution à l'autre

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const P = (...a) => path.join(ROOT, ...a);
const cfg = readJSON(P('config.json'));
const M = cfg.model;
const CANDS = readJSON(P('data/candidates.json'));
const color = id => (CANDS[id] || CANDS._default).color;

const R1 = toDay(cfg.election.round1), R2 = toDay(cfg.election.round2);
// Fichier candidats MieuxVoter + corrections locales (retraits / déclarations plus récents).
const OVR = fs.existsSync(P('data/overrides.json')) ? readJSON(P('data/overrides.json')) : { withdrawals: [], declarations: [], required: [] };
function roster() {
  const rows = parseCSV(fs.readFileSync(P('data/sources/mieuxvoter_candidats.csv'), 'utf8'));
  for (const w of OVR.withdrawals || []) { const r = rows.find(x => x.candidate_id === w.id); if (r && !r.retrait_candidature) { r.retrait_candidature = w.date; r._wsrc = w; } }
  for (const dcl of OVR.declarations || []) { const r = rows.find(x => x.candidate_id === dcl.id); if (r && !r.annonce_candidature) { r.annonce_candidature = dcl.date; r._dsrc = dcl; } }
  return rows;
}
const ROSTER = roster();
const WITHDRAWN = new Set(ROSTER.filter(r => r.retrait_candidature && r.retrait_candidature <= new Date().toISOString().slice(0, 10)).map(r => r.candidate_id));
const TODAY = toDay(new Date().toISOString());

// ---------- 1. Chargement des sondages 2027 ----------
const normInst = s => s.toLowerCase().replace(/toluna|interactive|bva|fiducial|[^a-z0-9]/g, '');
const excluded = s => cfg.excludeSponsors.some(x => s.toLowerCase().includes(x.toLowerCase()));

function loadPolls() {
  const rows = parseCSV(fs.readFileSync(P('data/sources/mieuxvoter_presidentielle2027.csv'), 'utf8'));
  const byId = new Map();
  for (const r of rows) {
    if (excluded(r.commanditaire)) continue;
    const v = parseFloat(r.intentions); if (!isFinite(v)) continue;
    let p = byId.get(r.poll_id);
    if (!p) {
      p = {
        id: r.poll_id, survey: r.poll_id.replace(/_[^_]+$/, ''), hyp: r.hypothese,
        institute: r.nom_institut, sponsor: r.commanditaire, start: r.debut_enquete, end: r.fin_enquete,
        n: parseInt(r.echantillon) || 1000, round: r.tour.startsWith('2') ? 2 : 1,
        file: r.filename, provisional: false, results: {}
      };
      byId.set(r.poll_id, p);
    }
    p.results[r.candidate_id] = v;
  }
  const polls = [...byId.values()];
  // Sondages trouvés par l'agent, ignorés dès que la base MieuxVoter les contient.
  const agent = readJSON(P('data/agent_polls.json')).polls || [];
  // Un même institut doit porter un seul nom (sinon ses effets sont mesurés en double) : on reprend celui de la base.
  const canon = new Map(polls.map(p => [normInst(p.institute), p.institute]));
  for (const a of agent) a.institute = canon.get(normInst(a.institute)) || a.institute;
  for (const a of agent) {
    const dup = polls.some(p => normInst(p.institute) === normInst(a.institute) && Math.abs(toDay(p.end) - toDay(a.end)) <= 1 && p.round === a.round);
    if (dup || excluded(a.sponsor || '')) continue;
    a.hypotheses.forEach((h, i) => polls.push({
      id: `${a.survey}_${String.fromCharCode(65 + i)}`, survey: a.survey, hyp: h.label || '',
      institute: a.institute, sponsor: a.sponsor, start: a.start, end: a.end, n: a.n || 1000,
      round: a.round, file: '', source: a.source, provisional: true, results: h.results
    }));
  }
  // Poids : racine de la taille d'échantillon, partagé entre les hypothèses d'une même enquête.
  const count = {};
  for (const p of polls) count[p.survey + p.round] = (count[p.survey + p.round] || 0) + 1;
  for (const p of polls) {
    p.t = Math.round((toDay(p.start) + toDay(p.end)) / 2);
    p.w = Math.sqrt(Math.min(p.n, 3000) / 1000) / count[p.survey + p.round];
  }
  return polls;
}

// ---------- 2. Lissage par noyau gaussien ----------
// points : [{t, x, w}] ; renvoie {v, band} pour chaque jour de la grille.
function smooth(points, grid, h) {
  return grid.map(t => {
    let sw = 0, sw2 = 0, sx = 0;
    for (const p of points) {
      const dt = (t - p.t) / h; if (Math.abs(dt) > 3) continue;
      const k = p.w * Math.exp(-0.5 * dt * dt); sw += k; sw2 += k * k; sx += k * p.x;
    }
    if (sw < 0.35) return null;
    const m = sx / sw;
    let sv = 0;
    for (const p of points) {
      const dt = (t - p.t) / h; if (Math.abs(dt) > 3) continue;
      sv += p.w * Math.exp(-0.5 * dt * dt) * (p.x - m) ** 2;
    }
    const neff = sw * sw / sw2;
    const sd = Math.sqrt(sv / sw + 1);              // +1 : plancher d'incertitude d'échantillonnage
    return { v: m, band: 1.96 * sd / Math.sqrt(Math.max(neff, 1)), neff };
  });
}

// ---------- 3. Premier tour : tendances corrigées des effets instituts ----------
function firstRound(polls) {
  const r1 = polls.filter(p => p.round === 1);
  const start = Math.min(...r1.map(p => p.t)), lastPoll = Math.max(...r1.map(p => p.t));
  const end = lastPoll;
  const gridAll = []; for (let t = start; t <= end; t++) gridAll.push(t);
  const ids = {};
  for (const p of r1) for (const c in p.results) ids[c] = (ids[c] || 0) + 1;
  const cands = Object.keys(ids).filter(c => ids[c] >= 6);

  const house = {}; // house[c][inst] = effet
  const trends = {};
  const evalAt = (s, t) => s[t - start];
  for (let iter = 0; iter < 3; iter++) {
    for (const c of cands) {
      const pts = r1.filter(p => c in p.results).map(p => ({
        t: p.t, w: p.w, x: p.results[c] - ((house[c] || {})[p.institute] || 0)
      }));
      trends[c] = smooth(pts, gridAll, M.bandwidthDays);
    }
    for (const c of cands) {
      // Effet institut = écart moyen (valeur brute − tendance corrigée), rétréci vers 0, puis centré.
      const acc = {};
      for (const p of r1) {
        if (!(c in p.results) || TODAY - p.t > M.houseEffectWindowDays) continue;
        const tr = evalAt(trends[c], p.t); if (!tr) continue;
        const a = acc[p.institute] || (acc[p.institute] = { s: 0, n: 0 });
        a.s += (p.results[c] - tr.v) * p.w; a.n += p.w;
      }
      const he = {};
      for (const [inst, a] of Object.entries(acc)) he[inst] = a.s / (a.n + M.houseEffectShrink * 0.3);
      const vals = Object.values(he); const mean = vals.reduce((a, b) => a + b, 0) / (vals.length || 1);
      for (const k in he) he[k] -= mean;
      house[c] = he;
    }
  }
  return { r1, start, end, lastPoll, gridAll, cands, ids, trends, house };
}

// ---------- 4. Calibration de l'incertitude sur 2022 ----------
const NAMES22 = {
  'Emmanuel Macron': ['Macron', '#f5a300', 27.85], 'Marine Le Pen': ['Le Pen', '#1f3fbf', 23.15],
  'Jean-Luc Mélenchon': ['Mélenchon', '#e8174a', 21.95], 'Eric Zemmour': ['Zemmour', '#7a4a2b', 7.07],
  'Valérie Pécresse': ['Pécresse', '#2aa8f0', 4.78], 'Yannick Jadot': ['Jadot', '#22b04b', 4.63],
  'Anne Hidalgo': ['Hidalgo', '#ff5fa2', 1.75]
};
function ghosts2022() {
  const rows = parseCSV(fs.readFileSync(P('data/sources/nsppolls_presidentielle2022.csv'), 'utf8'))
    .filter(r => r.tour === 'Premier tour' && NAMES22[r.candidat]);
  const E = toDay(cfg.previousElection.round1);
  const nh = {};
  for (const r of rows) { const k = r.id; nh[k] = nh[k] || new Set(); nh[k].add(r.hypothese); }
  const pts = {};
  for (const r of rows) {
    const t = Math.round((toDay(r.debut_enquete) + toDay(r.fin_enquete)) / 2);
    const w = Math.sqrt(Math.min(parseInt(r.echantillon) || 1000, 3000) / 1000) * (r.rolling === 'True' ? 0.35 : 1) / nh[r.id].size;
    (pts[r.candidat] = pts[r.candidat] || []).push({ t, x: parseFloat(r.intentions), w });
  }
  const daysBack = []; for (let d = 420; d >= 0; d -= 2) daysBack.push(d);
  const series = {}; const calib = [];
  for (const [name, [short, col, result]] of Object.entries(NAMES22)) {
    const s = smooth(pts[name], daysBack.map(d => E - d), 10);
    series[short] = { color: col, result, v: s.map(x => x ? round1(x.v) : null) };
    s.forEach((x, i) => { if (x && x.v >= 3) calib.push({ d: daysBack[i], z2: (result - x.v) ** 2 / x.v }); });
  }
  // Ajustement r(d) = a + b·√d de l'erreur normalisée |résultat − moyenne| / √moyenne.
  const bins = {};
  for (const c of calib) { const k = Math.round(c.d / 20) * 20; (bins[k] = bins[k] || []).push(c.z2); }
  const X = [], Y = [];
  for (const [k, arr] of Object.entries(bins)) { X.push(Math.sqrt(+k)); Y.push(Math.sqrt(arr.reduce((a, b) => a + b, 0) / arr.length)); }
  const mx = X.reduce((a, b) => a + b) / X.length, my = Y.reduce((a, b) => a + b) / Y.length;
  let b = X.reduce((s, x, i) => s + (x - mx) * (Y[i] - my), 0) / X.reduce((s, x) => s + (x - mx) ** 2, 0);
  b = Math.max(b, 0.03); const a = Math.max(my - b * mx, 0.3);
  return { daysBack, series, calib: { a: Math.round(a * 1000) / 1000, b: Math.round(b * 1000) / 1000 } };
}

// ---------- 5. Scénarios (listes exactes de candidats testées) ----------
// Les intentions de vote dépendent de la liste testée : on modélise chaque scénario fréquent séparément.
function scenarios(FR) {
  const win = FR.r1.filter(p => FR.lastPoll - p.t <= 60);
  const groups = {};
  for (const p of win) { const k = Object.keys(p.results).sort().join(','); (groups[k] = groups[k] || []).push(p); }
  const req = (OVR.required || []).filter(r => r.since <= new Date().toISOString().slice(0, 10)).map(r => r.id);
  const top = Object.entries(groups).map(([k, ps]) => ({ k, ps, surveys: new Set(ps.map(p => p.survey)).size }))
    .filter(g => g.surveys >= 3)
    // Listes devenues obsolètes : un candidat retiré, ou sans le candidat désigné d'une primaire.
    .filter(g => { const cs = g.k.split(','); return !cs.some(c => WITHDRAWN.has(c)) && req.every(r => cs.includes(r)); }).sort((a, b) => b.surveys - a.surveys).slice(0, 4);
  const all = new Set(top.flatMap(g => g.k.split(',')));
  const common = [...all].filter(c => top.every(g => g.k.split(',').includes(c)));
  const varying = [...all].filter(c => !common.includes(c));
  return top.map(g => {
    const cs = g.k.split(',');
    const share = cs.map(c => {
      let sw = 0, sx = 0;
      for (const p of g.ps) { const w = p.w * Math.pow(0.5, (FR.lastPoll - p.t) / 21); sw += w; sx += w * (p.results[c] - ((FR.house[c] || {})[p.institute] || 0)); }
      return { c, share: Math.max(0.2, sx / sw) };
    });
    const S = share.reduce((a, b) => a + b.share, 0); share.forEach(x => x.share = x.share * 100 / S);
    const inn = varying.filter(c => cs.includes(c)), out = varying.filter(c => !cs.includes(c));
    return { key: g.k, surveys: g.surveys, last: fromDay(Math.max(...g.ps.map(p => p.t))), with: inn, without: out, set: share.sort((a, b) => b.share - a.share) };
  });
}

function duels(polls, FR) {
  const r2 = polls.filter(p => p.round === 2);
  const pairs = {};
  for (const p of r2) {
    const ks = Object.keys(p.results); if (ks.length !== 2) continue;
    const [A, B] = ks.sort(); const k = A + '|' + B;
    (pairs[k] = pairs[k] || []).push({ t: p.t, w: p.w, x: p.results[A] * 100 / (p.results[A] + p.results[B]), p });
  }
  const out = [];
  for (const [k, pts] of Object.entries(pairs)) {
    const [A, B] = k.split('|');
    const last = Math.max(...pts.map(x => x.t));
    if (FR.lastPoll - last > 120) continue;
    const s = smooth(pts, [last], 21)[0]; if (!s) continue;
    const series = smooth(pts, FR.gridAll.filter((t, i) => i % 3 === 0 && t >= last - 300), 21)
      .map((x, i) => x ? [FR.gridAll.filter((t, i) => i % 3 === 0 && t >= last - 300)[i], round1(x.v)] : null).filter(Boolean);
    out.push({ a: A, b: B, va: round1(s.v), vb: round1(100 - s.v), n: pts.length, last: fromDay(last),
      polls: pts.slice(-8).map(x => ({ inst: x.p.institute, end: x.p.end, va: x.p.results[A], vb: x.p.results[B] })), series });
  }
  return out.sort((x, y) => y.n - x.n);
}

function monteCarlo(set, duelList, calib, FR) {
  const d1 = Math.max(0, R1 - FR.lastPoll), d2 = Math.max(0, R2 - FR.lastPoll);
  const sdOf = m => Math.sqrt(Math.max(m, 1)) * (calib.a + calib.b * Math.sqrt(d1));
  const sd2 = 2.5 + 0.3 * Math.sqrt(d2);
  const cs = set.map(x => x.c), ms = set.map(x => x.share), sds = set.map(x => sdOf(x.share) * (x.k || 1));
  const qual = Object.fromEntries(cs.map(c => [c, 0])); const duelCount = {};
  const N = M.monteCarloDraws;
  for (let k = 0; k < N; k++) {
    const x = ms.map((m, i) => Math.max(0.2, m + sds[i] * randn()));
    const order = x.map((v, i) => [v, i]).sort((a, b) => b[0] - a[0]);
    const A = cs[order[0][1]], B = cs[order[1][1]];
    qual[A]++; qual[B]++;
    const key = [A, B].sort().join('|'); duelCount[key] = (duelCount[key] || 0) + 1;
  }
  const win = Object.fromEntries(cs.map(c => [c, 0])); let covered = 0;
  const duelProbs = Object.entries(duelCount).map(([k, n]) => {
    const [A, B] = k.split('|'); const p = n / N;
    const d = duelList.find(x => x.a === A && x.b === B);
    let pa = null;
    if (d) { pa = normCdf((d.va - 50) / sd2); win[A] += p * pa; win[B] += p * (1 - pa); covered += p; }
    return { a: A, b: B, p: Math.round(p * 1000) / 10, pa: pa === null ? null : Math.round(pa * 1000) / 10 };
  }).sort((x, y) => y.p - x.p);
  return {
    daysToR1: d1, sdParams: { ...calib, sd2: round1(sd2) },
    qualify: cs.map(c => ({ c, p: Math.round(qual[c] / N * 1000) / 10, share: round1(ms[cs.indexOf(c)]), sd: round1(sds[cs.indexOf(c)]) })).sort((a, b) => b.p - a.p),
    duels: duelProbs.slice(0, 8), coverage: Math.round(covered * 1000) / 10,
    win: cs.map(c => ({ c, p: Math.round(win[c] * 1000) / 10 })).filter(x => x.p > 0).sort((a, b) => b.p - a.p)
  };
}

// ---------- 6. Reports implicites (« qui prend des voix à qui ») ----------
// ---------- Reports de voix : calibration du modèle de proximité sur les reports mesurés ----------
// On cherche les réglages (taille, portée de proximité, abstention) qui reproduisent au mieux
// les reports réellement mesurés dans les sondages (section « Reports »).
function calibrate(baseW, T, POS) {
  let cal = { alpha: POS.alpha ?? 0.75, lambda: POS.lambda, abst: POS.abstention }, calib = null;
  const meas = T.filter(tr => POS.positions[tr.c] != null && baseW[tr.c] != null);
  if (meas.length) {
    let best = null;
    for (const alpha of [0, 0.25, 0.5, 0.75, 1]) for (const lambda of [0.4, 0.6, 0.8, 1, 1.2, 1.5, 2, 3]) for (const abst of [0, 0.1, 0.2, 0.3, 0.4]) {
      let err = 0, n = 0;
      for (const tr of meas) {
        const A = Object.keys(baseW).filter(c => c !== tr.c && POS.positions[c] != null);
        const tot = A.reduce((s, c) => s + baseW[c], 0);
        const w = A.map(c => Math.pow(baseW[c], alpha) * Math.exp(-Math.abs(POS.positions[tr.c] - POS.positions[c]) / lambda));
        const sw = w.reduce((s, x) => s + x, 0);
        A.forEach((c, i) => {
          const pred = abst * baseW[c] / tot + (1 - abst) * w[i] / sw;
          const m = ((tr.flows.find(f => f.c === c) || { pts: 0 }).pts) / tr.score;
          err += (pred - m) ** 2; n++;
        });
      }
      if (!best || err < best.err) best = { alpha, lambda, abst, err, n };
    }
    cal = { alpha: best.alpha, lambda: best.lambda, abst: best.abst };
    calib = { n: meas.length, rmse: Math.round(Math.sqrt(best.err / best.n) * 10000) / 100 };
  }
  return { cal, calib };
}

function transfers(FR) {
  const recent = FR.r1.filter(p => FR.lastPoll - p.t <= M.transfersWindowDays);
  const bySurvey = {};
  for (const p of recent) (bySurvey[p.survey] = bySurvey[p.survey] || []).push(p);
  const acc = {};
  for (const hyps of Object.values(bySurvey)) {
    for (const A of hyps) for (const B of hyps) {
      if (A === B) continue;
      const ka = Object.keys(A.results), kb = Object.keys(B.results);
      if (ka.length !== kb.length + 1) continue;
      const missing = ka.filter(c => !(c in B.results));
      if (missing.length !== 1 || !kb.every(c => c in A.results)) continue;
      const X = missing[0]; if (A.results[X] < 2) continue;
      const a = acc[X] || (acc[X] = { n: 0, score: 0, flows: {}, surveys: new Set() });
      a.n++; a.score += A.results[X]; a.surveys.add(A.survey);
      for (const Y of kb) a.flows[Y] = (a.flows[Y] || 0) + (B.results[Y] - A.results[Y]);
    }
  }
  return Object.entries(acc).filter(([, a]) => a.n >= 3).map(([X, a]) => {
    const score = a.score / a.n;
    const flows = Object.entries(a.flows).map(([Y, s]) => ({ c: Y, pts: round1(s / a.n), pct: Math.round(s / a.n / score * 100) }))
      .filter(f => Math.abs(f.pts) >= 0.2).sort((x, y) => y.pts - x.pts);
    const gained = flows.reduce((s, f) => s + Math.max(f.pts, 0), 0);
    return { c: X, pairs: a.n, surveys: a.surveys.size, score: round1(score), flows, unassigned: round1(Math.max(0, score - gained)) };
  }).sort((x, y) => y.score - x.score);
}

// ---------- 7. Résumé factuel automatique (FR / EN) ----------
const LOC = { fr: 'fr-FR', en: 'en-GB', de: 'de-DE', es: 'es-ES', it: 'it-IT' };
const fmtDate = (s, lang) => new Date(s + 'T12:00:00Z').toLocaleDateString(LOC[lang] || 'en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
const nm = c => (CANDS[c] || { name: c }).name;
const slugify = s => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
function summary(stand, mc, polls, FR) {
  const [a, b, c] = stand;
  const sig = (x, y) => (x.v - y.v) > 1.96 * Math.sqrt(x.band ** 2 + y.band ** 2);
  const mover = [...stand].filter(s => s.d30 !== null).sort((x, y) => Math.abs(y.d30) - Math.abs(x.d30))[0];
  const last7 = new Set(polls.filter(p => FR.lastPoll - p.t <= 7 && p.round === 1).map(p => p.survey)).size;
  const lastP = polls.filter(p => p.round === 1).sort((x, y) => y.end.localeCompare(x.end))[0];
  const sg = x => (x > 0 ? '+' : x < 0 ? '−' : '±') + Math.abs(x).toFixed(1).replace('.', ',');
  const sgEn = x => (x > 0 ? '+' : x < 0 ? '−' : '±') + Math.abs(x).toFixed(1);
  const fr = n => n.toFixed(1).replace('.', ',');
  const q = mc.qualify;
  return {
    fr: [
      `${nm(a.c)} reste en tête de la moyenne des sondages avec ${fr(a.v)} % (${sg(a.d30 ?? 0)} pt en 30 jours).`,
      `Pour la deuxième place, ${nm(b.c)} (${fr(b.v)} %) devance ${nm(c.c)} (${fr(c.v)} %) : un écart de ${fr(b.v - c.v)} pt, ${sig(b, c) ? 'statistiquement net' : 'trop faible pour être significatif'}.`,
      mover ? `Mouvement le plus marqué sur un mois : ${nm(mover.c)} (${sg(mover.d30)} pt).` : '',
      cfg.features.probabilities ? `Probabilité de qualification au second tour estimée par le modèle, si les candidats testés se présentent : ${q.slice(0, 3).map(x => `${nm(x.c)} ${fr(x.p)} %`).join(', ')}.` : '',
      `${last7} enquête${last7 > 1 ? 's' : ''} publiée${last7 > 1 ? 's' : ''} sur les 7 derniers jours. Dernière : ${lastP.institute} pour ${lastP.sponsor} (terrain achevé le ${fmtDate(lastP.end, 'fr')}).`
    ].filter(Boolean),
    en: [
      `${nm(a.c)} still leads the polling average at ${a.v.toFixed(1)}% (${sgEn(a.d30 ?? 0)} pts over 30 days).`,
      `In the race for second place, ${nm(b.c)} (${b.v.toFixed(1)}%) is ahead of ${nm(c.c)} (${c.v.toFixed(1)}%): a ${(b.v - c.v).toFixed(1)}-point gap, ${sig(b, c) ? 'statistically clear' : 'too small to be significant'}.`,
      mover ? `Biggest move this month: ${nm(mover.c)} (${sgEn(mover.d30)} pts).` : '',
      cfg.features.probabilities ? `Model probability of reaching the run-off, if all tested candidates run: ${q.slice(0, 3).map(x => `${nm(x.c)} ${x.p.toFixed(1)}%`).join(', ')}.` : '',
      `${last7} survey${last7 > 1 ? 's' : ''} released in the last 7 days. Latest: ${lastP.institute} for ${lastP.sponsor} (fieldwork ended ${fmtDate(lastP.end, 'en')}).`
    ].filter(Boolean),
    de: [
      `${nm(a.c)} führt den Umfragedurchschnitt weiter mit ${fr(a.v)} % an (${sg(a.d30 ?? 0)} Pkt. in 30 Tagen).`,
      `Im Rennen um Platz zwei liegt ${nm(b.c)} (${fr(b.v)} %) vor ${nm(c.c)} (${fr(c.v)} %): ein Abstand von ${fr(b.v - c.v)} Pkt., ${sig(b, c) ? 'statistisch eindeutig' : 'zu gering, um signifikant zu sein'}.`,
      mover ? `Stärkste Bewegung im Monat: ${nm(mover.c)} (${sg(mover.d30)} Pkt.).` : '',
      cfg.features.probabilities ? `Vom Modell geschätzte Chance auf die Stichwahl, sofern alle getesteten Kandidaten antreten: ${q.slice(0, 3).map(x => `${nm(x.c)} ${fr(x.p)} %`).join(', ')}.` : '',
      `${last7} ${last7 === 1 ? 'Umfrage' : 'Umfragen'} in den letzten 7 Tagen veröffentlicht. Zuletzt: ${lastP.institute} für ${lastP.sponsor} (Feldarbeit beendet am ${fmtDate(lastP.end, 'de')}).`
    ].filter(Boolean),
    es: [
      `${nm(a.c)} sigue en cabeza de la media de encuestas con un ${fr(a.v)} % (${sg(a.d30 ?? 0)} pts en 30 días).`,
      `En la carrera por el segundo puesto, ${nm(b.c)} (${fr(b.v)} %) aventaja a ${nm(c.c)} (${fr(c.v)} %): una diferencia de ${fr(b.v - c.v)} pts, ${sig(b, c) ? 'estadísticamente clara' : 'demasiado pequeña para ser significativa'}.`,
      mover ? `Mayor movimiento del mes: ${nm(mover.c)} (${sg(mover.d30)} pts).` : '',
      cfg.features.probabilities ? `Probabilidad de pasar a la segunda vuelta según el modelo, si todos los candidatos evaluados se presentan: ${q.slice(0, 3).map(x => `${nm(x.c)} ${fr(x.p)} %`).join(', ')}.` : '',
      `${last7} ${last7 === 1 ? 'encuesta publicada' : 'encuestas publicadas'} en los últimos 7 días. La última: ${lastP.institute} para ${lastP.sponsor} (trabajo de campo terminado el ${fmtDate(lastP.end, 'es')}).`
    ].filter(Boolean),
    it: [
      `${nm(a.c)} resta in testa alla media dei sondaggi con il ${fr(a.v)}% (${sg(a.d30 ?? 0)} punti in 30 giorni).`,
      `Nella corsa al secondo posto, ${nm(b.c)} (${fr(b.v)}%) precede ${nm(c.c)} (${fr(c.v)}%): uno scarto di ${fr(b.v - c.v)} punti, ${sig(b, c) ? 'statisticamente netto' : 'troppo piccolo per essere significativo'}.`,
      mover ? `Movimento più marcato del mese: ${nm(mover.c)} (${sg(mover.d30)} punti).` : '',
      cfg.features.probabilities ? `Probabilità di arrivare al ballottaggio stimata dal modello, se tutti i candidati testati si presentano: ${q.slice(0, 3).map(x => `${nm(x.c)} ${fr(x.p)}%`).join(', ')}.` : '',
      `${last7} ${last7 === 1 ? 'sondaggio pubblicato' : 'sondaggi pubblicati'} negli ultimi 7 giorni. L'ultimo: ${lastP.institute} per ${lastP.sponsor} (fine rilevazione: ${fmtDate(lastP.end, 'it')}).`
    ].filter(Boolean)
  };
}

// ---------- 8. Fiches instituts ----------
function instituteProfiles(polls) {
  const by = {};
  for (const p of polls) {
    const k = p.institute, s = by[k] || (by[k] = { inst: k, surveys: new Map(), sponsors: {}, hyps: 0 });
    s.hyps++;
    if (!s.surveys.has(p.survey)) { s.surveys.set(p.survey, p); s.sponsors[p.sponsor] = (s.sponsors[p.sponsor] || 0) + 1; }
  }
  return Object.values(by).map(s => {
    const list = [...s.surveys.values()].sort((a, b) => a.end.localeCompare(b.end));
    const ns = list.map(p => p.n).sort((a, b) => a - b);
    const last = list[list.length - 1];
    return { inst: s.inst, surveys: list.length, hyps: s.hyps, first: list[0].end, last: last.end, lastSponsor: last.sponsor,
      medianN: ns[Math.floor(ns.length / 2)], sponsors: Object.entries(s.sponsors).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([k, n]) => ({ k, n })),
      site: (cfg.instituteSites || {})[s.inst] || null };
  }).sort((a, b) => b.surveys - a.surveys);
}

// ---------- 8 bis. Dépendance au bulletin ----------
// Pour chaque candidat : la présence de quel autre candidat change le plus son score ? Mesuré DANS les mêmes
// enquêtes (hypothèses avec et sans ce rival), sur les 60 derniers jours. Signalé si l'écart atteint 3 points.
function ballotDependence(r1, lastPoll) {
  const recent = r1.filter(p => lastPoll - p.t <= 60);
  const bySurvey = new Map();
  for (const p of recent) { if (!bySurvey.has(p.survey)) bySurvey.set(p.survey, []); bySurvey.get(p.survey).push(p); }
  const cands = [...new Set(recent.flatMap(p => Object.keys(p.results)))];
  const out = {};
  for (const c of cands) {
    let best = null;
    for (const r of cands) {
      if (r === c) continue;
      let sw = 0, sWith = 0, sWithout = 0, k = 0;
      for (const hs of bySurvey.values()) {
        const withC = hs.filter(h => h.results[c] != null);
        const a = withC.filter(h => h.results[r] != null), b = withC.filter(h => h.results[r] == null);
        if (!a.length || !b.length) continue;
        const m = xs => xs.reduce((x, h) => x + h.results[c], 0) / xs.length;
        const w = Math.sqrt(Math.min(hs[0].n, 3000) / 1000);
        sw += w; sWith += w * m(a); sWithout += w * m(b); k++;
      }
      if (k < 3) continue;
      const vWith = sWith / sw, vWithout = sWithout / sw, d = vWith - vWithout;
      if (!best || Math.abs(d) > Math.abs(best.diff)) best = { rival: r, with: round1(vWith), without: round1(vWithout), diff: round1(d), surveys: k };
    }
    if (best && Math.abs(best.diff) >= 3) out[c] = best;
  }
  return out;
}

// ---------- 9. Assemblage ----------
function build() {
  const polls = loadPolls();
  const FR = firstRound(polls);
  const G = ghosts2022();
  const nowI = FR.lastPoll - FR.start;
  const recentIds = {};
  for (const p of FR.r1) if (FR.lastPoll - p.t <= 45) for (const c in p.results) recentIds[c] = (recentIds[c] || 0) + p.w;
  const recentTot = FR.r1.filter(p => FR.lastPoll - p.t <= 45).reduce((s, p) => s + p.w, 0);

  // Candidats déclarés (fichier MieuxVoter : annonce sans retrait) : toujours affichés, même peu testés.
  const declared = new Set(ROSTER.filter(r => r.annonce_candidature && !r.retrait_candidature).map(r => r.candidate_id));
  const standings = FR.cands.map(c => {
    const presence = round1((recentIds[c] || 0) / recentTot * 100);
    if (WITHDRAWN.has(c)) return null;
    if (presence < 15 && !declared.has(c)) return null;
    // Dernière valeur disponible (un candidat peu testé peut ne pas avoir de moyenne à la date du jour).
    let i = nowI; while (i >= 0 && !FR.trends[c][i]) i--;
    if (i < 0 || nowI - i > 120) return null;
    const cur = FR.trends[c][i];
    const at = d => FR.trends[c][i - d] ? FR.trends[c][i - d].v : null;
    const d7 = at(7), d30 = at(30);
    const lastTest = FR.r1.filter(p => c in p.results).map(p => p.end).sort().pop();
    return { c, v: round1(cur.v), band: round1(cur.band), d7: d7 === null ? null : round1(cur.v - d7), d30: d30 === null ? null : round1(cur.v - d30),
      presence, declared: declared.has(c), lastTest, stale: nowI - i > 0 ? fromDay(FR.start + i) : null };
  }).filter(Boolean).sort((a, b) => b.v - a.v);

  // Séries (pas de 2 jours) pour tous les candidats testés au moins 6 fois.
  const step = 2, idx = FR.gridAll.map((t, i) => i).filter(i => (FR.gridAll.length - 1 - i) % step === 0);
  const series = {};
  for (const c of FR.cands) {
    const s = FR.trends[c];
    if (!idx.some(i => s[i])) continue;
    series[c] = { v: idx.map(i => s[i] ? round1(s[i].v) : null), b: idx.map(i => s[i] ? round1(s[i].band) : null) };
  }
  const D = duels(polls, FR);
  const SC = scenarios(FR).map(sc => ({ ...sc, mc: monteCarlo(sc.set, D, G.calib, FR) }));
  // Scénario « tous les candidats déclarés » : construit par nous, pour qu'aucun candidat déclaré
  // ne soit absent des probabilités parce que les instituts le testent peu. Incertitude majorée
  // pour les candidats peu testés (moyenne calculée sur moins de sondages).
  // Base : la liste testée par les instituts qui contient le plus de candidats déclarés ;
  // on y ajoute les déclarés absents, avec leur moyenne, pris proportionnellement sur les autres.
  const decl = standings.filter(x => x.declared);
  const base = [...SC].sort((a, b) => b.set.filter(x => decl.some(d => d.c === x.c)).length - a.set.filter(x => decl.some(d => d.c === x.c)).length || b.surveys - a.surveys)[0];
  const added = decl.filter(d => !base.set.some(x => x.c === d.c));
  // Les déclarés absents de cette liste y sont ajoutés avec leur moyenne, en prenant leurs voix
  // surtout à leurs voisins politiques (même modèle de proximité, calibré sur les reports mesurés),
  // et non uniformément sur tout le monde.
  const T = transfers(FR);
  const POS = readJSON(P('data/positions.json'));
  const { cal, calib } = calibrate(Object.fromEntries(base.set.map(x => [x.c, x.share])), T, POS);
  const cur = Object.fromEntries(base.set.map(x => [x.c, x.share]));
  for (const a of [...added].sort((x, y) => y.v - x.v)) {
    const cs = Object.keys(cur), tot = cs.reduce((s, c) => s + cur[c], 0);
    const pa = POS.positions[a.c];
    const k = cs.map(c => pa != null && POS.positions[c] != null ? Math.pow(cur[c], cal.alpha) * Math.exp(-Math.abs(pa - POS.positions[c]) / cal.lambda) : 0);
    const sk = k.reduce((s, x) => s + x, 0);
    cs.forEach((c, i) => {
      const w = sk ? cal.abst * cur[c] / tot + (1 - cal.abst) * k[i] / sk : cur[c] / tot;
      cur[c] = Math.max(0.2, cur[c] - a.v * w);
    });
    cur[a.c] = a.v;
  }
  const S0 = Object.values(cur).reduce((x, y) => x + y, 0);
  const allScen = { key: 'all', label: { fr: 'Tous les candidats déclarés', en: 'All declared candidates', de: 'Alle erklärten Kandidaten', es: 'Todos los candidatos declarados', it: 'Tutti i candidati dichiarati' }, model: true,
    surveys: base.surveys, last: base.last, with: [], without: [], added: added.map(x => x.c), from: base.key,
    set: Object.entries(cur).map(([c, v]) => {
      const ad = added.find(x => x.c === c);
      return { c, share: v * 100 / S0, k: ad ? 1 + 0.6 * (1 - Math.min(ad.presence, 100) / 100) : 1 };
    }).sort((a, b) => b.share - a.share) };
  allScen.mc = monteCarlo(allScen.set, D, G.calib, FR);
  // Synthèse : moyenne des scénarios pondérée par leur fréquence récente.
  const totS = SC.reduce((a, s) => a + s.surveys, 0);
  const agg = (field) => {
    const m = {};
    for (const s of SC) for (const x of s.mc[field]) m[x.c] = (m[x.c] || 0) + x.p * s.surveys / totS;
    return Object.entries(m).map(([c, p]) => ({ c, p: round1(p) })).sort((a, b) => b.p - a.p);
  };
  const mc = { ...SC[0].mc, qualify: agg('qualify'), win: agg('win'), coverage: round1(SC.reduce((a, s) => a + s.mc.coverage * s.surveys / totS, 0)) };

  // Effets instituts (candidats principaux uniquement).
  const top = standings.slice(0, 7).map(s => s.c);
  const insts = [...new Set(FR.r1.filter(p => TODAY - p.t <= M.houseEffectWindowDays).map(p => p.institute))];
  const house = insts.map(i => ({ inst: i, n: new Set(FR.r1.filter(p => p.institute === i && TODAY - p.t <= M.houseEffectWindowDays).map(p => p.survey)).size,
    he: Object.fromEntries(top.map(c => [c, FR.house[c] && FR.house[c][i] !== undefined ? round1(FR.house[c][i]) : null])) }))
    .filter(h => h.n >= 2).sort((a, b) => b.n - a.n);

  // Liste des enquêtes (les 40 plus récentes).
  const surveys = {};
  for (const p of polls) {
    const s = surveys[p.survey] || (surveys[p.survey] = { id: p.survey, inst: p.institute, sponsor: p.sponsor, start: p.start, end: p.end, n: p.n, file: p.file, source: p.source || null, provisional: p.provisional, hyps: [] });
    s.hyps.push({ round: p.round, r: p.results });
  }
  const surveyList = Object.values(surveys).sort((a, b) => b.end.localeCompare(a.end) || a.inst.localeCompare(b.inst)).slice(0, 40);

  // Événements : déclarations / retraits (fichier candidats) + événements manuels.
  const ev = readJSON(P('data/events.json')).events.map(e => ({ ...e, kind: 'event' }));
  for (const r of ROSTER) {
    if (!series[r.candidate_id] && !r._wsrc && !r._dsrc) continue;
    if (r.annonce_candidature) ev.push({ date: r.annonce_candidature, c: r.candidate_id, kind: 'in', fr: `${r.complete_name} annonce sa candidature`, en: `${r.complete_name} announces candidacy`, source: r._dsrc?.source });
    if (r.retrait_candidature) ev.push({ date: r.retrait_candidature, c: r.candidate_id, kind: 'out', fr: r._wsrc?.fr || `${r.complete_name} retire sa candidature`, en: r._wsrc?.en || `${r.complete_name} withdraws`, source: r._wsrc?.source });
  }
  const events = ev.filter(e => toDay(e.date) >= FR.start && toDay(e.date) <= TODAY).sort((a, b) => a.date.localeCompare(b.date));

  const cands = {};
  for (const c of new Set([...Object.keys(series), ...D.flatMap(d => [d.a, d.b])])) {
    const k = CANDS[c] || { name: c, short: c, party: '' };
    cands[c] = { name: k.name, short: k.short || k.name, party: k.party || '', color: color(c), colorDark: k.colorDark || color(c), n: FR.ids[c] || 0, slug: slugify(k.name) };
  }

  const out = {
    generated: new Date().toISOString(), asOf: FR.r1.map(p => p.end).sort().pop(),
    election: cfg.election, site: { name: cfg.siteName, nameEn: cfg.siteNameEn, author: cfg.author, url: cfg.siteUrl, donate: cfg.donate, contact: cfg.contact, api: cfg.api, turnstile: cfg.turnstileSiteKey || '' },
    quiz: readJSON(P('data/quiz.json')),
    features: cfg.features,
    debates: readJSON(P('data/debates.json')).debates,
    instituteProfiles: instituteProfiles(polls),
    counts: { surveys: new Set(polls.map(p => p.survey)).size, hypotheses: polls.length, institutes: new Set(polls.map(p => p.institute)).size,
      provisional: new Set(polls.filter(p => p.provisional).map(p => p.survey)).size },
    cands, standings,
    days: idx.map(i => fromDay(FR.gridAll[i])), series,
    institutes: [...new Set(FR.r1.map(p => p.institute))],
    points: Object.fromEntries(Object.keys(series).map(c => [c, FR.r1.filter(p => c in p.results)
      .map(p => [fromDay(p.t), p.results[c], [...new Set(FR.r1.map(q => q.institute))].indexOf(p.institute), p.provisional ? 1 : 0])])),
    scenarios: [...SC, allScen].map(s => ({ ...s, set: s.set.map(x => ({ c: x.c, share: round1(x.share) })) })),
    mc, duels: D, transfers: T, house, surveys: surveyList, events,
    ghosts: { daysBack: G.daysBack, series: G.series, round1: cfg.previousElection.round1 },
    concerns: readJSON(P('data/concerns.json')),
    ballot: ballotDependence(FR.r1, FR.lastPoll),
    certainty: fs.existsSync(P('data/certainty.json')) ? readJSON(P('data/certainty.json')) : null,
    newsletter: { formUrl: (cfg.newsletter || {}).formUrl || '' },
    summary: null
  };
  out.summary = summary(standings, mc, polls, FR);

  // ---------- V2 : détecteur de bascule, baromètre, sondage décrypté, ce qui a changé ----------
  const MOM = momentum(FR, standings);
  const cross = crossings(standings, MOM);
  const open = openness(SC, standings);
  const dec = decode(FR, standings, SC);
  const histPath = P('data/history.json');
  const hist0 = fs.existsSync(histPath) ? readJSON(histPath) : [];
  const today = new Date().toISOString().slice(0, 10);
  out.changes = signals({ MOM, cross, dec, hist: hist0, today, qualify: mc.qualify, nm, features: cfg.features, fmtDate, standings, FR, G: { ...G, daysToR1: R1 - FR.lastPoll }, transfers: T, open });
  const hist = updateHistory(hist0, today, { asOf: out.asOf, open: open.open,
    q: Object.fromEntries(mc.qualify.map(x => [x.c, x.p])), v: Object.fromEntries(standings.map(x => [x.c, x.v])) });
  writeJSON(histPath, hist, true);
  // ---------- « Et si… ? » : listes testées, base, positions ----------
  {
    const req = (OVR.required || []).filter(r => r.since <= new Date().toISOString().slice(0, 10)).map(r => r.id);
    const win = FR.r1.filter(p => FR.lastPoll - p.t <= 90);
    const groups = {};
    for (const p of win) { const k = Object.keys(p.results).sort().join(','); (groups[k] = groups[k] || []).push(p); }
    const tested = Object.entries(groups).map(([k, ps]) => ({ k, ps, surveys: new Set(ps.map(p => p.survey)).size }))
      .filter(g => g.surveys >= 2).filter(g => { const cs = g.k.split(','); return !cs.some(c => WITHDRAWN.has(c)) && req.every(r => cs.includes(r)); })
      .map(g => {
        const cs = g.k.split(','), set = {};
        for (const c of cs) {
          let sw = 0, sx = 0;
          for (const p of g.ps) { const w = p.w * Math.pow(0.5, (FR.lastPoll - p.t) / 21); sw += w; sx += w * (p.results[c] - ((FR.house[c] || {})[p.institute] || 0)); }
          set[c] = Math.max(0.2, sx / sw);
        }
        const S = Object.values(set).reduce((a, b) => a + b, 0);
        for (const c in set) set[c] = round1(set[c] * 100 / S);
        return { cs, set, surveys: g.surveys, last: fromDay(Math.max(...g.ps.map(p => p.t))) };
      });
    out.whatif = {
      base: allScen.set.map(x => ({ c: x.c, v: round1(x.share), band: (standings.find(s => s.c === x.c) || { band: 1.5 }).band })),
      tested, pos: POS.positions, ...cal, calib, source: POS.source
    };
  }
  out.momentum = Object.fromEntries(Object.entries(MOM).map(([c, m]) => { const { slope, se, sd30, ...r } = m; return [c, r]; }));
  out.crossings = cross; out.openness = { ...open, hist: hist.map(h => [h.d, h.open]) }; out.decoded = dec;
  // Effets instituts pour chaque candidat (pages candidats).
  out.houseAll = Object.fromEntries(standings.map(s => [s.c, Object.fromEntries(Object.entries(FR.house[s.c] || {}).map(([i, v]) => [i, round1(v)]))]));
  out.recentPolls = Object.fromEntries(standings.map(s => {
    const by = new Map();
    for (const p of FR.r1.filter(p => s.c in p.results)) {
      const e = by.get(p.survey) || { inst: p.institute, sponsor: p.sponsor, end: p.end, lo: 99, hi: 0, h: 0 };
      e.lo = Math.min(e.lo, p.results[s.c]); e.hi = Math.max(e.hi, p.results[s.c]); e.h++; by.set(p.survey, e);
    }
    return [s.c, [...by.values()].sort((a, b) => b.end.localeCompare(a.end)).slice(0, 10)];
  }));
  // Plan du site et robots.txt pour Google.
  const siteBase = cfg.siteUrl.replace(/\/$/, '');
  fs.writeFileSync(P('site/sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n  <url><loc>${siteBase}/</loc><lastmod>${out.asOf}</lastmod><changefreq>daily</changefreq></url>\n  <url><loc>${siteBase}/?lang=en</loc><lastmod>${out.asOf}</lastmod><changefreq>daily</changefreq></url>\n</urlset>\n`);
  fs.writeFileSync(P('site/robots.txt'), `User-agent: *\nAllow: /\nSitemap: ${siteBase}/sitemap.xml\n`);
  // Image d'aperçu des partages : les réseaux sociaux exigent une adresse absolue.
  const idxPath = P('site/index.html'), html = fs.readFileSync(idxPath, 'utf8');
  const fixed = html.replace(/<meta property="og:image" content="[^"]*">/, `<meta property="og:image" content="${cfg.siteUrl.replace(/\/$/, '')}/${fs.existsSync(P('site/share/carte-du-jour.png')) ? 'share/carte-du-jour.png' : 'og.png'}">`);
  // Numéro de version sur les fichiers CSS/JS : le navigateur recharge les nouvelles versions au lieu de garder l'ancienne en cache.
  const ver = Date.now().toString(36);
  const busted = fixed.replace(/(href|src)="((?:styles\.css|app\.js|debate\.js|i18n(?:-[a-z]+)?\.js))(?:\?v=[^"]*)?"/g, `$1="$2?v=${ver}"`);
  if (busted !== html) fs.writeFileSync(idxPath, busted);
  fs.mkdirSync(P('site/data'), { recursive: true });
  writeJSON(P('site/data/site.json'), out);
  console.log(`OK — ${out.counts.surveys} enquêtes, ${out.counts.hypotheses} hypothèses, dernier terrain ${out.asOf}`);
  console.log('Tête :', standings.slice(0, 6).map(s => `${s.c} ${s.v}±${s.band} (30j ${s.d30})`).join(' | '));
  console.log('Qualif :', mc.qualify.slice(0, 5).map(q => `${q.c} ${q.p}%`).join(' | '), '| couverture duels', mc.coverage + '%');
  console.log('Calibration 2022 :', JSON.stringify(G.calib), 'sd2', mc.sdParams.sd2);
}

// Pendant la période d'interdiction légale (veille et jour du scrutin), aucune mise à jour.
const now = Date.now();
if (cfg.election.blackout.some(b => now >= Date.parse(b.from) && now <= Date.parse(b.to)) && !process.env.FORCE) {
  console.log('Période de réserve électorale : aucune mise à jour (loi n° 77-808, art. 11).');
} else build();
