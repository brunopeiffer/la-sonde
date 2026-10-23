// La Sonde — publication automatique sur Bluesky, une fois par jour, avec un format différent chaque jour
// (voir scripts/social.mjs). Jamais deux fois le même texte en deux semaines.
// Secrets GitHub requis : BSKY_HANDLE (ex. la-sonde.bsky.social) et BSKY_APP_PASSWORD (mot de passe d'application).
// Variables utiles : DRY=1 (essai à blanc, écrit les images dans site/share/essai-*.png), FORCE=1, FORMAT=duels.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { readJSON, writeJSON } from './lib.mjs';
import { buildPosts, BY_DAY, dayIndex, parisDate } from './social.mjs';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const P = (...a) => path.join(ROOT, ...a);
const cfg = readJSON(P('config.json'));
const { BSKY_HANDLE, BSKY_APP_PASSWORD, FORCE, DRY, FORMAT } = process.env;
const exit = m => { console.log('Bluesky : ' + m); process.exit(0); };

if (cfg.features.bluesky === false) exit('désactivé dans config.json.');
if (!DRY && (!BSKY_HANDLE || !BSKY_APP_PASSWORD)) exit('secrets absents, rien à publier.');
const now = new Date();
// Réserve électorale (loi n° 77-808, art. 11) : aucune publication.
if (cfg.election.blackout.some(b => now >= Date.parse(b.from) && now <= Date.parse(b.to))) exit('période de réserve électorale, aucune publication.');

const D = readJSON(P('site/data/site.json'));
const statePath = P('data/bsky_state.json');
const st = fs.existsSync(statePath) ? readJSON(statePath) : {};
const today = parisDate(now);
if (!FORCE && !DRY && st.day === today) exit('déjà publié aujourd\'hui.');

const seg = new Intl.Segmenter('fr', { granularity: 'grapheme' });
const len = s => [...seg.segment(s)].length;
const hash = s => crypto.createHash('sha1').update(s).digest('hex').slice(0, 12);
const recent = (st.history || []).filter(h => (now - Date.parse(h.at)) / 864e5 < 14).map(h => h.hash);

// Format du jour, puis les suivants si celui-ci manque de données ou se répète.
const posts = buildPosts(D, now);
const order = FORMAT ? [FORMAT] : [0, 1, 2, 3, 4, 5, 6].map(k => BY_DAY[(dayIndex(now) + k) % 7]);
let key, post;
for (const k of order) {
  const p = posts[k];
  if (!p || (!p.svg && !fs.existsSync(P(p.png)))) continue;
  if (!FORCE && !FORMAT && recent.includes(hash(p.text))) continue;
  key = k; post = p; break;
}
if (!post) exit('aucun format nouveau aujourd\'hui (tout a déjà été publié récemment).');

// Texte ≤ 300 caractères, lien compris.
const shown = post.link.replace(/^https?:\/\//, '').replace(/\/$/, '');
let text = post.text;
const tail = `\n${shown}`;
while (len(text + tail) > 300) text = text.replace(/\s*\S+$/, '…').replace(/……$/, '…');
text += tail;

// Image : PNG existant (carte du jour) ou SVG du format rendu en PNG.
async function png() {
  if (!post.svg) return fs.readFileSync(P(post.png));
  const { Resvg } = await import('@resvg/resvg-js');
  const fontFiles = ['Inter-Regular.ttf', 'Inter-SemiBold.ttf', 'Inter-ExtraBold.ttf'].map(f => P('scripts/fonts', f));
  return new Resvg(post.svg, { font: { fontFiles, loadSystemFonts: false, defaultFontFamily: 'Inter' }, fitTo: { mode: 'width', value: 1200 } }).render().asPng();
}

if (DRY) {
  fs.mkdirSync(P('site/share'), { recursive: true });
  try { fs.writeFileSync(P(`site/share/essai-${key}.png`), await png()); } catch (e) { console.log('(image non rendue : ' + e.message + ')'); }
  exit(`essai à blanc, format « ${key} » (${len(text)} car.) :\n${text}`);
}

const enc = new TextEncoder();
const start = enc.encode(text.slice(0, text.lastIndexOf(shown))).length;
const facet = { index: { byteStart: start, byteEnd: start + enc.encode(shown).length }, features: [{ $type: 'app.bsky.richtext.facet#link', uri: post.link }] };

const API = 'https://bsky.social/xrpc/';
async function call(method, body, token, type = 'application/json') {
  const r = await fetch(API + method, { method: 'POST', headers: { 'Content-Type': type, ...(token ? { Authorization: 'Bearer ' + token } : {}) },
    body: type === 'application/json' ? JSON.stringify(body) : body });
  if (!r.ok) throw new Error(`${method} ${r.status} ${await r.text()}`);
  return r.json();
}
try {
  const img = await png();
  const s = await call('com.atproto.server.createSession', { identifier: BSKY_HANDLE, password: BSKY_APP_PASSWORD });
  const { blob } = await call('com.atproto.repo.uploadBlob', img, s.accessJwt, 'image/png');
  const rec = await call('com.atproto.repo.createRecord', { repo: s.did, collection: 'app.bsky.feed.post', record: {
    $type: 'app.bsky.feed.post', text, createdAt: now.toISOString(), langs: ['fr'], facets: [facet],
    embed: { $type: 'app.bsky.embed.images', images: [{ alt: post.alt.slice(0, 1000), image: blob, aspectRatio: { width: 1200, height: 630 } }] } } }, s.accessJwt);
  const history = [...(st.history || []), { at: now.toISOString(), format: key, hash: hash(post.text) }].slice(-30);
  writeJSON(statePath, { day: today, asOf: D.asOf, postedAt: now.toISOString(), uri: rec.uri, format: key, history }, true);
  console.log(`Bluesky : publié (format « ${key} »)`, rec.uri);
} catch (e) {
  console.log('Bluesky : échec (' + e.message.slice(0, 200) + ')');
}
