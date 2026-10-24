// Textes de l'interface (FR / EN). Les valeurs peuvent contenir du HTML simple.
window.I18N = {
  fr: {
    blackout: "Réserve électorale : conformément à la loi, aucun nouveau sondage n'est publié ni commenté la veille et le jour du scrutin. Les données affichées sont celles d'avant la période de réserve.",
    'nav.race': 'La course', 'nav.proba': 'Probabilités', 'nav.ghosts': 'Fantômes 2022', 'nav.transfers': 'Reports',
    'nav.round2': 'Second tour', 'nav.issues': 'Enjeux', 'nav.polls': 'Sondages', 'nav.method': 'Méthode',
    'hero.kicker': 'Présidentielle 2027 · mis à jour automatiquement',
    'hero.title': 'Sonder plus loin que le dernier sondage',
    'hero.lead': "Tous les sondages des grands instituts, agrégés, corrigés et mis en perspective. Pour voir ce qui bouge vraiment, et ce qui n'est que du bruit.",
    'cd.r1': 'jours avant le 1er tour', 'cd.r2': 'jours avant le 2nd tour', 'cd.polls': 'enquêtes analysées',
    'pod.title': 'Moyenne des sondages', 'pod.d30': '30 j', 'pod.others': 'Autres candidats déclarés', 'pod.few': 'testé dans moins d’un tiers des enquêtes',
    'sum.title': "Le résumé détaillé", 'proba.cond': "Ces probabilités supposent que tous les candidats testés se présentent. L'entrée ou le retrait d'un seul candidat peut tout changer : choisissez le scénario de candidatures qui vous semble le plus plausible.",
    'sum.meta': 'Résumé factuel généré automatiquement à partir des données, sans intervention éditoriale. Dernier terrain pris en compte : {d}.',
    'race.tag': '1er tour', 'race.title': 'La course, jour après jour',
    'race.desc': "La moyenne lissée de tous les sondages, corrigée des écarts systématiques de chaque institut. La bande colorée montre l'incertitude de la moyenne.",
    'race.dots': 'Afficher chaque sondage', 'race.events': 'Afficher les événements',
    'race.lgLine': 'Moyenne lissée', 'race.lgBand': 'Incertitude (95 %)', 'race.lgDot': 'Un sondage (une hypothèse)',
    'race.note': "Les intentions de vote d'un candidat dépendent de la liste testée. La moyenne mélange les hypothèses où il figure ; les scénarios détaillés sont dans « Probabilités ».",
    'range.3m': '3 mois', 'range.6m': '6 mois', 'range.1y': '1 an', 'range.all': 'Tout',
    'proba.tag': 'Modèle', 'proba.title': 'Qui peut se qualifier, et gagner ?',
    'proba.desc': "Nous simulons 20 000 élections à partir de la moyenne actuelle et de l'ampleur réelle des erreurs de sondage observées en 2022. Choisissez le scénario de candidatures.",
    'proba.all': 'Synthèse', 'proba.qualif': 'Probabilité de qualification au 2nd tour',
    'proba.win': 'Probabilité de victoire', 'proba.winDesc': "Combine la chance d'atteindre chaque duel et les sondages de second tour de ce duel.",
    'proba.duels': 'Duels les plus probables', 'proba.cov': "Duels non testés par les sondages : {p} % des simulations, exclus du calcul de victoire.",
    'proba.warn': "Une probabilité n'est pas une prédiction : 20 % de chances, cela arrive une fois sur cinq. À six mois du vote, les sondages mesurent un état de l'opinion, pas le résultat. Rappel : à six mois du vote de 2022, la moyenne donnait Zemmour à 16 % et Mélenchon à 9 %. Ils ont fini à 7 % et 22 %.",
    'proba.scen': 'Scénario testé dans {n} enquêtes récentes (dernière : {d}).',
    'proba.allDesc': "Scénario construit par La Sonde : la liste la plus complète testée par les instituts, à laquelle on ajoute les candidats déclarés qui n'y figurent pas ({c}), avec leur moyenne et une incertitude plus grande.",
    'proba.with': 'avec', 'proba.without': 'sans', 'proba.synth': 'Moyenne des listes les plus testées par les instituts, pondérée par leur fréquence (hors scénario « tous les candidats déclarés »).',
    'ghost.tag': 'Mémoire', 'ghost.title': 'Les fantômes de 2022',
    'ghost.desc': "Superposez la campagne actuelle à celle de 2022, au même nombre de jours avant le 1er tour. Rien n'était joué : Zemmour culminait à l'automne, Mélenchon a fini à 22 %.",
    'ghost.lg27': '2027 (moyenne)', 'ghost.lg22': '2022 (moyenne à la même date)', 'ghost.lgRes': 'Résultat réel 2022',
    'ghost.note': "Dernier sondage : J-{d}. À la même distance en 2022, la moyenne donnait {list}.",
    'ghost.days': 'jours avant le 1er tour',
    'tr.tag': 'Exclusif', 'tr.title': 'Qui prend des voix à qui ?',
    'tr.desc': "Quand un institut teste deux listes qui ne diffèrent que d'un candidat, on voit où vont ses électeurs s'il n'est pas sur la ligne de départ. Nous faisons la moyenne de toutes ces comparaisons.",
    'tr.when': 'Sans {x}, ses {s} % se répartissent ainsi', 'tr.pairs': '{n} comparaisons dans {s} enquêtes', 'tr.rest': 'autres / indécis',
    'r2.tag': '2nd tour', 'r2.title': 'Les duels possibles',
    'r2.desc': 'Moyenne des sondages de second tour pour chaque duel testé, puis à vous de jouer : réglez les reports de voix.',
    'r2.polls': 'Ce que disent les sondages', 'r2.sim': 'Simulateur de reports',
    'r2.simDesc': "Pour chaque candidat éliminé, choisissez la part de ses électeurs qui se reporte sur chaque finaliste. Le reste s'abstient. Au départ, tout est réglé à un tiers / un tiers / un tiers.",
    'r2.finA': 'Finaliste 1', 'r2.finB': 'Finaliste 2', 'r2.reset': 'Réinitialiser',
    'r2.to': 'vers {c}', 'r2.cmp': 'Moyenne des sondages pour ce duel : {a} % / {b} % ({n} sondages).', 'r2.nocmp': "Ce duel n'a pas encore été testé par les instituts.",
    'r2.n': '{n} sondages · dernier {d}',
    'gap.tag': 'Pédagogie', 'gap.title': 'Cet écart est-il significatif ?',
    'gap.desc': "Un sondage de 1 000 personnes ne peut pas départager deux candidats à 1 point d'écart. Testez n'importe quel duel.",
    'gap.a': 'Candidat A', 'gap.b': 'Candidat B', 'gap.n': 'Taille de l\'échantillon',
    'gap.res': "Écart de <b>{g} pt</b> ; marge d'erreur sur l'écart : <b>± {m} pt</b>.",
    'gap.yes': 'Écart significatif', 'gap.no': 'Pas significatif : statistiquement à égalité',
    'gap.need': "Il faudrait environ {n} personnes interrogées pour que cet écart soit significatif.",
    'gap.note': "Calcul à 95 %, comme pour un échantillon aléatoire. Les instituts français utilisent la méthode des quotas : la marge est indicative.",
    'is.tag': 'Opinion', 'is.title': 'Ce qui préoccupe les Français',
    'is.desc': "Les intentions de vote ne disent pas pourquoi. Les baromètres disent ce qui inquiète et ce qui fera le vote.",
    'is.baro': 'Principales préoccupations', 'is.stakes': 'Classement détaillé des enjeux (avril 2026, dernière mesure)', 'is.prio': 'Ce qui compte le plus pour les Français (septembre 2026)', 'is.prioBy': 'Selon la proximité partisane', 'is.prioNote': 'Pourcentage citant chaque grande question parmi les deux plus importantes. Plus la case est foncée, plus la question est citée.', 'is.byElec': 'Ce qui compte pour chaque électorat',
    'is.src': 'Source : {s}.', 'is.waves': '{i} pour {p}. {q}.',
    'po.tag': 'Transparence', 'po.title': 'Les derniers sondages',
    'po.desc': "Chaque enquête avec ses mentions légales : institut, commanditaire, dates de terrain, échantillon. La notice complète est déposée à la Commission des sondages.",
    'po.hyp': '{n} hypothèse(s)', 'po.notice': 'Notice', 'po.source': 'Source', 'po.prov': 'Provisoire : relevé dans la presse, en attente de la notice officielle',
    'po.sample': '{n} personnes', 'po.r2': '2nd tour', 'po.more': 'Afficher plus',
    'po.house': 'Effets instituts', 'po.houseDesc': "Écart moyen de chaque institut par rapport à la moyenne générale, sur 8 mois (en points). Ce n'est pas un biais volontaire : méthodes, panels et redressements diffèrent.",
    'po.inst': 'Institut', 'po.nsurv': 'Enquêtes',
    'me.tag': 'Méthode', 'me.title': 'Comment ça marche',
    'soon.tag': 'Bientôt', 'soon.text': "Quiz de positionnement sur les grands thèmes, fiches détaillées par institut, frise des débats, graphiques à intégrer sur votre site.",
    'ft.about': "Agrégateur indépendant des sondages de l'élection présidentielle 2027. Aucune publicité, aucun cookie.",
    'ft.legalT': 'Mentions légales',
    'ft.legal': "Conformément à la loi n° 77-808 du 19 juillet 1977 modifiée, chaque sondage est présenté avec l'institut, le commanditaire, les dates de terrain et la taille de l'échantillon ; sa notice complète est consultable auprès de la <a href=\"https://www.commission-des-sondages.fr/\" rel=\"noopener\">Commission des sondages</a>. Les marges d'erreur sont indicatives. Aucun nouveau sondage n'est publié ni commenté la veille et le jour du scrutin.",
    'ft.dataT': 'Données',
    'ft.data': "Sondages : base ouverte <a href=\"https://github.com/MieuxVoter/presidentielle2027\" rel=\"noopener\">MieuxVoter</a> (licence MIT), compilée à partir des notices officielles, complétée par notre agent de veille. 2022 : base <a href=\"https://github.com/nsppolls/nsppolls\" rel=\"noopener\">NSPPolls</a>. Préoccupations : baromètres Ipsos bva-CESI et enquête électorale CEVIPOF.",
    'ft.author': 'Conçu et signé par {a}.', 'ft.lcen': 'Éditeur : {a} (contact : {c}). Hébergeur : GitHub, Inc., 88 Colin P. Kelly Jr. Street, San Francisco, CA 94107, États-Unis.', 'ft.gen': 'Dernière mise à jour : {d}.',
    'tip.polls': 'sondages'
  },
  en: {
    blackout: 'Electoral silence: by law, no new poll is published or discussed on the eve and day of the vote. Data shown predates this period.',
    'nav.race': 'The race', 'nav.proba': 'Odds', 'nav.ghosts': '2022 ghosts', 'nav.transfers': 'Vote flows',
    'nav.round2': 'Run-off', 'nav.issues': 'Issues', 'nav.polls': 'Polls', 'nav.method': 'Method',
    'hero.kicker': 'France 2027 · updated automatically',
    'hero.title': 'Looking deeper than the latest poll',
    'hero.lead': "Every poll from the major French pollsters, aggregated, adjusted and put in context. See what is really moving, and what is just noise.",
    'cd.r1': 'days to round 1', 'cd.r2': 'days to the run-off', 'cd.polls': 'surveys analysed',
    'pod.title': 'Polling average', 'pod.d30': '30 d', 'pod.others': 'Other declared candidates', 'pod.few': 'included in fewer than a third of surveys',
    'sum.title': 'Full summary', 'proba.cond': 'These odds assume every tested candidate actually runs. One candidate entering or dropping out can change everything: pick the line-up you find most plausible.',
    'sum.meta': 'Factual summary generated automatically from the data, with no editorial input. Latest fieldwork included: {d}.',
    'race.tag': 'Round 1', 'race.title': 'The race, day by day',
    'race.desc': "A smoothed average of every poll, adjusted for each pollster's systematic lean. The shaded band shows the uncertainty of the average.",
    'race.dots': 'Show each poll', 'race.events': 'Show events',
    'race.lgLine': 'Smoothed average', 'race.lgBand': 'Uncertainty (95%)', 'race.lgDot': 'One poll (one scenario)',
    'race.note': "A candidate's score depends on who else is tested. The average blends the scenarios that include them; detailed scenarios are in “Odds”.",
    'range.3m': '3 mo', 'range.6m': '6 mo', 'range.1y': '1 yr', 'range.all': 'All',
    'proba.tag': 'Model', 'proba.title': 'Who can make the run-off, and win?',
    'proba.desc': 'We simulate 20,000 elections from the current average and the actual size of polling errors seen in 2022. Pick a candidate line-up.',
    'proba.all': 'Overall', 'proba.qualif': 'Chance of reaching the run-off',
    'proba.win': 'Chance of winning', 'proba.winDesc': 'Combines the chance of each run-off pairing with run-off polls for that pairing.',
    'proba.duels': 'Most likely run-offs', 'proba.cov': 'Pairings never polled: {p}% of simulations, left out of the win calculation.',
    'proba.warn': 'A probability is not a prediction: a 20% chance happens one time in five. Six months out, polls measure opinion, not the result. Remember: six months before the 2022 vote, the average had Zemmour on 16% and Mélenchon on 9%. They finished on 7% and 22%.',
    'proba.scen': 'Line-up tested in {n} recent surveys (latest: {d}).',
    'proba.allDesc': 'Line-up built by La Sonde: the most complete line-up tested by pollsters, plus declared candidates missing from it ({c}), using their average and wider uncertainty.',
    'proba.with': 'with', 'proba.without': 'without', 'proba.synth': 'Average of the line-ups most tested by pollsters, weighted by frequency (excluding the “all declared candidates” line-up).',
    'ghost.tag': 'Memory', 'ghost.title': 'The ghosts of 2022',
    'ghost.desc': 'Overlay the current race on 2022, at the same number of days before round 1. Nothing was settled: Zemmour peaked in the autumn, Mélenchon ended on 22%.',
    'ghost.lg27': '2027 (average)', 'ghost.lg22': '2022 (average at the same point)', 'ghost.lgRes': 'Actual 2022 result',
    'ghost.note': 'Latest poll: {d} days out. At the same point in 2022, the average showed {list}.',
    'ghost.days': 'days before round 1',
    'tr.tag': 'Exclusive', 'tr.title': 'Who takes votes from whom?',
    'tr.desc': 'When a pollster tests two line-ups that differ by a single candidate, we see where their voters go if they do not run. We average all such comparisons.',
    'tr.when': 'Without {x}, their {s}% split like this', 'tr.pairs': '{n} comparisons in {s} surveys', 'tr.rest': 'others / undecided',
    'r2.tag': 'Run-off', 'r2.title': 'Possible head-to-heads',
    'r2.desc': 'Average of run-off polls for each tested pairing, then your turn: set the vote transfers.',
    'r2.polls': 'What the polls say', 'r2.sim': 'Transfer simulator',
    'r2.simDesc': 'For each eliminated candidate, choose the share of voters moving to each finalist. The rest abstain. Defaults: one third / one third / one third.',
    'r2.finA': 'Finalist 1', 'r2.finB': 'Finalist 2', 'r2.reset': 'Reset',
    'r2.to': 'to {c}', 'r2.cmp': 'Poll average for this pairing: {a}% / {b}% ({n} polls).', 'r2.nocmp': 'This pairing has not been polled yet.',
    'r2.n': '{n} polls · latest {d}',
    'gap.tag': 'Explainer', 'gap.title': 'Is this gap significant?',
    'gap.desc': 'A 1,000-person poll cannot separate two candidates 1 point apart. Test any pairing.',
    'gap.a': 'Candidate A', 'gap.b': 'Candidate B', 'gap.n': 'Sample size',
    'gap.res': 'Gap of <b>{g} pts</b>; margin of error on the gap: <b>± {m} pts</b>.',
    'gap.yes': 'Significant gap', 'gap.no': 'Not significant: a statistical tie',
    'gap.need': 'About {n} respondents would be needed for this gap to be significant.',
    'gap.note': 'Computed at 95% as for a random sample. French pollsters use quota sampling, so the margin is indicative.',
    'is.tag': 'Opinion', 'is.title': 'What worries the French',
    'is.desc': 'Voting intentions do not say why. Barometers show what worries people and what will drive the vote.',
    'is.baro': 'Top concerns', 'is.stakes': 'Detailed issue ranking (April 2026, latest available)', 'is.prio': 'What matters most to French voters (September 2026)', 'is.prioBy': 'By party closeness', 'is.prioNote': 'Share citing each issue among their top two. The darker the cell, the more often it is cited.', 'is.byElec': 'What matters to each electorate',
    'is.src': 'Source: {s}.', 'is.waves': '{i} for {p}. {q}.',
    'po.tag': 'Transparency', 'po.title': 'Latest polls',
    'po.desc': 'Every survey with its legal details: pollster, sponsor, fieldwork dates, sample. Full notices are filed with the French Polling Commission.',
    'po.hyp': '{n} scenario(s)', 'po.notice': 'Notice', 'po.source': 'Source', 'po.prov': 'Provisional: taken from press reports, pending the official notice',
    'po.sample': '{n} people', 'po.r2': 'Run-off', 'po.more': 'Show more',
    'po.house': 'House effects', 'po.houseDesc': "Each pollster's average gap from the overall average over 8 months (points). Not deliberate bias: methods, panels and weighting differ.",
    'po.inst': 'Pollster', 'po.nsurv': 'Surveys',
    'me.tag': 'Method', 'me.title': 'How it works',
    'soon.tag': 'Coming soon', 'soon.text': 'Issue-positioning quiz, detailed pollster profiles, debate timeline, embeddable charts.',
    'ft.about': 'Independent aggregator of polls for the 2027 French presidential election. No ads, no cookies.',
    'ft.legalT': 'Legal notice',
    'ft.legal': 'In line with French law no. 77-808 of 19 July 1977 as amended, each poll is shown with its pollster, sponsor, fieldwork dates and sample size; its full notice is available from the <a href="https://www.commission-des-sondages.fr/" rel="noopener">Commission des sondages</a>. Margins of error are indicative. No new poll is published or discussed on the eve and day of the vote.',
    'ft.dataT': 'Data',
    'ft.data': 'Polls: open <a href="https://github.com/MieuxVoter/presidentielle2027" rel="noopener">MieuxVoter</a> database (MIT licence), compiled from official notices, supplemented by our monitoring agent. 2022: <a href="https://github.com/nsppolls/nsppolls" rel="noopener">NSPPolls</a>. Concerns: Ipsos bva-CESI barometers and the CEVIPOF electoral survey.',
    'ft.author': 'Designed and signed by {a}.', 'ft.lcen': 'Publisher: {a} (contact: {c}). Host: GitHub, Inc., 88 Colin P. Kelly Jr. Street, San Francisco, CA 94107, USA.', 'ft.gen': 'Last update: {d}.',
    'tip.polls': 'polls'
  }
};

