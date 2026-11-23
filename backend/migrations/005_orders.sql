-- Online food orders (pay on pickup / delivery)
CREATE TABLE orders (
  id             BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id        BIGINT      NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  restaurant_id  BIGINT      NOT NULL REFERENCES restaurants(id),
  fulfillment    TEXT        NOT NULL CHECK (fulfillment IN ('pickup', 'delivery')),
  payment        TEXT        NOT NULL CHECK (payment IN ('cash', 'card')),
  address        TEXT        CHECK (address IS NULL OR length(address) <= 300),
  phone          TEXT        NOT NULL,
  note           TEXT        NOT NULL DEFAULT '',
  subtotal       NUMERIC(8,2) NOT NULL CHECK (subtotal >= 0),
  delivery_fee   NUMERIC(8,2) NOT NULL DEFAULT 0 CHECK (delivery_fee >= 0),
  total          NUMERIC(8,2) NOT NULL CHECK (total >= 0),
  status         TEXT        NOT NULL DEFAULT 'pending'
                 CHECK (status IN ('pending', 'confirmed', 'ready', 'completed', 'declined', 'cancelled')),
  admin_note     TEXT        NOT NULL DEFAULT '',
  locale         TEXT        NOT NULL DEFAULT 'az',
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (fulfillment = 'pickup' OR address IS NOT NULL)
);
CREATE INDEX orders_user_idx   ON orders (user_id, created_at DESC);
CREATE INDEX orders_status_idx ON orders (status, created_at DESC);

-- Name, size and price are copied at order time, so later menu changes don't rewrite old orders
CREATE TABLE order_items (
  id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  order_id      BIGINT       NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  dish_id       BIGINT       REFERENCES dishes(id) ON DELETE SET NULL,
  variant_code  TEXT,
  name          TEXT         NOT NULL,
  variant_label TEXT,
  image_url     TEXT,
  unit_price    NUMERIC(8,2) NOT NULL CHECK (unit_price >= 0),
  quantity      INT          NOT NULL CHECK (quantity BETWEEN 1 AND 20),
  line_total    NUMERIC(8,2) NOT NULL CHECK (line_total >= 0)
);
CREATE INDEX order_items_order_idx ON order_items (order_id);
