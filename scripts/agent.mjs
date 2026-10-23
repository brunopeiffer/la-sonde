// Agent de veille automatique (API Claude + recherche web limitée aux sites de confiance).
// 1. Cherche les sondages présidentiels 2027 publiés récemment et pas encore dans la base.
// 2. Fait vérifier chaque sondage par un second passage indépendant (double contrôle).
// 3. Une fois par mois, ajoute la nouvelle vague du baromètre des préoccupations.
// Sans clé ANTHROPIC_API_KEY, l'agent ne fait rien : le site continue de se mettre à jour via MieuxVoter.
import fs from 'node:fs';
import path from 'node:path';
import { readJSON, writeJSON, parseCSV, toDay } from './lib.mjs';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const P = (...a) => path.join(ROOT, ...a);
const cfg = readJSON(P('config.json'));
const KEY = process.env.ANTHROPIC_API_KEY;
const AG = cfg.agent || {};
let MODEL = process.env.CLAUDE_MODEL || AG.model || 'claude-haiku-5-5';
const TODAY = new Date().toISOString().slice(0, 10);
const log = (...a) => console.log('[agent]', ...a);

if (!KEY) { log('Pas de clé ANTHROPIC_API_KEY : veille par agent désactivée.'); process.exit(0); }
// Budget : l'agent ne tourne qu'un jour sur N (config.json → agent.everyDays), sauf lancement manuel.
const STATE_PATH = P('data/agent_state.json');
const state = fs.existsSync(STATE_PATH) ? readJSON(STATE_PATH) : {};
// Deux modes : (1) relevé des notices officielles en attente (scripts/commission.mjs), à chaque passage,
// car c'est peu coûteux et seulement quand il y a du nouveau ; (2) recherche web, le matin, un jour sur N.
const CS_PATH = P('data/commission_state.json');
const CS = fs.existsSync(CS_PATH) ? readJSON(CS_PATH) : { seen: {} };
const PENDING = Object.entries(CS.seen || {}).filter(([, s]) => s.status === 'pending' && (s.tries || 0) < 3).sort((a, b) => a[1].pub.localeCompare(b[1].pub)).slice(0, 6);
const lastSearch = state.lastSearch || state.lastRun;
const DUE = !!process.env.FORCE || (process.env.MORNING === '1' && (!lastSearch || toDay(TODAY) - toDay(lastSearch) >= (AG.everyDays || 1)));
if (!DUE && !PENDING.length) {
  log(`Aucune notice en attente. Recherche web : dernier passage le ${lastSearch || '—'}, tous les ${AG.everyDays || 1} jour(s), le matin.`); process.exit(0);
}
if (cfg.election.blackout.some(b => Date.now() >= Date.parse(b.from) && Date.now() <= Date.parse(b.to))) {
  log('Période de réserve électorale : aucune collecte.'); process.exit(0);
}

// ---------- Garde-fou budgétaire ----------
// Coût estimé à partir de l'usage renvoyé par l'API (tarifs dans config.json → agent.prices, en dollars).
// Au-delà du budget mensuel (agent.monthlyBudgetUsd), l'agent s'arrête jusqu'au mois suivant.
const PRICES = AG.prices || { inputPerMTok: 1, outputPerMTok: 5, searchPer1000: 10 };
const MONTH = TODAY.slice(0, 7);
const spend = state.month === MONTH ? (state.spentUsd || 0) : 0;
let spent = spend, calls = 0, searches = 0;
const BUDGET = AG.monthlyBudgetUsd || 4;
if (spent >= BUDGET) { log(`Budget du mois atteint (${spent.toFixed(2)} $ / ${BUDGET} $) : pause jusqu'au mois prochain.`); process.exit(0); }
const SUMMARY = [];

