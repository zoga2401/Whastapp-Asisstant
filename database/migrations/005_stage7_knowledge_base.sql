-- Tahap 7: knowledge base bisnis. Safe to re-run and deliberately contains no facts.
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS products (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(), code VARCHAR(64) NOT NULL UNIQUE,
  name VARCHAR(200) NOT NULL, category VARCHAR(32) NOT NULL, brand VARCHAR(120),
  description TEXT, specifications JSONB NOT NULL DEFAULT '{}'::jsonb, unit VARCHAR(32) NOT NULL DEFAULT 'unit',
  status VARCHAR(16) NOT NULL DEFAULT 'ACTIVE', notes TEXT, source VARCHAR(16) NOT NULL DEFAULT 'ADMIN',
  last_verified_at TIMESTAMPTZ, updated_by VARCHAR(128), created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT products_status_ck CHECK (status IN ('ACTIVE','INACTIVE'))
);
CREATE TABLE IF NOT EXISTS product_variants (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(), product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  name VARCHAR(200) NOT NULL, specifications JSONB NOT NULL DEFAULT '{}'::jsonb, unit VARCHAR(32) NOT NULL DEFAULT 'unit',
  status VARCHAR(16) NOT NULL DEFAULT 'ACTIVE', source VARCHAR(16) NOT NULL DEFAULT 'ADMIN', last_verified_at TIMESTAMPTZ,
  updated_by VARCHAR(128), created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT product_variants_status_ck CHECK (status IN ('ACTIVE','INACTIVE')), UNIQUE(product_id,name)
);
CREATE TABLE IF NOT EXISTS services (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(), code VARCHAR(64) NOT NULL UNIQUE, name VARCHAR(200) NOT NULL,
  category VARCHAR(32) NOT NULL, description TEXT, unit VARCHAR(32) NOT NULL DEFAULT 'layanan', status VARCHAR(16) NOT NULL DEFAULT 'ACTIVE',
  notes TEXT, source VARCHAR(16) NOT NULL DEFAULT 'ADMIN', last_verified_at TIMESTAMPTZ, updated_by VARCHAR(128),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT services_status_ck CHECK (status IN ('ACTIVE','INACTIVE'))
);
CREATE TABLE IF NOT EXISTS price_lists (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(), product_id UUID REFERENCES products(id) ON DELETE CASCADE,
  product_variant_id UUID REFERENCES product_variants(id) ON DELETE CASCADE, service_id UUID REFERENCES services(id) ON DELETE CASCADE,
  price NUMERIC(14,2) NOT NULL CHECK (price >= 0), price_type VARCHAR(20) NOT NULL DEFAULT 'FIXED_PRICE',
  unit VARCHAR(32) NOT NULL DEFAULT 'unit', minimum_quantity INTEGER NOT NULL DEFAULT 1 CHECK (minimum_quantity > 0),
  valid_from TIMESTAMPTZ NOT NULL DEFAULT now(), valid_until TIMESTAMPTZ, status VARCHAR(16) NOT NULL DEFAULT 'ACTIVE',
  notes TEXT, source VARCHAR(16) NOT NULL DEFAULT 'ADMIN', last_verified_at TIMESTAMPTZ, updated_by VARCHAR(128),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT price_target_ck CHECK (((product_id IS NOT NULL)::int + (product_variant_id IS NOT NULL)::int + (service_id IS NOT NULL)::int) = 1),
  CONSTRAINT price_type_ck CHECK (price_type IN ('FIXED_PRICE','STARTING_PRICE','PRICE_RANGE','CONTACT_ADMIN')),
  CONSTRAINT price_status_ck CHECK (status IN ('ACTIVE','INACTIVE')), CONSTRAINT price_dates_ck CHECK (valid_until IS NULL OR valid_until >= valid_from)
);
CREATE TABLE IF NOT EXISTS service_areas (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(), name VARCHAR(160) NOT NULL, city VARCHAR(120), province VARCHAR(120),
  status VARCHAR(16) NOT NULL DEFAULT 'ACTIVE', notes TEXT, source VARCHAR(16) NOT NULL DEFAULT 'ADMIN', last_verified_at TIMESTAMPTZ,
  updated_by VARCHAR(128), created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT service_areas_status_ck CHECK (status IN ('ACTIVE','INACTIVE')), UNIQUE(name, city, province)
);
CREATE TABLE IF NOT EXISTS warranties (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(), product_id UUID REFERENCES products(id) ON DELETE CASCADE, service_id UUID REFERENCES services(id) ON DELETE CASCADE,
  duration INTEGER NOT NULL CHECK (duration > 0), unit VARCHAR(24) NOT NULL, description TEXT, conditions TEXT,
  status VARCHAR(16) NOT NULL DEFAULT 'ACTIVE', source VARCHAR(16) NOT NULL DEFAULT 'ADMIN', last_verified_at TIMESTAMPTZ, updated_by VARCHAR(128),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT warranty_target_ck CHECK (((product_id IS NOT NULL)::int + (service_id IS NOT NULL)::int) = 1),
  CONSTRAINT warranties_status_ck CHECK (status IN ('ACTIVE','INACTIVE'))
);
CREATE TABLE IF NOT EXISTS faqs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(), category VARCHAR(64) NOT NULL, question TEXT NOT NULL, answer TEXT NOT NULL,
  keywords TEXT[] NOT NULL DEFAULT '{}', status VARCHAR(16) NOT NULL DEFAULT 'ACTIVE', priority INTEGER NOT NULL DEFAULT 0,
  source VARCHAR(16) NOT NULL DEFAULT 'ADMIN', last_verified_at TIMESTAMPTZ, updated_by VARCHAR(128), created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT faqs_status_ck CHECK (status IN ('ACTIVE','INACTIVE'))
);
CREATE TABLE IF NOT EXISTS business_rules (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(), rule_key VARCHAR(100) NOT NULL UNIQUE, rule_name VARCHAR(200) NOT NULL,
  rule_value TEXT NOT NULL, description TEXT, status VARCHAR(16) NOT NULL DEFAULT 'ACTIVE', priority INTEGER NOT NULL DEFAULT 0,
  source VARCHAR(16) NOT NULL DEFAULT 'ADMIN', last_verified_at TIMESTAMPTZ, updated_by VARCHAR(128), created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT business_rules_status_ck CHECK (status IN ('ACTIVE','INACTIVE'))
);
CREATE INDEX IF NOT EXISTS idx_kb_products_search ON products USING gin (to_tsvector('simple', name || ' ' || code || ' ' || coalesce(description,'')));
CREATE INDEX IF NOT EXISTS idx_kb_variants_product ON product_variants(product_id);
CREATE INDEX IF NOT EXISTS idx_kb_prices_valid ON price_lists(status, valid_from, valid_until);
CREATE INDEX IF NOT EXISTS idx_kb_areas_name ON service_areas(lower(name), status);
CREATE INDEX IF NOT EXISTS idx_kb_faq_keywords ON faqs USING gin(keywords);
