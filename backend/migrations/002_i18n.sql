-- Tastewise — translations (az / en / ru)
-- English stays in the existing columns; other languages live in JSONB:
--   dishes.translations      {"az": {"name": "...", "description": "..."}, "ru": {...}}
--   categories.name_i18n     {"az": "...", "ru": "..."}
--   ingredients.name_i18n    {"az": "...", "ru": "..."}
--   restaurants.translations {"az": {"description": "...", "address": "...", "city": "..."}, "ru": {...}}

ALTER TABLE dishes      ADD COLUMN translations JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE categories  ADD COLUMN name_i18n    JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE ingredients ADD COLUMN name_i18n    JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE restaurants ADD COLUMN translations JSONB NOT NULL DEFAULT '{}'::jsonb;

-- Language used for a user's emails (set from the site language at sign-up / login)
ALTER TABLE users ADD COLUMN locale TEXT NOT NULL DEFAULT 'az' CHECK (locale IN ('az', 'en', 'ru'));