window.METHOD = {
  fr: `
<p><b>Sources.</b> Les sondages proviennent de la base ouverte MieuxVoter, compilée à partir des notices déposées à la Commission des sondages (IFOP, Elabe, Ipsos BVA, Harris Interactive, OpinionWay, Odoxa, Cluster17, YouGov, Verian…). Un agent automatique (Claude, recherche limitée aux sites des instituts et des grands médias) repère les sondages publiés avant leur intégration ; chaque relevé est vérifié par un second passage indépendant et affiché comme « provisoire ». Les sondages commandés par un parti ou un candidat sont exclus.</p>
<p><b>La moyenne.</b> Chaque hypothèse testée est un point. Son poids dépend de la taille de l'échantillon (racine carrée) et il est partagé entre les hypothèses d'une même enquête, pour qu'un institut qui teste dix scénarios ne pèse pas dix fois plus. Les points sont lissés par un noyau gaussien de 12 jours.</p>
<p><b>Effets instituts.</b> Chaque institut a des écarts réguliers (méthode, panel, redressement). Nous mesurons l'écart moyen de chaque institut pour chaque candidat sur 8 mois, le rapprochons de zéro quand il repose sur peu d'enquêtes, puis le retirons avant de calculer la moyenne.</p>
<p><b>Scénarios et probabilités.</b> Les scores dépendent de la liste testée : nous modélisons séparément les listes les plus testées sur 60 jours. Pour chacune, 20 000 élections sont simulées. L'incertitude de chaque candidat est calibrée sur l'écart réel entre les sondages et le résultat de 2022 (écart-type = √score × (a + b·√jours restants)). La victoire combine la probabilité de chaque duel avec la moyenne des sondages de second tour de ce duel.</p>
<p><b>Reports de voix.</b> Dans une même enquête, deux hypothèses qui ne diffèrent que d'un candidat montrent où vont ses électeurs. Nous faisons la moyenne de ces écarts sur 5 mois. Les arrondis des instituts rendent chaque comparaison imprécise ; seule la moyenne a du sens.</p>
<p><b>Détecteur de bascule.</b> Pour chaque candidat, nous calculons la pente des sondages des cinq dernières semaines, corrigés des effets instituts, avec sa marge d'erreur (les hypothèses d'une même enquête ne sont pas comptées comme indépendantes). Une flèche n'apparaît que si la hausse ou la baisse est établie à 90 % au moins. La projection à 30 jours prolonge cette pente en l'amortissant de 3 % par jour ; sa fourchette à 80 % combine l'incertitude de la pente, celle de la moyenne et une dérive aléatoire. Le baromètre d'incertitude est la probabilité, tirée des 20 000 simulations, que le duel final ne soit pas le duel actuellement en tête.</p>
<p><b>Simulateur « Et si… ? ».</b> Point de départ : la liste avec tous les candidats déclarés. Quand des candidats se retirent, nous cherchons d'abord des sondages qui ont testé la même configuration (mêmes candidats principaux) : c'est alors leur moyenne corrigée qui s'affiche (« testé »). Sinon, les électeurs du candidat retiré sont répartis selon les reports observés dans les sondages qui le testent avec et sans lui (« mesuré »). À défaut, une part est répartie proportionnellement, comme une abstention, et le reste va surtout aux candidats proches sur l'axe gauche-droite, pondérés par leur poids électoral (« estimé »). Ces trois réglages (part d'abstention, effet de proximité, effet de taille) ne sont pas choisis par nous : à chaque mise à jour, ils sont recalculés pour reproduire au mieux les reports réellement mesurés dans les sondages. Les positions utilisées sont indicatives, inspirées des classements d'experts des partis européens (Chapel Hill Expert Survey), et listées ci-dessous.</p>
<p><b>Limites.</b> Un sondage mesure une intention à un instant donné. Les marges d'erreur sont indicatives (méthode des quotas). Les probabilités dépendent d'hypothèses simples et d'une seule élection de référence ; elles seront affinées.</p>
<p><b>Code ouvert.</b> Tout le calcul est public et reproductible sur GitHub.</p>`,
  en: `
<p><b>Sources.</b> Polls come from the open MieuxVoter database, compiled from notices filed with the French Polling Commission (IFOP, Elabe, Ipsos BVA, Harris Interactive, OpinionWay, Odoxa, Cluster17, YouGov, Verian…). An automatic agent (Claude, with search restricted to pollster and major media sites) spots newly published polls before they reach the database; each extraction is checked by an independent second pass and labelled “provisional”. Polls commissioned by a party or candidate are excluded.</p>
<p><b>The average.</b> Each tested scenario is a data point, weighted by the square root of the sample size and shared across scenarios of the same survey, so that a pollster testing ten line-ups does not count ten times. Points are smoothed with a 12-day Gaussian kernel.</p>
<p><b>House effects.</b> Each pollster leans in consistent ways (method, panel, weighting). We measure each pollster's average gap for each candidate over 8 months, shrink it toward zero when based on few surveys, and remove it before averaging.</p>
<p><b>Scenarios and odds.</b> Scores depend on the line-up, so we model the most-tested line-ups of the last 60 days separately, simulating 20,000 elections for each. Each candidate's uncertainty is calibrated on the actual gap between polls and the 2022 result (sd = √score × (a + b·√days left)). Win odds combine the chance of each pairing with the run-off poll average for that pairing.</p>
<p><b>Vote flows.</b> Within one survey, two scenarios differing by a single candidate show where that candidate's voters go. We average those gaps over 5 months. Pollster rounding makes each comparison noisy; only the average is meaningful.</p>
<p><b>Momentum detector.</b> For each candidate we estimate the slope of house-adjusted polls over the last five weeks, with its margin of error (scenarios from the same survey are not treated as independent). An arrow appears only when a rise or fall is established with at least 90% confidence. The 30-day projection extends that slope, damped by 3% a day; its 80% range combines slope uncertainty, average uncertainty and random drift. The uncertainty gauge is the probability, from the 20,000 simulations, that the run-off will not be the pairing currently in the lead.</p>
<p><b>“What if?” simulator.</b> Starting point: the line-up with every declared candidate. When candidates drop out, we first look for polls that tested the same line-up (same main candidates) and show their adjusted average (“tested”). Otherwise, the withdrawn candidate's voters are split according to transfers observed in polls testing scenarios with and without them (“measured”). Failing that, a share is spread proportionally, like abstention, and the rest go mostly to candidates nearby on the left-right axis, weighted by their electoral size (“estimated”). These three settings (abstention share, proximity effect, size effect) are not chosen by us: at every update they are recomputed to best reproduce the transfers actually measured in polls. Positions are indicative, based on expert rankings of European parties (Chapel Hill Expert Survey), and listed below.</p>
<p><b>Limits.</b> A poll measures intention at a point in time. Margins of error are indicative (quota sampling). Odds rest on simple assumptions and a single reference election; they will be refined.</p>
<p><b>Open code.</b> All calculations are public and reproducible on GitHub.</p>`
};

