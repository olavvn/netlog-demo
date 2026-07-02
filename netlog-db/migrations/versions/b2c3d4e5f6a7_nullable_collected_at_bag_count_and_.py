"""nullable_collected_at_bag_count_and_status_transition

Revision ID: b2c3d4e5f6a7
Revises: a1b2c3d4e5f6
Create Date: 2026-06-09

Three improvements to the merged collection flow:

1. collected_at nullable
   - Drop NOT NULL + DEFAULT now() from collection_record.collected_at.
   - A new BEFORE UPDATE trigger (trg_enforce_status_transition) sets
     collected_at = now() automatically on the planned→...→completed
     transition, so callers never need to supply the value.

2. chk_detail_bag_pos relaxed to bag_count >= 0
   - Allows collection_site_detail rows for sites whose queue is empty
     (remaining_bag_count sums to 0) without a constraint violation.

3. Status-transition enforcement
   - trg_enforce_status_transition (BEFORE UPDATE OF status) raises an
     exception for any transition outside the allowed sequence:
       planned -> in_progress -> completed -> stacking_pending -> stacked
   - The same trigger sets collected_at = now() on -> completed.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'b2c3d4e5f6a7'
down_revision: Union[str, Sequence[str], None] = 'a1b2c3d4e5f6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ------------------------------------------------------------------ #
    # 1. collected_at: drop NOT NULL and DEFAULT                          #
    # ------------------------------------------------------------------ #
    op.execute("ALTER TABLE collection_record ALTER COLUMN collected_at DROP NOT NULL;")
    op.execute("ALTER TABLE collection_record ALTER COLUMN collected_at DROP DEFAULT;")

    # ------------------------------------------------------------------ #
    # 2. Relax chk_detail_bag_pos: bag_count >= 0                        #
    # ------------------------------------------------------------------ #
    op.drop_constraint('chk_detail_bag_pos', 'collection_site_detail', type_='check')
    op.create_check_constraint(
        'chk_detail_bag_pos',
        'collection_site_detail',
        'bag_count >= 0'
    )

    # ------------------------------------------------------------------ #
    # 3. Status-transition enforcement + auto collected_at on completed   #
    # ------------------------------------------------------------------ #
    op.execute("""
    CREATE OR REPLACE FUNCTION fn_enforce_status_transition()
    RETURNS TRIGGER LANGUAGE plpgsql AS $$
    BEGIN
        IF OLD.status IS DISTINCT FROM NEW.status THEN
            IF NOT (
                (OLD.status = 'planned'          AND NEW.status = 'in_progress'     ) OR
                (OLD.status = 'in_progress'      AND NEW.status = 'completed'       ) OR
                (OLD.status = 'completed'        AND NEW.status = 'stacking_pending') OR
                (OLD.status = 'stacking_pending' AND NEW.status = 'stacked'         )
            ) THEN
                RAISE EXCEPTION
                    'Invalid status transition for collection_record: % -> %',
                    OLD.status, NEW.status;
            END IF;

            IF NEW.status = 'completed' THEN
                NEW.collected_at := now();
            END IF;
        END IF;
        RETURN NEW;
    END;
    $$;
    """)

    op.execute("""
    CREATE TRIGGER trg_enforce_status_transition
    BEFORE UPDATE OF status ON collection_record
    FOR EACH ROW EXECUTE FUNCTION fn_enforce_status_transition();
    """)


def downgrade() -> None:
    # 3. Drop status-transition trigger
    op.execute("DROP TRIGGER IF EXISTS trg_enforce_status_transition ON collection_record;")
    op.execute("DROP FUNCTION IF EXISTS fn_enforce_status_transition();")

    # 2. Restore strict bag_count > 0 constraint
    op.drop_constraint('chk_detail_bag_pos', 'collection_site_detail', type_='check')
    op.create_check_constraint(
        'chk_detail_bag_pos',
        'collection_site_detail',
        'bag_count > 0'
    )

    # 1. Restore NOT NULL + DEFAULT now() on collected_at
    #    First backfill NULLs to avoid constraint violation on existing rows.
    op.execute("UPDATE collection_record SET collected_at = now() WHERE collected_at IS NULL;")
    op.execute("ALTER TABLE collection_record ALTER COLUMN collected_at SET DEFAULT now();")
    op.execute("ALTER TABLE collection_record ALTER COLUMN collected_at SET NOT NULL;")
