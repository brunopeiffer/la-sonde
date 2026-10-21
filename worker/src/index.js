// La Sonde — serveur du « Vote des internautes » pendant les débats.
// Cloudflare Worker + un Durable Object par débat (compteurs cohérents, tient les pics de trafic).
//
// Principes :
//  - Aucune donnée personnelle conservée : seulement des totaux anonymes.
//  - Anti-fraude sans cookie : jeton de session signé (après Cloudflare Turnstile) + plafond par adresse IP
//    hachée avec un sel quotidien (l'empreinte est effacée à la clôture du débat).
//  - Ce n'est PAS un sondage (loi n° 77-808, art. 12) : le mot n'apparaît nulle part.
//  - Réserve électorale : aucun vote ni résultat pendant les périodes définies dans config.json.
import config from '../../config.json';
import debatesFile from '../../data/debates.json';
import candidates from '../../data/candidates.json';

const BUNDLED = Object.fromEntries(debatesFile.debates.map(d => [d.id, d]));
// Liste des débats relue sur le site publié (SITE_URL/data/site.json) toutes les 5 minutes :
// ajouter un débat sur GitHub suffit, sans redéployer le serveur. Repli : la liste embarquée.
let cache = { at: 0, map: null };
async function debates(env) {
  if (cache.map && Date.now() - cache.at < 300000) return cache.map;
  if (env.SITE_URL) {
    try {
      const r = await fetch(env.SITE_URL.replace(/\/$/, '') + '/data/site.json', { cf: { cacheTtl: 300 } });
      if (r.ok) { const j = await r.json(); if (Array.isArray(j.debates)) { cache = { at: Date.now(), map: Object.fromEntries(j.debates.map(d => [d.id, d])) }; return cache.map; } }
    } catch { /* site injoignable : liste embarquée */ }
  }
  return BUNDLED;
}
const slim = d => ({ id: d.id, start: d.start, end: d.end, candidates: d.candidates });
const REACT_COOLDOWN_MS = 8000;        // une réaction par candidat toutes les 8 s et par session
const MAX_VERDICTS_PER_IP = 6;          // foyers et réseaux partagés : quelques votes par adresse
const VOTE_GRACE_MS = 60 * 60 * 1000;   // le verdict reste ouvert 1 h après la fin
const INTENTS = new Set([...Object.keys(candidates).filter(k => !k.startsWith('_')), 'other', 'blank', 'abstain', 'undecided']);

const enc = new TextEncoder();
const b64u = buf => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
async function hmac(secret, msg) {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return b64u(await crypto.subtle.sign('HMAC', key, enc.encode(msg)));
}
async function sha(msg) { return b64u(await crypto.subtle.digest('SHA-256', enc.encode(msg))).slice(0, 22); }

const inBlackout = (t = Date.now()) => config.election.blackout.some(b => t >= Date.parse(b.from) && t <= Date.parse(b.to));
const phase = (d, t = Date.now()) => {
  const s = Date.parse(d.start), e = Date.parse(d.end);
  if (t < s) return 'upcoming';
  if (t <= e) return 'live';
  if (t <= e + VOTE_GRACE_MS) return 'verdict';
  return 'closed';
};

