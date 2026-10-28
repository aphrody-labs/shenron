import Stripe from "stripe";

// Utilise la clé d'environnement STRIPE_SECRET_KEY ou la clé de test par défaut
export const STRIPE_SECRET_KEY =
  process.env.STRIPE_SECRET_KEY ||
  "sk_test_51UUv86R1OwwgYmpj7yKfGy58Bc4lIXIgZwYobvylyd47p7unBLEJCDqbnuxxKPm28qlMMTs3XnSIBW8QibzdnIgm00cJRbUQgF";

export const STRIPE_PUBLISHABLE_KEY =
  process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ||
  "pk_test_51UUv86R1OwwgYmpjgVSsmDOCSQ8bXhte9Ved7EeTQFyGNgOKHxHWrDlvZRumKUmrCmfGR4YbQXjmfOdAEwX1hX2m00edqsMy41";

export const STRIPE_WEBHOOK_SECRET =
  process.env.STRIPE_WEBHOOK_SECRET ||
  "whsec_74ccac52d57162ce4cc0519e801cba6271164a87e1c81709d37b05ea0ba2daeb";

export const stripe = new Stripe(STRIPE_SECRET_KEY, {
  apiVersion: "2026-09-30.endive" as any,
  appInfo: {
    name: "Dragon Ball FR",
    version: "2.0.0",
    url: "https://dragonballfr.com",
  },
});

export const STRIPE_PLANS = {
  vip_monthly: {
    id: "vip_monthly",
    name: "DBFR VIP Club — Mensuel",
    priceId: "price_1UUxeQR1OwwgYmpjxXOriWWe",
    amount: 499,
    currency: "eur",
    interval: "month",
    features: [
      "Zéro publicité sur l'ensemble du site",
      "Accès prioritaire aux chapitres & tomes haute définition",
      "Badge VIP Shenron exclusif sur le profil et Discord",
      "Accès aux avant-premières des traductions Databooks & Studio",
      "Sauvegarde illimitée de marque-pages et historiques",
    ],
  },
  vip_annual: {
    id: "vip_annual",
    name: "DBFR VIP Club — Annuel",
    priceId: "price_1UUxg1R1OwwgYmpj6qoFJobu",
    amount: 4990,
    currency: "eur",
    interval: "year",
    discount: "2 mois offerts",
    features: [
      "Tous les avantages du pass mensuel",
      "Économie de 17% (2 mois offerts)",
      "Rôle Dragon Sacré doré sur Discord",
      "Participation aux sondages prioritaires de sortie de tomes",
    ],
  },
} as const;

export const DONATION_TIERS = [
  {
    id: "senzu",
    name: "Haricot Senzu",
    amount: 200, // 2,00 €
    description: "Un petit coup de boost pour revigorer les serveurs DBFR !",
    badge: "🌱",
  },
  {
    id: "dragon_ball",
    name: "Dragon Ball 4 Étoiles",
    amount: 500, // 5,00 €
    description: "Le trésor de grand-père Gohan pour soutenir la numérisation des scans.",
    badge: "⭐",
  },
  {
    id: "kamehameha",
    name: "Super Kamehameha",
    amount: 1500, // 15,00 €
    description: "Une décharge de puissance pour financer le stockage et les OCRs !",
    badge: "⚡",
  },
  {
    id: "genki_dama",
    name: "Genki Dama Suprême",
    amount: 5000, // 50,00 €
    description: "Offrez votre énergie à Shenron pour pérenniser l'archive Dragon Ball.",
    badge: "🐉",
  },
] as const;
