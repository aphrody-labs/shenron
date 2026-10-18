UPDATE bot.db_episodes 
SET players = jsonb_build_array(
  jsonb_build_object(
    'lang', 'vostfr', 
    'name', 'Crunchyroll HD', 
    'embedUrl', 'https://www.crunchyroll.com/fr/watch/GE00389313JAJP/the-god-who-destroys', 
    'provider', 'crunchyroll'
  )
) 
WHERE id = 875;
