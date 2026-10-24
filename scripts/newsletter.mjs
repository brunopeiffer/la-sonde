// La Sonde — « Le point du lundi » : lettre hebdomadaire automatique + archive publique (site/lettre/).
// À chaque mise à jour : reconstruit l'archive à partir de data/newsletter/*.html (pages publiques, bonnes pour Google).
// Le lundi matin (heure de Paris) : rédige le numéro de la semaine, l'archive, et l'envoie aux abonnés via Brevo.
// Réglages : config.json → newsletter { listId, senderEmail, senderName, formUrl }. Secret GitHub : BREVO_API_KEY.
// Variables utiles : DRY=1 (rédige sans envoyer ni archiver, aperçu dans site/lettre/apercu/), FORCE=1 (envoie même hors lundi).
import fs from 'node:fs';
import path from 'node:path';
import { readJSON, writeJSON } from './lib.mjs';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const P = (...a) => path.join(ROOT, ...a);
const cfg = readJSON(P('config.json'));
const NL = cfg.newsletter || {};
const D = readJSON(P('site/data/site.json'));
const BASE = D.site.url.replace(/\/$/, '');
const { BREVO_API_KEY, DRY, FORCE } = process.env;
const log = (...a) => console.log('[lettre]', ...a);
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const f1 = x => (Math.round(x * 10) / 10).toFixed(1).replace('.', ',');
const sg = x => (x > 0 ? '+' : x < 0 ? '−' : '±') + f1(Math.abs(x));
const fdate = (d, o = { day: 'numeric', month: 'long', year: 'numeric' }) => new Date(d + 'T12:00:00Z').toLocaleDateString('fr-FR', o);
const now = new Date();
const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris' }).format(now);
const weekday = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Paris', weekday: 'short' }).format(now);
const C = c => D.cands[c] || { name: c, short: c, color: '#888' };