// Modèle : on vérifie qu'il existe encore ; sinon on prend le Haiku le plus récent disponible sur le compte.
try {
  const r = await fetch('https://api.anthropic.com/v1/models?limit=100', { headers: { 'x-api-key': KEY, 'anthropic-version': '2023-06-01' } });
  if (!r.ok) throw new Error(`liste des modèles : ${r.status} ${(await r.text()).slice(0, 200)}`);
  const ids = ((await r.json()).data || []).map(m => m.id);
  if (!ids.includes(MODEL)) {
    const alt = ids.find(id => id.includes('haiku')) || ids[0];
    if (alt) { SUMMARY.push(`ℹ Modèle ${MODEL} indisponible : utilisation de ${alt}.`); MODEL = alt; }
  }
} catch (e) { SUMMARY.push(`⚠ ${e.message}`); }
log('Modèle utilisé :', MODEL);

// Certains sites (paywall, robots.txt) refusent le robot de recherche d'Anthropic : on les retire et on les mémorise.
const BLOCKED = new Set(state.blockedDomains || []);
let FETCH = AG.fetch === false ? false : 'beta';  // 'beta' → 'ga' (sans en-tête) → false
const searchDomains = () => cfg.trustedDomains.filter(d => !BLOCKED.has(d));

async function ask(prompt, maxSearches = 8, maxFetches = AG.maxFetches || 2) {
  if (spent >= BUDGET) throw new Error('budget mensuel atteint');
  const messages = [{ role: 'user', content: prompt }];
  const tools = [
    ...(maxSearches > 0 ? [{ type: 'web_search_20250305', name: 'web_search', max_uses: maxSearches, allowed_domains: searchDomains() }] : []),
    // Lecture complète d'une page ou d'un PDF (notice de la Commission, rapport d'institut).
    ...(FETCH && maxFetches > 0 ? [{ type: 'web_fetch_20250910', name: 'web_fetch', max_uses: maxFetches, allowed_domains: searchDomains(), max_content_tokens: AG.maxFetchTokens || 20000 }] : [])];
  let text = '', last = null, finalize = false;
  for (let turn = 0; turn < 5; turn++) {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json', ...(FETCH === 'beta' && tools.some(t => t.name === 'web_fetch') ? { 'anthropic-beta': 'web-fetch-2025-09-10' } : {}) },
      body: JSON.stringify({
        model: MODEL, max_tokens: 8000,
        ...(tools.length ? { tools } : {}),
        ...(finalize && tools.length ? { tool_choice: { type: 'none' } } : {}),
        messages
      })
    });
    if (!r.ok) {
      const err = await r.text();
      if (FETCH && r.status === 400 && /web.?fetch|anthropic-beta/i.test(err) && !/not accessible/i.test(err)) {
        if (FETCH === 'beta' && /anthropic-beta/i.test(err)) { FETCH = 'ga'; turn--; continue; }
        FETCH = false; SUMMARY.push(`ℹ Lecture des PDF indisponible sur ce compte : recherche seule. (${err.slice(0, 120)})`); turn--; continue;
      }
      if (r.status === 400 && /not accessible to our user agent/i.test(err)) {
        const doms = [...(err.match(/accessible to our user agent:\s*\[([^\]]*)\]/) || ['', ''])[1].matchAll(/'([a-z0-9.-]+)'/gi)].map(m => m[1]);
        const fresh = doms.filter(d => !BLOCKED.has(d));
        if (fresh.length) { fresh.forEach(d => BLOCKED.add(d)); SUMMARY.push(`ℹ Sites inaccessibles au robot de recherche, retirés : ${fresh.join(', ')}`); turn--; continue; }
      }
      throw new Error(`API ${r.status}: ${err.slice(0, 300)}`);
    }
    const j = await r.json();
    const u = j.usage || {}, ns = (u.server_tool_use || {}).web_search_requests || 0;
    calls++; searches += ns;
    spent += ((u.input_tokens || 0) + (u.cache_creation_input_tokens || 0) + (u.cache_read_input_tokens || 0)) / 1e6 * PRICES.inputPerMTok
      + (u.output_tokens || 0) / 1e6 * PRICES.outputPerMTok + ns / 1000 * PRICES.searchPer1000;
    last = j;
    text += j.content.filter(b => b.type === 'text').map(b => b.text).join('\n');
    // Recherche longue : l'API rend la main (« pause_turn ») ; on la laisse continuer.
    if (j.stop_reason === 'pause_turn') { messages.push({ role: 'assistant', content: j.content }); continue; }
    if (extract(text) || finalize) break;
    // Pas de bloc JSON : on demande la réponse finale, sans nouvelle recherche.
    finalize = true;
    messages.push({ role: 'assistant', content: j.content });
    messages.push({ role: 'user', content: 'Donne maintenant ta réponse finale, uniquement sous la forme du bloc <json>…</json> demandé, sans nouvelle recherche.' });
  }
  const data = extract(text);
  if (!data) throw new Error(`réponse sans JSON exploitable (arrêt : ${last && last.stop_reason}) : « ${text.replace(/\s+/g, ' ').slice(-200)} »`);
  return data;
}
// Le JSON peut arriver entre <json>…</json>, dans un bloc ```json, ou nu : on accepte les trois.
function extract(text) {
  const cands = [];
  for (const m of text.matchAll(/<json>([\s\S]*?)<\/json>/g)) cands.push(m[1]);
  for (const m of text.matchAll(/```(?:json)?\s*([\s\S]*?)```/g)) cands.push(m[1]);
  const a = text.lastIndexOf('{"'), b = text.lastIndexOf('}');
  if (a >= 0 && b > a) { let i = text.lastIndexOf('{"polls"'); if (i < 0) i = text.indexOf('{"'); cands.push(text.slice(i, b + 1)); }
  for (const c of cands.reverse()) { try { return JSON.parse(c.trim()); } catch { /* suivant */ } }
  return null;
}

