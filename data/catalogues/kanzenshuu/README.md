# Kanzenshuu — inventaire éditorial

Sources principales :

- `../kanzenshuu-translations-index.json` : 293 entrées de l’archive publique des traductions, inventoriées sans ouvrir les forums.
- `../kanzenshuu-interviews.json` : fiches structurées des entrées dont le format est explicitement `Interview` dans l’archive.
- `interviews/*.json` : mêmes fiches réparties par décennie de publication, pour la revue et l’import éditorial.
- `interview-summaries/years/YYYY.json` : synthèses françaises des interviews, consolidées et triées par année de publication; les années vérifiées sans entretien possèdent un tableau `records` vide.
- `data/source-acquisition/kanzenshuu/interviews/` : pages sources HTML privées, ignorées par Git. Ne pas publier ni incorporer ces fichiers aux artefacts publics.

## État de la collecte des interviews

Au 7 octobre 2026, l’archive liste 109 entrées au format `Interview`. 108 pages Kanzenshuu ont été acquises. La page `the-case-of-being-reincarnated-as-yamcha-buzzfeed-japan-interview` renvoie HTTP 404; son interview a toutefois été retrouvée sur l'article original japonais de BuzzFeed et résumée depuis cette source primaire. L’index continue d’indiquer que la page Kanzenshuu est indisponible.

Les fiches conservent les informations bibliographiques fournies par l’archive : titre, publication, date, participants, thèmes et liens. Elles incluent le titre de page, sa description, les intertitres détectés et le nombre d’éléments de question repérés dans le HTML. 96 pages comportent des éléments de question détectables (1 184 au total). Les pages sans balisage de questions ne sont pas considérées vides : certaines sont des entretiens vidéo, des échanges narratifs ou des pages au balisage différent.

## Couverture et revue

Les 109 entrées explicitement classées `Interview` dans l'archive Kanzenshuu ont désormais une synthèse française dans `interview-summaries/years/`, une par identifiant et rangée selon l'année de publication. Le contrôle croisé confirme 109/109 IDs indexés, sans ajout ni doublon; les 108 pages Kanzenshuu acquises sont conservées dans le dossier privé et ignoré par Git. L'entrée Yamcha dont la page Kanzenshuu renvoie HTTP 404 est résumée depuis l'article original japonais de BuzzFeed, sans attribuer les propos de l'éditeur à Toriyama. Aucune page ni conversation de forum n'a été utilisée.

Les synthèses couvrent les auteurs, dessinateurs, animateurs, réalisateurs, producteurs, éditeurs, comédiens, musiciens et autres intervenants, y compris les entretiens de pertinence Dragon Ball indirecte; ces distinctions sont indiquées dans les fiches. Les transcriptions suivent parfois un format narratif, incluent des panneaux de manga, ou ont un nombre de blocs question/réponse différent des métadonnées Kanzenshuu. Ces cas sont annotés dans `source.formatNote`; l'audit des 108 pages locales n'a laissé aucun écart de balisage non signalé. Un désaccord de date dans l'index pour l'entretien V-Jump de Toyotarō a été corrigé d'après l'en-tête de la source, qui indique le 21 décembre 2020 pour le numéro de février 2021.

Les synthèses sont des résumés originaux, non des reproductions des traductions intégrales; l'accès public à une traduction Kanzenshuu ne prouve pas un droit de republication. Les références imprimées restent à collationner directement sur les exemplaires originaux. Le contenu de la base de production et `/wiki/interviews` n'a pas été modifié; le rapprochement avec les fiches déjà publiées sur le wiki et leur intégration éditoriale restent à faire. Cette étape couvre le catalogue des interviews, pas l'ensemble des guides, critiques, actualités, traductions et autres contenus du site Kanzenshuu.

L'accès public à une traduction Kanzenshuu ne prouve pas un droit de republication. Les transcriptions intégrales restent dans l'espace privé ignoré par Git; le catalogue destiné à la suite éditoriale conserve des métadonnées et des synthèses originales. Le contenu de forum est hors périmètre. La base de production et `/wiki/interviews` ne sont pas modifiés par cette collecte préparatoire.