// ---------- V2 ----------
Object.assign(window.I18N.fr, {
  'tab.title': 'Tous les candidats', 'tab.cand': 'Candidat', 'tab.avg': 'Moyenne', 'tab.d30': '30 jours', 'tab.pres': 'Testé dans', 'tab.last': 'Dernier test', 'tab.low': 'peu testé', 'tab.note': "« Testé dans » : part des hypothèses des 45 derniers jours qui incluent le candidat. Un candidat peu testé a une moyenne moins fiable, calculée sur les seuls sondages où il figure.",
  'nav.debates': 'Débats', 'nav.quiz': 'Quiz', 'nav.timeline': 'Frise',
  'don.short': 'Soutenir', 'don.hero': 'Soutenir La Sonde', 'don.title': 'Un site indépendant, sans publicité', 'don.cta': 'Soutenir sur Ko-fi',
  'don.text': "La Sonde n'affiche aucune publicité et ne dépose aucun cookie. Les serveurs, le nom de domaine et l'agent de veille ont un coût : si le site vous est utile, un café fait la différence.",
  'media.title': 'Médias et sites', 'media.text': "Les graphiques sont intégrables gratuitement sur votre site (bouton « Intégrer » sous chaque graphique), avec mention de la source. Pour une version personnalisée, une soirée électorale ou les données, écrivez-nous.",
  'media.contact': 'Contact :',
  'emb.btn': '</> Intégrer ce graphique', 'emb.copy': 'Copier le code', 'emb.copied': 'Copié', 'emb.src': 'Source : {s}',
  'live.bar': 'Débat en direct : donnez votre avis',
  'deb.tag': 'En direct', 'deb.title': 'Qui gagne le débat ?',
  'deb.desc': "Pendant les débats télévisés, réagissez en direct à chaque prise de parole, puis votez pour le candidat le plus convaincant. La courbe montre les réactions minute par minute.",
  'deb.notpoll': "Vote des internautes : ce n'est pas un sondage. Les participants ne sont pas représentatifs des Français.",
  'deb.demo': "Démonstration : données fictives pour montrer le fonctionnement. Le vote ouvrira pendant les débats télévisés de la campagne.",
  'deb.live': 'En direct', 'deb.upcoming': 'À venir', 'deb.verdict': 'Vote final ouvert', 'deb.closed': 'Terminé',
  'deb.starts': 'Début dans {t}', 'deb.people': '{r} participants aux réactions · {v} votes',
  'deb.yes': '▲ Convaincant', 'deb.no': '▼ Pas convaincant', 'deb.net5': 'solde 5 min : {v}',
  'deb.curve': 'Courbe des réactions', 'deb.curveDesc': "Solde par minute : part de « convaincant » moins part de « pas convaincant » (moyenne glissante sur 3 minutes).",
  'deb.min': 'min',
  'deb.vq': 'Qui a été le plus convaincant ?', 'deb.none': 'Aucun',
  'deb.consent': "J'accepte d'indiquer, de façon anonyme, mon intention de vote au 1er tour. Elle est seulement ajoutée à un total et n'est jamais reliée à moi.",
  'deb.intent': 'Mon intention de vote', 'deb.intent.other': 'Un autre candidat', 'deb.intent.blank': 'Blanc ou nul', 'deb.intent.abstain': "Je ne voterai pas", 'deb.intent.undecided': 'Je ne sais pas',
  'deb.send': 'Voter', 'deb.thanks': 'Merci, votre vote est enregistré.', 'deb.already': 'Vous avez déjà voté pour ce débat.',
  'deb.results': 'Résultats du vote des internautes', 'deb.byIntent': "Selon l'intention de vote déclarée", 'deb.byIntentNote': 'Seuls les groupes d\'au moins 30 votants sont affichés.',
  'deb.err': "Le vote n'a pas pu être enregistré. Réessayez dans un instant.", 'deb.wait': 'Patientez quelques secondes entre deux réactions.',
  'deb.none_scheduled': "Aucun débat programmé pour l'instant. Les débats seront annoncés ici dès leur programmation.",
  'deb.silence': 'Réserve électorale : vote et résultats suspendus.',
  'qz.tag': 'Quiz', 'qz.title': 'Vos priorités ressemblent à celles de quel électorat ?',
  'qz.desc': "Choisissez les enjeux qui compteront le plus dans votre vote. Nous les comparons aux priorités déclarées par chaque électorat dans la grande enquête électorale du CEVIPOF. Rien n'est enregistré.",
  'qz.pick': 'Vos enjeux prioritaires', 'qz.count': '{n} / {m} sélectionnés', 'qz.res': 'Proximité de priorités',
  'qz.resDesc': "Il s'agit de priorités communes, pas d'accord sur les solutions : deux électorats peuvent juger l'immigration prioritaire pour des raisons opposées.",
  'qz.empty': 'Sélectionnez au moins un enjeu.', 'qz.common': '{n} enjeu(x) en commun', 'qz.national': "Pour l'ensemble des inscrits, les deux enjeux les plus cités sont la santé et le pouvoir d'achat.",
  'qz.src': 'Source : enquête électorale Ipsos bva-CESI pour le CEVIPOF, la Fondation Jean-Jaurès et Le Monde (avril 2026).',
  'ins.title': 'Fiches instituts', 'ins.surveys': 'Enquêtes', 'ins.period': 'Période', 'ins.median': 'Échantillon médian', 'ins.sponsors': 'Commanditaires', 'ins.he': 'Effet institut (pt)', 'ins.site': 'Site',
  'tl.tag': 'Frise', 'tl.title': 'La campagne en dates', 'tl.desc': 'Déclarations, retraits, décisions et débats, jusqu\'au second tour.',
  'tl.r1': '1er tour de l\'élection présidentielle', 'tl.r2': '2nd tour de l\'élection présidentielle', 'tl.debate': 'Débat : {t} ({c})'
});
Object.assign(window.I18N.en, {
  'tab.title': 'All candidates', 'tab.cand': 'Candidate', 'tab.avg': 'Average', 'tab.d30': '30 days', 'tab.pres': 'Tested in', 'tab.last': 'Last tested', 'tab.low': 'rarely tested', 'tab.note': '“Tested in”: share of scenarios from the last 45 days that include the candidate. A rarely tested candidate has a less reliable average, based only on the polls that include them.',
  'nav.debates': 'Debates', 'nav.quiz': 'Quiz', 'nav.timeline': 'Timeline',
  'don.short': 'Support', 'don.hero': 'Support La Sonde', 'don.title': 'An independent, ad-free site', 'don.cta': 'Support on Ko-fi',
  'don.text': 'La Sonde shows no ads and sets no cookies. Servers, the domain and the monitoring agent cost money: if the site is useful to you, a coffee makes a difference.',
  'media.title': 'Media and websites', 'media.text': 'Charts can be embedded on your site for free (“Embed” button under each chart), with credit. For a custom version, an election-night package or the data, get in touch.',
  'media.contact': 'Contact:',
  'emb.btn': '</> Embed this chart', 'emb.copy': 'Copy code', 'emb.copied': 'Copied', 'emb.src': 'Source: {s}',
  'live.bar': 'Live debate: have your say',
  'deb.tag': 'Live', 'deb.title': 'Who is winning the debate?',
  'deb.desc': 'During TV debates, react live to each answer, then vote for the most convincing candidate. The curve shows reactions minute by minute.',
  'deb.notpoll': 'Readers’ vote: this is not a poll. Participants are not representative of French voters.',
  'deb.demo': 'Demo: made-up data to show how it works. Voting opens during the campaign’s TV debates.',
  'deb.live': 'Live', 'deb.upcoming': 'Upcoming', 'deb.verdict': 'Final vote open', 'deb.closed': 'Ended',
  'deb.starts': 'Starts in {t}', 'deb.people': '{r} reacting · {v} votes',
  'deb.yes': '▲ Convincing', 'deb.no': '▼ Not convincing', 'deb.net5': '5-min balance: {v}',
  'deb.curve': 'Reaction curve', 'deb.curveDesc': 'Balance per minute: share of “convincing” minus share of “not convincing” (3-minute rolling average).',
  'deb.min': 'min',
  'deb.vq': 'Who was most convincing?', 'deb.none': 'Neither',
  'deb.consent': 'I agree to share, anonymously, my first-round voting intention. It is only added to a total and never linked to me.',
  'deb.intent': 'My voting intention', 'deb.intent.other': 'Another candidate', 'deb.intent.blank': 'Blank or spoilt', 'deb.intent.abstain': 'I will not vote', 'deb.intent.undecided': 'Undecided',
  'deb.send': 'Vote', 'deb.thanks': 'Thank you, your vote is recorded.', 'deb.already': 'You have already voted in this debate.',
  'deb.results': 'Readers’ vote results', 'deb.byIntent': 'By declared voting intention', 'deb.byIntentNote': 'Only groups of at least 30 voters are shown.',
  'deb.err': 'Your vote could not be recorded. Please try again shortly.', 'deb.wait': 'Please wait a few seconds between reactions.',
  'deb.none_scheduled': 'No debate scheduled yet. Debates will be listed here once announced.',
  'deb.silence': 'Electoral silence: voting and results suspended.',
  'qz.tag': 'Quiz', 'qz.title': 'Whose priorities match yours?',
  'qz.desc': 'Pick the issues that will matter most in your vote. We compare them with the priorities each electorate reported in the large CEVIPOF electoral survey. Nothing is stored.',
  'qz.pick': 'Your priority issues', 'qz.count': '{n} / {m} selected', 'qz.res': 'Shared priorities',
  'qz.resDesc': 'This measures shared priorities, not agreement on solutions: two electorates can rank immigration first for opposite reasons.',
  'qz.empty': 'Select at least one issue.', 'qz.common': '{n} issue(s) in common', 'qz.national': 'Across all registered voters, the two most cited issues are health and cost of living.',
  'qz.src': 'Source: Ipsos bva-CESI electoral survey for CEVIPOF, Fondation Jean-Jaurès and Le Monde (April 2026).',
  'ins.title': 'Pollster profiles', 'ins.surveys': 'Surveys', 'ins.period': 'Period', 'ins.median': 'Median sample', 'ins.sponsors': 'Sponsors', 'ins.he': 'House effect (pts)', 'ins.site': 'Website',
  'tl.tag': 'Timeline', 'tl.title': 'The campaign in dates', 'tl.desc': 'Declarations, withdrawals, rulings and debates, up to the run-off.',
  'tl.r1': 'Presidential election, round 1', 'tl.r2': 'Presidential election, run-off', 'tl.debate': 'Debate: {t} ({c})'
});