function cors(req, env, res) {
  const origin = req.headers.get('Origin') || '';
  const allowed = (env.ALLOWED_ORIGINS || '*').split(',').map(s => s.trim());
  const ok = allowed.includes('*') || allowed.includes(origin);
  const h = new Headers(res.headers);
  h.set('Access-Control-Allow-Origin', ok ? (allowed.includes('*') ? '*' : origin) : 'null');
  h.set('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  h.set('Access-Control-Allow-Headers', 'content-type');
  h.set('Vary', 'Origin');
  return new Response(res.body, { status: res.status, headers: h });
}
const json = (o, status = 200, extra = {}) => new Response(JSON.stringify(o), { status, headers: { 'content-type': 'application/json; charset=utf-8', ...extra } });

export default {
  async fetch(req, env, ctx) {
    if (req.method === 'OPTIONS') return cors(req, env, new Response(null, { status: 204 }));
    const url = new URL(req.url);
    const parts = url.pathname.split('/').filter(Boolean); // api, session | api, debate, :id, (react|verdict)
    try {
      if (parts[0] !== 'api') return cors(req, env, json({ error: 'not_found' }, 404));

      // 1. Session : vérifie Turnstile puis délivre un jeton signé valable 6 h.
      if (parts[1] === 'session' && req.method === 'POST') {
        const body = await req.json().catch(() => ({}));
        if (env.TURNSTILE_SECRET) {
          const fd = new FormData();
          fd.append('secret', env.TURNSTILE_SECRET); fd.append('response', body.turnstile || '');
          fd.append('remoteip', req.headers.get('CF-Connecting-IP') || '');
          const v = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body: fd }).then(r => r.json());
          if (!v.success) return cors(req, env, json({ error: 'robot_check_failed' }, 403));
        }
        const id = b64u(crypto.getRandomValues(new Uint8Array(12)));
        const exp = Date.now() + 6 * 3600e3;
        const token = `${id}.${exp}.${await hmac(env.TOKEN_SECRET || 'dev-secret', id + '.' + exp)}`;
        return cors(req, env, json({ token }));
      }

      if (parts[1] !== 'debate' || !parts[2]) return cors(req, env, json({ error: 'not_found' }, 404));
      const debate = (await debates(env))[parts[2]];
      if (!debate || debate.demo) return cors(req, env, json({ error: 'unknown_debate' }, 404));
      if (inBlackout()) return cors(req, env, json({ error: 'electoral_silence' }, 451));
      const stub = env.ROOMS.get(env.ROOMS.idFromName(debate.id));

      // 2. Lecture des résultats (mise en cache 3 s pour absorber les pics).
      if (!parts[3] && req.method === 'GET') {
        const cache = caches.default, key = new Request(url.toString(), { method: 'GET' });
        let res = await cache.match(key);
        if (!res) {
          res = await stub.fetch('https://room/state?def=' + encodeURIComponent(JSON.stringify(slim(debate))), { method: 'GET' });
          res = new Response(res.body, res); res.headers.set('Cache-Control', 'public, max-age=3, s-maxage=3');
          ctx.waitUntil(cache.put(key, res.clone()));
        }
        return cors(req, env, res);
      }

      // 3. Écritures : jeton valide obligatoire.
      if ((parts[3] === 'react' || parts[3] === 'verdict') && req.method === 'POST') {
        const body = await req.json().catch(() => ({}));
        const [id, exp, sig] = String(body.token || '').split('.');
        if (!id || +exp < Date.now() || sig !== await hmac(env.TOKEN_SECRET || 'dev-secret', id + '.' + exp)) return cors(req, env, json({ error: 'bad_token' }, 401));
        const day = new Date().toISOString().slice(0, 10);
        const ipHash = await sha((req.headers.get('CF-Connecting-IP') || 'local') + '|' + day + '|' + (env.TOKEN_SECRET || 'dev-secret'));
        const res = await stub.fetch('https://room/' + parts[3], { method: 'POST', body: JSON.stringify({ ...body, sid: id, ipHash, def: slim(debate) }) });
        return cors(req, env, res);
      }
      return cors(req, env, json({ error: 'not_found' }, 404));
    } catch (e) {
      return cors(req, env, json({ error: 'server_error' }, 500));
    }
  }
};

