-- Insertion des crédits conformes aux contraintes d'intégrité (1 FK non-nulle et scope valide)
BEGIN;

-- hiroshi-matsuyama (Kakarot)
INSERT INTO bot.contributor_credits (contributor_id, role, credit_scope, game_id)
SELECT c.id, 'Directeur général du développement (CyberConnect2)', 'game', g.id
FROM bot.contributors c, bot.db_games g
WHERE c.slug = 'hiroshi-matsuyama' AND g.slug = 'kakarot';

-- tomoko-hiroki (FighterZ)
INSERT INTO bot.contributor_credits (contributor_id, role, credit_scope, game_id)
SELECT c.id, 'Productrice en chef (Bandai Namco)', 'game', g.id
FROM bot.contributors c, bot.db_games g
WHERE c.slug = 'tomoko-hiroki' AND g.slug = 'fighterz';

-- masayuki-hirano (Xenoverse 2)
INSERT INTO bot.contributor_credits (contributor_id, role, credit_scope, game_id)
SELECT c.id, 'Producteur (Bandai Namco)', 'game', g.id
FROM bot.contributors c, bot.db_games g
WHERE c.slug = 'masayuki-hirano' AND g.slug = 'xenoverse-2';

-- daisuke-uchiyama (Sparking! Zero / Budokai)
INSERT INTO bot.contributor_credits (contributor_id, role, credit_scope, game_id)
SELECT c.id, 'Producteur exécutif franchise jeu vidéo', 'game', g.id
FROM bot.contributors c, bot.db_games g
WHERE c.slug = 'daisuke-uchiyama' AND g.slug = 'sparking-zero';

-- chiho-kiyooka (Cha-La Head-Cha-La)
INSERT INTO bot.contributor_credits (contributor_id, role, credit_scope, soundtrack_id)
SELECT c.id, 'Compositrice de la mélodie originale', 'track', s.id
FROM bot.contributors c, bot.db_soundtracks s
WHERE c.slug = 'chiho-kiyooka' AND s.slug = 'cha-la-head-cha-la';

-- takeshi-ike (Makafushigi Adventure!)
INSERT INTO bot.contributor_credits (contributor_id, role, credit_scope, soundtrack_id)
SELECT c.id, 'Compositeur du thème d''ouverture', 'track', s.id
FROM bot.contributors c, bot.db_soundtracks s
WHERE c.slug = 'takeshi-ike' AND s.slug = 'makafushigi-adventure';

-- tetsuro-oda (Dan Dan Kokoro Hikareteku)
INSERT INTO bot.contributor_credits (contributor_id, role, credit_scope, soundtrack_id)
SELECT c.id, 'Compositeur du thème d''ouverture de Dragon Ball GT', 'track', s.id
FROM bot.contributors c, bot.db_soundtracks s
WHERE c.slug = 'tetsuro-oda' AND s.slug = 'dan-dan-kokoro-hikareteku';

-- toyotaro (Dragon Ball)
INSERT INTO bot.contributor_credits (contributor_id, role, credit_scope, work_id)
SELECT c.id, 'Dessinateur du manga Dragon Ball Super', 'work', w.id
FROM bot.contributors c, bot.media_works w
WHERE c.slug = 'toyotaro' AND w.slug = 'dragon-ball';

-- koji-yoshida (Dragon Ball)
INSERT INTO bot.contributor_credits (contributor_id, role, credit_scope, work_id)
SELECT c.id, 'Éditeur Weekly Shōnen Jump / Supervision éditoriale', 'work', w.id
FROM bot.contributors c, bot.media_works w
WHERE c.slug = 'koji-yoshida' AND w.slug = 'dragon-ball';

-- kazuhiko-gomyo (Dragon Ball)
INSERT INTO bot.contributor_credits (contributor_id, role, credit_scope, work_id)
SELECT c.id, 'Rédacteur en chef des databooks Daizenshuu et Chōzenshū', 'work', w.id
FROM bot.contributors c, bot.media_works w
WHERE c.slug = 'kazuhiko-gomyo' AND w.slug = 'dragon-ball';

-- shigeyasu-yamauchi (Fusion Reborn)
INSERT INTO bot.contributor_credits (contributor_id, role, credit_scope, movie_id)
SELECT c.id, 'Réalisateur du film Fusion (Janemba)', 'film', m.id
FROM bot.contributors c, bot.db_movies m
WHERE c.slug = 'shigeyasu-yamauchi' AND m.slug = 'fusion-reborn';

-- yoshihiro-ueda (Broly Second Coming)
INSERT INTO bot.contributor_credits (contributor_id, role, credit_scope, movie_id)
SELECT c.id, 'Réalisateur du film Rivaux Dangereux', 'film', m.id
FROM bot.contributors c, bot.db_movies m
WHERE c.slug = 'yoshihiro-ueda' AND m.slug = 'broly-second-coming';

COMMIT;