// ---------- V2 : bascule, baromètre, sondage décrypté ----------
Object.assign(window.I18N.fr, {
  'nav.bascule': 'Bascule',
  'chg.title': 'Les 3 signaux du jour', 'chg.card': 'Image du jour à partager',
  'bas.tag': 'Détecteur de bascule', 'bas.title': 'Qui bouge vraiment ?',
  'bas.desc': "Une flèche n'apparaît que si la tendance des cinq dernières semaines sort du bruit statistique (certitude d'au moins 90 %). Tout le reste est stable, même si les chiffres semblent bouger.",
  'bas.mom': 'Tendance sur 14 jours', 'bas.momDesc': 'Pente des sondages corrigés des effets instituts. Cliquez sur un nom pour l’ajouter à la projection.',
  'bas.st.up': 'En hausse nette', 'bas.st.down': 'En baisse nette', 'bas.st.flat': 'Stable', 'bas.st.nd': 'Trop peu de sondages',
  'bas.conf': 'certitude {p} %', 'bas.flat': 'stable', 'bas.nd': 'trop peu testé',
  'bas.proj': 'Si la tendance continue : projection à 30 jours',
  'bas.projDesc': "La ligne pointillée prolonge la tendance actuelle, en la freinant peu à peu. La zone colorée contient 8 chances sur 10 du résultat si rien ne change dans la dynamique. Ce n'est pas une prévision.",
  'bas.lgObs': 'Moyenne observée', 'bas.lgProj': 'Tendance prolongée', 'bas.lgCone': 'Fourchette à 80 %', 'bas.future': 'Projection',
  'bas.warn': "Projection et probabilités sont des calculs de La Sonde à partir des sondages publiés, pas des sondages. Une campagne change souvent de dynamique : un événement suffit à casser une tendance.",
  'baro.title': "Baromètre d'incertitude", 'baro.very': 'course très ouverte', 'baro.open': 'course ouverte', 'baro.closed': 'course resserrée',
  'baro.lo': 'Duel joué d’avance', 'baro.hi': 'Tout est possible',
  'baro.desc': 'Probabilité que le second tour ne soit <b>pas</b> le duel actuellement en tête des sondages ({a} – {b}, {p} % de chances selon le modèle), si les candidats testés se présentent tous.',
  'alt.title': 'Bascules possibles', 'alt.rank': '{r}e et {r2}e places', 'alt.gap': 'écart {g} pt', 'alt.conv': 'les courbes se rapprochent',
  'alt.p': "de chances d'inversion d'ici un mois", 'alt.none': 'Aucune inversion de classement probable dans le mois parmi les candidats régulièrement testés.',
  'dec.tag': 'Le dernier sondage, décrypté', 'dec.for': 'pour', 'dec.meta': 'Terrain achevé le {d} · {n} personnes · {h} hypothèses testées',
  'dec.raw': 'Score publié', 'dec.he': 'Effet institut', 'dec.corr': 'Corrigé', 'dec.avg': 'Moyenne', 'dec.avgList': 'Moyenne (même liste)', 'dec.diff': 'Écart',
  'dec.ok': 'Conforme à la moyenne une fois corrigé', 'dec.out': '{c} {dir} de la moyenne ({d} pt)', 'dec.above': 'au-dessus', 'dec.below': 'en dessous',
  'dec.newList': 'Liste de candidats inédite : comparaison indicative',
  'dec.note': "Effet institut : écart habituel de cet institut pour ce candidat, mesuré sur 8 mois. On compare l'hypothèse publiée à la moyenne des sondages qui testent exactement la même liste de candidats. Un écart de plus de 1,5 pt est signalé."
});
Object.assign(window.I18N.en, {
  'nav.bascule': 'Momentum',
  'chg.title': "Today's 3 signals", 'chg.card': 'Shareable daily card',
  'bas.tag': 'Momentum detector', 'bas.title': 'Who is really moving?',
  'bas.desc': 'An arrow appears only when the five-week trend rises above statistical noise (at least 90% confidence). Everything else is stable, even if the numbers seem to move.',
  'bas.mom': '14-day trend', 'bas.momDesc': 'Slope of polls adjusted for house effects. Click a name to add it to the projection.',
  'bas.st.up': 'Clearly rising', 'bas.st.down': 'Clearly falling', 'bas.st.flat': 'Stable', 'bas.st.nd': 'Too few polls',
  'bas.conf': '{p}% confidence', 'bas.flat': 'stable', 'bas.nd': 'rarely polled',
  'bas.proj': 'If trends continue: 30-day projection',
  'bas.projDesc': 'The dotted line extends the current trend, slowing it gradually. The shaded area holds 8 in 10 outcomes if the dynamics do not change. This is not a forecast.',
  'bas.lgObs': 'Observed average', 'bas.lgProj': 'Extended trend', 'bas.lgCone': '80% range', 'bas.future': 'Projection',
  'bas.warn': 'Projections and odds are La Sonde calculations based on published polls, not polls. Campaigns often change course: one event can break a trend.',
  'baro.title': 'Uncertainty gauge', 'baro.very': 'wide open race', 'baro.open': 'open race', 'baro.closed': 'tight race',
  'baro.lo': 'Run-off settled', 'baro.hi': 'Anything can happen',
  'baro.desc': 'Probability that the run-off will <b>not</b> be the pairing currently leading the polls ({a} – {b}, {p}% chance according to the model), assuming every tested candidate runs.',
  'alt.title': 'Possible swaps', 'alt.rank': '#{r} and #{r2}', 'alt.gap': '{g}-pt gap', 'alt.conv': 'lines converging',
  'alt.p': 'chance of trading places within a month', 'alt.none': 'No likely ranking swap within a month among regularly polled candidates.',
  'dec.tag': 'Latest poll, decoded', 'dec.for': 'for', 'dec.meta': 'Fieldwork ended {d} · {n} respondents · {h} scenarios tested',
  'dec.raw': 'Published', 'dec.he': 'House effect', 'dec.corr': 'Adjusted', 'dec.avg': 'Average', 'dec.avgList': 'Average (same line-up)', 'dec.diff': 'Gap',
  'dec.ok': 'In line with the average once adjusted', 'dec.out': '{c} {dir} the average ({d} pts)', 'dec.above': 'above', 'dec.below': 'below',
  'dec.newList': 'New line-up: comparison is indicative only',
  'dec.note': "House effect: this pollster's usual gap for this candidate, measured over 8 months. The published scenario is compared with the average of polls testing exactly the same line-up. Gaps above 1.5 pts are flagged."
});
Object.assign(window.I18N.fr, { 'gh.vote': 'Vote', 'gh.dm': 'J-{d}', 'gh.last': 'Dernier sondage · J-{d}', 'is.missing': ". Thèmes absents d'une vague : non publiés pour cette vague." });
Object.assign(window.I18N.en, { 'gh.vote': 'Vote', 'gh.dm': 'D-{d}', 'gh.last': 'Latest poll · {d} days out', 'is.missing': '. Themes missing from a wave were not published for that wave.' });
Object.assign(window.I18N.fr, {"nav.cands": "Candidats", "cf.tag": "Fiches", "cf.title": "Une page par candidat", "cf.desc": "Moyenne, tendance, probabilités, derniers sondages et effets instituts : tout ce qu'il faut savoir sur chaque candidat suivi.", "cf.go": "Voir la fiche", "cf.hint": "Fiches candidats"});
Object.assign(window.I18N.en, {"nav.cands": "Candidates", "cf.tag": "Profiles", "cf.title": "One page per candidate", "cf.desc": "Average, trend, odds, latest polls and house effects: everything about each candidate we track (pages in French).", "cf.go": "View profile", "cf.hint": "Candidate profiles"});
Object.assign(window.I18N.fr, {
  'nav.whatif': 'Et si… ?', 'wi.tag': 'Simulateur', 'wi.title': 'Et si… un candidat se retirait ?',
  'wi.desc': "Retirez un ou plusieurs candidats : le site redistribue leurs électeurs et affiche les nouveaux scores du premier tour, avec une fourchette. Chaque résultat dit s'il est mesuré dans des sondages ou estimé.",
  'wi.who': 'Qui se retire ?', 'wi.whoDesc': 'Cliquez sur un ou plusieurs candidats pour les retirer.', 'wi.examples': 'Exemples',
  'wi.preset': 'Sans {c}', 'wi.reset': 'Tout réinitialiser', 'wi.res': 'Premier tour simulé',
  'wi.pick': 'Choisissez au moins un candidat à retirer.',
  'wi.base': "Point de départ : la liste la plus complète réellement testée par les instituts, complétée des candidats déclarés rarement testés, dont les voix sont prises surtout à leurs voisins politiques. Les scores sont un peu plus bas que la moyenne générale, mesurée le plus souvent sur des listes plus courtes.",
  'wi.noteMatch': "Des instituts ont déjà testé cette configuration : résultats issus de {n} enquête(s), la dernière le {d}, corrigées des effets instituts.",
  'wi.noteChain': "Aucun institut n'a testé cette configuration : les voix sont redistribuées selon les reports mesurés dans les sondages quand ils existent, sinon selon la proximité politique. Plusieurs retraits sont traités en cascade.",
  'wi.lvPoll': 'testé', 'wi.lvMeas': 'mesuré', 'wi.lvEst': 'estimé',
  'wi.lgPoll': 'cette liste a été testée par des instituts', 'wi.lgMeas': 'reports observés dans les sondages', 'wi.lgEst': 'reports supposés selon la proximité politique (le plus fragile)',
  'wi.warn': "Simulation de La Sonde à partir des sondages publiés, pas un sondage. Les reports de voix réels dépendront de la campagne, des consignes et du contexte du retrait. Les résultats « estimés » reposent sur des positions politiques indicatives, publiées dans la méthode."
});
Object.assign(window.I18N.en, {
  'nav.whatif': 'What if?', 'wi.tag': 'Simulator', 'wi.title': 'What if a candidate dropped out?',
  'wi.desc': 'Remove one or more candidates: the site redistributes their voters and shows the new first-round scores, with a range. Each result says whether it is measured in polls or estimated.',
  'wi.who': 'Who drops out?', 'wi.whoDesc': 'Click one or more candidates to remove them.', 'wi.examples': 'Examples',
  'wi.preset': 'Without {c}', 'wi.reset': 'Reset', 'wi.res': 'Simulated first round',
  'wi.pick': 'Pick at least one candidate to remove.',
  'wi.base': 'Starting point: the most complete line-up actually polled, plus rarely polled declared candidates, whose votes are taken mainly from their political neighbours. Scores are slightly lower than the overall average, which mostly comes from shorter line-ups.',
  'wi.noteMatch': 'Pollsters have already tested this line-up: results from {n} survey(s), latest {d}, adjusted for house effects.',
  'wi.noteChain': 'No pollster has tested this line-up: votes are redistributed using transfers measured in polls where available, otherwise by political proximity. Several withdrawals are handled in cascade.',
  'wi.lvPoll': 'tested', 'wi.lvMeas': 'measured', 'wi.lvEst': 'estimated',
  'wi.lgPoll': 'this line-up has been tested by pollsters', 'wi.lgMeas': 'transfers observed in polls', 'wi.lgEst': 'transfers assumed from political proximity (least reliable)',
  'wi.warn': 'A La Sonde simulation based on published polls, not a poll. Real vote transfers will depend on the campaign, endorsements and the circumstances of the withdrawal. "Estimated" results rely on indicative political positions, published in the method.'
});
Object.assign(window.I18N.fr, { 'wi.posT': 'Positions gauche (0) – droite (10) utilisées par le simulateur', 'wi.calT': 'Réglages recalculés sur {n} reports mesurés : abstention {a} %, portée de proximité {l}, effet de taille {s}' });
Object.assign(window.I18N.en, { 'wi.posT': 'Left (0) – right (10) positions used by the simulator', 'wi.calT': 'Settings fitted to {n} measured transfers: abstention {a}%, proximity range {l}, size effect {s}' });
Object.assign(window.I18N.fr, { 'nav.more': 'Plus', 'nav.menu': 'Menu' });
Object.assign(window.I18N.en, { 'nav.more': 'More', 'nav.menu': 'Menu' });
Object.assign(window.I18N.fr, {"meta.title": "Sondages présidentielle 2027 : moyenne, tendances et probabilités | La Sonde", "meta.desc": "Tous les sondages de la présidentielle 2027 en un coup d'œil : moyenne corrigée des effets instituts, tendances, probabilités de qualification, simulateur de retraits. Mis à jour chaque jour."});
Object.assign(window.I18N.en, {"meta.title": "French presidential election 2027 polls: average, trends and odds | La Sonde", "meta.desc": "Every poll for France's 2027 presidential election at a glance: house-effect-adjusted average, trends, run-off odds, withdrawal simulator. Updated daily."});
Object.assign(window.I18N.fr, {"sh.title": "Partager :", "sh.copy": "Copier le lien"});
Object.assign(window.I18N.en, {"sh.title": "Share:", "sh.copy": "Copy link"});

