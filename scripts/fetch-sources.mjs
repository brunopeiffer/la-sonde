// Synchronise la base ouverte MieuxVoter (compilation des notices de la Commission des sondages, licence MIT).
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const BASE = 'https://raw.githubusercontent.com/MieuxVoter/presidentielle2027/main/';
const FILES = { 'presidentielle2027.csv': 'mieuxvoter_presidentielle2027.csv', 'candidats.csv': 'mieuxvoter_candidats.csv' };

for (const [src, dst] of Object.entries(FILES)) {
  try {
    const r = await fetch(BASE + src);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const text = await r.text();
    if (text.split('\n').length < 10) throw new Error('fichier anormalement court');
    fs.writeFileSync(path.join(ROOT, 'data/sources', dst), text);
    console.log(`✔ ${dst} (${text.split('\n').length} lignes)`);
  } catch (e) {
    console.warn(`⚠ ${src} non mis à jour : ${e.message} — on garde la version précédente.`);
  }
}
