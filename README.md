# La Sonde

**Présidentielle 2027 : sonder plus loin que le dernier sondage.** Un agrégateur de sondages indépendant, public et entièrement automatique : moyenne corrigée des effets instituts, probabilités par scénario, reports de voix, comparaison avec 2022, préoccupations des Français. Bilingue FR / EN, pensé pour le mobile.

Conçu et signé par Bruno Peiffer.

## Ce que fait le site

| Rubrique | Contenu |
|---|---|
| La course | Moyenne lissée (noyau gaussien 12 j) de tous les sondages, corrigée des effets instituts, avec bande d'incertitude, points bruts et événements de campagne |
| Probabilités | 20 000 simulations par scénario de candidatures, incertitude calibrée sur les erreurs réelles de 2022 ; probabilités de qualification, de victoire et des duels |
| Fantômes 2022 | La campagne actuelle superposée à 2022, au même nombre de jours avant le vote |
| Qui prend des voix à qui ? | Reports implicites mesurés en comparant, dans une même enquête, deux listes qui ne diffèrent que d'un candidat |
| Second tour | Moyenne des duels testés + simulateur de reports réglable |
| Cet écart est-il significatif ? | Calculateur pédagogique de marge d'erreur sur un écart |
| Enjeux | Baromètre des préoccupations (Ipsos bva-CESI) et enjeux du vote (CEVIPOF) |
| Sondages | Les 40 dernières enquêtes avec mentions légales, fiches par institut, tableau des effets instituts |
| Qui gagne le débat ? | Pendant les débats télévisés : réactions « convaincant / pas convaincant » en direct, courbe minute par minute, vote final, résultats selon l'intention de vote déclarée (facultative) |
| Quiz | Vos priorités comparées à celles de chaque électorat (enquête CEVIPOF) ; rien n'est enregistré |
| Frise | Déclarations, retraits, décisions, débats et dates du scrutin |
| Intégration | Bouton « Intégrer » sous les graphiques : code iframe pour les médias et blogs (`?embed=course`, `proba`, `fantomes`) |
| Soutien | Bouton Ko-fi (en-tête et bas de page) |

## Comment les données arrivent (100 % automatique)

```
GitHub Actions (3 fois par jour)
 ├─ scripts/fetch-sources.mjs   → synchronise la base ouverte MieuxVoter (notices officielles, licence MIT)
 ├─ scripts/agent.mjs           → chaque matin : agent Claude qui cherche les sondages publiés
 │                                 (recherche limitée aux sites des instituts et grands médias),
 │                                 double vérification, puis nouvelle vague du baromètre des préoccupations
 ├─ scripts/model.mjs           → calcule tout et écrit site/data/site.json
 └─ publication sur GitHub Pages
```

- Les sondages trouvés par l'agent sont affichés « provisoires », puis remplacés automatiquement dès qu'ils entrent dans la base MieuxVoter.
- Les sondages commandés par un parti ou un candidat sont exclus (`config.json` → `excludeSponsors`).
- **Réserve électorale** : la veille et le jour de chaque tour, plus aucune mise à jour (loi n° 77-808, art. 11) ; un bandeau s'affiche.

## Mise en ligne (une seule fois, environ 20 minutes)

1. **Créer le dépôt** : sur github.com, *New repository* → nom `la-sonde` → *Public* → *Create*.
2. **Envoyer les fichiers** : *Add file → Upload files*, puis glissez **tout le contenu** du dossier (y compris le dossier `.github`). Validez avec *Commit changes*.
   Astuce : sur Mac, le dossier `.github` est masqué ; faites `Cmd + Maj + .` dans le Finder pour l'afficher.
3. **Autoriser l'écriture** : *Settings → Actions → General → Workflow permissions* → **Read and write permissions** → *Save*.
4. **Activer le site** : *Settings → Pages → Source* → **GitHub Actions**.
5. **Lancer une première fois** : onglet *Actions* → *Mise à jour et publication* → *Run workflow*. Le site est en ligne à `https://VOTRE-COMPTE.github.io/la-sonde/` au bout de 2 minutes environ.

### Activer l'agent de veille (recommandé)