Object.assign(window.I18N.fr, {"nav.solid": "Solidité du vote", "so.tag": "Volatilité", "so.title": "La solidité du vote", "so.desc": "Deux candidats à 15 % peuvent avoir des électorats très différents : l'un fidèle, l'autre prêt à partir. La partie pleine de chaque barre est son socle (électeurs sûrs de leur choix), la partie hachurée ce qui peut encore bouger.", "so.key": "Aujourd'hui, {a} % des électeurs qui expriment une intention de vote se disent sûrs de leur choix, {b} % pourraient encore changer d'avis.", "so.most": "Le plus gros réservoir mobile : {n}, dont {p} % des électeurs peuvent encore changer d'avis, soit environ {v} points.", "so.sure": "{p} % sûrs de leur choix", "so.lgSure": "Socle : électeurs sûrs de leur choix", "so.lgSoft": "Électeurs qui pourraient changer d'avis", "so.src": "Socle estimé = moyenne La Sonde × part des électeurs sûrs de leur choix mesurée par {inst} pour {sp} ({f}, {n} inscrits, {h}). <a href=\"{u}\" target=\"_blank\" rel=\"noopener\">Rapport</a>. Seuls les candidats de cette liste sont mesurés. Estimation de La Sonde, pas un sondage."});

Object.assign(window.I18N.en, {"nav.solid": "Vote firmness", "so.tag": "Volatility", "so.title": "How firm is the vote?", "so.desc": "Two candidates at 15% can have very different electorates: one loyal, the other ready to leave. The solid part of each bar is the core (voters sure of their choice), the hatched part is what can still move.", "so.key": "Today, {a}% of voters with a stated intention say they are sure of their choice; {b}% could still change their mind.", "so.most": "Largest movable pool: {n}, {p}% of whose voters could still change their mind, about {v} points.", "so.sure": "{p}% sure of their choice", "so.lgSure": "Core: voters sure of their choice", "so.lgSoft": "Voters who could change their mind", "so.src": "Estimated core = La Sonde average × share of voters sure of their choice measured by {inst} for {sp} ({f}, {n} registered voters, {h}). <a href=\"{u}\" target=\"_blank\" rel=\"noopener\">Report</a>. Only candidates in that line-up are measured. La Sonde estimate, not a poll."});

