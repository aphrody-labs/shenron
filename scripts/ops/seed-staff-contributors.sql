-- Insertion massive du staff complet Dragon Ball : Éditeurs, Animateurs, Réalisateurs, Scénaristes, Musiciens, Développeurs jeux vidéo
BEGIN;

-- 1. ÉDITEURS & DIRIGEANTS (editorial_staff / author / other)
INSERT INTO bot.contributors (slug, name, name_ja, name_romaji, category, birth_date, biography_fr, spotlight_rank, image, visible)
VALUES
('koji-yoshida', 'Kōji Yoshida', '吉田幸司', 'Yoshida Kōji', 'editorial_staff', '1974-12-05',
'Éditeur chez Shueisha qui a succédé à Fuyuto Takeda au Weekly Shōnen Jump. Il a supervisé la fin de la sérialisation originale et coordonné de nombreux projets d''archives et d''éditions collectors.',
12, 'https://upload.wikimedia.org/wikipedia/commons/thumb/d/d2/Crystal_Clear_app_Login_Manager.svg/240px-Crystal_Clear_app_Login_Manager.svg.png', true),

('toyotaro', 'Toyotarō', 'とよたろう', 'Toyotarō', 'author', '1978-05-17',
'Dessinateur officiel choisi et adoubé par Akira Toriyama pour illustrer le manga Dragon Ball Super. Auparavant auteur de Dragon Ball Heroes: Victory Mission.',
3, 'https://thumb.wikimedia.org/wikipedia/commons/thumb/4/4b/Toyotar%C5%8D_at_Lucca_Comics_2017.jpg/330px-Toyotar%C5%8D_at_Lucca_Comics_2017.jpg?utm_source=it.wikipedia.org&utm_campaign=api&utm_content=thumbnail', true),

('kazuhiko-gomyo', 'Kazuhiko Gōmyō', '五明一彦', 'Gōmyō Kazuhiko', 'editorial_staff', '1968-02-14',
'Rédacteur en chef et coordinateur éditorial des databooks officiels Daizenshuu 1 à 7 et Chōzenshū. Garant de la rigueur chronologique et de la nomenclature officielle des attaques et niveaux de puissance.',
15, 'https://upload.wikimedia.org/wikipedia/commons/thumb/d/d2/Crystal_Clear_app_Login_Manager.svg/240px-Crystal_Clear_app_Login_Manager.svg.png', true)
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  name_ja = EXCLUDED.name_ja,
  name_romaji = EXCLUDED.name_romaji,
  category = EXCLUDED.category,
  biography_fr = EXCLUDED.biography_fr,
  image = EXCLUDED.image,
  visible = true;

-- 2. ANIMATEURS & CHARA-DESIGNERS CLÉS (animation)
INSERT INTO bot.contributors (slug, name, name_ja, name_romaji, category, birth_date, biography_fr, spotlight_rank, image, visible)
VALUES
('toyoo-ashida', 'Toyoo Ashida', '芦田豊雄', 'Ashida Toyoo', 'animation', '1944-04-21',
'Animateur et réalisateur légendaire, fondateur du Studio Live. Il a dirigé l''animation du téléfilm historique Bardock : Le Père de Son Goku (1990) et a apporté un dynamisme saisissant aux scènes d''action spatiales.',
16, 'https://thumb.wikimedia.org/wikipedia/commons/thumb/9/91/Toyoo_Ashida_2008.jpg/330px-Toyoo_Ashida_2008.jpg?utm_source=ja.wikipedia.org&utm_campaign=api&utm_content=thumbnail', true),

('keisuke-masunaga', 'Keisuke Masunaga', '増永計介', 'Masunaga Keisuke', 'animation', '1963-08-10',
'Directeur de l''animation chez Studio Cockpit. Réputé pour ses épisodes cultes de DBZ avec un sens du détail exceptionnel, notamment le combat mythique de Gohan Super Saiyan 2 contre Cell.',
17, 'https://upload.wikimedia.org/wikipedia/commons/thumb/1/18/Anime_icon.svg/240px-Anime_icon.svg.png', true),

('kazuya-hisada', 'Kazuya Hisada', '久田和也', 'Hisada Kazuya', 'animation', '1962-09-18',
'Superviseur de l''animation et character designer sur Dragon Ball GT et de nombreux épisodes de DBZ. Son style dynamique et ses ombrages marqués ont défini le rendu visuel de la saga des dragons maléfiques.',
18, 'https://upload.wikimedia.org/wikipedia/commons/thumb/1/18/Anime_icon.svg/240px-Anime_icon.svg.png', true),

