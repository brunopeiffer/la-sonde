// La Sonde — « Les 3 signaux du jour ».
// On génère tous les faits possibles, on les note selon leur intérêt pour le lecteur, et on garde les 3 meilleurs
// (types différents, pas deux fois le même candidat). Un fait sans enjeu (« conforme à la moyenne ») n'est jamais retenu.
import { round1 } from './lib.mjs';

const LANGS = ['fr', 'en', 'de', 'es', 'it'];
const f = (x, l, d = 1) => l === 'en' ? x.toFixed(d) : x.toFixed(d).replace('.', ',');
const P = (x, l, d = 1) => f(x, l, d) + (l === 'en' || l === 'it' ? '%' : ' %');
const pts = { fr: 'pt', en: 'pts', de: 'Pkt.', es: 'pts', it: 'punti' };
const sg = (x, l) => (x > 0 ? '+' : x < 0 ? '−' : '±') + f(Math.abs(x), l) + ' ' + pts[l];
const ord = (n, l) => ({ fr: n === 1 ? '1re' : n + 'e', en: ['', '1st', '2nd', '3rd'][n] || n + 'th', de: n + '.', es: n + '.º', it: n + '°' })[l];
const T = fn => Object.fromEntries(LANGS.map(l => [l, fn(l)]));