Object.assign(window.I18N.fr, {"vt.accueil": "Accueil", "vt.simuler": "Simuler", "vt.tour2": "Second tour", "vt.comprendre": "Comprendre", "vt.opinion": "Opinion", "vt.donnees": "Sondages", "vt.apropos": "Méthode", "ex.tag": "Aller plus loin", "ex.title": "Explorer La Sonde", "ex.etsi": "Et si… ?", "ex.etsiD": "Retirez un candidat et voyez où vont ses électeurs.", "ex.second": "Second tour", "ex.secondD": "Tous les duels testés, en moyenne des sondages.", "ex.proba": "Probabilités", "ex.probaD": "Les chances de chacun d'accéder au second tour.", "ex.bascule": "Bascule", "ex.basculeD": "Qui monte, qui baisse vraiment, et qui pourrait se croiser.", "ex.ghosts": "Comme en 2022", "ex.ghostsD": "Les sondages de 2022 à la même date, puis le résultat.", "ex.reports": "Reports de voix", "ex.reportsD": "Les transferts mesurés quand un candidat sort de la liste.", "ex.enjeux": "Ce qui préoccupe", "ex.enjeuxD": "Pouvoir d'achat, sécurité, immigration… et selon chaque électorat.", "ex.quiz": "Quiz des enjeux", "ex.quizD": "Vos priorités ressemblent à celles de quel électorat ?", "ex.polls": "Tous les sondages", "ex.pollsD": "Chaque enquête avec ses mentions légales, et les effets instituts.", "ex.method": "Méthode", "ex.methodD": "Comment la moyenne et les probabilités sont calculées."});

