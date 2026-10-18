-- Insertion massive et détaillée des comédiens de doublage (Seiyū VO, VF, VA, LatAm, ES, IT)
BEGIN;

-- 1. SEIYŪ JAPONAIS (VO)
INSERT INTO bot.db_voice_actors (slug, name, name_ja, nationality, birth_date, roles, biography, image, visible)
VALUES
('hiromi-tsuru', 'Hiromi Tsuru', '鶴ひろみ', 'ja', '1960-03-29',
'[{"characterName":"Bulma","series":"DB, DBZ, DBGT, DBS","notes":"Voix originale historique de 1986 à 2017"},{"characterName":"Bra","series":"DBZ, DBGT","notes":"Fille de Vegeta et Bulma"}]',
'Voix historique et indissociable de Bulma de 1986 jusqu''à sa disparition tragique en novembre 2017. Sa voix espiègle, énergique et touchante a façonné l''héroïne tout au long de l''épopée Dragon Ball.',
'https://thumb.wikimedia.org/wikipedia/commons/thumb/c/c5/Hiromi_Tsuru.jpg/330px-Hiromi_Tsuru.jpg?utm_source=ja.wikipedia.org&utm_campaign=api&utm_content=thumbnail', true),

('aya-hisakawa', 'Aya Hisakawa', '久川綾', 'ja', '1968-11-12',
'[{"characterName":"Bulma","series":"DBS: Broly, DBS: Super Hero, Daima","notes":"Successeur officiel choisi après la disparition d''Hiromi Tsuru"}]',
'Seiyū et chanteuse de renom (également Sailor Mercury dans Sailor Moon). Elle a repris avec une infinie sensibilité et un respect total le rôle légendaire de Bulma à partir du film Dragon Ball Super: Broly.',
'https://thumb.wikimedia.org/wikipedia/commons/thumb/6/67/Aya_Hisakawa_2011.jpg/330px-Aya_Hisakawa_2011.jpg?utm_source=ja.wikipedia.org&utm_campaign=api&utm_content=thumbnail', true),

('daisuke-gori', 'Daisuke Gōri', '郷里大輔', 'ja', '1952-02-08',
'[{"characterName":"Mr. Satan (Hercule)","series":"DBZ, DBGT","notes":"Voix originale historique du champion du monde"},{"characterName":"Gyūmaō (Roi Taureau)","series":"DB, DBZ","notes":"Père de Chichi"},{"characterName":"Enma Daiō","series":"DBZ","notes":"Juge des âmes de l''au-delà"}]',
'Voix de basse colossale du doublage japonais. Il a incarné avec une puissance et un sens de la dérision inouïs Mr. Satan, le Roi Taureau et le Roi Enma jusqu''en 2010.',
'https://thumb.wikimedia.org/wikipedia/commons/thumb/4/4b/Daisuke_Gori.jpg/330px-Daisuke_Gori.jpg?utm_source=ja.wikipedia.org&utm_campaign=api&utm_content=thumbnail', true),

('unsho-ishizuka', 'Unshō Ishizuka', '石塚運昇', 'ja', '1951-05-16',
'[{"characterName":"Mr. Satan","series":"DBZ Kai, DBS","notes":"Successeur de Daisuke Gōri"},{"characterName":"Narrateur","series":"DBZ Kai","notes":"Narration des arcs Saiyans et Cell"}]',
'Grand comédien japonais à la voix chaleureuse et autoritaire (voix du Pr. Chen dans Pokémon). Il a repris avec maestria le rôle de Mr. Satan dans Dragon Ball Kai et Dragon Ball Super.',
'https://thumb.wikimedia.org/wikipedia/commons/thumb/9/91/Unsho_Ishizuka.jpg/330px-Unsho_Ishizuka.jpg?utm_source=ja.wikipedia.org&utm_campaign=api&utm_content=thumbnail', true),