export function signals({ MOM, cross, dec, hist, today, qualify, nm, features, fmtDate, standings, FR, G, transfers, open }) {
  const S = [];
  const main = standings.filter(s => s.presence >= 30);
  const nowI = FR.lastPoll - FR.start;
  const val = (c, i) => { const x = FR.trends[c] && FR.trends[c][i]; return x ? x.v : null; };
  const day = i => new Date((FR.start + i) * 864e5).toISOString().slice(0, 10);
  const rankOf = c => standings.findIndex(s => s.c === c) + 1;

  // 1. Dépassement réel sur 30 jours (changement de place parmi les 6 premiers)
  for (let i = 0; i < Math.min(6, main.length); i++) for (let j = i + 1; j < Math.min(6, main.length); j++) {
    const A = main[i], B = main[j], a0 = val(A.c, nowI - 30), b0 = val(B.c, nowI - 30);
    if (a0 == null || b0 == null || a0 >= b0) continue;              // A était derrière B il y a 30 jours, il est devant aujourd'hui
    const gap = A.v - B.v, place = rankOf(A.c), sig = gap > 1.96 * Math.sqrt(A.band ** 2 + B.band ** 2);
    S.push({ k: 'swap', cs: [A.c, B.c], score: 9 - place + (sig ? 2 : 0), t: T(l => ({
      fr: `${nm(A.c)} a dépassé ${nm(B.c)} en un mois et prend la ${ord(place, l)} place (${P(A.v, l)} contre ${P(B.v, l)}).${sig ? '' : ' Écart encore dans la marge d\'erreur : rien n\'est acquis.'}`,
      en: `${nm(A.c)} has overtaken ${nm(B.c)} this month and moves into ${ord(place, l)} place (${P(A.v, l)} vs ${P(B.v, l)}).${sig ? '' : ' The gap is still within the margin of error.'}`,
      de: `${nm(A.c)} hat ${nm(B.c)} binnen eines Monats überholt und liegt nun auf Platz ${ord(place, l)} (${P(A.v, l)} gegenüber ${P(B.v, l)}).${sig ? '' : ' Der Abstand liegt noch in der Fehlermarge.'}`,
      es: `${nm(A.c)} ha adelantado a ${nm(B.c)} en un mes y pasa al ${ord(place, l)} puesto (${P(A.v, l)} frente a ${P(B.v, l)}).${sig ? '' : ' La diferencia sigue dentro del margen de error.'}`,
      it: `${nm(A.c)} ha superato ${nm(B.c)} in un mese e sale al ${ord(place, l)} posto (${P(A.v, l)} contro ${P(B.v, l)}).${sig ? '' : ' Lo scarto è ancora nel margine d\'errore.'}`
    })[l]) });
  }

  // 2. La course à la qualification se resserre ou s'écarte (2e / 3e place)
  if (main.length >= 3) {
    const [, B, C] = main, g = B.v - C.v, b0 = val(B.c, nowI - 30), c0 = val(C.c, nowI - 30);
    if (b0 != null && c0 != null) {
      const g0 = b0 - c0, d = g - g0;
      if (Math.abs(d) >= 1.5 && g0 > 0) S.push({ k: 'gap', cs: [B.c, C.c], score: 7 + Math.min(2, Math.abs(d) / 2), t: T(l => ({
        fr: d < 0 ? `La bataille pour le second tour se resserre : l'écart entre ${nm(B.c)} et ${nm(C.c)} est passé de ${f(g0, l)} à ${f(g, l)} pt en un mois.` : `${nm(B.c)} creuse l'écart sur ${nm(C.c)} pour la 2e place : ${f(g, l)} pt, contre ${f(g0, l)} il y a un mois.`,
        en: d < 0 ? `The fight for the run-off is tightening: the gap between ${nm(B.c)} and ${nm(C.c)} fell from ${f(g0, l)} to ${f(g, l)} pts in a month.` : `${nm(B.c)} is pulling away from ${nm(C.c)} for 2nd place: ${f(g, l)} pts, up from ${f(g0, l)} a month ago.`,
        de: d < 0 ? `Der Kampf um die Stichwahl wird enger: Der Abstand zwischen ${nm(B.c)} und ${nm(C.c)} sank binnen eines Monats von ${f(g0, l)} auf ${f(g, l)} Pkt.` : `${nm(B.c)} baut den Vorsprung auf ${nm(C.c)} um Platz 2 aus: ${f(g, l)} Pkt., nach ${f(g0, l)} vor einem Monat.`,
        es: d < 0 ? `La pugna por la segunda vuelta se estrecha: la diferencia entre ${nm(B.c)} y ${nm(C.c)} ha pasado de ${f(g0, l)} a ${f(g, l)} pts en un mes.` : `${nm(B.c)} se distancia de ${nm(C.c)} en la lucha por el 2.º puesto: ${f(g, l)} pts, frente a ${f(g0, l)} hace un mes.`,
        it: d < 0 ? `La lotta per il ballottaggio si fa serrata: lo scarto tra ${nm(B.c)} e ${nm(C.c)} è sceso da ${f(g0, l)} a ${f(g, l)} punti in un mese.` : `${nm(B.c)} allunga su ${nm(C.c)} per il 2° posto: ${f(g, l)} punti, contro ${f(g0, l)} un mese fa.`
      })[l]) });
    }
  }

  // 3. Mouvement net, avec record éventuel (« plus haut depuis… »)
  for (const s of main) {
    const m = MOM[s.c]; if (!m || (m.state !== 'up' && m.state !== 'down')) continue;
    const up = m.state === 'up', z = Math.abs(m.slope / m.se);
    let since = null, i = nowI - 14;
    while (i >= 0) { const v = val(s.c, i); if (v != null && (up ? v >= s.v : v <= s.v)) break; i--; }
    if (i < nowI - 60) since = i < 0 ? 'start' : day(i);
    const rec = since ? T(l => ({
      fr: since === 'start' ? ` C'est son ${up ? 'meilleur' : 'plus bas'} niveau depuis le début de nos relevés.` : ` ${up ? 'Plus haut' : 'Plus bas'} niveau depuis le ${fmtDate(since, 'fr')}.`,
      en: since === 'start' ? ` Its ${up ? 'highest' : 'lowest'} level since our records began.` : ` ${up ? 'Highest' : 'Lowest'} level since ${fmtDate(since, 'en')}.`,
      de: since === 'start' ? ` Der ${up ? 'höchste' : 'tiefste'} Stand seit Beginn unserer Erhebung.` : ` ${up ? 'Höchster' : 'Tiefster'} Stand seit dem ${fmtDate(since, 'de')}.`,
      es: since === 'start' ? ` Es su nivel más ${up ? 'alto' : 'bajo'} desde que empezamos a medir.` : ` Su nivel más ${up ? 'alto' : 'bajo'} desde el ${fmtDate(since, 'es')}.`,
      it: since === 'start' ? ` È il livello più ${up ? 'alto' : 'basso'} da quando lo misuriamo.` : ` Livello più ${up ? 'alto' : 'basso'} dal ${fmtDate(since, 'it')}.`
    })[l]) : T(() => '');
    S.push({ k: up ? 'up' : 'down', cs: [s.c], score: 5 + Math.min(3, z / 2) + (since ? 2 : 0) + (rankOf(s.c) <= 3 ? 1 : 0), t: T(l => ({
      fr: `${nm(s.c)} ${up ? 'progresse' : 'recule'} nettement : ${sg(m.d14, l)} en deux semaines, à ${P(s.v, l)}.`,
      en: `${nm(s.c)} is clearly ${up ? 'rising' : 'falling'}: ${sg(m.d14, l)} in two weeks, now at ${P(s.v, l)}.`,
      de: `${nm(s.c)} ${up ? 'legt deutlich zu' : 'verliert deutlich'}: ${sg(m.d14, l)} in zwei Wochen, jetzt ${P(s.v, l)}.`,
      es: `${nm(s.c)} ${up ? 'sube' : 'baja'} con claridad: ${sg(m.d14, l)} en dos semanas, hasta el ${P(s.v, l)}.`,
      it: `${nm(s.c)} ${up ? 'cresce' : 'cala'} nettamente: ${sg(m.d14, l)} in due settimane, ora al ${P(s.v, l)}.`
    })[l] + rec[l]) });
  }

  // 4. Probabilité de qualification qui bouge fort en une semaine
  const ref = (hist || []).filter(x => x.d <= shift(today, -6)).pop();
  if (features.probabilities && ref && ref.q) for (const q of qualify) {
    if (ref.q[q.c] == null) continue; const d = q.p - ref.q[q.c]; if (Math.abs(d) < 5) continue;
    S.push({ k: 'proba', cs: [q.c], score: 6 + Math.min(3, Math.abs(d) / 5), t: T(l => ({
      fr: `Les chances de ${nm(q.c)} d'accéder au second tour ${d > 0 ? 'bondissent' : 'chutent'} : ${f(q.p, l, 0)} % (${d > 0 ? '+' : '−'}${f(Math.abs(d), l, 0)} pts en une semaine).`,
      en: `${nm(q.c)}'s chances of reaching the run-off ${d > 0 ? 'jump' : 'drop'} to ${f(q.p, l, 0)}% (${d > 0 ? '+' : '−'}${f(Math.abs(d), l, 0)} pts in a week).`,
      de: `Die Chancen von ${nm(q.c)} auf die Stichwahl ${d > 0 ? 'steigen sprunghaft' : 'brechen ein'}: ${f(q.p, l, 0)} % (${d > 0 ? '+' : '−'}${f(Math.abs(d), l, 0)} Pkt. in einer Woche).`,
      es: `Las opciones de ${nm(q.c)} de llegar a la segunda vuelta ${d > 0 ? 'se disparan' : 'se desploman'}: ${f(q.p, l, 0)} % (${d > 0 ? '+' : '−'}${f(Math.abs(d), l, 0)} pts en una semana).`,
      it: `Le probabilità di ${nm(q.c)} di arrivare al ballottaggio ${d > 0 ? 'balzano' : 'crollano'} al ${f(q.p, l, 0)}% (${d > 0 ? '+' : '−'}${f(Math.abs(d), l, 0)} punti in una settimana).`
    })[l]) });
  }

  // 5. Bascule possible dans le mois (seulement si la probabilité est sérieuse)
  for (const x of cross) {
    if (x.rank > 5 || (x.p < 30 && !(x.rank === 2 && x.p >= 20))) continue;
    S.push({ k: 'swap', cs: [x.a, x.b], score: 3 + x.p / 15 + (x.rank === 2 ? 3 : x.rank === 3 ? 1 : 0), t: T(l => ({
      fr: `${x.rank === 2 ? 'Le second tour se joue à un fil' : `Duel serré pour la ${ord(x.rank, l)} place`} : ${nm(x.a)} et ${nm(x.b)} sont séparés de ${f(x.gap, l)} pt. Si les tendances se prolongent, ${x.p} % de chances qu'ils s'inversent d'ici un mois.`,
      en: `${x.rank === 2 ? 'The run-off hangs by a thread' : `Tight race for ${ord(x.rank, l)} place`}: ${nm(x.a)} and ${nm(x.b)} are ${f(x.gap, l)} pts apart. If trends hold, a ${x.p}% chance they swap within a month.`,
      de: `${x.rank === 2 ? 'Die Stichwahl hängt an einem Faden' : `Knappes Rennen um Platz ${ord(x.rank, l)}`}: ${nm(x.a)} und ${nm(x.b)} trennen ${f(x.gap, l)} Pkt. Halten die Trends an, tauschen sie mit ${x.p} % Wahrscheinlichkeit binnen eines Monats die Plätze.`,
      es: `${x.rank === 2 ? 'La segunda vuelta pende de un hilo' : `Duelo ajustado por el ${ord(x.rank, l)} puesto`}: ${nm(x.a)} y ${nm(x.b)} están separados por ${f(x.gap, l)} pts. Si las tendencias siguen, un ${x.p} % de probabilidad de que se crucen en un mes.`,
      it: `${x.rank === 2 ? 'Il ballottaggio è appeso a un filo' : `Corsa serrata per il ${ord(x.rank, l)} posto`}: ${nm(x.a)} e ${nm(x.b)} sono separati da ${f(x.gap, l)} punti. Se le tendenze continuano, ${x.p}% di probabilità che si scambino di posto entro un mese.`
    })[l]) });
  }

  // 6. Un retrait qui changerait la donne (reports mesurés dans les sondages)
  for (const tr of transfers || []) {
    const out = standings.find(s => s.c === tr.c); if (!out) continue;
    const after = standings.filter(s => s.c !== tr.c).map(s => ({ c: s.c, v: s.v + ((tr.flows.find(f => f.c === s.c) || {}).pts || 0) })).sort((a, b) => b.v - a.v);
    const before = standings.filter(s => s.c !== tr.c).map(s => s.c);
    const top = tr.flows[0]; if (!top || top.pct < 35) continue;
    const winner = after.find(x => x.c === top.c), rNew = after.indexOf(winner) + 1, rOld = before.indexOf(top.c) + 1;
    const changes = rNew < rOld && rNew <= 3;
    S.push({ k: 'transfer', cs: [tr.c, top.c], score: changes ? 6 + (4 - rNew) * 0.5 : 3.5, t: T(l => ({
      fr: `Et si ${nm(tr.c)} se retirait ? D'après les sondages qui testent les deux hypothèses, ${top.pct} % de ses électeurs iraient à ${nm(top.c)}, qui monterait à ${P(winner.v, l)}${changes ? ` et passerait ${ord(rNew, l)}` : ''}.`,
      en: `What if ${nm(tr.c)} dropped out? Polls testing both scenarios suggest ${top.pct}% of their voters would go to ${nm(top.c)}, rising to ${P(winner.v, l)}${changes ? ` and moving into ${ord(rNew, l)} place` : ''}.`,
      de: `Und wenn ${nm(tr.c)} zurückträte? Laut den Umfragen, die beide Szenarien testen, gingen ${top.pct} % der Wähler zu ${nm(top.c)}, der auf ${P(winner.v, l)} käme${changes ? ` und auf Platz ${ord(rNew, l)} vorrückte` : ''}.`,
      es: `¿Y si ${nm(tr.c)} se retirara? Según las encuestas que prueban ambos escenarios, el ${top.pct} % de sus votantes iría a ${nm(top.c)}, que subiría al ${P(winner.v, l)}${changes ? ` y pasaría al ${ord(rNew, l)} puesto` : ''}.`,
      it: `E se ${nm(tr.c)} si ritirasse? Secondo i sondaggi che testano entrambi gli scenari, il ${top.pct}% dei suoi elettori andrebbe a ${nm(top.c)}, che salirebbe al ${P(winner.v, l)}${changes ? ` passando al ${ord(rNew, l)} posto` : ''}.`
    })[l]) });
  }

  // 7. Un sondage qui détonne (seulement s'il s'écarte vraiment, après correction)
  if (dec && dec.sameList && dec.outlier && Math.abs(dec.outlier.diff) >= 2) {
    const o = dec.outlier;
    S.push({ k: 'poll', cs: [o.c], score: 4 + Math.min(3, Math.abs(o.diff) - 1), t: T(l => ({
      fr: `Sondage à contre-courant : ${dec.inst} (${fmtDate(dec.end, 'fr')}) place ${nm(o.c)} ${f(Math.abs(o.diff), l)} pt ${o.diff > 0 ? 'au-dessus' : 'en dessous'} de la moyenne, même corrigé de ses habitudes. Signal faible ou début de tendance : à confirmer.`,
      en: `Against the tide: ${dec.inst} (${fmtDate(dec.end, 'en')}) puts ${nm(o.c)} ${f(Math.abs(o.diff), l)} pts ${o.diff > 0 ? 'above' : 'below'} the average, even after adjusting for its usual lean. Noise or a new trend: needs confirming.`,
      de: `Umfrage gegen den Trend: ${dec.inst} (${fmtDate(dec.end, 'de')}) sieht ${nm(o.c)} ${f(Math.abs(o.diff), l)} Pkt. ${o.diff > 0 ? 'über' : 'unter'} dem Durchschnitt, selbst nach Bereinigung. Ausreißer oder neuer Trend: noch zu bestätigen.`,
      es: `Encuesta a contracorriente: ${dec.inst} (${fmtDate(dec.end, 'es')}) sitúa a ${nm(o.c)} ${f(Math.abs(o.diff), l)} pts ${o.diff > 0 ? 'por encima' : 'por debajo'} de la media, incluso corregida. ¿Ruido o nueva tendencia? Falta confirmarlo.`,
      it: `Sondaggio controcorrente: ${dec.inst} (${fmtDate(dec.end, 'it')}) colloca ${nm(o.c)} ${f(Math.abs(o.diff), l)} punti ${o.diff > 0 ? 'sopra' : 'sotto'} la media, anche dopo la correzione. Rumore o nuova tendenza: da confermare.`
    })[l]) });
  }

  // 8. Mise en perspective avec 2022 (toujours disponible, instructif)
  if (G && G.series) {
    const daysOut = G.daysToR1;
    const idx = G.daysBack.reduce((b, d, i) => Math.abs(d - daysOut) < Math.abs(G.daysBack[b] - daysOut) ? i : b, 0);
    const rows = Object.entries(G.series).map(([name, s]) => ({ name, v: s.v[idx], r: s.result })).filter(x => x.v != null && Math.max(x.v, x.r) >= 5);
    const big = rows.sort((a, b) => Math.abs(b.r - b.v) - Math.abs(a.r - a.v))[0];
    if (big && Math.abs(big.r - big.v) >= 4) {
      S.push({ k: 'ghost', cs: [], score: 4.2, t: T(l => ({
        fr: `Rien n'est joué : à ${daysOut} jours du vote en 2022, ${big.name} était à ${P(big.v, l)} dans la moyenne. Résultat final : ${P(big.r, l)}.`,
        en: `Nothing is settled: ${daysOut} days before the 2022 vote, ${big.name} averaged ${P(big.v, l)}. The final result was ${P(big.r, l)}.`,
        de: `Nichts ist entschieden: ${daysOut} Tage vor der Wahl 2022 lag ${big.name} im Schnitt bei ${P(big.v, l)}. Am Ende waren es ${P(big.r, l)}.`,
        es: `Nada está decidido: a ${daysOut} días de la votación de 2022, ${big.name} tenía un ${P(big.v, l)} de media. Acabó con un ${P(big.r, l)}.`,
        it: `Niente è deciso: a ${daysOut} giorni dal voto del 2022, ${big.name} era in media al ${P(big.v, l)}. Ha chiuso al ${P(big.r, l)}.`
      })[l]) });
    }
    // Le favori d'aujourd'hui comparé au favori de 2022 à la même date
    const lead22 = Object.entries(G.series).map(([name, s]) => ({ name, v: s.v[idx] })).filter(x => x.v != null).sort((a, b) => b.v - a.v)[0];
    const lead = main[0];
    if (lead22 && lead && Math.abs(lead.v - lead22.v) >= 4) S.push({ k: 'ghost', cs: [lead.c], score: 3.8, t: T(l => ({
      fr: `${nm(lead.c)} (${P(lead.v, l)}) fait ${f(Math.abs(lead.v - lead22.v), l, 0)} points ${lead.v > lead22.v ? 'de mieux' : 'de moins'} que ${lead22.name}, en tête à la même date en 2022 (${P(lead22.v, l)}).`,
      en: `${nm(lead.c)} (${P(lead.v, l)}) is ${f(Math.abs(lead.v - lead22.v), l, 0)} points ${lead.v > lead22.v ? 'above' : 'below'} ${lead22.name}, who led at the same point in 2022 (${P(lead22.v, l)}).`,
      de: `${nm(lead.c)} (${P(lead.v, l)}) liegt ${f(Math.abs(lead.v - lead22.v), l, 0)} Punkte ${lead.v > lead22.v ? 'über' : 'unter'} ${lead22.name}, der 2022 zum selben Zeitpunkt führte (${P(lead22.v, l)}).`,
      es: `${nm(lead.c)} (${P(lead.v, l)}) supera en ${f(Math.abs(lead.v - lead22.v), l, 0)} puntos a ${lead22.name}, líder en la misma fecha de 2022 (${P(lead22.v, l)}).`,
      it: `${nm(lead.c)} (${P(lead.v, l)}) fa ${f(Math.abs(lead.v - lead22.v), l, 0)} punti ${lead.v > lead22.v ? 'in più' : 'in meno'} di ${lead22.name}, in testa alla stessa data nel 2022 (${P(lead22.v, l)}).`
    })[l]) });
  }

  // Sélection : les 3 meilleurs, types différents, sans répéter un candidat
  S.sort((a, b) => b.score - a.score);
  if (process.env.DEBUG_SIGNALS) S.forEach(s => console.log('  signal', s.k, s.score.toFixed(1), s.t.fr));
  const pick = [], kinds = new Set(), seen = new Set();
  for (const s of S) {
    if (pick.length === 3) break;
    const k = s.k === 'up' || s.k === 'down' ? 'move' : s.k;
    if (kinds.has(k)) continue;
    if (s.cs.length && seen.has(s.cs[0])) continue;
    pick.push(s); kinds.add(k); s.cs.forEach(c => seen.add(c));
  }
  const out = Object.fromEntries(LANGS.map(l => [l, pick.map(s => ({ k: s.k === 'gap' ? 'swap' : s.k, c: s.cs[0], t: s.t[l], score: round1(s.score) }))]));
  return out;
}
const shift = (d, n) => { const t = new Date(d + 'T00:00:00Z'); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); };
