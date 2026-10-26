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
      ecartsL.push({ sondage: `${s.inst} (${s.sponsor}, ${fdate(s.end, { day: 'numeric', month: 'short' })})`, inst: s.inst, media: s.sponsor, fin: s.end, candidat: nm(c), publie: v, reference_meme_liste: Math.round(ref.share * 10) / 10, enquetes_reference: sc.surveys, ecart_corrige: Math.round((v - he - ref.share) * 10) / 10 }); } }
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

// ---------- Langues de la lettre ----------
// Les intitulés fixes sont traduits ici (gratuit). Seuls l'analyse de la semaine et quelques libellés de sondages
// (participation, solidité) passent par l'IA, en UN appel plafonné à newsletter.translation.maxUsd (0,05 $ par défaut).
const LANGS = ['fr', 'en', 'de', 'es', 'it'];
const LOC = { fr: 'fr-FR', en: 'en-GB', de: 'de-DE', es: 'es-ES', it: 'it-IT' };
const LANG_NAME = { en: 'anglais (English)', de: 'allemand (Deutsch)', es: 'espagnol (Español)', it: 'italien (Italiano)' };
const L = {
  fr: { undecl: 'Testés mais non déclarés :', brand: 'Le point du lundi', h1: 'Présidentielle 2027 : la semaine des sondages', week: (n, d) => `${n} nouveau${n > 1 ? 'x' : ''} sondage${n > 1 ? 's' : ''} cette semaine · données au ${d}`,
    avg: 'La moyenne des sondages', d7: '7 J', d30: '30 J', avgNote: 'Moyenne de tous les sondages publiés, corrigée des effets instituts. Écarts en points.',
    fam: 'Les grands ensembles, de gauche à droite', famNote: 'Totaux sur un bulletin réunissant tous les candidats déclarés, regroupés selon leur position gauche-droite publiée dans la méthode de La Sonde. Aucune étiquette n\'est attribuée : la composition de chaque ensemble est affichée.',
    anK: 'L\'ANALYSE DE LA SEMAINE', anNote: 'Rédigée automatiquement à partir des seuls chiffres de La Sonde, chaque nombre étant vérifié avant envoi. Aucune information de campagne n\'y est ajoutée.',
    imgAlt: d => `Moyenne des sondages de la présidentielle 2027 au ${d}, La Sonde`, imgNote: 'Graphique réutilisable avec la mention « Source : La Sonde (la-sonde.fr) ».',
    qual: 'Qui ira au second tour ?', qualH: ['Candidat', 'Chances', 'Il y a 7 j'], duo: (d, p) => `Duel le plus probable : ${d}, ${p} des simulations. Chances simulées à partir des sondages et de leur erreur historique : ce n'est pas une prédiction.`,
    bas: 'Les bascules à surveiller', and: 'et', basItem: (e, a, b, g, x) => `<b>${e}</b> (${a}e et ${b}e places dans la moyenne générale) : ${g} pt d'écart${x ? ' ; les courbes se croiseraient si la tendance des deux dernières semaines se poursuivait' : ''}.`,
    li: 'Face à face, sur le même bulletin', liH: ['Duo · bulletin testé', 'Enquêtes', 'Scores'], withL: 'bulletin avec', noCentre: 'bulletin sans candidat du centre', liNote: 'Moyenne des enquêtes ayant testé exactement la même configuration de candidats : la comparaison la plus fiable entre deux concurrents proches.',
    r2: 'Les seconds tours testés', r2H: ['Duel', 'Moyenne', '30 j', 'Sondages'], r2Note: 'Évolution sur 30 jours du score du premier nommé.',
    ec: 'Les sondages qui s\'écartent, à liste identique', ecH: ['Sondage', 'Candidat', 'Publié', 'Même liste', 'Écart corrigé'], ecNote: 'Comparaison avec la moyenne des enquêtes ayant testé la même configuration de candidats, après correction de l\'effet habituel de l\'institut. Un écart isolé est souvent du bruit ; il devient un signal s\'il se répète.',
    so: 'La solidité du vote', soTxt: 'Part des électeurs sûrs de leur choix', soNote: (s, v) => `Source : ${s}. Ensemble des électeurs : ${v} sûrs de leur choix.`,
    pa: 'Participation et indécis', paNote: 'À six mois du vote, la mobilisation reste l\'inconnue principale : les intentions de vote ne portent que sur les électeurs qui expriment un choix.',
    y: j => `Il y a cinq ans, à J-${j}`, yH: ['Candidat 2022', 'Sondages à cette date', 'Résultat', 'Écart'], yNote: (u, d) => `Plus forte progression ensuite : ${u} ; plus fort recul : ${d}. À six mois du vote, les sondages mesurent un rapport de force, pas un résultat.`, pts: 'pts',
    polls: n => `Les sondages de la semaine (${n})`, poll: (i, m, a, b, n, h) => `<b>${i}</b> pour ${m} · terrain du ${a} au ${b}, ${n} personnes, ${h} hypothèse${h > 1 ? 's' : ''}`, none: 'Aucun nouveau sondage d\'intentions de vote cette semaine.',
    cta: 'Tout voir sur la-sonde.fr →', fwd: u => `Cette lettre vous est utile ? <a href="${u}" style="color:#5b2cff;font-weight:700">Transférez-la</a> à un ami passionné de politique.`,
    foot: 'La Sonde agrège les sondages publiés (notices de la Commission des sondages) ; ces chiffres sont une moyenne, pas un sondage. Site indépendant, sans publicité. Vous recevez cette lettre parce que vous vous êtes inscrit sur la-sonde.fr.', unsub: 'Se désabonner', all: 'Tous les numéros',
    arTitle: 'Le point du lundi : la lettre hebdomadaire des sondages de la présidentielle 2027 | La Sonde', arDesc: 'Chaque lundi, la moyenne des sondages de la présidentielle 2027, les signaux de la semaine et les nouveaux sondages. Gratuit, indépendant, sans publicité.',
    arIntro: 'Chaque lundi matin : la moyenne des sondages de la présidentielle 2027, ce qui a bougé, et les sondages de la semaine. Gratuit, sans publicité, désinscription en un clic.', sub: 'S\'abonner gratuitement', first: 'Le premier numéro paraîtra lundi prochain.', back: '← La Sonde' },
  en: { undecl: 'Tested but not declared:', brand: 'The Monday Briefing', h1: 'France 2027 presidential election: the week in polls', week: (n, d) => `${n} new poll${n > 1 ? 's' : ''} this week · data as of ${d}`,
    avg: 'The polling average', d7: '7 D', d30: '30 D', avgNote: 'Average of all published polls, adjusted for pollster house effects. Changes in percentage points.',
    fam: 'The broad groupings, from left to right', famNote: 'Totals on a ballot including every declared candidate, grouped by the left–right position published in La Sonde\'s methodology. No label is assigned: the make-up of each grouping is shown.',
    anK: 'THIS WEEK\'S ANALYSIS', anNote: 'Written automatically from La Sonde\'s figures only, each number being checked before sending, then translated from French. No campaign information is added.',
    imgAlt: d => `Average of 2027 French presidential polls as of ${d}, La Sonde`, imgNote: 'Chart free to reuse with the credit “Source: La Sonde (la-sonde.fr)”.',
    qual: 'Who will make the runoff?', qualH: ['Candidate', 'Chances', '7 days ago'], duo: (d, p) => `Most likely runoff: ${d}, ${p} of simulations. Chances simulated from the polls and their historical error: this is not a prediction.`,
    bas: 'Rankings that could flip', and: 'and', basItem: (e, a, b, g, x) => `<b>${e}</b> (${a}${ord(a)} and ${b}${ord(b)} in the overall average): ${g} pt apart${x ? '; the lines would cross if the trend of the last two weeks continued' : ''}.`,
    li: 'Head to head, on the same ballot', liH: ['Pair · ballot tested', 'Polls', 'Scores'], withL: 'ballot with', noCentre: 'ballot without a centrist candidate', liNote: 'Average of the polls that tested exactly the same line-up of candidates: the most reliable comparison between two close contenders.',
    r2: 'Runoff match-ups tested', r2H: ['Match-up', 'Average', '30 d', 'Polls'], r2Note: '30-day change in the first-named candidate\'s score.',
    ec: 'Polls that stand out, on the same line-up', ecH: ['Poll', 'Candidate', 'Published', 'Same line-up', 'Adjusted gap'], ecNote: 'Compared with the average of polls that tested the same line-up of candidates, after adjusting for the pollster\'s usual house effect. A single gap is often noise; it becomes a signal if it repeats.',
    so: 'How firm is the vote?', soTxt: 'Share of voters certain of their choice', soNote: (s, v) => `Source: ${s}. All voters: ${v} certain of their choice.`,
    pa: 'Turnout and undecided voters', paNote: 'Six months out, turnout remains the main unknown: voting intentions only cover voters who state a choice.',
    y: j => `Five years ago, ${j} days before the first round`, yH: ['2022 candidate', 'Polls at that date', 'Result', 'Gap'], yNote: (u, d) => `Biggest gain afterwards: ${u}; biggest drop: ${d}. Six months out, polls measure a balance of forces, not a result.`, pts: 'pts',
    polls: n => `This week's polls (${n})`, poll: (i, m, a, b, n, h) => `<b>${i}</b> for ${m} · fieldwork ${a} to ${b}, ${n} respondents, ${h} scenario${h > 1 ? 's' : ''}`, none: 'No new voting-intention poll this week.',
    cta: 'See everything on la-sonde.fr →', fwd: u => `Find this useful? <a href="${u}" style="color:#5b2cff;font-weight:700">Forward it</a> to a friend who follows French politics.`,
    foot: 'La Sonde aggregates published polls (official notices of the French Commission des sondages); these figures are an average, not a poll. Independent website, no advertising. You are receiving this letter because you signed up on la-sonde.fr.', unsub: 'Unsubscribe', all: 'All issues',
    arTitle: 'The Monday Briefing: the weekly letter on 2027 French presidential polls | La Sonde', arDesc: 'Every Monday: the average of 2027 French presidential polls, the week\'s signals and the new polls. Free, independent, no advertising.',
    arIntro: 'Every Monday morning: the average of 2027 French presidential polls, what moved, and the week\'s polls. Free, no advertising, unsubscribe in one click. When signing up, choose “English” as the language.', sub: 'Subscribe for free', first: 'The first issue will be published next Monday.', back: '← La Sonde' },
  de: { undecl: 'Getestet, aber nicht erklärt:', brand: 'Der Montagsüberblick', h1: 'Präsidentschaftswahl 2027 in Frankreich: die Umfragewoche', week: (n, d) => `${n} neue Umfrage${n > 1 ? 'n' : ''} diese Woche · Daten vom ${d}`,
    avg: 'Der Umfragedurchschnitt', d7: '7 T', d30: '30 T', avgNote: 'Durchschnitt aller veröffentlichten Umfragen, bereinigt um Instituts-Effekte. Veränderungen in Prozentpunkten.',
    fam: 'Die großen Lager, von links nach rechts', famNote: 'Summen auf einem Stimmzettel mit allen erklärten Kandidaten, gruppiert nach der in der Methodik von La Sonde veröffentlichten Links-rechts-Position. Es wird kein Etikett vergeben: Die Zusammensetzung jedes Lagers wird angezeigt.',
    anK: 'DIE ANALYSE DER WOCHE', anNote: 'Automatisch und ausschließlich auf Grundlage der Zahlen von La Sonde verfasst, jede Zahl wird vor dem Versand geprüft; aus dem Französischen übersetzt. Es werden keine Wahlkampfinformationen hinzugefügt.',
    imgAlt: d => `Umfragedurchschnitt zur Präsidentschaftswahl 2027, Stand ${d}, La Sonde`, imgNote: 'Grafik frei verwendbar mit dem Hinweis „Quelle: La Sonde (la-sonde.fr)“.',
    qual: 'Wer kommt in die Stichwahl?', qualH: ['Kandidat', 'Chancen', 'Vor 7 Tagen'], duo: (d, p) => `Wahrscheinlichste Stichwahl: ${d}, ${p} der Simulationen. Aus den Umfragen und ihrem historischen Fehler simulierte Chancen: keine Prognose.`,
    bas: 'Mögliche Platzwechsel', and: 'und', basItem: (e, a, b, g, x) => `<b>${e}</b> (Plätze ${a} und ${b} im Gesamtdurchschnitt): ${g} Pkt. Abstand${x ? '; die Kurven würden sich kreuzen, wenn sich der Trend der letzten zwei Wochen fortsetzte' : ''}.`,
    li: 'Direktvergleich auf demselben Stimmzettel', liH: ['Paar · getesteter Stimmzettel', 'Umfragen', 'Werte'], withL: 'Stimmzettel mit', noCentre: 'Stimmzettel ohne Kandidaten der Mitte', liNote: 'Durchschnitt der Umfragen, die genau dieselbe Kandidatenkonstellation getestet haben: der verlässlichste Vergleich zwischen zwei knapp beieinanderliegenden Bewerbern.',
    r2: 'Getestete Stichwahl-Duelle', r2H: ['Duell', 'Durchschnitt', '30 T', 'Umfragen'], r2Note: 'Veränderung des Werts des Erstgenannten über 30 Tage.',
    ec: 'Auffällige Umfragen, bei gleicher Kandidatenliste', ecH: ['Umfrage', 'Kandidat', 'Veröffentlicht', 'Gleiche Liste', 'Bereinigte Abw.'], ecNote: 'Vergleich mit dem Durchschnitt der Umfragen mit derselben Kandidatenkonstellation, nach Bereinigung um den üblichen Instituts-Effekt. Eine einzelne Abweichung ist oft Rauschen; wiederholt sie sich, wird sie zum Signal.',
    so: 'Wie fest ist die Wahlentscheidung?', soTxt: 'Anteil der Wähler, die sich ihrer Wahl sicher sind', soNote: (s, v) => `Quelle: ${s}. Alle Wähler: ${v} sicher.`,
    pa: 'Wahlbeteiligung und Unentschlossene', paNote: 'Sechs Monate vor der Wahl bleibt die Mobilisierung die große Unbekannte: Wahlabsichten erfassen nur Wähler, die eine Wahl angeben.',
    y: j => `Vor fünf Jahren, ${j} Tage vor dem ersten Wahlgang`, yH: ['Kandidat 2022', 'Umfragen zu diesem Zeitpunkt', 'Ergebnis', 'Abw.'], yNote: (u, d) => `Größter Zugewinn danach: ${u}; größter Rückgang: ${d}. Sechs Monate vor der Wahl messen Umfragen ein Kräfteverhältnis, kein Ergebnis.`, pts: 'Pkt.',
    polls: n => `Die Umfragen der Woche (${n})`, poll: (i, m, a, b, n, h) => `<b>${i}</b> für ${m} · Befragung ${a} bis ${b}, ${n} Befragte, ${h} Szenari${h > 1 ? 'en' : 'o'}`, none: 'Diese Woche keine neue Umfrage zur Wahlabsicht.',
    cta: 'Alles auf la-sonde.fr →', fwd: u => `Nützlich? <a href="${u}" style="color:#5b2cff;font-weight:700">Leiten Sie diesen Brief weiter</a> an jemanden, der französische Politik verfolgt.`,
    foot: 'La Sonde fasst veröffentlichte Umfragen zusammen (amtliche Mitteilungen der französischen Commission des sondages); diese Zahlen sind ein Durchschnitt, keine Umfrage. Unabhängige Website, ohne Werbung. Sie erhalten diesen Brief, weil Sie sich auf la-sonde.fr angemeldet haben.', unsub: 'Abmelden', all: 'Alle Ausgaben',
    arTitle: 'Der Montagsüberblick: der wöchentliche Brief zu den Umfragen der französischen Präsidentschaftswahl 2027 | La Sonde', arDesc: 'Jeden Montag: der Umfragedurchschnitt zur französischen Präsidentschaftswahl 2027, die Signale der Woche und die neuen Umfragen. Kostenlos, unabhängig, ohne Werbung.',
    arIntro: 'Jeden Montagmorgen: der Umfragedurchschnitt zur französischen Präsidentschaftswahl 2027, was sich bewegt hat, und die Umfragen der Woche. Kostenlos, ohne Werbung, Abmeldung mit einem Klick. Wählen Sie bei der Anmeldung „Deutsch“ als Sprache.', sub: 'Kostenlos abonnieren', first: 'Die erste Ausgabe erscheint nächsten Montag.', back: '← La Sonde' },
  es: { undecl: 'Probados pero no declarados:', brand: 'El resumen del lunes', h1: 'Presidenciales francesas de 2027: la semana de las encuestas', week: (n, d) => `${n} encuesta${n > 1 ? 's' : ''} nueva${n > 1 ? 's' : ''} esta semana · datos a ${d}`,
    avg: 'La media de las encuestas', d7: '7 D', d30: '30 D', avgNote: 'Media de todas las encuestas publicadas, corregida del efecto de cada instituto. Variaciones en puntos.',
    fam: 'Los grandes bloques, de izquierda a derecha', famNote: 'Totales en una papeleta con todos los candidatos declarados, agrupados según la posición izquierda-derecha publicada en la metodología de La Sonde. No se asigna ninguna etiqueta: se muestra la composición de cada bloque.',
    anK: 'EL ANÁLISIS DE LA SEMANA', anNote: 'Redactado automáticamente solo a partir de las cifras de La Sonde, con cada número verificado antes del envío, y traducido del francés. No se añade ninguna información de campaña.',
    imgAlt: d => `Media de las encuestas de las presidenciales francesas de 2027 a ${d}, La Sonde`, imgNote: 'Gráfico reutilizable con la mención «Fuente: La Sonde (la-sonde.fr)».',
    qual: '¿Quién pasará a la segunda vuelta?', qualH: ['Candidato', 'Probabilidad', 'Hace 7 días'], duo: (d, p) => `Duelo más probable: ${d}, ${p} de las simulaciones. Probabilidades simuladas a partir de las encuestas y de su error histórico: no es una predicción.`,
    bas: 'Posiciones que podrían invertirse', and: 'y', basItem: (e, a, b, g, x) => `<b>${e}</b> (${a}.º y ${b}.º en la media general): ${g} pt de diferencia${x ? '; las curvas se cruzarían si continuara la tendencia de las dos últimas semanas' : ''}.`,
    li: 'Cara a cara, en la misma papeleta', liH: ['Dúo · papeleta probada', 'Encuestas', 'Resultados'], withL: 'papeleta con', noCentre: 'papeleta sin candidato de centro', liNote: 'Media de las encuestas que probaron exactamente la misma configuración de candidatos: la comparación más fiable entre dos competidores cercanos.',
    r2: 'Segundas vueltas probadas', r2H: ['Duelo', 'Media', '30 d', 'Encuestas'], r2Note: 'Variación en 30 días del resultado del primer nombrado.',
    ec: 'Las encuestas que se desvían, con la misma lista', ecH: ['Encuesta', 'Candidato', 'Publicado', 'Misma lista', 'Desvío corregido'], ecNote: 'Comparación con la media de las encuestas que probaron la misma configuración de candidatos, tras corregir el efecto habitual del instituto. Un desvío aislado suele ser ruido; se convierte en señal si se repite.',
    so: 'La solidez del voto', soTxt: 'Porcentaje de electores seguros de su elección', soNote: (s, v) => `Fuente: ${s}. Conjunto de los electores: ${v} seguros de su elección.`,
    pa: 'Participación e indecisos', paNote: 'A seis meses de la votación, la movilización sigue siendo la gran incógnita: las intenciones de voto solo cubren a los electores que expresan una elección.',
    y: j => `Hace cinco años, a ${j} días de la primera vuelta`, yH: ['Candidato 2022', 'Encuestas en esa fecha', 'Resultado', 'Diferencia'], yNote: (u, d) => `Mayor subida después: ${u}; mayor caída: ${d}. A seis meses de la votación, las encuestas miden una relación de fuerzas, no un resultado.`, pts: 'pts',
    polls: n => `Las encuestas de la semana (${n})`, poll: (i, m, a, b, n, h) => `<b>${i}</b> para ${m} · trabajo de campo del ${a} al ${b}, ${n} personas, ${h} hipótesis`, none: 'Ninguna nueva encuesta de intención de voto esta semana.',
    cta: 'Todo en la-sonde.fr →', fwd: u => `¿Le resulta útil? <a href="${u}" style="color:#5b2cff;font-weight:700">Reenvíela</a> a alguien que siga la política francesa.`,
    foot: 'La Sonde agrega las encuestas publicadas (fichas oficiales de la Commission des sondages francesa); estas cifras son una media, no una encuesta. Sitio independiente, sin publicidad. Recibe esta carta porque se inscribió en la-sonde.fr.', unsub: 'Darse de baja', all: 'Todos los números',
    arTitle: 'El resumen del lunes: la carta semanal de las encuestas de las presidenciales francesas de 2027 | La Sonde', arDesc: 'Cada lunes: la media de las encuestas de las presidenciales francesas de 2027, las señales de la semana y las nuevas encuestas. Gratis, independiente, sin publicidad.',
    arIntro: 'Cada lunes por la mañana: la media de las encuestas de las presidenciales francesas de 2027, lo que se ha movido y las encuestas de la semana. Gratis, sin publicidad, baja en un clic. Al inscribirse, elija «Español» como idioma.', sub: 'Suscribirse gratis', first: 'El primer número se publicará el próximo lunes.', back: '← La Sonde' },
  it: { undecl: 'Testati ma non dichiarati:', brand: 'Il punto del lunedì', h1: 'Presidenziali francesi 2027: la settimana dei sondaggi', week: (n, d) => `${n} nuov${n > 1 ? 'i' : 'o'} sondagg${n > 1 ? 'i' : 'io'} questa settimana · dati al ${d}`,
    avg: 'La media dei sondaggi', d7: '7 G', d30: '30 G', avgNote: 'Media di tutti i sondaggi pubblicati, corretta per l’effetto istituto. Variazioni in punti.',
    fam: 'I grandi schieramenti, da sinistra a destra', famNote: 'Totali su una scheda con tutti i candidati dichiarati, raggruppati secondo la posizione sinistra-destra pubblicata nella metodologia di La Sonde. Nessuna etichetta viene attribuita: è indicata la composizione di ogni schieramento.',
    anK: 'L’ANALISI DELLA SETTIMANA', anNote: 'Redatta automaticamente a partire dai soli dati di La Sonde, con ogni numero verificato prima dell’invio, e tradotta dal francese. Nessuna informazione di campagna viene aggiunta.',
    imgAlt: d => `Media dei sondaggi delle presidenziali francesi 2027 al ${d}, La Sonde`, imgNote: 'Grafico riutilizzabile con la dicitura «Fonte: La Sonde (la-sonde.fr)».',
    qual: 'Chi andrà al ballottaggio?', qualH: ['Candidato', 'Probabilità', '7 giorni fa'], duo: (d, p) => `Ballottaggio più probabile: ${d}, ${p} delle simulazioni. Probabilità simulate a partire dai sondaggi e dal loro errore storico: non è una previsione.`,
    bas: 'I sorpassi da tenere d’occhio', and: 'e', basItem: (e, a, b, g, x) => `<b>${e}</b> (${a}° e ${b}° posto nella media generale): ${g} pt di distacco${x ? '; le curve si incrocerebbero se la tendenza delle ultime due settimane proseguisse' : ''}.`,
    li: 'Testa a testa, sulla stessa scheda', liH: ['Coppia · scheda testata', 'Sondaggi', 'Risultati'], withL: 'scheda con', noCentre: 'scheda senza candidato di centro', liNote: 'Media dei sondaggi che hanno testato esattamente la stessa configurazione di candidati: il confronto più affidabile tra due concorrenti vicini.',
    r2: 'I ballottaggi testati', r2H: ['Sfida', 'Media', '30 g', 'Sondaggi'], r2Note: 'Variazione in 30 giorni del risultato del primo nominato.',
    ec: 'I sondaggi che si discostano, a parità di lista', ecH: ['Sondaggio', 'Candidato', 'Pubblicato', 'Stessa lista', 'Scarto corretto'], ecNote: 'Confronto con la media dei sondaggi che hanno testato la stessa configurazione di candidati, dopo la correzione dell’effetto abituale dell’istituto. Uno scarto isolato è spesso rumore; diventa un segnale se si ripete.',
    so: 'La solidità del voto', soTxt: 'Quota di elettori sicuri della propria scelta', soNote: (s, v) => `Fonte: ${s}. Totale elettori: ${v} sicuri della propria scelta.`,
    pa: 'Affluenza e indecisi', paNote: 'A sei mesi dal voto, la mobilitazione resta la principale incognita: le intenzioni di voto riguardano solo gli elettori che esprimono una scelta.',
    y: j => `Cinque anni fa, a ${j} giorni dal primo turno`, yH: ['Candidato 2022', 'Sondaggi a quella data', 'Risultato', 'Scarto'], yNote: (u, d) => `Maggiore crescita in seguito: ${u}; maggiore calo: ${d}. A sei mesi dal voto, i sondaggi misurano un rapporto di forza, non un risultato.`, pts: 'pt',
    polls: n => `I sondaggi della settimana (${n})`, poll: (i, m, a, b, n, h) => `<b>${i}</b> per ${m} · rilevazione dal ${a} al ${b}, ${n} intervistati, ${h} ipotesi`, none: 'Nessun nuovo sondaggio sulle intenzioni di voto questa settimana.',
    cta: 'Tutto su la-sonde.fr →', fwd: u => `Ti è utile? <a href="${u}" style="color:#5b2cff;font-weight:700">Inoltrala</a> a chi segue la politica francese.`,
    foot: 'La Sonde aggrega i sondaggi pubblicati (schede ufficiali della Commission des sondages francese); questi dati sono una media, non un sondaggio. Sito indipendente, senza pubblicità. Ricevi questa lettera perché ti sei iscritto su la-sonde.fr.', unsub: 'Annulla l’iscrizione', all: 'Tutti i numeri',
    arTitle: 'Il punto del lunedì: la lettera settimanale sui sondaggi delle presidenziali francesi 2027 | La Sonde', arDesc: 'Ogni lunedì: la media dei sondaggi delle presidenziali francesi 2027, i segnali della settimana e i nuovi sondaggi. Gratuita, indipendente, senza pubblicità.',
    arIntro: 'Ogni lunedì mattina: la media dei sondaggi delle presidenziali francesi 2027, cosa si è mosso e i sondaggi della settimana. Gratuita, senza pubblicità, disiscrizione in un clic. All’iscrizione, scegli «Italiano» come lingua.', sub: 'Iscriviti gratis', first: 'Il primo numero uscirà lunedì prossimo.', back: '← La Sonde' },
};
function ord(n) { return n % 10 === 1 && n % 100 !== 11 ? 'st' : n % 10 === 2 && n % 100 !== 12 ? 'nd' : n % 10 === 3 && n % 100 !== 13 ? 'rd' : 'th'; }
const lp = lang => lang === 'fr' ? '' : lang + '/';

