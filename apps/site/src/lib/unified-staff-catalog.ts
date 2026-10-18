import { assetUrl } from "@/lib/assets";
import type {
  StaffEra,
  StaffStudio,
  StaffTier,
  UnifiedStaffMember,
} from "@/components/wiki/UnifiedStaffExplorer";

const ANECDOTES_MAP: Record<string, string> = {
  // --- Créateurs & Éditeurs ---
  "kazuhiko-torishima":
    "A rejeté plus de 500 pages de Toriyama avant Dr. Slump. Il a poussé l'auteur vers les arts martiaux et a inspiré directement les visages du Dr. Mashirito et du Roi Démon Piccolo.",
  "yu-kondo":
    "Éditeur de l'apogée Namek. Jugeant le design originel de Freezer trop banal, il a exigé des métamorphoses successives qui ont donné naissance aux 4 formes mythiques du tyran.",
  "fuyuto-takeda":
    "A accompagné Toriyama jusqu'au 519e chapitre. Connu pour sa complicité totale avec l'auteur, lui laissant carte blanche pour l'humour et les fusions délirantes de l'arc Buu.",
  "akio-iyoku":
    "Ancien rédacteur en chef du V-Jump, créateur de la Dragon Ball Room chez Shueisha en 2016, puis fondateur de Capsule Corporation Tokyo pour pérenniser l'héritage de Toriyama.",
  "victory-uchida":
    "Visage public culte du V-Jump et animateur vedette des Weekly Dragon Ball News. Il a collaboré étroitement avec Toriyama et Toyotarō sur les arcs Granolah et Super Hero du manga.",

  // --- Animation & Réalisation ---
  "naotoshi-shida":
    "Surnommé le « Climax Animator » de Toei Animation. Connu pour ses séquences d'anthologie (Trunks découpant Mecha Freezer, Vegeto Blue vs Zamasu, le climax de DBS: Broly) avec ses déformations grand-angle et ses impacts percutants.",
  "yuya-takahashi":
    "Adulé par les fans pour avoir réintroduit les traits musculeux, ombrés et anguleux de l'apogée de DBZ dans Dragon Ball Super (épisodes 114 et 131) et Dragon Ball Daima en tant que directeur d'animation en chef.",
  "masayuki-uchiyama":
    "Fondateur de Studio Last House. Il détient le record absolu d'épisodes supervisés dans toute l'histoire de la franchise Dragon Ball (des dizaines d'épisodes de DB, DBZ et DBGT).",
  "daisuke-nishio":
    "Réalisateur légendaire des 199 premiers épisodes de DBZ. Il chronométrait lui-même chaque échange de coups sur ses storyboards pour garantir un rythme d'impact inégalé.",
  "shigeyasu-yamauchi":
    "Réalisateur visionnaire des films Broly (1993) et Janemba (1995). Toriyama a personnellement salué son sens tragique et ses cadrages cinématographiques d'une noirceur sublime.",
  "minoru-maeda":
    "Superviseur général de l'animation de 1986 à 1993. Ses fiches de settei restent la référence graphique absolue pour le trait tout en rondeur et en puissance de Toriyama.",
  "masaki-sato":
    "Animateur vedette de la Toei. Il a animé de ses mains les plans cultes de Goku vs Vegeta (Kaioken x3) et l'exécution chirurgicale de Mecha Freezer par Trunks.",
  "tadayoshi-yamamuro":
    "A défini pendant plus de 25 ans l'identité visuelle de DBZ avec ses traits d'ombres acérés et sa musculature ultra-découpée, avant de réaliser Battle of Gods et Fukkatsu no F.",
  "naohiro-shintani":
    "Sélectionné personnellement par Akira Toriyama sur concours pour Dragon Ball Super: Broly grâce à son trait épuré, souple et fidèle aux illustrations vintage de l'auteur.",
  "chikashi-kubota":
    "Directeur de l'animation sur Dragon Ball Super: Super Hero, réputé pour la séquence d'ouverture 2D époustouflante résumant la saga du Ruban Rouge.",
  "takao-koyama":
    "Scénariste principal de DBZ (épisodes 1 à 291) et des 13 premiers films. C'est à sa plume que l'on doit les créations mythiques de Broly, Cooler, Bojack et Janemba.",
  "katsuyoshi-nakatsuru":
    "Directeur d'animation vedette adoubé par Akira Toriyama, qui admirait sa fidélité parfaite à son style au point de confondre parfois ses propres dessins avec ceux de Nakatsuru. Créateur des designs de Bardock et du Super Saiyan 4.",
  "shunsuke-kikuchi":
    "A composé plus de 400 morceaux symphoniques pour Dragon Ball et DBZ, tous enregistrés en prises directes avec un grand orchestre de cuivres et de cordes.",
  "hironobu-kageyama":
    "Surnommé « M. Dragon Ball ». Il a chanté Cha-La Head-Cha-La et We Gotta Power des milliers de fois en concert à travers le monde devant des foules immenses.",
  "norihito-sumitomo":
    "Architecte du renouveau sonore de Dragon Ball au 21e siècle, compositeur de Battle of Gods et du mythique « Ultimate Battle » (Ka Ka Kachi Daze) du Tournoi du Pouvoir.",

  // --- Seiyū Japonais (VO) ---
  "masako-nozawa":
    "Akira Toriyama l'a choisie en 1986 après seulement quelques répliques : « Dès que j'ai entendu sa voix, j'ai su que Son Goku existait réellement ». Deux records du monde Guinness.",
  "ryo-horikawa":
    "Voix japonaise intemporelle de Vegeta. Sa déclamation hautaine et son cri du Final Flash ont sculpté la noblesse tragique du prince saiyan.",
  "toshio-furukawa":
    "Voix légendaire de Piccolo. Toriyama admirait son timbre rauque et noble, parfaitement adapté à la figure de mentor solitaire.",
  "mayumi-tanaka":
    "Incarnation indissociable de Krillin et Yajirobé. Sa complicité avec Masako Nozawa en cabine de doublage dure depuis plus de quatre décennies.",
  "takeshi-kusao":
    "A donné toute son intensité dramatique à Trunks du futur dès 1991, faisant du guerrier de l'espoir l'un des personnages les plus populaires de l'histoire.",
  "ryusei-nakao":
    "A créé le rire glaçant « Ohohoho ! » et la politesse obséquieuse terrifiante de Freezer, devenant l'archétype ultime du tyran galactique.",
  "koichi-yamadera":
    "Doubleur caméléon virtuose au Japon, capable de passer de la nonchalance gourmande à la terreur divine la plus absolue dans le rôle de Beerus.",

  // --- Voix Françaises (VF) ---
  "patrick-borg":
    "Voix française historique de Goku adulte depuis 1990. Réputé pour ses hurlements de rage héroïque poussés sans trucage sonore lors des transformations en Super Saiyan.",
  "brigitte-lecordier":
    "A immortalisé l'enfance de Goku, Gohan et Goten en VF. Sa spontanéité et son rire malicieux ont marqué l'âge d'or du Club Dorothée.",
  "eric-legrand":
    "A enrichi le caractère princier de Vegeta en VF avec des tirades théâtrales cinglantes (« Maraud ! Insolent ! Faquin ! ») devenues légendaires chez les francophones.",
  "philippe-ariotti":
    "Prodige du doublage capable d'incarner simultanément la sagesse solennelle de Piccolo, la froideur aristocratique de Freezer et la couardise comique d'Oolong.",
  "celine-monsarrat":
    "Voix française de Bulma depuis 1988 (et de Julia Roberts), conférant au personnage son tempérament intrépide, pétillant et volcanique.",
  "marc-lesser":
    "A immortalisé Trunks du futur en VF dès son arrivée face à Mecha Freezer, avec une classe et un sens du drame inoubliables.",
  "frederic-bouraly":
    "Comédien emblématique ayant prêté sa verve comique inimitable à Mr. Satan (Hercule) dans la saga Majin Buu.",
  "gilbert-levy":
    "Figure majeure du doublage français (également Moe dans Les Simpson), il a prêté sa gouaille et sa voix inimitable à Tortue Géniale (Maître Roshi) et Dendé.",
  "bruno-magne":
    "Interprète magistral de Beerus en VF depuis Battle of Gods et Dragon Ball Super, dosant avec brio flegme félin et puissance cosmique.",
  "stephane-ronchewski":
    "Voix française de Whis dans Dragon Ball Super, remarquable par sa diction raffinée, mystérieuse et détachée.",

  // --- Diffusion & Génériques en France ---
  dorothee:
    "Animatrice et productrice qui a importé et diffusé Dragon Ball pour la première fois en France le 2 mars 1988 dans le Club Dorothée sur TF1, déclenchant un raz-de-marée culturel sans précédent.",
  "bernard-minet":
    "A chanté les hymnes de plusieurs générations en interprétant les génériques français de Dragon Ball et Dragon Ball Z (La chanson de Dragon Ball, Il va triompher).",

  // --- Voix Anglaises (VA) ---
  "sean-schemmel":
    "Voix américaine culte chez Funimation. S'est littéralement évanoui en cabine de doublage en poussant à l'extrême son souffle sur le cri du Super Saiyan 4.",
  "christopher-sabat":
    "Pilier du doublage américain, il a dirigé le casting anglais de Dragon Ball pendant 20 ans tout en assurant avec brio les voix de Vegeta, Piccolo, Yamcha et Shenron.",
  "sonny-strait":
    "Voix officielle de Krillin et Bardock aux États-Unis, apportant un humour touchant et une grande humanité à ces combattants.",
  "eric-vale":
    "Interprète américain historique de Trunks du futur depuis l'arc des Cyborgs jusqu'à l'arc Goku Black dans Dragon Ball Super.",
  "kyle-hebert":
    "Voix américaine iconique du narrateur de Dragon Ball Z et de Son Gohan adulte (Great Saiyaman, Ultimate Gohan) chez Funimation.",
  "monica-rial":
    "Voix américaine majeure de Bulma chez Funimation/Crunchyroll depuis Dragon Ball Z Kai, succédant avec brio à Tiffany Vollmer.",
  "colleen-clinkenbeard":
    "Directrice artistique et voix anglaise de Son Gohan jeune et Son Goku jeune dans Dragon Ball Z Kai.",
  "dameon-clarke":
    "A façonné la voix glaçante et sophistiquée de Cell parfait dans les doublages anglophones.",
  "linda-young":
    "Voix originale rauque et menaçante de Freezer dans le doublage américain des années 1990/2000 chez Funimation.",
  "daman-mills":
    "Successeur acclamé de Chris Ayres pour la voix sophistiquée et impitoyable de Freezer dans Dragon Ball Super.",

  // --- International ---
  "mario-castaneda":
    "Légende vivante du doublage au Mexique et en Amérique latine. Son interprétation du Kaméhaméha est reprise en chœur par des dizaines de milliers de fans en convention.",
  "rene-garcia":
    "Voix officielle de Vegeta en Amérique latine. Son juron méprisant « ¡Insecto! » est devenu un mème absolu et un repère culturel majeur dans tout le monde hispanique.",
  "jose-antonio-gavira":
    "Voix historique de Son Goku adulte en Espagne (Castillan) lors de l'explosion du phénomène Dragon Ball Z à la télévision ibérique.",
  "paolo-torrisi":
    "Comédien et directeur de doublage italien historique. Voix inoubliable de Goku adulte sur Italia 1 de 1999 jusqu'à sa tragique disparition en 2005.",
};