('naoki-miyahara', 'Naoki Miyahara', '宮原直樹', 'Miyahara Naoki', 'animation', '1965-04-03',
'Pionnier de l''animation 3D hybride chez Toei Animation. Il a réalisé l''OAV Son Goku et ses amis sont de retour !! (2008) et a dirigé la séquence d''animation 3D du film Dragon Ball Super: Super Hero.',
19, 'https://upload.wikimedia.org/wikipedia/commons/thumb/1/18/Anime_icon.svg/240px-Anime_icon.svg.png', true),

('toshiyuki-sugano', 'Toshiyuki Sugano', '菅野利行', 'Sugano Toshiyuki', 'animation', '1967-11-20',
'Animateur clé réputé de la Toei, ayant dessiné les passes d''armes les plus frénétiques de la saga Boo et des films Fusion et L''Attaque du Dragon.',
20, 'https://upload.wikimedia.org/wikipedia/commons/thumb/1/18/Anime_icon.svg/240px-Anime_icon.svg.png', true),

('yukio-ebisawa', 'Yukio Ebisawa', '海老沢幸男', 'Ebisawa Yukio', 'animation', '1954-03-25',
'Directeur d''animation prolifique de Studio Live ayant supervisé plus de 50 épisodes de Dragon Ball et Dragon Ball Z. Son style caractérisé par des mentons anguleux et des traits acérés est reconnaissable entre mille.',
21, 'https://upload.wikimedia.org/wikipedia/commons/thumb/1/18/Anime_icon.svg/240px-Anime_icon.svg.png', true),

('takeo-ide', 'Takeo Ide', '井手武生', 'Ide Takeo', 'animation', '1958-07-14',
'Directeur d''animation de longue date sur Dragon Ball Z et Dragon Ball GT, réputé pour sa fidélité scrupuleuse aux designs de Minoru Maeda et Katsuyoshi Nakatsuru.',
22, 'https://upload.wikimedia.org/wikipedia/commons/thumb/1/18/Anime_icon.svg/240px-Anime_icon.svg.png', true)
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  name_ja = EXCLUDED.name_ja,
  name_romaji = EXCLUDED.name_romaji,
  category = EXCLUDED.category,
  biography_fr = EXCLUDED.biography_fr,
  image = EXCLUDED.image,
  visible = true;

-- 3. SCÉNARISTES & RÉALISATEURS (scenario / animation)
INSERT INTO bot.contributors (slug, name, name_ja, name_romaji, category, birth_date, biography_fr, spotlight_rank, image, visible)
VALUES
('hiroshi-toda', 'Hiroshi Toda', '戸田博史', 'Toda Hiroshi', 'scenario', '1951-03-29',
'Scénariste chevronné de Toei Animation. Il a écrit de nombreux épisodes mémorables de Dragon Ball et du début de Dragon Ball Z, notamment l''arrivée des Saiyans sur Terre et l''entraînement chez Kaio.',
23, 'https://upload.wikimedia.org/wikipedia/commons/thumb/1/18/Anime_icon.svg/240px-Anime_icon.svg.png', true),

('keiji-terui', 'Keiji Terui', '照井啓司', 'Terui Keiji', 'scenario', '1955-08-12',
'Scénariste de la première série Dragon Ball et des premiers épisodes de DBZ. Auteur des interactions comiques savoureuses entre Goku, Bulma, Oolong et Tortue Géniale.',
24, 'https://upload.wikimedia.org/wikipedia/commons/thumb/1/18/Anime_icon.svg/240px-Anime_icon.svg.png', true),

('tatsuya-nagamine', 'Tatsuya Nagamine', '長峯達也', 'Nagamine Tatsuya', 'animation', '1971-12-08',
'Réalisateur spectaculaire du chef-d''œuvre cinématographique Dragon Ball Super: Broly (2018). Il a insufflé un rythme d''action titanesque et une intensité visuelle révolutionnaire dans les combats.',
9, 'https://thumb.wikimedia.org/wikipedia/commons/thumb/9/9d/Tatsuya_Nagamine_at_Japan_Expo_2019.jpg/330px-Tatsuya_Nagamine_at_Japan_Expo_2019.jpg?utm_source=fr.wikipedia.org&utm_campaign=api&utm_content=thumbnail', true),