// ---------- Traduction (un seul appel pour les 4 langues, coût plafonné) ----------
const TRC = NL.translation || {};
const TR_MAX = TRC.maxUsd ?? 0.05;
// Tarifs PRUDENTS (prix catalogue) : le plafond est garanti même si la facture réelle est plus basse.
const TR_PRICE = TRC.prices || { inputPerMTok: 1, outputPerMTok: 5 };
const CACHE_P = P('data/newsletter/i18n-cache.json');
function dynStrings(F) {
  const s = new Set();
  for (const m of F.participation_et_indecis || []) { [m.terrain, m.question, m.indecis, ...Object.keys(m.resultats || {})].forEach(x => x && s.add(x)); }
  if (F.solidite_du_vote) s.add(F.solidite_du_vote.source);
  return [...s];
}
function numsIn(text) { return (text.match(/\d+(?:[.,]\d+)?/g) || []).map(n => Number(n.replace(',', '.'))); }
async function translate(A, F) {
  const cache = fs.existsSync(CACHE_P) ? readJSON(CACHE_P) : {};
  const todo = dynStrings(F).filter(x => !LANGS.slice(1).every(l => cache[x]?.[l]));
  const out = Object.fromEntries(LANGS.slice(1).map(l => [l, { A: null }]));
  const KEY = process.env.ANTHROPIC_API_KEY;
  const res = { out, cache, cost: 0 };
  if (!KEY || TRC.enabled === false || (!A && !todo.length)) return res;
  const src = { analyse: A ? { titre: A.titre, chiffres_cles: A.chiffres_cles, paragraphes: A.paragraphes } : null, libelles: todo };
  const prompt = `Translate this French content from a neutral poll-aggregation newsletter into English (en), German (de), Spanish (es) and Italian (it), for foreign political journalists.
Rules: faithful and neutral, add or remove nothing; keep every number with exactly the same value (use the target language's decimal separator; never use a thousands separator); keep person, party, pollster and media names unchanged; « point(s) » means percentage points; keep cautious wording (simulation, tendency, concomitance) exactly as cautious; « J-xxx » means xxx days before the first round.
Answer ONLY with <json>{"en":{"analyse":{"titre":"…","chiffres_cles":[{"chiffre":"…","legende":"…"}],"paragraphes":["…"]},"libelles":["…"]},"de":{…},"es":{…},"it":{…}}</json>. "analyse" is null if the source analysis is null; "libelles" has the same length and order as the source.
SOURCE (JSON):
${JSON.stringify(src)}`;
  const model = process.env.CLAUDE_MODEL || cfg.agent?.model || 'claude-haiku-5-5';
  const inEst = Math.ceil(prompt.length / 2.5) + 50; // estimation large du nombre de jetons d'entrée
  const maxOut = Math.min(9000, Math.floor((TR_MAX - inEst * TR_PRICE.inputPerMTok / 1e6) / TR_PRICE.outputPerMTok * 1e6));
  if (maxOut < 2500) { log(`traduction sautée : plafond de ${TR_MAX} $ trop bas`); return res; }
  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', { method: 'POST',
      headers: { 'x-api-key': KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({ model, max_tokens: maxOut, messages: [{ role: 'user', content: prompt }] }) });
    if (!r.ok) throw new Error(`API ${r.status} ${(await r.text()).slice(0, 150)}`);
    const j = await r.json(), u = j.usage || {};
    res.cost = (u.input_tokens || 0) / 1e6 * TR_PRICE.inputPerMTok + (u.output_tokens || 0) / 1e6 * TR_PRICE.outputPerMTok;
    log(`traduction : ${u.input_tokens} jetons lus, ${u.output_tokens} écrits, coût maximal ${res.cost.toFixed(4)} $ (plafond ${TR_MAX} $)`);
    const txt = j.content.filter(b => b.type === 'text').map(b => b.text).join('');
    const T = JSON.parse((txt.match(/<json>([\s\S]*?)<\/json>/) || txt.match(/(\{[\s\S]*\})/))[1]);
    const frNums = A ? new Set(numsIn([A.titre, ...A.paragraphes, ...(A.chiffres_cles || []).flatMap(k => [k.chiffre, k.legende])].join(' '))) : new Set();
    for (const l of LANGS.slice(1)) {
      const t = T[l]; if (!t) continue;
      if (A && t.analyse && t.analyse.titre && Array.isArray(t.analyse.paragraphes)) {
        const all = [t.analyse.titre, ...t.analyse.paragraphes, ...(t.analyse.chiffres_cles || []).flatMap(k => [k.chiffre, k.legende])].join(' ');
        const bad = numsIn(all).filter(n => !frNums.has(n) && numbersOk(String(n).replace('.', ','), F).length);
        if (bad.length) log(`${l} : chiffres modifiés par la traduction (${bad.join(', ')}) : analyse retirée dans cette langue`);
        else out[l].A = t.analyse;
      }
      if (Array.isArray(t.libelles) && t.libelles.length === todo.length) todo.forEach((s, i) => { (cache[s] ||= {})[l] = t.libelles[i]; });
    }
  } catch (e) { log('traduction indisponible :', e.message); }
  return res;
}

