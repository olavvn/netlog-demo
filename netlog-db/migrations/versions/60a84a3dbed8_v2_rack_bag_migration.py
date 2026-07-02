"""v2_rack_bag_migration

Revision ID: 60a84a3dbed8
Revises: c33759ca6af2
Create Date: 2026-06-08 01:10:59.505398

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '60a84a3dbed8'
down_revision: Union[str, Sequence[str], None] = 'c33759ca6af2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Create types
    op.execute("""
    DO $$ BEGIN
        CREATE TYPE bag_status AS ENUM ('stored', 'processing', 'processed');
    EXCEPTION
        WHEN duplicate_object THEN null;
    END $$;
    """)
    
    # 2. Create tables
    op.execute("""
    CREATE TABLE IF NOT EXISTS rack (
        rack_code    VARCHAR(10) NOT NULL,
        max_capacity INT         NOT NULL DEFAULT 50,
        CONSTRAINT pk_rack PRIMARY KEY (rack_code)
    );
    """)

    op.execute("""
    CREATE TABLE IF NOT EXISTS processing_bundle (
        bundle_id              UUID        NOT NULL DEFAULT gen_random_uuid(),
        bag_count              INT         NOT NULL,
        processed_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
        processing_method_code TEXT        NULL,
        processing_method_name TEXT        NULL,
        status                 bundle_status NOT NULL DEFAULT 'ready',
        CONSTRAINT pk_processing_bundle PRIMARY KEY (bundle_id),
        CONSTRAINT chk_bundle_bag_count CHECK (bag_count > 0)
    );
    """)

    op.execute("""
    CREATE TABLE IF NOT EXISTS bag (
        bag_id        UUID        NOT NULL DEFAULT gen_random_uuid(),
        serial_number TEXT        NOT NULL,
        collection_id UUID        NOT NULL,
        site_id       UUID        NOT NULL,
        rack_code     VARCHAR(10) NULL,
        status        bag_status  NOT NULL DEFAULT 'stored',
        stored_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
        bundle_id     UUID        NULL,
        CONSTRAINT pk_bag        PRIMARY KEY (bag_id),
        CONSTRAINT uq_bag_serial UNIQUE (serial_number)
    );
    """)

    # 3. Add foreign keys
    op.execute("""
    DO $$ BEGIN
        ALTER TABLE bag ADD CONSTRAINT fk_bag_collection FOREIGN KEY (collection_id) REFERENCES collection_record (collection_id);
    EXCEPTION WHEN duplicate_object THEN null; END $$;
    """)
    op.execute("""
    DO $$ BEGIN
        ALTER TABLE bag ADD CONSTRAINT fk_bag_site FOREIGN KEY (site_id) REFERENCES site (site_id);
    EXCEPTION WHEN duplicate_object THEN null; END $$;
    """)
    op.execute("""
    DO $$ BEGIN
        ALTER TABLE bag ADD CONSTRAINT fk_bag_rack FOREIGN KEY (rack_code) REFERENCES rack (rack_code);
    EXCEPTION WHEN duplicate_object THEN null; END $$;
    """)
    op.execute("""
    DO $$ BEGIN
        ALTER TABLE bag ADD CONSTRAINT fk_bag_bundle FOREIGN KEY (bundle_id) REFERENCES processing_bundle (bundle_id);
    EXCEPTION WHEN duplicate_object THEN null; END $$;
    """)

    # 4. Insert initial rack data
    op.execute("INSERT INTO rack (rack_code, max_capacity) VALUES ('A', 50), ('B', 50), ('C', 50), ('D', 50) ON CONFLICT (rack_code) DO NOTHING;")

    # 5. Create view v_bundle_site_breakdown
    op.execute("""
    CREATE OR REPLACE VIEW v_bundle_site_breakdown AS
    SELECT pb.bundle_id, pb.processed_at, pb.bag_count AS bundle_total_bag_count,
           b.site_id, s.name AS site_name, COUNT(b.bag_id) AS bag_count,
           ROUND(COUNT(b.bag_id) * 100.0 / NULLIF(SUM(COUNT(b.bag_id)) OVER (PARTITION BY pb.bundle_id), 0), 2) AS ratio_pct
    FROM processing_bundle pb
    JOIN bag b ON b.bundle_id = pb.bundle_id
    JOIN site s ON s.site_id = b.site_id
    GROUP BY pb.bundle_id, pb.processed_at, pb.bag_count, b.site_id, s.name;
    """)

    # 6. Drop legacy v1 views and tables
    op.execute("DROP VIEW IF EXISTS v_lot_site_breakdown CASCADE;")
    op.execute("DROP TABLE IF EXISTS lot_composition CASCADE;")
    op.execute("DROP TABLE IF EXISTS lot CASCADE;")
    op.execute("DROP TABLE IF EXISTS batch_collection CASCADE;")
    op.execute("DROP TABLE IF EXISTS processing_batch CASCADE;")


def downgrade() -> None:
    # 1. Drop v2 views and tables
    op.execute("DROP VIEW IF EXISTS v_bundle_site_breakdown CASCADE;")
    op.execute("DROP TABLE IF EXISTS bag CASCADE;")
    op.execute("DROP TABLE IF EXISTS processing_bundle CASCADE;")
    op.execute("DROP TABLE IF EXISTS rack CASCADE;")
    op.execute("DROP TYPE IF EXISTS bag_status CASCADE;")
    
    # 2. Recreate legacy types and tables
    op.execute("""
    DO $$ BEGIN
        CREATE TYPE batch_status AS ENUM ('assembling', 'processing', 'processed');
    EXCEPTION WHEN duplicate_object THEN null; END $$;
    """)
    op.execute("""
    DO $$ BEGIN
        CREATE TYPE lot_status AS ENUM ('pending', 'processing', 'processed');
    EXCEPTION WHEN duplicate_object THEN null; END $$;
    """)
    
    op.execute("""
    CREATE TABLE IF NOT EXISTS processing_batch (
        batch_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        status batch_status NOT NULL DEFAULT 'assembling',
        total_weight_kg NUMERIC(10,2) NULL,
        started_at TIMESTAMPTZ NULL,
        processed_at TIMESTAMPTZ NULL
    );
    """)
    op.execute("""
    CREATE TABLE IF NOT EXISTS batch_collection (
        batch_id UUID NOT NULL REFERENCES processing_batch(batch_id),
        collection_id UUID NOT NULL REFERENCES collection_record(collection_id),
        PRIMARY KEY (batch_id, collection_id)
    );
    """)
    op.execute("""
    CREATE TABLE IF NOT EXISTS lot (
        lot_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        batch_id UUID NOT NULL REFERENCES processing_batch(batch_id),
        lot_number INT NOT NULL,
        weight_kg NUMERIC(10,2) NOT NULL CHECK (weight_kg > 0),
        status lot_status NOT NULL DEFAULT 'pending',
        started_at TIMESTAMPTZ NULL,
        processed_at TIMESTAMPTZ NULL,
        processing_method_code TEXT NULL,
        processing_method_name TEXT NULL,
        UNIQUE (batch_id, lot_number)
    );
    """)
    op.execute("""
    CREATE TABLE IF NOT EXISTS lot_composition (
        lot_id UUID NOT NULL REFERENCES lot(lot_id),
        site_id UUID NOT NULL REFERENCES site(site_id),
        weight_kg NUMERIC(10,2) NOT NULL,
        ratio_pct NUMERIC(5,2) NOT NULL CHECK (ratio_pct > 0 AND ratio_pct <= 100),
        PRIMARY KEY (lot_id, site_id)
    );
    """)
    op.execute("""
    CREATE OR REPLACE VIEW v_lot_site_breakdown AS
    SELECT lc.lot_id, l.processed_at, l.weight_kg AS lot_total_weight_kg,
           lc.site_id, s.name AS site_name, lc.weight_kg AS actual_weight_kg, lc.ratio_pct
    FROM lot_composition lc
    JOIN lot l ON l.lot_id = lc.lot_id
    JOIN site s ON s.site_id = lc.site_id;
    """)
