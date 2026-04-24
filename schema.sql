CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$ BEGIN
  CREATE TYPE user_role AS ENUM ('admin', 'staff', 'client');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TYPE user_role ADD VALUE 'staff';
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

CREATE UNIQUE INDEX IF NOT EXISTS users_phone_unique_idx ON users(phone) WHERE phone <> '';

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
  order_index integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS data_packages_is_active_idx ON data_packages(is_active);
CREATE INDEX IF NOT EXISTS data_packages_order_index_idx ON data_packages(order_index);

ALTER TABLE data_packages ADD COLUMN IF NOT EXISTS order_index integer NOT NULL DEFAULT 0;

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
  payment_method text NOT NULL DEFAULT '',
  status order_status NOT NULL DEFAULT 'pending',
  amount numeric(12,2) NOT NULL CHECK (amount >= 0),
  package_name text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS orders_status_created_at_idx ON orders(status, created_at DESC);
CREATE INDEX IF NOT EXISTS orders_user_id_created_at_idx ON orders(user_id, created_at DESC);

ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_method text NOT NULL DEFAULT '';

CREATE TABLE IF NOT EXISTS lte_packages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  data_cap_gb numeric(12,2),
  day_cap_gb numeric(12,2),
  night_cap_gb numeric(12,2),
  speed_mbps integer,
  network text NOT NULL DEFAULT 'MTN',
  fup text NOT NULL DEFAULT '',
  price numeric(12,2) NOT NULL CHECK (price >= 0),
  duration_days integer NOT NULL CHECK (duration_days > 0),
  is_active boolean NOT NULL DEFAULT true,
  order_index integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS lte_packages_is_active_idx ON lte_packages(is_active);
CREATE INDEX IF NOT EXISTS lte_packages_order_index_idx ON lte_packages(order_index);

CREATE TABLE IF NOT EXISTS lte_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  package_id uuid NOT NULL REFERENCES lte_packages(id) ON DELETE RESTRICT,
  status order_status NOT NULL DEFAULT 'pending',
  amount numeric(12,2) NOT NULL CHECK (amount >= 0),
  package_amount numeric(12,2) NOT NULL DEFAULT 0 CHECK (package_amount >= 0),
  delivery_fee numeric(12,2) NOT NULL DEFAULT 149 CHECK (delivery_fee >= 0),
  package_name text NOT NULL DEFAULT '',
  reference text NOT NULL DEFAULT '',
  payment_method text NOT NULL DEFAULT '',
  address text NOT NULL DEFAULT '',
  notes text NOT NULL DEFAULT '',
  admin_comment text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS lte_orders_status_created_at_idx ON lte_orders(status, created_at DESC);
CREATE INDEX IF NOT EXISTS lte_orders_user_id_created_at_idx ON lte_orders(user_id, created_at DESC);

ALTER TABLE lte_orders ADD COLUMN IF NOT EXISTS package_amount numeric(12,2) NOT NULL DEFAULT 0;
ALTER TABLE lte_orders ADD COLUMN IF NOT EXISTS delivery_fee numeric(12,2) NOT NULL DEFAULT 149;
ALTER TABLE lte_orders ADD COLUMN IF NOT EXISTS reference text NOT NULL DEFAULT '';
ALTER TABLE lte_orders ADD COLUMN IF NOT EXISTS payment_method text NOT NULL DEFAULT '';

CREATE TABLE IF NOT EXISTS sim_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  network text NOT NULL DEFAULT '',
  address text NOT NULL DEFAULT '',
  notes text NOT NULL DEFAULT '',
  reference text NOT NULL DEFAULT '',
  payment_method text NOT NULL DEFAULT '',
  amount numeric(12,2) NOT NULL DEFAULT 99 CHECK (amount >= 0),
  status order_status NOT NULL DEFAULT 'pending',
  admin_comment text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS sim_orders_status_created_at_idx ON sim_orders(status, created_at DESC);
CREATE INDEX IF NOT EXISTS sim_orders_user_id_created_at_idx ON sim_orders(user_id, created_at DESC);

ALTER TABLE sim_orders ADD COLUMN IF NOT EXISTS reference text NOT NULL DEFAULT '';
ALTER TABLE sim_orders ADD COLUMN IF NOT EXISTS payment_method text NOT NULL DEFAULT '';
ALTER TABLE sim_orders ADD COLUMN IF NOT EXISTS amount numeric(12,2) NOT NULL DEFAULT 99;

DO $$ BEGIN
  CREATE TYPE coverage_status AS ENUM ('open', 'responded', 'closed');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS coverage_checks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  network_preference text NOT NULL DEFAULT '',
  address text NOT NULL DEFAULT '',
  notes text NOT NULL DEFAULT '',
  status coverage_status NOT NULL DEFAULT 'open',
  admin_comment text NOT NULL DEFAULT '',
  suggested_package_ids uuid[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS coverage_checks_status_created_at_idx ON coverage_checks(status, created_at DESC);
CREATE INDEX IF NOT EXISTS coverage_checks_user_id_created_at_idx ON coverage_checks(user_id, created_at DESC);

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
  company_name text NOT NULL DEFAULT 'IPT-NeT',
  support_email text NOT NULL DEFAULT '',
  support_phone text NOT NULL DEFAULT '',
  banking_details text NOT NULL DEFAULT '',
  logo_url text NOT NULL DEFAULT '',
  payment_processors jsonb NOT NULL DEFAULT '[]'::jsonb,
  payment_processor_settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  smtp_enabled boolean NOT NULL DEFAULT false,
  smtp_host text NOT NULL DEFAULT '',
  smtp_port integer NOT NULL DEFAULT 587,
  smtp_secure boolean NOT NULL DEFAULT false,
  smtp_user text NOT NULL DEFAULT '',
  smtp_pass text NOT NULL DEFAULT '',
  smtp_pass_enc bytea,
  smtp_from_email text NOT NULL DEFAULT '',
  smtp_from_name text NOT NULL DEFAULT '',
  notification_emails jsonb NOT NULL DEFAULT '[]'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO company_settings (id)
VALUES ('global')
ON CONFLICT (id) DO NOTHING;