// ---------- Rédaction du numéro (une langue) ----------
function issue(F, A, lang, cache = {}) {
  const T = L[lang], loc = LOC[lang];
  const pc = lang === 'en' || lang === 'it' ? '%' : ' %';
  const f1 = x => { const s = (Math.round(x * 10) / 10).toFixed(1); return lang === 'en' ? s : s.replace('.', ','); };
  const sg = x => (x > 0 ? '+' : x < 0 ? '−' : '±') + f1(Math.abs(x));
  const fdate = (d, o = { day: 'numeric', month: 'long', year: 'numeric' }) => new Date(d + 'T12:00:00Z').toLocaleDateString(loc, o);
  const tx = s => lang === 'fr' ? s : (cache[s]?.[lang] || s);
  // Même règle que le site : barres pour les candidats déclarés à 5 % ou plus ; les non-déclarés en simple mention.
  const declS = D.standings.filter(s => s.declared);
  let top = declS.filter(s => s.v >= 5); if (top.length < 4) top = declS.slice(0, 4);
  const undecl = D.standings.filter(s => !s.declared && s.v >= 1);
  const subject = A ? `${T.brand} · ${A.titre}` : `${T.brand} · ${top.slice(0, 3).map(s => `${C(s.c).short} ${Math.round(s.v)}${pc}`).join(', ')}`;
  const max = Math.max(...top.map(s => s.v));
  const row = s => `<tr><td style="padding:7px 0;font:600 15px Arial,sans-serif;color:#15131f;width:150px"><span style="display:inline-block;width:9px;height:9px;border-radius:50%;background:${C(s.c).color};margin-right:7px"></span>${esc(C(s.c).short)}</td>
    <td style="padding:7px 8px"><div style="height:12px;border-radius:6px;background:#efe9df"><div style="height:12px;width:${Math.round(s.v / max * 100)}%;border-radius:6px;background:${C(s.c).color}"></div></div></td>
    <td style="padding:7px 0;font:800 15px Arial,sans-serif;color:#15131f;text-align:right;width:60px">${f1(s.v)}${pc}</td>
    <td style="padding:7px 0 7px 8px;font:700 13px Arial,sans-serif;text-align:right;width:56px;color:${s.d7 >= 0.3 ? '#0f8a5f' : s.d7 <= -0.3 ? '#d23a5f' : '#8a8598'}">${sg(s.d7)}</td>
    <td style="padding:7px 0 7px 8px;font:700 13px Arial,sans-serif;text-align:right;width:56px;color:${s.d30 >= 0.5 ? '#0f8a5f' : s.d30 <= -0.5 ? '#d23a5f' : '#8a8598'}">${sg(s.d30)}</td></tr>`;
  const h2 = t => `<h2 style="font:800 19px Arial,sans-serif;color:#15131f;margin:30px 0 10px">${t}</h2>`;
  const note = t => `<p style="font-size:12.5px;color:#7d788c;margin:6px 0 0">${t}</p>`;
  const tbl = (head, rows) => `<table role="presentation" style="width:100%;border-collapse:collapse;font:14px Arial,sans-serif">${head ? `<tr>${head.map((h, i) => `<td style="padding:6px 4px;border-bottom:2px solid #e6dfd4;font-weight:700;color:#7d788c;font-size:12px;text-transform:uppercase;letter-spacing:.04em;${i ? 'text-align:right' : ''}">${h}</td>`).join('')}</tr>` : ''}${rows.map(r => `<tr>${r.map((c, i) => `<td style="padding:7px 4px;border-bottom:1px solid #efe9df;${i ? 'text-align:right;white-space:nowrap' : ''}">${c}</td>`).join('')}</tr>`).join('')}</table>`;
  // Grandes familles, sans étiquette
  const FA = F.familles_de_gauche_a_droite, ft = FA.reduce((x, f) => x + f.total, 0) || 1, fcol = ['#c2185b', '#e86a92', '#5b7fd6', '#2a3a8f'];
  const blocs = FA.length ? h2(T.fam) + `<div style="display:flex;height:26px;border-radius:8px;overflow:hidden">${FA.map((f, i) => `<div style="width:${f.total / ft * 100}%;background:${fcol[i]};color:#fff;font:800 12px/26px Arial,sans-serif;text-align:center">${Math.round(f.total)}${pc}</div>`).join('')}</div>
    ${tbl(null, FA.map((f, i) => [`<span style="display:inline-block;width:9px;height:9px;border-radius:2px;background:${fcol[i]};margin-right:6px"></span>${esc(f.candidats.join(', '))}`, `<b>${Math.round(f.total)}${pc}</b>`]))}` + note(T.famNote) : '';
  // Analyse
  const keys = A && Array.isArray(A.chiffres_cles) && A.chiffres_cles.length ? `<table role="presentation" style="width:100%;border-collapse:separate;border-spacing:8px 0;margin:22px -8px 0"><tr>${A.chiffres_cles.slice(0, 3).map(k => `<td style="width:33%;vertical-align:top;padding:14px;border-radius:14px;background:#5b2cff;color:#fff"><div style="font:800 26px/1.1 Arial,sans-serif">${esc(k.chiffre)}</div><div style="font:13px/1.4 Arial,sans-serif;margin-top:6px">${esc(k.legende)}</div></td>`).join('')}</tr></table>` : '';
  const img = `<p style="margin:22px 0 0"><a href="${BASE}/${lang === 'fr' ? '' : '?lang=' + lang}"><img src="${BASE}/share/carte-du-jour.png" alt="${esc(T.imgAlt(fdate(D.asOf)))}" width="604" style="width:100%;height:auto;border-radius:12px;border:1px solid #e6dfd4"></a></p>${note(esc(T.imgNote))}`;
  const an = A ? `<div style="margin:26px 0 0;padding:22px 24px;border-radius:16px;background:#fff;border:1px solid #e6dfd4">
    <p style="margin:0 0 6px;font:800 12px Arial,sans-serif;letter-spacing:.12em;color:#5b2cff">${esc(T.anK)}</p>
    <h2 style="font:800 22px/1.25 Arial,sans-serif;color:#15131f;margin:0 0 12px">${esc(A.titre)}</h2>
    ${A.paragraphes.map(p => `<p style="margin:0 0 12px">${esc(p)}</p>`).join('')}
    <p style="margin:6px 0 0;font-size:12px;color:#7d788c">${esc(T.anNote)}</p></div>` : '';
  // Qualification
  const qual = F.qualification_2nd_tour.length && D.features?.probabilities !== false ? h2(T.qual) + tbl(T.qualH,
    F.qualification_2nd_tour.slice(0, 6).map(x => [esc(x.candidat), `<b>${x.chances}${pc}</b>`, x.il_y_a_7j == null ? '–' : `${x.il_y_a_7j}${pc}`]))
    + (F.duel_le_plus_probable ? note(esc(T.duo(F.duel_le_plus_probable.duel, F.duel_le_plus_probable.probabilite + pc))) : '') : '';
  // Bascules
  const bas = F.bascules_possibles.length ? h2(T.bas) + `<ul style="padding-left:20px;margin:0">${F.bascules_possibles.map(x => `<li style="margin:0 0 6px">${T.basItem(esc(x.entre.replace(' et ', ` ${T.and} `)), x.place, x.place + 1, f1(x.ecart_moyenne_generale), x.les_courbes_se_croisent_si_la_tendance_des_14_derniers_jours_continue)}</li>`).join('')}</ul>` : '';
  // À liste identique
  const LI = F.comparaisons_a_liste_identique;
  const last = n => n.split(' ').slice(-1)[0];
  const liste = s => s === 'bulletin avec aucun candidat du centre' ? T.noCentre : s.replace(/^bulletin avec/, T.withL);
  const liHtml = LI.length ? h2(T.li) + tbl(T.liH, LI.flatMap(d => d.comparaisons.slice(0, 2).map(c => {
      const [a, b] = d.duo.split(' / '); return [`<b>${esc(d.duo)}</b><br><span style="color:#7d788c;font-size:12.5px">${esc(liste(c.liste))}</span>`, c.enquetes, `${esc(last(a))} ${f1(c[a])} · ${esc(last(b))} ${f1(c[b])}`]; })))
    + note(T.liNote) : '';
  // Second tour
  const r2 = F.duels_second_tour.length ? h2(T.r2) + tbl(T.r2H,
    F.duels_second_tour.map(d => { const [a, b] = d.duel.split(' – '); return [esc(d.duel), `${f1(d[a])} – ${f1(d[b])}`, d.evolution30j_pour_premier_nomme == null ? '–' : sg(d.evolution30j_pour_premier_nomme), d.sondages]; }))
    + note(T.r2Note) : '';
  // Écarts des sondages de la semaine, à liste identique
  const ec = F.ecarts_a_liste_identique.filter(x => Math.abs(x.ecart_corrige) >= 1.5).slice(0, 4);
  const ecHtml = ec.length ? h2(T.ec) + tbl(T.ecH,
    ec.map(x => [esc(x.inst ? `${x.inst} (${x.media}, ${fdate(x.fin, { day: 'numeric', month: 'short' })})` : x.sondage), esc(x.candidat), `${f1(x.publie)}${pc}`, `${f1(x.reference_meme_liste)}${pc}`, `<b>${sg(x.ecart_corrige)}</b>`])) + note(T.ecNote) : '';
  // Solidité
  const so = F.solidite_du_vote ? h2(T.so) + `<p style="margin:0">${esc(T.soTxt)}${lang === 'fr' ? ' : ' : ': '}${Object.entries(F.solidite_du_vote.part_sure_de_son_choix).sort((a, b) => b[1] - a[1]).map(([c, v]) => `${esc((Object.values(D.cands).find(k => k.name === c) || { short: c }).short)} <b>${v}${pc}</b>`).join(' · ')}.</p>` + note(esc(T.soNote(tx(F.solidite_du_vote.source), F.solidite_du_vote.ensemble + pc))) : '';
  // Participation et indécis
  const PA = F.participation_et_indecis || [];
  const colon = lang === 'fr' ? ' : ' : ': ';
  const pa = PA.length ? h2(T.pa) + PA.map(m => { const q = tx(m.question); return `<p style="margin:0 0 8px"><b>${esc(m.institut)}</b> (${esc(tx(m.terrain))}) · ${esc(q.charAt(0).toLowerCase() + q.slice(1))}${colon}${Object.entries(m.resultats).map(([k, v]) => `${esc(tx(k))} <b>${f1(v).replace(/[.,]0$/, '')}${pc}</b>`).join(' · ')}.${m.indecis ? ' ' + esc(tx(m.indecis)) : ''}</p>`; }).join('') + note(T.paNote) : '';
  // 2022, présenté de façon symétrique
  const Y = F.comparaison_2022_meme_date;
  const y = Y ? h2(T.y(F.jours_avant_1er_tour)) + tbl(T.yH,
    Y.candidats.slice(0, 6).map(x => [esc(x.candidat), `${f1(x.sondages_a_cette_date)}${pc}`, `<b>${f1(x.resultat_final)}${pc}</b>`, sg(x.ecart)]))
    + note(esc(T.yNote(`${Y.plus_forte_hausse_ensuite.candidat} (${sg(Y.plus_forte_hausse_ensuite.ecart)} ${T.pts})`, `${Y.plus_forte_baisse_ensuite.candidat} (${sg(Y.plus_forte_baisse_ensuite.ecart)} ${T.pts})`))) : '';
  const polls = F.sondages_de_la_semaine;
  const home = `${BASE}/${lang === 'fr' ? '' : '?lang=' + lang}`;
  const html = `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(subject)}</title></head>
<body style="margin:0;background:#fbf7f1"><div style="max-width:640px;margin:0 auto;padding:24px 18px;font:16px/1.6 Arial,sans-serif;color:#2a2733">
<div style="height:8px;border-radius:4px;background:linear-gradient(90deg,#5b2cff,#ff3d7f,#ff8a00);background-color:#ff3d7f"></div>
<p style="margin:18px 0 0;font:800 13px Arial,sans-serif;letter-spacing:.12em;color:#5b2cff">LA SONDE · ${esc(T.brand.toUpperCase())} · ${esc(fdate(today).toUpperCase())} · ${({ fr: 'J', en: 'D', de: 'T', es: 'D', it: 'G' })[lang]}-${F.jours_avant_1er_tour}</p>
<h1 style="font:800 28px/1.15 Arial,sans-serif;color:#15131f;margin:8px 0 6px">${esc(T.h1)}</h1>
<p style="margin:0;color:#6b6680">${esc(T.week(polls.length, fdate(D.asOf)))}</p>
${keys}${an}${img}
${h2(T.avg)}
<table role="presentation" style="width:100%;border-collapse:collapse"><tr><td></td><td></td><td></td><td style="font:700 11px Arial,sans-serif;color:#7d788c;text-align:right">${T.d7}</td><td style="font:700 11px Arial,sans-serif;color:#7d788c;text-align:right">${T.d30}</td></tr>${top.map(row).join('')}</table>
${note(T.avgNote + (undecl.length ? ' ' + T.undecl + ' ' + undecl.map(s => `${C(s.c).short} ${f1(s.v)}${pc}`).join(', ') + '.' : ''))}
${blocs}${qual}${bas}${liHtml}${ecHtml}${so}${pa}${r2}${y}
${h2(T.polls(polls.length))}
${polls.length ? `<ul style="padding-left:20px;margin:0">${polls.map(s => `<li style="margin:0 0 6px">${T.poll(esc(s.institut), esc(s.commanditaire), esc(fdate(s.terrain.slice(0, 10), { day: 'numeric', month: 'short' })), esc(fdate(s.terrain.slice(-10), { day: 'numeric', month: 'short' })), s.echantillon.toLocaleString(loc), s.hypotheses)}</li>`).join('')}</ul>` : `<p style="margin:0">${esc(T.none)}</p>`}
<p style="margin:30px 0"><a href="${home}" style="display:inline-block;padding:13px 22px;border-radius:999px;background:#5b2cff;color:#fff;font:800 15px Arial,sans-serif;text-decoration:none">${esc(T.cta)}</a></p>
<p style="font-size:14px;margin:0 0 18px">${T.fwd(`${BASE}/${lp(lang)}lettre/`)}</p>
<p style="font-size:12.5px;color:#7d788c;border-top:1px solid #e6dfd4;padding-top:14px">${esc(T.foot)} <a href="{{ unsubscribe }}" style="color:#7d788c">${esc(T.unsub)}</a></p>
</div></body></html>`;
  return { subject, html };
}