('megumi-ishitani', 'Megumi Ishitani', '石谷恵', 'Ishitani Megumi', 'animation', '1991-12-14',
'Réalisatrice prodige de la Toei Animation. Elle a réalisé l''épisode 131 de Dragon Ball Super (la conclusion apothéotique du Tournoi du Pouvoir), acclamé dans le monde entier pour sa mise en scène transcendante.',
10, 'https://thumb.wikimedia.org/wikipedia/commons/thumb/1/18/Anime_icon.svg/240px-Anime_icon.svg.png/330px-Anime_icon.svg.png', true),

('mitsuo-hashimoto', 'Mitsuo Hashimoto', '橋本光夫', 'Hashimoto Mitsuo', 'animation', '1951-11-20',
'Réalisateur de films emblématiques tels que Le Robot des Glaces (Dr. Wheelo), La Menace de Namek (Slug) et Le Grand Combat (Cooler 2). Figure clé de l''âge d''or des films de printemps de la Toei.',
25, 'https://upload.wikimedia.org/wikipedia/commons/thumb/1/18/Anime_icon.svg/240px-Anime_icon.svg.png', true),

('yoshihiro-ueda', 'Yoshihiro Ueda', '上田芳裕', 'Ueda Yoshihiro', 'animation', '1955-06-03',
'Réalisateur prolifique ayant dirigé plusieurs films de DBZ comme Rivaux Dangereux (Cooler 1), Cent Mille Guerriers de Métal et L''Attaque du Dragon (Hirudegarn).',
26, 'https://upload.wikimedia.org/wikipedia/commons/thumb/1/18/Anime_icon.svg/240px-Anime_icon.svg.png', true)
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  name_ja = EXCLUDED.name_ja,
  name_romaji = EXCLUDED.name_romaji,
  category = EXCLUDED.category,
  biography_fr = EXCLUDED.biography_fr,
  image = EXCLUDED.image,
  visible = true;

-- 4. COMPOSITEURS & MUSICIENS (music)
INSERT INTO bot.contributors (slug, name, name_ja, name_romaji, category, birth_date, biography_fr, spotlight_rank, image, visible)
VALUES
('kenji-yamamoto', 'Kenji Yamamoto', '山本健司', 'Yamamoto Kenji', 'music', '1958-07-01',
'Compositeur légendaire des musiques des jeux vidéo cultes Super Butōden (Super Nintendo), Ultimate Battle 22, et de la trilogie Dragon Ball Z: Budokai (PS2).',
11, 'https://upload.wikimedia.org/wikipedia/commons/thumb/8/87/Music_flat_icon.svg/240px-Music_flat_icon.svg.png', true),

('takeshi-ike', 'Takeshi Ike', '池毅', 'Ike Takeshi', 'music', '1953-03-21',
'Compositeur mélodique génial à l''origine des thèmes d''ouverture mythiques Makafushigi Adventure! (Dragon Ball) et Romantic Ageru yo.',
27, 'https://upload.wikimedia.org/wikipedia/commons/thumb/8/87/Music_flat_icon.svg/240px-Music_flat_icon.svg.png', true),

('chiho-kiyooka', 'Chiho Kiyooka', '清岡千穂', 'Kiyooka Chiho', 'music', '1954-10-09',
'Compositrice de renommée ayant écrit les mélodies inoubliables de Cha-La Head-Cha-La et We Gotta Power pour Dragon Ball Z, interprétées par Hironobu Kageyama.',
28, 'https://upload.wikimedia.org/wikipedia/commons/thumb/8/87/Music_flat_icon.svg/240px-Music_flat_icon.svg.png', true),

('ushio-hashimoto', 'Ushio Hashimoto', '橋本潮', 'Hashimoto Ushio', 'music', '1965-06-01',
'Chanteuse japonaise emblématique ayant interprété avec grâce et douceur le générique de fin légendaire Romantic Ageru yo (Dragon Ball).',
29, 'https://thumb.wikimedia.org/wikipedia/commons/thumb/c/ca/Ushio_Hashimoto_2013.jpg/330px-Ushio_Hashimoto_2013.jpg?utm_source=ja.wikipedia.org&utm_campaign=api&utm_content=thumbnail', true),

