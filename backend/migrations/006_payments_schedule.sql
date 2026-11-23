-- Card payment on the site (test mode until a payment provider is connected),
-- saved cards (only brand + last 4 digits + expiry — never the card number or CVC),
-- and a chosen time for the order.

ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_payment_check;
ALTER TABLE orders ADD CONSTRAINT orders_payment_check CHECK (payment IN ('cash', 'card', 'online'));
ALTER TABLE orders ADD COLUMN paid_at       TIMESTAMPTZ;
ALTER TABLE orders ADD COLUMN payment_test  BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE orders ADD COLUMN card_brand    TEXT;
ALTER TABLE orders ADD COLUMN card_last4    TEXT CHECK (card_last4 IS NULL OR card_last4 ~ '^[0-9]{4}$');
ALTER TABLE orders ADD COLUMN scheduled_for TIMESTAMPTZ;   -- NULL = as soon as possible

CREATE TABLE saved_cards (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id     BIGINT      NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token       TEXT        NOT NULL UNIQUE,          -- provider token (random in test mode)
  brand       TEXT        NOT NULL CHECK (brand IN ('visa', 'mastercard', 'amex', 'unionpay', 'card')),
  last4       TEXT        NOT NULL CHECK (last4 ~ '^[0-9]{4}$'),
  exp_month   INT         NOT NULL CHECK (exp_month BETWEEN 1 AND 12),
  exp_year    INT         NOT NULL CHECK (exp_year BETWEEN 2000 AND 2100),
  is_test     BOOLEAN     NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX saved_cards_user_idx ON saved_cards (user_id, created_at DESC);
