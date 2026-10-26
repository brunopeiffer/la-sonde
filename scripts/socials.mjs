// La Sonde — fiches candidats : comptes officiels (Wikidata) et « curiosité du public » (consultations Wikipédia).
// Gratuit, sans clé. Relevé au plus une fois par jour, résultat dans data/socials.json (fusionné dans les fiches par pages.mjs).
// Corrections manuelles : config.json → socials.overrides, ex. { "DL": { "x": "davidlisnard", "tiktok": null } } (null = masquer)
// et socials.wiki pour imposer le titre d'article Wikipédia, ex. { "FR": "François Ruffin" }.
import fs from 'node:fs';
import path from 'node:path';
import { readJSON, writeJSON } from './lib.mjs';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const P = (...a) => path.join(ROOT, ...a);
const UA = { 'User-Agent': 'LaSondeBot/1.0 (https://la-sonde.fr; contact@la-sonde.fr)', 'Api-User-Agent': 'LaSondeBot/1.0 (contact@la-sonde.fr)' };
const OUT = P('data/socials.json');
const log = (...a) => console.log('[réseaux]', ...a);
// Propriétés Wikidata des comptes officiels.
const PROPS = { x: 'P2002', instagram: 'P2003', tiktok: 'P7085', facebook: 'P2013', youtube: 'P2397', bluesky: 'P12361', site: 'P856' };
export const URLS = { x: h => `https://x.com/${h}`, instagram: h => `https://www.instagram.com/${h}/`, tiktok: h => `https://www.tiktok.com/@${h}`,
  facebook: h => `https://www.facebook.com/${h}`, youtube: h => `https://www.youtube.com/channel/${h}`, bluesky: h => `https://bsky.app/profile/${h}`, site: h => h };

const J = async u => { const r = await fetch(u, { headers: UA }); if (!r.ok) throw new Error(`HTTP ${r.status} ${u.slice(0, 80)}`); return r.json(); };
const ymd = d => d.toISOString().slice(0, 10).replace(/-/g, '');

export async function refreshSocials({ force = false } = {}) {
  const old = fs.existsSync(OUT) ? readJSON(OUT) : { cands: {} };
  if (!force && old.updated && Date.now() - Date.parse(old.updated) < 20 * 3600e3) return old;
  const D = readJSON(P('site/data/site.json')), cfg = readJSON(P('config.json')), S = cfg.socials || {};
  const out = { updated: new Date().toISOString(), cands: {} };
  const end = new Date(Date.now() - 864e5), start = new Date(end - 119 * 864e5);
  let ok = 0;
  for (const [c, K] of Object.entries(D.cands)) {
    if (!K.slug) continue;
    const prev = old.cands?.[c] || {};
    const rec = { wiki: (S.wiki || {})[c] || prev.wiki || K.name, qid: prev.qid || null, links: prev.links || {}, views: prev.views || null };
    try {
      // 1. Article Wikipédia (redirections suivies) → identifiant Wikidata.
      const q = await J(`https://fr.wikipedia.org/w/api.php?action=query&format=json&redirects=1&prop=pageprops&titles=${encodeURIComponent(rec.wiki)}`);
      const pg = Object.values(q.query?.pages || {})[0];
      if (!pg || pg.missing !== undefined || pg.pageprops?.disambiguation !== undefined) throw new Error(`article introuvable ou ambigu : ${rec.wiki}`);
      rec.wiki = pg.title; rec.qid = pg.pageprops?.wikibase_item || rec.qid;
      // 2. Comptes officiels déclarés sur Wikidata (valeur la mieux classée, non dépréciée).
      if (rec.qid) {
        const e = (await J(`https://www.wikidata.org/wiki/Special:EntityData/${rec.qid}.json`)).entities[rec.qid];
        const links = {};
        for (const [k, p] of Object.entries(PROPS)) {
          const cl = (e.claims?.[p] || []).filter(x => x.rank !== 'deprecated' && x.mainsnak?.datavalue);
          const best = cl.find(x => x.rank === 'preferred') || cl[0];
          if (best) links[k] = String(best.mainsnak.datavalue.value);
        }
        rec.links = links;
      }
      // 3. Consultations quotidiennes de l'article (utilisateurs humains, hors robots identifiés), 120 jours.
      const v = await J(`https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/fr.wikipedia/all-access/user/${encodeURIComponent(rec.wiki.replace(/ /g, '_'))}/daily/${ymd(start)}/${ymd(end)}`);
      rec.views = (v.items || []).map(x => [`${x.timestamp.slice(0, 4)}-${x.timestamp.slice(4, 6)}-${x.timestamp.slice(6, 8)}`, x.views]);
      ok++;
    } catch (e) { log(c, e.message); }
    // Corrections manuelles en dernier (null = masquer le compte).
    for (const [k, h] of Object.entries((S.overrides || {})[c] || {})) { if (h == null) delete rec.links[k]; else rec.links[k] = h; }
    out.cands[c] = rec;
    await new Promise(r => setTimeout(r, 150));
  }
  if (!ok) { log('aucune donnée relevée : on garde la version précédente'); return old; }
  writeJSON(OUT, out, true);
  log(`${ok} candidat(s) mis à jour`);
  return out;
}

// Résumé d'une série : moyenne 7 jours, évolution 30 j vs 30 j précédents, pics (avec l'événement du jour s'il existe).
export function attention(views, events = [], c = null) {
  if (!views || views.length < 60) return null;
  const v = views.map(x => x[1]);
  const sm = v.map((_, i) => { const w = v.slice(Math.max(0, i - 6), i + 1); return w.reduce((a, b) => a + b, 0) / w.length; });
  const avg = a => a.reduce((x, y) => x + y, 0) / (a.length || 1);
  const last30 = avg(v.slice(-30)), prev30 = avg(v.slice(-60, -30));
  const med = [...v.slice(-90)].sort((a, b) => a - b)[Math.floor(Math.min(90, v.length) / 2)] || 1;
  const peaks = views.map((x, i) => ({ date: x[0], v: x[1], i })).slice(-90).filter(p => p.v >= Math.max(3 * med, med + 300))
    .sort((a, b) => b.v - a.v).filter((p, k, arr) => arr.findIndex(q => Math.abs(q.i - p.i) <= 3) === k).slice(0, 3)
    .map(p => ({ date: p.date, v: p.v, ev: events.find(e => (!c || e.c === c || !e.c) && Math.abs(Date.parse(e.date) - Date.parse(p.date)) <= 1.5 * 864e5) || null }))
    .sort((a, b) => a.date.localeCompare(b.date));
  const dd = views.slice(-90), off = views.length - dd.length;
  return { days: dd.map((x, i) => [x[0], x[1], Math.round(sm[off + i])]), last30: Math.round(last30), prev30: Math.round(prev30),
    chg: prev30 > 0 ? Math.round((last30 / prev30 - 1) * 100) : null, med, peaks };
}

if (import.meta.url === `file://${process.argv[1]}`) await refreshSocials({ force: !!process.env.FORCE });