('tetsuro-oda', 'Tetsurō Oda', '織田哲郎', 'Oda Tetsurō', 'music', '1958-03-11',
'Auteur-compositeur vedette de la J-Pop, créateur de Dan Dan Kokoro Hikareteku, le chef-d''œuvre d''ouverture de Dragon Ball GT interprété par le groupe Field of View.',
30, 'https://thumb.wikimedia.org/wikipedia/commons/thumb/1/15/Tetsuro_Oda_2010.jpg/330px-Tetsuro_Oda_2010.jpg?utm_source=ja.wikipedia.org&utm_campaign=api&utm_content=thumbnail', true),

('zedd', 'Zedd (Anton Zaslavski)', 'ゼッド', 'Zedd', 'music', '1989-09-02',
'Producteur et DJ mondialement récompensé aux Grammy Awards, compositeur et producteur de l''opening officiel Jaka Jaan de Dragon Ball Daima (2024).',
14, 'https://thumb.wikimedia.org/wikipedia/commons/thumb/3/36/Zedd-2019.jpg/330px-Zedd-2019.jpg?utm_source=en.wikipedia.org&utm_campaign=api&utm_content=thumbnail', true)
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  name_ja = EXCLUDED.name_ja,
  name_romaji = EXCLUDED.name_romaji,
  category = EXCLUDED.category,
  biography_fr = EXCLUDED.biography_fr,
  image = EXCLUDED.image,
  visible = true;

-- 5. PRODUCTEURS & CRÉATEURS DE JEUX VIDÉO (other)
INSERT INTO bot.contributors (slug, name, name_ja, name_romaji, category, birth_date, biography_fr, spotlight_rank, image, visible)
VALUES
('hiroshi-matsuyama', 'Hiroshi Matsuyama', '松山洋', 'Matsuyama Hiroshi', 'other', '1970-11-23',
'Président et directeur de CyberConnect2, studio développeur du chef-d''œuvre Action-RPG Dragon Ball Z: Kakarot, réputé pour sa mise en scène cinématique grandiose fidèle au manga.',
13, 'https://thumb.wikimedia.org/wikipedia/commons/thumb/9/9a/Hiroshi_Matsuyama_Japan_Expo_2012.jpg/330px-Hiroshi_Matsuyama_Japan_Expo_2012.jpg?utm_source=fr.wikipedia.org&utm_campaign=api&utm_content=thumbnail', true),

('tomoko-hiroki', 'Tomoko Hiroki', '広木朋子', 'Hiroki Tomoko', 'other', '1988-06-15',
'Productrice star chez Bandai Namco Entertainment à la tête du jeu de combat phénomène Dragon Ball FighterZ, développé avec Arc System Works.',
31, 'https://upload.wikimedia.org/wikipedia/commons/thumb/d/d2/Crystal_Clear_app_Login_Manager.svg/240px-Crystal_Clear_app_Login_Manager.svg.png', true),

('daisuke-uchiyama', 'Daisuke Uchiyama', '内山大輔', 'Uchiyama Daisuke', 'other', '1968-04-18',
'Producteur historique des sagas vidéoludiques Dragon Ball Z: Budokai et Budokai Tenkaichi chez Bandai. Il a ressuscité le succès de la franchise dans le jeu vidéo mondial dans les années 2000.',
32, 'https://upload.wikimedia.org/wikipedia/commons/thumb/d/d2/Crystal_Clear_app_Login_Manager.svg/240px-Crystal_Clear_app_Login_Manager.svg.png', true),

('masayuki-hirano', 'Masayuki Hirano', '平野真之', 'Hirano Masayuki', 'other', '1979-09-12',
'Producteur de la franchise à succès Dragon Ball Xenoverse 1 & 2 chez Bandai Namco, coordonnant la création du Time Patrol et de la dimension temporelle Conton City.',
33, 'https://upload.wikimedia.org/wikipedia/commons/thumb/d/d2/Crystal_Clear_app_Login_Manager.svg/240px-Crystal_Clear_app_Login_Manager.svg.png', true)
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  name_ja = EXCLUDED.name_ja,
  name_romaji = EXCLUDED.name_romaji,
  category = EXCLUDED.category,
  biography_fr = EXCLUDED.biography_fr,
  image = EXCLUDED.image,
  visible = true;

COMMIT;
