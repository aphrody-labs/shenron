// SPDX-License-Identifier: Apache-2.0

/**
 * Dragon Pixel — Moteur de Combat & Mode Histoire Canonique.
 *
 * Inspiré des chefs-d'œuvre rétro de Dragon Ball (Super Butōden 2, Hyper Dimension,
 * Shin Butōden, Supersonic Warriors et Legendary Super Warriors) et fidèle au
 * trait et à la trame narrative d'Akira Toriyama (Tomes 1 à 42).
 */

export type FighterStyle = "balanced" | "speed" | "power";

export type FighterId =
  | "goku"
  | "vegeta"
  | "gohan"
  | "piccolo"
  | "trunks"
  | "frieza"
  | "cell"
  | "buu";

export type ArenaId =
  | "paozu"
  | "budokai"
  | "wasteland"
  | "namek"
  | "cell_games"
  | "kaiohshin";

export type GameMode = "story" | "arcade" | "survival" | "dojo";

export interface SpecialMove {
  id: string;
  name: string;
  nameJa: string;
  cost: number;
  damage: number;
  type: "beam" | "blast" | "dash" | "ultimate";
  color: string;
  sfx?: string;
}

export interface FighterDefinition {
  id: FighterId;
  name: string;
  nameJa: string;
  style: FighterStyle;
  baseHp: number;
  baseKi: number;
  basePowerLevel: number;
  emblemId: string;
  themeColor: string;
  forms: {
    level: number;
    name: string;
    powerMultiplier: number;
    powerLevel: number;
    auraColor: string;
  }[];
  specials: SpecialMove[];
}

