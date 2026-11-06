-- =====================================================================
--  PG Manager - database schema
--  Reconstructed from the application code (controllers, middleware,
--  migrate_v2 / migrate_v3 and the seed data).
--
--  Rules for this file
--   * Safe to run many times: every statement is IF NOT EXISTS / guarded.
--   * Never drops, truncates or rewrites existing data.
--   * An existing (production) database is only EXTENDED: missing columns,
--     indexes, triggers and the receipt function are added; existing tables,
--     constraints and rows are left untouched.
--   * Executed inside one transaction by migrate.js (all or nothing).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 0. UUID generation.  gen_random_uuid() is built in from PostgreSQL 13.
--    On older servers fall back to the pgcrypto extension.
-- ---------------------------------------------------------------------
DO $$
BEGIN
  IF current_setting('server_version_num')::int < 130000 THEN
    BEGIN
      CREATE EXTENSION IF NOT EXISTS pgcrypto;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Could not create pgcrypto (%). Create it manually on PostgreSQL < 13.', SQLERRM;
    END;
  END IF;
END $$;

-- ---------------------------------------------------------------------
-- 1. Trigger function: keep updated_at current
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ---------------------------------------------------------------------
-- 2. Tables (parents first)
-- ---------------------------------------------------------------------

-- Platform super admins
CREATE TABLE IF NOT EXISTS master_admins (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        VARCHAR(100) NOT NULL,
  email       VARCHAR(150) NOT NULL UNIQUE,
  password    VARCHAR(255) NOT NULL,
  is_active   BOOLEAN      NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- PG owners (created by invite; password is NULL until the invite is accepted)
CREATE TABLE IF NOT EXISTS owners (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name            VARCHAR(100) NOT NULL,
  email           VARCHAR(150) NOT NULL UNIQUE,
  phone           VARCHAR(20)  UNIQUE,
  password        VARCHAR(255),
  invite_token    VARCHAR(255),
  invite_accepted BOOLEAN      NOT NULL DEFAULT FALSE,
  is_active       BOOLEAN      NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- Paying properties
CREATE TABLE IF NOT EXISTS pgs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id        UUID         NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  name            VARCHAR(150) NOT NULL,
  city            VARCHAR(100),
  address         TEXT,
  phone           VARCHAR(20),
  email           VARCHAR(150),
  gstin           VARCHAR(30),
  logo_url        TEXT,
  total_rooms     INTEGER      NOT NULL DEFAULT 0,
  total_beds      INTEGER      NOT NULL DEFAULT 0,
  is_active       BOOLEAN      NOT NULL DEFAULT TRUE,
  -- public listing / location (migrate v2/v3)
  lat             NUMERIC(10,7),
  lng             NUMERIC(10,7),
  description     TEXT,
  pg_type         VARCHAR(30)  DEFAULT 'mixed',
  amenities_list  TEXT[]       DEFAULT '{}',
  images          JSONB        DEFAULT '[]',
  rules           TEXT,
  nearby          TEXT,
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- Managers / staff of a PG (login accounts)
CREATE TABLE IF NOT EXISTS pg_staff (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pg_id       UUID         NOT NULL REFERENCES pgs(id) ON DELETE CASCADE,
  name        VARCHAR(100) NOT NULL,
  email       VARCHAR(150) NOT NULL UNIQUE,
  password    VARCHAR(255) NOT NULL,
  role        VARCHAR(20)  NOT NULL DEFAULT 'staff' CHECK (role IN ('manager','staff')),
  is_active   BOOLEAN      NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- Per-PG role permission matrix (can_view / can_create; `allowed` is the
-- legacy single flag that is still written for backwards compatibility)
CREATE TABLE IF NOT EXISTS role_permissions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pg_id       UUID         NOT NULL REFERENCES pgs(id) ON DELETE CASCADE,
  role        VARCHAR(20)  NOT NULL CHECK (role IN ('manager','staff')),
  permission  VARCHAR(50)  NOT NULL,
  allowed     BOOLEAN      NOT NULL DEFAULT FALSE,
  can_view    BOOLEAN      DEFAULT FALSE,
  can_create  BOOLEAN      DEFAULT FALSE,
  CONSTRAINT uq_role_permissions UNIQUE (pg_id, role, permission)
);

CREATE TABLE IF NOT EXISTS rooms (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pg_id         UUID          NOT NULL REFERENCES pgs(id) ON DELETE CASCADE,
  room_number   VARCHAR(30)   NOT NULL,
  floor         INTEGER       NOT NULL DEFAULT 1,
  room_type     VARCHAR(30)   NOT NULL DEFAULT 'single',
  amenities     TEXT[]        DEFAULT '{}',
  monthly_rent  NUMERIC(10,2) NOT NULL,
  total_beds    INTEGER       NOT NULL DEFAULT 1,
  status        VARCHAR(20)   NOT NULL DEFAULT 'available',
  notes         TEXT,
  created_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_rooms_pg_number UNIQUE (pg_id, room_number)
);

CREATE TABLE IF NOT EXISTS beds (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id     UUID        NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  pg_id       UUID        NOT NULL REFERENCES pgs(id)   ON DELETE CASCADE,
  bed_label   VARCHAR(10) NOT NULL,
  status      VARCHAR(20) NOT NULL DEFAULT 'available',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_beds_room_label UNIQUE (room_id, bed_label)
);

-- One global profile per phone number (shared across PGs)
CREATE TABLE IF NOT EXISTS tenant_profiles (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name                     VARCHAR(100) NOT NULL,
  phone                    VARCHAR(20)  NOT NULL UNIQUE,
  email                    VARCHAR(150),
  password                 VARCHAR(255),
  profile_photo            TEXT,
  id_type                  VARCHAR(50),
  id_proof                 TEXT,
  permanent_address        TEXT,
  gender                   VARCHAR(20),
  father_name              VARCHAR(100),
  parent_phone             VARCHAR(20),
  occupation               VARCHAR(100),
  emergency_contact_name   VARCHAR(100),
  emergency_contact_phone  VARCHAR(20),
  blood_group              VARCHAR(10),
  date_of_birth            DATE,
  invite_accepted          BOOLEAN      NOT NULL DEFAULT FALSE,
  created_at               TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at               TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- A tenant's stay in one PG
CREATE TABLE IF NOT EXISTS pg_tenants (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pg_id                    UUID          NOT NULL REFERENCES pgs(id) ON DELETE CASCADE,
  tenant_profile_id        UUID          REFERENCES tenant_profiles(id) ON DELETE SET NULL,
  name                     VARCHAR(100)  NOT NULL,
  phone                    VARCHAR(20)   NOT NULL,
  email                    VARCHAR(150),
  room_id                  UUID          REFERENCES rooms(id) ON DELETE SET NULL,
  bed_id                   UUID          REFERENCES beds(id)  ON DELETE SET NULL,
  joining_date             DATE,
  vacated_date             DATE,
  monthly_rent             NUMERIC(10,2) NOT NULL DEFAULT 0,
  deposit                  NUMERIC(10,2) NOT NULL DEFAULT 0,
  rent_due_day             INTEGER       NOT NULL DEFAULT 1,
  id_type                  VARCHAR(50),
  id_proof                 TEXT,
  profile_photo            TEXT,
  permanent_address        TEXT,
  gender                   VARCHAR(20),
  father_name              VARCHAR(100),
  parent_phone             VARCHAR(20),
  occupation               VARCHAR(100),
  emergency_contact_name   VARCHAR(100),
  emergency_contact_phone  VARCHAR(20),
  blood_group              VARCHAR(10),
  date_of_birth            DATE,
  status                   VARCHAR(20)   NOT NULL DEFAULT 'pending',
  payment_status           VARCHAR(20)   DEFAULT 'due',
  created_at               TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at               TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_pg_tenants_pg_phone UNIQUE (pg_id, phone)
);

-- Rent payments. `month` = the rent period covered (always the 1st of a month);
-- payment_date = the day the money was received.
-- pg_tenant_id uses RESTRICT: a tenant with payment history cannot be hard
-- deleted by accident (mark them as vacated instead).
CREATE TABLE IF NOT EXISTS payments (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pg_id            UUID          NOT NULL REFERENCES pgs(id) ON DELETE CASCADE,
  pg_tenant_id     UUID          NOT NULL REFERENCES pg_tenants(id) ON DELETE RESTRICT,
  receipt_number   VARCHAR(40)   NOT NULL UNIQUE,
  amount           NUMERIC(10,2) NOT NULL,
  paid_amount      NUMERIC(10,2),
  balance_due      NUMERIC(10,2) DEFAULT 0,
  is_partial       BOOLEAN       DEFAULT FALSE,
  payment_date     DATE          NOT NULL,
  month            DATE          NOT NULL,
  due_month        VARCHAR(10),
  payment_mode     VARCHAR(30)   NOT NULL DEFAULT 'cash',
  transaction_ref  VARCHAR(100),
  notes            TEXT,
  status           VARCHAR(20)   NOT NULL DEFAULT 'settled',
  created_at       TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS expenses (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pg_id            UUID          NOT NULL REFERENCES pgs(id) ON DELETE CASCADE,
  description      VARCHAR(255)  NOT NULL,
  sub_description  VARCHAR(255),
  category         VARCHAR(50)   NOT NULL,
  amount           NUMERIC(10,2) NOT NULL,
  expense_date     DATE          NOT NULL,
  due_date         DATE,
  vendor           VARCHAR(150),
  invoice_number   VARCHAR(100),
  status           VARCHAR(20)   NOT NULL DEFAULT 'paid',
  created_at       TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- Owner invites (pg_id is NULL) and tenant invites / QR codes (pg_id set)
CREATE TABLE IF NOT EXISTS invites (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type        VARCHAR(20)  NOT NULL CHECK (type IN ('owner','tenant')),
  pg_id       UUID         REFERENCES pgs(id) ON DELETE CASCADE,
  token       VARCHAR(255) NOT NULL UNIQUE,
  name        VARCHAR(100),
  email       VARCHAR(150),
  phone       VARCHAR(20),
  expires_at  TIMESTAMPTZ  NOT NULL,
  is_used     BOOLEAN      NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS activity_logs (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pg_id              UUID         REFERENCES pgs(id) ON DELETE CASCADE,
  action             TEXT         NOT NULL,
  entity_type        VARCHAR(50),
  entity_id          VARCHAR(64),
  performed_by_name  VARCHAR(100),
  performed_by_role  VARCHAR(30),
  created_at         TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ---------------------------------------------------------------------
-- 3. Columns added over time.  On a fresh database these are no-ops; on an
--    older database they bring the tables up to date without touching rows.
-- ---------------------------------------------------------------------
ALTER TABLE owners          ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE pg_staff        ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE tenant_profiles ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE payments        ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- tenant profile / tenant details (migrate v2)
ALTER TABLE tenant_profiles ADD COLUMN IF NOT EXISTS gender VARCHAR(20);
ALTER TABLE tenant_profiles ADD COLUMN IF NOT EXISTS father_name VARCHAR(100);
ALTER TABLE tenant_profiles ADD COLUMN IF NOT EXISTS parent_phone VARCHAR(20);
ALTER TABLE tenant_profiles ADD COLUMN IF NOT EXISTS occupation VARCHAR(100);
ALTER TABLE tenant_profiles ADD COLUMN IF NOT EXISTS emergency_contact_name VARCHAR(100);
ALTER TABLE tenant_profiles ADD COLUMN IF NOT EXISTS emergency_contact_phone VARCHAR(20);
ALTER TABLE tenant_profiles ADD COLUMN IF NOT EXISTS blood_group VARCHAR(10);
ALTER TABLE tenant_profiles ADD COLUMN IF NOT EXISTS date_of_birth DATE;

ALTER TABLE pg_tenants ADD COLUMN IF NOT EXISTS gender VARCHAR(20);
ALTER TABLE pg_tenants ADD COLUMN IF NOT EXISTS father_name VARCHAR(100);
ALTER TABLE pg_tenants ADD COLUMN IF NOT EXISTS parent_phone VARCHAR(20);
ALTER TABLE pg_tenants ADD COLUMN IF NOT EXISTS occupation VARCHAR(100);
ALTER TABLE pg_tenants ADD COLUMN IF NOT EXISTS emergency_contact_name VARCHAR(100);
ALTER TABLE pg_tenants ADD COLUMN IF NOT EXISTS emergency_contact_phone VARCHAR(20);
ALTER TABLE pg_tenants ADD COLUMN IF NOT EXISTS blood_group VARCHAR(10);
ALTER TABLE pg_tenants ADD COLUMN IF NOT EXISTS date_of_birth DATE;
ALTER TABLE pg_tenants ADD COLUMN IF NOT EXISTS payment_status VARCHAR(20) DEFAULT 'due';

-- partial payment tracking (migrate v2/v3)
ALTER TABLE payments ADD COLUMN IF NOT EXISTS paid_amount NUMERIC(10,2);
ALTER TABLE payments ADD COLUMN IF NOT EXISTS balance_due NUMERIC(10,2) DEFAULT 0;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS is_partial BOOLEAN DEFAULT FALSE;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS due_month VARCHAR(10);

-- granular permissions (migrate v3)
ALTER TABLE role_permissions ADD COLUMN IF NOT EXISTS can_view   BOOLEAN DEFAULT FALSE;
ALTER TABLE role_permissions ADD COLUMN IF NOT EXISTS can_create BOOLEAN DEFAULT FALSE;

-- public listing fields (migrate v2/v3)
ALTER TABLE pgs ADD COLUMN IF NOT EXISTS lat NUMERIC(10,7);
ALTER TABLE pgs ADD COLUMN IF NOT EXISTS lng NUMERIC(10,7);
ALTER TABLE pgs ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE pgs ADD COLUMN IF NOT EXISTS pg_type VARCHAR(30) DEFAULT 'mixed';
ALTER TABLE pgs ADD COLUMN IF NOT EXISTS amenities_list TEXT[] DEFAULT '{}';
ALTER TABLE pgs ADD COLUMN IF NOT EXISTS images JSONB DEFAULT '[]';
ALTER TABLE pgs ADD COLUMN IF NOT EXISTS rules TEXT;
ALTER TABLE pgs ADD COLUMN IF NOT EXISTS nearby TEXT;

-- ---------------------------------------------------------------------
-- 4. Indexes
-- ---------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_owners_phone          ON owners(phone);
CREATE INDEX IF NOT EXISTS idx_owners_invite_token   ON owners(invite_token) WHERE invite_token IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_pgs_owner             ON pgs(owner_id);
CREATE INDEX IF NOT EXISTS idx_pgs_active_city       ON pgs(is_active, city);
CREATE INDEX IF NOT EXISTS idx_pg_staff_pg           ON pg_staff(pg_id);
CREATE INDEX IF NOT EXISTS idx_role_perms            ON role_permissions(pg_id, role);
CREATE INDEX IF NOT EXISTS idx_rooms_pg              ON rooms(pg_id);
CREATE INDEX IF NOT EXISTS idx_beds_room             ON beds(room_id);
CREATE INDEX IF NOT EXISTS idx_beds_pg               ON beds(pg_id);
CREATE INDEX IF NOT EXISTS idx_beds_pg_status        ON beds(pg_id, status);
CREATE INDEX IF NOT EXISTS idx_pg_tenants_pg         ON pg_tenants(pg_id);
CREATE INDEX IF NOT EXISTS idx_pg_tenants_room       ON pg_tenants(room_id);
CREATE INDEX IF NOT EXISTS idx_pg_tenants_bed        ON pg_tenants(bed_id);
CREATE INDEX IF NOT EXISTS idx_pg_tenants_pg_status  ON pg_tenants(pg_id, status);
CREATE INDEX IF NOT EXISTS idx_pg_tenants_profile    ON pg_tenants(tenant_profile_id);
CREATE INDEX IF NOT EXISTS idx_payments_pg           ON payments(pg_id);
CREATE INDEX IF NOT EXISTS idx_payments_tenant       ON payments(pg_tenant_id);
CREATE INDEX IF NOT EXISTS idx_payments_tenant_month ON payments(pg_tenant_id, month);
CREATE INDEX IF NOT EXISTS idx_payments_pg_month     ON payments(pg_id, month);
CREATE INDEX IF NOT EXISTS idx_payments_pg_date      ON payments(pg_id, payment_date);
CREATE INDEX IF NOT EXISTS idx_expenses_pg           ON expenses(pg_id);
CREATE INDEX IF NOT EXISTS idx_expenses_pg_date      ON expenses(pg_id, expense_date);
CREATE INDEX IF NOT EXISTS idx_invites_token         ON invites(token);
CREATE INDEX IF NOT EXISTS idx_invites_pg            ON invites(pg_id);
CREATE INDEX IF NOT EXISTS idx_activity_pg           ON activity_logs(pg_id);
CREATE INDEX IF NOT EXISTS idx_activity_pg_created   ON activity_logs(pg_id, created_at DESC);

-- ---------------------------------------------------------------------
-- 5. updated_at triggers  (drop + create so a re-run never fails; identical
--    definition each time, no data is touched)
-- ---------------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_owners_upd          ON owners;
CREATE TRIGGER trg_owners_upd          BEFORE UPDATE ON owners          FOR EACH ROW EXECUTE FUNCTION update_updated_at();
DROP TRIGGER IF EXISTS trg_pgs_upd             ON pgs;
CREATE TRIGGER trg_pgs_upd             BEFORE UPDATE ON pgs             FOR EACH ROW EXECUTE FUNCTION update_updated_at();
DROP TRIGGER IF EXISTS trg_pg_staff_upd        ON pg_staff;
CREATE TRIGGER trg_pg_staff_upd        BEFORE UPDATE ON pg_staff        FOR EACH ROW EXECUTE FUNCTION update_updated_at();
DROP TRIGGER IF EXISTS trg_rooms_upd           ON rooms;
CREATE TRIGGER trg_rooms_upd           BEFORE UPDATE ON rooms           FOR EACH ROW EXECUTE FUNCTION update_updated_at();
DROP TRIGGER IF EXISTS trg_tenant_profiles_upd ON tenant_profiles;
CREATE TRIGGER trg_tenant_profiles_upd BEFORE UPDATE ON tenant_profiles FOR EACH ROW EXECUTE FUNCTION update_updated_at();
DROP TRIGGER IF EXISTS trg_pg_tenants_upd      ON pg_tenants;
CREATE TRIGGER trg_pg_tenants_upd      BEFORE UPDATE ON pg_tenants      FOR EACH ROW EXECUTE FUNCTION update_updated_at();
DROP TRIGGER IF EXISTS trg_payments_upd        ON payments;
CREATE TRIGGER trg_payments_upd        BEFORE UPDATE ON payments        FOR EACH ROW EXECUTE FUNCTION update_updated_at();
DROP TRIGGER IF EXISTS trg_expenses_upd        ON expenses;
CREATE TRIGGER trg_expenses_upd        BEFORE UPDATE ON expenses        FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ---------------------------------------------------------------------
-- 6. Receipt numbers:  next_receipt_number()  ->  '#REC-1001', '#REC-1002' ...
--    Backed by a sequence, so concurrent payments never get the same number
--    and deleting a payment never re-uses its number.
--    Created ONLY if it does not exist yet: an existing production function /
--    sequence is never replaced.  When it is created on a database that already
--    holds payments, numbering continues after the highest existing #REC-<n>.
-- ---------------------------------------------------------------------
DO $$
DECLARE
  start_at BIGINT;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE p.proname = 'next_receipt_number' AND n.nspname = current_schema()
  ) THEN
    CREATE SEQUENCE IF NOT EXISTS receipt_number_seq START WITH 1001 MINVALUE 1;

    SELECT COALESCE(MAX(NULLIF(regexp_replace(receipt_number, '\D', '', 'g'), '')::bigint), 1000) + 1
      INTO start_at FROM payments;
    IF start_at < 1001 THEN start_at := 1001; END IF;
    PERFORM setval('receipt_number_seq', start_at, false);

    EXECUTE $fn$
      CREATE FUNCTION next_receipt_number() RETURNS TEXT AS $body$
        SELECT '#REC-' || nextval('receipt_number_seq')::text;
      $body$ LANGUAGE sql
    $fn$;
  END IF;
END $$;
