// Utilitaires partagés : lecture CSV, dates, statistiques.
import fs from 'node:fs';

export function readJSON(p) { return JSON.parse(fs.readFileSync(p, 'utf8')); }
export function writeJSON(p, o, pretty = false) { fs.writeFileSync(p, JSON.stringify(o, null, pretty ? 2 : 0)); }

// Parseur CSV RFC 4180 (guillemets, virgules et retours ligne dans les champs).
export function parseCSV(text) {
  const rows = []; let row = []; let field = ''; let q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else q = false; }
      else field += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.length > 1 || row[0] !== '') rows.push(row);
      row = [];
    } else field += c;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  const head = rows.shift().map(h => h.replace(/^﻿/, '').trim());
  return rows.map(r => Object.fromEntries(head.map((h, i) => [h, (r[i] ?? '').trim()])));
}

export const DAY = 86400000;
export const toDay = s => Math.floor(Date.parse(s.slice(0, 10) + 'T00:00:00Z') / DAY);
export const fromDay = d => new Date(d * DAY).toISOString().slice(0, 10);
export const round1 = x => Math.round(x * 10) / 10;

// Loi normale : tirage (Box-Muller) et fonction de répartition.
// Générateur pseudo-aléatoire à graine (mulberry32) : résultats reproductibles.
let _s = 1;
export function seed(n) { _s = n >>> 0; }
export function rand() { _s = (_s + 0x6D2B79F5) >>> 0; let t = _s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }
export function randn() {
  let u = 0, v = 0;
  while (u === 0) u = rand();
  while (v === 0) v = rand();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}
export function normCdf(x) {
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const d = 0.3989423 * Math.exp(-x * x / 2);
  const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return x > 0 ? 1 - p : p;
}

// Style des images partagées (Bluesky, carte du jour) : thème sombre par défaut.
// config.json → bluesky.style : "dark" (défaut) ou "light" (ancien fond beige).
export function themeSvg(svg, cands = {}, style = 'dark') {
  if (style === 'light') return svg;
  const map = { '#fbf7f1': '#14121c', '#15131f': '#f5f3fb', '#7d788c': '#a59fba', '#4a4659': '#d4cfe3', '#e6dfd4': '#2f2b3d',
    '#5b2cff': '#a48bff', '#d23a5f': '#ff6b8e', '#0f8a5f': '#3ddc97' };
  let out = svg;
  // Couleurs des candidats : version plus lumineuse prévue pour les fonds sombres.
  for (const k of Object.values(cands)) if (k && k.color && k.colorDark) out = out.split(`"${k.color}"`).join(`"${k.colorDark}"`);
  for (const [a, b] of Object.entries(map)) out = out.replace(new RegExp(`"${a}"`, 'gi'), `"${b}"`);
  // Fond : halo discret aux couleurs de la marque + liseré dégradé plus épais.
  out = out.replace(/<rect width="1200" height="630" fill="#14121c"\/>/,
    `<defs><radialGradient id="glow1" cx="1" cy="0" r=".9"><stop offset="0" stop-color="#5b2cff" stop-opacity=".32"/><stop offset="1" stop-color="#5b2cff" stop-opacity="0"/></radialGradient>
    <radialGradient id="glow2" cx="0" cy="1" r=".8"><stop offset="0" stop-color="#ff3d7f" stop-opacity=".18"/><stop offset="1" stop-color="#ff3d7f" stop-opacity="0"/></radialGradient></defs>
    <rect width="1200" height="630" fill="#14121c"/><rect width="1200" height="630" fill="url(#glow1)"/><rect width="1200" height="630" fill="url(#glow2)"/>`)
    .replace(/<rect width="1200" height="10" fill="url\(#g\)"\/>/, '<rect width="1200" height="12" fill="url(#g)"/>');
  return out;
}