export const FIGHTERS: Record<FighterId, FighterDefinition> = {
  goku: {
    id: "goku",
    name: "Son Goku",
    nameJa: "孫悟空",
    style: "balanced",
    baseHp: 100,
    baseKi: 100,
    basePowerLevel: 8200,
    emblemId: "kame",
    themeColor: "#f85b1a",
    forms: [
      { level: 0, name: "Base", powerMultiplier: 1.0, powerLevel: 8200, auraColor: "#ffffff" },
      { level: 1, name: "Kaiō-ken x4", powerMultiplier: 1.35, powerLevel: 32000, auraColor: "#de1b22" },
      { level: 2, name: "Super Saiyan", powerMultiplier: 1.75, powerLevel: 150000000, auraColor: "#ffd700" },
      { level: 3, name: "Super Saiyan 3", powerMultiplier: 2.2, powerLevel: 1200000000, auraColor: "#ffee00" },
    ],
    specials: [
      { id: "kamehameha", name: "Kamehameha", nameJa: "かめはめ波", cost: 35, damage: 28, type: "beam", color: "#00b4d8", sfx: "final-flash" },
      { id: "genkidama", name: "Chō Genki Dama", nameJa: "超元気玉", cost: 80, damage: 65, type: "ultimate", color: "#90e0ef", sfx: "power-up" },
    ],
  },
  vegeta: {
    id: "vegeta",
    name: "Vegeta",
    nameJa: "ベジータ",
    style: "power",
    baseHp: 100,
    baseKi: 100,
    basePowerLevel: 18000,
    emblemId: "vegeta_royal",
    themeColor: "#1b365d",
    forms: [
      { level: 0, name: "Base", powerMultiplier: 1.0, powerLevel: 18000, auraColor: "#ffffff" },
      { level: 1, name: "Super Saiyan", powerMultiplier: 1.75, powerLevel: 160000000, auraColor: "#ffd700" },
      { level: 2, name: "Majin Vegeta", powerMultiplier: 2.1, powerLevel: 1100000000, auraColor: "#f72585" },
    ],
    specials: [
      { id: "garric_gun", name: "Canon Garric", nameJa: "ギャリック砲", cost: 30, damage: 25, type: "beam", color: "#9d4edd", sfx: "final-flash" },
      { id: "final_flash", name: "Final Flash", nameJa: "ファイナルフラッシュ", cost: 50, damage: 45, type: "beam", color: "#ffd700", sfx: "final-flash" },
      { id: "final_explosion", name: "Explosion Finale", nameJa: "ファイナルエクスプロージョン", cost: 90, damage: 75, type: "ultimate", color: "#ffffff", sfx: "power-up" },
    ],
  },
  gohan: {
    id: "gohan",
    name: "Son Gohan",
    nameJa: "孫悟飯",
    style: "speed",
    baseHp: 100,
    baseKi: 100,
    basePowerLevel: 2800,
    emblemId: "demon",
    themeColor: "#5a189a",
    forms: [
      { level: 0, name: "Base", powerMultiplier: 1.0, powerLevel: 2800, auraColor: "#ffffff" },
      { level: 1, name: "Super Saiyan 2", powerMultiplier: 1.9, powerLevel: 1000000000, auraColor: "#ffd700" },
      { level: 2, name: "Ultimate Gohan", powerMultiplier: 2.3, powerLevel: 1800000000, auraColor: "#ffffff" },
    ],
    specials: [
      { id: "masenko", name: "Masenko", nameJa: "魔閃光", cost: 25, damage: 22, type: "beam", color: "#ffb703", sfx: "final-flash" },
      { id: "father_son_kamehameha", name: "Père-Fils Kamehameha", nameJa: "親子かめはめ波", cost: 85, damage: 70, type: "ultimate", color: "#00f5d4", sfx: "power-up" },
    ],
  },
  piccolo: {
    id: "piccolo",
    name: "Piccolo",
    nameJa: "ピッコロ",
    style: "balanced",
    baseHp: 110,
    baseKi: 100,
    basePowerLevel: 3500,
    emblemId: "demon",
    themeColor: "#40916c",
    forms: [
      { level: 0, name: "Base", powerMultiplier: 1.0, powerLevel: 3500, auraColor: "#ffffff" },
      { level: 1, name: "Super Namek", powerMultiplier: 1.85, powerLevel: 800000000, auraColor: "#52b788" },
    ],
    specials: [
      { id: "makankosappo", name: "Makankosappo", nameJa: "魔貫光殺砲", cost: 40, damage: 38, type: "beam", color: "#d90429", sfx: "final-flash" },
      { id: "chobakuretsumaha", name: "Chō Bakuretsumaha", nameJa: "超爆裂魔波", cost: 70, damage: 55, type: "ultimate", color: "#ffb703", sfx: "power-up" },
    ],
  },
  trunks: {
    id: "trunks",
    name: "Trunks du Futur",
    nameJa: "トランクス",
    style: "speed",
    baseHp: 100,
    baseKi: 100,
    basePowerLevel: 5000,
    emblemId: "capsule",
    themeColor: "#00b4d8",
    forms: [
      { level: 0, name: "Base", powerMultiplier: 1.0, powerLevel: 5000, auraColor: "#ffffff" },
      { level: 1, name: "Super Saiyan", powerMultiplier: 1.75, powerLevel: 150000000, auraColor: "#ffd700" },
    ],
    specials: [
      { id: "burning_attack", name: "Burning Attack", nameJa: "バーニングアタック", cost: 35, damage: 30, type: "blast", color: "#fb8500", sfx: "final-flash" },
      { id: "heat_dome", name: "Heat Dome Attack", nameJa: "ヒートドームアタック", cost: 75, damage: 60, type: "ultimate", color: "#ff006e", sfx: "power-up" },
    ],
  },
  frieza: {
    id: "frieza",
    name: "Freezer",
    nameJa: "フリーザ",
    style: "power",
    baseHp: 120,
    baseKi: 120,
    basePowerLevel: 530000,
    emblemId: "redRibbon",
    themeColor: "#7209b7",
    forms: [
      { level: 0, name: "1re Forme", powerMultiplier: 1.0, powerLevel: 530000, auraColor: "#7209b7" },
      { level: 1, name: "Forme Finale 100%", powerMultiplier: 2.0, powerLevel: 120000000, auraColor: "#b5179e" },
    ],
    specials: [
      { id: "death_beam", name: "Rayon de la Mort", nameJa: "デスビーム", cost: 20, damage: 24, type: "beam", color: "#f72585", sfx: "final-flash" },
      { id: "death_ball", name: "Boule de la Mort", nameJa: "デスボール", cost: 80, damage: 65, type: "ultimate", color: "#560bad", sfx: "power-up" },
    ],
  },
  cell: {
    id: "cell",
    name: "Cell",
    nameJa: "セル",
    style: "balanced",
    baseHp: 125,
    baseKi: 110,
    basePowerLevel: 900000000,
    emblemId: "redRibbon",
    themeColor: "#2d6a4f",
    forms: [
      { level: 0, name: "Cell Parfait", powerMultiplier: 1.0, powerLevel: 900000000, auraColor: "#ffd700" },
      { level: 1, name: "Super Cell Parfait", powerMultiplier: 1.8, powerLevel: 1400000000, auraColor: "#00f5d4" },
    ],
    specials: [
      { id: "solar_kamehameha", name: "Kamehameha Solaire", nameJa: "太陽系破壊かめはめ波", cost: 50, damage: 45, type: "beam", color: "#ffd700", sfx: "final-flash" },
      { id: "perfect_barrier", name: "Barrière Parfaite", nameJa: "パーフェクトバリア", cost: 75, damage: 55, type: "ultimate", color: "#00b4d8", sfx: "power-up" },
    ],
  },
  buu: {
    id: "buu",
    name: "Majin Buu",
    nameJa: "魔人ブウ",
    style: "power",
    baseHp: 130,
    baseKi: 130,
    basePowerLevel: 1500000000,
    emblemId: "majin",
    themeColor: "#f72585",
    forms: [
      { level: 0, name: "Majin Buu", powerMultiplier: 1.0, powerLevel: 1500000000, auraColor: "#f72585" },
      { level: 1, name: "Kid Buu (Pur)", powerMultiplier: 2.0, powerLevel: 1800000000, auraColor: "#ff007f" },
    ],
    specials: [
      { id: "candy_beam", name: "Rayon Bonbon", nameJa: "お菓子光線", cost: 35, damage: 30, type: "blast", color: "#ff70a6", sfx: "final-flash" },
      { id: "vanishing_ball", name: "Vanishing Ball", nameJa: "地球崩壊弾", cost: 85, damage: 70, type: "ultimate", color: "#f72585", sfx: "power-up" },
    ],
  },
};

