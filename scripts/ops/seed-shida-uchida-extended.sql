-- Mise à jour et insertion de l'ensemble des personnalités réclamées :
-- Naotoshi Shida, Victory Uchida (Taiki Uchida), Yuya Takahashi, Masayuki Uchiyama,
-- Noboru Koizumi, Hiroshi Koujina, Takashi Hashimoto, Shingo Ishikawa, Yuji Ikeda,
-- Pierre Trabaud, Nana Mizuki, etc.

BEGIN;

-- 1. CONTRIBUTEURS CLÉS DE PRODUCTION & ÉDITION (bot.contributors)
INSERT INTO bot.contributors (slug, name, name_ja, name_romaji, category, birth_date, biography_fr, spotlight_rank, image, visible)
VALUES
('victory-uchida', 'Victory Uchida (Taiki Uchida)', 'ビクトリー・ウチダ', 'Uchida Taiki', 'editorial_staff', '1988-03-24',
'Rédacteur en chef adjoint et visage public emblématique du magazine V-Jump chez Shueisha. Collaborateur éditorial direct d''Akira Toriyama et Toyotarō sur les arcs de Dragon Ball Super (Granolah, Super Hero). Présentateur attitré des Weekly Dragon Ball News et ambassadeur officiel de la franchise dans les conventions mondiales (Jump Festa, New York Comic Con).',
2, 'https://upload.wikimedia.org/wikipedia/commons/thumb/d/d2/Crystal_Clear_app_Login_Manager.svg/240px-Crystal_Clear_app_Login_Manager.svg.png', true),

('naotoshi-shida', 'Naotoshi Shida', '志田直俊', 'Shida Naotoshi', 'animation', '1965-02-11',
'Animateur légendaire surnommé le « Climax Animator » de Toei Animation. Connu pour son style cinématographique virtuose, ses distorsions spatiales grand-angle et ses chorégraphies d''impact titanesques. Il a animé de ses mains l''exécution de Mecha Freezer par Trunks, le paroxysme de Broly (film 8), Fusion (Janemba), Vegeto Blue vs Zamasu (DBS 66) et le combat légendaire de Dragon Ball Super: Broly (2018).',
4, 'https://upload.wikimedia.org/wikipedia/commons/thumb/1/18/Anime_icon.svg/240px-Anime_icon.svg.png', true),

('yuya-takahashi', 'Yūya Takahashi', '高橋優也', 'Takahashi Yūya', 'animation', '1984-04-16',
'Directeur de l''animation et character designer prodige. Célèbre dans le monde entier pour avoir ressuscité le trait affûté, ombré et musculeux de l''âge d''or de DBZ dans Dragon Ball Super (épisodes 114 et 131), Dragon Ball Super: Broly et Dragon Ball Daima (directeur de l''animation en chef).',
5, 'https://upload.wikimedia.org/wikipedia/commons/thumb/1/18/Anime_icon.svg/240px-Anime_icon.svg.png', true),

('masayuki-uchiyama', 'Masayuki Uchiyama', '内山正幸', 'Uchiyama Masayuki', 'animation', '1952-01-20',
'Fondateur de Studio Last House et directeur d''animation historique ayant supervisé le plus grand nombre d''épisodes de l''histoire de Dragon Ball et Dragon Ball Z (des dizaines d''épisodes des sagas Armée du Ruban Rouge, Piccolo Daimaō, Saiyans, Freezer, Cyborgs et Buu). Son style dynamique a accompagné la série pendant 15 ans.',
34, 'https://upload.wikimedia.org/wikipedia/commons/thumb/1/18/Anime_icon.svg/240px-Anime_icon.svg.png', true),