('jouji-yanami', 'Jōji Yanami', '八奈見乗児', 'ja', '1931-08-30',
'[{"characterName":"Narrateur","series":"DB, DBZ, DBGT, DBS","notes":"Voix de la narration mythique de 1986 à 2015"},{"characterName":"Kaio du Nord","series":"DBZ, DBS","notes":"Maître de Son Goku"},{"characterName":"Dr. Brief","series":"DB, DBZ","notes":"Père de Bulma"},{"characterName":"Roi de la Terre","series":"DB, DBZ","notes":"Souverain canin"}]',
'La voix paternelle, bienveillante et philosophique qui a ouvert et clos chaque épisode de Dragon Ball, Dragon Ball Z et Dragon Ball GT pendant près de 30 ans.',
'https://thumb.wikimedia.org/wikipedia/commons/thumb/b/b2/Joji_Yanami.jpg/330px-Joji_Yanami.jpg?utm_source=ja.wikipedia.org&utm_campaign=api&utm_content=thumbnail', true),

('naoki-tatsuta', 'Naoki Tatsuta', '龍田直樹', 'ja', '1950-09-08',
'[{"characterName":"Oolong","series":"DB, DBZ, DBGT, DBS","notes":"Cochon métamorphe"},{"characterName":"Kaio du Nord","series":"DBS","notes":"Remplacement de Jōji Yanami à partir de 2015"}]',
'Comédien virtuose de la comédie, voix historique du cochon métamorphe Oolong depuis les débuts de l''animé en 1986, et successeur de Jōji Yanami pour Kaio du Nord.',
'https://thumb.wikimedia.org/wikipedia/commons/thumb/0/07/Naoki_Tatsuta.jpg/330px-Naoki_Tatsuta.jpg?utm_source=ja.wikipedia.org&utm_campaign=api&utm_content=thumbnail', true),

('banjo-ginga', 'Banjō Ginga', '銀河万丈', 'ja', '1948-11-12',
'[{"characterName":"Bora","series":"DB","notes":"Protecteur de la Terre Sacrée de Karin"},{"characterName":"Colonel Silver","series":"DB","notes":"Officier de l''Armée du Ruban Rouge"},{"characterName":"Roi Vegeta","series":"DBZ","notes":"Père du Prince Vegeta"}]',
'Voix de baryton noble et intimidante, interprète mémorable du Roi Vegeta et de Bora dans l''animé classique.',
'https://thumb.wikimedia.org/wikipedia/commons/thumb/2/25/Banjo_Ginga.jpg/330px-Banjo_Ginga.jpg?utm_source=ja.wikipedia.org&utm_campaign=api&utm_content=thumbnail', true),

('shigeru-chiba', 'Shigeru Chiba', '千葉繁', 'ja', '1954-02-04',
'[{"characterName":"Pilaf","series":"DB, DBGT, DBS, Daima","notes":"Empereur autoproclamé comique"},{"characterName":"Raditz","series":"DBZ","notes":"Frère aîné de Son Goku"}]',
'Génie de l''interprétation survoltée et de l''hystérie comique, voix inoubliable de l''Empereur Pilaf et du redoutable guerrier saiyan Raditz.',
'https://thumb.wikimedia.org/wikipedia/commons/thumb/9/9e/Shigeru_Chiba_2017.jpg/330px-Shigeru_Chiba_2017.jpg?utm_source=ja.wikipedia.org&utm_campaign=api&utm_content=thumbnail', true),

('norio-wakamoto', 'Norio Wakamoto', '若本規夫', 'ja', '1945-10-18',
'[{"characterName":"Cell","series":"DBZ, DBGT, DBS","notes":"Forme Imparfaite, Semi-Parfaite et Parfaite"}]',
'Voix iconique et théâtrale à l''élocution inimitable. Il a modulé trois timbres vocaux distincts pour illustrer l''évolution monstrueuse puis aristocratique du bio-cyborg Cell.',
'https://thumb.wikimedia.org/wikipedia/commons/thumb/e/e0/Norio_Wakamoto.jpg/330px-Norio_Wakamoto.jpg?utm_source=ja.wikipedia.org&utm_campaign=api&utm_content=thumbnail', true),

('tessho-genda', 'Tesshō Genda', '玄田哲章', 'ja', '1948-05-20',
'[{"characterName":"Shu","series":"DB, DBS","notes":"Sbire canin ninja de Pilaf"},{"characterName":"Bojack","series":"Film DBZ 9","notes":"Leader des pirates de l''espace"},{"characterName":"Janemba (première forme)","series":"Film DBZ 12","notes":"Démon géant"}]',
'Comédien de premier plan au Japon (voix officielle japonaise d''Arnold Schwarzenegger), incarnant le ninja Shu auprès de Pilaf et Maï.',
'https://thumb.wikimedia.org/wikipedia/commons/thumb/4/4e/Tessho_Genda.jpg/330px-Tessho_Genda.jpg?utm_source=ja.wikipedia.org&utm_campaign=api&utm_content=thumbnail', true),

