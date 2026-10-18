-- Ajout de crédits d'animation et de rôles clés pour les nouveaux contributeurs
BEGIN;

-- toyoo-ashida (id from slug)
INSERT INTO bot.contributor_credits (contributor_id, role, credit_scope, visible)
SELECT id, 'Directeur de l''animation — TV Special Bardock', 'Film & Spécial TV', true
FROM bot.contributors WHERE slug = 'toyoo-ashida';

-- keisuke-masunaga
INSERT INTO bot.contributor_credits (contributor_id, role, credit_scope, visible)
SELECT id, 'Superviseur de l''animation — Gohan SSJ2 vs Cell (DBZ 184, 185)', 'Anime DBZ', true
FROM bot.contributors WHERE slug = 'keisuke-masunaga';

-- kazuya-hisada
INSERT INTO bot.contributor_credits (contributor_id, role, credit_scope, visible)
SELECT id, 'Character Designer & Directeur de l''animation général', 'Dragon Ball GT', true
FROM bot.contributors WHERE slug = 'kazuya-hisada';

-- naoki-miyahara
INSERT INTO bot.contributor_credits (contributor_id, role, credit_scope, visible)
SELECT id, 'Réalisateur & Directeur de la séquence 3D', 'Films & OAV', true
FROM bot.contributors WHERE slug = 'naoki-miyahara';

-- toshiyuki-sugano
INSERT INTO bot.contributor_credits (contributor_id, role, credit_scope, visible)
SELECT id, 'Animateur Clé — Climax Fusion et L''Attaque du Dragon', 'Films DBZ', true
FROM bot.contributors WHERE slug = 'toshiyuki-sugano';

-- yukio-ebisawa
INSERT INTO bot.contributor_credits (contributor_id, role, credit_scope, visible)
SELECT id, 'Directeur de l''animation sur plus de 50 épisodes (Studio Live)', 'Anime DB & DBZ', true
FROM bot.contributors WHERE slug = 'yukio-ebisawa';

-- takeo-ide
INSERT INTO bot.contributor_credits (contributor_id, role, credit_scope, visible)
SELECT id, 'Directeur de l''animation — Sagas Namek, Cyborgs et Buu', 'Anime DBZ', true
FROM bot.contributors WHERE slug = 'takeo-ide';

-- tatsuya-nagamine
INSERT INTO bot.contributor_credits (contributor_id, role, credit_scope, visible)
SELECT id, 'Réalisateur en chef — Dragon Ball Super: Broly (2018)', 'Film Cinéma', true
FROM bot.contributors WHERE slug = 'tatsuya-nagamine';

-- megumi-ishitani
INSERT INTO bot.contributor_credits (contributor_id, role, credit_scope, visible)
SELECT id, 'Réalisatrice — Climax du Tournoi du Pouvoir (DBS 131)', 'Anime DBS', true
FROM bot.contributors WHERE slug = 'megumi-ishitani';

-- mitsuo-hashimoto
INSERT INTO bot.contributor_credits (contributor_id, role, credit_scope, visible)
SELECT id, 'Réalisateur — Le Robot des Glaces, La Menace de Namek, Cooler 2', 'Films DBZ', true
FROM bot.contributors WHERE slug = 'mitsuo-hashimoto';

-- yoshihiro-ueda
INSERT INTO bot.contributor_credits (contributor_id, role, credit_scope, visible)
SELECT id, 'Réalisateur — Rivaux Dangereux, Cent Mille Guerriers, Hirudegarn', 'Films DBZ', true
FROM bot.contributors WHERE slug = 'yoshihiro-ueda';

-- hiroshi-toda
INSERT INTO bot.contributor_credits (contributor_id, role, credit_scope, visible)
SELECT id, 'Scénariste — Sagas Saiyans et Entraînement Kaio', 'Anime DBZ', true
FROM bot.contributors WHERE slug = 'hiroshi-toda';

-- keiji-terui
INSERT INTO bot.contributor_credits (contributor_id, role, credit_scope, visible)
SELECT id, 'Scénariste — Quête des Dragon Balls et Tournois d''arts martiaux', 'Anime DB', true
FROM bot.contributors WHERE slug = 'keiji-terui';

