// Test de bout en bout du serveur de vote : node test.mjs [url]  (debate id via TEST_DEBATE)
const B = process.argv[2] || 'http://127.0.0.1:8787', D = process.env.TEST_DEBATE || 'test-live';
const post = (p, b) => fetch(B + p, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b) }).then(async r => [r.status, await r.json()]);
const ok = (c, m) => { console.log((c ? '✔' : '✘') + ' ' + m); if (!c) process.exitCode = 1; };
const [, s] = await post('/api/session', {}); ok(!!s.token, 'jeton de session');
const [s1] = await post(`/api/debate/${D}/react`, { token: s.token, c: 'MLP', v: 1 }); ok(s1 === 200, 'réaction acceptée');
const [s2] = await post(`/api/debate/${D}/react`, { token: s.token, c: 'MLP', v: 1 }); ok(s2 === 429, 'réaction trop rapide refusée');
const [s3] = await post(`/api/debate/${D}/react`, { token: s.token, c: 'EP', v: -1 }); ok(s3 === 200, 'réaction autre candidat acceptée');
const [s4] = await post(`/api/debate/${D}/react`, { token: 'faux.1.x', c: 'EP', v: 1 }); ok(s4 === 401, 'jeton falsifié refusé');
const [s5] = await post(`/api/debate/${D}/react`, { token: s.token, c: 'XX', v: 1 }); ok(s5 === 400, 'candidat inconnu refusé');
const [v1] = await post(`/api/debate/${D}/verdict`, { token: s.token, c: 'EP', intent: 'JLM', consent: true }); ok(v1 === 200, 'verdict accepté');
const [v2] = await post(`/api/debate/${D}/verdict`, { token: s.token, c: 'MLP' }); ok(v2 === 409, 'double vote refusé');
for (let i = 0; i < 7; i++) { const [, t] = await post('/api/session', {}); const [st] = await post(`/api/debate/${D}/verdict`, { token: t.token, c: 'MLP' }); if (i === 6) ok(st === 429, 'plafond par réseau atteint au 7e vote'); }
const st = await fetch(`${B}/api/debate/${D}`).then(r => r.json());
ok(st.voters === 6 && st.reactors === 1, `état : ${st.voters} votants, ${st.reactors} réacteur(s), verdict ${JSON.stringify(st.verdict)}`);
ok(!('ips' in st) && Object.keys(st.byIntent).length === 0, 'aucune empreinte exposée, segment < 30 masqué');
const r404 = await fetch(`${B}/api/debate/demo`); ok(r404.status === 404, 'débat de démonstration non servi');
