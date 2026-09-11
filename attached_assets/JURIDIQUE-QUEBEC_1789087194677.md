# Soliris et le droit québécois — ce qui te protège, ce qui protège l'utilisateur

Recherche faite sur les sources officielles et professionnelles, en septembre
2026. **Je ne suis pas juriste.** Ce document sert à préparer une consultation,
pas à la remplacer — et il indique où se trouvent les vrais risques.

---

## 1. Le risque le plus lourd : l'inscription auprès de l'AMF

C'est le seul point qui peut coûter davantage qu'un remboursement.

Le guide d'inscription de l'AMF pose l'obligation de s'inscrire dès qu'on
exerce une activité de conseil sur des valeurs mobilières **de façon
régulière, continue ou répétitive**, avec rémunération. L'analyse retient
trois facteurs : le caractère répétitif, la rémunération prévue, et
l'exercice direct ou indirect de l'activité.

Une exception compte pour toi : les conseils **de nature générale**, non
adaptés à la situation d'une personne en particulier (bulletins, articles,
outils génériques), n'y sont pas soumis.

**Ce qui fait pencher d'un côté ou de l'autre — et c'est ton vocabulaire qui
décide :**

*Du bon côté (outil).* L'utilisateur connecte **son** compte chez **son**
courtier, définit **ses** règles, choisit ses seuils, et les ordres partent
vers son compte à lui. Tu ne détiens ni fonds ni titres. Soliris est alors un
instrument que l'utilisateur configure — comme un tableur qui passerait des
ordres.

*Du mauvais côté (conseil).* Vendre par abonnement des « signaux », des
« recommandations », des « meilleures actions à acheter », ou tout ce qui est
présenté comme adapté au profil de l'utilisateur. Là, la rémunération et la
répétition sont réunies, et la question de l'inscription se pose vraiment.

**Conséquence pratique, à appliquer partout — page tarifs, publicité,
libellés de boutons :** parler de *règles que vous définissez*, de
*surveillance*, d'*exécution automatisée de vos consignes*. Éviter *signal*,
*recommandation*, *conseil*, *notre stratégie*, *rendement attendu*. Le code
utilise déjà le mot « signal » en interne — ce n'est pas grave tant qu'il ne
remonte pas dans ce que tu vends.

C'est le point à valider avec un avocat en valeurs mobilières **avant** la
première vente, pas après.

---

## 2. Loi 25 — huit obligations concrètes, dont une qui te concerne déjà

Applicable à toute entreprise québécoise qui traite des renseignements
personnels. Les tiens sont sensibles : identifiants de courtage, historique
d'ordres.

1. **Désigner un responsable de la protection des renseignements personnels.**
   Par défaut, c'est la personne ayant la plus haute autorité — donc toi. Son
   **titre et ses coordonnées doivent figurer sur le site**.
2. **Politique de confidentialité** en langage clair et simple, facilement
   accessible : types de renseignements collectés, finalités, moyens de
   collecte, droits des personnes, coordonnées du responsable.
3. **Consentement manifeste, libre, éclairé, à des fins déterminées.**
   Explicite pour les renseignements sensibles — ce qui est ton cas.
4. **Évaluation des facteurs relatifs à la vie privée (EFVP)** avant certaines
   collectes et utilisations, **et notamment avant toute communication hors du
   Québec**. ⚠ *Héberger sur Replit, c'est héberger aux États-Unis.* Cette
   obligation-là est déjà déclenchée aujourd'hui.
5. **Registre des incidents de confidentialité**, avec notification à la
   Commission d'accès à l'information et aux personnes concernées en cas de
   risque de préjudice sérieux.