// ---------- Faits de la semaine (tout ce que l'analyse a le droit d'utiliser) ----------
const POS = fs.existsSync(P('data/positions.json')) ? readJSON(P('data/positions.json')).positions : {};
const toD = d => Math.floor(Date.parse(d + 'T00:00:00Z') / 864e5);
function facts() {
  const top = D.standings.filter(s => s.presence >= 30);
  const nm = c => C(c).name;
  const week = D.surveys.filter(s => (Date.parse(today) - Date.parse(s.end)) / 864e5 <= 8);
  // Une enquête = 1er et 2nd tours réunis (ils peuvent figurer comme deux entrées).
  const byK = new Map();
  for (const s of week) { const k = s.inst + s.end; const m = byK.get(k); if (m) m.hyps = [...m.hyps, ...s.hyps]; else byK.set(k, { ...s, hyps: [...s.hyps] }); }
  const polls = [...byK.values()];
  // Blocs politiques sur un bulletin complet (somme = 100 %), positions gauche-droite publiées dans la méthode.
  const base = (D.whatif && D.whatif.base) || [];
  const bloc = c => POS[c] == null ? null : POS[c] < 4.5 ? 'gauche' : POS[c] < 7.6 ? 'centre et droite' : 'droite nationale';
  const blocs = {};
  for (const b of base) { const k = bloc(b.c); if (k) blocs[k] = Math.round(((blocs[k] || 0) + b.v) * 10) / 10; }
  // Duels : niveau actuel et il y a 30 jours.
  const duels = (D.duels || []).map(d => {
    const S = d.series || []; const last = S[S.length - 1]; let prev = null;
    if (last) { const t = last[0] - 30; prev = [...S].reverse().find(x => x[0] <= t) || null; }
    return { duel: `${nm(d.a)} – ${nm(d.b)}`, [nm(d.a)]: d.va, [nm(d.b)]: d.vb, sondages: d.n, evolution30j_pour_premier_nomme: last && prev ? Math.round((last[1] - prev[1]) * 10) / 10 : null };
  });
  // Sondages de la semaine comparés à la moyenne (après correction de l'effet habituel de l'institut).
  const ecarts = [];
  for (const s of polls) {
    const r1 = s.hyps.filter(h => h.round === 1); if (!r1.length) continue;
    const cands = [...new Set(r1.flatMap(h => Object.keys(h.r)))];
    for (const c of cands) {
      const st = D.standings.find(x => x.c === c); if (!st || st.v < 5) continue;
      // Médiane sur les hypothèses de l'enquête (le score dépend de la liste testée).
      const vals = r1.map(h => h.r[c]).filter(v => v != null).sort((a, b) => a - b), v = vals[Math.floor((vals.length - 1) / 2)];
      const he = ((D.houseAll || {})[c] || {})[s.inst] || 0;
      ecarts.push({ sondage: `${s.inst} (${s.sponsor}, ${fdate(s.end, { day: 'numeric', month: 'short' })})`, candidat: nm(c), publie: v, hypotheses: vals.length, corrige: Math.round((v - he) * 10) / 10, moyenne: st.v, ecart: Math.round((v - he - st.v) * 10) / 10 });
    }
  }
  ecarts.sort((a, b) => Math.abs(b.ecart) - Math.abs(a.ecart));
  // Comparaisons À LISTE IDENTIQUE : mêmes enquêtes, même bulletin.
  const SC = (D.scenarios || []).filter(x => x.key !== 'all');
  const sameList = (a, b) => { const sc = SC.filter(x => x.set.some(y => y.c === a) && x.set.some(y => y.c === b)).sort((x, y) => y.surveys - x.surveys);
    return sc.map(x => { const g = c => x.set.find(y => y.c === c).share; const avec = x.set.filter(y => ['EP', 'GA', 'FH', 'DL', 'DV', 'OF'].includes(y.c)).map(y => nm(y.c));
      return { liste: `bulletin avec ${avec.join(', ') || 'aucun candidat du centre'}`, enquetes: x.surveys, [nm(a)]: Math.round(g(a) * 10) / 10, [nm(b)]: Math.round(g(b) * 10) / 10 }; }).slice(0, 3); };
  const pairs = []; const ord = top.slice(0, 5).map(s => s.c);
  for (let i = 1; i < ord.length - 1; i++) pairs.push([ord[i], ord[i + 1]]);
  for (const x of D.crossings || []) if (!pairs.some(p => p.includes(x.a) && p.includes(x.b))) pairs.push([x.a, x.b]);
  const liste_identique = pairs.map(([a, b]) => ({ duo: `${nm(a)} / ${nm(b)}`, comparaisons: sameList(a, b) })).filter(x => x.comparaisons.length);
  // Écarts mesurés contre les enquêtes ayant testé la MÊME configuration de candidats principaux.
  const MAJ = new Set(top.filter(s => s.v >= 4).map(s => s.c));
  const cfgKey = cs => cs.filter(c => MAJ.has(c)).sort().join(',');
  const ecartsL = [];
  for (const s of polls) for (const h of s.hyps.filter(h => h.round === 1)) {
    const sc = SC.find(x => cfgKey(x.set.map(y => y.c)) === cfgKey(Object.keys(h.r))); if (!sc) continue;
    for (const [c, v] of Object.entries(h.r)) { if (!MAJ.has(c)) continue; const ref = sc.set.find(y => y.c === c); if (!ref) continue;
      const he = ((D.houseAll || {})[c] || {})[s.inst] || 0;
      ecartsL.push({ sondage: `${s.inst} (${s.sponsor}, ${fdate(s.end, { day: 'numeric', month: 'short' })})`, candidat: nm(c), publie: v, reference_meme_liste: Math.round(ref.share * 10) / 10, enquetes_reference: sc.surveys, ecart_corrige: Math.round((v - he - ref.share) * 10) / 10 }); } }
  const best = new Map(); for (const e of ecartsL) { const k = e.sondage + e.candidat; if (!best.has(k) || Math.abs(e.ecart_corrige) > Math.abs(best.get(k).ecart_corrige)) best.set(k, e); }
  const ecartsListe = [...best.values()].sort((a, b) => Math.abs(b.ecart_corrige) - Math.abs(a.ecart_corrige));
  // Grandes familles, sans étiquette : composition affichée, de gauche à droite.
  const fam = [[0, 3.0], [3.0, 4.5], [4.5, 7.6], [7.6, 99]];
  const familles = fam.map(([lo, hi]) => { const m = base.filter(b => POS[b.c] != null && POS[b.c] >= lo && POS[b.c] < hi);
    return { candidats: m.sort((x, y) => y.v - x.v).map(b => C(b.c).short), total: Math.round(m.reduce((a, b) => a + b.v, 0) * 10) / 10 }; }).filter(f => f.candidats.length);
  const evenements = (D.events || []).filter(e => (Date.parse(today) - Date.parse(e.date)) / 864e5 <= 45).map(e => ({ date: e.date, fait: e.fr }));
  const PART = fs.existsSync(P('data/participation.json')) ? readJSON(P('data/participation.json')).mesures : [];
  const H = fs.existsSync(P('data/history.json')) ? readJSON(P('data/history.json')) : [];
  const h7 = [...H].reverse().find(x => toD(x.d) <= toD(today) - 7) || H[0];
  const q = (D.mc?.qualify || []).filter(x => x.p >= 1).map(x => ({ candidat: nm(x.c), chances: Math.round(x.p), il_y_a_7j: h7 && h7.q && h7.q[x.c] != null ? Math.round(h7.q[x.c]) : null }));
  const cert = D.certainty && D.certainty.waves && D.certainty.waves.slice(-1)[0];
  // 2022 à la même distance du 1er tour.
  let y2022 = null; const G = D.ghosts, J = D.mc?.daysToR1;
  if (G && J != null) { let i = 0; G.daysBack.forEach((d, k) => { if (Math.abs(d - J) < Math.abs(G.daysBack[i] - J)) i = k; });
    if (Math.abs(G.daysBack[i] - J) <= 4) { const all = Object.entries(G.series).map(([k, s]) => ({ candidat: k, sondages_a_cette_date: s.v[i], resultat_final: Math.round(s.result * 10) / 10, ecart: Math.round((s.result - s.v[i]) * 10) / 10 })).filter(x => x.sondages_a_cette_date != null);
      const up = [...all].sort((a, b) => b.ecart - a.ecart)[0], dn = [...all].sort((a, b) => a.ecart - b.ecart)[0];
      y2022 = { candidats: all.slice(0, 6), plus_forte_hausse_ensuite: up, plus_forte_baisse_ensuite: dn }; } }
  return {
    date: today, jours_avant_1er_tour: J, donnees_au: D.asOf,
    moyenne: top.slice(0, 10).map(s => ({ candidat: nm(s.c), parti: C(s.c).party, moyenne: s.v, marge: s.band, evol_7j: s.d7, evol_30j: s.d30,
      tendance_14j: ({ up: 'hausse nette', down: 'baisse nette', flat: 'stable (dans le bruit)' })[(D.momentum?.[s.c] || {}).state] || 'trop peu testé', certitude_tendance: (() => { const m = D.momentum?.[s.c] || {}; return m.state === 'up' ? m.pUp : m.state === 'down' ? 100 - m.pUp : null; })(), teste_dans_pct_des_hypotheses: Math.round(s.presence) })),
    signaux_detectes: (D.changes?.fr || []).map(x => x.t),
    bascules_possibles: (D.crossings || []).map(x => ({ entre: `${nm(x.a)} et ${nm(x.b)}`, place: x.rank, ecart_moyenne_generale: x.gap, les_courbes_se_croisent_si_la_tendance_des_14_derniers_jours_continue: x.p >= 60 })),
    comparaisons_a_liste_identique: liste_identique,
    familles_de_gauche_a_droite: familles,
    evenements_dates_recents: evenements,
    participation_et_indecis: PART,
    qualification_2nd_tour: q,
    duel_le_plus_probable: D.openness ? { duel: D.openness.duo.map(nm).join(' – '), probabilite: Math.round(D.openness.pDuo) } : null,
    duels_second_tour: duels,
    sondages_de_la_semaine: polls.map(s => ({ institut: s.inst, commanditaire: s.sponsor, terrain: `${s.start} au ${s.end}`, echantillon: s.n, hypotheses: s.hyps.length })),
    ecarts_a_liste_identique: ecartsListe.slice(0, 5),
    solidite_du_vote: cert ? { source: `${cert.inst}, ${cert.field.fr || ''}`, part_sure_de_son_choix: Object.fromEntries(Object.entries(cert.sure).map(([c, v]) => [nm(c), v])), ensemble: cert.all } : null,
    reports_mesures: (D.transfers || []).map(t => ({ si_retrait_de: nm(t.c), sondages: t.surveys, vers: t.flows.filter(f => f.pct >= 5).map(f => ({ candidat: nm(f.c), part: f.pct })) })),
    comparaison_2022_meme_date: y2022,
  };
}