// ---------- Archive publique (une par langue : /lettre/, /en/lettre/, /de/lettre/…) ----------
function archive() {
  let total = 0;
  const alt = LANGS.map(l => `<link rel="alternate" hreflang="${l}" href="${BASE}/${lp(l)}lettre/">`).join('');
  for (const lang of LANGS) {
    const T = L[lang], dir = lang === 'fr' ? P('data/newsletter') : P('data/newsletter', lang), site = P('site', lp(lang) + 'lettre');
    const fdate = d => new Date(d + 'T12:00:00Z').toLocaleDateString(LOC[lang], { day: 'numeric', month: 'long', year: 'numeric' });
    const files = (fs.existsSync(dir) ? fs.readdirSync(dir) : []).filter(f => /^\d{4}-\d{2}-\d{2}\.html$/.test(f)).sort().reverse();
    fs.rmSync(site, { recursive: true, force: true });
    for (const f of files) {
      const out = path.join(site, f.slice(0, 10));
      fs.mkdirSync(out, { recursive: true });
      fs.writeFileSync(path.join(out, 'index.html'), fs.readFileSync(path.join(dir, f), 'utf8').replace(/<a href="\{\{ unsubscribe \}\}"[^>]*>[^<]*<\/a>/, `<a href="${BASE}/${lp(lang)}lettre/" style="color:#7d788c">${esc(T.all)}</a>`));
    }
    const form = NL.formUrl ? `<p><a href="${esc(NL.formUrl)}" style="display:inline-block;padding:12px 20px;border-radius:999px;background:#5b2cff;color:#fff;font-weight:800;text-decoration:none">${esc(T.sub)}</a></p>` : '';
    const langNav = LANGS.map(l => l === lang ? `<b>${l.toUpperCase()}</b>` : `<a href="${BASE}/${lp(l)}lettre/" style="color:#5b2cff">${l.toUpperCase()}</a>`).join(' · ');
    fs.mkdirSync(site, { recursive: true });
    fs.writeFileSync(path.join(site, 'index.html'), `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(T.arTitle)}</title>
<meta name="description" content="${esc(T.arDesc)}">
<link rel="canonical" href="${BASE}/${lp(lang)}lettre/">${alt}</head>
<body style="margin:0;background:#fbf7f1;font:16px/1.6 Arial,sans-serif;color:#2a2733"><div style="max-width:680px;margin:0 auto;padding:32px 18px">
<p style="display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap"><a href="${BASE}/${lang === 'fr' ? '' : '?lang=' + lang}" style="color:#5b2cff;font-weight:800;text-decoration:none">${esc(T.back)}</a><span style="font-size:14px">${langNav}</span></p>
<h1 style="font:800 32px/1.15 Arial,sans-serif;color:#15131f">${esc(T.brand)}</h1>
<p>${esc(T.arIntro)}</p>${form}
<h2 style="font:800 20px Arial,sans-serif;margin-top:30px">${esc(T.all)}</h2>
${files.length ? `<ul>${files.map(f => `<li><a href="${f.slice(0, 10)}/">${fdate(f.slice(0, 10))}</a></li>`).join('')}</ul>` : `<p>${esc(T.first)}</p>`}
</div></body></html>`);
    if (lang === 'fr') total = files.length;
  }
  // Page d'arrivée après le clic dans l'e-mail de confirmation Brevo (réglage Brevo : « page de confirmation » → /lettre/merci/).
  fs.mkdirSync(P('site/lettre/merci'), { recursive: true });
  fs.writeFileSync(P('site/lettre/merci/index.html'), `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Inscription confirmée | La Sonde</title><meta name="robots" content="noindex"></head>
<body style="margin:0;background:#fbf7f1;font:17px/1.6 Arial,sans-serif;color:#2a2733"><div style="max-width:620px;margin:0 auto;padding:48px 18px;text-align:center">
<div style="height:8px;border-radius:4px;background:linear-gradient(90deg,#5b2cff,#ff3d7f,#ff8a00);background-color:#ff3d7f;margin-bottom:36px"></div>
<div style="width:72px;height:72px;margin:0 auto 18px;border-radius:50%;background:#e9fbf1;color:#0f8a5f;font:800 40px/72px Arial,sans-serif">✓</div>
<h1 style="font:800 32px/1.15 Arial,sans-serif;color:#15131f;margin:0 0 12px">C'est confirmé, merci !</h1>
<p style="margin:0 0 8px">Vous recevrez <b>Le point du lundi</b> chaque lundi matin : la moyenne des sondages de la présidentielle 2027, ce qui a bougé et les sondages de la semaine.</p>
<p style="margin:0 0 20px;color:#6b6680;font-size:15px">Pour ne pas le manquer, ajoutez <b>contact@la-sonde.fr</b> à vos contacts.</p>
<p style="margin:0 0 28px;color:#6b6680;font-size:14px" lang="en">Subscription confirmed, thank you! · Anmeldung bestätigt, danke! · ¡Suscripción confirmada, gracias! · Iscrizione confermata, grazie!</p>
<p><a href="${BASE}/" style="display:inline-block;padding:13px 22px;border-radius:999px;background:#5b2cff;color:#fff;font-weight:800;text-decoration:none">Voir la moyenne des sondages →</a></p>
<p style="margin-top:22px;font-size:15px">Le site vous est utile ? <a href="https://ko-fi.com/lasonde" style="color:#5b2cff;font-weight:700">Un café fait la différence</a> · <a href="${BASE}/lettre/" style="color:#5b2cff;font-weight:700">Les anciens numéros</a></p>
</div></body></html>`);
  return total;
}

