-- Tastewise — price variants (pizza sizes, chicken / meat), best sellers, newsletter

-- e.g. Margherita: 18 cm 8.80 ₼, 30 cm 12.50 ₼, 35 cm 16.80 ₼
CREATE TABLE dish_variants (
  id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  dish_id    BIGINT       NOT NULL REFERENCES dishes(id) ON DELETE CASCADE,
  code       TEXT         NOT NULL,                       -- "18", "30", "chicken", "meat"
  label      TEXT         NOT NULL,                       -- English label, e.g. "18 cm"
  label_i18n JSONB        NOT NULL DEFAULT '{}'::jsonb,   -- {"az": "18 sm", "ru": "18 см"}
  price      NUMERIC(8,2) NOT NULL CHECK (price >= 0),
  sort_order INT          NOT NULL DEFAULT 0,
  UNIQUE (dish_id, code)
);
CREATE INDEX dish_variants_dish_idx ON dish_variants (dish_id, sort_order);

-- dishes.price keeps the lowest price ("from 8.80 ₼"), so budget filters keep working
ALTER TABLE dishes ADD COLUMN is_best_seller BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE newsletter_subscribers (
  id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  email      TEXT        NOT NULL UNIQUE CHECK (email = lower(email)),
  locale     TEXT        NOT NULL DEFAULT 'az',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