// ---------- L'analyse de la semaine (rédigée par l'IA à partir des seuls faits, puis contrôlée) ----------
const RULES = `Tu es le rédacteur en chef « data » d'un agrégateur de sondages indépendant. Tu écris l'analyse hebdomadaire de la lettre « Le point du lundi », lue par des passionnés de politique et des journalistes qui doivent pouvoir la citer.
Règles absolues :
- NEUTRALITÉ TOTALE : aucun jugement sur les candidats, leurs idées ou leur campagne ; aucun adjectif valorisant ou dévalorisant ; aucune étiquette politique (pas de « extrême », « radical », « populiste », « modéré ») : désigne les candidats par leur nom ; jamais de conseil de vote ; même distance avec tous les camps.
- N'UTILISE QUE LES CHIFFRES FOURNIS, recopiés tels quels ou arrondis à l'entier. Ne calcule aucun nouveau nombre (ni écart, ni somme). N'invente aucun fait.
- ARRONDIS : dans le texte, intentions de vote arrondies à l'entier (35 %, pas 35,3 %) ; une décimale seulement pour les évolutions et les écarts (1,9 point).
- COMPARAISONS : pour comparer deux candidats proches, appuie-toi d'abord sur « comparaisons_a_liste_identique » (mêmes enquêtes, même bulletin), en précisant le bulletin et le nombre d'enquêtes ; la moyenne générale mélange des listes différentes.
- PROBABILITÉS : n'écris jamais de pourcentage de « chances d'inversion ». Une bascule se formule : « les courbes se croiseraient si la tendance des deux dernières semaines se poursuivait ». Les chances de qualification peuvent être citées, toujours comme une simulation.
- ÉCARTS ENTRE INSTITUTS : n'utilise que « ecarts_a_liste_identique ».
- CONTEXTE : tu peux mentionner un événement de « evenements_dates_recents » et sa date, en parlant de concomitance (« depuis », « après ») ; n'affirme jamais qu'il a causé un mouvement.
- 2022 : si tu évoques 2022, cite TOUJOURS ensemble « plus_forte_hausse_ensuite » et « plus_forte_baisse_ensuite ».
- Distingue ce qui est net de ce qui reste dans la marge (« marge », « tendance_14j »). Évoque la participation ou les indécis quand c'est pertinent.
- Style : précis, sobre, phrases courtes, angle journalistique, sans formule creuse.
Format : un bloc <json>{"titre":"…(max 90 caractères, factuel, sans probabilité)","chiffres_cles":[{"chiffre":"…","legende":"…"},{…},{…}],"paragraphes":["…","…","…","…"]}</json>
- chiffres_cles : exactement 3 faits citables ; « chiffre » court (ex. « 13 % ») et « legende » d'une phrase.
- paragraphes : 4 paragraphes de 60 à 90 mots : 1) le fait principal et pourquoi il compte ; 2) la qualification au second tour (à liste identique) ; 3) ce que disent les sondages de la semaine (écarts à liste identique, solidité, participation) ; 4) mise en perspective (seconds tours, 2022 de façon symétrique), avec prudence.`;