// ---------- Brevo : envoi, et répartition des abonnés par langue ----------
async function brevo(pathname, body, method = 'POST') {
  const r = await fetch('https://api.brevo.com/v3' + pathname, { method, headers: { 'api-key': BREVO_API_KEY, 'content-type': 'application/json', accept: 'application/json' }, ...(method === 'GET' ? {} : { body: JSON.stringify(body || {}) }) });
  const txt = await r.text();
  if (!r.ok) throw new Error(`${pathname} ${r.status} ${txt.slice(0, 200)}`);
  return txt ? JSON.parse(txt) : {};
}
const bget = p => brevo(p, null, 'GET');
// Le champ « LANGUE » du formulaire (attribut de contact Brevo) décide de la langue reçue.
// Les abonnés EN/DE/ES/IT sont recopiés dans des listes « La Sonde – EN »… créées automatiquement.
const codeOf = v => { const s = String(v ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
  if (/^(en|eng|english|anglais)/.test(s)) return 'en'; if (/^(de|deu|ger|deutsch|allemand)/.test(s)) return 'de';
  if (/^(es|esp|spa|espanol|espagnol|castellano)/.test(s)) return 'es'; if (/^(it|ita|italiano|italien)/.test(s)) return 'it'; return 'fr'; };
async function langLists() {
  const attrs = (await bget('/contacts/attributes')).attributes || [];
  const at = attrs.find(a => /^(LANGUE|LANGUAGE|LANG)$/i.test(a.name));
  if (!at) { log('attribut LANGUE absent dans Brevo : tout le monde reçoit la version française'); return null; }
  const en = Object.fromEntries((at.enumeration || []).map(e => [String(e.value), e.label]));
  const groups = { en: [], de: [], es: [], it: [] };
  for (let off = 0; ; off += 500) {
    const r = await bget(`/contacts/lists/${NL.listId}/contacts?limit=500&offset=${off}`);
    for (const c of r.contacts || []) { if (c.emailBlacklisted) continue; const v = c.attributes?.[at.name]; const l = codeOf(en[String(v)] ?? v); if (groups[l]) groups[l].push(c.email.toLowerCase()); }
    if (!r.contacts || r.contacts.length < 500) break;
  }
  const existing = [];
  for (let off = 0; ; off += 50) { const r = await bget(`/contacts/lists?limit=50&offset=${off}`); existing.push(...(r.lists || [])); if (!r.lists || r.lists.length < 50) break; }
  let folder = null; const res = {};
  for (const [l, emails] of Object.entries(groups)) {
    const name = `La Sonde – ${l.toUpperCase()}`;
    let id = existing.find(x => x.name === name)?.id;
    if (!id && !emails.length) { res[l] = { id: null, n: 0 }; continue; }
    if (!id) {
      folder ??= ((await bget('/contacts/folders?limit=10&offset=0')).folders || [])[0]?.id ?? (await brevo('/contacts/folders', { name: 'La Sonde' })).id;
      id = (await brevo('/contacts/lists', { name, folderId: folder })).id; log('liste créée :', name);
    }
    const cur = [];
    for (let off = 0; ; off += 500) { const r = await bget(`/contacts/lists/${id}/contacts?limit=500&offset=${off}`); cur.push(...(r.contacts || []).map(c => c.email.toLowerCase())); if (!r.contacts || r.contacts.length < 500) break; }
    const add = emails.filter(e => !cur.includes(e)), rem = cur.filter(e => !emails.includes(e));
    for (let i = 0; i < add.length; i += 150) await brevo(`/contacts/lists/${id}/contacts/add`, { emails: add.slice(i, i + 150) });
    for (let i = 0; i < rem.length; i += 150) await brevo(`/contacts/lists/${id}/contacts/remove`, { emails: rem.slice(i, i + 150) });
    res[l] = { id, n: emails.length };
  }
  return res;
}

// ---------- Programme ----------
const n = archive();
log(`archive : ${n} numéro(s)`);
if (cfg.features?.newsletter === false) { log('désactivée dans config.json'); process.exit(0); }

async function buildAll() {
  const F = facts();
  const A = DRY && process.env.NL_SAMPLE ? JSON.parse(fs.readFileSync(process.env.NL_SAMPLE, 'utf8')) : await analysis(F);
  let tr;
  if (DRY && process.env.NL_SAMPLE_TR) { const S = JSON.parse(fs.readFileSync(process.env.NL_SAMPLE_TR, 'utf8')); tr = { out: Object.fromEntries(LANGS.slice(1).map(l => [l, { A: S[l]?.analyse || null }])), cache: S.cache || {}, cost: 0 }; }
  else tr = await translate(A, F);
  const out = { fr: { ...issue(F, A, 'fr'), A } };
  for (const l of LANGS.slice(1)) out[l] = { ...issue(F, tr.out[l].A, l, tr.cache), A: tr.out[l].A };
  return { F, A, out, tr };
}

if (DRY) {
  const { F, out } = await buildAll();
  if (process.env.NL_FACTS) fs.writeFileSync(process.env.NL_FACTS, JSON.stringify(F, null, 1));
  for (const l of LANGS) { const d = P('site', lp(l) + 'lettre', 'apercu'); fs.mkdirSync(d, { recursive: true }); fs.writeFileSync(path.join(d, 'index.html'), out[l].html); }
  log('aperçus écrits dans site/lettre/apercu/ et site/<langue>/lettre/apercu/ — objet :', out.fr.subject);
  process.exit(0);
}
const statePath = P('data/newsletter_state.json');
const st = fs.existsSync(statePath) ? readJSON(statePath) : {};
if (cfg.election.blackout.some(b => now >= Date.parse(b.from) && now <= Date.parse(b.to))) { log('réserve électorale : pas de lettre'); process.exit(0); }
if (!FORCE && weekday !== 'Mon') process.exit(0);
if (!FORCE && st.last === today) { log('déjà envoyée aujourd\'hui'); process.exit(0); }
if (!BREVO_API_KEY || !NL.listId || !NL.senderEmail) { log('Brevo non configuré (secret BREVO_API_KEY, newsletter.listId, newsletter.senderEmail) : rien n\'est envoyé'); process.exit(0); }

const { A, out, tr } = await buildAll();
if (!A) log('envoi sans analyse IA (clé absente ou chiffres non vérifiables)');
let lists = null;
try { lists = await langLists(); } catch (e) { log('répartition par langue impossible (droits « Contacts » de la clé Brevo ?) :', e.message, '— tout le monde reçoit la version française'); }
const sent = [], summary = [];
const send = async (lang, recipients) => {
  const c = await brevo('/emailCampaigns', { name: `Le point du lundi ${today} ${lang.toUpperCase()}`, subject: out[lang].subject, sender: { name: NL.senderName || 'La Sonde', email: NL.senderEmail },
    type: 'classic', htmlContent: out[lang].html, recipients });
  await brevo(`/emailCampaigns/${c.id}/sendNow`);
  sent.push({ lang, campaign: c.id }); summary.push(`✔ ${lang.toUpperCase()} : ${out[lang].subject}`);
};
try {
  const others = lists ? Object.entries(lists).filter(([, x]) => x.id && x.n > 0) : [];
  await send('fr', { listIds: [Number(NL.listId)], ...(others.length ? { exclusionListIds: others.map(([, x]) => x.id) } : {}) });
  for (const [l, x] of others) { try { await send(l, { listIds: [x.id] }); } catch (e) { summary.push(`⚠ ${l.toUpperCase()} non envoyée : ${e.message}`); } }
} catch (e) {
  log('échec :', e.message); summary.push(`⚠ Échec de l'envoi : ${e.message}`);
}
if (sent.length) {
  // Archives : toutes les langues, même sans abonné (pages publiques).
  for (const l of LANGS) { const d = l === 'fr' ? P('data/newsletter') : P('data/newsletter', l); fs.mkdirSync(d, { recursive: true }); fs.writeFileSync(path.join(d, `${today}.html`), out[l].html); }
  fs.writeFileSync(CACHE_P, JSON.stringify(tr.cache, null, 1));
  writeJSON(statePath, { last: today, campaigns: sent, subject: out.fr.subject, translationUsd: Math.round(tr.cost * 10000) / 10000, abonnesParLangue: lists ? Object.fromEntries(Object.entries(lists).map(([l, x]) => [l, x.n])) : null }, true);
  archive();
  log('envoyée :', sent.map(s => s.lang).join(', '));
}
summary.push(`Traduction : ${tr.cost.toFixed(3)} $ au maximum (plafond ${TR_MAX} $)`);
if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `### Lettre hebdomadaire\n\n${summary.map(x => '- ' + x).join('\n')}\n\n`);