('bin-shimada', 'Bin Shimada', '島田敏', 'ja', '1954-11-20',
'[{"characterName":"Broly","series":"Films DBZ 8, 10, 11, DBS: Broly","notes":"Super Saiyan Légendaire"},{"characterName":"Babidi","series":"DBZ Kai, DBS, Daima","notes":"Sorcier maléfique (successeur de Jōji Yanami)"}]',
'Interprète du cri bestial et de la démence guerrière de Broly à travers plus de 30 ans de films, de jeux vidéo et dans Dragon Ball Super: Broly.',
'https://thumb.wikimedia.org/wikipedia/commons/thumb/9/9c/Bin_Shimada.jpg/330px-Bin_Shimada.jpg?utm_source=ja.wikipedia.org&utm_campaign=api&utm_content=thumbnail', true),

('masakazu-morita', 'Masakazu Morita', '森田成一', 'ja', '1972-10-21',
'[{"characterName":"Whis","series":"DBS, Daima, Films","notes":"Ange guide de l''Univers 7 et maître martial de Beerus"},{"characterName":"Tarble","series":"OAV 2008","notes":"Frère cadet de Vegeta"}]',
'Voix gracieuse, sereine et imperturbable de l''Ange Whis depuis Battle of Gods en 2013, conférant au personnage toute sa dimension cosmique.',
'https://thumb.wikimedia.org/wikipedia/commons/thumb/1/11/Masakazu_Morita_2016.jpg/330px-Masakazu_Morita_2016.jpg?utm_source=ja.wikipedia.org&utm_campaign=api&utm_content=thumbnail', true),

('koichi-yamadera', 'Kōichi Yamadera', '山寺宏一', 'ja', '1961-06-17',
'[{"characterName":"Beerus","series":"DBS, Daima, Films","notes":"Dieu de la Destruction de l''Univers 7"},{"characterName":"Tenshinhan (remplacement)","series":"Jeux vidéo","notes":"Hommage après la disparition de Hirotaka Suzuoki"}]',
'Le comédien aux mille voix du Japon. Choisi personnellement pour donner vie au flegme nonchalant et aux colères cosmiques du Dieu de la Destruction Beerus.',
'https://thumb.wikimedia.org/wikipedia/commons/thumb/a/a6/Yamadera_Koichi.png/330px-Yamadera_Koichi.png?utm_source=ja.wikipedia.org&utm_campaign=api&utm_content=thumbnail', true)
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  name_ja = EXCLUDED.name_ja,
  roles = EXCLUDED.roles,
  biography = EXCLUDED.biography,
  image = EXCLUDED.image,
  visible = true;

-- 2. DOUBLAGE FRANÇAIS (VF)
INSERT INTO bot.db_voice_actors (slug, name, name_ja, nationality, birth_date, roles, biography, image, visible)
VALUES
('celine-monsarrat', 'Céline Monsarrat', NULL, 'fr', '1954-01-13',
'[{"characterName":"Bulma","series":"DB, DBZ, DBGT, DBS","notes":"Voix française historique depuis 1988"}]',
'Voix française mythique de Bulma depuis le Club Dorothée en 1988 (et voix officielle de Julia Roberts), conférant au personnage son tempérament intrépide et volcanique.',
'https://thumb.wikimedia.org/wikipedia/commons/thumb/5/55/C%C3%A9line_Monsarrat_2023.jpg/330px-C%C3%A9line_Monsarrat_2023.jpg?utm_source=fr.wikipedia.org&utm_campaign=api&utm_content=thumbnail', true),

('marc-lesser', 'Marc Lesser', NULL, 'fr', '1963-06-17',
'[{"characterName":"Trunks du Futur","series":"DBZ, DBGT, DBS","notes":"Voix française de référence"},{"characterName":"Son Gohan adulte","series":"Films DBZ","notes":"Gohan adolescent et jeune adulte"}]',
'Comédien de doublage incontournable, voix française emblématique de Trunks du futur depuis son arrivée face à Mecha Freezer en 1992 jusqu''à l''arc Goku Black dans DBS.',
'https://thumb.wikimedia.org/wikipedia/commons/thumb/d/d2/Crystal_Clear_app_Login_Manager.svg/240px-Crystal_Clear_app_Login_Manager.svg.png', true),

