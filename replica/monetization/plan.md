# Plan de Mise en Œuvre : Modèle Commercial & Monétisation Souveraine

Rédigé d'après `replica/monetization/recon.md`, `replica/monetization/features.csv`, `replica/monetization/architecture.md` et `replica/monetization/schema.sql`.

---

## 1. Périmètre & Vision Commerciale

Mettre en place une monétisation éthique, transparente et conforme au RGPD pour `dragonballfr.com` :

1. **Adhésion VIP sans publicité** (4,99 €/mois ou 49,90 €/an) : Retrait de toutes les bannières, accès anticipé aux chapitres traduits Koharu, badge communautaire Discord et statut exclusif.
2. **Dons & Soutien Ponctuel** (Paliers 2 €, 5 €, 15 €, 50 € ou montant libre) : Remerciements au générique, affichage public ou anonyme selon le choix du donateur.
3. **Sponsoring Direct Éthique** : Partenariats contextuels sans aucun pistage tiers ni cookie de ciblage comportemental.
4. **Outbox Transactionnelle Robuste** : Reçus fiscaux, avis d'échéance et gestion des échecs de paiement via SMTP OVH sécurisé.

---

## 2. Stack & Fournisseurs

| Composant                  | Fournisseur / Technologie                    | Justification                                                                             |
| :------------------------- | :------------------------------------------- | :---------------------------------------------------------------------------------------- |
| **Abonnements & Cartes**   | Stripe Checkout & Customer Portal            | Conforme PCI-DSS Niveau 1, gestion native du prorata, portail self-service d'annulation.  |
| **Moyen de Secours**       | PayPal Subscriptions API v1                  | Paiements sans carte bancaire directe, très populaire auprès de la communauté anime.      |
| **Gestion des Sessions**   | Better Auth + PostgreSQL                     | Liaison directe de l'abonnement à `ba_user`, expiration automatique à la date d'échéance. |
| **Idempotence & Webhooks** | Table `site_billing_webhook_events`          | Déduplication stricte des événements Stripe/PayPal, protection contre le double-crédit.   |
| **Envoi d'E-mails**        | Outbox Transactionnelle (`site_mail_outbox`) | File d'attente PostgreSQL dépilée par worker avec politique de retry exponentiel.         |

---

## 3. Schéma de Données (`replica/monetization/schema.sql`)

### Entités Majeures :

- `ba_subscription` : Statut Stripe (`active`, `past_due`, `canceled`), période en cours, ID client Stripe.
- `site_paypal_subscriptions` : Statut PayPal équivalent avec ID de souscription I-XXXXXXXXXX.
- `site_donations` : Montant en centimes, devise EUR, identifiant de paiement, statut de capture, flag anonyme.
- `site_billing_webhook_events` : Clé composite `(provider, event_id)` empêchant tout rejeu malveillant.
- `site_advertisers` & `site_ad_campaigns` : Gestion des sponsors directs approuvés par l'éditorial.
- `site_mail_outbox` : File d'e-mails transactionnels (reçu de don, confirmation VIP, alerte d'expiration).

---

## 4. API & Endpoints

| Méthode & Route                | Action                           | Accès                   | Entrée                                          | Sortie                    |
| :----------------------------- | :------------------------------- | :---------------------- | :---------------------------------------------- | :------------------------ |
| POST `/api/vip/checkout`       | Crée une session Stripe Checkout | Membre connecté         | `{ plan: "monthly"                              | "yearly" }`               | `{ checkoutUrl: string }` |
| POST `/api/vip/portal`         | Ouvre le portail client Stripe   | Membre VIP              | –                                               | `{ portalUrl: string }`   |
| POST `/api/donations/checkout` | Initie un don Stripe/PayPal      | Public                  | `{ amountCents: number, isAnonymous: boolean }` | `{ redirectUrl: string }` |
| POST `/api/webhooks/stripe`    | Écoute des événements Stripe     | Stripe (Signature HMAC) | Raw Body + `Stripe-Signature`                   | 200 OK                    |
| POST `/api/webhooks/paypal`    | Écoute des webhooks PayPal       | PayPal (Certificat)     | Raw Body + Headers                              | 200 OK                    |
| GET `/api/user/billing`        | Récapitulatif abonnements & dons | Propriétaire du compte  | –                                               | JSON d'historique         |
| POST `/api/admin/campaigns`    | Création de campagne sponsor     | Admin                   | Données de campagne validées                    | 201 Created               |

---

## 5. Découpage en Tranches Verticales (Build Order)

### Tranche 1 : Intégration Stripe Checkout & Webhooks (`F02`)

- Route de création de session Checkout avec métadonnées `user_id`.
- Handler webhook `/api/webhooks/stripe` écoutant `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`.
- Mutation atomique de `ba_subscription` et journalisation dans `site_billing_webhook_events`.

### Tranche 2 : Interface VIP & Portail Client (`apps/site/src/app/vip/page.tsx`)

- Présentation comparative des deux formules (Mensuel 4,99 € / Annuel 49,90 € avec 2 mois offerts).
- FAQ transparente expliquant l'utilisation des fonds (hébergement serveurs, bande passante CDN, acquisition de scans rares).
- Accès direct au portail Stripe pour modifier la carte ou résilier en un clic.

### Tranche 3 : Module de Soutien Ponctuel (`/donations`)

- Sélecteur de paliers (2 €, 5 €, 15 €, 50 €) et champ libre avec validation `>= 100 centimes`.
- Option « Ne pas faire apparaître mon pseudo sur la page de remerciements » (Don anonyme).
- Émission automatique du reçu par l'outbox e-mail transactionnelle.

### Tranche 4 : Sponsoring Direct & Exemption VIP

- Rendu conditionnel des bannières partenaires : si l'utilisateur est VIP (`isVip: true`), le DOM n'insère aucun bloc publicitaire.
- Comptabilisation côté serveur des affichages sans injection de cookies tiers.

### Tranche 5 : Worker d'Outbox E-mail Transactionnel

- Tâche d'arrière-plan Bun exécutant la livraison SMTP vers les boîtes OVH configurées.
- Marqueurs d'état : `pending` -> `sent` ou `failed` avec horodatage de réessai.

---

## 6. Les Points de Vigilance (The Parts that Bite)

1. **Rejeu de Webhooks** : Stripe réémet les webhooks jusqu'à 3 jours en cas d'échec de réponse HTTP 200. Chaque événement doit être inséré dans `site_billing_webhook_events` avec contrainte unique AVANT toute modification d'abonnement.
2. **Période de Grâce & Récidive d'Échec** : Lors d'un échec de paiement récurrent (`invoice.payment_failed`), ne pas couper immédiatement le statut VIP. Accorder 3 jours de grâce pour permettre au membre de mettre à jour son moyen de paiement.
3. **Règles Fiscales & TVA** : Les prix affichés doivent inclure la TVA européenne (B2C) ou utiliser Stripe Tax automatique.

---

## 7. Critères d'Achèvement (Definition of Done)

- [ ] Un abonnement mensuel et annuel peut être souscrit et résilié de bout en bout en mode test.
- [ ] Les webhooks Stripe mettent à jour le statut utilisateur de manière idempotente sans double crédit.
- [ ] Le profil VIP supprime instantanément 100% des bannières publicitaires sur l'ensemble du site.
- [ ] Les dons anonymes sont masqués du tableau d'honneur public.
- [ ] Zéro credential ou secret en clair dans le code ou les commits.
