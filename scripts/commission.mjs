// La Sonde — veille à la source : la liste officielle des notices de la Commission des sondages.
// À chaque mise à jour (gratuit, sans IA) : lit https://www.commission-des-sondages.fr/notices/,
// repère les notices « Pres » récentes qui peuvent contenir des intentions de vote, écarte celles déjà
// dans la base, télécharge les autres (PDF → texte) et les met en file d'attente pour l'agent,
// qui en relève les chiffres (scripts/agent.mjs, fonction noticeWatch).
// État : data/commission_state.json · fichiers temporaires : .cache/notices/ (non publiés).
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync, execSync } from 'node:child_process';
import { readJSON, writeJSON, parseCSV, toDay } from './lib.mjs';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const P = (...a) => path.join(ROOT, ...a);
const cfg = readJSON(P('config.json'));
const LIST = 'https://www.commission-des-sondages.fr/notices/';
const UA = { 'User-Agent': 'Mozilla/5.0 (compatible; LaSondeBot/1.0; +https://la-sonde.fr)' };
const TODAY = new Date().toISOString().slice(0, 10);
const MAX_AGE = 21, MAX_TRIES = 3;
const STATE = P('data/commission_state.json');
const CACHE = P('.cache/notices');
const log = (...a) => console.log('[commission]', ...a);
const SUMMARY = [];
const done = () => {
  if (process.env.GITHUB_STEP_SUMMARY && SUMMARY.length) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `### Commission des sondages — ${TODAY}\n\n${SUMMARY.map(x => '- ' + x).join('\n')}\n\n`);
  process.exit(0);
};

const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
const MONTHS = ['janvier', 'fevrier', 'mars', 'avril', 'mai', 'juin', 'juillet', 'aout', 'septembre', 'octobre', 'novembre', 'decembre'];
// Une notice « Pres » peut contenir des intentions de vote si son titre le laisse penser.
const RELEVANT = /\bIV\b|intention|election|tour\b|focus|vote|barometre/i;
const instOf = title => cfg.institutes.map(i => [i, norm(i)]).sort((a, b) => b[1].length - a[1].length)
  .find(([, n]) => norm(title).includes(n) || (n.includes('harris') && norm(title).includes('harris')) || (n === 'ipsosbva' && norm(title).includes('ipsos')))?.[0] || null;

let html;
if (process.env.CS_TEST_HTML) html = fs.readFileSync(process.env.CS_TEST_HTML, 'utf8');
else try {
  const r = await fetch(LIST, { headers: UA });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  html = await r.text();
} catch (e) { log('liste inaccessible :', e.message); SUMMARY.push(`⚠ Liste des notices inaccessible (${e.message})`); done(); }

// Entrées : <a href=".../notices/medias/fichiers/add/2345">10328 Pres Attentes reformes IFOP 21 octobre</a>
const entries = [];
for (const m of html.matchAll(/<a[^>]+href="([^"]*fichiers\/add\/(\d+))"[^>]*>([\s\S]*?)<\/a>/gi)) {
  const title = m[3].replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&#0?39;|&rsquo;/g, "'").replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
  const t = title.match(/^(\d{4,6})\s+(.*?)\s+(\d{1,2})(?:er)?\s+([A-Za-zéûÉÛ]+)\.?$/);
  if (!t) continue;
  const mo = MONTHS.indexOf(norm(t[4])); if (mo < 0) continue;
  let y = +TODAY.slice(0, 4), d = new Date(Date.UTC(y, mo, +t[3]));
  if (d.toISOString().slice(0, 10) > TODAY) d = new Date(Date.UTC(--y, mo, +t[3]));
  entries.push({ fid: m[2], href: new URL(m[1], LIST).href, num: t[1], label: t[2], title, pub: d.toISOString().slice(0, 10) });
}
log(`${entries.length} notices listées`);
if (!entries.length) { SUMMARY.push('⚠ Aucune notice lue sur la page (structure modifiée ?)'); done(); }