export interface StoryChapter {
  id: number;
  tome: number;
  saga: string;
  title: string;
  titleJa: string;
  arena: ArenaId;
  playerFighter: FighterId;
  enemyFighter: FighterId;
  enemyName: string;
  introDialogue: { speaker: string; text: string; textJa?: string }[];
  victoryDialogue: { speaker: string; text: string }[];
  objective: string;
  bossHp: number;
  targetTransformation?: number;
}

export const STORY_CHAPTERS: StoryChapter[] = [
  {
    id: 1,
    tome: 1,
    saga: "Quête des Dragon Balls",
    title: "Chapitre 1 : Bulma et Son Goku",
    titleJa: "ブルマと孫悟空",
    arena: "paozu",
    playerFighter: "goku",
    enemyFighter: "piccolo",
    enemyName: "Oolong & Bandits de Paozu",
    introDialogue: [
      { speaker: "Bulma", text: "Tu as la boule à quatre étoiles de ton grand-père ! Viens avec moi chercher les 7 boules de cristal !" },
      { speaker: "Goku", text: "D'accord, mais je ne me sépare jamais de mon Nyoï-bô !" },
    ],
    victoryDialogue: [
      { speaker: "Goku", text: "Haha ! Tu es bien moins fort que les monstres de ma montagne !" },
    ],
    objective: "Terrassez les adversaires du Mont Paozu.",
    bossHp: 80,
  },
  {
    id: 2,
    tome: 4,
    saga: "21e Tenkaichi Budokai",
    title: "Chapitre 45 : La Finale du 21e Budokai",
    titleJa: "大決戦！武天老師対孫悟空",
    arena: "budokai",
    playerFighter: "goku",
    enemyFighter: "piccolo",
    enemyName: "Jackie Chun (Tortue Géniale)",
    introDialogue: [
      { speaker: "Jackie Chun", text: "Goku, montre-moi tout ce que t'a appris ton entraînement avec les carapaces !" },
      { speaker: "Goku", text: "Papy Chun, préparez-vous, je vais donner tout ce que j'ai !" },
    ],
    victoryDialogue: [
      { speaker: "Goku", text: "Le monde est tellement vaste... Il existe des combattants encore plus forts !" },
    ],
    objective: "Survivez et gagnez la finale du championnat mondial des arts martiaux.",
    bossHp: 100,
  },
  {
    id: 3,
    tome: 8,
    saga: "Armée du Ruban Rouge",
    title: "Chapitre 85 : Le Tueur Professionnel Taopaipai",
    titleJa: "殺し屋桃白白の恐怖",
    arena: "wasteland",
    playerFighter: "goku",
    enemyFighter: "frieza",
    enemyName: "Taopaipai",
    introDialogue: [
      { speaker: "Taopaipai", text: "Gamin, ton heure est venue. Mon Dodonpa ne rate jamais sa cible !" },
      { speaker: "Goku", text: "J'ai bu l'Eau Sacrée de Maître Karine ! Ton Dodonpa ne me fait plus rien !" },
    ],
    victoryDialogue: [
      { speaker: "Goku", text: "Tu as tué le père d'Upa, tu as perdu !" },
    ],
    objective: "Vainquez Taopaipai au pied de la Tour Karine.",
    bossHp: 110,
  },
  {
    id: 4,
    tome: 13,
    saga: "Grand Démon Piccolo",
    title: "Chapitre 158 : Le Coup du Poing du Dragon",
    titleJa: "勇気百倍！孫悟空の最後の賭け",
    arena: "wasteland",
    playerFighter: "goku",
    enemyFighter: "piccolo",
    enemyName: "Démon Piccolo (Jeune)",
    introDialogue: [
      { speaker: "Démon Piccolo", text: "Misérable vermine ! Je règne sur ce monde avec la jeunesse éternelle !" },
      { speaker: "Goku", text: "Piccolo ! Même s'il ne me reste qu'un seul bras, je vais mettre toute ma vie dans ce coup !" },
    ],
    victoryDialogue: [
      { speaker: "Goku", text: "J'ai vengé Maître Roshi et Krilin !" },
    ],
    objective: "Utilisez toute votre énergie pour transpercer le Démon Piccolo.",
    bossHp: 120,
  },
  {
    id: 5,
    tome: 16,
    saga: "23e Tenkaichi Budokai",
    title: "Chapitre 191 : Le Duel Suprême — Goku vs Ma Junior",
    titleJa: "天下一の栄冠！",
    arena: "budokai",
    playerFighter: "goku",
    enemyFighter: "piccolo",
    enemyName: "Ma Junior (Piccolo)",
    introDialogue: [
      { speaker: "Piccolo", text: "Cette fois, Son Goku, rien ne te sauvera ! L'arène entière sera ton tombeau !" },
      { speaker: "Goku", text: "Je suis prêt, Piccolo ! Nous réglerons nos comptes selon les règles du Budokai !" },
    ],
    victoryDialogue: [
      { speaker: "Arbitre", text: "1, 2, 3... 10 ! Son Goku est le Champion du Monde !" },
    ],
    objective: "Gagnez le 23e Tenkaichi Budokai contre Piccolo.",
    bossHp: 130,
  },
  {
    id: 6,
    tome: 17,
    saga: "Attaque des Saiyans",
    title: "Chapitre 201 : Le Mystère de Raditz",
    titleJa: "ピッコロと悟空！最強コンビの猛攻",
    arena: "wasteland",
    playerFighter: "goku",
    enemyFighter: "vegeta",
    enemyName: "Raditz le Saiyan",
    introDialogue: [
      { speaker: "Raditz", text: "Kakarotto, tu as oublié ta mission ! Tu n'es qu'une honte pour notre race guerrière !" },
      { speaker: "Goku", text: "Mon nom est Son Goku, et la Terre est ma planète !" },
    ],
    victoryDialogue: [
      { speaker: "Piccolo", text: "Makankosappo ! C'est terminé..." },
    ],
    objective: "Terrassez le guerrier de l'espace Raditz.",
    bossHp: 140,
  },
  {
    id: 7,
    tome: 19,
    saga: "Attaque des Saiyans",
    title: "Chapitre 229 : Le Choc Décisif — Goku vs Vegeta",
    titleJa: "界王拳4倍！カメハメ波対ギャリック砲",
    arena: "wasteland",
    playerFighter: "goku",
    enemyFighter: "vegeta",
    enemyName: "Prince Vegeta",
    introDialogue: [
      { speaker: "Vegeta", text: "Un guerrier de basse classe comme toi ne vaincra jamais un prince d'élite ! Crève avec cette planète !" },
      { speaker: "Goku", text: "Mon corps n'en peut plus... Mais je dois monter au Kaiō-ken x4 !" },
    ],
    victoryDialogue: [
      { speaker: "Goku", text: "Vegeta... Krilin, s'il te plaît, laisse-le partir... Je veux le réaffronter un jour !" },
    ],
    objective: "Repoussez le Canon Garric avec le Kaiō-ken x4.",
    bossHp: 150,
  },
  {
    id: 8,
    tome: 23,
    saga: "Planète Namek",
    title: "Chapitre 279 : L'Arrivée de Son Goku sur Namek",
    titleJa: "ギニュー特戦隊撃破！",
    arena: "namek",
    playerFighter: "goku",
    enemyFighter: "frieza",
    enemyName: "Commando Ginyu",
    introDialogue: [
      { speaker: "Ginyu", text: "Notre pose de combat est la plus parfaite de l'univers ! Tokusentai !" },
      { speaker: "Goku", text: "Vous avez blessé Gohan et Krilin. Je ne vous laisserai pas faire un pas de plus." },
    ],
    victoryDialogue: [
      { speaker: "Goku", text: "Vos corps ne servent à rien si vous n'avez pas de cœur pur." },
    ],
    objective: "Battez le Commando Ginyu sur la planète Namek.",
    bossHp: 160,
  },
  {
    id: 9,
    tome: 27,
    saga: "Planète Namek",
    title: "Chapitre 318 : Le Super Saiyan Légendaire",
    titleJa: "伝説の超サイヤ人、孫悟空覚醒！！",
    arena: "namek",
    playerFighter: "goku",
    enemyFighter: "frieza",
    enemyName: "Freezer (100% Puissance Max)",
    introDialogue: [
      { speaker: "Freezer", text: "Je vais faire exploser cette planète en 5 minutes ! Tu mourras dans le vide spatial !" },
      { speaker: "Goku", text: "Tu as tué Krilin... Tu ne pourras jamais me pardonner cela. JE SUIS LE GUERRIER LÉGENDAIRE, SON GOKU !" },
    ],
    victoryDialogue: [
      { speaker: "Goku", text: "C'est fini, Freezer. Tu as été vaincu par celui que tu redoutais tant." },
    ],
    objective: "Éveillez le Super Saiyan et triomphez de Freezer 100%.",
    bossHp: 180,
    targetTransformation: 2,
  },
  {
    id: 10,
    tome: 28,
    saga: "Les Cyborgs",
    title: "Chapitre 331 : Le Garçon Mystérieux du Futur",
    titleJa: "未来から来た少年、トランクス！",
    arena: "wasteland",
    playerFighter: "trunks",
    enemyFighter: "frieza",
    enemyName: "Méca Freezer & Roi Cold",
    introDialogue: [
      { speaker: "Méca Freezer", text: "Qui es-tu, gamin ? Tu crois pouvoir m'affronter avec cette simple épée ?" },
      { speaker: "Trunks", text: "Tu penses que Goku est le seul Super Saiyan ? Tu te trompes !" },
    ],
    victoryDialogue: [
      { speaker: "Trunks", text: "Je suis venu avertir Goku pour les Cyborgs dans trois ans." },
    ],
    objective: "Tranchez Méca Freezer avec Trunks Super Saiyan.",
    bossHp: 170,
  },
  {
    id: 11,
    tome: 30,
    saga: "Les Cyborgs",
    title: "Chapitre 356 : La Renaissance du Super Namek",
    titleJa: "神と融合したピッコロの闘い",
    arena: "wasteland",
    playerFighter: "piccolo",
    enemyFighter: "cell",
    enemyName: "Cyborg C-17 & Cell Imparfait",
    introDialogue: [
      { speaker: "Piccolo", text: "Je ne suis plus ni Kami-sama ni Piccolo... Je suis le Namek qui a oublié son nom !" },
      { speaker: "Cell", text: "Ton énergie est délicieuse, Piccolo... Mais j'absorberai les Cyborgs !" },
    ],
    victoryDialogue: [
      { speaker: "Piccolo", text: "Tu n'atteindras pas ta perfection tant que je serai debout !" },
    ],
    objective: "Défendez les terres avec Piccolo Super Namek.",
    bossHp: 175,
  },
  {
    id: 12,
    tome: 34,
    saga: "Le Cell Games",
    title: "Chapitre 408 : L'Éveil de Son Gohan",
    titleJa: "怒れ悟飯！超サイヤ人2への変身",
    arena: "cell_games",
    playerFighter: "gohan",
    enemyFighter: "cell",
    enemyName: "Cell Parfait",
    introDialogue: [
      { speaker: "C-16", text: "Gohan... Laisse exploser ta colère. Ce n'est pas un crime de se battre pour la justice..." },
      { speaker: "Gohan", text: "Cell... Je ne te pardonnerai JAMAIS !" },
    ],
    victoryDialogue: [
      { speaker: "Gohan", text: "Ce n'est plus toi qui décides des règles du jeu, Cell." },
    ],
    objective: "Activez le Super Saiyan 2 et dominez Cell Parfait.",
    bossHp: 190,
    targetTransformation: 1,
  },
  {
    id: 13,
    tome: 35,
    saga: "Le Cell Games",
    title: "Chapitre 416 : Le Kamehameha Père-Fils",
    titleJa: "バイバイみんな！最後の親子かめはめ波",
    arena: "cell_games",
    playerFighter: "gohan",
    enemyFighter: "cell",
    enemyName: "Super Cell Parfait",
    introDialogue: [
      { speaker: "Cell", text: "Mon corps a atteint l'état de perfection ultime avec les cellules des Saiyans ! Dis adieu à la Terre !" },
      { speaker: "Goku (esprit)", text: "Ne renonce pas, Gohan ! Tire ! Tout de suite !" },
      { speaker: "Gohan", text: "KA... ME... HA... ME... HA !!!" },
    ],
    victoryDialogue: [
      { speaker: "Gohan", text: "Merci, Papa... La Terre est sauvée." },
    ],
    objective: "Annihilez chaque cellule de Cell avec le Kamehameha Père-Fils.",
    bossHp: 200,
  },
  {
    id: 14,
    tome: 38,
    saga: "Majin Buu",
    title: "Chapitre 458 : Le Destin Fatal de Majin Vegeta",
    titleJa: "ベジータ最期の誇り！",
    arena: "wasteland",
    playerFighter: "vegeta",
    enemyFighter: "buu",
    enemyName: "Majin Buu",
    introDialogue: [
      { speaker: "Vegeta", text: "Trunks... Bulma... Et même toi, Kakarotto... C'est pour vous que je me bats." },
      { speaker: "Buu", text: "Buu va te transformer en chocolat !" },
    ],
    victoryDialogue: [
      { speaker: "Piccolo", text: "Vegeta a combattu pour les siens... C'était un noble guerrier." },
    ],
    objective: "Sacrifiez-vous dans un déluge d'énergie contre Majin Buu.",
    bossHp: 210,
  },
  {
    id: 15,
    tome: 42,
    saga: "Majin Buu",
    title: "Chapitre 516 : Le Vœu Universel — Le Chō Genki Dama",
    titleJa: "大団円、そして…さようならドラゴンワールド！",
    arena: "kaiohshin",
    playerFighter: "goku",
    enemyFighter: "buu",
    enemyName: "Kid Buu (Pur)",
    introDialogue: [
      { speaker: "Vegeta", text: "Tu es le numéro un, Kakarotto... Rassemble l'énergie de chaque être vivant de l'univers !" },
      { speaker: "Goku", text: "Gens de la Terre, prêtez-moi votre force une dernière fois !" },
    ],
    victoryDialogue: [
      { speaker: "Goku", text: "Tu étais incroyable, Buu. Reviens un jour réincarné en quelqu'un de bon, et nous nous battrons encore !" },
    ],
    objective: "Achevez la grande saga Dragon Ball avec le Chō Genki Dama universel !",
    bossHp: 220,
  },
];

