-- Tastewise — initial schema (PostgreSQL 14+)

-- ---------- Users & auth ----------
CREATE TABLE users (
  id                  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  full_name           TEXT        NOT NULL CHECK (char_length(full_name) BETWEEN 2 AND 80),
  email               TEXT        NOT NULL UNIQUE CHECK (email = lower(email)),
  password_hash       TEXT        NOT NULL,
  role                TEXT        NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin')),
  email_verified_at   TIMESTAMPTZ,
  password_changed_at TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One row per code sent. Only the SHA-256 hash of the code is stored.
CREATE TABLE verification_codes (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id     BIGINT      NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  purpose     TEXT        NOT NULL CHECK (purpose IN ('verify_email', 'reset_password')),
  code_hash   TEXT        NOT NULL,
  expires_at  TIMESTAMPTZ NOT NULL,
  attempts    INT         NOT NULL DEFAULT 0,
  consumed_at TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX verification_codes_lookup_idx ON verification_codes (user_id, purpose, created_at DESC);

-- ---------- Restaurant & menu ----------
CREATE TABLE restaurants (
  id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  slug          TEXT  NOT NULL UNIQUE,
  name          TEXT  NOT NULL,
  description   TEXT,
  address       TEXT,
  city          TEXT,
  phone         TEXT,
  email         TEXT,
  opening_hours JSONB NOT NULL DEFAULT '{}'::jsonb,   -- {"mon": ["10:00","23:00"], ...}
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE categories (
  id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  slug       TEXT NOT NULL UNIQUE,
  name       TEXT NOT NULL,
  sort_order INT  NOT NULL DEFAULT 0
);

CREATE TABLE dishes (
  id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  restaurant_id BIGINT       NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  category_id   BIGINT       NOT NULL REFERENCES categories(id),
  slug          TEXT         NOT NULL,
  name          TEXT         NOT NULL,
  description   TEXT         NOT NULL DEFAULT '',
  price         NUMERIC(8,2) NOT NULL CHECK (price >= 0),
  cuisine       TEXT         NOT NULL,
  spice_level   SMALLINT     NOT NULL DEFAULT 0 CHECK (spice_level BETWEEN 0 AND 3),
  diet_tags     TEXT[]       NOT NULL DEFAULT '{}',   -- vegetarian, vegan, gluten-free, dairy-free
  mood_tags     TEXT[]       NOT NULL DEFAULT '{}',   -- light, hearty, comfort, celebration
  meal_times    TEXT[]       NOT NULL DEFAULT '{}',   -- breakfast, lunch, dinner, dessert, drink
  image_url     TEXT,
  is_available  BOOLEAN      NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ  NOT NULL DEFAULT now(),
  UNIQUE (restaurant_id, slug)
);
CREATE INDEX dishes_price_idx      ON dishes (price);
CREATE INDEX dishes_category_idx   ON dishes (category_id);
CREATE INDEX dishes_diet_tags_idx  ON dishes USING GIN (diet_tags);
CREATE INDEX dishes_meal_times_idx ON dishes USING GIN (meal_times);

CREATE TABLE ingredients (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name        TEXT    NOT NULL UNIQUE CHECK (name = lower(name)),
  is_allergen BOOLEAN NOT NULL DEFAULT false
);

CREATE TABLE dish_ingredients (
  dish_id       BIGINT NOT NULL REFERENCES dishes(id) ON DELETE CASCADE,
  ingredient_id BIGINT NOT NULL REFERENCES ingredients(id) ON DELETE CASCADE,
  PRIMARY KEY (dish_id, ingredient_id)
);
CREATE INDEX dish_ingredients_ingredient_idx ON dish_ingredients (ingredient_id);

-- ---------- User activity ----------
CREATE TABLE reviews (
  id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id    BIGINT      NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  dish_id    BIGINT      NOT NULL REFERENCES dishes(id) ON DELETE CASCADE,
  rating     SMALLINT    NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment    TEXT        NOT NULL DEFAULT '' CHECK (char_length(comment) <= 1000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, dish_id)
);
CREATE INDEX reviews_dish_idx ON reviews (dish_id, created_at DESC);

CREATE TABLE favorites (
  user_id    BIGINT      NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  dish_id    BIGINT      NOT NULL REFERENCES dishes(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, dish_id)
);

CREATE TABLE reservations (
  id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id       BIGINT      NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  restaurant_id BIGINT      NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  reserved_at   TIMESTAMPTZ NOT NULL,
  guests        SMALLINT    NOT NULL CHECK (guests BETWEEN 1 AND 20),
  phone         TEXT        NOT NULL,
  note          TEXT        NOT NULL DEFAULT '' CHECK (char_length(note) <= 500),
  status        TEXT        NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending', 'confirmed', 'declined', 'cancelled')),
  admin_note    TEXT        NOT NULL DEFAULT '',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX reservations_restaurant_time_idx ON reservations (restaurant_id, reserved_at);
CREATE INDEX reservations_user_idx            ON reservations (user_id, reserved_at DESC);
