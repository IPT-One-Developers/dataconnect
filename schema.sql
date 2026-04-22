CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$ BEGIN
  CREATE TYPE user_role AS ENUM ('admin', 'client');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE user_status AS ENUM ('active', 'suspended');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE sim_status AS ENUM ('active', 'inactive');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE bundle_status AS ENUM ('active', 'depleted', 'expired');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE order_status AS ENUM ('pending', 'completed', 'rejected');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE transaction_status AS ENUM ('success', 'failed', 'pending');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE,
  password_hash text NOT NULL,
  name text NOT NULL DEFAULT '',
  phone text NOT NULL DEFAULT '',
  role user_role NOT NULL DEFAULT 'client',
  status user_status NOT NULL DEFAULT 'active',
  photo_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS sessions_user_id_idx ON sessions(user_id);
CREATE INDEX IF NOT EXISTS sessions_expires_at_idx ON sessions(expires_at);

CREATE TABLE IF NOT EXISTS password_reset_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  ip text NOT NULL DEFAULT '',
  user_agent text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS password_reset_requests_created_at_idx ON password_reset_requests(created_at DESC);
CREATE INDEX IF NOT EXISTS password_reset_requests_email_created_at_idx ON password_reset_requests(email, created_at DESC);

CREATE TABLE IF NOT EXISTS data_packages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  amount_mb integer NOT NULL CHECK (amount_mb > 0),
  price numeric(12,2) NOT NULL CHECK (price >= 0),
  duration_days integer NOT NULL CHECK (duration_days > 0),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS data_packages_is_active_idx ON data_packages(is_active);

CREATE TABLE IF NOT EXISTS sim_cards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  iccid text NOT NULL UNIQUE,
  phone_number text NOT NULL UNIQUE,
  network text NOT NULL DEFAULT '',
  status sim_status NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS sim_cards_user_id_idx ON sim_cards(user_id);

CREATE TABLE IF NOT EXISTS active_bundles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  sim_card_id uuid NOT NULL REFERENCES sim_cards(id) ON DELETE CASCADE,
  package_id uuid NOT NULL REFERENCES data_packages(id) ON DELETE RESTRICT,
  total_amount_mb integer NOT NULL CHECK (total_amount_mb > 0),
  remaining_amount_mb integer NOT NULL CHECK (remaining_amount_mb >= 0),
  expiry_date timestamptz NOT NULL,
  status bundle_status NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS active_bundles_user_id_status_idx ON active_bundles(user_id, status);
CREATE INDEX IF NOT EXISTS active_bundles_expiry_date_idx ON active_bundles(expiry_date);

CREATE TABLE IF NOT EXISTS orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  package_id uuid NOT NULL REFERENCES data_packages(id) ON DELETE RESTRICT,
  sim_id uuid NOT NULL REFERENCES sim_cards(id) ON DELETE RESTRICT,
  reference text NOT NULL DEFAULT '',
  status order_status NOT NULL DEFAULT 'pending',
  amount numeric(12,2) NOT NULL CHECK (amount >= 0),
  package_name text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS orders_status_created_at_idx ON orders(status, created_at DESC);
CREATE INDEX IF NOT EXISTS orders_user_id_created_at_idx ON orders(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  package_id uuid REFERENCES data_packages(id) ON DELETE SET NULL,
  amount numeric(12,2) NOT NULL CHECK (amount >= 0),
  reference text NOT NULL DEFAULT '',
  payment_method text NOT NULL DEFAULT '',
  status transaction_status NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS transactions_user_id_created_at_idx ON transactions(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS transactions_status_created_at_idx ON transactions(status, created_at DESC);

CREATE TABLE IF NOT EXISTS user_preferences (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  expiry_reminders boolean NOT NULL DEFAULT true,
  reminder_days integer NOT NULL DEFAULT 3,
  low_balance_alerts boolean NOT NULL DEFAULT true,
  low_balance_threshold_mb integer NOT NULL DEFAULT 500,
  push_enabled boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS company_settings (
  id text PRIMARY KEY,
  company_name text NOT NULL DEFAULT 'DataConnect',
  support_email text NOT NULL DEFAULT '',
  support_phone text NOT NULL DEFAULT '',
  banking_details text NOT NULL DEFAULT '',
  logo_url text NOT NULL DEFAULT '',
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO company_settings (id)
VALUES ('global')
ON CONFLICT (id) DO NOTHING;