export interface Player {
  x: number;
  y: number;
  vy: number;
  hp: number;
  maxHp: number;
  energy: number;
  maxEnergy: number;
  facing: number;
  cooldown: number;
  combo: number;
  transformed: number;
  formLevel: number;
  style: FighterStyle;
  fighterId: FighterId;
  guarding: boolean;
  blockingTimer: number;
  isAirborne: boolean;
  powerLevel: number;
  vanishCooldown: number;
}

export interface Enemy {
  x: number;
  y: number;
  vy?: number;
  hp: number;
  maxHp?: number;
  cooldown: number;
  fighterId?: FighterId;
  facing?: number;
  formLevel?: number;
  guarding?: boolean;
  powerLevel?: number;
}

export interface Shot {
  x: number;
  y: number;
  vx: number;
  damage: number;
  isBeam?: boolean;
  width?: number;
  height?: number;
  color?: string;
  source?: "player" | "enemy";
  duration?: number;
}

export interface BeamClash {
  active: boolean;
  x: number;
  y: number;
  tension: number; // -100 (player loses) to +100 (player wins)
  duration: number;
}

export interface GameState {
  player: Player;
  enemies: Enemy[];
  shots: Shot[];
  wave: number;
  score: number;
  time: number;
  spawn: number;
  status: "playing" | "won" | "lost";
  mode: GameMode;
  currentChapterId: number;
  arena: ArenaId;
  clash?: BeamClash;
  screenShake: number;
  scouterTarget?: number;
}

