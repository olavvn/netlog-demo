"""merge_collection_plan_into_record

Revision ID: a1b2c3d4e5f6
Revises: 09e3c44cd210
Create Date: 2026-06-09

Drop collection_plan + collection_plan_site and fold planning semantics
directly into collection_record:
  - plan_id removed from collection_record
  - planned_at (nullable TIMESTAMPTZ) added to collection_record
  - collection_record_status gains 'planned' value

Trigger changes:
  - trg_fill_expected_bag_count on collection_plan_site -> replaced by
    trg_fill_bag_count_from_queue (BEFORE INSERT on collection_site_detail):
    auto-fills bag_count = SUM(remaining_bag_count) from site_bag_queue
  - trg_dequeue_bags_fifo on collection_site_detail -> replaced by
    trg_zero_queue_on_completed (AFTER UPDATE OF status on collection_record):
    when status transitions to 'completed', zeros out remaining_bag_count
    for every queue entry of each site in the collection.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'a1b2c3d4e5f6'
down_revision: Union[str, Sequence[str], None] = '09e3c44cd210'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ------------------------------------------------------------------ #
    # 1. Add 'planned' to collection_record_status ENUM                   #
    # ------------------------------------------------------------------ #
    op.execute("ALTER TYPE collection_record_status ADD VALUE IF NOT EXISTS 'planned' BEFORE 'in_progress';")

    # ------------------------------------------------------------------ #
    # 2. Drop old triggers that reference soon-to-be-dropped tables       #
    # ------------------------------------------------------------------ #
    op.execute("DROP TRIGGER IF EXISTS trg_fill_expected_bag_count ON collection_plan_site;")
    op.execute("DROP FUNCTION IF EXISTS fn_fill_expected_bag_count();")

    # Replace FIFO dequeue (on collection_site_detail) with status-based approach
    op.execute("DROP TRIGGER IF EXISTS trg_dequeue_bags_fifo ON collection_site_detail;")
    op.execute("DROP FUNCTION IF EXISTS fn_dequeue_bags_fifo();")

    # ------------------------------------------------------------------ #
    # 3. Remove plan_id (+ FK) from collection_record                     #
    # ------------------------------------------------------------------ #
    op.execute("ALTER TABLE collection_record DROP CONSTRAINT IF EXISTS fk_collection_record_plan;")
    op.execute("ALTER TABLE collection_record DROP COLUMN IF EXISTS plan_id;")

    # ------------------------------------------------------------------ #
    # 4. Add planned_at to collection_record                              #
    # ------------------------------------------------------------------ #
    op.add_column(
        'collection_record',
        sa.Column('planned_at', sa.TIMESTAMP(timezone=True), nullable=True)
    )

    # ------------------------------------------------------------------ #
    # 5. Drop collection_plan_site then collection_plan + plan_status      #
    # ------------------------------------------------------------------ #
    op.execute("ALTER TABLE collection_plan_site DROP CONSTRAINT IF EXISTS fk_collection_plan_site_plan;")
    op.execute("ALTER TABLE collection_plan_site DROP CONSTRAINT IF EXISTS fk_collection_plan_site_site;")
    op.drop_table('collection_plan_site')

    op.execute("ALTER TABLE collection_plan DROP CONSTRAINT IF EXISTS fk_collection_plan_manager;")
    op.drop_table('collection_plan')

    op.execute("DROP TYPE IF EXISTS plan_status;")

    # ------------------------------------------------------------------ #
    # 6. New BEFORE INSERT trigger on collection_site_detail:             #
    #    auto-fill bag_count = SUM(remaining_bag_count) from queue        #
    # ------------------------------------------------------------------ #
    op.execute("""
    CREATE OR REPLACE FUNCTION fn_fill_bag_count_from_queue()
    RETURNS TRIGGER LANGUAGE plpgsql AS $$
    BEGIN
        SELECT COALESCE(SUM(remaining_bag_count), 0)
        INTO   NEW.bag_count
        FROM   site_bag_queue
        WHERE  site_id            = NEW.site_id
          AND  is_fully_collected = FALSE;
        RETURN NEW;
    END;
    $$;
    """)

    op.execute("""
    CREATE TRIGGER trg_fill_bag_count_from_queue
    BEFORE INSERT ON collection_site_detail
    FOR EACH ROW EXECUTE FUNCTION fn_fill_bag_count_from_queue();
    """)

    # ------------------------------------------------------------------ #
    # 7. New AFTER UPDATE trigger on collection_record:                   #
    #    when status -> 'completed', zero out queue for all sites in the  #
    #    collection and mark their inspection_records as collected.        #
    # ------------------------------------------------------------------ #
    op.execute("""
    CREATE OR REPLACE FUNCTION fn_zero_queue_on_completed()
    RETURNS TRIGGER LANGUAGE plpgsql AS $$
    BEGIN
        IF OLD.status IS DISTINCT FROM NEW.status AND NEW.status = 'completed' THEN
            UPDATE site_bag_queue
            SET    remaining_bag_count = 0,
                   is_fully_collected  = TRUE
            WHERE  site_id IN (
                       SELECT site_id
                       FROM   collection_site_detail
                       WHERE  collection_id = NEW.collection_id
                   )
              AND  is_fully_collected = FALSE;

            UPDATE inspection_record
            SET    is_collected = TRUE
            WHERE  record_id IN (
                       SELECT q.record_id
                       FROM   site_bag_queue q
                       WHERE  q.site_id IN (
                                  SELECT site_id
                                  FROM   collection_site_detail
                                  WHERE  collection_id = NEW.collection_id
                              )
                   );
        END IF;
        RETURN NEW;
    END;
    $$;
    """)

    op.execute("""
    CREATE TRIGGER trg_zero_queue_on_completed
    AFTER UPDATE OF status ON collection_record
    FOR EACH ROW EXECUTE FUNCTION fn_zero_queue_on_completed();
    """)


def downgrade() -> None:
    # ------------------------------------------------------------------ #
    # Reverse in opposite order                                           #
    # ------------------------------------------------------------------ #

    # 7. Drop status-based dequeue trigger
    op.execute("DROP TRIGGER IF EXISTS trg_zero_queue_on_completed ON collection_record;")
    op.execute("DROP FUNCTION IF EXISTS fn_zero_queue_on_completed();")

    # 6. Drop auto-fill trigger
    op.execute("DROP TRIGGER IF EXISTS trg_fill_bag_count_from_queue ON collection_site_detail;")
    op.execute("DROP FUNCTION IF EXISTS fn_fill_bag_count_from_queue();")

    # 5. Recreate plan_status, collection_plan, collection_plan_site
    op.execute("""
    DO $$ BEGIN
        CREATE TYPE plan_status AS ENUM ('pending', 'in_progress', 'completed', 'cancelled');
    EXCEPTION WHEN duplicate_object THEN null; END $$;
    """)

    op.create_table(
        'collection_plan',
        sa.Column('plan_id',    sa.UUID(), nullable=False,
                  server_default=sa.text('gen_random_uuid()')),
        sa.Column('manager_id', sa.UUID(), nullable=False),
        sa.Column('status',
                  sa.Enum('pending', 'in_progress', 'completed', 'cancelled', name='plan_status'),
                  nullable=False, server_default='pending'),
        sa.Column('planned_at', sa.TIMESTAMP(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint('plan_id', name='pk_collection_plan'),
    )
    op.create_foreign_key(
        'fk_collection_plan_manager',
        'collection_plan', 'netspa_manager',
        ['manager_id'], ['manager_id']
    )

    op.create_table(
        'collection_plan_site',
        sa.Column('plan_id',            sa.UUID(), nullable=False),
        sa.Column('site_id',            sa.UUID(), nullable=False),
        sa.Column('expected_bag_count', sa.Integer(), nullable=True),
        sa.PrimaryKeyConstraint('plan_id', 'site_id', name='pk_collection_plan_site'),
    )
    op.create_foreign_key(
        'fk_collection_plan_site_plan',
        'collection_plan_site', 'collection_plan',
        ['plan_id'], ['plan_id']
    )
    op.create_foreign_key(
        'fk_collection_plan_site_site',
        'collection_plan_site', 'site',
        ['site_id'], ['site_id']
    )

    # Restore fn_fill_expected_bag_count trigger on collection_plan_site
    op.execute("""
    CREATE OR REPLACE FUNCTION fn_fill_expected_bag_count()
    RETURNS TRIGGER LANGUAGE plpgsql AS $$
    BEGIN
        SELECT COALESCE(SUM(remaining_bag_count), 0)
        INTO   NEW.expected_bag_count
        FROM   site_bag_queue
        WHERE  site_id            = NEW.site_id
          AND  is_fully_collected = FALSE;
        RETURN NEW;
    END;
    $$;
    """)
    op.execute("""
    CREATE TRIGGER trg_fill_expected_bag_count
    BEFORE INSERT ON collection_plan_site
    FOR EACH ROW EXECUTE FUNCTION fn_fill_expected_bag_count();
    """)

    # 4. Drop planned_at from collection_record
    op.drop_column('collection_record', 'planned_at')

    # 3. Restore plan_id + FK on collection_record
    #    NOTE: plan_id is restored as nullable to avoid data loss on downgrade.
    op.add_column(
        'collection_record',
        sa.Column('plan_id', sa.UUID(), nullable=True)
    )
    op.create_foreign_key(
        'fk_collection_record_plan',
        'collection_record', 'collection_plan',
        ['plan_id'], ['plan_id']
    )

    # Restore FIFO dequeue trigger on collection_site_detail
    op.execute("""
    CREATE OR REPLACE FUNCTION fn_dequeue_bags_fifo()
    RETURNS TRIGGER LANGUAGE plpgsql AS $$
    DECLARE
        v_should_run BOOLEAN := FALSE;
        v_to_deduct  INT;
        v_queue      RECORD;
        v_deduct     INT;
    BEGIN
        IF TG_OP = 'INSERT' AND NEW.completed_at IS NOT NULL THEN
            v_should_run := TRUE;
        ELSIF TG_OP = 'UPDATE' AND OLD.completed_at IS NULL AND NEW.completed_at IS NOT NULL THEN
            v_should_run := TRUE;
        END IF;

        IF NOT v_should_run THEN RETURN NEW; END IF;

        v_to_deduct := NEW.bag_count;

        FOR v_queue IN
            SELECT queue_id, record_id, remaining_bag_count
            FROM   site_bag_queue
            WHERE  site_id            = NEW.site_id
              AND  is_fully_collected = FALSE
            ORDER  BY queued_at ASC
        LOOP
            EXIT WHEN v_to_deduct <= 0;
            v_deduct := LEAST(v_to_deduct, v_queue.remaining_bag_count);
            UPDATE site_bag_queue
            SET remaining_bag_count = remaining_bag_count - v_deduct,
                is_fully_collected  = (remaining_bag_count - v_deduct = 0)
            WHERE queue_id = v_queue.queue_id;
            IF (v_queue.remaining_bag_count - v_deduct = 0) THEN
                UPDATE inspection_record SET is_collected = TRUE
                WHERE record_id = v_queue.record_id;
            END IF;
            v_to_deduct := v_to_deduct - v_deduct;
        END LOOP;

        IF v_to_deduct > 0 THEN
            RAISE WARNING '[재고 부족 경고] site_id=%, 미차감 bag_count=%', NEW.site_id, v_to_deduct;
        END IF;
        RETURN NEW;
    END;
    $$;
    """)
    op.execute("""
    CREATE TRIGGER trg_dequeue_bags_fifo
    AFTER INSERT OR UPDATE ON collection_site_detail
    FOR EACH ROW EXECUTE FUNCTION fn_dequeue_bags_fifo();
    """)

    # NOTE: PostgreSQL does not support removing ENUM values.
    # 'planned' remains in collection_record_status after downgrade.