function numbersOk(text, F) {
  const pool = new Set();
  const walk = v => { if (v == null) return; if (typeof v === 'number') { pool.add(Math.round(v * 10) / 10); pool.add(Math.round(v)); pool.add(Math.round(Math.abs(v) * 10) / 10); }
    else if (typeof v === 'string') (v.match(/\d+(?:[.,]\d+)?/g) || []).forEach(n => pool.add(Number(n.replace(',', '.'))));
    else if (Array.isArray(v)) v.forEach(walk); else if (typeof v === 'object') Object.values(v).forEach(walk); };
  walk(F); [2022, 2027, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 14, 30, 50, 100].forEach(n => pool.add(n));
  const bad = (text.match(/\d+(?:,\d+)?/g) || []).map(n => Number(n.replace(',', '.'))).filter(n => !pool.has(n) && !pool.has(Math.round(n * 10) / 10));
  return bad;
}
async function analysis(F) {
  const KEY = process.env.ANTHROPIC_API_KEY;
  if (!KEY || NL.analysis === false) return null;
  const model = process.env.CLAUDE_MODEL || cfg.agent?.model || 'claude-haiku-5-5';
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const r = await fetch('https://api.anthropic.com/v1/messages', { method: 'POST',
        headers: { 'x-api-key': KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
        body: JSON.stringify({ model, max_tokens: 1500, messages: [{ role: 'user', content: `${RULES}\n\nFAITS DE LA SEMAINE (JSON) :\n${JSON.stringify(F)}` }] }) });
      if (!r.ok) throw new Error(`API ${r.status} ${(await r.text()).slice(0, 150)}`);
      const txt = (await r.json()).content.filter(b => b.type === 'text').map(b => b.text).join('');
      const m = txt.match(/<json>([\s\S]*?)<\/json>/) || txt.match(/(\{[\s\S]*\})/);
      const A = JSON.parse(m[1]);
      if (!A.titre || !Array.isArray(A.paragraphes) || A.paragraphes.length < 3) throw new Error('format');
      if (/chances? d.inversion|\d+ ?% de chances qu/i.test([A.titre, ...A.paragraphes].join(' '))) { log('probabilité d\'inversion citée : refusée'); continue; }
      const bad = numbersOk([A.titre, ...A.paragraphes, ...(A.chiffres_cles || []).flatMap(k => [k.chiffre, k.legende])].join(' '), F);
      if (bad.length) { log('chiffres non vérifiables dans l\'analyse :', bad.join(', ')); continue; }
      return A;
    } catch (e) { log('analyse IA indisponible :', e.message); }
  }
  return null;
}