// Correspondance nom complet → identifiant candidat (fichier MieuxVoter).
const norm = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z]/g, '');
const candRows = parseCSV(fs.readFileSync(P('data/sources/mieuxvoter_candidats.csv'), 'utf8'));
const idOf = name => {
  const n = norm(name);
  const hit = candRows.find(r => norm(r.complete_name) === n) || candRows.find(r => norm(r.surname) === n);
  return hit ? hit.candidate_id : null;
};
const instOK = s => cfg.institutes.some(i => norm(s).includes(norm(i)) || norm(i).includes(norm(s)));
const DISCOVERY = ['wikipedia.org', 'sondax.fr'];
const domainOK = u => { try { const h = new URL(u).hostname.replace(/^www\./, ''); return cfg.trustedDomains.some(d => h === d || h.endsWith('.' + d)); } catch { return false; } };

// Sondages déjà connus (pour ne pas les rechercher à nouveau).
const known = new Map();
for (const r of parseCSV(fs.readFileSync(P('data/sources/mieuxvoter_presidentielle2027.csv'), 'utf8'))) {
  if (toDay(TODAY) - toDay(r.fin_enquete) <= 30) known.set(r.poll_id.replace(/_[^_]+$/, ''), `${r.nom_institut} (${r.commanditaire}), terrain ${r.debut_enquete} → ${r.fin_enquete}`);
}
const store = readJSON(P('data/agent_polls.json'));
for (const p of store.polls) known.set(p.survey, `${p.institute} (${p.sponsor}), terrain ${p.start} → ${p.end}`);

const SCHEMA = `{"skipped":[{"institute":"IFOP","end":"YYYY-MM-DD","reason":"pourquoi il n'est pas inclus"}],"polls":[{"institute":"IFOP","sponsor":"LCI, Le Figaro","start":"YYYY-MM-DD","end":"YYYY-MM-DD","n":1000,"round":1,
"source":"URL de la page de l'institut, de la notice ou du média","hypotheses":[{"label":"Hypothèse avec X","results":{"Nom Complet":34.5}}]}]}`;