('frederic-bouraly', 'Frédéric Bouraly', NULL, 'fr', '1960-05-03',
'[{"characterName":"Mr. Satan (Hercule)","series":"DBZ","notes":"Voix française culte de la saga Buu"},{"characterName":"C-16","series":"DBZ","notes":"Cyborg pacifique amoureux de la nature"}]',
'Comédien populaire français ayant incarné avec une gouaille et un humour inoubliables Mr. Satan dans DBZ, ainsi que la voix douce et profonde du cyborg C-16.',
'https://thumb.wikimedia.org/wikipedia/commons/thumb/e/e9/Fr%C3%A9d%C3%A9ric_Bouraly.jpg/330px-Fr%C3%A9d%C3%A9ric_Bouraly.jpg?utm_source=fr.wikipedia.org&utm_campaign=api&utm_content=thumbnail', true),

('gilbert-levy', 'Gilbert Lévy', NULL, 'fr', '1949-11-20',
'[{"characterName":"Tortue Géniale (Maître Roshi)","series":"DBZ, DBS","notes":"Remplacement d''Edgar Givry et Pierre Trabaud"},{"characterName":"Dendé","series":"DBZ","notes":"Dendé enfant et adulte"}]',
'Comédien prolifique (également Moe dans Les Simpson), il a prêté son énergie et sa malice à Tortue Géniale et Dendé dans de nombreux films et séries Dragon Ball.',
'https://thumb.wikimedia.org/wikipedia/commons/thumb/5/5e/Gilbert_L%C3%A9vy_2023.jpg/330px-Gilbert_L%C3%A9vy_2023.jpg?utm_source=fr.wikipedia.org&utm_campaign=api&utm_content=thumbnail', true),

('bruno-magne', 'Bruno Magne', NULL, 'fr', '1963-07-28',
'[{"characterName":"Beerus","series":"DBS, Daima, Films","notes":"Dieu de la Destruction de l''Univers 7"},{"characterName":"Mecha Freezer","series":"DBZ Kai","notes":"Arrivée sur Terre"}]',
'Voix française remarquable du Dieu de la Destruction Beerus dans Dragon Ball Super et les longs-métrages modernes, alliant gourmandise et prestance royale.',
'https://thumb.wikimedia.org/wikipedia/commons/thumb/d/d2/Crystal_Clear_app_Login_Manager.svg/240px-Crystal_Clear_app_Login_Manager.svg.png', true),

('stephane-ronchewski', 'Stéphane Ronchewski', NULL, 'fr', '1967-08-14',
'[{"characterName":"Whis","series":"DBS, Daima, Films","notes":"Ange et maître martial de Beerus"}]',
'Voix française de l''Ange Whis dans Dragon Ball Super, salué pour sa diction raffinée, posée et son timbre empreint de mystère divin.',
'https://thumb.wikimedia.org/wikipedia/commons/thumb/7/74/Stephane-ronchewski.jpg/330px-Stephane-ronchewski.jpg?utm_source=fr.wikipedia.org&utm_campaign=api&utm_content=thumbnail', true),

('antoine-nouel', 'Antoine Nouel', NULL, 'fr', '1959-10-04',
'[{"characterName":"Directeur artistique","series":"DBS","notes":"Direction du doublage français chez Chinkel / Lylo"},{"characterName":"Zamasu","series":"DBS","notes":"Apprenti Kaio Shin de l''Univers 10"}]',
'Directeur de plateau et comédien chevronné, artisan de la refonte qualitative du doublage français sur Dragon Ball Super et voix du machiavélique Zamasu.',
'https://thumb.wikimedia.org/wikipedia/commons/thumb/d/d2/Crystal_Clear_app_Login_Manager.svg/240px-Crystal_Clear_app_Login_Manager.svg.png', true)
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  roles = EXCLUDED.roles,
  biography = EXCLUDED.biography,
  image = EXCLUDED.image,
  visible = true;