/** Portraits officiels authentifiés (Wikimedia Commons / archives publiques). */
const PORTRAITS_MAP: Record<string, string> = {
  // Éditeurs & Créateurs
  "kazuhiko-torishima":
    "https://upload.wikimedia.org/wikipedia/commons/0/03/Torishima_wiki.png?utm_source=en.wikipedia.org&utm_campaign=api&utm_content=thumbnail_unscaled",

  // Compositeurs & Musiciens
  "hironobu-kageyama":
    "https://thumb.wikimedia.org/wikipedia/commons/thumb/0/0f/KAGEAVATAR.jpg/330px-KAGEAVATAR.jpg?utm_source=en.wikipedia.org&utm_campaign=api&utm_content=thumbnail",

  // Seiyū Japonais
  "masako-nozawa":
    "https://thumb.wikimedia.org/wikipedia/commons/thumb/b/b1/%E9%87%8E%E6%B2%A2%E9%9B%85%E5%AD%90.png/330px-%E9%87%8E%E6%B2%A2%E9%9B%85%E5%AD%90.png?utm_source=en.wikipedia.org&utm_campaign=api&utm_content=thumbnail",
  "ryo-horikawa":
    "https://thumb.wikimedia.org/wikipedia/commons/thumb/7/7b/Ryo_Horikawa_%2814947949559%29.jpg/330px-Ryo_Horikawa_%2814947949559%29.jpg?utm_source=en.wikipedia.org&utm_campaign=api&utm_content=thumbnail",
  "toshio-furukawa":
    "https://thumb.wikimedia.org/wikipedia/commons/thumb/8/8b/Toshio_Furukawa.jpg/330px-Toshio_Furukawa.jpg?utm_source=en.wikipedia.org&utm_campaign=api&utm_content=thumbnail",
  "mayumi-tanaka":
    "https://thumb.wikimedia.org/wikipedia/commons/thumb/2/28/Mayumi_Tanaka_2023.jpg/330px-Mayumi_Tanaka_2023.jpg?utm_source=en.wikipedia.org&utm_campaign=api&utm_content=thumbnail",
  "takeshi-kusao":
    "https://thumb.wikimedia.org/wikipedia/commons/thumb/8/85/Takeshi_Kusao.jpg/330px-Takeshi_Kusao.jpg?utm_source=en.wikipedia.org&utm_campaign=api&utm_content=thumbnail",
  "ryusei-nakao":
    "https://thumb.wikimedia.org/wikipedia/commons/thumb/6/6a/Ry%C5%ABsei_Nakao_%2838122888406%29.jpg/330px-Ry%C5%ABsei_Nakao_%2838122888406%29.jpg?utm_source=en.wikipedia.org&utm_campaign=api&utm_content=thumbnail",
  "koichi-yamadera":
    "https://thumb.wikimedia.org/wikipedia/commons/thumb/a/a6/Yamadera_Koichi.png/330px-Yamadera_Koichi.png?utm_source=ja.wikipedia.org&utm_campaign=api&utm_content=thumbnail",

  // Voix Françaises (VF)
  "eric-legrand":
    "https://thumb.wikimedia.org/wikipedia/commons/thumb/f/ff/%C3%89ric_Legrand_-_2012_Sci-Fi_Convention_Toulouse_293.jpg/330px-%C3%89ric_Legrand_-_2012_Sci-Fi_Convention_Toulouse_293.jpg?utm_source=fr.wikipedia.org&utm_campaign=api&utm_content=thumbnail",
  "patrick-borg":
    "https://thumb.wikimedia.org/wikipedia/commons/thumb/6/60/Patrick_Borg_%2852747511372%29.jpg/330px-Patrick_Borg_%2852747511372%29.jpg?utm_source=fr.wikipedia.org&utm_campaign=api&utm_content=thumbnail",
  "brigitte-lecordier":
    "https://thumb.wikimedia.org/wikipedia/commons/thumb/5/53/Brigitte_Lecordier_2026.jpg/330px-Brigitte_Lecordier_2026.jpg?utm_source=fr.wikipedia.org&utm_campaign=api&utm_content=thumbnail",
  "philippe-ariotti":
    "https://thumb.wikimedia.org/wikipedia/commons/thumb/7/70/Philippe_Ariotti_au_Biarritz_Japan_Festival_2023.png/330px-Philippe_Ariotti_au_Biarritz_Japan_Festival_2023.png?utm_source=fr.wikipedia.org&utm_campaign=api&utm_content=thumbnail",
  "celine-monsarrat":
    "https://thumb.wikimedia.org/wikipedia/commons/thumb/5/55/C%C3%A9line_Monsarrat_2023.jpg/330px-C%C3%A9line_Monsarrat_2023.jpg?utm_source=fr.wikipedia.org&utm_campaign=api&utm_content=thumbnail",
  "frederic-bouraly":
    "https://thumb.wikimedia.org/wikipedia/commons/thumb/e/e9/Fr%C3%A9d%C3%A9ric_Bouraly.jpg/330px-Fr%C3%A9d%C3%A9ric_Bouraly.jpg?utm_source=fr.wikipedia.org&utm_campaign=api&utm_content=thumbnail",
  "gilbert-levy":
    "https://thumb.wikimedia.org/wikipedia/commons/thumb/5/5e/Gilbert_L%C3%A9vy_2023.jpg/330px-Gilbert_L%C3%A9vy_2023.jpg?utm_source=fr.wikipedia.org&utm_campaign=api&utm_content=thumbnail",
  "stephane-ronchewski":
    "https://thumb.wikimedia.org/wikipedia/commons/thumb/7/74/Stephane-ronchewski.jpg/330px-Stephane-ronchewski.jpg?utm_source=fr.wikipedia.org&utm_campaign=api&utm_content=thumbnail",

  // Diffusion & Histoire TV France
  dorothee:
    "https://thumb.wikimedia.org/wikipedia/commons/thumb/c/c6/Dorothee_20080318_Salon_du_livre_6.jpg/330px-Dorothee_20080318_Salon_du_livre_6.jpg?utm_source=fr.wikipedia.org&utm_campaign=api&utm_content=thumbnail",
  "bernard-minet":
    "https://thumb.wikimedia.org/wikipedia/commons/thumb/0/01/Toulouse_Game_Show_2011_-_Bernard_Minet_-_P1290229.jpg/330px-Toulouse_Game_Show_2011_-_Bernard_Minet_-_P1290229.jpg?utm_source=fr.wikipedia.org&utm_campaign=api&utm_content=thumbnail",

  // Voix Anglaises (VA)
  "christopher-sabat":
    "https://thumb.wikimedia.org/wikipedia/commons/thumb/3/3b/Christopher_Sabat_GalaxyCon_Raleigh_July%2C_25%2C_2026_365.jpg/330px-Christopher_Sabat_GalaxyCon_Raleigh_July%2C_25%2C_2026_365.jpg?utm_source=en.wikipedia.org&utm_campaign=api&utm_content=thumbnail",
  "sean-schemmel":
    "https://thumb.wikimedia.org/wikipedia/commons/thumb/6/67/Sean_Schemmel_Photo_Op_GalaxyCon_Minneapolis_2019.jpg/330px-Sean_Schemmel_Photo_Op_GalaxyCon_Minneapolis_2019.jpg?utm_source=en.wikipedia.org&utm_campaign=api&utm_content=thumbnail",
  "sonny-strait":
    "https://thumb.wikimedia.org/wikipedia/commons/thumb/d/d4/Sonny_Strait_GalaxyCon_Raleigh_July%2C_25%2C_2026_316.jpg/330px-Sonny_Strait_GalaxyCon_Raleigh_July%2C_25%2C_2026_316.jpg?utm_source=en.wikipedia.org&utm_campaign=api&utm_content=thumbnail",
  "eric-vale":
    "https://thumb.wikimedia.org/wikipedia/commons/thumb/6/6e/686-8x10.jpg/330px-686-8x10.jpg?utm_source=en.wikipedia.org&utm_campaign=api&utm_content=thumbnail",
  "kyle-hebert":
    "https://thumb.wikimedia.org/wikipedia/commons/thumb/1/1b/Kyle_Hebert_%2838122864326%29.jpg/330px-Kyle_Hebert_%2838122864326%29.jpg?utm_source=en.wikipedia.org&utm_campaign=api&utm_content=thumbnail",
  "monica-rial":
    "https://thumb.wikimedia.org/wikipedia/commons/thumb/e/e4/Monica_Rial_GalaxyCon_Des_Moines_September%2C12%2C2026_1776.jpg/330px-Monica_Rial_GalaxyCon_Des_Moines_September%2C12%2C2026_1776.jpg?utm_source=en.wikipedia.org&utm_campaign=api&utm_content=thumbnail",
  "colleen-clinkenbeard":
    "https://thumb.wikimedia.org/wikipedia/commons/thumb/a/ae/Colleen_Clinkenbeard_GalaxyCon_Raleigh_July%2C_25%2C_2026_328.jpg/330px-Colleen_Clinkenbeard_GalaxyCon_Raleigh_July%2C_25%2C_2026_328.jpg?utm_source=en.wikipedia.org&utm_campaign=api&utm_content=thumbnail",
  "dameon-clarke":
    "https://thumb.wikimedia.org/wikipedia/commons/thumb/5/56/DameonClarkeHS.png/330px-DameonClarkeHS.png?utm_source=en.wikipedia.org&utm_campaign=api&utm_content=thumbnail",
  "linda-young":
    "https://thumb.wikimedia.org/wikipedia/commons/thumb/6/61/Linda_Young_2017.jpg/330px-Linda_Young_2017.jpg?utm_source=en.wikipedia.org&utm_campaign=api&utm_content=thumbnail",
  "daman-mills":
    "https://thumb.wikimedia.org/wikipedia/commons/thumb/2/27/Daman_Mills_by_Gage_Skidmore.jpg/330px-Daman_Mills_by_Gage_Skidmore.jpg?utm_source=en.wikipedia.org&utm_campaign=api&utm_content=thumbnail",
  "stephanie-nadolny":
    "https://thumb.wikimedia.org/wikipedia/commons/thumb/c/cf/Stephanie_Nadolny.jpg/330px-Stephanie_Nadolny.jpg?utm_source=en.wikipedia.org&utm_campaign=api&utm_content=thumbnail",
  "ian-james-corlett":
    "https://thumb.wikimedia.org/wikipedia/commons/thumb/0/08/Ian_James_Corlett_at_Fan_Expo_Denver_2026.jpg/330px-Ian_James_Corlett_at_Fan_Expo_Denver_2026.jpg?utm_source=en.wikipedia.org&utm_campaign=api&utm_content=thumbnail",
  "peter-kelamis":
    "https://thumb.wikimedia.org/wikipedia/commons/thumb/1/1c/Peter_Kelamis_-1-_%2834930958622%29.jpg/330px-Peter_Kelamis_-1-_%2834930958622%29.jpg?utm_source=en.wikipedia.org&utm_campaign=api&utm_content=thumbnail",
};