export interface GameInput {
  left?: boolean;
  right?: boolean;
  jump?: boolean;
  punch?: boolean;
  blast?: boolean;
  charge?: boolean;
  transform?: boolean;
  guard?: boolean;
  vanish?: boolean;
  special?: boolean;
  ultimate?: boolean;
  mash?: boolean; // Pour le mini-jeu de Beam Clash
}

export function createGame(
  styleOrFighter: FighterStyle | FighterId = "balanced",
  mode: GameMode = "arcade",
  chapterId = 1,
): GameState {
  let fighterId: FighterId = "goku";
  let style: FighterStyle = "balanced";

  if (styleOrFighter in FIGHTERS) {
    fighterId = styleOrFighter as FighterId;
    style = FIGHTERS[fighterId].style;
  } else if (styleOrFighter === "power") {
    fighterId = "vegeta";
    style = "power";
  } else if (styleOrFighter === "speed") {
    fighterId = "gohan";
    style = "speed";
  }

  let arena: ArenaId = "budokai";

  if (mode === "story") {
    const chap = STORY_CHAPTERS.find((c) => c.id === chapterId) ?? STORY_CHAPTERS[0];
    arena = chap.arena;
    fighterId = chap.playerFighter;
    style = FIGHTERS[fighterId].style;
  }

  const def = FIGHTERS[fighterId];

  return {
    player: {
      x: 160,
      y: 320,
      vy: 0,
      hp: 100,
      maxHp: def.baseHp,
      energy: 40,
      maxEnergy: def.baseKi,
      facing: 1,
      cooldown: 0,
      combo: 0,
      transformed: 0,
      formLevel: 0,
      style,
      fighterId,
      guarding: false,
      blockingTimer: 0,
      isAirborne: false,
      powerLevel: def.basePowerLevel,
      vanishCooldown: 0,
    },
    enemies: [],
    shots: [],
    wave: 0,
    score: 0,
    time: 0,
    spawn: 0,
    status: "playing",
    mode,
    currentChapterId: chapterId,
    arena,
    screenShake: 0,
  };
}