// ---------- Rédaction du numéro ----------
async function issue() {
  const F = facts();
  const A = DRY && process.env.NL_SAMPLE ? JSON.parse(fs.readFileSync(process.env.NL_SAMPLE, 'utf8')) : await analysis(F);
  const top = D.standings.filter(s => s.presence >= 30).slice(0, 8);
  const subject = A ? `Le point du lundi · ${A.titre}` : `Le point du lundi · ${top.slice(0, 3).map(s => `${C(s.c).short} ${Math.round(s.v)} %`).join(', ')}`;
  const max = Math.max(...top.map(s => s.v));
  const row = s => `<tr><td style="padding:7px 0;font:600 15px Arial,sans-serif;color:#15131f;width:150px"><span style="display:inline-block;width:9px;height:9px;border-radius:50%;background:${C(s.c).color};margin-right:7px"></span>${esc(C(s.c).short)}</td>
    <td style="padding:7px 8px"><div style="height:12px;border-radius:6px;background:#efe9df"><div style="height:12px;width:${Math.round(s.v / max * 100)}%;border-radius:6px;background:${C(s.c).color}"></div></div></td>
    <td style="padding:7px 0;font:800 15px Arial,sans-serif;color:#15131f;text-align:right;width:60px">${f1(s.v)} %</td>
    <td style="padding:7px 0 7px 8px;font:700 13px Arial,sans-serif;text-align:right;width:56px;color:${s.d7 >= 0.3 ? '#0f8a5f' : s.d7 <= -0.3 ? '#d23a5f' : '#8a8598'}">${sg(s.d7)}</td>
    <td style="padding:7px 0 7px 8px;font:700 13px Arial,sans-serif;text-align:right;width:56px;color:${s.d30 >= 0.5 ? '#0f8a5f' : s.d30 <= -0.5 ? '#d23a5f' : '#8a8598'}">${sg(s.d30)}</td></tr>`;
  const h2 = t => `<h2 style="font:800 19px Arial,sans-serif;color:#15131f;margin:30px 0 10px">${t}</h2>`;
  const note = t => `<p style="font-size:12.5px;color:#7d788c;margin:6px 0 0">${t}</p>`;
  const tbl = (head, rows) => `<table role="presentation" style="width:100%;border-collapse:collapse;font:14px Arial,sans-serif">${head ? `<tr>${head.map((h, i) => `<td style="padding:6px 4px;border-bottom:2px solid #e6dfd4;font-weight:700;color:#7d788c;font-size:12px;text-transform:uppercase;letter-spacing:.04em;${i ? 'text-align:right' : ''}">${h}</td>`).join('')}</tr>` : ''}${rows.map(r => `<tr>${r.map((c, i) => `<td style="padding:7px 4px;border-bottom:1px solid #efe9df;${i ? 'text-align:right;white-space:nowrap' : ''}">${c}</td>`).join('')}</tr>`).join('')}</table>`;
  // Grandes familles, sans étiquette
  const FA = F.familles_de_gauche_a_droite, ft = FA.reduce((x, f) => x + f.total, 0) || 1, fcol = ['#c2185b', '#e86a92', '#5b7fd6', '#2a3a8f'];
  const blocs = FA.length ? h2('Les grands ensembles, de gauche à droite') + `<div style="display:flex;height:26px;border-radius:8px;overflow:hidden">${FA.map((f, i) => `<div style="width:${f.total / ft * 100}%;background:${fcol[i]};color:#fff;font:800 12px/26px Arial,sans-serif;text-align:center">${Math.round(f.total)} %</div>`).join('')}</div>
    ${tbl(null, FA.map((f, i) => [`<span style="display:inline-block;width:9px;height:9px;border-radius:2px;background:${fcol[i]};margin-right:6px"></span>${esc(f.candidats.join(', '))}`, `<b>${Math.round(f.total)} %</b>`]))}` + note('Totaux sur un bulletin réunissant tous les candidats déclarés, regroupés selon leur position gauche-droite publiée dans la méthode de La Sonde. Aucune étiquette n\'est attribuée : la composition de chaque ensemble est affichée.') : '';
  // Analyse
  const keys = A && Array.isArray(A.chiffres_cles) && A.chiffres_cles.length ? `<table role="presentation" style="width:100%;border-collapse:separate;border-spacing:8px 0;margin:22px -8px 0"><tr>${A.chiffres_cles.slice(0, 3).map(k => `<td style="width:33%;vertical-align:top;padding:14px;border-radius:14px;background:#5b2cff;color:#fff"><div style="font:800 26px/1.1 Arial,sans-serif">${esc(k.chiffre)}</div><div style="font:13px/1.4 Arial,sans-serif;margin-top:6px">${esc(k.legende)}</div></td>`).join('')}</tr></table>` : '';
  const img = `<p style="margin:22px 0 0"><a href="${BASE}/"><img src="${BASE}/share/carte-du-jour.png" alt="Moyenne des sondages de la présidentielle 2027 au ${esc(fdate(D.asOf))}, La Sonde" width="604" style="width:100%;height:auto;border-radius:12px;border:1px solid #e6dfd4"></a></p>${note('Graphique réutilisable avec la mention « Source : La Sonde (la-sonde.fr) ».')}`;
  const an = A ? `<div style="margin:26px 0 0;padding:22px 24px;border-radius:16px;background:#fff;border:1px solid #e6dfd4">
    <p style="margin:0 0 6px;font:800 12px Arial,sans-serif;letter-spacing:.12em;color:#5b2cff">L'ANALYSE DE LA SEMAINE</p>
    <h2 style="font:800 22px/1.25 Arial,sans-serif;color:#15131f;margin:0 0 12px">${esc(A.titre)}</h2>
    ${A.paragraphes.map(p => `<p style="margin:0 0 12px">${esc(p)}</p>`).join('')}
    <p style="margin:6px 0 0;font-size:12px;color:#7d788c">Rédigée automatiquement à partir des seuls chiffres de La Sonde, chaque nombre étant vérifié avant envoi. Aucune information de campagne n'y est ajoutée.</p></div>` : '';
  // Qualification
  const qual = F.qualification_2nd_tour.length && D.features?.probabilities !== false ? h2('Qui ira au second tour ?') + tbl(['Candidat', 'Chances', 'Il y a 7 j'],
    F.qualification_2nd_tour.slice(0, 6).map(x => [esc(x.candidat), `<b>${x.chances} %</b>`, x.il_y_a_7j == null ? '–' : `${x.il_y_a_7j} %`]))
    + (F.duel_le_plus_probable ? note(`Duel le plus probable : ${esc(F.duel_le_plus_probable.duel)}, ${F.duel_le_plus_probable.probabilite} % des simulations. Chances simulées à partir des sondages et de leur erreur historique : ce n'est pas une prédiction.`) : '') : '';
  // Bascules
  const bas = F.bascules_possibles.length ? h2('Les bascules à surveiller') + `<ul style="padding-left:20px;margin:0">${F.bascules_possibles.map(x => `<li style="margin:0 0 6px"><b>${esc(x.entre)}</b> (${x.place}e et ${x.place + 1}e places dans la moyenne générale) : ${f1(x.ecart_moyenne_generale)} pt d'écart${x.les_courbes_se_croisent_si_la_tendance_des_14_derniers_jours_continue ? ' ; les courbes se croiseraient si la tendance des deux dernières semaines se poursuivait' : ''}.</li>`).join('')}</ul>` : '';
  // À liste identique
  const LI = F.comparaisons_a_liste_identique;
  const last = n => n.split(' ').slice(-1)[0];
  const liHtml = LI.length ? h2('Face à face, sur le même bulletin') + tbl(['Duo · bulletin testé', 'Enquêtes', 'Scores'], LI.flatMap(d => d.comparaisons.slice(0, 2).map(c => {
      const [a, b] = d.duo.split(' / '); return [`<b>${esc(d.duo)}</b><br><span style="color:#7d788c;font-size:12.5px">${esc(c.liste)}</span>`, c.enquetes, `${esc(last(a))} ${f1(c[a])} · ${esc(last(b))} ${f1(c[b])}`]; })))
    + note('Moyenne des enquêtes ayant testé exactement la même configuration de candidats : la comparaison la plus fiable entre deux concurrents proches.') : '';
  // Second tour
  const r2 = F.duels_second_tour.length ? h2('Les seconds tours testés') + tbl(['Duel', 'Moyenne', '30 j', 'Sondages'],
    F.duels_second_tour.map(d => { const [a, b] = d.duel.split(' – '); return [esc(d.duel), `${f1(d[a])} – ${f1(d[b])}`, d.evolution30j_pour_premier_nomme == null ? '–' : sg(d.evolution30j_pour_premier_nomme), d.sondages]; }))
    + note('Évolution sur 30 jours du score du premier nommé.') : '';
  // Écarts des sondages de la semaine, à liste identique
  const ec = F.ecarts_a_liste_identique.filter(x => Math.abs(x.ecart_corrige) >= 1.5).slice(0, 4);
  const ecHtml = ec.length ? h2('Les sondages qui s\'écartent, à liste identique') + tbl(['Sondage', 'Candidat', 'Publié', 'Même liste', 'Écart corrigé'],
    ec.map(x => [esc(x.sondage), esc(x.candidat), `${f1(x.publie)} %`, `${f1(x.reference_meme_liste)} %`, `<b>${sg(x.ecart_corrige)}</b>`])) + note('Comparaison avec la moyenne des enquêtes ayant testé la même configuration de candidats, après correction de l\'effet habituel de l\'institut. Un écart isolé est souvent du bruit ; il devient un signal s\'il se répète.') : '';
  // Solidité
  const so = F.solidite_du_vote ? h2('La solidité du vote') + `<p style="margin:0">Part des électeurs sûrs de leur choix : ${Object.entries(F.solidite_du_vote.part_sure_de_son_choix).sort((a, b) => b[1] - a[1]).map(([c, v]) => `${esc((Object.values(D.cands).find(k => k.name === c) || { short: c }).short)} <b>${v} %</b>`).join(' · ')}.</p>` + note(`Source : ${esc(F.solidite_du_vote.source)}. Ensemble des électeurs : ${F.solidite_du_vote.ensemble} % sûrs de leur choix.`) : '';
  // Participation et indécis
  const PA = F.participation_et_indecis || [];
  const pa = PA.length ? h2('Participation et indécis') + PA.map(m => `<p style="margin:0 0 8px"><b>${esc(m.institut)}</b> (${esc(m.terrain)}) · ${esc(m.question.charAt(0).toLowerCase() + m.question.slice(1))} : ${Object.entries(m.resultats).map(([k, v]) => `${esc(k)} <b>${f1(v).replace(',0', '')} %</b>`).join(' · ')}.${m.indecis ? ' ' + esc(m.indecis) : ''}</p>`).join('') + note('À six mois du vote, la mobilisation reste l\'inconnue principale : les intentions de vote ne portent que sur les électeurs qui expriment un choix.') : '';
  // 2022, présenté de façon symétrique
  const Y = F.comparaison_2022_meme_date;
  const y = Y ? h2(`Il y a cinq ans, à J-${F.jours_avant_1er_tour}`) + tbl(['Candidat 2022', 'Sondages à cette date', 'Résultat', 'Écart'],
    Y.candidats.slice(0, 6).map(x => [esc(x.candidat), `${f1(x.sondages_a_cette_date)} %`, `<b>${f1(x.resultat_final)} %</b>`, sg(x.ecart)]))
    + note(`Plus forte progression ensuite : ${esc(Y.plus_forte_hausse_ensuite.candidat)} (${sg(Y.plus_forte_hausse_ensuite.ecart)} pts) ; plus fort recul : ${esc(Y.plus_forte_baisse_ensuite.candidat)} (${sg(Y.plus_forte_baisse_ensuite.ecart)} pts). À six mois du vote, les sondages mesurent un rapport de force, pas un résultat.`) : '';
  const polls = F.sondages_de_la_semaine;
  const html = `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(subject)}</title></head>
<body style="margin:0;background:#fbf7f1"><div style="max-width:640px;margin:0 auto;padding:24px 18px;font:16px/1.6 Arial,sans-serif;color:#2a2733">
<div style="height:8px;border-radius:4px;background:linear-gradient(90deg,#5b2cff,#ff3d7f,#ff8a00);background-color:#ff3d7f"></div>
<p style="margin:18px 0 0;font:800 13px Arial,sans-serif;letter-spacing:.12em;color:#5b2cff">LA SONDE · LE POINT DU LUNDI · ${esc(fdate(today).toUpperCase())} · J-${F.jours_avant_1er_tour}</p>
<h1 style="font:800 28px/1.15 Arial,sans-serif;color:#15131f;margin:8px 0 6px">Présidentielle 2027 : la semaine des sondages</h1>
<p style="margin:0;color:#6b6680">${polls.length} nouveau${polls.length > 1 ? 'x' : ''} sondage${polls.length > 1 ? 's' : ''} cette semaine · données au ${esc(fdate(D.asOf))}</p>
${keys}${an}${img}
${h2('La moyenne des sondages')}
<table role="presentation" style="width:100%;border-collapse:collapse"><tr><td></td><td></td><td></td><td style="font:700 11px Arial,sans-serif;color:#7d788c;text-align:right">7 J</td><td style="font:700 11px Arial,sans-serif;color:#7d788c;text-align:right">30 J</td></tr>${top.map(row).join('')}</table>
${note('Moyenne de tous les sondages publiés, corrigée des effets instituts. Écarts en points.')}
${blocs}${qual}${bas}${liHtml}${ecHtml}${so}${pa}${r2}${y}
${h2(`Les sondages de la semaine (${polls.length})`)}
${polls.length ? `<ul style="padding-left:20px;margin:0">${polls.map(s => `<li style="margin:0 0 6px"><b>${esc(s.institut)}</b> pour ${esc(s.commanditaire)} · terrain du ${esc(fdate(s.terrain.slice(0, 10), { day: 'numeric', month: 'short' }))} au ${esc(fdate(s.terrain.slice(-10), { day: 'numeric', month: 'short' }))}, ${s.echantillon.toLocaleString('fr-FR')} personnes, ${s.hypotheses} hypothèse${s.hypotheses > 1 ? 's' : ''}</li>`).join('')}</ul>` : '<p style="margin:0">Aucun nouveau sondage d\'intentions de vote cette semaine.</p>'}
<p style="margin:30px 0"><a href="${BASE}/" style="display:inline-block;padding:13px 22px;border-radius:999px;background:#5b2cff;color:#fff;font:800 15px Arial,sans-serif;text-decoration:none">Tout voir sur la-sonde.fr →</a></p>
<p style="font-size:14px;margin:0 0 18px">Cette lettre vous est utile ? <a href="${BASE}/lettre/" style="color:#5b2cff;font-weight:700">Transférez-la</a> à un ami passionné de politique.</p>
<p style="font-size:12.5px;color:#7d788c;border-top:1px solid #e6dfd4;padding-top:14px">La Sonde agrège les sondages publiés (notices de la Commission des sondages) ; ces chiffres sont une moyenne, pas un sondage. Site indépendant, sans publicité. Vous recevez cette lettre parce que vous vous êtes inscrit sur la-sonde.fr. <a href="{{ unsubscribe }}" style="color:#7d788c">Se désabonner</a></p>
</div></body></html>`;
  return { subject, html, F, A };
}