Object.assign(window.I18N.en, {"vt.accueil": "Home", "vt.simuler": "Simulate", "vt.tour2": "Run-off", "vt.comprendre": "Understand", "vt.opinion": "Opinion", "vt.donnees": "Polls", "vt.apropos": "Method", "ex.tag": "Go further", "ex.title": "Explore La Sonde", "ex.etsi": "What if?", "ex.etsiD": "Remove a candidate and see where their voters go.", "ex.second": "Run-off", "ex.secondD": "Every match-up tested, as a poll average.", "ex.proba": "Probabilities", "ex.probaD": "Each candidate's chances of reaching the run-off.", "ex.bascule": "Momentum", "ex.basculeD": "Who is really rising or falling, and who may cross.", "ex.ghosts": "Like in 2022", "ex.ghostsD": "2022 polls at the same date, then the result.", "ex.reports": "Vote transfers", "ex.reportsD": "Measured transfers when a candidate leaves the line-up.", "ex.enjeux": "What worries voters", "ex.enjeuxD": "Cost of living, security, immigration… by electorate.", "ex.quiz": "Issues quiz", "ex.quizD": "Which electorate shares your priorities?", "ex.polls": "All polls", "ex.pollsD": "Every survey with its legal details, and pollster effects.", "ex.method": "Method", "ex.methodD": "How the average and probabilities are computed."});

