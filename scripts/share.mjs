// La Sonde — image du jour à partager (1200 × 630) : site/share/carte-du-jour.png (+ .svg)
// Rendu PNG avec @resvg/resvg-js (installé à la volée par le workflow). Sans lui, seul le SVG est produit.
import fs from 'node:fs';
import path from 'node:path';
import { readJSON } from './lib.mjs';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const P = (...a) => path.join(ROOT, ...a);
const D = readJSON(P('site/data/site.json'));
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const f1 = x => x.toFixed(1).replace('.', ',');
const sg = x => (x > 0 ? '+' : x < 0 ? '−' : '±') + f1(Math.abs(x));
const date = new Date(D.asOf + 'T12:00:00Z').toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
const MOM = D.momentum || {};

export function cardSVG() {
  const W = 1200, H = 630;
  const top = (() => { const d = D.standings.filter(s => s.declared); const t = d.filter(s => s.v >= 5); return (t.length >= 4 ? t : d.slice(0, 4)).slice(0, 8); })(); // même règle que le site : candidats déclarés à 5 % ou plus
  const max = Math.max(...top.map(s => s.v));
  const x0 = 250, bw = 340, y0 = 168, rh = 50;
  const rows = top.map((s, i) => {
    const y = y0 + i * rh, w = Math.max(6, s.v / max * bw), m = MOM[s.c] || {}, col = D.cands[s.c].color;
    const arrow = m.state === 'up' ? `<text x="${x0 + w + 92}" y="${y + 25}" font-size="20" font-weight="800" fill="#0f8a5f">▲ ${sg(m.d14)}</text>`
      : m.state === 'down' ? `<text x="${x0 + w + 92}" y="${y + 25}" font-size="20" font-weight="800" fill="#d23a5f">▼ ${sg(m.d14)}</text>` : '';
    return `<circle cx="70" cy="${y + 18}" r="8" fill="${col}"/>
      <text x="88" y="${y + 25}" font-size="22" font-weight="600" fill="#15131f">${esc(D.cands[s.c].short)}</text>
      <rect x="${x0}" y="${y + 6}" width="${w}" height="24" rx="12" fill="${col}"/>
      <text x="${x0 + w + 12}" y="${y + 26}" font-size="24" font-weight="800" fill="#15131f">${f1(s.v)} %</text>${arrow}`;
  }).join('');
  const O = D.openness, X = (D.crossings || [])[0];
  const right = 820;
  const side = [];
  if (O && D.features.probabilities !== false) side.push(`
    <text x="${right}" y="200" font-size="18" font-weight="600" fill="#7d788c" letter-spacing="1.5">BAROMÈTRE D'INCERTITUDE</text>
    <text x="${right}" y="268" font-size="72" font-weight="800" fill="#5b2cff">${O.open} %</text>
    <text x="${right}" y="300" font-size="20" font-weight="600" fill="#4a4659">de chances que le duel final</text>
    <text x="${right}" y="326" font-size="20" font-weight="600" fill="#4a4659">ne soit pas ${esc(D.cands[O.duo[0]].short)} – ${esc(D.cands[O.duo[1]].short)}</text>`);
  if (X) side.push(`
    <text x="${right}" y="400" font-size="18" font-weight="600" fill="#7d788c" letter-spacing="1.5">BASCULE POSSIBLE</text>
    <text x="${right}" y="440" font-size="26" font-weight="800" fill="#15131f">${esc(D.cands[X.a].short)} / ${esc(D.cands[X.b].short)}</text>
    <text x="${right}" y="472" font-size="20" font-weight="600" fill="#4a4659">${X.p} % de chances d'inversion</text>
    <text x="${right}" y="498" font-size="20" font-weight="600" fill="#4a4659">d'ici un mois (${X.rank}e et ${X.rank + 1}e places)</text>`);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="Inter">
  <defs><linearGradient id="g" x1="0" x2="1"><stop offset="0" stop-color="#5b2cff"/><stop offset=".6" stop-color="#ff3d7f"/><stop offset="1" stop-color="#ff8a00"/></linearGradient></defs>
  <rect width="${W}" height="${H}" fill="#fbf7f1"/>
  <rect width="${W}" height="10" fill="url(#g)"/>
  <rect x="56" y="44" width="52" height="52" rx="15" fill="url(#g)"/>
  <circle cx="82" cy="70" r="5.5" fill="#fff"/><circle cx="82" cy="70" r="13" fill="none" stroke="#fff" stroke-width="3.5" opacity=".85"/><circle cx="82" cy="70" r="20.5" fill="none" stroke="#fff" stroke-width="3" opacity=".45"/>
  <text x="124" y="82" font-size="36" font-weight="800" fill="#15131f">La Sonde</text>
  <text x="56" y="140" font-size="24" font-weight="600" fill="#4a4659">Présidentielle 2027 · moyenne des sondages au ${esc(date)}</text>
  <line x1="${right - 40}" y1="168" x2="${right - 40}" y2="560" stroke="#e6dfd4" stroke-width="2"/>
  ${rows}
  ${side.join('')}
  <text x="56" y="600" font-size="18" font-weight="600" fill="#7d788c">Moyenne corrigée des effets instituts · ▲▼ tendance nette sur 14 jours · ce n'est pas un sondage</text>
  <text x="${W - 56}" y="600" font-size="22" font-weight="800" fill="#5b2cff" text-anchor="end">la-sonde.fr</text>
</svg>`;
}

const svg = cardSVG();
fs.mkdirSync(P('site/share'), { recursive: true });
fs.writeFileSync(P('site/share/carte-du-jour.svg'), svg);
try {
  const { Resvg } = await import('@resvg/resvg-js');
  const fontFiles = ['Inter-Regular.ttf', 'Inter-SemiBold.ttf', 'Inter-ExtraBold.ttf'].map(f => P('scripts/fonts', f));
  const png = new Resvg(svg, { font: { fontFiles, loadSystemFonts: true, defaultFontFamily: 'Inter' }, fitTo: { mode: 'width', value: 1200 } }).render().asPng();
  fs.writeFileSync(P('site/share/carte-du-jour.png'), png);
  console.log('Image du jour : site/share/carte-du-jour.png');
  // L'aperçu des partages de la page d'accueil montre la carte du jour.
  const idx = P('site/index.html'), html = fs.readFileSync(idx, 'utf8');
  const base = D.site.url.replace(/\/$/, '');
  const fixed = html.replace(/<meta property="og:image" content="[^"]*">/, `<meta property="og:image" content="${base}/share/carte-du-jour.png">`);
  if (fixed !== html) fs.writeFileSync(idx, fixed);
} catch (e) {
  console.log('Image du jour : SVG seulement (resvg indisponible : ' + e.message.split('\n')[0] + ')');
}
