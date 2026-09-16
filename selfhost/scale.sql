-- Zoru Shop — scale & safety indexes for the self-hosted database.
-- Safe to run multiple times. Speeds up shop listing, admin card lists,
-- balances, orders and deposits when stock and user count grow large.

-- Shop listing / filters
CREATE INDEX IF NOT EXISTS idx_products_active_created ON public.products (active, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_products_category        ON public.products (category_id);
CREATE INDEX IF NOT EXISTS idx_products_bin             ON public.products (bin);
CREATE INDEX IF NOT EXISTS idx_products_country         ON public.products (country);
CREATE INDEX IF NOT EXISTS idx_products_base            ON public.products (base);
CREATE INDEX IF NOT EXISTS idx_products_created         ON public.products (created_at DESC);

-- Key delivery (purchase picks the oldest unsold key for a product)
CREATE INDEX IF NOT EXISTS idx_keys_product_unsold ON public.product_keys (product_id, is_sold, created_at);
CREATE INDEX IF NOT EXISTS idx_keys_is_sold        ON public.product_keys (is_sold);
CREATE INDEX IF NOT EXISTS idx_keys_sold_to        ON public.product_keys (sold_to);

-- Money / history
CREATE INDEX IF NOT EXISTS idx_btx_user_created  ON public.balance_transactions (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_user       ON public.orders (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_order_items_order ON public.order_items (order_id);

-- Deposits
CREATE INDEX IF NOT EXISTS idx_deposits_user    ON public.deposits (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_deposits_status  ON public.deposits (status);
CREATE UNIQUE INDEX IF NOT EXISTS idx_deposits_invoice ON public.deposits (invoice_id) WHERE invoice_id IS NOT NULL;

-- Users / roles
CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_username ON public.profiles (lower(username));
CREATE INDEX IF NOT EXISTS idx_user_roles_user          ON public.user_roles (user_id);

-- Balance can never go below zero, even via admin adjustment.
ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_balance_nonnegative;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_balance_nonnegative CHECK (balance >= 0);

ANALYZE;