// ---------- Une salle par débat ----------
export class DebateRoom {
  constructor(state) {
    this.state = state;
    this.loaded = false;
    this.dirty = false;
    this.lastReact = new Map(); // sid|c -> horodatage (mémoire seulement)
  }
  async load() {
    if (this.loaded) return;
    const s = await this.state.storage.get(['buckets', 'verdict', 'byIntent', 'sids', 'ips', 'reactors']);
    this.buckets = s.get('buckets') || {};      // minute -> { c: [pour, contre] }
    this.verdict = s.get('verdict') || {};      // c -> n
    this.byIntent = s.get('byIntent') || {};    // intention déclarée -> { c: n }
    this.sids = new Set(s.get('sids') || []);   // sessions ayant déjà voté (identifiants aléatoires)
    this.ips = s.get('ips') || {};              // empreinte IP salée -> nb de verdicts (effacé à la clôture)
    this.reactors = s.get('reactors') || 0;     // nombre de sessions ayant réagi
    this.reactorSet = new Set();
    this.loaded = true;
  }
  async save() {
    if (!this.dirty) return;
    this.dirty = false;
    await this.state.storage.put({ buckets: this.buckets, verdict: this.verdict, byIntent: this.byIntent, sids: [...this.sids], ips: this.ips, reactors: this.reactors });
  }
  schedule() {
    this.dirty = true;
    this.state.storage.getAlarm().then(a => { if (!a) this.state.storage.setAlarm(Date.now() + 4000); });
  }
  async alarm() {
    await this.load();
    await this.save();
  }
  async fetch(req) {
    await this.load();
    const url = new URL(req.url);
    const now = Date.now();
    if (req.method === 'GET') {
      let def = null; try { def = JSON.parse(url.searchParams.get('def')); } catch { /* */ }
      return json(this.snapshot(def));
    }
    const b = await req.json();
    const d = b.def;
    const ph = phase(d, now);
    if (url.pathname === '/react') {
      if (ph !== 'live') return json({ error: 'not_live' }, 409);
      if (!d.candidates.includes(b.c) || ![1, -1].includes(b.v)) return json({ error: 'bad_input' }, 400);
      const k = b.sid + '|' + b.c, last = this.lastReact.get(k) || 0;
      if (now - last < REACT_COOLDOWN_MS) return json({ error: 'too_fast', wait: REACT_COOLDOWN_MS - (now - last) }, 429);
      this.lastReact.set(k, now);
      if (!this.reactorSet.has(b.sid)) { this.reactorSet.add(b.sid); this.reactors++; }
      const m = Math.max(0, Math.floor((now - Date.parse(d.start)) / 60000));
      const bk = this.buckets[m] || (this.buckets[m] = {});
      const cell = bk[b.c] || (bk[b.c] = [0, 0]);
      cell[b.v === 1 ? 0 : 1]++;
      this.schedule();
      return json({ ok: true });
    }
    if (url.pathname === '/verdict') {
      if (ph !== 'live' && ph !== 'verdict') return json({ error: 'closed' }, 409);
      if (!(d.candidates.includes(b.c) || b.c === 'none')) return json({ error: 'bad_input' }, 400);
      if (this.sids.has(b.sid)) return json({ error: 'already_voted' }, 409);
      if ((this.ips[b.ipHash] || 0) >= MAX_VERDICTS_PER_IP) return json({ error: 'too_many_from_network' }, 429);
      this.sids.add(b.sid);
      this.ips[b.ipHash] = (this.ips[b.ipHash] || 0) + 1;
      this.verdict[b.c] = (this.verdict[b.c] || 0) + 1;
      // Intention de vote déclarée : facultative, uniquement avec consentement explicite, agrégée immédiatement.
      if (b.consent === true && INTENTS.has(b.intent)) {
        const row = this.byIntent[b.intent] || (this.byIntent[b.intent] = {});
        row[b.c] = (row[b.c] || 0) + 1;
      }
      this.schedule();
      return json({ ok: true });
    }
    return json({ error: 'not_found' }, 404);
  }
  snapshot(d) {
    if (d && phase(d) === 'closed' && Object.keys(this.ips).length) { this.ips = {}; this.sids = new Set(); this.schedule(); }
    return {
      serverTime: Date.now(), buckets: this.buckets, verdict: this.verdict,
      voters: Object.values(this.verdict).reduce((a, b) => a + b, 0), reactors: this.reactors,
      // Segments de moins de 30 votes masqués : trop petits pour être lisibles et risque de ré-identification.
      byIntent: Object.fromEntries(Object.entries(this.byIntent).filter(([, r]) => Object.values(r).reduce((a, b) => a + b, 0) >= 30))
    };
  }
}
