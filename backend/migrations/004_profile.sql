-- Profile details shown on the Account page
ALTER TABLE users ADD COLUMN IF NOT EXISTS phone TEXT CHECK (phone IS NULL OR length(phone) <= 30);
ALTER TABLE users ADD COLUMN IF NOT EXISTS city  TEXT CHECK (city IS NULL OR length(city) <= 80);