-- 3. DOUBLAGE ANGLAIS (VA)
INSERT INTO bot.db_voice_actors (slug, name, name_ja, nationality, birth_date, roles, biography, image, visible)
VALUES
('sonny-strait', 'Sonny Strait', NULL, 'en', '1965-06-28',
'[{"characterName":"Krillin","series":"DB, DBZ, DBS","notes":"Voix américaine officielle Funimation"},{"characterName":"Bardock","series":"DBZ TV Special","notes":"Père de Goku"}]',
'Comédien, doubleur et scénariste chez Funimation. Voix officielle de Krillin et Bardock aux États-Unis depuis la fin des années 1990.',
'https://thumb.wikimedia.org/wikipedia/commons/thumb/d/d4/Sonny_Strait_GalaxyCon_Raleigh_July%2C_25%2C_2026_316.jpg/330px-Sonny_Strait_GalaxyCon_Raleigh_July%2C_25%2C_2026_316.jpg?utm_source=en.wikipedia.org&utm_campaign=api&utm_content=thumbnail', true),

('eric-vale', 'Eric Vale', NULL, 'en', '1974-04-28',
'[{"characterName":"Trunks du Futur","series":"DBZ, DBS","notes":"Voix américaine de référence chez Funimation"}]',
'Comédien et directeur d''écriture chez Funimation, voix américaine de Trunks du futur depuis l''arc des Cyborgs jusqu''à Dragon Ball Super.',
'https://thumb.wikimedia.org/wikipedia/commons/thumb/6/6e/686-8x10.jpg/330px-686-8x10.jpg?utm_source=en.wikipedia.org&utm_campaign=api&utm_content=thumbnail', true),

('kyle-hebert', 'Kyle Hebert', NULL, 'en', '1969-06-14',
'[{"characterName":"Narrateur","series":"DBZ Funimation","notes":"Narration iconique Next time on Dragon Ball Z"},{"characterName":"Son Gohan adulte","series":"DBZ, DBS","notes":"Great Saiyaman et Ultimate Gohan"}]',
'Voix légendaire de la narration de Dragon Ball Z chez Funimation et interprète de Son Gohan adulte dans toute la saga Buu et Dragon Ball Super.',
'https://thumb.wikimedia.org/wikipedia/commons/thumb/1/1b/Kyle_Hebert_%2838122864326%29.jpg/330px-Kyle_Hebert_%2838122864326%29.jpg?utm_source=en.wikipedia.org&utm_campaign=api&utm_content=thumbnail', true),

('monica-rial', 'Monica Rial', NULL, 'en', '1975-10-05',
'[{"characterName":"Bulma","series":"DBZ Kai, DBS, Daima","notes":"Voix américaine officielle depuis 2010"}]',
'Comédienne et directrice artistique prolifique, voix officielle américaine de Bulma dans Dragon Ball Kai, Dragon Ball Super et les films récents.',
'https://thumb.wikimedia.org/wikipedia/commons/thumb/e/e4/Monica_Rial_GalaxyCon_Des_Moines_September%2C12%2C2026_1776.jpg/330px-Monica_Rial_GalaxyCon_Des_Moines_September%2C12%2C2026_1776.jpg?utm_source=en.wikipedia.org&utm_campaign=api&utm_content=thumbnail', true),

('colleen-clinkenbeard', 'Colleen Clinkenbeard', NULL, 'en', '1980-04-13',
'[{"characterName":"Son Gohan jeune","series":"DBZ Kai","notes":"Voix de Gohan enfant et adolescent"},{"characterName":"Son Goku jeune","series":"DB, DBZ Kai","notes":"Voix de Goku enfant"}]',
'Directrice de production et doubleuse majeure chez Funimation / Crunchyroll, interprète de Son Gohan dans Dragon Ball Kai.',
'https://thumb.wikimedia.org/wikipedia/commons/thumb/a/ae/Colleen_Clinkenbeard_GalaxyCon_Raleigh_July%2C_25%2C_2026_328.jpg/330px-Colleen_Clinkenbeard_GalaxyCon_Raleigh_July%2C_25%2C_2026_328.jpg?utm_source=en.wikipedia.org&utm_campaign=api&utm_content=thumbnail', true),

('dameon-clarke', 'Dameon Clarke', NULL, 'en', '1972-01-16',
'[{"characterName":"Cell","series":"DBZ, DBZ Kai","notes":"Voix américaine de Cell Parfait"}]',
'Acteur et doubleur américain, créateur de la voix aristocratique et terrifiante de Perfect Cell chez Funimation.',
'https://thumb.wikimedia.org/wikipedia/commons/thumb/5/56/DameonClarkeHS.png/330px-DameonClarkeHS.png?utm_source=en.wikipedia.org&utm_campaign=api&utm_content=thumbnail', true),

