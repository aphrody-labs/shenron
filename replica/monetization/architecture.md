# Architecture commerciale — Shenron / Dragon Ball France

## Stack

| couche     | choix                                                                                  | raison                                                                                                |
| ---------- | -------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Site       | Next.js App Router déjà déployé dans `apps/site`                                       | Un seul produit et ses routes admin existantes.                                                       |
| API        | Contrats Shenron + handlers Next/Bun.serve existants                                   | Pas de service parallèle ni d'exposition DB au navigateur.                                            |
| Base       | PostgreSQL existant, Drizzle                                                           | Source de vérité déjà utilisée pour comptes et données du site.                                       |
| Auth       | Better Auth avec Google/Discord, identifiants e-mail, passkeys, TOTP et OAuth Shenron  | Une identité DBFR commune avec association explicite des fournisseurs.                                |
| Paiement   | Stripe Checkout/Billing principal ; PayPal Subscriptions complémentaire                | Checkout hébergé réduit le périmètre de données de carte. Provider et événements idempotents en base. |
| Publicité  | Sponsoring direct après validation des campagnes ; AdSense en remplissage conditionnel | Contrôle de l'inventaire, des créatifs, du consentement et de l'expérience de lecture.                |
| Opérations | Déploiement et secrets via Aphrody Infra                                               | Le dépôt fournit migration et artefact ; il ne modifie pas la production directement.                 |

## Modèle de revenus

- **Accès gratuit** : catalogue et contenus éditoriaux publics, soutenus par des annonces compatibles avec le consentement.
- **VIP récurrent** : prix affichés par le produit actuel : 4,99 € par mois ou 49,90 € par an. Valeur à vendre : retrait des publicités et fonctions communautaires/de confort effectivement disponibles. Les montants nets dépendent des frais prestataire, remboursements et fiscalité ; aucun revenu n'est garanti par ces prix.
- **Dons** : soutien ponctuel non récurrent (tiers proposés : 2 €, 5 €, 15 €, 50 €, minimum libre 1 €). Don anonyme masqué dans l'affichage public ; comptabilité et identité de paiement restent privées.
- **Sponsoring direct** : forfait convenu par contrat, facturation et campagne approuvée. Les premiers emplacements sont contextuels, sans ciblage utilisateur ni traceur ; ne pas activer de mesure côté client avant revue CMP/juridique. Démarrer avec un inventaire faible, clairement identifié « publicité/partenariat » et une limite de fréquence.
- **Régie de remplissage** : le code AdSense est déjà intégré ; garder la diffusion désactivée jusqu’à vérification du compte approuvé et de la CMP certifiée effectivement configurée. Le bandeau analytics de Shenron ne prouve pas l’existence d’une CMP Google/TCF. Google Ad Manager apporte du yield management mais augmente la charge d'opération et n'est pas le premier choix au trafic actuel inconnu.

Mesurer avant d'ajuster : revenu net par visiteur consentant, taux d'acceptation CMP, conversion visite→VIP, churn mensuel, taux d'échec de paiement, remboursements/chargebacks, fill-rate et revenu par mille impressions. Ne pas publier de prévision avant une baseline issue des données agrégées réelles. Les annonces ne doivent pas gêner le lecteur, et tout avantage payant relatif à un contenu protégé requiert un droit explicite de commercialisation.

## Schéma cible

Les tables historiques `ba_subscription`, `site_donations` et `site_ad_slots` sont déjà présentes. Les migrations historiques restent immuables. Étendre le modèle par migrations incrémentales ; monnaie entière en unités mineures, horodatages UTC, montants toujours serveur, droits calculés depuis l'état webhook vérifié.

Tables cibles :

