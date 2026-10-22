// La Sonde — publication automatique de la carte du jour sur Bluesky.
// Secrets GitHub requis : BSKY_HANDLE (ex. lasonde.bsky.social) et BSKY_APP_PASSWORD (mot de passe d'application).
// Publie seulement quand un nouveau sondage est entré dans la moyenne, ou au moins tous les 3 jours.
import fs from 'node:fs';
import path from 'node:path';
import { readJSON, writeJSON } from './lib.mjs';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const P = (...a) => path.join(ROOT, ...a);
const cfg = readJSON(P('config.json'));
const { BSKY_HANDLE, BSKY_APP_PASSWORD, FORCE } = process.env;
const exit = m => { console.log('Bluesky : ' + m); process.exit(0); };

if (cfg.features.bluesky === false) exit('désactivé dans config.json.');
if (!BSKY_HANDLE || !BSKY_APP_PASSWORD) exit('secrets absents, rien à publier.');
const now = Date.now();
// Réserve électorale (loi n° 77-808, art. 11) : aucune publication.
if (cfg.election.blackout.some(b => now >= Date.parse(b.from) && now <= Date.parse(b.to))) exit('période de réserve électorale, aucune publication.');
const png = P('site/share/carte-du-jour.png');
if (!fs.existsSync(png)) exit('pas d\'image du jour.');

const D = readJSON(P('site/data/site.json'));
const statePath = P('data/bsky_state.json');
const st = fs.existsSync(statePath) ? readJSON(statePath) : {};
const days = st.postedAt ? (now - Date.parse(st.postedAt)) / 864e5 : 99;
if (!FORCE && st.asOf === D.asOf && days < 3) exit('aucun nouveau sondage depuis la dernière publication.');

// Texte : les trois signaux du jour (≤ 300 caractères), puis le lien.
const url = D.site.url.replace(/\/$/, '');
const head = (D.changes.fr[0] || {}).t || '';
const top = D.standings.filter(s => s.presence >= 30).slice(0, 4).map(s => `${D.cands[s.c].short} ${s.v.toFixed(1).replace('.', ',')} %`).join(' · ');
let text = `📊 Présidentielle 2027, moyenne des sondages :\n${top}\n\n${head}`;
const link = `\n\n${url.replace(/^https?:\/\//, '')}`;
const seg = new Intl.Segmenter('fr', { granularity: 'grapheme' });
const len = s => [...seg.segment(s)].length;
while (len(text + link) > 300) text = text.replace(/\s*\S+$/, '…').replace(/……$/, '…');
text += link;

if (process.env.DRY) exit('essai à blanc :\n' + text);
const enc = new TextEncoder();
const start = enc.encode(text.slice(0, text.lastIndexOf(url.replace(/^https?:\/\//, '')))).length;
const facet = { index: { byteStart: start, byteEnd: start + enc.encode(url.replace(/^https?:\/\//, '')).length },
  features: [{ $type: 'app.bsky.richtext.facet#link', uri: url + '/' }] };

const API = 'https://bsky.social/xrpc/';
async function call(method, body, token, type = 'application/json') {
  const r = await fetch(API + method, { method: 'POST', headers: { 'Content-Type': type, ...(token ? { Authorization: 'Bearer ' + token } : {}) },
    body: type === 'application/json' ? JSON.stringify(body) : body });
  if (!r.ok) throw new Error(`${method} ${r.status} ${await r.text()}`);
  return r.json();
}
try {
  const s = await call('com.atproto.server.createSession', { identifier: BSKY_HANDLE, password: BSKY_APP_PASSWORD });
  const { blob } = await call('com.atproto.repo.uploadBlob', fs.readFileSync(png), s.accessJwt, 'image/png');
  const alt = `Moyenne des sondages de la présidentielle 2027 au ${D.asOf} : ` + D.standings.filter(x => x.presence >= 30).slice(0, 8).map(x => `${D.cands[x.c].name} ${x.v.toFixed(1)} %`).join(', ') + '.';
  const rec = await call('com.atproto.repo.createRecord', { repo: s.did, collection: 'app.bsky.feed.post', record: {
    $type: 'app.bsky.feed.post', text, createdAt: new Date().toISOString(), langs: ['fr'], facets: [facet],
    embed: { $type: 'app.bsky.embed.images', images: [{ alt: alt.slice(0, 1000), image: blob, aspectRatio: { width: 1200, height: 630 } }] } } }, s.accessJwt);
  writeJSON(statePath, { asOf: D.asOf, postedAt: new Date().toISOString(), uri: rec.uri }, true);
  console.log('Bluesky : publié', rec.uri);
} catch (e) {
  console.log('Bluesky : échec (' + e.message.slice(0, 200) + ')');
}
