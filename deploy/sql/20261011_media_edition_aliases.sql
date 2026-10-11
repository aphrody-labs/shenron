-- SPDX-License-Identifier: Apache-2.0
-- Additive Infra migration. Apply once by content hash, never replay old migrations.
SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '15s';
SET LOCAL ROLE shenron;
LOCK TABLE bot.media_editions, bot.media_volumes IN SHARE ROW EXCLUSIVE MODE;

DO $guard$
DECLARE pair record;
BEGIN
  IF (SELECT count(*) FROM bot.media_editions) <> 8 THEN
    RAISE EXCEPTION 'Edition snapshot changed; review this migration again';
  END IF;
  FOR pair IN SELECT * FROM (VALUES (5,1),(6,2),(7,3),(8,4)) AS pairs(alias_id,canonical_id)
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM bot.media_editions a JOIN bot.media_editions c ON c.id=pair.canonical_id
      WHERE a.id=pair.alias_id AND NOT a.visible AND c.visible
        AND (to_jsonb(a)-'id'-'visible')=(to_jsonb(c)-'id'-'visible')
    ) OR EXISTS (SELECT 1 FROM bot.media_volumes WHERE edition_id=pair.alias_id) THEN
      RAISE EXCEPTION 'Alias pair % differs or has dependents; abort', pair.alias_id;
    END IF;
  END LOOP;
  PERFORM set_config('shenron.consolidation_editions_fingerprint',
    (SELECT md5(string_agg(row_to_json(e)::text,E'\n' ORDER BY id)) FROM bot.media_editions e),true);
  PERFORM set_config('shenron.consolidation_volumes_fingerprint',
    (SELECT coalesce(md5(string_agg(row_to_json(v)::text,E'\n' ORDER BY id)),'') FROM bot.media_volumes v),true);
END
$guard$;

CREATE TABLE bot.media_edition_aliases (
  alias_id bigint PRIMARY KEY REFERENCES bot.media_editions(id),
  canonical_id bigint NOT NULL REFERENCES bot.media_editions(id),
  reason text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_by text NOT NULL DEFAULT CURRENT_USER,
  -- This reviewed batch admits only these four one-hop mappings.
  CONSTRAINT media_edition_aliases_reviewed_pairs CHECK (
    (alias_id,canonical_id) IN ((5,1),(6,2),(7,3),(8,4))
  )
);
INSERT INTO bot.media_edition_aliases(alias_id,canonical_id,reason) VALUES
  (5,1,'Exact edition payload except retained legacy ID and logical visibility'),
  (6,2,'Exact edition payload except retained legacy ID and logical visibility'),
  (7,3,'Exact edition payload except retained legacy ID and logical visibility'),
  (8,4,'Exact edition payload except retained legacy ID and logical visibility');

-- Match the writer identity fields: labels and page colors distinguish editions.
-- Global equivalent ISBN checking remains serialized in the canonical writer.
CREATE UNIQUE INDEX media_editions_visible_identity_idx ON bot.media_editions (
  work_id,edition,language,lower(trim(label)),page_color,
  upper(regexp_replace(isbn,'[[:space:]-]','','g'))
) NULLS NOT DISTINCT WHERE visible;

CREATE VIEW bot.media_edition_resolution AS
  SELECT e.id AS requested_id,coalesce(a.canonical_id,e.id) AS canonical_id
  FROM bot.media_editions e LEFT JOIN bot.media_edition_aliases a ON a.alias_id=e.id;

CREATE FUNCTION bot.resolve_media_edition_id(requested_id bigint)
RETURNS bigint LANGUAGE sql STABLE
SET search_path=pg_catalog,bot AS $resolve$
  SELECT coalesce((SELECT canonical_id FROM bot.media_edition_aliases WHERE alias_id=requested_id),requested_id)
$resolve$;

CREATE FUNCTION bot.guard_retained_media_edition() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,bot AS $retained$
BEGIN
  IF EXISTS (SELECT 1 FROM bot.media_edition_aliases WHERE alias_id=OLD.id) THEN
    RAISE EXCEPTION 'Retained edition alias % is read-only; use its canonical ID',OLD.id;
  END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END
$retained$;
CREATE TRIGGER media_editions_retained_alias BEFORE UPDATE OR DELETE ON bot.media_editions
FOR EACH ROW EXECUTE FUNCTION bot.guard_retained_media_edition();

CREATE FUNCTION bot.canonicalize_media_volume_edition() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,bot AS $volume$
BEGIN
  NEW.edition_id:=bot.resolve_media_edition_id(NEW.edition_id);
  RETURN NEW;
END
$volume$;
CREATE TRIGGER media_volumes_canonical_edition BEFORE INSERT OR UPDATE OF edition_id ON bot.media_volumes
FOR EACH ROW EXECUTE FUNCTION bot.canonicalize_media_volume_edition();

DO $verify$
BEGIN
  IF (SELECT md5(string_agg(row_to_json(e)::text,E'\n' ORDER BY id)) FROM bot.media_editions e)
    <> current_setting('shenron.consolidation_editions_fingerprint')
    OR (SELECT md5(string_agg(row_to_json(v)::text,E'\n' ORDER BY id)) FROM bot.media_volumes v)
    IS DISTINCT FROM nullif(current_setting('shenron.consolidation_volumes_fingerprint'),'') THEN
    RAISE EXCEPTION 'Original editorial rows changed; abort';
  END IF;
  IF (SELECT count(*) FROM bot.media_edition_aliases) <> 4
    OR (SELECT count(*) FROM bot.media_edition_resolution) <> 8 THEN
    RAISE EXCEPTION 'Alias/view coverage differs; abort';
  END IF;
END
$verify$;