Object.assign(window.I18N.fr, {"po.new": "Nouveau"});

Object.assign(window.I18N.en, {"po.new": "New"});

Object.assign(window.I18N.fr, {"hero.kickerS": "2027 · en direct", "hero.fresh": "Mis à jour {a}", "hero.last": "dernier sondage : {i} ({s}), {d}", "sh.btn": "Partager"});

Object.assign(window.I18N.en, {"hero.kickerS": "2027 · live", "hero.fresh": "Updated {a}", "hero.last": "latest poll: {i} ({s}), {d}", "sh.btn": "Share"});

Object.assign(window.I18N.fr, {"nl.title": "Le point du lundi", "nl.text": "Chaque lundi matin, la moyenne des sondages, ce qui a bougé et les sondages de la semaine, dans votre boîte mail. Gratuit, désinscription en un clic.", "nl.cta": "Recevoir la lettre", "nl.archive": "Lire les anciens numéros", "ft.whoLink": "Qui sommes-nous ?"});

Object.assign(window.I18N.en, {"nl.title": "The Monday briefing", "nl.text": "Every Monday morning: the poll average, what moved and the week's polls, in your inbox (in French). Free, unsubscribe in one click.", "nl.cta": "Get the newsletter", "nl.archive": "Past issues", "ft.whoLink": "About us"});