1. `ba_subscription` (existante) : conserver Stripe et y ajouter le provider externe PayPal ou normaliser vers `site_subscriptions`; le propriétaire est `referenceId` → `ba_user.id`.
2. `site_donations` (existante) : ajouter provider/external payment ids et statut de rapprochement ; `userId ON DELETE SET NULL` pour préserver la comptabilité après suppression de compte.
3. `site_billing_webhook_events` : clé unique `(provider, eventId)`, horodatage de réception et traitement. Migration `0029` ajoutée pour Stripe/PayPal ; réception et mutation métier Stripe partagent une transaction, le rejeu ne double pas l'attribution.
4. `site_advertisers` : compte annonceur, raison sociale/contact, statut de validation et référence contractuelle.
5. `site_ad_campaigns` : propriétaire annonceur, nom, statut, période, budget cents, devise, plafond quotidien et approbation éditoriale.
6. `site_ad_creatives` : campagne, format, image/texte/URL validés, locale, statut, checksum ; jamais de HTML/script libre.
7. `site_ad_placements` : clé d'emplacement, formats admis, pages autorisées/interdites, état, stratégie de consentement, exemption VIP.
8. `site_ad_campaign_placements` : relation contrôlée campagne/emplacement ; une campagne ne peut être activée ni diffusée hors des placements explicitement choisis.
9. `site_ad_events_daily` : agrégats journaliers par campagne/placement, compteurs sans identifiant visiteur ; rétention finie et seuils anti-réidentification.
10. `site_billing_audit` : acteur système/admin, action, référence métier, date ; aucun payload webhook complet ni donnée carte.

Accès : pas de RLS car le site utilise son pool serveur PostgreSQL partagé. Chaque lecture/écriture passe par dépôt serveur avec contrôle de session et rôle admin. Les utilisateurs ne peuvent lire que leur propre abonnement/don ; les webhooks sont l'unique writer d'état financier ; seuls les admins peuvent gérer l'inventaire et consulter les agrégats.

Les contraintes du schéma SQL cible sont dans [`schema.sql`](schema.sql).

## API et parcours

| méthode / chemin                           | action                                                            | accès                   | données principales                | flow    |
| ------------------------------------------ | ----------------------------------------------------------------- | ----------------------- | ---------------------------------- | ------- |
| GET `/signin`                              | connexion Better Auth, fournisseurs disponibles par configuration | public                  | callback interne nettoyé           | F01     |
| POST `/api/stripe/subscribe`               | créer session Checkout sur plan allowlisté                        | session requise         | `planKey`                          | F02     |
| POST `/api/stripe/webhook`                 | confirmer Checkout et synchroniser statut                         | Stripe signature brute  | event signé                        | F03     |
| POST `/api/stripe/portal`                  | créer session portail                                             | propriétaire de session | retour interne fixe                | F04     |
| POST `/api/paypal/subscribe`               | créer subscription PayPal                                         | session requise         | plan serveur                       | F06     |
| POST `/api/paypal/subscription/cancel`     | annuler à la fin de la période                                    | propriétaire de session | subscription ID vérifié            | F06     |
| POST `/api/paypal/webhook`                 | vérifier signature PayPal et appliquer événements                 | PayPal signature API    | event idempotent                   | F06     |
| POST `/api/stripe/donate`                  | Checkout pour montant borné                                       | session requise         | montant/tiers validés côté serveur | F05     |
| GET `/api/account/billing`                 | état abonnement + liens de gestion                                | session du propriétaire | aucune donnée carte                | F04     |
| GET/POST/PATCH `/api/admin/monetization/*` | plans, dons, rapprochement, campagnes, placements                 | admin existant          | Zod + audit                        | F08/F09 |
| GET `/api/ads/campaigns`                   | campagne approuvée sur emplacement autorisé                       | public, filtrage VIP    | locale, route, placement           | F10     |
| GET `/api/ads/click`                       | vérifier campagne et rediriger vers annonceur                     | public                  | création, placement, route         | F10     |

