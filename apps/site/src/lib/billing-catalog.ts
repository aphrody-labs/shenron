/** Public offer descriptions. Provider credentials and environment IDs stay server-side. */
export const STRIPE_PLANS = {
  vip_monthly: {
    id: "vip_monthly",
    name: "DBFR VIP Club — Mensuel",
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
    amount: 200,
    description: "Un petit coup de boost pour revigorer les serveurs DBFR !",
    badge: "🌱",
  },
  {
    id: "dragon_ball",
    name: "Dragon Ball 4 Étoiles",
    amount: 500,
    description: "Le trésor de grand-père Gohan pour soutenir la numérisation des scans.",
    badge: "⭐",
  },
  {
    id: "kamehameha",
    name: "Super Kamehameha",
    amount: 1500,
    description: "Une décharge de puissance pour financer le stockage et les OCRs !",
    badge: "⚡",
  },
  {
    id: "genki_dama",
    name: "Genki Dama Suprême",
    amount: 5000,
    description: "Offrez votre énergie à Shenron pour pérenniser l'archive Dragon Ball.",
    badge: "🐉",
  },
] as const;