function validate(p) {
  const errs = [];
  if (!instOK(p.institute || '')) errs.push('institut inconnu');
  if (!domainOK(p.source || '') || DISCOVERY.some(d => (p.source || '').includes(d))) errs.push('source hors liste de confiance');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(p.end || '') || p.end > TODAY || toDay(TODAY) - toDay(p.end) > 30) errs.push('dates invalides');
  if (!(p.n >= 500 && p.n <= 30000)) errs.push('échantillon invalide');
  if (![1, 2].includes(p.round)) errs.push('tour invalide');
  if (!Array.isArray(p.hypotheses) || !p.hypotheses.length) errs.push('aucune hypothèse');
  for (const h of p.hypotheses || []) {
    const ids = {}, unknown = [];
    for (const [name, v] of Object.entries(h.results || {})) {
      if (!(v >= 0 && v <= 80)) errs.push(`valeur invalide ${name}`);
      const id = idOf(name);
      if (!id) { unknown.push([name, +v]); continue; }
      ids[id] = +v;
    }
    // Candidat absent de la base (ex. personnalité testée pour la première fois) : au 1er tour, on garde
    // l'hypothèse sans lui s'il pèse peu (≤ 5 %) ; les autres scores restent ceux publiés.
    if (unknown.length) {
      if (p.round === 1 && unknown.every(([, v]) => v <= 5)) (p.dropped ||= []).push(...unknown.map(([n, v]) => `${n} (${v} %)`));
      else errs.push(`candidat inconnu : ${unknown.map(([n]) => n).join(', ')}`);
    }
    const s = Object.values(ids).reduce((a, b) => a + b, 0);
    if (p.round === 1 && (s < 85 || s > 103 || Object.keys(ids).length < 5)) errs.push(`total hypothèse ${s}`);
    if (p.round === 2 && (Object.keys(ids).length !== 2 || s < 98 || s > 102)) errs.push(`duel invalide (${s})`);
    h.ids = ids;
  }
  return errs;
}

// Contrôle, double vérification et enregistrement d'une liste de sondages relevés.
async function addPolls(found, verify) {
  let added = 0; addPolls.failed = 0;
  for (const p of found) {
    const errs = validate(p);
    if (errs.length) { addPolls.failed++; log('✗ rejeté', p.institute, p.end, errs.join('; ')); SUMMARY.push(`✗ Rejeté : ${p.institute} ${p.end} (${errs.join('; ')})`); continue; }
    // Double contrôle indépendant.
    const check = await verify(p);
    if (!check.confirmed) { addPolls.failed++; log('✗ non confirmé', p.institute, p.end, check.reason); SUMMARY.push(`✗ Non confirmé : ${p.institute} ${p.end} (${p.round === 2 ? '2nd' : '1er'} tour)${check.reason ? ' — ' + check.reason : ''}`); continue; }
    // Comparaison par candidat (identifiant), en cherchant pour chaque hypothèse la plus proche dans la vérification.
    const ver = (check.hypotheses || []).map(h => Object.fromEntries(Object.entries(h.results || {}).map(([n, v]) => [idOf(n), +v]).filter(([id]) => id)));
    const mismatch = p.hypotheses.some(h => !ver.some(w => Object.entries(h.ids).every(([id, v]) => w[id] !== undefined && Math.abs(w[id] - v) <= 0.5)));
    if (mismatch) { addPolls.failed++; log('✗ chiffres divergents entre les deux passages', p.institute, p.end); SUMMARY.push(`✗ Chiffres divergents à la vérification : ${p.institute} ${p.end}`); continue; }
    const code = norm(p.institute).slice(0, 2);
    const survey = `${p.start.replace(/-/g, '')}_${p.end.slice(5).replace('-', '')}_${code}_ag${p.round}`;
    if (store.polls.some(x => x.survey === survey)) continue;
    store.polls.push({ survey, institute: p.institute, sponsor: p.sponsor, start: p.start, end: p.end, n: p.n, round: p.round, source: p.source,
      foundAt: TODAY, hypotheses: p.hypotheses.map(h => ({ label: h.label || '', results: h.ids })) });
    known.set(survey, `${p.institute} (${p.sponsor}), terrain ${p.start} → ${p.end}`);
    added++; log('✔ ajouté', survey); SUMMARY.push(`✔ Sondage ajouté : ${p.institute} pour ${p.sponsor}, terrain ${p.start} → ${p.end}, ${p.round === 2 ? '2nd' : '1er'} tour (${p.hypotheses.length} hypothèse(s))${p.dropped ? ` — non suivi(s) dans la base : ${[...new Set(p.dropped)].join(', ')}` : ''}`);
  }
  store.polls = store.polls.filter(p => toDay(TODAY) - toDay(p.end) <= 60);
  writeJSON(P('data/agent_polls.json'), store, true);
  return added;
}