export function step(g: GameState, input: GameInput, dt: number): void {
  if (g.status !== "playing") return;
  const clampedDt = Math.max(0, Math.min(dt, 0.05));
  const p = g.player;
  g.time += clampedDt;

  // Réduction des temps de recharge
  p.cooldown = Math.max(0, p.cooldown - clampedDt);
  p.transformed = Math.max(0, p.transformed - clampedDt);
  p.vanishCooldown = Math.max(0, p.vanishCooldown - clampedDt);
  g.screenShake = Math.max(0, g.screenShake - clampedDt * 10);

  // Gestion du Beam Clash (Choc de Kikōha)
  if (g.clash && g.clash.active) {
    g.clash.duration -= clampedDt;
    if (input.mash || input.punch || input.blast) {
      g.clash.tension += 4;
      g.screenShake = 4;
    } else {
      g.clash.tension -= 15 * clampedDt;
    }

    if (g.clash.tension >= 100 || g.clash.duration <= 0) {
      // Victoire du clash pour le joueur !
      g.clash.active = false;
      g.screenShake = 10;
      for (const e of g.enemies) {
        e.hp = Math.max(0, e.hp - 60);
      }
      g.score += 500;
    } else if (g.clash.tension <= -100) {
      // Défaite du clash
      g.clash.active = false;
      p.hp = Math.max(0, p.hp - 45);
      g.screenShake = 12;
      if (p.hp <= 0) g.status = "lost";
    }
    return;
  }

  // Déplacement et Garde
  p.guarding = !!input.guard;
  const moveMultiplier = p.guarding ? 0.3 : 1.0;
  const move = (input.right ? 1 : 0) - (input.left ? 1 : 0);
  if (move) p.facing = move;

  const baseSpeed = p.style === "speed" ? 280 : 215;
  const speedBonus = p.transformed ? 1.25 : 1.0;
  p.x = Math.max(24, Math.min(936, p.x + move * baseSpeed * speedBonus * moveMultiplier * clampedDt));

  // Saut & Vol
  if (input.jump && p.y >= 320) {
    p.vy = -420;
    p.isAirborne = true;
  }
  p.vy += 980 * clampedDt;
  p.y = Math.min(320, p.y + p.vy * clampedDt);
  if (p.y >= 320) {
    p.y = 320;
    p.vy = 0;
    p.isAirborne = false;
  }

  // Charge de Ki
  const chargeRate = input.charge ? 28 : 5;
  p.energy = Math.min(100, p.energy + chargeRate * clampedDt);
  if (input.charge) {
    g.screenShake = Math.max(g.screenShake, 1.2);
  }

  // Z-Vanish (Téléportation esquive derrière l'adversaire le plus proche)
  if (input.vanish && p.energy >= 25 && p.vanishCooldown === 0 && g.enemies.length > 0) {
    p.energy -= 25;
    p.vanishCooldown = 0.8;
    const target = g.enemies[0];
    p.x = target.x + (p.facing > 0 ? 60 : -60);
    p.x = Math.max(40, Math.min(920, p.x));
    p.facing = p.x < target.x ? 1 : -1;
    g.screenShake = 3;
  }

  // Transformation Super Saiyan / Kaiō-ken
  if (input.transform && p.energy >= 80 && p.transformed === 0) {
    p.energy -= 80;
    p.transformed = 8;
    p.formLevel = Math.min(2, p.formLevel + 1);
    g.screenShake = 6;
  }

  const def = FIGHTERS[p.fighterId] ?? FIGHTERS.goku;
  const formDef = def.forms[p.transformed > 0 ? (p.formLevel || 1) : 0] ?? def.forms[0];
  p.powerLevel = formDef.powerLevel;

  const stylePower = p.style === "power" ? 1.25 : 1;
  const power = stylePower * (p.transformed ? 1.7 : 1);

  // Attaque au corps à corps (Punch combo)
  if (input.punch && !p.cooldown) {
    p.combo = (p.combo % 3) + 1;
    p.cooldown = 0.28;
    const hitDamage = Math.round(13 * power);

    for (const e of g.enemies) {
      if (Math.abs(e.x - p.x) < 70 && Math.abs(e.y - p.y) < 60) {
        const dmg = e.guarding ? Math.round(hitDamage * 0.2) : hitDamage;
        e.hp = Math.max(0, e.hp - dmg);
        g.screenShake = 2.5;

        // Knockback sur le 3e coup de combo
        if (p.combo === 3) {
          e.x += p.facing * 45;
          e.x = Math.max(40, Math.min(920, e.x));
          g.screenShake = 5;
        }
      }
    }
  }

  // Attaque énergétique de base (Kikōha)
  if (input.blast && !p.cooldown && p.energy >= 20) {
    p.energy -= 20;
    p.cooldown = 0.32;
    g.shots.push({
      x: p.x + p.facing * 35,
      y: p.y - 30,
      vx: p.facing * 520,
      damage: Math.round(24 * power),
      isBeam: false,
      color: "#00b4d8",
      source: "player",
    });
  }

  // Super Attaque (Kamehameha / Final Flash)
  if (input.special && !p.cooldown && p.energy >= 45) {
    p.energy -= 45;
    p.cooldown = 0.8;
    g.screenShake = 7;
    g.shots.push({
      x: p.x + p.facing * 50,
      y: p.y - 30,
      vx: p.facing * 750,
      damage: Math.round(48 * power),
      isBeam: true,
      width: 140,
      height: 24,
      color: formDef.auraColor || "#00b4d8",
      source: "player",
      duration: 0.6,
    });
  }

  // Mise à jour des projectiles
  for (const s of g.shots) {
    s.x += s.vx * clampedDt;
    if (s.duration !== undefined) {
      s.duration -= clampedDt;
    }
  }

  // Détection de collision de tirs
  g.shots = g.shots.filter((s) => {
    if (s.duration !== undefined && s.duration <= 0) return false;
    if (s.x < 0 || s.x > 960) return false;

    if (s.source === "player" || !s.source) {
      for (const e of g.enemies) {
        if (Math.abs(e.x - s.x) < 40 && Math.abs(e.y - s.y) < 60) {
          const dmg = e.guarding ? Math.round(s.damage * 0.2) : s.damage;
          e.hp = Math.max(0, e.hp - dmg);
          g.screenShake = s.isBeam ? 6 : 3;
          if (!s.isBeam) return false;
        }
      }
    } else if (s.source === "enemy") {
      if (Math.abs(p.x - s.x) < 35 && Math.abs(p.y - s.y) < 60) {
        const dmg = p.guarding ? Math.round(s.damage * 0.2) : s.damage;
        p.hp = Math.max(0, p.hp - dmg);
        g.screenShake = 5;
        if (p.hp <= 0) {
          g.status = "lost";
        }
        if (!s.isBeam) return false;
      }
    }
    return true;
  });

  // Détection d'un Beam Clash entre un tir joueur et un tir ennemi
  const playerBeam = g.shots.find((s) => (s.source === "player" || !s.source) && s.isBeam);
  const enemyBeam = g.shots.find((s) => s.source === "enemy" && s.isBeam);
  if (playerBeam && enemyBeam && Math.abs(playerBeam.x - enemyBeam.x) < 80) {
    g.clash = {
      active: true,
      x: (playerBeam.x + enemyBeam.x) / 2,
      y: playerBeam.y,
      tension: 0,
      duration: 4.0,
    };
    g.shots = [];
    g.screenShake = 8;
  }

  // Mode Histoire ou Progression standard des vagues
  if (g.mode === "story") {
    if (g.enemies.length === 0 && g.spawn === 0) {
      const chap = STORY_CHAPTERS.find((c) => c.id === g.currentChapterId) ?? STORY_CHAPTERS[0];
      g.wave = g.currentChapterId;
      g.spawn = 1;
      g.enemies.push({
        x: 750,
        y: 320,
        hp: chap.bossHp,
        cooldown: 1.5,
        facing: -1,
        fighterId: chap.enemyFighter,
        powerLevel: 10000 * g.currentChapterId,
      });
    } else if (g.enemies.length === 0 && g.spawn > 0) {
      g.status = "won";
      g.score += 500;
      return;
    }
  } else {
    if (!g.enemies.length && g.spawn <= 0) {
      if (g.wave === 5) {
        g.status = "won";
        return;
      }
      g.wave++;
      for (let i = 0; i < g.wave + 1; i++) {
        g.enemies.push({
          x: 660 + i * 45,
          y: 320,
          hp: 35 + g.wave * 8,
          cooldown: 0.5 + i * 0.2,
          facing: -1,
          powerLevel: 5000 * g.wave,
        });
      }
    }
    g.spawn = Math.max(0, g.spawn - clampedDt);
  }

  // Nettoyage et comptage des scores
  for (const e of g.enemies) {
    if (e.hp <= 0) {
      g.score += 100;
      p.energy = Math.min(100, p.energy + 8);
    }
  }
  const alive = g.enemies.filter((e) => e.hp > 0);
  if (alive.length !== g.enemies.length && !alive.length) {
    if (g.mode === "story") {
      g.status = "won";
      g.score += 500;
    } else {
      g.spawn = 1.5;
    }
  }
  g.enemies = alive;
  if (p.hp <= 0) g.status = "lost";

  // IA des adversaires
  for (const e of g.enemies) {
    e.cooldown = Math.max(0, e.cooldown - clampedDt);
    const dist = p.x - e.x;
    e.facing = dist > 0 ? 1 : -1;

    // Déplacement vers le joueur
    if (Math.abs(dist) > 55) {
      e.x += (dist > 0 ? 1 : -1) * 110 * clampedDt;
    }

    // Attaque de l'IA quand à portée
    if (Math.abs(dist) < 55 && !e.cooldown) {
      e.cooldown = 0.85;
      const baseDmg = g.mode === "story" ? 12 : (p.transformed ? 3 : 6);
      const dmg = p.guarding ? Math.max(1, Math.round(baseDmg * 0.2)) : baseDmg;
      p.hp = Math.max(0, p.hp - dmg);
      g.screenShake = 3;
      if (p.hp <= 0) {
        g.status = "lost";
      }
    } else if (Math.abs(dist) > 180 && !e.cooldown && Math.random() < 0.02) {
      // Tir de Kikōha par l'IA à distance
      e.cooldown = 2.0;
      g.shots.push({
        x: e.x + (e.facing ?? -1) * 35,
        y: e.y - 30,
        vx: (e.facing ?? -1) * 450,
        damage: 18,
        isBeam: Math.random() < 0.25,
        color: "#d90429",
        source: "enemy",
        duration: 0.5,
      });
    }
  }
}
