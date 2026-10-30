-- Type and nullability parity between production and the Drizzle schema (bot-schema.ts).
-- Measured on production before this migration: every converted value is valid JSON or 0/1, and
-- every column made NOT NULL has no NULL (db_tournaments.saga and db_voice_actors.biography do,
-- so the schema makes those two nullable instead). Idempotent: each step checks the current type.

-- Columns declared jsonb that were created as text (the API contract expected real arrays).
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT * FROM (VALUES
    ('db_battles', 'combatants'),
    ('db_battles', 'techniques_used'),
    ('db_battles', 'article_sources'),
    ('dragonballcn_volumes', 'pages'),
    ('db_dragons', 'article_sources'),
    ('db_items', 'article_sources'),
    ('db_locations', 'key_events'),
    ('db_locations', 'article_sources'),
    ('db_soundtracks', 'article_sources'),
    ('db_timeline_events', 'characters_involved'),
    ('db_tournaments', 'notable_matches'),
    ('db_tournaments', 'article_sources'),
    ('db_voice_actors', 'roles'),
    ('db_voice_actors', 'article_sources'),
    ('db_power_levels', 'article_sources'),
    ('db_timeline_events', 'article_sources'),
    ('db_wishes', 'article_sources')
  ) AS v(t, c) LOOP
    IF (SELECT data_type FROM information_schema.columns
        WHERE table_schema = 'bot' AND table_name = r.t AND column_name = r.c) = 'text' THEN
      EXECUTE format('ALTER TABLE bot.%I ALTER COLUMN %I TYPE jsonb USING %I::jsonb', r.t, r.c, r.c);
    END IF;
  END LOOP;
END $$;
--> statement-breakpoint

-- Flags declared boolean that were created as bigint 0/1.
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT * FROM (VALUES
    ('db_battles', 'canon'),
    ('db_power_levels', 'canon'),
    ('db_timeline_events', 'canon'),
    ('db_tournaments', 'canon'),
    ('db_wishes', 'granted'),
    ('db_wishes', 'canon')
  ) AS v(t, c) LOOP
    IF (SELECT data_type FROM information_schema.columns
        WHERE table_schema = 'bot' AND table_name = r.t AND column_name = r.c) = 'bigint' THEN
      EXECUTE format('ALTER TABLE bot.%I ALTER COLUMN %I TYPE boolean USING %I <> 0', r.t, r.c, r.c);
    END IF;
  END LOOP;
END $$;
--> statement-breakpoint

-- Columns declared NOT NULL that production allowed to be NULL (none holds a NULL today).
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT * FROM (VALUES
    ('db_battles', 'slug'),
    ('db_battles', 'title'),
    ('db_battles', 'series'),
    ('db_battles', 'combatants'),
    ('db_battles', 'canon'),
    ('dragonballcn_volumes', 'category'),
    ('dragonballcn_volumes', 'title'),
    ('dragonballcn_volumes', 'total_pages'),
    ('dragonballcn_volumes', 'pages'),
    ('db_dragons', 'slug'),
    ('db_dragons', 'name'),
    ('db_dragons', 'balls_count'),
    ('db_dragons', 'wishes_count'),
    ('db_items', 'slug'),
    ('db_items', 'name'),
    ('db_items', 'category'),
    ('db_items', 'description'),
    ('db_locations', 'slug'),
    ('db_locations', 'name'),
    ('db_locations', 'realm_type'),
    ('db_locations', 'description'),
    ('db_news', 'title'),
    ('db_power_levels', 'character_name'),
    ('db_power_levels', 'battle_power_display'),
    ('db_power_levels', 'source_kind'),
    ('db_power_levels', 'canon'),
    ('db_soundtracks', 'slug'),
    ('db_soundtracks', 'title'),
    ('db_soundtracks', 'track_type'),
    ('db_soundtracks', 'series'),
    ('db_soundtracks', 'artist'),
    ('db_soundtracks', 'description'),
    ('db_timeline_events', 'age_year'),
    ('db_timeline_events', 'era'),
    ('db_timeline_events', 'title'),
    ('db_timeline_events', 'description'),
    ('db_timeline_events', 'canon'),
    ('db_timeline_events', 'order_idx'),
    ('db_tournaments', 'slug'),
    ('db_tournaments', 'name'),
    ('db_tournaments', 'tournament_type'),
    ('db_tournaments', 'rules_summary'),
    ('db_tournaments', 'canon'),
    ('db_voice_actors', 'slug'),
    ('db_voice_actors', 'name'),
    ('db_voice_actors', 'nationality'),
    ('db_voice_actors', 'roles'),
    ('db_wishes', 'dragon_id'),
    ('db_wishes', 'dragon_name'),
    ('db_wishes', 'whisperer'),
    ('db_wishes', 'saga'),
    ('db_wishes', 'wish_text'),
    ('db_wishes', 'granted'),
    ('db_wishes', 'canon')
  ) AS v(t, c) LOOP
    EXECUTE format('ALTER TABLE bot.%I ALTER COLUMN %I SET NOT NULL', r.t, r.c);
  END LOOP;
END $$;