// Relevé des notices officielles déposées à la Commission des sondages (repérées par scripts/commission.mjs).
// Le document est fourni directement au modèle (texte extrait du PDF, ou le PDF lui-même) : pas de recherche web.
async function noticeWatch() {
  for (const [num, s] of PENDING) {
    const txt = P('.cache/notices', `${num}.txt`), pdf = P('.cache/notices', `${num}.pdf`);
    let doc;
    if (fs.existsSync(txt) && fs.statSync(txt).size > 500) doc = [{ type: 'text', text: `TEXTE INTÉGRAL DE LA NOTICE (extrait du PDF) :\n${fs.readFileSync(txt, 'utf8').replace(/[ \t]{3,}/g, '  ').slice(0, 150000)}` }];
    else if (fs.existsSync(pdf)) doc = [{ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: fs.readFileSync(pdf).toString('base64') } }];
    else { s.tries = (s.tries || 0) + 1; SUMMARY.push(`⚠ Notice ${num} : fichier indisponible`); continue; }
    const head = `Notice officielle n° ${num} déposée à la Commission des sondages : « ${s.title} » (publiée le ${s.pub}). URL : ${s.url}`;
    try {
      const res = await ask([...doc, { type: 'text', text: `${head}
Si ce document contient des INTENTIONS DE VOTE pour l'élection présidentielle française de 2027, relève-les EXACTEMENT telles que publiées (colonne des résultats publiés, pas les résultats bruts), pour CHAQUE hypothèse testée, avec les noms complets des candidats.
Un objet "polls" par tour (un pour le 1er tour avec toutes ses hypothèses, un pour le 2nd tour avec un duel par hypothèse). N'inclus pas « abstention », « blanc », « ne se prononce pas » ni « sans intention de vote » dans les résultats.
institute : l'institut ; sponsor : le ou les commanditaires/médias ; start et end : dates de terrain ; n : nombre d'inscrits sur les listes électorales interrogés (à défaut, la taille de l'échantillon) ; source : ${s.url}
Les petits candidats annoncés « 2 % ou moins » : 1 ; « moins de 1 % » : 0.5. N'invente rien : une hypothèse illisible n'est pas relevée.
Si le document ne contient pas d'intentions de vote présidentielles, réponds <json>{"polls":[],"none":"raison courte"}</json>.
Réponds uniquement par un bloc <json>…</json> au format ${SCHEMA}.` }], 0, 0);
      const found = (res.polls || []).map(p => ({ ...p, source: s.url }));
      if (!found.length) { s.status = 'sans intentions de vote'; SUMMARY.push(`· Notice ${num} (${s.title}) : pas d'intentions de vote${res.none ? ' — ' + res.none : ''}`); continue; }
      const added = await addPolls(found, p => ask([...doc, { type: 'text', text: `${head}
Vérifie, chiffre par chiffre, ce relevé de sondage par rapport au document ci-dessus (résultats publiés). Relevé : ${JSON.stringify(p)}
Conventions du relevé (ce ne sont PAS des erreurs) : « < 1 % » ou « moins de 1 % » est relevé 0.5 ; « 2 % ou moins » est relevé 1 ; les lignes abstention, blancs, « ne se prononcent pas » ou « sans intention de vote » sont volontairement exclues ; un candidat absent de la base peut avoir été retiré du relevé. Ne refuse que si un chiffre relevé diffère du document, ou si les métadonnées sont fausses.
Réponds par <json>{"confirmed":true|false,"reason":"…","hypotheses":[{"results":{"Nom Complet":valeur}}]}</json> avec les chiffres tels que publiés dans le document.` }], 0, 0));
      if (!added && addPolls.failed) { s.tries = (s.tries || 0) + 1; SUMMARY.push(`… Notice ${num} : à réessayer au prochain passage (essai ${s.tries}/3)`); if (s.tries >= 3) s.status = 'abandonnée après 3 essais'; continue; }
      s.status = added ? `relevée (${added} sondage(s) ajouté(s))` : 'relevée, rien de nouveau';
      SUMMARY.push(`${added ? '✔' : '·'} Notice ${num} (${s.title}) : ${s.status}`);
    } catch (e) {
      s.tries = (s.tries || 0) + 1;
      SUMMARY.push(`⚠ Notice ${num} : relevé en échec (${e.message.slice(0, 150)})${s.tries >= 3 ? ' — abandon après 3 essais' : ''}`);
      if (/budget/.test(e.message)) break;
    }
  }
  writeJSON(CS_PATH, CS, true);
}