('daman-mills', 'Daman Mills', NULL, 'en', '1994-10-08',
'[{"characterName":"Freezer","series":"DBS, DBS Broly, Daima","notes":"Voix officielle américaine depuis Dragon Ball Super"}]',
'Comédien et directeur de doublage, voix américaine acclamée du tyran Freezer dans Dragon Ball Super et Dragon Ball Super: Broly.',
'https://thumb.wikimedia.org/wikipedia/commons/thumb/2/27/Daman_Mills_by_Gage_Skidmore.jpg/330px-Daman_Mills_by_Gage_Skidmore.jpg?utm_source=en.wikipedia.org&utm_campaign=api&utm_content=thumbnail', true)
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  roles = EXCLUDED.roles,
  biography = EXCLUDED.biography,
  image = EXCLUDED.image,
  visible = true;

-- 4. DOUBLAGE INTERNATIONAL (LatAm, ES, IT)
INSERT INTO bot.db_voice_actors (slug, name, name_ja, nationality, birth_date, roles, biography, image, visible)
VALUES
('gerardo-reyero', 'Gerardo Reyero', NULL, 'latam', '1965-10-02',
'[{"characterName":"Freezer","series":"DBZ, DBS","notes":"Voix latino-américaine légendaire de Freezer"}]',
'Comédien mexicain d''exception, voix mythique de Freezer dans toute l''Amérique latine, réputé pour son élégance machiavélique et son rire sadique.',
'https://thumb.wikimedia.org/wikipedia/commons/thumb/4/4c/Gerardo_Reyero_2018.jpg/330px-Gerardo_Reyero_2018.jpg?utm_source=es.wikipedia.org&utm_campaign=api&utm_content=thumbnail', true),

('carlos-segundo', 'Carlos Segundo', NULL, 'latam', '1956-09-16',
'[{"characterName":"Piccolo","series":"DBZ, DBS","notes":"Voix latino-américaine officielle de Piccolo"},{"characterName":"Kami-sama (Tout-Puissant)","series":"DB, DBZ","notes":"Dieu de la Terre"}]',
'Grande figure du doublage hispanophone, voix profonde et solennelle de Piccolo en Amérique latine depuis plus de trois décennies.',
'https://thumb.wikimedia.org/wikipedia/commons/thumb/2/27/Carlos_Segundo_2019.jpg/330px-Carlos_Segundo_2019.jpg?utm_source=es.wikipedia.org&utm_campaign=api&utm_content=thumbnail', true),

('laura-torres', 'Laura Torres', NULL, 'latam', '1967-08-15',
'[{"characterName":"Son Goku enfant","series":"DB","notes":"Voix latino-américaine de Goku petit"},{"characterName":"Son Gohan enfant","series":"DBZ","notes":"Gohan saga Saiyans et Namek"},{"characterName":"Son Goten enfant","series":"DBZ","notes":"Goten saga Buu"}]',
'L''équivalent mexicain de Masako Nozawa et Brigitte Lecordier, comédienne adorée ayant prêté sa voix à Goku, Gohan et Goten enfants dans toute l''Amérique latine.',
'https://thumb.wikimedia.org/wikipedia/commons/thumb/7/7b/Laura_Torres_2016.jpg/330px-Laura_Torres_2016.jpg?utm_source=es.wikipedia.org&utm_campaign=api&utm_content=thumbnail', true),

('gianluca-iacono', 'Gianluca Iacono', NULL, 'it', '1970-03-14',
'[{"characterName":"Vegeta","series":"DBZ, DBGT, DBS","notes":"Voix italienne officielle de Vegeta depuis 1999"}]',
'Comédien et doubleur italien emblématique, voix officielle de Vegeta en Italie depuis l''arc Saiyan sur la chaîne Italia 1 jusqu''à Dragon Ball Super.',
'https://thumb.wikimedia.org/wikipedia/commons/thumb/1/15/Gianluca_Iacono_2018.jpg/330px-Gianluca_Iacono_2018.jpg?utm_source=it.wikipedia.org&utm_campaign=api&utm_content=thumbnail', true)
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  roles = EXCLUDED.roles,
  biography = EXCLUDED.biography,
  image = EXCLUDED.image,
  visible = true;

COMMIT;