Les routes Checkout Stripe, dons Stripe, portail Stripe, abonnement/don/capture/annulation PayPal, leurs webhooks et l’API admin de monétisation sont présentes dans le worktree. La diffusion directe renvoie au plus vingt créations approuvées, mélangées côté base ; la route d’impression revalide campagne, création, emplacement, route, dates et droits VIP avant d’agréger l’impression. Les clics passent par une route qui revalide la création avant redirection. L’admin couvre annonceurs, approbation des créations, campagnes, placements et compteurs quotidiens ; son interface est localisée en français, anglais et japonais. Les impressions et clics restent agrégés sans identifiant visiteur ; ils ne modifient jamais `spendMinor` et ne déclenchent aucune facturation. Le montant est un forfait contractuel, à rapprocher manuellement. La facturation des annonceurs, le rapprochement complet et la vérification live avec les fournisseurs restent des portes de livraison.

Les routes d’abonnement Stripe et PayPal verrouillent la ligne Better Auth du compte puis créent une réservation unique par utilisateur dans `site_subscription_checkout_reservations`. La réservation partagée bloque les parcours simultanés et réutilise une clé idempotente stable pour les reprises vers le même fournisseur et le même plan. Elle expire après 24 heures et est supprimée lorsque l’abonnement est enregistré localement.

L’authentification présente des associations sociales explicites depuis `/settings`; un compte Google ou Discord peut ajouter une méthode e-mail/mot de passe par lien de réinitialisation, sans créer de second utilisateur. SMTP utilise par défaut `contact@aphrody.com` sur `ssl0.ovh.net:465`; seul `SMTP_PASSWORD` doit être provisionné, sans jamais l’enregistrer dans le dépôt. Les passkeys, TOTP, codes de secours, récupération e-mail et OAuth Shenron sont configurés côté Better Auth.

Le connecteur Stripe disponible donne accès à un compte sandbox : le produit VIP et ses tarifs actifs correspondent aux montants du catalogue applicatif (4,99 EUR/mois et 49,90 EUR/an). Ce contrôle ne prouve pas la configuration des Price IDs du serveur ni l’existence d’un catalogue ou d’un endpoint live. Aucun compte PayPal lié n’est disponible pour qualification réelle. Les mutations de production attendent les secrets propres à chaque fournisseur, les migrations exécutées par Aphrody Infra et les sondes end-to-end.

Événements Stripe : signature avec le corps brut ; `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`, `customer.subscription.created|updated|deleted`, `invoice.paid|payment_failed`, refund/dispute nécessaires selon les capacités activées. Webhooks jamais facultatifs pour activer un droit récurrent.

Événements PayPal : vérifier le webhook avec l'API officielle de vérification ; traiter `BILLING.SUBSCRIPTION.ACTIVATED|UPDATED|CANCELLED|SUSPENDED|EXPIRED`, `BILLING.SUBSCRIPTION.PAYMENT.FAILED` et notifications de paiement/remboursement. Dédupliquer par event ID.

Jobs : rapprochement quotidien prestataire ↔ DB, détection d'abonnements échus, expiration de campagnes, agrégation quotidienne des événements publicitaires et purge selon rétention approuvée. Aucune tâche ne crédite un compte à partir d'une redirection navigateur.

## Limites qui mordent

- Taxes : ne pas activer Stripe Tax avant que l'entité ait configuré ses registrations actives et que le catalogue ait les tax codes appropriés. Prix affiché, monnaie et conditions de renouvellement doivent être clairs.
- Idempotence : événement reçu plusieurs fois ou hors ordre ; table de réception unique, transitions monotones, relecture prestataire si événement ancien.
- Courses : double clic Checkout, deux abonnements actifs, webhook concurrent ; idempotency key et contrainte unique par provider/external ID/user-plan.
- Sécurité : URLs de retour construites depuis l'origine canonique, jamais `Host`; prix allowlistés; clés uniquement dans le gestionnaire de secrets Infra; webhooks vérifiés; pas de fuite d'erreurs prestataire.
- Auth : Better Auth partagé ; Discord existant, Google conditionnel, compte e-mail vérifié, lien magique, passkeys, TOTP/codes de secours et OAuth 2.1/OIDC. Association explicite seulement. Le login e-mail attend un fournisseur transactionnel configuré. La migration et le typecheck du plugin OAuth doivent passer le pin cohérent du lockfile avant activation. Callback URL interne seulement.
- Publicités : CMP avant tags non essentiels selon juridiction, inventaire légal uniquement, VIP sans annonces, aucun script tiers sur admin/Studio/desktop/staff. Créatifs sûrs et URLs allowlistées.
- Vie privée/comptabilité : minimiser PII, garder preuves financières requises séparées du profil supprimable, répondre aux demandes d'accès/suppression et documenter la durée de conservation.
- E-mail : reçus et échecs de paiement passent par fournisseur transactionnel, sans blocage du webhook ; retry avec outbox/job.