('noboru-koizumi', 'Noboru Koizumi', '小泉昇', 'Koizumi Noboru', 'animation', '1959-05-18',
'Directeur de l''animation et character designer majeur de Toei Animation. Il a signé l''animation sublime du film 10e anniversaire L''Armée du Ruban Rouge (Saikyō e no Michi / The Path to Power) en 1996 et de nombreux épisodes de Dragon Ball GT.',
35, 'https://upload.wikimedia.org/wikipedia/commons/thumb/1/18/Anime_icon.svg/240px-Anime_icon.svg.png', true),

('hiroshi-koujina', 'Hiroshi Kōjina', '神志那弘志', 'Kōjina Hiroshi', 'animation', '1963-06-04',
'Président de Studio Live et animateur clé de renom. Collaborateur de longue date de Toyoo Ashida, il a apporté son trait acéré et son dynamisme martial au premier film Dragon Ball Z : À la poursuite de Garlic (Dead Zone, 1989).',
36, 'https://upload.wikimedia.org/wikipedia/commons/thumb/1/18/Anime_icon.svg/240px-Anime_icon.svg.png', true),

('takashi-hashimoto', 'Takashi Hashimoto', '橋本敬史', 'Hashimoto Takashi', 'animation', '1965-09-30',
'Maître absolu des effets spéciaux et de l''animation d''effets visuels (explosions, vagues déferlantes d''énergie Ki, auras divines). Directeur de l''animation des effets sur Dragon Ball Super: Broly (2018).',
37, 'https://upload.wikimedia.org/wikipedia/commons/thumb/1/18/Anime_icon.svg/240px-Anime_icon.svg.png', true),

('shingo-ishikawa', 'Shingo Ishikawa', '石川晋吾', 'Ishikawa Shingo', 'animation', '1968-12-11',
'Superviseur de l''animation émérite de Toei Animation, réputé pour la précision chirurgicale de ses plans lors du climax de la saga Majin Buu et sur Dragon Ball GT.',
38, 'https://upload.wikimedia.org/wikipedia/commons/thumb/1/18/Anime_icon.svg/240px-Anime_icon.svg.png', true),

('yuji-ikeda', 'Yūji Ikeda', '池田祐二', 'Ikeda Yūji', 'animation', '1952-07-06',
'Directeur artistique (Bijutsu Kantoku) en chef de Dragon Ball et des 199 premiers épisodes de Dragon Ball Z chez Studio Wyeth. Il a défini l''atmosphère picturale, les ciels colorés de Namek et les paysages emblématiques de la Terre.',
39, 'https://upload.wikimedia.org/wikipedia/commons/thumb/1/18/Anime_icon.svg/240px-Anime_icon.svg.png', true),

('ken-tokushige', 'Ken Tokushige', '徳重賢', 'Tokushige Ken', 'animation', '1957-04-19',
'Directeur artistique ayant succédé à Yūji Ikeda à partir de l''épisode 200 de Dragon Ball Z (saga Tournoi d''arts martiaux et Boo) et sur plusieurs films cinématographiques comme L''Attaque du Dragon.',
40, 'https://upload.wikimedia.org/wikipedia/commons/thumb/1/18/Anime_icon.svg/240px-Anime_icon.svg.png', true)
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  name_ja = EXCLUDED.name_ja,
  name_romaji = EXCLUDED.name_romaji,
  category = EXCLUDED.category,
  biography_fr = EXCLUDED.biography_fr,
  image = EXCLUDED.image,
  visible = true;

-- 2. NOUVELLES VOIX SEIYŪ & VF DE RÉFÉRENCE (bot.db_voice_actors)
INSERT INTO bot.db_voice_actors (slug, name, name_ja, nationality, birth_date, roles, biography, image, visible)
VALUES
('nana-mizuki', 'Nana Mizuki', '水樹奈々', 'ja', '1980-01-21',
'[{"characterName":"Cheelai (Chirai)","series":"DBS: Broly, DBS: Super Hero, Daima","notes":"Soldat renégate de Freezer et protectrice de Broly"}]',
'Chanteuse superstar et seiyū adulée au Japon. Elle prête sa voix pétillante et déterminée à Cheelai (Chirai) dans Dragon Ball Super: Broly et Dragon Ball Super: Super Hero.',
'https://upload.wikimedia.org/wikipedia/commons/thumb/4/4b/Nana_Mizuki_2018-2.jpg/330px-Nana_Mizuki_2018-2.jpg', true),