// ---------- Archive publique ----------
function archive() {
  // La page /lettre/ existe toujours (même avant le premier numéro) : c'est là qu'arrivent les nouveaux abonnés.
  const dir = P('data/newsletter');
  const files = (fs.existsSync(dir) ? fs.readdirSync(dir) : []).filter(f => /^\d{4}-\d{2}-\d{2}\.html$/.test(f)).sort().reverse();
  fs.rmSync(P('site/lettre'), { recursive: true, force: true });
  for (const f of files) {
    const d = f.slice(0, 10), out = P('site/lettre', d);
    fs.mkdirSync(out, { recursive: true });
    fs.writeFileSync(path.join(out, 'index.html'), fs.readFileSync(path.join(dir, f), 'utf8').replace(/<a href="\{\{ unsubscribe \}\}"[^>]*>Se désabonner<\/a>/, `<a href="${BASE}/lettre/" style="color:#7d788c">Tous les numéros</a>`));
  }
  const form = NL.formUrl ? `<p><a href="${esc(NL.formUrl)}" style="display:inline-block;padding:12px 20px;border-radius:999px;background:#5b2cff;color:#fff;font-weight:800;text-decoration:none">S'abonner gratuitement</a></p>` : '';
  fs.mkdirSync(P('site/lettre'), { recursive: true });
  fs.writeFileSync(P('site/lettre/index.html'), `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Le point du lundi : la lettre hebdomadaire des sondages de la présidentielle 2027 | La Sonde</title>
<meta name="description" content="Chaque lundi, la moyenne des sondages de la présidentielle 2027, les signaux de la semaine et les nouveaux sondages. Gratuit, indépendant, sans publicité.">
<link rel="canonical" href="${BASE}/lettre/"></head>
<body style="margin:0;background:#fbf7f1;font:16px/1.6 Arial,sans-serif;color:#2a2733"><div style="max-width:680px;margin:0 auto;padding:32px 18px">
<p><a href="${BASE}/" style="color:#5b2cff;font-weight:800;text-decoration:none">← La Sonde</a></p>
<h1 style="font:800 32px/1.15 Arial,sans-serif;color:#15131f">Le point du lundi</h1>
<p>Chaque lundi matin : la moyenne des sondages de la présidentielle 2027, ce qui a bougé, et les sondages de la semaine. Gratuit, sans publicité, désinscription en un clic.</p>${form}
<h2 style="font:800 20px Arial,sans-serif;margin-top:30px">Tous les numéros</h2>
${files.length ? `<ul>${files.map(f => `<li><a href="${f.slice(0, 10)}/">${fdate(f.slice(0, 10))}</a></li>`).join('')}</ul>` : '<p>Le premier numéro paraîtra lundi prochain.</p>'}
</div></body></html>`);
  // Page d'arrivée après le clic dans l'e-mail de confirmation Brevo (réglage Brevo : « page de confirmation » → /lettre/merci/).
  fs.mkdirSync(P('site/lettre/merci'), { recursive: true });
  fs.writeFileSync(P('site/lettre/merci/index.html'), `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Inscription confirmée | La Sonde</title><meta name="robots" content="noindex"></head>
<body style="margin:0;background:#fbf7f1;font:17px/1.6 Arial,sans-serif;color:#2a2733"><div style="max-width:620px;margin:0 auto;padding:48px 18px;text-align:center">
<div style="height:8px;border-radius:4px;background:linear-gradient(90deg,#5b2cff,#ff3d7f,#ff8a00);background-color:#ff3d7f;margin-bottom:36px"></div>
<div style="width:72px;height:72px;margin:0 auto 18px;border-radius:50%;background:#e9fbf1;color:#0f8a5f;font:800 40px/72px Arial,sans-serif">✓</div>
<h1 style="font:800 32px/1.15 Arial,sans-serif;color:#15131f;margin:0 0 12px">C'est confirmé, merci !</h1>
<p style="margin:0 0 8px">Vous recevrez <b>Le point du lundi</b> chaque lundi matin : la moyenne des sondages de la présidentielle 2027, ce qui a bougé et les sondages de la semaine.</p>
<p style="margin:0 0 28px;color:#6b6680;font-size:15px">Pour ne pas le manquer, ajoutez <b>contact@la-sonde.fr</b> à vos contacts.</p>
<p><a href="${BASE}/" style="display:inline-block;padding:13px 22px;border-radius:999px;background:#5b2cff;color:#fff;font-weight:800;text-decoration:none">Voir la moyenne des sondages →</a></p>
<p style="margin-top:22px;font-size:15px">Le site vous est utile ? <a href="https://ko-fi.com/lasonde" style="color:#5b2cff;font-weight:700">Un café fait la différence</a> · <a href="${BASE}/lettre/" style="color:#5b2cff;font-weight:700">Les anciens numéros</a></p>
</div></body></html>`);
  return files.length;
}