const st = fs.existsSync(STATE) ? readJSON(STATE) : { seen: {} };
// Sondages déjà connus : base MieuxVoter + relevés de l'agent.
const known = [];
for (const r of parseCSV(fs.readFileSync(P('data/sources/mieuxvoter_presidentielle2027.csv'), 'utf8'))) known.push({ inst: r.nom_institut, end: r.fin_enquete });
// (les relevés de l'agent ne comptent pas : ils peuvent ne couvrir qu'un des deux tours d'une enquête)
const sameInst = (a, b) => { const x = norm(a), y = norm(b); return x.includes(y) || y.includes(x) || ['harris', 'ipsos', 'yougov', 'opinionway', 'cluster17', 'odoxa', 'elabe', 'ifop', 'verian', 'csa', 'viavoice'].some(k => x.includes(k) && y.includes(k)); };
const inBase = (inst, pub) => known.some(k => sameInst(k.inst, inst) && k.end <= pub && toDay(pub) - toDay(k.end) <= 7);

let fresh = 0;
for (const e of entries) {
  if (!/^pres\b/i.test(e.label) || toDay(TODAY) - toDay(e.pub) > MAX_AGE) continue;
  if (st.seen[e.num]) continue;
  const inst = instOf(e.label);
  const s = { fid: e.fid, title: e.title, pub: e.pub, inst, tries: 0 };
  if (!RELEVANT.test(e.label)) s.status = 'hors sujet';
  else if (!inst) s.status = 'institut non suivi';
  else if (inBase(inst, e.pub)) s.status = 'déjà dans la base';
  else s.status = 'pending';
  st.seen[e.num] = s; fresh++;
  SUMMARY.push(`${s.status === 'pending' ? '🆕' : '·'} Notice ${e.num} — ${e.title} : ${s.status === 'pending' ? 'à relever' : s.status}`);
}
// Une notice en attente passe à « déjà dans la base » si MieuxVoter l'a intégrée entre-temps.
for (const [num, s] of Object.entries(st.seen)) if (s.status === 'pending' && s.inst && inBase(s.inst, s.pub)) { s.status = 'déjà dans la base'; SUMMARY.push(`· Notice ${num} : intégrée entre-temps par la base MieuxVoter`); }
// Ménage : on oublie les notices de plus de 60 jours.
for (const [num, s] of Object.entries(st.seen)) if (toDay(TODAY) - toDay(s.pub) > 60) delete st.seen[num];

// Téléchargement des notices en attente (refait à chaque passage : le cache n'est pas conservé).
const pending = Object.entries(st.seen).filter(([, s]) => s.status === 'pending' && s.tries < MAX_TRIES);
if (pending.length) {
  fs.mkdirSync(CACHE, { recursive: true });
  let hasPdftotext = true;
  try { execSync('command -v pdftotext', { stdio: 'ignore' }); } catch {
    try { execSync('sudo apt-get install -y -qq poppler-utils', { stdio: 'ignore', timeout: 120000 }); } catch { hasPdftotext = false; }
  }
  for (const [num, s] of pending) {
    try {
      const r = await fetch(`https://www.commission-des-sondages.fr/notices/medias/fichiers/add/${s.fid}`, { headers: UA, redirect: 'follow' });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const buf = Buffer.from(await r.arrayBuffer());
      if (buf.subarray(0, 4).toString() !== '%PDF') throw new Error('pas un PDF');
      s.url = r.url.replace(/^http:/, 'https:');
      fs.writeFileSync(path.join(CACHE, `${num}.pdf`), buf);
      if (hasPdftotext) {
        try { execFileSync('pdftotext', ['-layout', path.join(CACHE, `${num}.pdf`), path.join(CACHE, `${num}.txt`)], { timeout: 60000 }); } catch { /* l'agent lira le PDF lui-même */ }
      }
      log('téléchargée', num, s.url);
    } catch (e) { s.tries++; log('échec téléchargement', num, e.message); SUMMARY.push(`⚠ Notice ${num} non téléchargée (${e.message})`); }
  }
}
st.checked = new Date().toISOString();
writeJSON(STATE, st, true);
log(`${fresh} nouvelle(s) notice(s), ${pending.length} en attente de relevé.`);
done();