## Ordre de réalisation

1. Tranche verticale paiements Stripe : S01 → S02 → Checkout → webhook signé/idempotent → entitlement DB → S04/portail. Tables abonnement, webhook, audit ; prix de test dans sandbox séparé.
2. Dons : S03 → paiement confirmé → reçu → confidentialité/anonymat → rapprochement et remboursement.
3. PayPal : plans, abonnement/don, vérification des événements, rapprochement inter-provider et tests sandbox.
4. Back-office : S05 métriques, remboursements/états, audit ; campagnes directes et workflow d'approbation.
5. Consentement et diffusion publicitaire : S06, testées sur parcours public, VIP et zones staff ; intégration Google uniquement après acceptation du compte.

## Régies, agences et bibliothèques publicitaires

Une agence conseille/achète des campagnes pour ses marques clientes ; une régie vend son
portefeuille média ; un SSP connecte l’inventaire d’éditeurs à la demande programmatique ; une
bibliothèque JavaScript ne fournit à elle seule ni acheteurs ni revenus.

### Agences commerciales et brand partnerships

1. **Havas Play** est la piste de partenariat culturel la mieux alignée : ses services couvrent
   les communautés et fandoms, le gaming, l’entertainment, le brand content et les partenariats.
   Elle travaille côté marques ; ce n’est pas une régie qui annonce accepter l’inventaire de tiers.
   La solliciter pour une campagne sponsorisée, un contenu de marque ou une opération événementielle
   et demander si son équipe étudie les médias indépendants. Havas Media Network indique
   `new.biz@havasmn.com` pour les demandes new business ; demander le transfert à Havas Play
   ([services fandom/culture](https://havasmedianetwork.com/our-services/havas-play/),
   [contact new business](https://havasmedianetwork.com/contact/)).
2. **Dentsu France** est un groupe de stratégie et d’achat média plutôt qu’une place de marché
   éditeur. Son équipe new business peut orienter une proposition vers les équipes clientes
   pertinentes, sans garantie d’achat ni de référencement. Contact officiel :
   `dentsufrance-newbiz@dentsu.com`
   ([contact Dentsu France](https://www.dentsu.com/fr/fr/dentsu-france/contactez-nous)).
3. **Omnicom Media France** affiche un contact « New Business Enquiries » sur sa page officielle ;
   l’adresse y est protégée par Cloudflare, donc utiliser le contact publié plutôt qu’une adresse
   personnelle non confirmée. À approcher avec un kit média mesuré et une cible précise ; ce n’est
   pas une régie d’inscription éditeur ([contact officiel](https://omnicommedia.com/france/)).

### Régies, SSP et partenaires média

1. **Equativ** est le contact prioritaire côté monétisation programmatique : son offre éditeurs
   présente ad management, SSP et demande d’acheteurs/agences, mais aucun seuil public d’acceptation
   n’a été trouvé. Demander s’ils intègrent un éditeur tiers de niche, le minimum d’impressions,
   les pays, le partage de revenus, l’exclusivité et les exigences CMP
   ([offre éditeurs](https://www.equativ.com/publishers),
   [contact](https://www.equativ.com/fr/contactez-nous),
   [onboarding Open Bidding](https://www.equativ.com/ob-onlineonboarding)).
2. **Webedia Brand Xperiences** est pertinent pour les partenariats de marque et les expériences
   entertainment/gaming : brand content, communautés, influence et opérations spéciales. Ses pages
   présentent ses propres médias, talents et studios ; elles ne promettent pas de prendre en régie
   un site indépendant. À considérer pour une collaboration ou un aiguillage commercial, pas comme
   un adserver tiers ([WBX](https://fr.webedia-group.com/wbx),
   [contact](https://webedia-group.com/contact/)).
3. **Reworld MediaConnect** commercialise les médias du groupe dans des univers incluant
   Entertainment et Tech & Gaming, avec formulaire commercial public. Ses pages ne garantissent pas
   l’onboarding d’inventaires externes ;
   la demande utile porte plutôt sur les collaborations éditoriales ou les opportunités annonceur
   ([média gaming](https://www.reworldmediaconnect.com/nos-marques/tech-gaming/la-creme-du-gaming/),
   [contact](https://www.reworldmediaconnect.com/contact/)).
4. **Google AdSense** est une candidature à tester comme remplissage, sous réserve d’approbation
   du site et de conformité page par page. Google demande du contenu original et interdit les
   contenus qui enfreignent la propriété intellectuelle. Les pages avec scans ou épisodes doivent
   faire l’objet d’une vérification particulière et de justificatifs acceptés par le partenaire
   ([admission](https://support.google.com/adsense/answer/9724/eligibility-requirements-for-adsense?hl=en-uk),
   [règles éditeur](https://support.google.com/adsense/answer/10502938?hl=en)). Google Ad Manager
   peut ensuite piloter davantage d’inventaire ; sa page petite entreprise indique qu’un compte
   AdSense approuvé est requis ([Google Ad Manager](https://admanager.google.com/intl/en_uk/home/partner-solutions/small-business/)).
5. **Journey by Mediavine** est une option à tester si l’audience correspond à ses marchés : le
   site officiel affiche 1 000 sessions premium mensuelles pour Journey et 5 000 $ de revenus
   publicitaires annuels pour Mediavine Official ([critères](https://prod.mediavine.com/mediavine-requirements/),
   [contact](https://www.mediavine.com/contact/)).
6. **Raptive** reste à évaluer seulement après mesure des pays et pages vues. La page de critères
   officielle n’a pas pu être relue lors de la dernière vérification ; ne pas reprendre comme actuel
   le seuil historique de 50 % de trafic anglophone sans nouvelle confirmation
   ([critères Raptive](https://help.raptive.com/hc/en-us/articles/360032840891-Who-is-eligible-for-Raptive)).

### Bibliothèques techniques et consentement

- **Google Publisher Tag (GPT)** est le tag officiel de Google Ad Manager, pas une régie ni une
  bibliothèque React à ajouter. Le charger depuis le domaine Google et ne jamais mettre en cache
  sa bibliothèque ([guide GPT](https://developers.google.com/publisher-tag/guides/get-started),
  [bonnes pratiques](https://developers.google.com/publisher-tag/guides/general-best-practices)).
- **Prebid.js** est une bibliothèque open source de header bidding, pas un vendeur d’inventaire.
  La différer tant que Shenron n’a ni contrats avec plusieurs bidders, ni volume mesuré justifiant
  les enchères et leur gestion du consentement ([documentation Prebid](https://docs.prebid.org/)).
- **CMP** : pour AdSense/Ad Manager en EEE, Royaume-Uni et Suisse, Google exige une CMP certifiée
  intégrant le TCF pour servir des publicités personnalisées. La certification Google ne garantit
  pas à elle seule la conformité complète au TCF ou au droit applicable. La CMP Google Funding
  Choices et Didomi sont des pistes à vérifier dans l’annuaire en vigueur au moment du choix ; le
  bandeau maison actuel de Shenron ne remplace pas une CMP certifiée pour ce cas
  ([exigence](https://support.google.com/adsense/answer/13554020?hl=en-uk),
  [liste officielle CMP](https://support.google.com/adsense/answer/13554116?hl=en)). La CNIL rappelle
  que la publicité contextuelle simple ne nécessite pas en principe de traceurs, alors que mesure,
  plafonnement et prévention de fraude emploient souvent des traceurs soumis au consentement
  ([FAQ cookies CNIL](https://www.cnil.fr/fr/cookies-et-autres-traceurs/regles/cookies/FAQ)).

### État réel de l’intégration Shenron

- Le site possède déjà des unités AdSense manuelles configurées par variables d’environnement,
  un chargement public conditionnel et une route d’éligibilité qui masque les annonces aux membres
  VIP Stripe/PayPal. Le tag chargé aujourd’hui est `adsbygoogle.js`, pas GPT. Aucun identifiant de
  bloc n’est inventé ; sans configuration AdSense valide, les emplacements restent vides.
- Le garde de chemin exclut `/admin`, `/studio`, `/desktop` et les outils d’atelier staff. Le cache
  de droits VIP est privé, court et échoue en refusant les annonces si la base ne répond pas.
- **Point à corriger avant toute activation AdSense EEE** : le `ConsentGate` documenté dans le code est un
  bandeau interne axé sur l’analytics, et sa simple présence ne prouve pas qu’une CMP certifiée
  Google/TCF est installée ni que son flux est qualifié. Le chargement AdSense précède ce choix et
  peut faire apparaître le CMP Google configuré dans AdSense ; vérifier le compte, les messages de
  confidentialité, les signaux TCF et les refus dans un navigateur réel avant d’activer la diffusion.
  Les placements directs restent contextuels et ne doivent pas utiliser de traceurs avant consentement.
- Le dossier de candidature doit apporter les preuves de droits et de statut éditorial par type de
  page. Les règles de Google interdisent la monétisation de contenu qui enfreint les droits de tiers ;
  ne pas supposer que l’autorisation interne de publier des scans vaut autorisation de Google ou
  d’une autre régie de monétiser ces contenus.
- **Choix technique** : garder l’intégration AdSense existante pour un pilote si le compte est
  approuvé ; n’ajouter GPT que lors d’une migration réelle vers Google Ad Manager avec un réseau,
  des ad units et des line items configurés. N’introduire Prebid qu’après contrats actifs avec au
  moins deux bidders, un volume mesuré et une stratégie consentement/latence qualifiée.
- **Prospection** : Equativ est une cible d’onboarding SSP à qualifier par formulaire/contact ; son
  offre éditeur confirme les outils de monétisation/SSP mais ne publie pas de seuil d’admission garanti
  pour Shenron. Les agences et régies de contenu restent des pistes commerciales, sans promesse
  d’acceptation d’inventaire tiers.
- **Seuils de sélection** : Journey by Mediavine publie 1 000 sessions mensuelles ; le programme
  Mediavine principal publie 5 000 $ de revenu publicitaire annuel et examine aussi qualité de
  contenu, provenance de l’audience et expérience lecteur. Ces seuils ne préjugent pas de
  l’acceptation de dragonballfr.com ni des droits de monétisation
  ([critères Mediavine](https://prod.mediavine.com/mediavine-requirements/)).

Ordre recommandé : ventes directes à éditeurs manga, boutiques et organisateurs d’événements ;
demande de critères à Equativ ; candidature AdSense après revue éditoriale des pages ; approche
Havas Play ou d’une agence média avec un kit d’audience. Les sessions, pays, pages vues,
impressions, consentement et revenus de dragonballfr.com ne sont pas documentés ici : ne pas
annoncer de volume ou de RPM avant de relever des mesures Analytics réelles.

**Brouillon de prise de contact Equativ — non envoyé :**

> Bonjour,
>
> Nous exploitons dragonballfr.com, un site éditorial français consacré à Dragon Ball, avec une
> audience communautaire et des contenus de catalogue, d’actualité et de référence. Nous étudions
> la monétisation de certains emplacements publicitaires tout en préservant l’expérience de lecture.
>
> Pourriez-vous nous indiquer vos critères d’admission éditeur, les volumes minimaux éventuels, les
> formats disponibles, les conditions de rémunération et les exigences de consentement/CMP ? Nous
> pouvons transmettre nos chiffres d’audience par pays, appareil, pages vues et sessions après
> accord.
>
> Cordialement,
> Dragon Ball France

**Brouillon agence brand partnerships — non envoyé :**

> Bonjour,
>
> Nous exploitons dragonballfr.com, un média éditorial français autour de Dragon Ball et de la
> culture manga/anime. Nous préparons une offre de partenariats sponsorisés avec formats clairement
> identifiés, ciblage contextuel et bilan de campagne. Votre équipe travaille-t-elle avec des médias
> indépendants de niche pour des campagnes gaming, entertainment ou culture japonaise ? Quels
> éléments d’audience et de conformité demandez-vous pour étudier un dossier ?
>
> Nous pouvons transmettre notre kit média et les chiffres vérifiés de sessions, pays, pages vues,
> appareils et inventaire après consolidation. Nous ne revendiquons aucune affiliation officielle
> Dragon Ball.
>
> Cordialement,
> Dragon Ball France

## État d'implémentation au 2026-10-31

Stripe Checkout et portail, dons Stripe, PayPal Subscriptions/dons/capture, webhooks, l’outbox de
confirmation/renouvellement/échec de paiement et la page de facturation sont présents dans le worktree. Les dons créent d’abord leur
intention locale; les webhooks ne marquent pas un événement traité si cette intention manque. Les
réservations `site_subscription_checkout_reservations` sérialisent les demandes Stripe/PayPal par
compte et réutilisent des clés idempotentes sur les reprises. L’interface VIP compare deux offres
localisées, calcule les prix à partir du catalogue et ne revendique plus les avantages qui ne sont
pas démontrés.

Le back-office gère annonceurs, campagnes, créations et placements; ses champs portent maintenant
des libellés visibles. Le SMTP OVH et la file des e-mails sont câblés, mais le mot de passe SMTP,
le jeton du worker, la tâche planifiée et la délivrabilité ne sont pas qualifiés. Les migrations
`0029` à `0035` restent à appliquer par le runbook Aphrody Infra. Les identifiants marchands live,
la CMP certifiée et l’éligibilité des pages de catalogue doivent être qualifiés avant d’activer une
régie. Rien n’a été déployé, migré en production ni envoyé à une agence.

Le typecheck site/serveur reste bloqué par une incompatibilité Better Auth dans
`packages/api/src/host/auth.ts` : l’API OAuth Provider résolue et Better Auth proviennent de versions
différentes du lockfile, revendiqué par un chantier concurrent. Le contrôle type du schéma DB,
lint ciblé, audit de migrations et `git diff --check` passent; aucun test n’a été lancé.

### Références techniques consultées

- Better Auth : [Google OAuth](https://github.com/better-auth/better-auth/blob/main/docs/content/docs/concepts/oauth.mdx),
  [Discord OAuth](https://github.com/better-auth/better-auth/blob/main/docs/content/docs/authentication/discord.mdx)
  et [e-mails de réinitialisation](https://github.com/better-auth/better-auth/blob/main/docs/content/docs/concepts/email.mdx).
- Stripe : [traitement asynchrone des événements](https://docs.stripe.com/events/manage-webhook-endpoints),
  [cycle de vie des abonnements](https://docs.stripe.com/get-started/use-cases/saas-subscriptions)
  et [portail de facturation](https://docs.stripe.com/billing/quickstart).
- PayPal : [vérification de signature webhook](https://developer.paypal.com/api/rest/integration/orders-api/v1-v2-migration#signature-verification)
  et [événements d’abonnement et de paiement](https://developer.paypal.com/api/rest/webhooks/event-names/).
- Google : [exigence de CMP certifiée TCF en EEE/Royaume-Uni/Suisse](https://support.google.com/adsense/answer/13554116?hl=en).