1. Créez une clé sur [console.anthropic.com](https://console.anthropic.com) (*API Keys*) et mettez un plafond de dépense mensuel (*Billing → Limits*).
2. Dans le dépôt : *Settings → Secrets and variables → Actions → New repository secret* → nom `ANTHROPIC_API_KEY`, valeur = votre clé.
3. Optionnel : variable `CLAUDE_MODEL` (onglet *Variables*) pour choisir le modèle ; par défaut `claude-haiku-4-5` (le moins cher).

L'agent tourne une fois par jour (environ 10 recherches web + 2 appels de modèle). Comptez quelques euros par mois ; surveillez la consommation réelle sur la console les premiers jours. Sans clé, le site fonctionne quand même (mise à jour via MieuxVoter, avec quelques jours de décalage).

### Nom de domaine (environ 10 € / an)

1. Achetez le domaine (OVH, Gandi, Infomaniak…), par exemple `la-sonde.fr`.
2. Chez le registraire, ajoutez 4 enregistrements **A** vers `185.199.108.153`, `185.199.109.153`, `185.199.110.153`, `185.199.111.153` et un **CNAME** `www` vers `VOTRE-COMPTE.github.io`.
3. Dans *Settings → Pages → Custom domain*, saisissez le domaine, puis cochez *Enforce HTTPS*.
4. Mettez à jour `siteUrl` dans `config.json` (pas besoin de fichier `CNAME` avec la publication par GitHub Actions).

### Mesure d'audience sans cookie

Créez un compte gratuit sur [goatcounter.com](https://www.goatcounter.com), puis décommentez la ligne GoatCounter dans `site/index.html` en remplaçant `VOTRECODE`.

### Dons (Ko-fi)

Créez une page sur [ko-fi.com](https://ko-fi.com), puis remplacez `VOTRE_PSEUDO` dans `config.json` → `donate`. Renseignez aussi `contact` (adresse affichée pour les médias).

### Vote des débats (serveur Cloudflare, gratuit pour démarrer)

Sans serveur, la rubrique affiche une démonstration avec des candidats fictifs. Pour ouvrir le vote :

1. Créez un compte gratuit sur [dash.cloudflare.com](https://dash.cloudflare.com).
2. Sur votre ordinateur (Node 20+ installé), dans le dossier `worker` :
   ```bash
   npm install
   npx wrangler login
   npx wrangler secret put TOKEN_SECRET        # tapez une longue phrase aléatoire
   npx wrangler deploy
   ```
   Wrangler affiche l'adresse du serveur, par exemple `https://lasonde-votes.VOTRE-COMPTE.workers.dev`.
3. Anti-robots (recommandé) : dans Cloudflare, *Turnstile → Add widget* (domaine du site, mode *Invisible*). Mettez la **clé de site** dans `config.json` → `turnstileSiteKey`, et la **clé secrète** côté serveur : `npx wrangler secret put TURNSTILE_SECRET`.
4. Dans `config.json`, mettez l'adresse du serveur dans `api`, et votre domaine dans `worker/wrangler.toml` → `ALLOWED_ORIGINS`, puis `npx wrangler deploy` à nouveau.
5. Pour chaque débat, ajoutez une entrée dans `data/debates.json` sur GitHub (identifiant, titre, chaîne, heures de début et de fin, candidats, thèmes facultatifs). Le serveur relit la liste sur le site publié (`SITE_URL` dans `worker/wrangler.toml`) toutes les 5 minutes : aucun redéploiement nécessaire.

Test local : `npx wrangler dev` puis `node test.mjs` (après avoir ajouté un débat en cours dans `data/debates.json`).

Garanties intégrées : jamais le mot « sondage » (loi de 1977, art. 12) et mention « non représentatif » permanente ; aucun vote pendant la réserve électorale ; une réaction par candidat toutes les 8 s ; un vote final par session et au plus 6 par réseau ; intention de vote facultative, avec consentement, ajoutée à un total et jamais stockée individuellement ; groupes de moins de 30 votants masqués ; empreintes réseau (hachées, sel quotidien) effacées à la clôture. Un soir de forte audience peut dépasser l'offre gratuite de Cloudflare : l'offre payante coûte environ 5 $ par mois.

### Réglages juridiques

La loi assimile aux sondages les « opérations de simulation de vote » réalisées à partir de sondages. En attendant l'avis de la Commission des sondages, vous pouvez masquer les probabilités et le simulateur : `config.json` → `features` → `"probabilities": false`, `"simulator": false`. Même chose pour `debates` et `quiz`.
Pendant la réserve électorale, les sondages déjà publiés peuvent rester en ligne à condition d'indiquer la date de première publication, le média et l'institut : la liste affiche l'institut, le commanditaire et les dates de terrain ; ajoutez la date de publication si la Commission le demande.

## Personnaliser

- `config.json` : nom du site, dates du scrutin, périodes de réserve, paramètres du modèle, instituts et domaines de confiance pour l'agent.
- `data/candidates.json` : noms courts, partis et couleurs (clair / sombre) des candidats.
- `data/events.json` : événements de campagne affichés sur la courbe.
- `data/concerns.json` : baromètres de préoccupations (l'agent y ajoute les nouvelles vagues).
- `data/overrides.json` : retraits et déclarations plus récents que la base MieuxVoter (l'agent en ajoute chaque semaine), et candidats « requis » après une primaire (`required`) : les listes testées sans eux sont écartées des probabilités.
- `data/debates.json` : débats ouverts au vote.
- `data/quiz.json` : thèmes et profils de priorités du quiz.

## Tester en local

```bash
node scripts/fetch-sources.mjs
node scripts/model.mjs
cd site && python3 -m http.server 8000   # puis http://localhost:8000
```

Aucune dépendance à installer (Node 20+). D3 v7 est fourni dans `site/vendor/`.

## Sources et licences

- Sondages 2027 : [MieuxVoter/presidentielle2027](https://github.com/MieuxVoter/presidentielle2027) (MIT)
- Sondages 2022 : [nsppolls/nsppolls](https://github.com/nsppolls/nsppolls)
- Préoccupations : baromètres Ipsos bva-CESI pour La Tribune Dimanche ; enquête électorale Ipsos bva-CESI pour le CEVIPOF, la Fondation Jean-Jaurès et Le Monde
- Code : licence MIT