async function pollWatch() {
  const prompt = `Tu es analyste pour un agrégateur de sondages. Aujourd'hui : ${TODAY}.
Cherche les sondages d'INTENTIONS DE VOTE pour l'élection présidentielle française de 2027 (1er ou 2nd tour) dont le terrain s'est terminé dans les 21 derniers jours, réalisés par des instituts reconnus (${cfg.institutes.join(', ')}) et publiés par des médias nationaux (TV, radio, presse).
Ignore les sondages commandés par un parti ou un candidat, les sondages « souhait de victoire » et les sondages déjà connus ci-dessous :
${[...known.values()].map(s => '- ' + s).join('\n') || '- (aucun)'}
Pour chaque nouveau sondage, relève EXACTEMENT les chiffres publiés pour CHAQUE hypothèse testée (noms complets des candidats), l'échantillon (nombre d'inscrits interrogés ou, à défaut, de personnes interrogées), les dates de terrain et l'URL de la source primaire.
Méthode conseillée :
1. REPÉRAGE : ouvre d'abord avec web_fetch l'une de ces listes tenues à jour, qui recensent les sondages récents (les plus récents en haut) : https://fr.wikipedia.org/wiki/Liste_de_sondages_sur_l%27%C3%A9lection_pr%C3%A9sidentielle_fran%C3%A7aise_de_2027 ou https://sondax.fr/sondages.html. Note les sondages dont le terrain se termine après le plus récent sondage déjà connu ci-dessus.
2. Complète par une recherche générale (« sondage présidentielle 2027 intentions de vote » + le mois en cours) et les sites des instituts (pages « actualités » ou « publications », souvent avec un PDF).
3. Ces listes ne servent qu'au repérage : les chiffres doivent venir de la source primaire (institut ou notice de commission-des-sondages.fr). Si elle est inaccessible, mets le sondage dans "skipped" : la veille des notices officielles le relèvera.
Si tu repères un sondage mais ne peux pas en relever tous les chiffres de façon certaine, mets-le dans "skipped" avec la raison, au lieu de l'ignorer en silence.
Pour chaque sondage repéré, ouvre sa notice PDF sur commission-des-sondages.fr ou le rapport de l'institut avec l'outil web_fetch, et relève les chiffres dans ce document plutôt que dans un article de presse.
Les petits candidats annoncés « 2 % ou moins » : indique 1 ; « moins de 1 % » : indique 0.5. Si seules certaines hypothèses sont lisibles avec certitude, ne relève que celles-là (il en faut au moins une complète pour les principaux candidats).
N'invente rien : un chiffre douteux = hypothèse non relevée.
Réponds uniquement par un bloc <json>…</json> au format ${SCHEMA}. Si rien de nouveau : <json>{"polls":[]}</json>`;
  const res0 = await ask(prompt, AG.maxSearches || 6);
  // Un même sondage peut revenir deux fois : on garde la version la plus complète.
  const byKey = new Map();
  for (const p of res0.polls || []) {
    const k = `${norm(p.institute || '').slice(0, 5)}|${p.end}|${p.round}`;
    const prev = byKey.get(k);
    if (!prev || (p.hypotheses || []).length > (prev.hypotheses || []).length) byKey.set(k, p);
  }
  const found = [...byKey.values()];
  for (const k of res0.skipped || []) SUMMARY.push(`… Repéré mais écarté par l'agent : ${k.institute || '?'} (${k.end || '?'}) — ${k.reason || 'sans raison'}`);
  log(`${found.length} sondage(s) candidat(s)`);
  SUMMARY.push(`Recherche : ${found.length} sondage(s) récent(s) non encore dans la base${found.length ? ' : ' + found.map(p => `${p.institute} (${p.end}, ${p.round === 2 ? '2nd' : '1er'} tour)`).join(', ') : ''}.`);
  const added = await addPolls(found, p => ask(`Vérifie ce relevé de sondage en ouvrant directement sa source avec web_fetch (${p.source}) ou la notice de la Commission des sondages. Relevé : ${JSON.stringify(p)}
Conventions du relevé (ce ne sont PAS des erreurs) : « < 1 % » ou « moins de 1 % » est relevé 0.5 ; « 2 % ou moins » est relevé 1 ; les lignes abstention, blancs, « ne se prononcent pas » ou « sans intention de vote » sont volontairement exclues ; un candidat absent de la base peut avoir été retiré du relevé. Ne refuse que si un chiffre relevé diffère du document, ou si les métadonnées sont fausses.
Réponds par <json>{"confirmed":true|false,"reason":"…","hypotheses":[{"results":{"Nom Complet":valeur}}]}</json> avec les chiffres tels que publiés.`, AG.verifySearches ?? 1, AG.verifyFetches ?? 1));
  // On purge les entrées de plus de 60 jours (la base MieuxVoter a pris le relais).
  store.polls = store.polls.filter(p => toDay(TODAY) - toDay(p.end) <= 60);
  writeJSON(P('data/agent_polls.json'), store, true);
  return added;
}