-- kenji-yamamoto
INSERT INTO bot.contributor_credits (contributor_id, role, credit_scope, visible)
SELECT id, 'Compositeur des bandes-son Super Butōden et Budokai', 'Jeux Vidéo', true
FROM bot.contributors WHERE slug = 'kenji-yamamoto';

-- takeshi-ike
INSERT INTO bot.contributor_credits (contributor_id, role, credit_scope, visible)
SELECT id, 'Compositeur — Makafushigi Adventure! et Romantic Ageru yo', 'Musique & Génériques', true
FROM bot.contributors WHERE slug = 'takeshi-ike';

-- chiho-kiyooka
INSERT INTO bot.contributor_credits (contributor_id, role, credit_scope, visible)
SELECT id, 'Compositrice — Cha-La Head-Cha-La et We Gotta Power', 'Musique & Génériques', true
FROM bot.contributors WHERE slug = 'chiho-kiyooka';

-- ushio-hashimoto
INSERT INTO bot.contributor_credits (contributor_id, role, credit_scope, visible)
SELECT id, 'Interprète — Romantic Ageru yo (Ending Dragon Ball)', 'Musique & Génériques', true
FROM bot.contributors WHERE slug = 'ushio-hashimoto';

-- tetsuro-oda
INSERT INTO bot.contributor_credits (contributor_id, role, credit_scope, visible)
SELECT id, 'Compositeur — Dan Dan Kokoro Hikareteku (Opening Dragon Ball GT)', 'Musique & Génériques', true
FROM bot.contributors WHERE slug = 'tetsuro-oda';

-- zedd
INSERT INTO bot.contributor_credits (contributor_id, role, credit_scope, visible)
SELECT id, 'Compositeur & Producteur — Jaka Jaan (Opening Dragon Ball Daima)', 'Musique & Génériques', true
FROM bot.contributors WHERE slug = 'zedd';

-- hiroshi-matsuyama
INSERT INTO bot.contributor_credits (contributor_id, role, credit_scope, visible)
SELECT id, 'Président CyberConnect2 — Réalisation de Dragon Ball Z: Kakarot', 'Jeux Vidéo', true
FROM bot.contributors WHERE slug = 'hiroshi-matsuyama';

-- tomoko-hiroki
INSERT INTO bot.contributor_credits (contributor_id, role, credit_scope, visible)
SELECT id, 'Productrice Bandai Namco — Dragon Ball FighterZ', 'Jeux Vidéo', true
FROM bot.contributors WHERE slug = 'tomoko-hiroki';

-- daisuke-uchiyama
INSERT INTO bot.contributor_credits (contributor_id, role, credit_scope, visible)
SELECT id, 'Producteur général — Sagas Budokai et Budokai Tenkaichi', 'Jeux Vidéo', true
FROM bot.contributors WHERE slug = 'daisuke-uchiyama';

-- masayuki-hirano
INSERT INTO bot.contributor_credits (contributor_id, role, credit_scope, visible)
SELECT id, 'Producteur — Dragon Ball Xenoverse 1 & 2', 'Jeux Vidéo', true
FROM bot.contributors WHERE slug = 'masayuki-hirano';

-- toyotaro
INSERT INTO bot.contributor_credits (contributor_id, role, credit_scope, visible)
SELECT id, 'Dessinateur du manga Dragon Ball Super sous la supervision d''Akira Toriyama', 'Manga', true
FROM bot.contributors WHERE slug = 'toyotaro';

-- koji-yoshida
INSERT INTO bot.contributor_credits (contributor_id, role, credit_scope, visible)
SELECT id, 'Éditeur Shueisha (Weekly Shōnen Jump) et coordinateur éditorial', 'Édition & Manga', true
FROM bot.contributors WHERE slug = 'koji-yoshida';

-- kazuhiko-gomyo
INSERT INTO bot.contributor_credits (contributor_id, role, credit_scope, visible)
SELECT id, 'Rédacteur en chef des databooks Daizenshuu et Chōzenshū', 'Databooks & Guides', true
FROM bot.contributors WHERE slug = 'kazuhiko-gomyo';

COMMIT;