/** Données enrichies intégrées au catalogue pour garantir l'exhaustivité demandée. */
const EXTENDED_STAFF: UnifiedStaffMember[] = [
  // --- VF et Diffusion France ---
  {
    id: "dorothee",
    slug: "dorothee",
    nameFr: "Dorothée (Frédérique Hoschedé)",
    tier: "editorial",
    tierLabel: "Pionnière TV & Diffusion",
    subRole: "Animatrice & Productrice pionnière de Dragon Ball en France",
    period: "1988 — Présent",
    eras: ["db", "dbz"],
    studio: "audio_dub",
    studioLabel: "Club Dorothée / TF1 / AB Productions",
    keyWorks: ["Club Dorothée", "Diffusion historique TF1", "Génériques TV"],
    bioSummary:
      "Figure centrale de l'audiovisuel jeunesse français. C'est sous son impulsion et celle d'AB Productions que Dragon Ball est diffusé pour la première fois en France le 2 mars 1988 sur TF1, déclenchant l'engouement national pour l'animation japonaise.",
    anecdote: ANECDOTES_MAP["dorothee"],
    image: PORTRAITS_MAP["dorothee"],
    wikiLink: "/wiki/staff#dorothee",
  },
  {
    id: "bernard-minet",
    slug: "bernard-minet",
    nameFr: "Bernard Minet",
    tier: "production",
    tierLabel: "Musique & Génériques VF",
    subRole: "Interprète des génériques cultes de Dragon Ball et DBZ",
    period: "1988 — Présent",
    eras: ["db", "dbz"],
    studio: "audio_dub",
    studioLabel: "AB Productions",
    keyWorks: ["La chanson de Dragon Ball", "Dragon Ball Z (Il va triompher)"],
    bioSummary:
      "Chanteur et musicien membre des Musclés, voix incontournable des génériques français diffusés sur TF1 qui ont accompagné des millions de téléspectateurs francophones.",
    anecdote: ANECDOTES_MAP["bernard-minet"],
    image: PORTRAITS_MAP["bernard-minet"],
    wikiLink: "/wiki/staff#bernard-minet",
  },
  {
    id: "celine-monsarrat",
    slug: "celine-monsarrat",
    nameFr: "Céline Monsarrat",
    tier: "voice_fr",
    tierLabel: "Doublage Français (VF)",
    subRole: "Voix de Bulma",
    period: "1988 — Présent",
    eras: ["db", "dbz", "dbs", "daima"],
    studio: "audio_dub",
    studioLabel: "Doublage Français (SOFI / AB / Chinkel)",
    keyWorks: ["Bulma"],
    bioSummary:
      "Comédienne renommée (voix française régulière de Julia Roberts), elle a créé et interprété avec brio la personnalité pétillante, ingénieuse et colérique de Bulma depuis les tout premiers épisodes de Dragon Ball.",
    anecdote: ANECDOTES_MAP["celine-monsarrat"],
    image: PORTRAITS_MAP["celine-monsarrat"],
    wikiLink: "/wiki/staff#celine-monsarrat",
    roles: [
      {
        characterName: "Bulma",
        series: "DB, DBZ, DBS, Daima, Films",
        notes: "Voix historique emblématique.",
      },
    ],
  },
  {
    id: "marc-lesser",
    slug: "marc-lesser",
    nameFr: "Marc Lesser",
    tier: "voice_fr",
    tierLabel: "Doublage Français (VF)",
    subRole: "Voix de Trunks du futur",
    period: "1992 — Présent",
    eras: ["dbz", "dbs"],
    studio: "audio_dub",
    studioLabel: "Doublage Français (AB Productions / Chinkel)",
    keyWorks: ["Trunks du futur", "Trunks adulte"],
    bioSummary:
      "Voix française inoubliable de Trunks du futur lors de son apparition fracassante face à Freezer et Roi Cold, puis dans l'arc Goku Black de Dragon Ball Super.",
    anecdote: ANECDOTES_MAP["marc-lesser"],
    wikiLink: "/wiki/staff#marc-lesser",
    roles: [
      {
        characterName: "Trunks (Futur / Adulte)",
        series: "DBZ, DBS, Films",
        notes: "Guerrier de l'espoir.",
      },
    ],
  },
  {
    id: "frederic-bouraly",
    slug: "frederic-bouraly",
    nameFr: "Frédéric Bouraly",
    tier: "voice_fr",
    tierLabel: "Doublage Français (VF)",
    subRole: "Voix de Mr. Satan (Hercule)",
    period: "1994 — Présent",
    eras: ["dbz", "dbs"],
    studio: "audio_dub",
    studioLabel: "Doublage Français",
    keyWorks: ["Mr. Satan"],
    bioSummary:
      "Acteur très populaire, il a donné une énergie comique spectaculaire et communicative au champion du monde des menteurs, Mr. Satan, dans la saga Buu.",
    anecdote: ANECDOTES_MAP["frederic-bouraly"],
    image: PORTRAITS_MAP["frederic-bouraly"],
    wikiLink: "/wiki/staff#frederic-bouraly",
    roles: [
      {
        characterName: "Mr. Satan",
        series: "DBZ, DBS",
        notes: "Champion comique et sauveur inattendu.",
      },
    ],
  },
  {
    id: "gilbert-levy",
    slug: "gilbert-levy",
    nameFr: "Gilbert Lévy",
    tier: "voice_fr",
    tierLabel: "Doublage Français (VF)",
    subRole: "Voix de Tortue Géniale & Dendé",
    period: "1990 — Présent",
    eras: ["db", "dbz", "dbs"],
    studio: "audio_dub",
    studioLabel: "Doublage Français (AB Productions / Chinkel)",
    keyWorks: ["Tortue Géniale (Maître Roshi)", "Dendé (adulte)"],
    bioSummary:
      "Comédien emblématique du doublage français (également voix de Moe Szyslak dans Les Simpson), il a prêté son timbre rocailleux et son humour décapant à Tortue Géniale.",
    anecdote: ANECDOTES_MAP["gilbert-levy"],
    image: PORTRAITS_MAP["gilbert-levy"],
    wikiLink: "/wiki/staff#gilbert-levy",
    roles: [
      {
        characterName: "Tortue Géniale",
        series: "DB, DBZ, DBS",
        notes: "Maître des arts martiaux.",
      },
      { characterName: "Dendé (adulte)", series: "DBZ", notes: "Tout-Puissant de la Terre." },
    ],
  },
  {
    id: "bruno-magne",
    slug: "bruno-magne",
    nameFr: "Bruno Magne",
    tier: "voice_fr",
    tierLabel: "Doublage Français (VF)",
    subRole: "Voix de Beerus",
    period: "2015 — Présent",
    eras: ["dbs"],
    studio: "audio_dub",
    studioLabel: "Doublage Français (Chinkel / Lylo)",
    keyWorks: ["Beerus"],
    bioSummary:
      "Comédien d'une immense précision vocale, il interprète le Dieu de la Destruction Beerus dans Dragon Ball Super et les longs-métrages modernes.",
    anecdote: ANECDOTES_MAP["bruno-magne"],
    wikiLink: "/wiki/staff#bruno-magne",
    roles: [
      {
        characterName: "Beerus",
        series: "Battle of Gods, DBS, Broly, Super Hero",
        notes: "Dieu de la Destruction.",
      },
    ],
  },
  {
    id: "stephane-ronchewski",
    slug: "stephane-ronchewski",
    nameFr: "Stéphane Ronchewski",
    tier: "voice_fr",
    tierLabel: "Doublage Français (VF)",
    subRole: "Voix de Whis",
    period: "2015 — Présent",
    eras: ["dbs"],
    studio: "audio_dub",
    studioLabel: "Doublage Français (Chinkel / Lylo)",
    keyWorks: ["Whis"],
    bioSummary:
      "Voix française de l'ange Whis, guide et maître martial de Beerus, avec un flegme aristocratique et une douceur teintée d'ironie.",
    anecdote: ANECDOTES_MAP["stephane-ronchewski"],
    image: PORTRAITS_MAP["stephane-ronchewski"],
    wikiLink: "/wiki/staff#stephane-ronchewski",
    roles: [
      {
        characterName: "Whis",
        series: "DBS, Battle of Gods, Broly",
        notes: "Ange de l'Univers 7.",
      },
    ],
  },

  // --- VA (Doublage Anglais) ---
  {
    id: "sonny-strait",
    slug: "sonny-strait",
    nameFr: "Sonny Strait",
    tier: "voice_en",
    tierLabel: "Doublage Anglais (VA)",
    subRole: "Voix de Krillin & Bardock",
    period: "1999 — Présent",
    eras: ["dbz", "dbs"],
    studio: "audio_dub",
    studioLabel: "Funimation / Crunchyroll (USA)",
    keyWorks: ["Krillin", "Bardock"],
    bioSummary:
      "Comédien et scénariste texan, voix officielle anglophone de Krillin et de Bardock dans l'ensemble des séries et jeux vidéo produits par Funimation.",
    anecdote: ANECDOTES_MAP["sonny-strait"],
    image: PORTRAITS_MAP["sonny-strait"],
    wikiLink: "/wiki/staff#sonny-strait",
    roles: [
      { characterName: "Krillin", series: "DBZ, DBS", notes: "Meilleur ami de Goku." },
      { characterName: "Bardock", series: "Films & Spéciaux", notes: "Père de Goku." },
    ],
  },
  {
    id: "eric-vale",
    slug: "eric-vale",
    nameFr: "Eric Vale",
    tier: "voice_en",
    tierLabel: "Doublage Anglais (VA)",
    subRole: "Voix de Trunks du futur",
    period: "2000 — Présent",
    eras: ["dbz", "dbs"],
    studio: "audio_dub",
    studioLabel: "Funimation / Crunchyroll (USA)",
    keyWorks: ["Trunks du futur"],
    bioSummary:
      "Interprète vocal américain culte de Trunks adulte et Trunks du futur, apportant intensité et mélancolie au voyageur temporel.",
    anecdote: ANECDOTES_MAP["eric-vale"],
    image: PORTRAITS_MAP["eric-vale"],
    wikiLink: "/wiki/staff#eric-vale",
    roles: [
      {
        characterName: "Trunks (Future)",
        series: "DBZ, DBS",
        notes: "Voix anglophone principale.",
      },
    ],
  },
  {
    id: "kyle-hebert",
    slug: "kyle-hebert",
    nameFr: "Kyle Hebert",
    tier: "voice_en",
    tierLabel: "Doublage Anglais (VA)",
    subRole: "Voix du narrateur & Gohan adulte",
    period: "2000 — Présent",
    eras: ["dbz", "dbs"],
    studio: "audio_dub",
    studioLabel: "Funimation / Crunchyroll (USA)",
    keyWorks: ["Son Gohan (Adulte)", "Narrateur DBZ"],
    bioSummary:
      "Voix officielle américaine de Son Gohan adulte (Great Saiyaman, Ultimate Gohan) et narrateur emblématique de Dragon Ball Z (« Last time on Dragon Ball Z... »).",
    anecdote: ANECDOTES_MAP["kyle-hebert"],
    image: PORTRAITS_MAP["kyle-hebert"],
    wikiLink: "/wiki/staff#kyle-hebert",
    roles: [
      {
        characterName: "Son Gohan (Adulte)",
        series: "DBZ, DBS",
        notes: "Great Saiyaman / Guerrier ultime.",
      },
      { characterName: "Narrateur", series: "DBZ", notes: "Voix d'ouverture culte." },
    ],
  },
  {
    id: "monica-rial",
    slug: "monica-rial",
    nameFr: "Monica Rial",
    tier: "voice_en",
    tierLabel: "Doublage Anglais (VA)",
    subRole: "Voix de Bulma",
    period: "2010 — Présent",
    eras: ["dbz", "dbs"],
    studio: "audio_dub",
    studioLabel: "Funimation / Crunchyroll (USA)",
    keyWorks: ["Bulma"],
    bioSummary:
      "Comédienne prolifique de l'animation aux États-Unis, voix de Bulma depuis Dragon Ball Z Kai, saluée pour sa restitution fidèle du personnage.",
    anecdote: ANECDOTES_MAP["monica-rial"],
    image: PORTRAITS_MAP["monica-rial"],
    wikiLink: "/wiki/staff#monica-rial",
    roles: [
      { characterName: "Bulma", series: "DBZ Kai, DBS, Films", notes: "Voix anglophone moderne." },
    ],
  },
  {
    id: "colleen-clinkenbeard",
    slug: "colleen-clinkenbeard",
    nameFr: "Colleen Clinkenbeard",
    tier: "voice_en",
    tierLabel: "Doublage Anglais (VA)",
    subRole: "Voix de Gohan jeune & Goku jeune",
    period: "2010 — Présent",
    eras: ["db", "dbz"],
    studio: "audio_dub",
    studioLabel: "Funimation / Crunchyroll (USA)",
    keyWorks: ["Son Gohan (enfant/ado)", "Son Goku (enfant)"],
    bioSummary:
      "Directrice de doublage et actrice vocale de premier plan chez Funimation, reprenant Gohan jeune dans DBZ Kai avec un impact émotionnel remarquable lors du combat contre Cell.",
    anecdote: ANECDOTES_MAP["colleen-clinkenbeard"],
    image: PORTRAITS_MAP["colleen-clinkenbeard"],
    wikiLink: "/wiki/staff#colleen-clinkenbeard",
    roles: [
      { characterName: "Son Gohan (Jeune)", series: "DBZ Kai", notes: "Apogée Super Saiyan 2." },
    ],
  },
  {
    id: "dameon-clarke",
    slug: "dameon-clarke",
    nameFr: "Dameon Clarke",
    tier: "voice_en",
    tierLabel: "Doublage Anglais (VA)",
    subRole: "Voix de Cell",
    period: "2000 — Présent",
    eras: ["dbz", "dbs"],
    studio: "audio_dub",
    studioLabel: "Funimation / Crunchyroll (USA)",
    keyWorks: ["Cell (Parfait)"],
    bioSummary:
      "A composé la voix anglophone sophistiquée, arrogante et terrifiante de Cell sous ses formes imparfaite, semi-parfaite et parfaite.",
    anecdote: ANECDOTES_MAP["dameon-clarke"],
    image: PORTRAITS_MAP["dameon-clarke"],
    wikiLink: "/wiki/staff#dameon-clarke",
    roles: [
      {
        characterName: "Cell",
        series: "DBZ, DBZ Kai, Jeux",
        notes: "Création suprême du Dr. Gero.",
      },
    ],
  },
  {
    id: "linda-young",
    slug: "linda-young",
    nameFr: "Linda Young",
    tier: "voice_en",
    tierLabel: "Doublage Anglais (VA)",
    subRole: "Voix historique de Freezer",
    period: "1999 — 2010",
    eras: ["dbz", "gt"],
    studio: "audio_dub",
    studioLabel: "Funimation (USA)",
    keyWorks: ["Freezer (VF anglaise originale)"],
    bioSummary:
      "Première voix emblématique de Freezer dans la diffusion américaine originale de DBZ sur Cartoon Network (Toonami).",
    anecdote: ANECDOTES_MAP["linda-young"],
    image: PORTRAITS_MAP["linda-young"],
    wikiLink: "/wiki/staff#linda-young",
    roles: [
      {
        characterName: "Freezer",
        series: "DBZ (Original Funimation dub)",
        notes: "Voix rauque historique.",
      },
    ],
  },
  {
    id: "daman-mills",
    slug: "daman-mills",
    nameFr: "Daman Mills",
    tier: "voice_en",
    tierLabel: "Doublage Anglais (VA)",
    subRole: "Voix moderne de Freezer",
    period: "2017 — Présent",
    eras: ["dbs"],
    studio: "audio_dub",
    studioLabel: "Crunchyroll / Funimation",
    keyWorks: ["Freezer"],
    bioSummary:
      "Successeur officiel acclamé pour la voix américaine de Freezer dans Dragon Ball Super et le Tournoi du Pouvoir.",
    anecdote: ANECDOTES_MAP["daman-mills"],
    image: PORTRAITS_MAP["daman-mills"],
    wikiLink: "/wiki/staff#daman-mills",
    roles: [
      {
        characterName: "Freezer",
        series: "DBS, Broly, Super Hero",
        notes: "Voix officielle actuelle.",
      },
    ],
  },

  // --- Seiyū Japonais Complémentaires ---
  {
    id: "koichi-yamadera",
    slug: "koichi-yamadera",
    nameFr: "Kōichi Yamadera",
    nameJa: "山寺宏一",
    tier: "voice_ja",
    tierLabel: "Seiyū (VO Japon)",
    subRole: "Voix de Beerus & Tenshinhan (remplacement)",
    period: "2013 — Présent",
    eras: ["dbs"],
    studio: "audio_dub",
    studioLabel: "Across Entertainment (Japon)",
    keyWorks: ["Beerus"],
    bioSummary:
      "L'un des seiyū les plus talentueux et respectés du Japon, voix inimitable de Beerus le Dieu de la Destruction.",
    anecdote: ANECDOTES_MAP["koichi-yamadera"],
    image: PORTRAITS_MAP["koichi-yamadera"],
    wikiLink: "/wiki/staff#koichi-yamadera",
    roles: [
      {
        characterName: "Beerus",
        series: "Battle of Gods, DBS, Broly",
        notes: "Hakaishin de l'Univers 7.",
      },
    ],
  },

  // --- Animation & Chara Design de Légende ---
  {
    id: "katsuyoshi-nakatsuru",
    slug: "katsuyoshi-nakatsuru",
    nameFr: "Katsuyoshi Nakatsuru",
    nameJa: "中鶴勝祥",
    tier: "production",
    tierLabel: "Animation & Direction",
    subRole: "Directeur de l'animation & Chara-designer",
    period: "1986 — 2008",
    eras: ["db", "dbz", "gt"],
    studio: "toei",
    studioLabel: "Toei Animation",
    keyWorks: ["Bardock (design)", "Super Saiyan 4", "DBZ OAVs", "DBGT"],
    bioSummary:
      "L'un des plus illustres directeurs d'animation de l'histoire de Toei Animation. Admiré personnellement par Akira Toriyama pour sa capacité phénoménale à reproduire et enrichir son style graphique. On lui doit notamment la conception visuelle originelle de Bardock et de ses compagnons, ainsi que le design légendaire du Super Saiyan 4 dans Dragon Ball GT.",
    anecdote: ANECDOTES_MAP["katsuyoshi-nakatsuru"],
    wikiLink: "/wiki/staff#katsuyoshi-nakatsuru",
  },
];

