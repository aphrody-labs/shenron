-- Relations familiales de Son Goku (character_id = 1)
INSERT INTO bot.db_character_relations (character_id, related_character_id, category, relation_type, name, name_ja, slug, sort_order) VALUES
(1, NULL, 'family', 'Père', 'Bardock', 'バーダック', 'baddack', 1),
(1, NULL, 'family', 'Mère', 'Gine', 'ギネ', 'gine', 2),
(1, NULL, 'family', 'Grand-père adoptif', 'Grand-père Son Gohan', '孫悟飯（じいちゃん）', 'grand-pere-gohan', 3),
(1, NULL, 'family', 'Frère aîné', 'Raditz', 'ラディッツ', 'raditz', 4),
(1, NULL, 'family', 'Épouse', 'Chichi', 'チチ', 'chichi', 5),
(1, NULL, 'family', 'Beau-père', 'Gyumao (Roi Taureau)', '牛魔王', 'gyumao', 6),
(1, NULL, 'family', 'Fils aîné', 'Son Gohan', '孫悟飯', 'son-gohan', 7),
(1, NULL, 'family', 'Fils cadet', 'Son Goten', '孫悟天', 'son-goten', 8),
(1, NULL, 'family', 'Belle-fille', 'Videl', 'ビーデル', 'videl', 9),
(1, NULL, 'family', 'Petite-fille', 'Pan', 'パン', 'pan', 10);

-- Amis & Alliés de Son Goku
INSERT INTO bot.db_character_relations (character_id, related_character_id, category, relation_type, name, name_ja, slug, sort_order) VALUES
(1, NULL, 'friend', 'Meilleur ami', 'Krillin', 'クリリン', 'krillin', 11),
(1, NULL, 'friend', 'Première amie & Alliée historique', 'Bulma', 'ブルマ', 'bulma', 12),
(1, NULL, 'friend', 'Maître d''arts martiaux', 'Tortue Géniale (Kame Sennin)', '武天老師', 'tortue-geniale', 13),
(1, NULL, 'friend', 'Allié & Frère d''armes', 'Piccolo', 'ピッコロ', 'piccolo', 14),
(1, NULL, 'friend', 'Rival éternel & Allié', 'Vegeta', 'ベジータ', 'vegeta', 15),
(1, NULL, 'friend', 'Compagnon de combat', 'Yamcha', 'ヤムチャ', 'yamcha', 16),
(1, NULL, 'friend', 'Compagnon de combat', 'Tenshinhan', '天津飯', 'tenshinhan', 17),
(1, NULL, 'friend', 'Allié', 'Chaozu', '餃子', 'chaozu', 18),
(1, NULL, 'friend', 'Disciple & Réincarnation de Buu', 'Uub', 'ウーブ', 'uub', 19);

-- Ennemis & Rivaux de Son Goku
INSERT INTO bot.db_character_relations (character_id, related_character_id, category, relation_type, name, name_ja, slug, sort_order) VALUES
(1, 90, 'enemy', 'Ennemi ultime & Destructeur cosmique', 'Kid Buu / Majin Buu Pur', '魔人ブウ（純粋）', 'kid-buu', 20),
(1, NULL, 'enemy', 'Ennemi juré impérial', 'Freezer', 'フリーザ', 'freezer', 21),
(1, NULL, 'enemy', 'Création cybernétique parfaite', 'Cell', 'セル', 'cell', 22),
(1, NULL, 'enemy', 'Tyran démon du passé', 'Piccolo Daimaô', 'ピッコロ大魔王', 'piccolo-daimao', 23),
(1, NULL, 'enemy', 'Commandant de l''armée', 'Général Red', 'レッド総帥', 'general-red', 24);

-- Relations de Kid Buu (character_id = 90)
INSERT INTO bot.db_character_relations (character_id, related_character_id, category, relation_type, name, name_ja, slug, sort_order) VALUES
(90, NULL, 'family', 'Créateur / Invocateur d''origine', 'Bibidi', 'ビビディ', 'bibidi', 1),
(90, NULL, 'family', 'Fils du créateur (Maître temporaire)', 'Babidi', 'バビディ', 'babidi', 2),
(90, NULL, 'family', 'Partie bienveillante extraite', 'Majin Boo (bon / Gros Buu)', '魔人ブウ（善）', 'majin-buu-bon', 3),
(90, 1, 'enemy', 'Adversaire mortel & Tombeur au Genkidama', 'Son Goku', '孫悟空', 'son-goku', 4),
(90, NULL, 'enemy', 'Adversaire & Rempart au Kaioshinkai', 'Vegeta', 'ベジータ', 'vegeta', 5),
(90, NULL, 'enemy', 'Victimes divines & Dieux Créateurs', 'Les Kaioshins', '界王神', 'kaioshin', 6);