// ---------- Envoi via Brevo ----------
async function brevo(pathname, body) {
  const r = await fetch('https://api.brevo.com/v3' + pathname, { method: 'POST', headers: { 'api-key': BREVO_API_KEY, 'content-type': 'application/json', accept: 'application/json' }, body: JSON.stringify(body || {}) });
  const txt = await r.text();
  if (!r.ok) throw new Error(`${pathname} ${r.status} ${txt.slice(0, 200)}`);
  return txt ? JSON.parse(txt) : {};
}

const n = archive();
log(`archive : ${n} numéro(s)`);
if (cfg.features?.newsletter === false) { log('désactivée dans config.json'); process.exit(0); }

if (DRY) {
  const { subject, html, F } = await issue();
  if (process.env.NL_FACTS) fs.writeFileSync(process.env.NL_FACTS, JSON.stringify(F, null, 1));
  fs.mkdirSync(P('site/lettre/apercu'), { recursive: true });
  fs.writeFileSync(P('site/lettre/apercu/index.html'), html);
  log('aperçu écrit dans site/lettre/apercu/ — objet :', subject);
  process.exit(0);
}
const statePath = P('data/newsletter_state.json');
const st = fs.existsSync(statePath) ? readJSON(statePath) : {};
if (cfg.election.blackout.some(b => now >= Date.parse(b.from) && now <= Date.parse(b.to))) { log('réserve électorale : pas de lettre'); process.exit(0); }
if (!FORCE && weekday !== 'Mon') process.exit(0);
if (!FORCE && st.last === today) { log('déjà envoyée aujourd\'hui'); process.exit(0); }
if (!BREVO_API_KEY || !NL.listId || !NL.senderEmail) { log('Brevo non configuré (secret BREVO_API_KEY, newsletter.listId, newsletter.senderEmail) : rien n\'est envoyé'); process.exit(0); }

const { subject, html, A } = await issue();
if (!A) log('envoi sans analyse IA (clé absente ou chiffres non vérifiables)');
try {
  const c = await brevo('/emailCampaigns', { name: `Le point du lundi ${today}`, subject, sender: { name: NL.senderName || 'La Sonde', email: NL.senderEmail },
    type: 'classic', htmlContent: html, recipients: { listIds: [Number(NL.listId)] } });
  await brevo(`/emailCampaigns/${c.id}/sendNow`);
  fs.mkdirSync(P('data/newsletter'), { recursive: true });
  fs.writeFileSync(P('data/newsletter', `${today}.html`), html);
  writeJSON(statePath, { last: today, campaign: c.id, subject }, true);
  archive();
  log('envoyée :', subject);
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `### Lettre hebdomadaire\n\n- ✔ Envoyée : ${subject}\n\n`);
} catch (e) {
  log('échec :', e.message);
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `### Lettre hebdomadaire\n\n- ⚠ Échec de l'envoi : ${e.message}\n\n`);
}