6. **Droits des personnes** : accès, rectification, suppression (« droit à
   l'oubli »), portabilité.
7. **Formation** des personnes qui manipulent les données, documentée.
8. **Destruction ou anonymisation** quand les données ne sont plus
   nécessaires, selon un calendrier de conservation établi.

Le plus urgent : la politique de confidentialité, tes coordonnées comme
responsable, et l'EFVP liée à l'hébergement hors Québec.

---

## 3. Loi sur la protection du consommateur — trois clauses nulles

Le contrat d'abonnement est un contrat de consommation conclu à distance. Il
obéit aux articles 214.1 à 214.11 de la LPC.

**Mentions obligatoires** dans le contrat écrit : identité du commerçant et du
consommateur, coordonnées, durée et date d'expiration, description détaillée
des services, tarif de chaque service et frais, total des débours mensuels,
restrictions d'utilisation, conditions de résiliation et frais applicables.
Ta page tarifs doit porter tout cela — pas seulement un prix.

**Renouvellement automatique** : permis vers une durée indéterminée si
l'abonnement initial dépasse 60 jours, et un avis écrit doit être transmis
entre le 90e et le 60e jour précédant le renouvellement.

**Résiliation** : le consommateur peut résilier en tout temps par avis écrit,
avec une indemnité plafonnée.

**Trois clauses sont nulles**, et ce sont des pièges fréquents :

- la clause d'**arbitrage** ;
- la clause écartant l'**application du droit québécois** ;
- la **modification unilatérale** sans consentement.

La troisième était dans ma première version des conditions : « la poursuite de
l'utilisation vaut acceptation ». C'est précisément ce que la loi refuse.
Corrigé : toute modification substantielle est notifiée à l'avance, avec son
texte et sa date, et le client peut la refuser et résilier sans frais.

---

## 4. Ce qui te protège, et ce qui protège l'utilisateur

**Ce qui te protège** — et qui est maintenant écrit dans les conditions :

- La **description exacte** de ce que fait le produit. Une clause qui décrit
  autre chose que ce que tu vends ne protège pas : elle t'expose. C'était le
  défaut de l'ancienne version, qui affirmait ne toucher à aucun compte de
  courtage.
- L'affirmation que tu **n'es pas un conseiller inscrit** et que rien n'est
  une recommandation.
- Le mode **paper par défaut**, le mode live activé explicitement par
  l'utilisateur : c'est lui qui décide, et c'est traçable.
- Les garde-fous présentés comme des **outils d'aide, pas des garanties**.
  Promettre qu'un coupe-circuit protège, c'est s'engager à ce qu'il protège.
- Le **relevé du courtier fait foi** en cas de désaccord sur une exécution.
- Ta **journalisation** : la table `audit_log` et `rejected_signals` prouvent
  ce que le système a fait et pourquoi. En litige, c'est ta meilleure défense.

**Ce qui protège l'utilisateur** — et que tu ne peux pas écarter :

- Les recours impératifs de la loi sur la consommation. Une clause qui prétend
  les exclure est nulle, et fragilise le reste du document.
- Le droit de résilier en tout temps.
- L'avis avant renouvellement automatique.
- L'accès, la rectification et la suppression de ses renseignements.
- L'information complète **avant** la conclusion du contrat.

---

## 5. Ce que l'application doit dire quand ça ne marche pas

C'est ta question — et c'est autant du produit que du droit. Une panne
silencieuse sur un outil qui passe des ordres, c'est le scénario où la
responsabilité se discute vraiment.

**Ce qui existe déjà** (vérifié dans le code) : `TradingModeBanner` signale le
mode live, `ApiStatusModal` affiche l'état des intégrations, les signaux
refusés sont conservés dans `rejected_signals` avec leur motif, et le
coupe-circuit envoie `notifyKillSwitchActivated` et `notifyDailyLossWarning`.
La plomberie est là.

**Ce qui manque, par ordre d'importance :**

1. **Une confirmation explicite avant d'activer le mode live**, nommant le
   risque en toutes lettres : des ordres réels partiront sur ton compte, y
   compris en ton absence. Une case à cocher, horodatée et journalisée.
2. **Un état du système toujours visible** : données de marché à jour ou non,
   courtier joignable ou non, automatisation active ou en pause. Aujourd'hui
   il faut ouvrir une fenêtre pour le savoir.
3. **Mettre l'automatisation en pause quand les données sont périmées ou le
   courtier injoignable**, et le dire. Agir sur des cours périmés est pire que
   ne rien faire.
4. **Rendre les signaux refusés visibles dans l'interface.** Ils sont en base
   mais l'utilisateur ne les voit pas : il croit que rien ne s'est passé alors
   qu'une décision a été prise et écartée.
5. **Notifier chaque ordre refusé, retardé ou partiellement exécuté**, avec le
   motif rendu par le courtier.
6. **Un bouton d'arrêt d'urgence** coupant le mode live et toutes les règles
   d'un seul geste, atteignable depuis n'importe quelle page.

Les points 1, 3 et 6 sont ceux qu'un juriste regardera en premier.

---

## Sources

- Autorité des marchés financiers — *Guide sur les obligations relatives à
  l'inscription d'une société* (critères d'inscription, exception des conseils
  de nature générale, catégories)
- Loi 25 — synthèses des obligations pour les entreprises (responsable, EFVP,
  registre d'incidents, droits, destruction)
- BLG — *Abonnements à des services numériques et autres services fournis à
  distance au Québec* (art. 214.1 à 214.11 LPC, renouvellement, résiliation,
  clauses interdites)
- Office de la protection du consommateur — contrats conclus à distance