async function concernsWatch() {
  const C = readJSON(P('data/concerns.json'));
  const s = C.series.find(x => x.id === 'ipsos-tribune');
  const last = s.waves.map(w => w.date).sort().pop();
  if (toDay(TODAY) - toDay(last) < 25) { log('Baromètre des préoccupations à jour.'); return; }
  const themes = Object.keys(C.themes).join(', ');
  const res = await ask(`Trouve la vague la plus récente (postérieure au ${last}) du « Baromètre politique Ipsos bva-CESI pour La Tribune Dimanche » et relève les pourcentages EXACTS des principales préoccupations des Français.
Codes de thèmes autorisés : ${themes}. N'inclus que les thèmes dont le pourcentage est publié.
Réponds par <json>{"found":true|false,"date":"YYYY-MM-DD (fin de terrain)","field":"texte des dates de terrain","n":1000,"source":"URL","values":{"pouvoir_achat":54}}</json>`, 3);
  if (!res.found || !res.date || res.date <= last || !domainOK(res.source || '')) { log('Pas de nouvelle vague exploitable.'); return; }
  const vals = Object.fromEntries(Object.entries(res.values || {}).filter(([k, v]) => C.themes[k] && v > 0 && v < 100));
  if (Object.keys(vals).length < 3) { log('Vague incomplète, ignorée.'); return; }
  s.waves.push({ date: res.date, field: res.field, n: res.n, source: res.source, values: vals, agent: true });
  writeJSON(P('data/concerns.json'), C, true);
  log('✔ nouvelle vague préoccupations', res.date); SUMMARY.push(`✔ Préoccupations : nouvelle vague du ${res.date}`);
}


