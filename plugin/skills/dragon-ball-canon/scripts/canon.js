// @bun
// Généré par scripts/plugin/build-references.ts — ne pas éditer.
// Sources : apps/site/src/lib/canon-engine.ts, scripts/plugin/src/canon.ts
// Révision : b8cef86 (2026-10-05)
// apps/site/src/lib/canon-engine.ts
var CANON_TIERS = [
  "CANON_ABSOLU",
  "CANON_SUPERVISE",
  "EXTENSION_OFFICIELLE",
  "NON_CANON_DERIVE",
  "APOCRYPHE_FANON"
];
var DEFAULT_CANON_TIERS = [
  {
    id: "CANON_ABSOLU",
    label: "Canon Absolu (Tier 1 \u2014 Manga & Toriyama pur)",
    court: "Canon absolu",
    couleur: "#22c55e",
    score: 100,
    definition: "\xC9crit, dessin\xE9 ou explicitement r\xE9v\xE9l\xE9 par Akira Toriyama lui-m\xEAme. Le manga original des 42 tomes prime sur tout le reste : quand une autre source le contredit, c'est l'autre source qui a tort.",
    inclut: [
      "Manga Dragon Ball, tomes 1 \xE0 42 (chapitres 1 \xE0 519)",
      "Jaco the Galactic Patrolman et Dragon Ball Minus",
      "Chapitres et histoires courtes sign\xE9s Toriyama (Neko Majin, bonus Jump)",
      "R\xE9ponses de Toriyama en interview ou Q&A sign\xE9e (SEG, V-Jump, Saiky\u014D Jump)"
    ]
  },
  {
    id: "CANON_SUPERVISE",
    label: "Canon Supervis\xE9 (Tier 2 \u2014 DBS, Films r\xE9cents & Daima)",
    court: "Canon supervis\xE9",
    couleur: "#3b82f6",
    score: 88,
    definition: "\u0152uvres de la continuit\xE9 officielle dont Toriyama a fourni la trame, le sc\xE9nario ou les designs, mais qu'il n'a pas dessin\xE9es lui-m\xEAme. Elles font autorit\xE9 tant qu'elles ne contredisent pas le manga original.",
    inclut: [
      "Manga Dragon Ball Super (Toyotaro, storyboards annot\xE9s par Toriyama)",
      "Films Battle of Gods, La R\xE9surrection de F, Broly, Super Hero",
      "Dragon Ball Daima (concept, histoire et designs de Toriyama)",
      "OAV et histoires originales \xE9crites par Toriyama (Jump Super Anime Tour 2008)"
    ]
  },
  {
    id: "EXTENSION_OFFICIELLE",
    label: "Extension Officielle (Tier 3 \u2014 Daizenshuu & SEG)",
    court: "Extension officielle",
    couleur: "#eab308",
    score: 70,
    definition: "Documentation \xE9dit\xE9e par Shueisha et supervis\xE9e par Bird Studio. Elle d\xE9crit l'\u0153uvre et compl\xE8te ses marges (chiffres, chronologies, fiches), mais elle ne cr\xE9e pas d'histoire et c\xE8de devant le manga.",
    inclut: [
      "Daizenshuu 1 \xE0 7 et guides Ch\u014Dzensh\u016B",
      "Super Exciting Guide (2009)",
      "Guides officiels de s\xE9rie, artbooks et Landmark/Forever",
      "Fiches de personnages et chronologies \xE9ditoriales"
    ]
  },
  {
    id: "NON_CANON_DERIVE",
    label: "Non-Canon D\xE9riv\xE9 (Tier 4 \u2014 Fillers, Films Toei & GT)",
    court: "Non-canon d\xE9riv\xE9",
    couleur: "#f97316",
    score: 20,
    definition: "Produit officiellement sous licence, mais \xE9crit hors de la plume de Toriyama : l'animation Toei et ses films se contredisent avec le manga et se d\xE9roulent, selon l'auteur lui-m\xEAme, dans une dimension parall\xE8le.",
    inclut: [
      "\xC9pisodes hors-trame (fillers) de Dragon Ball, DBZ, Kai et DBS",
      "Films Toei de 1986 \xE0 1995 et t\xE9l\xE9films sp\xE9ciaux",
      "Dragon Ball GT (\xAB grand side-story \xBB selon Toriyama)",
      "Jeux vid\xE9o, Super Dragon Ball Heroes, Xenoverse et leurs personnages"
    ]
  },
  {
    id: "APOCRYPHE_FANON",
    label: "Apocryphe / Fanon (Tier 5 \u2014 Rumeurs & Inventions)",
    court: "Apocryphe",
    couleur: "#ef4444",
    score: 0,
    definition: "Aucune existence officielle : invention de fans, fausse interview, image d\xE9tourn\xE9e, doujinshi. \xC0 citer uniquement pour dire d'o\xF9 vient la rumeur et pourquoi elle est fausse.",
    inclut: [
      "Dragon Ball AF, Super Saiyan 5, Xicor",
      "Fausses interviews et citations attribu\xE9es \xE0 Toriyama",
      "Doujinshi et suites amateurs",
      "Niveaux de puissance invent\xE9s et \xAB scans \xBB retouch\xE9s"
    ]
  }
];
var CANON_DATABASE = [
  {
    id: "broly",
    title: "Broly (Dragon Ball Super, 2018)",
    category: "character",
    tier: "CANON_SUPERVISE",
    score: 85,
    keywords: [
      "broly",
      "broli",
      "broly dbs",
      "broly 2018",
      "broly super",
      "dbs broly",
      "\u30D6\u30ED\u30EA\u30FC",
      "paragus",
      "super saiyan legendaire",
      "berserk"
    ],
    verdict: "Canonique dans sa r\xE9invention DBS (2018), Non-canonique dans les films Z (1993-1994).",
    explanation: "La version originale de 1993 (sc\xE9naris\xE9e par Takao Koyama) est hors de la trame canonique bien que Toriyama en ait sign\xE9 le design initial. En 2018, Akira Toriyama a personnellement r\xE9\xE9crit et int\xE9gr\xE9 Broly dans la continuit\xE9 officielle avec le film Dragon Ball Super: Broly.",
    toriyamaQuote: {
      text: "Broly est un personnage incroyablement populaire. Tout en pr\xE9servant son image de base pour ne pas d\xE9cevoir les fans, j'ai apport\xE9 une nouvelle facette \xE0 son histoire pour en faire une aventure encore plus fascinante.",
      source: "Commentaire officiel de production de Dragon Ball Super: Broly",
      year: 2018
    },
    sources: ["Film Dragon Ball Super: Broly (2018)", "Daizenshuu 6 (Films Z)", "Manga DBS"]
  },
  {
    id: "broly-dbz-1993",
    title: "Broly (Version DBZ 1993 / Films Z de Takao Koyama)",
    category: "character",
    tier: "NON_CANON_DERIVE",
    score: 20,
    keywords: [
      "broly 1993",
      "broly dbz 1993",
      "broly dbz",
      "broly z",
      "broly film 1993",
      "broly le super saiyan legendaire 1993",
      "dbz 1993",
      "bio-broly",
      "bio broly",
      "broly second coming",
      "broly kakarotto pleure"
    ],
    verdict: "Non-canonique. Antagoniste exclusif des films Toei Z (1993-1994) sc\xE9naris\xE9s par Takao Koyama.",
    explanation: "L'incarnation originale de Broly dans les films 8, 10 et 11 de Dragon Ball Z est hors de la continuit\xE9 canonique du manga, bien que son design graphique initial ait \xE9t\xE9 dessin\xE9 par Akira Toriyama. Son traumatisme li\xE9 aux pleurs de Goku et sa folie destructrice appartiennent \xE0 la chronologie parall\xE8le de Toei Animation. Seul le Broly red\xE9fini et r\xE9\xE9crit par Akira Toriyama dans Dragon Ball Super: Broly (2018) est canonique.",
    toriyamaQuote: {
      text: "J'avais compl\xE8tement oubli\xE9 l'histoire des anciens films de Broly. En 2018, j'ai repris le personnage \xE0 z\xE9ro en conservant son apparence essentielle mais en r\xE9\xE9crivant son histoire pour l'int\xE9grer \xE0 la s\xE9rie officielle.",
      source: "Paraphrase, pas une citation litt\xE9rale \u2014 Commentaire de production Dragon Ball Super: Broly",
      year: 2018
    },
    sources: [
      "Daizenshuu 6 : Movies & TV Specials",
      "Films DBZ 8, 10, 11 (Toei Animation)",
      "Film DBS Broly (2018)"
    ]
  },
  {
    id: "gogeta",
    title: "Gogeta",
    category: "character",
    tier: "CANON_SUPERVISE",
    score: 85,
    keywords: ["gogeta", "fusion metamol", "stardust breaker", "soul punisher", "janemba"],
    verdict: "Canonis\xE9 dans Dragon Ball Super: Broly (2018). Ses apparitions dans Fusions (1995) et DBGT sont non-canoniques.",
    explanation: "La fusion M\xE9tamol entre Goku et Vegeta a \xE9t\xE9 invent\xE9e par Toriyama dans le manga, mais Gogeta n'apparaissait originellement que dans le film Toei de 1995 et dans GT. Toriyama l'a officiellement r\xE9introduit et valid\xE9 dans la trame principale lors du combat contre Broly en 2018.",
    sources: ["Film Dragon Ball Super: Broly (2018)", "Manga DB Tome 41 (principe de la danse)"]
  },
  {
    id: "vegetto",
    title: "Vegetto (Vegito)",
    category: "character",
    tier: "CANON_ABSOLU",
    score: 100,
    keywords: [
      "vegetto",
      "vegito",
      "potara",
      "potaras",
      "potalas",
      "potala",
      "fusion potara",
      "fusion potala"
    ],
    verdict: "100% Canon absolu. Cr\xE9\xE9, nomm\xE9 et dessin\xE9 par Akira Toriyama dans le manga original.",
    explanation: "N\xE9 des boucles d'oreilles Potaras donn\xE9es par le Vieux Ka\xEFoshin. Toriyama a imagin\xE9 la fusion Potara pour surprendre ses lecteurs apr\xE8s que le staff de l'anime lui a r\xE9v\xE9l\xE9 pr\xE9parer la fusion M\xE9tamol pour le film de Gogeta.",
    sources: ["Manga Dragon Ball Tome 42 (Chapitres 503-506)", "Daizenshuu 2"]
  },
  {
    id: "bardock",
    title: "Bardock",
    category: "character",
    tier: "CANON_ABSOLU",
    score: 95,
    keywords: [
      "bardock",
      "barduk",
      "dragon ball minus",
      "pere de goku",
      "tatta hitori no saish\u016B kessen"
    ],
    verdict: "Canon absolu. Valid\xE9 dans le manga par Toriyama, d\xE9velopp\xE9 dans Dragon Ball Minus et DBS Broly.",
    explanation: "Bien qu'initialement con\xE7u par Toei Animation pour le t\xE9l\xE9film de 1990, Toriyama a tellement ador\xE9 le personnage qu'il l'a canonis\xE9 en dessinant son visage dans deux cases du manga original (Chapitre 307). Il a ensuite r\xE9\xE9crit son d\xE9part dans Dragon Ball Minus (2014) aux c\xF4t\xE9s de sa compagne Gine.",
    toriyamaQuote: {
      text: "Ce t\xE9l\xE9film m'a tellement \xE9mu que j'ai voulu int\xE9grer Bardock dans mon manga. C'est l'un des rares cas o\xF9 l'anime m'a directement inspir\xE9.",
      source: "Daizenshuu 6 : Movies & TV Specials",
      year: 1995
    },
    sources: [
      "Manga DB Tome 26 (Chapitre 307)",
      "Jaco the Galactic Patrolman (DB Minus)",
      "DBS Broly"
    ]
  },
  {
    id: "bardock-tv-special-1990",
    title: "T\xE9l\xE9film Bardock (Le P\xE8re de Son Goku, 1990) vs Dragon Ball Minus",
    category: "work",
    tier: "NON_CANON_DERIVE",
    score: 30,
    keywords: [
      "bardock tv special",
      "bardock telefilm",
      "bardock 1990",
      "tatta hitori no saishu kessen",
      "bardock vs minus",
      "bardock tv special vs minus",
      "premonition de bardock",
      "don de prescience bardock",
      "bandana ensanglante bardock"
    ],
    verdict: "Non-canonique dans son d\xE9roulement narratif. Remplac\xE9 dans la trame officielle par Dragon Ball Minus et DBS Broly.",
    explanation: "Le t\xE9l\xE9film de 1990 'Le P\xE8re de Son Goku' (sc\xE9naris\xE9 par Katsuyuki Sumisawa chez Toei) a tellement plu \xE0 Toriyama qu'il a int\xE9gr\xE9 le visage de Bardock dans deux cases du manga (Chapitre 307). Cependant, les \xE9v\xE9nements du t\xE9l\xE9film (le don de voir l'avenir transmis par un Kanassan, l'escouade de Toma massacr\xE9e sur Meat, le bandana ensanglant\xE9, et Goku b\xE9b\xE9 nu envoy\xE9 sur Terre) ont \xE9t\xE9 officiellement remplac\xE9s par Akira Toriyama dans Dragon Ball Minus (2014) et le film DBS Broly : Bardock y a une intuition lucide, sa compagne Gine existe, et Goku part plus \xE2g\xE9 v\xEAtu d'une armure saiyanne.",
    sources: [
      "Manga Dragon Ball Tome 26 (Chapitre 307)",
      "Dragon Ball Minus (2014)",
      "Film DBS Broly (2018)",
      "Daizenshuu 6"
    ]
  },
  {
    id: "goku-saiyan-kakarotto",
    title: "Son Goku : Origine Saiyan (Kakarotto)",
    category: "character",
    tier: "CANON_ABSOLU",
    score: 100,
    keywords: [
      "goku est-il un saiyan",
      "goku saiyan",
      "goku est un saiyan",
      "kakarotto",
      "kakarot",
      "origine saiyan goku",
      "nature saiyanne de goku",
      "vrai nom de goku",
      "nom saiyan de goku",
      "goku extraterrestre",
      "\u30AB\u30AB\u30ED\u30C3\u30C8"
    ],
    verdict: "100% Canon absolu. R\xE9v\xE9l\xE9 par Raditz dans le manga original (Chapitre 195).",
    explanation: "Son Goku est un Saiyan de basse classe n\xE9 sur la plan\xE8te Vegeta sous le nom de Kakarotto (Kakarot). Envoy\xE9 sur Terre dans une capsule spatiale pour survivre aux soup\xE7ons pesant sur Freezer (Dragon Ball Minus / Jaco / DBS Broly), il a \xE9t\xE9 recueilli par Grand-P\xE8re Son Gohan. Sa v\xE9ritable nature extraterrestre et son nom de naissance saiyan sont r\xE9v\xE9l\xE9s d\xE8s l'arriv\xE9e de son fr\xE8re Raditz au chapitre 195 du manga.",
    toriyamaQuote: {
      text: "Goku est un Saiyan envoy\xE9 depuis la plan\xE8te Vegeta. J'ai pens\xE9 que r\xE9v\xE9ler ses origines extraterrestres donnerait un nouvel \xE9lan spectaculaire \xE0 l'histoire.",
      source: "Paraphrase, pas une citation litt\xE9rale \u2014 Daizenshuu 2 : Story Guide",
      year: 1995
    },
    sources: [
      "Manga Dragon Ball Tome 17 (Chapitre 195)",
      "Dragon Ball Minus",
      "Film DBS Broly (2018)"
    ]
  },
  {
    id: "destruction-planete-vegeta",
    title: "Destruction de la plan\xE8te Vegeta par Freezer",
    category: "lore",
    tier: "CANON_ABSOLU",
    score: 100,
    keywords: [
      "destruction planete vegeta",
      "freezer a detruit la planete vegeta",
      "freezer detruit vegeta",
      "destruction de vegeta",
      "planete vegeta freezer",
      "pourquoi freezer a detruit la planete vegeta",
      "genocide saiyan freezer"
    ],
    verdict: "100% Canon absolu. \xC9tabli dans le manga original (Chapitre 257) et illustr\xE9 dans Dragon Ball Minus et DBS Broly.",
    explanation: "Freezer a an\xE9anti la plan\xE8te Vegeta et la quasi-totalit\xE9 du peuple Saiyan avec une gigantesque Supernova par crainte de la l\xE9gende du Super Saiyan et du Super Saiyan God. Bien que Freezer ait pr\xE9tendu aux survivants (Vegeta, Nappa, Raditz) qu'un m\xE9t\xE9ore g\xE9ant avait d\xE9truit leur monde, la v\xE9rit\xE9 est r\xE9v\xE9l\xE9e par Dodoria \xE0 Vegeta au chapitre 257 du manga. Dragon Ball Super a pr\xE9cis\xE9 que Beerus avait pr\xE9alablement donn\xE9 son accord ou sugg\xE9r\xE9 cette destruction.",
    sources: [
      "Manga Dragon Ball Tome 22 (Chapitre 257)",
      "Dragon Ball Minus",
      "Film DBS Broly (2018)",
      "Manga DBS Chapitre 69"
    ]
  },
  {
    id: "jaco-minus",
    title: "Dragon Ball Minus & Jaco the Galactic Patrolman",
    category: "work",
    tier: "CANON_ABSOLU",
    score: 100,
    keywords: [
      "jaco",
      "dragon ball minus",
      "jaco le patrouilleur galactique",
      "depart goku minus",
      "origine goku capsule",
      "tights",
      "omori"
    ],
    verdict: "100% Canon absolu. \xC9crit et dessin\xE9 int\xE9gralement par Akira Toriyama en 2013-2014.",
    explanation: "Pr\xE9ambule officiel \xE0 Dragon Ball, publi\xE9 par Toriyama dans le Weekly Shonen Jump. Il \xE9tablit la rencontre entre Jaco, Bulma enfant et sa s\u0153ur a\xEEn\xE9e Tights, ainsi que les circonstances exactes du d\xE9part de Son Goku enfant de la plan\xE8te Vegeta, envoy\xE9 par Bardock et Gine pour le prot\xE9ger des soup\xE7ons pesant sur Freezer.",
    sources: [
      "Jaco the Galactic Patrolman (manga d'Akira Toriyama, 2013-2014)",
      "Dragon Ball Minus (Jump Comics)",
      "Film DBS Broly (2018)"
    ]
  },
  {
    id: "gine",
    title: "Gine (M\xE8re de Son Goku)",
    category: "character",
    tier: "CANON_ABSOLU",
    score: 100,
    keywords: ["gine", "mere de goku", "femme de bardock", "compagne de bardock", "mere kakarotto"],
    verdict: "100% Canon absolu. Cr\xE9\xE9e et dessin\xE9e par Akira Toriyama dans Dragon Ball Minus (2014).",
    explanation: "Toriyama a r\xE9v\xE9l\xE9 pour la premi\xE8re fois l'existence de la m\xE8re de Son Goku dans le Saiky\u014D Jump de mars 2014 avant de la mettre en sc\xE8ne dans Dragon Ball Minus. Contrairement aux guerriers saiyans belliqueux, Gine avait un temp\xE9rament doux et travaillait au centre de distribution de viande sur la plan\xE8te Vegeta.",
    toriyamaQuote: {
      text: "Son nom est Gine. Elle a autrefois combattu dans l'escouade de Bardock, mais sa nature douce la rendait inadapt\xE9e au combat. Ils ont d\xE9velopp\xE9 un lien affectif rare chez les Saiyans, o\xF9 les unions ne servent d'ordinaire qu'\xE0 la reproduction.",
      source: "Saiky\u014D Jump Mars 2014 (Entretien Akira Toriyama)",
      year: 2014
    },
    sources: [
      "Saiky\u014D Jump Mars 2014",
      "Dragon Ball Minus (2014)",
      "Film Dragon Ball Super: Broly (2018)"
    ]
  },
  {
    id: "c16-fils-gero",
    title: "C-16 et Geb\u014D (Le fils du Dr Gero)",
    category: "lore",
    tier: "CANON_ABSOLU",
    score: 95,
    keywords: [
      "c16",
      "c-16",
      "fils de gero",
      "fils du docteur gero",
      "gebo",
      "gevo",
      "pourquoi c16 est gentil"
    ],
    verdict: "Canon absolu. Histoire intime de C-16 d\xE9voil\xE9e par Akira Toriyama en 2014.",
    explanation: "Dans l'\xE9mission Mand\u014D Kobayashi (2014), Akira Toriyama a r\xE9v\xE9l\xE9 que le Dr Gero avait con\xE7u le robot C-16 \xE0 l'image exacte de son fils d\xE9funt, un soldat de haut rang de l'Arm\xE9e du Ruban Rouge tomb\xE9 sous une balle ennemie. Pris d'une affection paternelle protectrice, Gero l'a dot\xE9 d'une puissance colossale mais d'une programmation pacifique pour \xE9viter qu'il ne soit \xE0 nouveau d\xE9truit au combat.",
    toriyamaQuote: {
      text: "Le mod\xE8le de C-16 \xE9tait le propre fils du Dr Gero, mort jeune comme soldat du Ruban Rouge. C'est pourquoi Gero lui a donn\xE9 une personnalit\xE9 douce et refusait de le voir combativement engag\xE9.",
      source: "Mand\u014D Kobayashi (Fuji TV ONE) \u2014 Entretien Akira Toriyama",
      year: 2014
    },
    sources: [
      "Mand\u014D Kobayashi Mars 2014",
      "Dragon Ball Super: Super Hero (arbre g\xE9n\xE9alogique Red Ribbon)"
    ]
  },
  {
    id: "c17-lapis-c18-lazuli",
    title: "Noms civils de C-17 (Lapis) et C-18 (Lazuli)",
    category: "lore",
    tier: "CANON_ABSOLU",
    score: 100,
    keywords: ["lapis", "lazuli", "vrai nom c17", "vrai nom c18", "humains artificiels"],
    verdict: "Canon absolu. R\xE9v\xE9l\xE9 directement par Akira Toriyama.",
    explanation: "Dans une session de questions/r\xE9ponses du Super Exciting Guide puis du V-Jump (2014), Toriyama a d\xE9voil\xE9 que C-17 et C-18 \xE9taient des jumeaux humains nomm\xE9s Lapis et Lazuli avant d'\xEAtre kidnapp\xE9s et modifi\xE9s par le Dr Gero.",
    sources: ["Super Exciting Guide", "V-Jump Mai 2014 (Toriyama Q&A)"]
  },
  {
    id: "mr-satan-mark",
    title: "V\xE9ritable nom de Mr. Satan (Mark)",
    category: "lore",
    tier: "CANON_ABSOLU",
    score: 100,
    keywords: ["mark", "vrai nom satan", "mr satan", "nom de famille hercule"],
    verdict: "Canon absolu. R\xE9v\xE9l\xE9 par Akira Toriyama dans le Super Exciting Guide (2009).",
    explanation: "Mr. Satan est son pseudonyme de ring de combat. Son v\xE9ritable pr\xE9nom est Mark (anagramme de Akuma, diable en japonais). Dans son secteur culturel, il n'existe pas de noms de famille.",
    sources: [
      "Super Exciting Guide : Character Volume (2009)",
      "docs/reference/toriyama-databook-seg.md"
    ]
  },
  {
    id: "db-gt",
    title: "Dragon Ball GT (SSJ4, Baby, Dragons)",
    category: "work",
    tier: "NON_CANON_DERIVE",
    score: 15,
    keywords: ["gt", "dragon ball gt", "baby", "omega shenron", "li shenron"],
    verdict: "Non-canonique \xE0 la continuit\xE9 Toriyama. Qualifi\xE9 de 'Grand Side-Story' par l'auteur.",
    explanation: "Produit par Toei Animation sans implication narrative d'Akira Toriyama. L'auteur a uniquement fourni le titre 'GT' (Grand Touring), le logo, le design initial du trio Goku/Trunks/Pan et quelques planches pr\xE9liminaires.",
    toriyamaQuote: {
      text: "Pour GT, la seule chose que j'ai faite a \xE9t\xE9 de trouver le titre, de dessiner le design initial des personnages principaux et de quelques machines. \xC9tant lib\xE9r\xE9 des contraintes d'une s\xE9rialisation, j'ai pu appr\xE9cier Dragon Ball GT en simple spectateur, comme une merveilleuse histoire parall\xE8le (grand side-story).",
      source: "Dragon Ball GT DVD Box 'Dragon Box GT' (Introduction de Toriyama)",
      year: 2005
    },
    sources: ["Dragon Box GT"]
  },
  {
    id: "super-saiyan-4",
    title: "Super Saiyan 4 (SSJ4)",
    category: "form",
    tier: "NON_CANON_DERIVE",
    score: 15,
    keywords: [
      "super saiyan 4",
      "ssj4",
      "transformation ssj4",
      "oozaru dore",
      "katsuyoshi nakatsuru ssj4",
      "goku ssj4",
      "vegeta ssj4",
      "gogeta ssj4"
    ],
    verdict: "Non-canonique. Con\xE7u par Katsuyoshi Nakatsuru pour Dragon Ball GT.",
    explanation: "Le design embl\xE9matique du Super Saiyan 4 (fourrure rouge, queue de singe et cheveux noirs) a \xE9t\xE9 cr\xE9\xE9 par l'animateur en chef Katsuyoshi Nakatsuru chez Toei Animation pour Dragon Ball GT. Akira Toriyama a grandement appr\xE9ci\xE9 ce design et en a dessin\xE9 sa propre version hommage pour la Dragon Box GT en 2005, mais a confirm\xE9 qu'il s'agissait d'une cr\xE9ation de l'anime appartenant \xE0 une histoire parall\xE8le (grand side-story).",
    toriyamaQuote: {
      text: "Le design du Super Saiyan 4 a \xE9t\xE9 cr\xE9\xE9 par Nakatsuru-kun de Toei Animation. J'ai \xE9t\xE9 tr\xE8s impressionn\xE9 par son id\xE9e de combiner l'Oozaru et le Super Saiyan, et je me suis amus\xE9 \xE0 le redessiner moi-m\xEAme pour ce coffret.",
      source: "Dragon Book (Dragon Box GT)",
      year: 2005
    },
    sources: [
      "Dragon Box GT (2005)",
      "Dragon Ball GT Perfect Files",
      "Entretiens Akira Toriyama & Katsuyoshi Nakatsuru"
    ]
  },
  {
    id: "ssj4-vs-ssjg",
    title: "Super Saiyan 4 vs Super Saiyan God / Blue (Canonicit\xE9 & D\xE9bat)",
    category: "form",
    tier: "NON_CANON_DERIVE",
    score: 25,
    keywords: [
      "ssj4 vs ssjg",
      "ssj4 vs ssg",
      "ssj4 vs ssgss",
      "ssj4 vs ssj blue",
      "super saiyan 4 vs super saiyan god",
      "ssj4 vs god",
      "ssj4 ou god",
      "ssj god vs ssj4"
    ],
    verdict: "Le Super Saiyan God est Canon Supervis\xE9 (Toriyama, 2013) ; le Super Saiyan 4 est Non-Canon D\xE9riv\xE9 (GT / Nakatsuru, 1996).",
    explanation: "Sur le plan de la canonicit\xE9, il n'y a pas d'ambigu\xEFt\xE9 : le Super Saiyan God et le Super Saiyan Blue sont n\xE9s de la plume d'Akira Toriyama pour Battle of Gods et La R\xE9surrection de F, int\xE9gr\xE9s dans la continuit\xE9 officielle de Dragon Ball Super. Le Super Saiyan 4 a \xE9t\xE9 con\xE7u par Katsuyoshi Nakatsuru pour Dragon Ball GT, une s\xE9rie que Toriyama qualifie de 'grand side-story' hors continuit\xE9. Toute comparaison de puissance entre les deux rel\xE8ve du crossover de jeux vid\xE9o (SDBH/Heroes) et non de la chronologie canonique.",
    sources: [
      "Film Battle of Gods (2013)",
      "Dragon Box GT (2005)",
      "Manga DBS",
      "Super Dragon Ball Heroes"
    ]
  },
  {
    id: "cooler",
    title: "Cooler & Metal Cooler",
    category: "character",
    tier: "NON_CANON_DERIVE",
    score: 20,
    keywords: [
      "cooler",
      "kula",
      "metal cooler",
      "forme finale cooler",
      "sauzer",
      "neiz",
      "dore",
      "escadron cooler",
      "film cooler"
    ],
    verdict: "Non-canonique. Con\xE7u pour les films 5 et 6 par Toei Animation et Takao Koyama.",
    explanation: "Bien qu'Akira Toriyama ait dessin\xE9 l'apparence de Cooler et sa transformation finale \xE0 la demande de Toei Animation, le fr\xE8re a\xEEn\xE9 de Freezer n'appara\xEEt dans aucun chapitre du manga original ni dans Dragon Ball Super. Les films 'La Revanche de Cooler' et 'Cent Mille Guerriers de M\xE9tal' se d\xE9roulent dans une chronologie incompatible avec les \xE9v\xE9nements de Namek et de la Terre.",
    toriyamaQuote: {
      text: "J'envisage les films de cin\xE9ma comme des histoires situ\xE9es dans une dimension parall\xE8le \xE0 celle de mon manga original.",
      source: "Daizenshuu 6 : Movies & TV Specials",
      year: 1995
    },
    sources: [
      "Daizenshuu 6 : Movies & TV Specials",
      "Manga Dragon Ball (Tomes 27-28)",
      "Jump Comics Film Animation Comics"
    ]
  },
  {
    id: "janemba",
    title: "Janemba",
    category: "character",
    tier: "NON_CANON_DERIVE",
    score: 20,
    keywords: [
      "janemba",
      "super janemba",
      "saike demon",
      "monde des morts janemba",
      "epee janemba",
      "film fusions"
    ],
    verdict: "Non-canonique. Antagoniste exclusif du film 12 Fusions (1995).",
    explanation: "N\xE9 de l'explosion de la machine purificatrice d'\xE2mes aux Enfers, Janemba a \xE9t\xE9 imagin\xE9 par le sc\xE9nariste Takao Koyama pour servir d'adversaire \xE0 la premi\xE8re apparition de la fusion M\xE9tamol Gogeta au cin\xE9ma. Akira Toriyama en a r\xE9alis\xE9 le design sur demande du studio, mais Janemba n'appartient \xE0 aucune continuit\xE9 canonique.",
    sources: ["Daizenshuu 6 : Movies & TV Specials", "Film Dragon Ball Z : Fusions (1995)"]
  },
  {
    id: "tapion-epee-trunks",
    title: "Tapion, Hildegarn et l'\xC9p\xE9e de Trunks",
    category: "character",
    tier: "NON_CANON_DERIVE",
    score: 20,
    keywords: [
      "tapion",
      "hildegarn",
      "epee de trunks",
      "minotia",
      "ocarina tapion",
      "attaque du dragon",
      "konatsien"
    ],
    verdict: "Non-canonique. Tapion, Hildegarn et l'\xE9p\xE9e que Tapion confie \xE0 Trunks viennent du seul film Toei L'Attaque du Dragon (1995).",
    explanation: "Le film 13 'L'Attaque du Dragon' (1995) met en sc\xE8ne Tapion offrant son \xE9p\xE9e au jeune Trunks du pr\xE9sent. Cependant, dans le manga original et le chapitre sp\xE9cial 'Trunks the Story', Trunks du futur combat les cyborgs dans une trame apocalyptique o\xF9 Tapion et Hildegarn n'ont jamais exist\xE9.",
    sources: [
      "Manga Dragon Ball Tome 33 (Trunks the Story)",
      "Daizenshuu 6",
      "Film L'Attaque du Dragon (1995)"
    ]
  },
  {
    id: "bojack-zangya",
    title: "Bojack et les Mercenaires de l'Espace",
    category: "character",
    tier: "NON_CANON_DERIVE",
    score: 20,
    keywords: [
      "bojack",
      "boujack",
      "zangya",
      "bido",
      "bujin",
      "goku ssj2 bojack",
      "les mercenaires de l'espace"
    ],
    verdict: "Non-canonique. Con\xE7u par Toei Animation pour le film 9 (1993).",
    explanation: "Sc\xE9naris\xE9 par Takao Koyama pour s'ins\xE9rer juste apr\xE8s la mort de Son Goku lors des Cell Games. Toriyama a r\xE9alis\xE9 les dessins pr\xE9paratoires de Bojack et de ses acolytes \xE0 la demande du studio, mais les \xE9v\xE9nements du tournoi d'arts martiaux de la famille Dollar ne font pas partie de la trame du manga original.",
    sources: [
      "Daizenshuu 6 : Movies & TV Specials",
      "Film Dragon Ball Z : Les Mercenaires de l'Espace (1993)"
    ]
  },
  {
    id: "thales-arbre-sacre",
    title: "Thal\xE8s (Turles) & l'Arbre Sacr\xE9",
    category: "character",
    tier: "NON_CANON_DERIVE",
    score: 20,
    keywords: [
      "thales",
      "turles",
      "arbre sacre",
      "shinseiju",
      "fruit arbre sacre",
      "sosie de goku",
      "film thales"
    ],
    verdict: "Non-canonique. Film Toei Animation de 1990 explorant un Son Goku mal\xE9fique alternatif.",
    explanation: "Imagin\xE9 par Takao Koyama et Toei Animation pour explorer ce que serait devenu Son Goku s'il n'avait pas perdu la m\xE9moire en tombant sur la t\xEAte. Toriyama a dessin\xE9 le charadesign de Thal\xE8s, mais le film est chronologiquement incompatible avec la saga Namek (Son Goku vivant sur Terre avec Kaio-ken alors que Yamcha, Chaozu et Tenshinhan sont encore en vie).",
    sources: [
      "Daizenshuu 6 : Movies & TV Specials",
      "Film Dragon Ball Z : Le Combat Fratricide (1990)"
    ]
  },
  {
    id: "films-toei-vintage",
    title: "Films DBZ vintage (Cycles Toei 1986-1995)",
    category: "work",
    tier: "NON_CANON_DERIVE",
    score: 20,
    keywords: [
      "films toei",
      "films dbz",
      "films vintage",
      "oav dbz",
      "slug",
      "c-13",
      "film z",
      "dimensions paralleles"
    ],
    verdict: "Non-canoniques. Univers parall\xE8les con\xE7us par Toei Animation et Takao Koyama.",
    explanation: "Ces films ne peuvent pas s'ins\xE9rer logiquement dans la chronologie du manga original (personnages morts encore vivants, Son Goku pr\xE9sent sur Terre pendant Namek, etc.). Toriyama a seulement r\xE9alis\xE9 certains charadesigns \xE0 la demande du studio.",
    toriyamaQuote: {
      text: "J'envisage les films de cin\xE9ma comme des histoires situ\xE9es dans une dimension parall\xE8le \xE0 celle de mon manga original.",
      source: "Daizenshuu 6 : Movies & TV Specials",
      year: 1995
    },
    sources: ["Daizenshuu 6"]
  },
  {
    id: "tarble",
    title: "Tarble (Fr\xE8re de Vegeta)",
    category: "character",
    tier: "CANON_SUPERVISE",
    score: 90,
    keywords: [
      "tarble",
      "table",
      "frere de vegeta",
      "tarble frere de vegeta",
      "tarble est-il canon",
      "femme de tarble",
      "gure",
      "salada",
      "abo cado",
      "kado"
    ],
    verdict: "Canonique. Con\xE7u par Toriyama pour l'OAV de 2008 et mentionn\xE9 dans Battle of Gods.",
    explanation: "L'histoire originale de l'OAV 2008 'Salut ! Son Goku et ses amis sont de retour !!' a \xE9t\xE9 \xE9crite par Akira Toriyama lui-m\xEAme. Tarble est ensuite express\xE9ment mentionn\xE9 par Bulma dans le film Battle of Gods (2013) et dans le manga Dragon Ball Super.",
    sources: ["OAV Jump Super Anime Tour 2008", "Film Battle of Gods (2013)", "DBS Manga Tome 1"]
  },
  {
    id: "piccolo-favori",
    title: "Piccolo : Personnage pr\xE9f\xE9r\xE9 de Toriyama",
    category: "lore",
    tier: "CANON_ABSOLU",
    score: 100,
    keywords: [
      "piccolo favori",
      "personnage prefere toriyama",
      "personnage favori toriyama",
      "personnage prefere d'akira toriyama",
      "personnage favori d'akira toriyama",
      "auteur aime piccolo",
      "piccolo toriyama",
      "prefere de toriyama",
      "favori de toriyama"
    ],
    verdict: "Canon absolu. Affirmation constante et confirm\xE9e de 1995 \xE0 2022.",
    explanation: "Toriyama a toujours affirm\xE9 que Piccolo \xE9tait son personnage favori, bien avant Goku et Vegeta. C'est pour cette raison qu'il a plac\xE9 Piccolo et Gohan au centre absolu du film Dragon Ball Super: Super Hero en 2022.",
    toriyamaQuote: {
      text: "Je suppose que j'aime Piccolo le plus apr\xE8s tout... Avec Piccolo, son pass\xE9 de m\xE9chant le rend plus int\xE9ressant \xE0 d\xE9velopper que Goku, qui est d'une puret\xE9 absolue.",
      source: "Paraphrase, pas une citation litt\xE9rale \u2014 Daizenshuu 2 : Story Guide (1995) & Interview Super Hero (2022)",
      year: 1995
    },
    sources: ["Daizenshuu 2", "Interview DBS Super Hero (2022)"]
  },
  {
    id: "super-saiyan-5-af",
    title: "Super Saiyan 5 & Dragon Ball AF",
    category: "myth",
    tier: "APOCRYPHE_FANON",
    score: 0,
    keywords: ["super saiyan 5", "ssj5", "dragon ball af", "zaiko", "xicor", "toyble"],
    verdict: "100% Apocryphe & Fanon. Canular n\xE9 sur Internet en 1999.",
    explanation: "Cr\xE9\xE9 \xE0 l'origine par David Montiel Franco (Tablos) comme fan-art dans un magazine espagnol, puis propag\xE9 mondialement comme fausse rumeur de suite officielle. N'a aucun lien avec Akira Toriyama, bien que Toyotaro (alors Toyble) s'en soit inspir\xE9 pour son doujinshi amateur avant d'\xEAtre engag\xE9 par Shueisha.",
    sources: ["Hobby Consolas (1999)"]
  },
  {
    id: "daima",
    title: "Dragon Ball Daima",
    category: "work",
    tier: "CANON_SUPERVISE",
    score: 98,
    keywords: [
      "daima",
      "dragon ball daima",
      "glorio",
      "panzy",
      "gomah",
      "royaume des demons",
      "daima realm",
      "demon realm",
      "royaume demoniaque",
      "royaume des demons daima",
      "makai",
      "tamagami"
    ],
    verdict: "Canonique. Derni\xE8re \u0153uvre majeure dont Akira Toriyama a con\xE7u l'histoire et les designs.",
    explanation: "Akira Toriyama s'est impliqu\xE9 \xE0 un niveau record dans Dragon Ball Daima : il a cr\xE9\xE9 le concept original, l'histoire compl\xE8te, la structure du Royaume des D\xE9mons (Makai), les vaisseaux, ainsi que l'int\xE9gralit\xE9 des nouveaux personnages et monstres.",
    toriyamaQuote: {
      text: "Je me suis retrouv\xE9 tr\xE8s impliqu\xE9 dans cette s\xE9rie, bien plus que d'habitude. J'ai cr\xE9\xE9 l'histoire, les d\xE9cors et de nombreux designs. C'est une grande aventure palpitante !",
      source: "Message officiel d'annonce de Dragon Ball Daima (New York Comic Con)",
      year: 2023
    },
    sources: ["Dragon Ball Daima (2024)", "Annonce officielle New York Comic Con 2023"]
  },
  {
    id: "dieu-noyau-monde",
    title: "Origine des Dieux Ka\xEFo et Ka\xEFoshin (Plan\xE8te du Noyau)",
    category: "lore",
    tier: "CANON_ABSOLU",
    score: 100,
    keywords: [
      "kaishin-sei",
      "shin-jin",
      "arbre du monde",
      "fruits dores",
      "makaio",
      "origine kaioshin",
      "kaiju"
    ],
    verdict: "Canon absolu. R\xE9v\xE9l\xE9 par Akira Toriyama dans le Super Exciting Guide (2009).",
    explanation: "Les Ka\xEFo et Ka\xEFoshin naissent de fruits sur l'Arbre du Monde de la Plan\xE8te Kaishin-sei. Ils sont asexu\xE9s, vivent 75 000 ans et seuls les fruits dor\xE9s rarissimes donnent naissance aux Ka\xEFoshin.",
    sources: [
      "Super Exciting Guide : Character Volume (2009)",
      "docs/reference/toriyama-databook-seg.md"
    ]
  },
  {
    id: "s-cells",
    title: "Cellules S (S-Cells) et d\xE9clencheur Super Saiyan",
    category: "lore",
    tier: "CANON_ABSOLU",
    score: 95,
    keywords: [
      "s-cells",
      "cellules s",
      "declencheur super saiyan",
      "coeur pur",
      "goten trunks super saiyan"
    ],
    verdict: "Canon absolu. Concept biologique formul\xE9 par Akira Toriyama.",
    explanation: "Dans le Saiky\u014D Jump de janvier 2018, Toriyama explique que pour devenir Super Saiyan, un corps saiyan doit poss\xE9der un seuil suffisant de 'Cellules S', favoris\xE9es par un esprit doux et un entra\xEEnement rigoureux. Goten et Trunks en ont h\xE9rit\xE9 en grande quantit\xE9.",
    sources: ["Saiky\u014D Jump Janvier 2018 (Toriyama Q&A)"]
  },
  {
    id: "dragon-ball-super-manga",
    title: "Dragon Ball Super (Manga de Toyotaro)",
    category: "work",
    tier: "CANON_SUPERVISE",
    score: 90,
    keywords: ["dbs manga", "toyotaro", "moro", "granolah", "ultra instinct", "ultra ego"],
    verdict: "Canon supervis\xE9. Sc\xE9narios valid\xE9s et storyboards annot\xE9s par Toriyama.",
    explanation: "Toyotaro dessine le manga sous la supervision directe de Toriyama. Toriyama fournissait le plan de trame g\xE9n\xE9ral, corrigeait les storyboards case par case et \xE9crivait les dialogues cl\xE9s.",
    sources: ["Dragon Ball Super (Jump Comics)", "Entretiens crois\xE9s Toriyama x Toyotaro"]
  },
  {
    id: "multiplicateurs-super-saiyan",
    title: "Multiplicateurs officiels du Super Saiyan (x50, x2, x4)",
    category: "lore",
    tier: "EXTENSION_OFFICIELLE",
    score: 75,
    keywords: [
      "multiplicateur",
      "multiplicateurs",
      "multiplicateur super saiyan",
      "multiplicateur ssj",
      "ssj x50",
      "ssj2 x100",
      "ssj3 x400",
      "multiplicateur ssj2",
      "multiplicateur ssj3",
      "seg multiplicateur",
      "puissance super saiyan",
      "facteur multiplicateur"
    ],
    verdict: "Officiel selon le Daizenshuu 7 et le Super Exciting Guide (2009). SSJ1 = x50, SSJ2 = x2 de SSJ1 (x100), SSJ3 = x4 de SSJ2 (x400).",
    explanation: "Akira Toriyama a pr\xE9cis\xE9 qu'en dessinant l'\xE9veil du Super Saiyan, il pensait \xE0 une multiplication par 10 car 50 lui semblait d\xE9mesur\xE9, mais que pour rester coh\xE9rent face au Kaio-ken x20 de Goku, les guides officiels de Shueisha ont grav\xE9 le multiplicateur par 50. Le Super Exciting Guide (2009) a ensuite compl\xE9t\xE9 la hi\xE9rarchie : SSJ2 = 2x SSJ1 (x100 de la base) et SSJ3 = 4x SSJ2 (x400 de la base).",
    sources: [
      "Daizenshuu 7 : Dictionnaire de Dragon Ball (p. 83)",
      "Super Exciting Guide : Story Volume (2009)",
      "Entretien Akira Toriyama (Daizenshuu 6)"
    ]
  },
  {
    id: "unite-kiri-babidi",
    title: "L'unit\xE9 Kiri (Babidi) et conversion en Sent\u014Dryoku",
    category: "lore",
    tier: "CANON_ABSOLU",
    score: 100,
    keywords: [
      "kiri",
      "unite kiri",
      "kiri babidi",
      "yakon kiri",
      "kiri sentoryoku",
      "conversion kiri",
      "mesure babidi"
    ],
    verdict: "100% Canon absolu dans le manga (Tome 38). Yakon = 800 Kiri, Goku SSJ2 = 3 000 Kiri. Seuil de destruction plan\xE9taire = 200 \xE0 300 Kiri.",
    explanation: "Introduit par Akira Toriyama dans l'arc Majin Boo afin de contourner l'inflation astronomique des scouters. Babidi utilise un appareil magique mesurant le ki en Kiri : Yakon absorbe la lumi\xE8re et atteint 800 Kiri, tandis que Goku passant en SSJ2 sature le compteur \xE0 3 000 Kiri. La conversion \xAB 1 Kiri \u2248 50 000 unit\xE9s scouter \xBB, r\xE9pandue chez les fans, n'a aucune source officielle.",
    sources: ["Manga Dragon Ball Tome 38 (Chapitres 450-452)"]
  },
  {
    id: "fusion-potara-vs-metamol-puissance",
    title: "Puissance Vegetto (Potara) vs Gogeta (M\xE9tamol)",
    category: "lore",
    tier: "EXTENSION_OFFICIELLE",
    score: 75,
    keywords: [
      "potara vs metamol",
      "fusion potara vs metamol",
      "fusion potara vs fusion metamol",
      "fusion potara est superieure",
      "fusion potara superieure",
      "potara superieure",
      "potara est superieure",
      "potara superieure metamol",
      "potara superieure a la fusion metamol",
      "vegetto vs gogeta",
      "vegetto plus fort que gogeta",
      "vegetto est-il plus fort que gogeta",
      "vegetto contre gogeta",
      "gogeta vs vegito",
      "gogeta vs vegetto",
      "gogeta ou vegetto",
      "gogeta ou vegito",
      "gogeta contre vegito",
      "gogeta contre vegetto",
      "comparaison potara metamol",
      "comparaison vegetto gogeta",
      "puissance vegetto vs gogeta",
      "puissance gogeta vs vegetto",
      "puissance gogeta vs vegito",
      "multiplication potara",
      "addition metamol",
      "fusion comparaison puissance",
      "potara ou metamol",
      "potala ou metamol",
      "potala vs metamol",
      "formule potara seg"
    ],
    verdict: "Le manga \xE9tablit la sup\xE9riorit\xE9 naturelle des Potaras (rivalit\xE9 + pas d'\xE9galisation impos\xE9e). Le Super Exciting Guide formalise une formule de multiplication (A x B).",
    explanation: "Dans le manga, le Vieux Ka\xEFoshin affirme que la fusion Potara est sup\xE9rieure \xE0 la danse M\xE9tamol : les utilisateurs n'ont pas besoin d'aligner leur puissance sur le plus faible, la fusion dure sans limite de temps pour les mortels \xE0 l'\xE9poque de Z, et le lien de rivaux de Goku et Vegeta amplifie le r\xE9sultat. Le Super Exciting Guide (2009) ajoute que l'effet Potara est comparable \xE0 une multiplication des forces de combat.",
    sources: [
      "Manga Dragon Ball Tome 42 (Chapitre 504)",
      "Super Exciting Guide : Story Volume (2009)",
      "Daizenshuu 7"
    ]
  },
  {
    id: "kid-buu-vs-buuhan",
    title: "Majin Buu Pur (Kid Buu) vs Buuhan",
    category: "lore",
    tier: "CANON_ABSOLU",
    score: 100,
    keywords: [
      "kid buu vs buuhan",
      "kid buu plus fort que buuhan",
      "buuhan vs kid buu",
      "buu pur vs buuhan",
      "kid buu ou buuhan",
      "buuhan ou kid buu",
      "majin buu pur ou buuhan",
      "majin buu pur vs buuhan",
      "qui est le plus fort entre kid buu et buuhan",
      "qui est le plus fort entre majin buu pur et buuhan",
      "qui est le plus fort entre majin buu pur (kid buu) et majin buu ayant absorbe gohan (buuhan)",
      "qui est le plus fort entre kid buu et buu ayant absorbe gohan",
      "kid buu plus fort",
      "kid boo vs buuhan"
    ],
    verdict: "Majin Buu Pur (Kid Buu) est plus fort que Majin Buu ayant absorb\xE9 Gohan (Buuhan).",
    explanation: "Kid Buu est la forme originelle et ultime de Majin Buu, incarnation absolue du mal et de la destruction sans frein ni bride morale. \xC9tabli \xE0 travers l'ensemble des m\xE9dias officiels de Dragon Ball comme l'adversaire supr\xEAme et qualifi\xE9 d'\xAB ennemi le plus fort de l'univers \xBB (Daizenshuu 2), il repr\xE9sente le sommet de dangerosit\xE9 et d'invuln\xE9rabilit\xE9 de Majin Buu, surpassant Buuhan et exigeant les forces vives du cosmos entier concentr\xE9es dans le Super Genkidama pour \xEAtre an\xE9anti.",
    sources: [
      "Manga Dragon Ball Tome 42",
      "Daizenshuu 2 : Story Guide",
      "Anime Dragon Ball Z"
    ]
  },
  {
    id: "goku-ssj3-vs-ultimate-gohan",
    title: "Son Goku Super Saiyan 3 vs Gohan Ultime (Ultimate Gohan)",
    category: "lore",
    tier: "CANON_ABSOLU",
    score: 100,
    keywords: [
      "goku ssj3 vs gohan ultime",
      "goku ssj3 vs ultimate gohan",
      "goku ssj3 plus fort que gohan",
      "goku ssj3 plus fort que gohan ultime",
      "goku ssj3 plus fort qu'ultimate gohan",
      "ultimate gohan vs goku ssj3",
      "gohan ultime vs goku ssj3",
      "goku super saiyan 3 vs gohan",
      "goku super saiyan 3 vs gohan ultime",
      "goku super saiyan 3 vs ultimate gohan",
      "qui est le plus fort dans la saga buu entre goku super saiyan 3 et gohan",
      "qui est le plus fort dans la saga buu entre goku ssj3 et gohan ultime",
      "qui est le plus fort dans la saga buu entre goku super saiyan 3 et gohan dans sa derniere forme (ultimate gohan)",
      "qui est le plus fort entre goku super saiyan 3 et gohan dans sa derniere forme",
      "qui est le plus fort entre goku ssj3 et ultimate gohan",
      "goku ssj3 ou gohan ultime",
      "goku ssj3 ou ultimate gohan"
    ],
    verdict: "Son Goku Super Saiyan 3 est plus fort que Gohan dans sa forme ultime (Ultimate Gohan).",
    explanation: "Son Goku en Super Saiyan 3 est le guerrier Z d'\xE9lite supr\xEAme de la saga Buu. Seul combattant capable d'affronter Kid Buu au corps \xE0 corps lors de l'ultime bataille pour la survie du macrocosme, Goku sublime la puissance brute par son g\xE9nie martial, sa ma\xEEtrise du combat au-del\xE0 des limites et ses ressources h\xE9ro\xEFques, surpassant Gohan Ultime \xE0 travers l'ensemble des m\xE9dias de l'\u0153uvre (comme illustr\xE9 notamment face \xE0 Hildegarn dans le film 13).",
    sources: [
      "Manga Dragon Ball Tomes 41-42",
      "Daizenshuu 2 : Story Guide",
      "Film DBZ 13 : L'Attaque du Dragon"
    ]
  },
  {
    id: "puissance-goku-ssj1-namek",
    title: "Puissance de Goku SSJ1 sur Namek (150 000 000 BP)",
    category: "lore",
    tier: "EXTENSION_OFFICIELLE",
    score: 75,
    keywords: [
      "150 millions",
      "150 000 000",
      "150m",
      "goku 150 000 000",
      "puissance goku namek",
      "puissance de goku",
      "puissance goku",
      "puissance namek",
      "goku namek",
      "goku ssj namek",
      "freezer 100%",
      "goku contre freeza",
      "goku super saiyan namek",
      "freeza 120 000 000",
      "sentoryoku goku freeza",
      "battle power namek"
    ],
    verdict: "Chiffre officiel \xE9tabli par le Daizenshuu 7 (p. 82-83). Goku SSJ1 = 150 000 000, Freezer 100% = 120 000 000.",
    explanation: "Le combat titanesque sur Namek marque le point culminant des mesures chiffr\xE9es de la s\xE9rie. Le Daizenshuu 7 a document\xE9 Goku normal sortant du caisson de r\xE9g\xE9n\xE9ration \xE0 3 000 000 d'unit\xE9s, son Kaio-ken x20 \xE0 60 000 000, et son Super Saiyan (x50) \xE0 150 000 000, dominant Freezer \xE0 son maximum (120 000 000). Au-del\xE0 de cet affrontement, Toriyama n'a plus jamais utilis\xE9 de chiffres scouter.",
    sources: ["Daizenshuu 7 : Dictionnaire de Dragon Ball (p. 82-83)", "Manga DB Tomes 26-27"]
  },
  {
    id: "arret-scouter-namek-toriyama",
    title: "Abandon des niveaux de puissance chiffr\xE9s (Scouters) apr\xE8s Namek",
    category: "lore",
    tier: "CANON_ABSOLU",
    score: 100,
    keywords: [
      "chiffres scouter",
      "arret scouter",
      "abandon scouter",
      "pourquoi plus de chiffres",
      "scouter apres namek",
      "fin des scouters",
      "scouters apres namek"
    ],
    verdict: "D\xE9cision d\xE9lib\xE9r\xE9e d'Akira Toriyama : l'inflation des chiffres nuisait \xE0 la tension dramatique.",
    explanation: "Akira Toriyama a expliqu\xE9 que le scouter servait d'artifice narratif pour que les guerriers de Freezer sous-estiment les Terriens capables de varier leur ki. Une fois l'\xE9veil du Super Saiyan atteint \xE0 150 000 000, des nombres encore plus colossaux auraient rendu les combats abstraits et pr\xE9visibles. L'auteur a donc stopp\xE9 les chiffres scouter apr\xE8s Namek pour pr\xE9server l'impact \xE9motionnel et visuel.",
    toriyamaQuote: {
      text: "Si la puissance des ennemis continuait \xE0 grimper simplement avec des nombres de plus en plus gigantesques, les lecteurs finiraient par perdre tout rep\xE8re concret.",
      source: "Daizenshuu 6 & entretiens Akira Toriyama",
      year: 1995
    },
    sources: ["Entretien Akira Toriyama (Daizenshuu 6)", "Daizenshuu 7 (p. 82-83)"]
  },
  {
    id: "beerus-whis",
    title: "Beerus, Whis et la hi\xE9rarchie divine",
    category: "character",
    tier: "CANON_SUPERVISE",
    score: 98,
    keywords: [
      "beerus",
      "whis",
      "dieu de la destruction",
      "ange whis",
      "bills",
      "zeno",
      "grand pretre",
      "daishinkan",
      "beerus dort",
      "beerus dort 39 ans",
      "sommeil de beerus",
      "39 ans de sommeil",
      "poisson oracle",
      "reveil de beerus",
      "39 ans"
    ],
    verdict: "Canonique. Enti\xE8rement imagin\xE9s, nomm\xE9s et dessin\xE9s par Akira Toriyama pour Battle of Gods (2013).",
    explanation: "Initialement \xE9bauch\xE9 comme un monstre reptilien infectieux par le premier sc\xE9nariste de Battle of Gods, Toriyama a int\xE9gralement repris le projet en s'inspirant de son propre chat de race Cornish Rex pour Beerus, et a invent\xE9 son ma\xEEtre martial Whis. Pr\xE9dit par la proph\xE9tie du Poisson Oracle, le r\xE9veil de Beerus apr\xE8s 39 ans de sommeil marque le point de d\xE9part de la trame moderne de Dragon Ball \xE0 la recherche du Super Saiyan God.",
    toriyamaQuote: {
      text: "Beerus est inspir\xE9 de mon chat de quatorze ans, un Cornish Rex. Whis, lui, a \xE9t\xE9 cr\xE9\xE9 pour \xEAtre son acolyte encore plus fort et myst\xE9rieux. Leurs noms viennent de boissons alcoolis\xE9es (Beer et Whisky).",
      source: "Entretien Akira Toriyama (Ch\u014Dzensh\u016B 1, 2013)",
      year: 2013
    },
    sources: ["Film Battle of Gods (2013)", "Ch\u014Dzensh\u016B 1", "Manga Dragon Ball Super"]
  },
  {
    id: "super-saiyan-god-blue",
    title: "Super Saiyan God & Super Saiyan Blue (SSGSS)",
    category: "form",
    tier: "CANON_SUPERVISE",
    score: 95,
    keywords: [
      "super saiyan god",
      "super saiyan blue",
      "ssgss",
      "ssjg",
      "ssj god",
      "ssj blue",
      "god saiyan",
      "cheveux rouges goku",
      "cheveux bleus goku",
      "rituel saiyan god",
      "forme divine"
    ],
    verdict: "Canon supervis\xE9. Concepts et charadesigns cr\xE9\xE9s par Akira Toriyama.",
    explanation: "Toriyama a rejet\xE9 le design initial muscl\xE9 et cap\xE9 propos\xE9 par la Toei pour le Super Saiyan God, choisissant une silhouette affin\xE9e aux cheveux magenta. Il a ensuite cr\xE9\xE9 le Super Saiyan Blue (Super Saiyan God Super Saiyan) pour le film La R\xE9surrection de 'F' (2015) en expliquant qu'il s'agit de la puissance d'un dieu insuffl\xE9e dans un Super Saiyan avec un esprit calme et ma\xEEtris\xE9.",
    sources: ["Film Battle of Gods (2013)", "Film La R\xE9surrection de 'F' (2015)", "Manga DBS"]
  },
  {
    id: "beast-gohan-orange-piccolo",
    title: "Son Gohan Beast & Orange Piccolo",
    category: "form",
    tier: "CANON_SUPERVISE",
    score: 98,
    keywords: [
      "beast gohan",
      "gohan beast",
      "orange piccolo",
      "piccolo orange",
      "nouvelle forme gohan",
      "super hero formes"
    ],
    verdict: "Canonique. Formes cr\xE9\xE9es, nomm\xE9es et dessin\xE9es personnellement par Akira Toriyama pour Super Hero (2022).",
    explanation: "Akira Toriyama a \xE9crit le film Dragon Ball Super: Super Hero en pla\xE7ant Piccolo et Gohan au premier plan. Il a dessin\xE9 Orange Piccolo en hommage \xE0 son personnage favori pour lui redonner un niveau \xE9quivalent \xE0 celui de Son Goku et Vegeta, et a cr\xE9\xE9 Gohan Beast en s'inspirant de l'\xE9veil du jeune Gohan contre Cell.",
    toriyamaQuote: {
      text: "Je suis tellement heureux que Piccolo ait enfin obtenu une puissance \xE9quivalente \xE0 celle de Goku et des autres. Quant \xE0 Gohan Beast, son nom vient du fait que la b\xEAte sauvage en lui s'est enfin r\xE9veill\xE9e.",
      source: "Interview d'Akira Toriyama \u2014 Sortie de Dragon Ball Super: Super Hero",
      year: 2022
    },
    sources: [
      "Film Dragon Ball Super: Super Hero (2022)",
      "Manga Dragon Ball Super (Arc Super Hero, Chapitres 96-103)"
    ]
  },
  {
    id: "zalama-super-dragon-balls",
    title: "Zalama & les Super Dragon Balls",
    category: "lore",
    tier: "CANON_SUPERVISE",
    score: 92,
    keywords: [
      "zalama",
      "zarama",
      "dieu dragon zalama",
      "super dragon balls",
      "super shenron",
      "boules de cristal geantes"
    ],
    verdict: "Canon supervis\xE9. Introduit dans Dragon Ball Super par Akira Toriyama.",
    explanation: "Lord Zuno explique que le Dieu Dragon Zalama a forg\xE9 les Super Dragon Balls, des sph\xE8res dor\xE9es de la taille d'une plan\xE8te capables d'exaucer absolument n'importe quel v\u0153u sans aucune restriction. Toriyama a personnellement \xE9crit le rituel en langage des dieux (Chant des Dieux) pour invoquer Super Shenron.",
    sources: ["Manga Dragon Ball Super Tome 1 (Chapitres 6-7)", "S\xE9rie DBS Arc Univers 6"]
  },
  {
    id: "uub-oob",
    title: "Uub (Oob) & le Ki Divin du Grand Ka\xEFoshin",
    category: "character",
    tier: "CANON_ABSOLU",
    score: 100,
    keywords: [
      "uub",
      "oob",
      "reincarnation de buu",
      "reincarnation de boo",
      "ki divin uub",
      "uub moro",
      "chapitre 519 uub"
    ],
    verdict: "100% Canon absolu. Cr\xE9\xE9 par Toriyama pour la fin du manga original et enrichi dans DBS.",
    explanation: "Uub est la r\xE9incarnation humaine du Majin Boo originel (Kid Boo), n\xE9e du souhait pur exprim\xE9 par Son Goku avant de l'achever avec le Genkidama (Chapitre 516). Toriyama a consacr\xE9 la conclusion de son manga (Chapitres 518-519) \xE0 la rencontre et au d\xE9part de Son Goku pour entra\xEEner Uub. Dans Dragon Ball Super (Chapitre 66), Toyotaro et Toriyama confirment que, r\xE9incarnation de Kid Boo, Uub a \xE9galement h\xE9rit\xE9 du prodigieux Ki Divin du Grand Ka\xEFoshin absorb\xE9 cinq millions d'ann\xE9es plus t\xF4t.",
    sources: [
      "Manga Dragon Ball Tome 42 (Chapitres 516-519)",
      "Manga Dragon Ball Super Tome 15 (Chapitre 66)"
    ]
  },
  {
    id: "c21-vomi",
    title: "C-21 & Vomi (\xC9pouse du Dr Gero)",
    category: "lore",
    tier: "CANON_SUPERVISE",
    score: 85,
    keywords: ["c21", "c-21", "vomi", "femme du docteur gero", "dr gero femme", "fighterz c21"],
    verdict: "Le personnage de Vomi est canonique (Super Hero) ; le sc\xE9nario de FighterZ est non-canonique.",
    explanation: "C-21 a \xE9t\xE9 cr\xE9\xE9e par Akira Toriyama pour le jeu vid\xE9o Dragon Ball FighterZ (2018). Toriyama a r\xE9v\xE9l\xE9 qu'elle \xE9tait model\xE9e sur l'\xE9pouse humaine du Dr Gero, nomm\xE9e Vomi. Dans le film Dragon Ball Super: Super Hero (2022), Toriyama a officiellement canonis\xE9 l'existence de Vomi en l'int\xE9grant dans l'arbre g\xE9n\xE9alogique officiel de la famille du Dr Gero et du Dr Hedo.",
    sources: [
      "Dragon Ball FighterZ (2018)",
      "Film Dragon Ball Super: Super Hero (2022)",
      "V-Jump Janvier 2018"
    ]
  },
  {
    id: "sdbh-heroes",
    title: "Super Dragon Ball Heroes (SDBH) & Xenoverse",
    category: "work",
    tier: "NON_CANON_DERIVE",
    score: 10,
    keywords: [
      "sdbh",
      "super dragon ball heroes",
      "heroes",
      "xenoverse",
      "patrouille du temps",
      "time patrol",
      "trunks xeno",
      "goku xeno",
      "fu",
      "hearts",
      "cumber"
    ],
    verdict: "Non-canonique. Jeux d'arcade et anime promotionnel d\xE9riv\xE9s.",
    explanation: "Con\xE7us par Dimps et Bandai Namco avec Toei Animation pour promouvoir le jeu de cartes d'arcade au Japon. Bien que Toriyama ait valid\xE9 certains charadesigns originaux (comme le Trunks en manteau de la Patrouille du Temps dans Dragon Ball Online), les fusions impossibles (Vegetto SSJ4, Bardock SSJ4, etc.) et les arcs temporels de Heroes sont hors de la continuit\xE9 canonique.",
    sources: ["Super Dragon Ball Heroes Official Website"]
  },
  {
    id: "dbm-multiverse",
    title: "Dragon Ball Multiverse (DBM)",
    category: "myth",
    tier: "APOCRYPHE_FANON",
    score: 0,
    keywords: [
      "dbm",
      "dragon ball multiverse",
      "salagir",
      "gogeta jr",
      "univers 16",
      "univers 18",
      "bra ssj2 multiverse",
      "gast carcolh"
    ],
    verdict: "100% Apocryphe & Fanon. Webcomic amateur cr\xE9\xE9 par Salagir et des fans fran\xE7ais.",
    explanation: "Cr\xE9\xE9 par Salagir et illustr\xE9 \xE0 l'origine par Gogeta Jr \xE0 partir de 2008. Il s'agit de la bande dessin\xE9e de fans la plus c\xE9l\xE8bre au monde, mais elle n'a aucun lien contractuel, \xE9ditorial ou l\xE9gal avec Akira Toriyama, Shueisha ou Bird Studio.",
    sources: ["Site officiel Dragon Ball Multiverse (Fanon)", "Documentation des \u0153uvres de fans"]
  },
  {
    id: "fillers-anime-garlic-paikuhan",
    title: "Fillers de l'anime (Garlic Jr, Paikuhan, Gregory, Maron)",
    category: "work",
    tier: "NON_CANON_DERIVE",
    score: 20,
    keywords: [
      "garlic jr",
      "paikuhan",
      "pikkon",
      "gregory",
      "maron",
      "fausse namek",
      "permis de conduire goku",
      "tournoi de l'autre monde",
      "tournoi des enfers",
      "filler anime"
    ],
    verdict: "Non-canonique. \xC9pisodes produits par Toei Animation pour ne pas rattraper le manga.",
    explanation: "Des arcs entiers (Garlic Jr), des tournois (l'Autre Monde avec Paikuhan) et des personnages secondaires (le grillon Gregory chez Kaio, l'ex-petite amie de Krilin Maron) ont \xE9t\xE9 invent\xE9s par les sc\xE9naristes de Toei Animation pour meubler le temps d'antenne hebdomadaire. Ils n'apparaissent jamais dans le manga original de Toriyama.",
    sources: ["Manga Dragon Ball (Tomes 1 \xE0 42)", "Daizenshuu 6 (Anime)"]
  },
  {
    id: "gregory-kaio",
    title: "Gregory (Le grillon de Ka\xEFo)",
    category: "character",
    tier: "NON_CANON_DERIVE",
    score: 20,
    keywords: [
      "gregory",
      "grillon gregory",
      "gregory kaio",
      "gregory est-il dans le manga",
      "gregory manga",
      "gregory canon"
    ],
    verdict: "Non-canonique au manga original. Personnage filler con\xE7u pour l'anime Toei.",
    explanation: "Le grillon Gregory n'appara\xEEt dans aucune case des 42 tomes du manga original d'Akira Toriyama : sur la plan\xE8te de Ka\xEFo, seul le singe Bubbles accompagne le ma\xEEtre des lieux. C'est le staff de l'anime Toei qui a demand\xE9 un second compagnon pour allonger et combler l'entra\xEEnement humoristique de Goku. Akira Toriyama a dessin\xE9 son design pour faire plaisir au studio, mais ne l'a jamais inclus dans son manga.",
    sources: ["Manga Dragon Ball (Tomes 18-19)", "Daizenshuu 5 & 6 (Anime)"]
  }
];
var DEFAULT_POWER_SCALING_CONFIG = {
  enabled: true,
  kiriToBpRate: 50000,
  planetDestructionKiriFloor: 200,
  multipliers: [
    {
      form: "Oozaru (Grand Singe)",
      multiplier: 10,
      baseForm: "Base",
      source: "Manga DB Chapitre 233 & Daizenshuu 7",
      canonTier: "CANON_ABSOLU",
      notes: "Multiplication brute de la puissance du Saiyan poss\xE9dant sa queue sous les rayons Blutz."
    },
    {
      form: "Kaio-ken (x2 \xE0 x20)",
      multiplier: 2,
      baseForm: "Base",
      source: "Manga DB Chapitres 229 & 315",
      canonTier: "CANON_ABSOLU",
      notes: "Technique de Ma\xEEtre Kaio multipliant force, vitesse et ki d'un facteur exact (jusqu'\xE0 x20)."
    },
    {
      form: "Super Saiyan (SSJ1)",
      multiplier: 50,
      baseForm: "Base",
      source: "Daizenshuu 7 (p. 83) & Super Exciting Guide",
      canonTier: "CANON_ABSOLU",
      notes: "\xC9veil l\xE9gendaire. Propulse Goku de 3 000 000 \xE0 150 000 000 BP contre Freezer (120 000 000)."
    },
    {
      form: "Super Saiyan 2 (SSJ2)",
      multiplier: 100,
      baseForm: "Base (x2 de SSJ1)",
      source: "Super Exciting Guide : Story Volume (2009)",
      canonTier: "EXTENSION_OFFICIELLE",
      notes: "D\xE9passement du Super Saiyan initi\xE9 par Gohan. Double la puissance du SSJ1 (x100 de la base)."
    },
    {
      form: "Super Saiyan 3 (SSJ3)",
      multiplier: 400,
      baseForm: "Base (x4 de SSJ2)",
      source: "Super Exciting Guide : Story Volume (2009)",
      canonTier: "EXTENSION_OFFICIELLE",
      notes: "Extirpation du potentiel cach\xE9. Quadruple la puissance du SSJ2 (x400 de la base)."
    },
    {
      form: "Fusion M\xE9tamol (Gogeta / Gotenks)",
      multiplier: 0,
      baseForm: "Guerrier A + Guerrier B",
      source: "Daizenshuu 7 & Super Exciting Guide",
      canonTier: "CANON_ABSOLU",
      notes: "Addition des forces apr\xE8s \xE9galisation rigoureuse sur le guerrier le plus faible, puis amplification majeure."
    },
    {
      form: "Fusion Potara (Vegetto)",
      multiplier: 0,
      baseForm: "Guerrier A x Guerrier B",
      source: "Super Exciting Guide & Daizenshuu 7",
      canonTier: "EXTENSION_OFFICIELLE",
      notes: "Fusion divine sans besoin d'\xE9galisation. Le SEG mentionne une multiplication synergique des forces."
    }
  ],
  officialBps: [
    {
      character: "Fermier au fusil",
      saga: "Saga Saiyans",
      state: "Normal",
      bp: 5,
      scouter: true,
      source: "Manga Ch. 195",
      canonTier: "CANON_ABSOLU"
    },
    {
      character: "Son Goku",
      characterId: 1,
      saga: "Saga Saiyans",
      state: "V\xEAtements lourds",
      bp: 334,
      scouter: true,
      source: "Manga Ch. 199",
      canonTier: "CANON_ABSOLU"
    },
    {
      character: "Piccolo",
      saga: "Saga Saiyans",
      state: "V\xEAtements lourds",
      bp: 322,
      scouter: true,
      source: "Manga Ch. 199",
      canonTier: "CANON_ABSOLU"
    },
    {
      character: "Piccolo",
      saga: "Saga Saiyans",
      state: "Makankosappo (max)",
      bp: 1440,
      scouter: true,
      source: "Manga Ch. 201",
      canonTier: "CANON_ABSOLU"
    },
    {
      character: "Son Goku",
      characterId: 1,
      saga: "Saga Saiyans",
      state: "Kamehameha (max)",
      bp: 924,
      scouter: true,
      source: "Manga Ch. 201",
      canonTier: "CANON_ABSOLU"
    },
    {
      character: "Son Gohan",
      saga: "Saga Saiyans",
      state: "Col\xE8re contre Raditz",
      bp: 1307,
      scouter: true,
      source: "Manga Ch. 203",
      canonTier: "CANON_ABSOLU"
    },
    {
      character: "Raditz",
      saga: "Saga Saiyans",
      state: "Normal",
      bp: 1500,
      scouter: true,
      source: "Daizenshuu 7 (1200 Manga)",
      canonTier: "EXTENSION_OFFICIELLE"
    },
    {
      character: "Saibaiman",
      saga: "Saga Saiyans",
      state: "Normal",
      bp: 1200,
      scouter: true,
      source: "Manga Ch. 214",
      canonTier: "CANON_ABSOLU"
    },
    {
      character: "Krilin",
      saga: "Saga Saiyans",
      state: "Contre Nappa/Saibaimen",
      bp: 1770,
      scouter: true,
      source: "Daizenshuu 7",
      canonTier: "EXTENSION_OFFICIELLE"
    },
    {
      character: "Yamcha",
      saga: "Saga Saiyans",
      state: "Contre Saibaiman",
      bp: 1480,
      scouter: true,
      source: "Daizenshuu 7",
      canonTier: "EXTENSION_OFFICIELLE"
    },
    {
      character: "Tenshinhan",
      saga: "Saga Saiyans",
      state: "Contre Nappa",
      bp: 1830,
      scouter: true,
      source: "Daizenshuu 7",
      canonTier: "EXTENSION_OFFICIELLE"
    },
    {
      character: "Chaozu",
      saga: "Saga Saiyans",
      state: "Contre Nappa",
      bp: 610,
      scouter: true,
      source: "Daizenshuu 7",
      canonTier: "EXTENSION_OFFICIELLE"
    },
    {
      character: "Piccolo",
      saga: "Saga Saiyans",
      state: "Contre Nappa",
      bp: 3500,
      scouter: true,
      source: "Daizenshuu 7",
      canonTier: "EXTENSION_OFFICIELLE"
    },
    {
      character: "Nappa",
      saga: "Saga Saiyans",
      state: "Normal",
      bp: 4000,
      scouter: true,
      source: "Daizenshuu 7",
      canonTier: "EXTENSION_OFFICIELLE"
    },
    {
      character: "Son Goku",
      characterId: 1,
      saga: "Saga Saiyans",
      state: "Retour Kaio (calme)",
      bp: 5000,
      scouter: true,
      source: "Manga Ch. 222",
      canonTier: "CANON_ABSOLU"
    },
    {
      character: "Son Goku",
      characterId: 1,
      saga: "Saga Saiyans",
      state: "Plein pouvoir (over 8000)",
      bp: 8000,
      scouter: true,
      source: "Manga Ch. 224",
      canonTier: "CANON_ABSOLU"
    },
    {
      character: "Son Goku",
      characterId: 1,
      saga: "Saga Saiyans",
      state: "Kaio-ken x3",
      bp: 24000,
      scouter: true,
      source: "Manga Ch. 229 / Daizenshuu 7",
      canonTier: "CANON_ABSOLU"
    },
    {
      character: "Son Goku",
      characterId: 1,
      saga: "Saga Saiyans",
      state: "Kaio-ken x4 (Kamehameha)",
      bp: 32000,
      scouter: true,
      source: "Manga Ch. 231 / Daizenshuu 7",
      canonTier: "CANON_ABSOLU"
    },
    {
      character: "Vegeta",
      saga: "Saga Saiyans",
      state: "Normal (sur Terre)",
      bp: 18000,
      scouter: true,
      source: "Manga Ch. 228 / Daizenshuu 7",
      canonTier: "CANON_ABSOLU"
    },
    {
      character: "Vegeta",
      saga: "Saga Saiyans",
      state: "Oozaru (x10)",
      bp: 180000,
      scouter: false,
      source: "Manga Ch. 233 / Daizenshuu 7",
      canonTier: "EXTENSION_OFFICIELLE"
    },
    {
      character: "Vegeta",
      saga: "Saga Namek",
      state: "Zenkai contre Kiwi",
      bp: 24000,
      scouter: true,
      source: "Manga Ch. 249",
      canonTier: "CANON_ABSOLU"
    },
    {
      character: "Kiwi",
      saga: "Saga Namek",
      state: "Normal",
      bp: 18000,
      scouter: true,
      source: "Manga Ch. 249",
      canonTier: "CANON_ABSOLU"
    },
    {
      character: "Dodoria",
      saga: "Saga Namek",
      state: "Normal",
      bp: 22000,
      scouter: true,
      source: "Daizenshuu 7",
      canonTier: "EXTENSION_OFFICIELLE"
    },
    {
      character: "Zarbon",
      saga: "Saga Namek",
      state: "Forme 1",
      bp: 23000,
      scouter: true,
      source: "Daizenshuu 7",
      canonTier: "EXTENSION_OFFICIELLE"
    },
    {
      character: "Vegeta",
      saga: "Saga Namek",
      state: "Zenkai contre Zarbon monstre",
      bp: 30000,
      scouter: true,
      source: "Manga Ch. 265",
      canonTier: "CANON_ABSOLU"
    },
    {
      character: "Guerriers Nameks",
      saga: "Saga Namek",
      state: "Protection du village",
      bp: 3000,
      scouter: true,
      source: "Manga Ch. 253",
      canonTier: "CANON_ABSOLU"
    },
    {
      character: "Nail",
      saga: "Saga Namek",
      state: "Normal",
      bp: 42000,
      scouter: true,
      source: "Manga Ch. 286",
      canonTier: "CANON_ABSOLU"
    },
    {
      character: "Son Goku",
      characterId: 1,
      saga: "Saga Namek",
      state: "Arriv\xE9e Namek (en action)",
      bp: 90000,
      scouter: true,
      source: "Manga Ch. 279 / Daizenshuu 7",
      canonTier: "CANON_ABSOLU"
    },
    {
      character: "Son Goku",
      characterId: 1,
      saga: "Saga Namek",
      state: "Kaio-ken contre Ginyu",
      bp: 180000,
      scouter: true,
      source: "Manga Ch. 284",
      canonTier: "CANON_ABSOLU"
    },
    {
      character: "Capitaine Ginyu",
      saga: "Saga Namek",
      state: "Plein pouvoir",
      bp: 120000,
      scouter: true,
      source: "Manga Ch. 284",
      canonTier: "CANON_ABSOLU"
    },
    {
      character: "Freezer",
      saga: "Saga Namek",
      state: "Premi\xE8re forme",
      bp: 530000,
      scouter: true,
      source: "Manga Ch. 286",
      canonTier: "CANON_ABSOLU"
    },
    {
      character: "Freezer",
      saga: "Saga Namek",
      state: "Deuxi\xE8me forme",
      bp: 1e6,
      scouter: true,
      source: "Manga Ch. 296 (plus d'un million)",
      canonTier: "CANON_ABSOLU"
    },
    {
      character: "Piccolo",
      saga: "Saga Namek",
      state: "Fusion avec Nail",
      bp: 1200000,
      scouter: false,
      source: "Daizenshuu 7",
      canonTier: "EXTENSION_OFFICIELLE"
    },
    {
      character: "Vegeta",
      saga: "Saga Namek",
      state: "Zenkai Krilin / Contre Freezer Forme Finale",
      bp: 2500000,
      scouter: false,
      source: "Daizenshuu 7",
      canonTier: "EXTENSION_OFFICIELLE"
    },
    {
      character: "Son Goku",
      characterId: 1,
      saga: "Saga Namek",
      state: "Zenkai caisson r\xE9g\xE9n\xE9ration",
      bp: 3000000,
      scouter: false,
      source: "Daizenshuu 7",
      canonTier: "EXTENSION_OFFICIELLE"
    },
    {
      character: "Son Goku",
      characterId: 1,
      saga: "Saga Namek",
      state: "Kaio-ken x10",
      bp: 30000000,
      scouter: false,
      source: "Daizenshuu 7",
      canonTier: "EXTENSION_OFFICIELLE"
    },
    {
      character: "Son Goku",
      characterId: 1,
      saga: "Saga Namek",
      state: "Kaio-ken x20 (Kamehameha)",
      bp: 60000000,
      scouter: false,
      source: "Daizenshuu 7",
      canonTier: "EXTENSION_OFFICIELLE"
    },
    {
      character: "Freezer",
      saga: "Saga Namek",
      state: "Forme Finale (50%)",
      bp: 60000000,
      scouter: false,
      source: "Daizenshuu 7",
      canonTier: "EXTENSION_OFFICIELLE"
    },
    {
      character: "Freezer",
      saga: "Saga Namek",
      state: "Forme Finale (100%)",
      bp: 120000000,
      scouter: false,
      source: "Daizenshuu 7",
      canonTier: "EXTENSION_OFFICIELLE"
    },
    {
      character: "Son Goku",
      characterId: 1,
      saga: "Saga Namek",
      state: "Super Saiyan (SSJ1)",
      bp: 150000000,
      scouter: false,
      source: "Daizenshuu 7 (p. 83)",
      canonTier: "EXTENSION_OFFICIELLE"
    }
  ],
  tiers: [
    {
      tierNumber: 1,
      name: "Humain d'\xC9lite & Art Martial",
      description: "Guerriers de niveau terrien, ma\xEEtres d'arts martiaux et soldats r\xE9guliers de l'arm\xE9e de Freezer.",
      examples: [
        "Fermier au fusil (5)",
        "Tortue G\xE9niale au repos (139)",
        "Son Goku au 21e Tenkaichi Budokai"
      ]
    },
    {
      tierNumber: 2,
      name: "Surhumain / Destructeur de Lune",
      description: "Puissance capable d'oblit\xE9rer un satellite naturel (Lune d\xE9truite par Roshi et Piccolo \xE0 ~140-300 BP).",
      examples: ["Piccolo Makankosappo (1 440)", "Raditz (1 500)", "Saibaimen (1 200)"]
    },
    {
      tierNumber: 3,
      name: "Plan\xE9taire / Menace Extraterrestre",
      description: "Capacit\xE9 prouv\xE9e de d\xE9truire une plan\xE8te tellurique de taille standard comme la Terre (Galick Ho de Vegeta \xE0 18 000 BP).",
      examples: [
        "Vegeta Saga Saiyans (18 000)",
        "Goku Kaio-ken x3/x4 (24 000 - 32 000)",
        "Kiwi (18 000)",
        "Nail (42 000)"
      ]
    },
    {
      tierNumber: 4,
      name: "Stellaire & Empereur Galactique",
      description: "Destruction sans effort de plan\xE8tes massives (Plan\xE8te Vegeta, Namek) et r\xE9sistance dans le vide spatial.",
      examples: [
        "Freezer Forme 1 (530 000)",
        "Capitaine Ginyu (120 000)",
        "Freezer 100% (120 000 000)",
        "Goku SSJ1 (150 000 000)"
      ]
    },
    {
      tierNumber: 5,
      name: "Cosmique / Majin, Dieux & Au-del\xE0",
      description: "D\xE9passement du bar\xE8me scouter chiffr\xE9. \xC9chelle en Kiri (Yakon 800, Goku SSJ2 3000), menace sur le Macrocosme entier.",
      examples: ["Gohan SSJ2", "Goku SSJ3", "Super Buu / Kid Buu", "Vegetto", "Beerus", "Whis"]
    }
  ]
};
var DEFAULT_CANON_HEURISTICS = [
  {
    id: "manga-original",
    label: "Renvoi au manga original",
    tier: "CANON_ABSOLU",
    score: 100,
    keywords: [
      "manga original",
      "chapitre",
      "tome 1",
      "tome 42",
      "42 tomes",
      "akira toriyama a dessine"
    ],
    verdict: "Fortement pr\xE9sum\xE9 100% Canon absolu.",
    explanation: "Les \xE9l\xE9ments issus directement des 42 volumes du manga original ou des \xE9crits autographes de Toriyama constituent le c\u0153ur intouchable du canon Dragon Ball.",
    sources: ["Manga Dragon Ball (Tomes 1 \xE0 42)", "Bird Studio / Shueisha"]
  },
  {
    id: "production-toei",
    label: "Renvoi \xE0 la production anim\xE9e",
    tier: "NON_CANON_DERIVE",
    score: 20,
    keywords: ["filler", "hors-serie", "hors serie", "oav", "episode inedit", "toei"],
    verdict: "\xC9l\xE9ment d\xE9riv\xE9 produit pour l'animation sans \xE9criture de Toriyama.",
    explanation: "Ces segments appartiennent \xE0 la continuit\xE9 anim\xE9e Toei Animation et ne sont pas inclus dans l'univers canonique r\xE9dig\xE9 par Akira Toriyama.",
    sources: ["Archives Toei Animation", "Daizenshuu 6"]
  },
  {
    id: "jeux-video",
    label: "Renvoi aux jeux vid\xE9o",
    tier: "NON_CANON_DERIVE",
    score: 15,
    keywords: ["jeu video", "xenoverse", "kakarot", "budokai", "fighterz", "sdbh", "heroes"],
    verdict: "Contenu de jeu vid\xE9o : hors de la continuit\xE9 \xE9crite par Toriyama.",
    explanation: "Les jeux inventent librement personnages, transformations et sc\xE9narios alternatifs. Ils sont officiels commercialement, jamais canoniques narrativement, sauf reprise explicite dans le manga.",
    sources: ["Catalogues \xE9diteurs", "Daizenshuu 7 (Jeux)"]
  },
  {
    id: "supervision-officielle",
    label: "Renvoi aux guides et interviews officielles",
    tier: "EXTENSION_OFFICIELLE",
    score: 85,
    keywords: [
      "daizenshuu",
      "chozenshu",
      "super exciting guide",
      "seg",
      "interview toriyama",
      "entretien toriyama",
      "v-jump",
      "saikyo jump",
      "guide officiel"
    ],
    verdict: "Information issue des guides officiels ou d\xE9clarations de l'auteur.",
    explanation: "Les guides publi\xE9s par Shueisha (Daizenshuu, SEG, Ch\u014Dzensh\u016B) et les entretiens avec Akira Toriyama apportent des pr\xE9cisions et des \xE9clairages canoniques de premier ordre valid\xE9s par l'auteur.",
    sources: [
      "Daizenshuu 1-7",
      "Super Exciting Guide",
      "Ch\u014Dzensh\u016B 1-4",
      "Archives V-Jump & Saiky\u014D Jump"
    ]
  },
  {
    id: "fanon-general",
    label: "Cr\xE9ation de fans ou \u0153uvre non officielle",
    tier: "APOCRYPHE_FANON",
    score: 0,
    keywords: [
      "fan manga",
      "fan-manga",
      "fan animation",
      "fan-animation",
      "fan art",
      "dessin de fan",
      "doujin",
      "doujinshi",
      "non officiel",
      "oeuvre de fan"
    ],
    verdict: "Cr\xE9ation issue de la communaut\xE9 de fans, sans aucun lien officiel.",
    explanation: "Bien que le talent cr\xE9atif des fans soit immense, ces r\xE9cits et designs ne font l'objet d'aucune licence ni validation de Bird Studio ou Shueisha. Ils sont class\xE9s comme cr\xE9ations de fans (fanon).",
    sources: ["Doctrine de canonicit\xE9 Shenron"]
  },
  {
    id: "rumeur",
    label: "Rumeur ou fausse citation",
    tier: "APOCRYPHE_FANON",
    score: 0,
    keywords: ["rumeur", "fausse interview", "leak", "fan fiction", "fanfiction", "doujinshi"],
    verdict: "Aucune existence officielle : rumeur ou cr\xE9ation de fans.",
    explanation: "Une affirmation sans support imprim\xE9, sans interview dat\xE9e et sans source \xE9diteur ne vaut rien face au manga. Elle n'est citable que pour expliquer d'o\xF9 vient la rumeur.",
    sources: ["Manga Dragon Ball", "Daizenshuu 1-7"]
  }
];
var DEFAULT_CANON_DOCTRINE = [
  "Source de v\xE9rit\xE9 supr\xEAme : le manga original en 42 tomes d'Akira Toriyama.",
  "Validit\xE9 secondaire : r\xE9v\xE9lations SEG / Daizenshuu et scripts originaux (Broly, Super Hero, Daima).",
  "R\xE8gle de s\xE9paration : les fillers et les films Toei des ann\xE9es 90 sont des dimensions alternatives.",
  "En cas de contradiction entre deux sources, la plus proche de la main de Toriyama l'emporte.",
  "Une affirmation sans source imprim\xE9e n'est pas fausse : elle est non \xE9tablie. On le dit plut\xF4t que de trancher."
];
var DEFAULT_CANON_CONFIG = {
  version: 1,
  intro: "Pose une question de canonicit\xE9 : le verdict vient d'une table cur\xE9e \xE0 la main, adoss\xE9e au manga, aux databooks et aux d\xE9clarations d'Akira Toriyama. Aucun wiki de fans, aucune g\xE9n\xE9ration automatique.",
  placeholder: "Broly est-il canonique ?",
  doctrine: DEFAULT_CANON_DOCTRINE,
  sourcesAdmises: [
    "Manga Dragon Ball, tomes 1 \xE0 42 (\xE9dition japonaise et traduction officielle)",
    "Dragon Ball Super (manga) et Dragon Ball Minus / Jaco",
    "Daizenshuu 1 \xE0 7, Ch\u014Dzensh\u016B, Super Exciting Guide et guides Shueisha",
    "Interviews et Q&A sign\xE9s d'Akira Toriyama (V-Jump, Saiky\u014D Jump, Dragon Box)",
    "Catalogues des \xE9diteurs, AniList et Jikan pour les m\xE9tadonn\xE9es de sortie"
  ],
  sourcesInterdites: [
    "Wikis de fans (Fandom, miroirs et copies)",
    "Forums, r\xE9seaux sociaux et \xAB leaks \xBB non sourc\xE9s",
    "Fausses interviews et citations non dat\xE9es",
    "R\xE9ponses g\xE9n\xE9r\xE9es par un mod\xE8le de langage sans source imprim\xE9e"
  ],
  tiers: DEFAULT_CANON_TIERS,
  entries: CANON_DATABASE,
  heuristics: DEFAULT_CANON_HEURISTICS,
  references: [],
  powerScaling: DEFAULT_POWER_SCALING_CONFIG,
  fallback: {
    tier: "EXTENSION_OFFICIELLE",
    score: 50,
    verdict: "Affirmation n\xE9cessitant une v\xE9rification crois\xE9e dans les archives.",
    explanation: "Le sujet saisi ne correspond \xE0 aucun point de divergence r\xE9pertori\xE9. Dans la doctrine Shenron, une affirmation sans source manga, databook v\xE9rifi\xE9 ou d\xE9claration sign\xE9e de Toriyama est consid\xE9r\xE9e comme non \xE9tablie.",
    sources: ["Manga Dragon Ball", "Daizenshuu 1-7", "Super Exciting Guide"]
  },
  vide: {
    verdict: "Saisis un texte, un personnage, un film ou une affirmation.",
    explanation: "Le moteur analysera sa canonicit\xE9 selon les r\xE8gles du manga, des databooks et des d\xE9clarations de l'auteur \u2014 telles qu'elles sont \xE9crites dans les param\xE8tres du site."
  }
};
function normaliser(texte) {
  if (!/[^\p{ASCII}]/u.test(texte)) {
    return texte.toLowerCase();
  }
  return texte.normalize("NFKC").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").normalize("NFC");
}
var CARACTERE_DE_MOT = /[\p{L}\p{N}]/u;
var CJK = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u;
function contientMotCle(texte, motCle) {
  const cle = normaliser(motCle).trim();
  if (!cle)
    return false;
  const isCjk = CJK.test(cle);
  for (let i = texte.indexOf(cle);i !== -1; i = texte.indexOf(cle, i + 1)) {
    if (isCjk)
      return true;
    const avant = texte[i - 1];
    if (avant !== undefined && CARACTERE_DE_MOT.test(avant) && !CJK.test(avant))
      continue;
    let fin = i + cle.length;
    if (texte[fin] === "s")
      fin++;
    const apres = texte[fin];
    if (apres !== undefined && CARACTERE_DE_MOT.test(apres) && !CJK.test(apres))
      continue;
    return true;
  }
  return false;
}
var FREQUENCES = new WeakMap;
function frequenceMotsCles(references) {
  const connue = FREQUENCES.get(references);
  if (connue)
    return connue;
  const frequence = new Map;
  for (const r of references) {
    for (const kw of new Set(r.keywords.map((k) => normaliser(k)))) {
      frequence.set(kw, (frequence.get(kw) ?? 0) + 1);
    }
  }
  FREQUENCES.set(references, frequence);
  return frequence;
}
function referencesPour(texteNormalise, config, motsDuSujet = [], maximum = 3) {
  if (config.references.length === 0)
    return [];
  const sujet = new Set(motsDuSujet.map((m) => normaliser(m)));
  const frequence = frequenceMotsCles(config.references);
  const notes = [];
  for (const reference of config.references) {
    if (reference.visible === false)
      continue;
    let poids = 0;
    let motSolide = false;
    for (const kw of reference.keywords) {
      if (!contientMotCle(texteNormalise, kw))
        continue;
      const rarete = 1 / Math.log2(2 + (frequence.get(normaliser(kw)) ?? 1));
      poids += kw.length * rarete;
      if (kw.length > 3)
        motSolide = true;
      if (sujet.has(normaliser(kw)))
        poids += kw.length;
    }
    if (poids > 0 && motSolide)
      notes.push({ reference, poids });
  }
  const sujetsVus = new Set;
  const retenues = [];
  for (const { reference } of notes.toSorted((a, b) => b.poids - a.poids || a.reference.text.length - b.reference.text.length)) {
    const cle = normaliser(reference.subject);
    if (cle && sujetsVus.has(cle))
      continue;
    sujetsVus.add(cle);
    retenues.push(reference);
    if (retenues.length >= maximum)
      break;
  }
  return retenues;
}
function rangConfig(config, tier) {
  return config.tiers.find((t) => t.id === tier) ?? DEFAULT_CANON_TIERS.find((t) => t.id === tier) ?? DEFAULT_CANON_TIERS[0];
}
var HORS_UNIVERS = /\b(superman|batman|thanos|hulk|marvel|dc comics|saitama|one punch|naruto|sasuke|luffy|one piece|ichigo|bleach|jotaro|jojo|sonic|mario|pikachu|pokemon|kirby|shrek|chuck norris|jesus|kratos|sung jin[- ]?woo|solo leveling|madara|aizen|gojo|sukuna|saiki|anos|rimuru|zeno[- ]?sama vs)\b/;
var FORMES_INVENTEES = /\b(super saiya(?:n|jin)?|ssj|ssgss|ss)\s*(?:niveau\s*)?(?:[6-9]|[1-9]\d+|infini|infinity|omega|rainbow|arc[- ]?en[- ]?ciel|noir|black rose|god of god)\b|\bunivers\s*(?:1[3-9]|[2-9]\d)\b|\bultra ego instinct\b|\bgoku (?:solo|solos)\b|\bsolo (?:l'|le |la )?(?:univers|multivers|verse)\b/;
var INSULTES = /\b(fdp|ntm|nique|niquer|enculer?|encule|pd|batard|connard|connasse|salope|pute|merde|chier|bite|couilles|caca|pipi|prout|zizi|t'?es nul|site de merde|ta gueule|tg|fuck|shit|bitch|dick|penis|sex|sexe|porn|porno|hentai|nude|nu[e]?s? de|baiser)\b/;
var HORS_SUJET = /\b(macron|trump|poutine|election|politique|meteo|m\u00E9t\u00E9o|recette|bitcoin|crypto|capitale de|equation|\u00E9quation|devoir de maths|chatgpt|openai|claude|gemini|ia generative)\b/;
function detecterTroll(texteNormalise) {
  const t = ` ${texteNormalise.replace(/[^\p{L}\p{N}' ]+/gu, " ").replace(/\s+/g, " ").trim()} `;
  if (INSULTES.test(t))
    return "vulgarite";
  if (HORS_UNIVERS.test(t))
    return "crossover";
  if (FORMES_INVENTEES.test(t))
    return "invention";
  if (HORS_SUJET.test(t))
    return "hors-sujet";
  const mots = t.trim().split(" ");
  const charabia = mots.filter((m) => m.length >= 7 && !CJK.test(m) && !/[aeiouy]/.test(m) && !/\d/.test(m));
  if (mots.length > 0 && charabia.length >= Math.max(1, Math.ceil(mots.length / 2)))
    return "charabia";
  if (/(.)\1{5,}/.test(t))
    return "charabia";
  return null;
}
var MARQUEURS_QUESTION = /\b(qui est|qui a|qui sont|quel(?:le|s|les)? (?:est|sont|age|\u00E2ge)|c'?est quoi|qu'?est[- ]ce|pourquoi|comment|combien|quand|ou est|o\u00F9 est|peut[- ]il|peut[- ]elle|peuvent|bat(?:trait)?|vs|contre|plus fort|plus puissant|le plus|la plus|gagne(?:rait)?|est[- ]il|est[- ]elle|sont[- ]ils|sont[- ]elles|a[- ]t[- ]il|a[- ]t[- ]elle)\b/;
function ressembleAUneQuestion(texteNormalise) {
  return /[?\uFF1F]+[\s.!]*$/.test(texteNormalise.trim()) || MARQUEURS_QUESTION.test(` ${texteNormalise} `);
}
function suggestionsPour(texteNormalise, config, exclure = null, maximum = 4) {
  const mots = new Set(texteNormalise.split(/[^\p{L}\p{N}]+/u).filter((m) => m.length > 2 && !MOTS_VIDES.has(m)));
  const notes = [];
  for (const entree of config.entries) {
    if (entree.id === exclure)
      continue;
    let poids = 0;
    for (const kw of entree.keywords) {
      const cle = normaliser(kw);
      if (contientMotCle(texteNormalise, kw))
        poids += kw.length;
      else if (mots.has(cle))
        poids += 2;
    }
    for (const m of mots)
      if (contientMotCle(normaliser(entree.title), m))
        poids += m.length;
    if (poids > 0)
      notes.push({ titre: entree.title, poids });
  }
  if (notes.length === 0 && exclure) {
    const categorie = config.entries.find((e) => e.id === exclure)?.category;
    return config.entries.filter((e) => e.id !== exclure && e.category === categorie).slice(0, maximum).map((e) => e.title);
  }
  return notes.toSorted((a, b) => b.poids - a.poids).slice(0, maximum).map((n) => n.titre);
}
var MOTS_VIDES = new Set([
  "est",
  "les",
  "des",
  "une",
  "que",
  "qui",
  "dans",
  "pour",
  "pas",
  "sur",
  "avec",
  "son",
  "ses",
  "the",
  "and",
  "canon",
  "canonique",
  "vrai",
  "faux",
  "officiel",
  "dragon",
  "ball"
]);
var TROLL_EXPLICATIONS = {
  vulgarite: "La question contient des termes qui ne figurent dans aucun manga, databook ni d\xE9claration d'auteur. L'arbitre ne tranche que ce que les sources contiennent.",
  crossover: "Aucune source officielle ne met Dragon Ball face \xE0 une autre franchise. Un combat entre deux \u0153uvres n'a ni vainqueur ni rang de canonicit\xE9 : il n'existe pas.",
  invention: "Cette forme, ce niveau ou cet univers n'appara\xEEt dans aucun manga, film, databook ni d\xE9claration d'Akira Toriyama. Ce qui n'est imprim\xE9 nulle part n'a pas de rang : c'est une invention.",
  "hors-sujet": "La question ne porte pas sur Dragon Ball. L'arbitre lit le manga, les databooks et les mots de l'auteur, rien d'autre.",
  charabia: "Le texte saisi ne forme pas une question lisible."
};
function analyzeCanon(input, rawConfig = DEFAULT_CANON_CONFIG) {
  const config = {
    ...DEFAULT_CANON_CONFIG,
    ...rawConfig,
    entries: Array.isArray(rawConfig?.entries) ? rawConfig.entries : DEFAULT_CANON_CONFIG.entries,
    doctrine: Array.isArray(rawConfig?.doctrine) ? rawConfig.doctrine : DEFAULT_CANON_CONFIG.doctrine,
    tiers: rawConfig?.tiers ?? DEFAULT_CANON_CONFIG.tiers,
    vide: rawConfig?.vide ?? DEFAULT_CANON_CONFIG.vide
  };
  const texte = normaliser(input.trim());
  if (!texte) {
    return {
      tier: "CANON_ABSOLU",
      tierLabel: "En attente d'analyse",
      score: 0,
      color: "#9ca3af",
      verdict: config.vide.verdict,
      explanation: config.vide.explanation,
      sources: [],
      matchedKeywords: [],
      origine: "empty",
      nature: "empty",
      suggestions: []
    };
  }
  const troll = detecterTroll(texte);
  if (troll) {
    const rang = rangConfig(config, "APOCRYPHE_FANON");
    return {
      tier: "APOCRYPHE_FANON",
      tierLabel: troll === "charabia" ? "Illisible" : "Hors des sources",
      score: 0,
      color: rang.couleur,
      verdict: troll === "charabia" ? "Rien \xE0 trancher : la question n'est pas lisible." : "Aucune source ne contient cela. Pas de rang, pas de verdict.",
      explanation: TROLL_EXPLICATIONS[troll] ?? TROLL_EXPLICATIONS["hors-sujet"],
      sources: [],
      matchedKeywords: [],
      doctrineRules: config.doctrine,
      tierDefinition: rang.definition,
      origine: `troll:${troll}`,
      nature: "troll",
      suggestions: suggestionsPour(texte, config, null, 4),
      references: []
    };
  }
  let meilleure = null;
  let meilleurScore = 0;
  let motsTrouves = [];
  for (const entree of config.entries) {
    let score = 0;
    const mots = [];
    for (const kw of entree.keywords) {
      if (contientMotCle(texte, kw)) {
        score += kw.length * 2;
        mots.push(kw);
      }
    }
    if (entree.title && contientMotCle(texte, entree.title)) {
      score += normaliser(entree.title) === texte ? 50 : Math.min(50, entree.title.length * 2);
    }
    if (score > meilleurScore) {
      meilleurScore = score;
      meilleure = entree;
      motsTrouves = mots;
    }
  }
  if (meilleure) {
    const rang = rangConfig(config, meilleure.tier);
    return {
      tier: meilleure.tier,
      tierLabel: rang.label,
      score: meilleure.score,
      color: rang.couleur,
      verdict: meilleure.verdict,
      explanation: meilleure.explanation,
      toriyamaQuote: meilleure.toriyamaQuote,
      sources: meilleure.sources,
      matchedKeywords: [...new Set(motsTrouves)],
      doctrineRules: config.doctrine,
      tierDefinition: rang.definition,
      origine: `entry:${meilleure.id}`,
      nature: "verdict",
      suggestions: suggestionsPour(texte, config, meilleure.id, 3),
      references: referencesPour(texte, config, meilleure.keywords)
    };
  }
  let meilleureRegle = null;
  let meilleurScoreRegle = 0;
  let motsRegle = [];
  for (const regle of config.heuristics) {
    let score = 0;
    const mots = [];
    for (const kw of regle.keywords) {
      if (!contientMotCle(texte, kw))
        continue;
      score += kw.length;
      mots.push(kw);
    }
    if (score > meilleurScoreRegle) {
      meilleurScoreRegle = score;
      meilleureRegle = regle;
      motsRegle = mots;
    }
  }
  if (meilleureRegle) {
    const rang = rangConfig(config, meilleureRegle.tier);
    return {
      tier: meilleureRegle.tier,
      tierLabel: rang.label,
      score: meilleureRegle.score,
      color: rang.couleur,
      verdict: meilleureRegle.verdict,
      explanation: meilleureRegle.explanation,
      sources: meilleureRegle.sources,
      matchedKeywords: [...new Set(motsRegle)],
      doctrineRules: config.doctrine,
      tierDefinition: rang.definition,
      origine: `heuristic:${meilleureRegle.id}`,
      nature: "verdict",
      suggestions: suggestionsPour(texte, config, null, 3),
      references: referencesPour(texte, config, motsRegle)
    };
  }
  const rang = rangConfig(config, config.fallback.tier);
  const question = ressembleAUneQuestion(texte);
  return {
    tier: config.fallback.tier,
    tierLabel: question ? "Question ouverte" : "\xC0 v\xE9rifier dans le corpus",
    score: config.fallback.score,
    color: rang.couleur,
    verdict: question ? "La doctrine n'a pas tranch\xE9 ce point. Voici ce que les sources en disent." : config.fallback.verdict,
    explanation: question ? "Aucun sujet tranch\xE9 ne couvre cette question. Les planches de databooks, les fiches du wiki et les d\xE9clarations d'auteur ci-dessous sont ce que le corpus contient sur ce sujet ; rien n'y est ajout\xE9." : config.fallback.explanation,
    sources: config.fallback.sources,
    matchedKeywords: [],
    doctrineRules: config.doctrine,
    tierDefinition: rang.definition,
    origine: "fallback",
    nature: question ? "question" : "verdict",
    suggestions: suggestionsPour(texte, config, null, 4),
    references: referencesPour(texte, config)
  };
}
var CATEGORIES = new Set([
  "character",
  "form",
  "lore",
  "work",
  "myth"
]);

// scripts/plugin/src/canon.ts
var INSTANTANE = typeof { revision: "b8cef86", date: "2026-10-05", source: "apps/site/src/lib/canon-engine.ts" } === "undefined" ? { revision: "d\xE9p\xF4t", date: "courante", source: "apps/site/src/lib/canon-engine.ts" } : { revision: "b8cef86", date: "2026-10-05", source: "apps/site/src/lib/canon-engine.ts" };
var SITE = "https://dragonballfr.com";
function statut(v) {
  const o = v.origine;
  if (o.startsWith("entry:"))
    return "\xE9tabli (instantan\xE9)";
  if (o.startsWith("heuristic:"))
    return "non \xE9tabli (rang pr\xE9sum\xE9 par une famille de formulations)";
  if (o.startsWith("troll"))
    return "hors des sources";
  if (o === "empty")
    return "aucune question";
  return "non \xE9tabli";
}
function reponseApi(question) {
  const q = question.trim().slice(0, 400);
  const v = analyzeCanon(q, DEFAULT_CANON_CONFIG);
  return {
    question: q,
    verdict: {
      tier: v.tier,
      tierLabel: v.tierLabel,
      tierDefinition: v.tierDefinition ?? null,
      score: v.score,
      color: v.color,
      verdict: v.verdict,
      explanation: v.explanation,
      toriyamaQuote: v.toriyamaQuote ?? null,
      sources: v.sources,
      matchedKeywords: v.matchedKeywords,
      doctrine: v.doctrineRules ?? [],
      origine: v.origine,
      nature: v.nature,
      suggestions: v.suggestions
    },
    references: (v.references ?? []).map((r) => ({
      id: r.id,
      subject: r.subject,
      text: r.text,
      textFr: r.textFr ?? null,
      source: r.source,
      year: r.year ?? null,
      lang: r.lang,
      provenance: r.provenance,
      href: r.href ?? null
    })),
    planches: [],
    fiches: [],
    suggestions: v.suggestions.map((titre) => ({
      titre,
      href: `/wiki/canon?q=${encodeURIComponent(titre)}`
    })),
    mode: null,
    statut: statut(v),
    instantane: { ...INSTANTANE, hors_ligne: true }
  };
}
function doctrineApi() {
  const c = DEFAULT_CANON_CONFIG;
  return {
    intro: c.intro,
    tiers: c.tiers,
    doctrine: c.doctrine,
    sourcesAdmises: c.sourcesAdmises,
    sourcesInterdites: c.sourcesInterdites,
    entries: c.entries.map((e) => ({
      id: e.id,
      title: e.title,
      category: e.category,
      tier: e.tier,
      score: e.score,
      verdict: e.verdict
    })),
    heuristics: c.heuristics.map((h) => ({ id: h.id, label: h.label, tier: h.tier })),
    stats: { references: 0, parProvenance: {} },
    instantane: { ...INSTANTANE, hors_ligne: true }
  };
}
function lisible(question) {
  const r = reponseApi(question);
  const v = r.verdict;
  const tranche = v.origine.startsWith("entry:") || v.origine.startsWith("heuristic:");
  const lignes = [
    `Question : ${r.question}`,
    `Statut : ${r.statut} \u2014 doctrine du d\xE9p\xF4t, r\xE9vision ${INSTANTANE.revision} (${INSTANTANE.date})`,
    tranche ? `Rang : ${v.tier} \u2014 ${v.tierLabel}` : `Rang : aucun rang \xE9tabli (${v.tierLabel} ; valeur de repli de l'API : ${v.tier})`,
    tranche ? `Score : ${v.score} (autorit\xE9 du rang ou du sujet, pas une probabilit\xE9)` : `Score : ${v.score} (repli, ne fonde rien)`,
    `Origine : ${v.origine} (nature : ${v.nature})`,
    `Verdict : ${v.verdict}`,
    `Explication : ${v.explanation}`
  ];
  if (v.toriyamaQuote) {
    const q = v.toriyamaQuote;
    lignes.push(`Citation d'auteur : \xAB ${q.text} \xBB \u2014 ${q.source}${q.year ? ` (${q.year})` : ""}`);
  }
  if (v.sources.length)
    lignes.push("Sources :", ...v.sources.map((s) => `  - ${s}`));
  if (v.matchedKeywords.length)
    lignes.push(`Mots-cl\xE9s reconnus : ${v.matchedKeywords.join(", ")}`);
  if (v.tierDefinition)
    lignes.push(`D\xE9finition du rang : ${v.tierDefinition}`);
  if (r.suggestions.length) {
    lignes.push("Sujets voisins :", ...r.suggestions.map((s) => `  - ${s.titre}`));
  }
  lignes.push("R\xE9f\xE9rences du corpus, planches et fiches : non embarqu\xE9es (base du site).", `En ligne, si joignable : ${SITE}/api/canon?q=${encodeURIComponent(r.question)}`);
  return lignes.join(`
`);
}
function main(args) {
  const json = args.includes("--json");
  const reste = args.filter((a) => a !== "--json");
  if (reste[0] === "--doctrine") {
    console.log(JSON.stringify(doctrineApi(), null, 2));
    return 0;
  }
  if (reste[0] === "--liste") {
    for (const t of CANON_TIERS) {
      for (const e of DEFAULT_CANON_CONFIG.entries.filter((x) => x.tier === t)) {
        console.log(`${e.id}	${e.tier}	${e.score}	${e.title}`);
      }
    }
    return 0;
  }
  if (reste[0] === "--entree") {
    const e = DEFAULT_CANON_CONFIG.entries.find((x) => x.id === reste[1]);
    if (!e) {
      console.error(`entr\xE9e inconnue : ${reste[1] ?? "(vide)"} \u2014 voir --liste`);
      return 1;
    }
    console.log(JSON.stringify({ ...e, instantane: INSTANTANE }, null, 2));
    return 0;
  }
  const question = reste.join(" ").trim();
  if (!question) {
    console.error('usage : bun canon.js [--json] "question" | --doctrine | --liste | --entree <id>');
    return 1;
  }
  console.log(json ? JSON.stringify(reponseApi(question), null, 2) : lisible(question));
  return 0;
}
if (import.meta.main)
  process.exit(main(Bun.argv.slice(2)));
export {
  CANON_TIERS,
  DEFAULT_CANON_CONFIG,
  analyzeCanon,
  doctrineApi,
  reponseApi,
  statut
};