('pierre-trabaud', 'Pierre Trabaud', NULL, 'fr', '1922-08-07',
'[{"characterName":"Tortue Géniale (Maître Roshi)","series":"DB, DBZ","notes":"Voix française historique de référence"},{"characterName":"Kaio du Nord","series":"DBZ","notes":"Voix mythique d''entraînement de Goku"}]',
'Comédien de théâtre et de cinéma d''anthologie. Voix française originelle et irremplaçable de Maître Roshi (Tortue Géniale) et de Kaio du Nord dans Dragon Ball et Dragon Ball Z au Club Dorothée.',
'https://upload.wikimedia.org/wikipedia/commons/thumb/a/ad/PierreTrabaud-1950-Harcourt.png/330px-PierreTrabaud-1950-Harcourt.png', true),

('claude-chantal', 'Claude Chantal', NULL, 'fr', '1933-02-04',
'[{"characterName":"Krillin enfant & jeune","series":"DB, DBZ","notes":"Voix française emblématique"},{"characterName":"Daphné","series":"Scooby-Doo","notes":"Rôle culte"}]',
'Grande dame du doublage français, voix chaleureuse et émouvante de Krillin enfant et adolescent dans Dragon Ball et le début de Dragon Ball Z.',
'https://thumb.wikimedia.org/wikipedia/commons/thumb/d/d2/Crystal_Clear_app_Login_Manager.svg/240px-Crystal_Clear_app_Login_Manager.svg.png', true),

('georges-lycan', 'Georges Lycan', NULL, 'fr', '1924-05-08',
'[{"characterName":"Cell","series":"DBZ","notes":"Voix de basse terrifiante de Perfect Cell et Cell 2e forme"}]',
'Acteur français à la voix de stentor caverneuse et impressionnante. Il a marqué l''inconscient collectif français en prêtant son timbre glaçant à Cell dans la saga des Cyborgs de Dragon Ball Z.',
'https://thumb.wikimedia.org/wikipedia/commons/thumb/d/d2/Crystal_Clear_app_Login_Manager.svg/240px-Crystal_Clear_app_Login_Manager.svg.png', true),

('thierry-redler', 'Thierry Redler', NULL, 'fr', '1958-02-22',
'[{"characterName":"Son Goku adulte (remplacement)","series":"Films DBZ AB","notes":"Interprétation dans les films Le Robot des Glaces et Rivaux Dangereux"}]',
'Acteur et auteur aimé du public français (Marc Malloy dans Les Filles d''à côté), il a prêté sa voix à Son Goku adulte dans plusieurs longs-métrages Dragon Ball Z produits par AB Productions.',
'https://thumb.wikimedia.org/wikipedia/commons/thumb/d/d2/Crystal_Clear_app_Login_Manager.svg/240px-Crystal_Clear_app_Login_Manager.svg.png', true)
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  roles = EXCLUDED.roles,
  biography = EXCLUDED.biography,
  image = EXCLUDED.image,
  visible = true;

-- 3. MISE À JOUR DE LA PHOTO DE CARLOS SEGUNDO (Piccolo LatAm) AVEC WIKIMEDIA AUTHENTIFIÉ
UPDATE bot.db_voice_actors
SET image = 'https://upload.wikimedia.org/wikipedia/commons/thumb/1/15/Carlos_Segundo_Comic_Con_Panama_2026_%28cropped%29.jpg/330px-Carlos_Segundo_Comic_Con_Panama_2026_%28cropped%29.jpg'
WHERE slug = 'carlos-segundo';

COMMIT;