export function buildUnifiedStaffCatalog(
  contributors: any[],
  voiceActors: any[],
): UnifiedStaffMember[] {
  const results: UnifiedStaffMember[] = [];
  const seenSlugs = new Set<string>();

  // 1. Contributors de la base (Éditorial, Animation, Direction, Musique)
  for (const c of contributors) {
    if (c.slug === "akira-toriyama") continue; // Mis en valeur dans le Hero Spotlight
    seenSlugs.add(c.slug);

    let tier: StaffTier = "production";
    let tierLabel = "Animation & Direction";
    let studio: StaffStudio = "toei";
    let studioLabel = "Toei Animation";
    let eras: StaffEra[] = ["dbz"];

    if (c.category === "editorial_staff" || c.category === "author" || c.category === "publisher") {
      tier = "editorial";
      tierLabel = "Éditorial & Droits";
      studio = c.slug === "akio-iyoku" ? "cct" : "shueisha";
      studioLabel =
        c.slug === "akio-iyoku" ? "Capsule Corp Tokyo / Shueisha" : "Weekly Shōnen Jump";
      eras = ["db", "dbz"];
    } else if (c.category === "scenario") {
      tier = "production";
      tierLabel = "Scénario & Écriture";
      studio = "toei";
      studioLabel = "Toei Animation";
      eras = ["dbz"];
    } else if (c.category === "music") {
      tier = "production";
      tierLabel = "Musique & OST";
      studio = "toei";
      studioLabel = "Production Musicale";
      eras = c.slug.includes("sumitomo") ? ["dbs"] : ["db", "dbz"];
    } else if (c.category === "voice") {
      // Les voix sont traitées dans le flux des comédiens
      continue;
    }

    if (c.slug === "daisuke-nishio") eras = ["db", "dbz"];
    if (c.slug === "naohiro-shintani") eras = ["dbs"];
    if (c.slug === "chikashi-kubota") eras = ["dbs"];
    if (c.slug === "akio-iyoku") eras = ["dbs", "daima"];

    results.push({
      id: c.slug,
      slug: c.slug,
      nameFr: c.name,
      nameJa: c.name_ja || undefined,
      nameRomaji: c.name_romaji || undefined,
      tier,
      tierLabel,
      subRole: c.biography_fr ? c.biography_fr.slice(0, 75) + "..." : "Membre de l'équipe",
      period: c.birth_date
        ? `${c.birth_date.slice(0, 4)} — ${c.death_date ? c.death_date.slice(0, 4) : "Présent"}`
        : "Ère Dragon Ball",
      eras,
      studio,
      studioLabel,
      keyWorks: [c.name],
      bioSummary: c.biography_fr || "",
      anecdote: ANECDOTES_MAP[c.slug],
      image: PORTRAITS_MAP[c.slug] || (c.image ? assetUrl(c.image) : null),
      wikiLink: `/wiki/contributors/${c.slug}`,
    });
  }

  // 2. Comédiens de doublage enregistrés en base (VO, VF, VA, LatAm...)
  for (const va of voiceActors) {
    seenSlugs.add(va.slug);

    let tier: StaffTier = "voice_intl";
    let tierLabel = "Doublage International";
    let studioLabel = "Plateau de Doublage";

    if (va.nationality === "ja") {
      tier = "voice_ja";
      tierLabel = "Seiyū (VO Japon)";
      studioLabel = "Studio Audio Japon (Aoni, etc.)";
    } else if (va.nationality === "fr") {
      tier = "voice_fr";
      tierLabel = "Doublage Français (VF)";
      studioLabel = "Doublage Français (AB Productions, etc.)";
    } else if (va.nationality === "en") {
      tier = "voice_en";
      tierLabel = "Doublage Anglais (VA)";
      studioLabel = "Funimation / Crunchyroll (USA)";
    } else if (va.nationality === "latam") {
      tier = "voice_intl";
      tierLabel = "Doublage Latino (LatAm)";
      studioLabel = "Doublage Mexicain & Sud-Américain";
    } else if (va.nationality === "es") {
      tier = "voice_intl";
      tierLabel = "Doublage Espagne (Castillan)";
      studioLabel = "Doublage Espagnol";
    } else if (va.nationality === "it") {
      tier = "voice_intl";
      tierLabel = "Doublage Italien (Italie)";
      studioLabel = "Mediaset / Merak Film (Milan)";
    }

    let parsedRoles: any[] = [];
    try {
      parsedRoles = typeof va.roles === "string" ? JSON.parse(va.roles) : va.roles || [];
    } catch {
      parsedRoles = [];
    }

    const keyWorks = parsedRoles.map((r: any) => r.characterName);
    const eras: StaffEra[] = ["dbz"];
    const rolesText = JSON.stringify(parsedRoles).toLowerCase();
    if (rolesText.includes("daima")) eras.push("daima");
    if (rolesText.includes("dbs") || rolesText.includes("super")) eras.push("dbs");
    if (rolesText.includes("gt")) eras.push("gt");
    if (rolesText.includes("db,") || rolesText.includes("dragon ball,")) eras.push("db");

    results.push({
      id: va.slug,
      slug: va.slug,
      nameFr: va.name,
      nameJa: va.name_ja || undefined,
      tier,
      tierLabel,
      subRole:
        parsedRoles.length > 0 ? `Voix de ${parsedRoles[0].characterName}` : "Comédien de doublage",
      period: va.birth_date ? `${va.birth_date.slice(0, 4)} — Présent` : "Ère Dragon Ball",
      eras,
      studio: "audio_dub",
      studioLabel,
      keyWorks,
      bioSummary: [
        ...new Set(
          [va.biography, va.article]
            .filter((text): text is string => typeof text === "string" && text.trim().length > 0)
            .map((text) => text.trim()),
        ),
      ].join("\n\n"),
      anecdote: ANECDOTES_MAP[va.slug],
      image: PORTRAITS_MAP[va.slug] || (va.image ? assetUrl(va.image) : null),
      wikiLink: `/wiki/contributors/${va.slug}`,
      roles: parsedRoles,
    });
  }

  // 3. Intégration du catalogue étendu (VF complémentaires, Dorothée, VA majeurs)
  for (const extra of EXTENDED_STAFF) {
    if (!seenSlugs.has(extra.slug)) {
      results.push(extra);
      seenSlugs.add(extra.slug);
    }
  }

  return results;
}