// Une fois par semaine : déclarations et retraits de candidature récents (pour data/overrides.json).
async function candidacyWatch() {
  const O = readJSON(P('data/overrides.json'));
  if (O.lastCheck && toDay(TODAY) - toDay(O.lastCheck) < 7) { log('Candidatures vérifiées récemment.'); return; }
  const res = await ask(`Aujourd'hui : ${TODAY}. Liste les annonces de candidature et les retraits de candidature à l'élection présidentielle française de 2027 survenus dans les 30 derniers jours (y compris les candidats battus à une primaire qui renoncent).
Pour chacun : nom complet, type ("declaration" ou "withdrawal"), date (YYYY-MM-DD), une phrase factuelle en français et en anglais, URL de la source. N'inclus que des faits confirmés par un média national.
Réponds par <json>{"items":[{"name":"Nom Complet","type":"withdrawal","date":"YYYY-MM-DD","fr":"…","en":"…","source":"URL"}]}</json>`, 3);
  let n = 0;
  for (const it of res.items || []) {
    const id = idOf(it.name || '');
    const okDate = /^\d{4}-\d{2}-\d{2}$/.test(it.date || '') && it.date <= TODAY && toDay(TODAY) - toDay(it.date) <= 31;
    if (!id || !okDate || !domainOK(it.source || '') || !['declaration', 'withdrawal'].includes(it.type)) { log('✗ candidature ignorée', it.name, it.type); continue; }
    const list = it.type === 'withdrawal' ? (O.withdrawals ||= []) : (O.declarations ||= []);
    if (list.some(x => x.id === id)) continue;
    const chk = await ask(`Vérifie ce fait avec sa source (${it.source}) : ${JSON.stringify(it)}. Réponds par <json>{"confirmed":true|false}</json>.`, 3);
    if (!chk.confirmed) { log('✗ non confirmé', it.name); continue; }
    list.push({ id, date: it.date, fr: it.fr, en: it.en, source: it.source, agent: true }); n++;
    log('✔ candidature', it.type, it.name, it.date); SUMMARY.push(`✔ Candidature (${it.type}) : ${it.name}, ${it.date}`);
  }
  O.lastCheck = TODAY;
  writeJSON(P('data/overrides.json'), O, true);
  log(`${n} changement(s) de candidature ajouté(s).`);
}

if (PENDING.length) { try { await noticeWatch(); } catch (e) { log('Relevé des notices en échec :', e.message); SUMMARY.push(`⚠ Relevé des notices en échec : ${e.message}`); } }
if (DUE) {
  try { await pollWatch(); } catch (e) { log('Veille sondages en échec :', e.message); SUMMARY.push(`⚠ Veille sondages en échec : ${e.message}`); }
  try { await concernsWatch(); } catch (e) { log('Veille préoccupations en échec :', e.message); SUMMARY.push(`⚠ Veille préoccupations en échec : ${e.message}`); }
  try { await candidacyWatch(); } catch (e) { log('Veille candidatures en échec :', e.message); SUMMARY.push(`⚠ Veille candidatures en échec : ${e.message}`); }
}
writeJSON(STATE_PATH, { ...state, lastRun: TODAY, ...(DUE ? { lastSearch: TODAY } : { lastSearch }), month: MONTH, spentUsd: Math.round(spent * 1000) / 1000, blockedDomains: [...BLOCKED].sort() }, true);
const recap = `### Agent de veille — ${TODAY} (modèle ${MODEL})\n\n${SUMMARY.length ? SUMMARY.map(x => '- ' + x).join('\n') : '- Rien de nouveau.'}\n\n${calls} appel(s), ${searches} recherche(s). Coût estimé ce mois-ci : ${spent.toFixed(2)} $ sur ${BUDGET} $.\n`;
log(recap.replace(/\n+/g, ' | '));
if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, recap);
