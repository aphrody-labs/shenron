# Reconnaissance — modèle commercial Dragon Ball France

État de l'arbre de travail observé le 2026-10-31. Cette carte distingue les handlers présents
du comportement confirmé en production : aucune mutation de base ni vérification live des
fournisseurs n'a été faite dans ce lot.

## Périmètre et écrans

| ID  | Surface                                | Route                              | État constaté dans le worktree                                                                                                                                      |
| --- | -------------------------------------- | ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S01 | Connexion et compte unifié             | `/signin`, `/settings`             | Better Auth Discord, Google conditionnel, e-mail vérifié, passkeys, TOTP et liaison explicite configurés côté hôte ; credentials de production non qualifiés.       |
| S02 | Présentation et achat VIP              | `/vip`                             | Deux formules localisées avec tarifs calculés depuis le catalogue; réservation cross-provider et reprise idempotente. Qualification live manquante.                 |
| S03 | Soutien ponctuel                       | `/donations`                       | Stripe et PayPal, montants allowlistés et bornés, option anonyme et statut confirmé serveur/webhook. Les confirmations sont placées dans l'outbox transactionnelle. |
| S04 | Gestion abonnement                     | `/account/billing`                 | Historique et gestion Stripe via portail, annulation PayPal et historique des dons. Qualification live manquante.                                                   |
| S05 | Administration commerciale             | `/admin/monetization`              | Gestion annonceurs, campagnes, créations, placements et événements quotidiens ; réconciliation/remboursements prestataires incomplets.                              |
| S06 | Consentement et diffusion publicitaire | parcours public                    | ConsentGate, placements directs et exemption VIP dans le code ; CMP certifiée, signaux par juridiction et droit d'inventaire à qualifier avant diffusion.           |
| S07 | Autorisation OAuth Shenron             | `/oauth/consent`, `/.well-known/*` | Découverte, consentement et routes de serveur MCP/OAuth configurés ; clients/callbacks de production à qualifier.                                                   |

## Parcours commerciaux

- F01 : membre → `/signin` → Discord, Google ou e-mail vérifié → association explicite des
  identités supplémentaires ; un compte existant n'est pas fusionné implicitement.
- F02 : membre → `/vip` → réservation atomique du compte → Checkout Stripe ou approbation
  PayPal → webhook signé → état d'abonnement en base. Une même réservation permet de reprendre
  un appel fournisseur avec la même clé idempotente; une autre formule/fournisseur reçoit 409.
- F03 : contributeur → `/donations` → montant en euros validé côté serveur → paiement
  prestataire → webhook/capture vérifié → historique et affichage selon anonymat.
- F04 : annonceur approuvé et contrat référencé → campagne/placements/création → validation
  staff → diffusion contextuelle éligible → compteurs agrégés, sans suivi d'identifiant visiteur.
- F05 : visiteur → préférence de consentement → tags publicitaires admissibles selon la région ;
  l'analytics ou le bandeau interne ne prouvent pas une CMP certifiée.
- F06 : utilisateur → demande OAuth/OIDC Shenron → page de consentement → autorisation bornée
  aux scopes configurés, révocable depuis le compte.

## État et portes restantes

- Les migrations financières, d'annonces, Better Auth, outbox mail et réservation de souscription
  sont ajoutées au worktree ; elles n'ont
  pas été appliquées à une base de production et doivent passer par Aphrody Infra.
- Les commandes SMTP OVH et l'outbox transactionnelle (confirmations initiales, renouvellements,
  échecs de paiement et worker protégé par Bearer) sont codées. Secret SMTP et jeton worker
  non provisionnés ; scheduler Infra, délivrabilité et reprise de compte restent à qualifier.
  La livraison SMTP est au moins une fois.
- Stripe est connecté en mode test uniquement. Les produits/prix sandbox concordent avec les
  prix affichés ; les identifiants live et le rapprochement avec production ne sont pas prouvés.
  Aucun compte PayPal live n'est relié.
- `ba_subscription` et `site_paypal_subscriptions` restent des tables propres à chaque fournisseur;
  `site_subscription_checkout_reservations` sérialise maintenant les nouveaux parcours communs.
- Les abonnements sont affichés et modifiables, mais aucun contrôle central prouvant que tous les
  avantages VIP annoncés sont accordés uniquement pendant une période payée n'a été trouvé.
  Le retrait d'annonces VIP dépend donc d'une qualification d'entitlement encore manquante.
- Les notifications de renouvellement et d'échec sont codées, mais sans qualification fournisseur live.
  Remboursements/chargebacks dans
  le back-office, workflow complet
  de rapprochement facture/forfait, et seuils anti-réidentification des agrégats restent à livrer.
- AdSense/Ad Manager et toute régie programmatique restent désactivés tant que l'approbation de
  compte, la CMP certifiée, les droits sur les contenus monétisés et l'inventaire ne sont pas
  qualifiés. Le sponsoring direct est le chemin de revenu préféré au lancement.
- Validation locale observée pour ce lot : typage site, lint ciblé et audit DB ; aucun test
  d'intégration prestataire, navigateur, déploiement, migration live ou envoi d'e-mail n'est
  revendiqué. Le contrôle TypeScript du paquet API reste bloqué par le lockfile Better Auth
  détenu par un autre chantier.
