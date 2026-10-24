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

// ---------- Rédaction du numéro ----------
function issue() {
  const top = D.standings.filter(s => s.presence >= 30).slice(0, 8);
  const week = D.surveys.filter(s => (Date.parse(today) - Date.parse(s.end)) / 864e5 <= 8);
  const uniq = [...new Map(week.map(s => [s.inst + s.end, s])).values()];
  const sig = (D.changes?.fr || []).slice(0, 3);
  const q = (D.mc?.qualify || []).filter(x => x.p >= 1).slice(0, 4);
  const mover = [...top].sort((a, b) => Math.abs(b.d7) - Math.abs(a.d7))[0];
  const subject = `Le point du lundi · ${top.slice(0, 3).map(s => `${C(s.c).short} ${Math.round(s.v)} %`).join(', ')}`;
  const intro = mover && Math.abs(mover.d7) >= 0.5
    ? `Le mouvement de la semaine : ${esc(C(mover.c).name)}, ${sg(mover.d7)} pt en sept jours, à ${f1(mover.v)} %.`
    : 'Une semaine sans mouvement net dans la moyenne : les écarts entre candidats restent dans le bruit statistique.';
  const max = Math.max(...top.map(s => s.v));
  const row = s => `<tr><td style="padding:7px 0;font:600 15px Arial,sans-serif;color:#15131f;width:150px"><span style="display:inline-block;width:9px;height:9px;border-radius:50%;background:${C(s.c).color};margin-right:7px"></span>${esc(C(s.c).short)}</td>
    <td style="padding:7px 8px"><div style="height:12px;border-radius:6px;background:#efe9df"><div style="height:12px;width:${Math.round(s.v / max * 100)}%;border-radius:6px;background:${C(s.c).color}"></div></div></td>
    <td style="padding:7px 0;font:800 15px Arial,sans-serif;color:#15131f;text-align:right;width:60px">${f1(s.v)} %</td>
    <td style="padding:7px 0 7px 8px;font:700 13px Arial,sans-serif;text-align:right;width:56px;color:${s.d7 >= 0.3 ? '#0f8a5f' : s.d7 <= -0.3 ? '#d23a5f' : '#8a8598'}">${sg(s.d7)}</td></tr>`;
  const h2 = t => `<h2 style="font:800 19px Arial,sans-serif;color:#15131f;margin:28px 0 10px">${t}</h2>`;
  const html = `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(subject)}</title></head>
<body style="margin:0;background:#fbf7f1"><div style="max-width:620px;margin:0 auto;padding:24px 18px;font:16px/1.55 Arial,sans-serif;color:#2a2733">
<div style="height:8px;border-radius:4px;background:linear-gradient(90deg,#5b2cff,#ff3d7f,#ff8a00);background-color:#ff3d7f"></div>
<p style="margin:18px 0 0;font:800 13px Arial,sans-serif;letter-spacing:.12em;color:#5b2cff">LA SONDE · LE POINT DU LUNDI · ${esc(fdate(today).toUpperCase())}</p>
<h1 style="font:800 28px/1.15 Arial,sans-serif;color:#15131f;margin:8px 0 12px">Présidentielle 2027 : la semaine des sondages</h1>
<p style="margin:0 0 6px">${intro}</p>
${h2('La moyenne des sondages')}
<table role="presentation" style="width:100%;border-collapse:collapse">${top.map(row).join('')}</table>
<p style="font-size:12.5px;color:#7d788c;margin:6px 0 0">Moyenne corrigée des effets instituts au ${esc(fdate(D.asOf))} · dernière colonne : évolution sur 7 jours.</p>
${sig.length ? h2('Les signaux à retenir') + `<ul style="padding-left:20px;margin:0">${sig.map(s => `<li style="margin:0 0 8px">${esc(s.t)}</li>`).join('')}</ul>` : ''}
${q.length && D.features?.probabilities !== false ? h2('Qui ira au second tour ?') + `<p style="margin:0">${q.map(x => `${esc(C(x.c).short)} <b>${Math.round(x.p)} %</b>`).join(' · ')}</p><p style="font-size:12.5px;color:#7d788c;margin:6px 0 0">Chances de qualification simulées à partir des sondages et de leur erreur historique. Ce n'est pas une prédiction.</p>` : ''}
${h2(`Les sondages de la semaine (${uniq.length})`)}
${uniq.length ? `<ul style="padding-left:20px;margin:0">${uniq.map(s => `<li style="margin:0 0 6px"><b>${esc(s.inst)}</b> pour ${esc(s.sponsor)} · terrain du ${esc(fdate(s.start, { day: 'numeric', month: 'short' }))} au ${esc(fdate(s.end, { day: 'numeric', month: 'short' }))}, ${s.n.toLocaleString('fr-FR')} personnes</li>`).join('')}</ul>` : '<p style="margin:0">Aucun nouveau sondage d\'intentions de vote cette semaine.</p>'}
<p style="margin:30px 0"><a href="${BASE}/" style="display:inline-block;padding:13px 22px;border-radius:999px;background:#5b2cff;color:#fff;font:800 15px Arial,sans-serif;text-decoration:none">Tout voir sur la-sonde.fr →</a></p>
<p style="font-size:12.5px;color:#7d788c;border-top:1px solid #e6dfd4;padding-top:14px">La Sonde agrège les sondages publiés (notices de la Commission des sondages) ; ces chiffres sont une moyenne, pas un sondage. Site indépendant, sans publicité. Vous recevez cette lettre parce que vous vous êtes inscrit sur la-sonde.fr. <a href="{{ unsubscribe }}" style="color:#7d788c">Se désabonner</a></p>
</div></body></html>`;
  return { subject, html };
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
<p id="merci" style="display:none;padding:14px 18px;border-radius:14px;background:#e9fbf1;color:#0f5c3a;font-weight:700">✓ Votre inscription est confirmée. Premier numéro lundi matin !</p>
<script>if(/confirm|merci|success/i.test(location.search+location.hash)||document.referrer.includes('sibforms'))document.getElementById('merci').style.display='block'</script>
<p>Chaque lundi matin : la moyenne des sondages de la présidentielle 2027, ce qui a bougé, et les sondages de la semaine. Gratuit, sans publicité, désinscription en un clic.</p>${form}
<h2 style="font:800 20px Arial,sans-serif;margin-top:30px">Tous les numéros</h2>
${files.length ? `<ul>${files.map(f => `<li><a href="${f.slice(0, 10)}/">${fdate(f.slice(0, 10))}</a></li>`).join('')}</ul>` : '<p>Le premier numéro paraîtra lundi prochain.</p>'}
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
  const { subject, html } = issue();
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

const { subject, html } = issue();
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
