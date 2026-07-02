"""add_collection_record_status

Revision ID: 9ee59e86435b
Revises: 60a84a3dbed8
Create Date: 2026-06-08 17:29:38.609170

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '9ee59e86435b'
down_revision: Union[str, Sequence[str], None] = '60a84a3dbed8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Create collection_record_status type
    op.execute("""
    DO $$ BEGIN
        CREATE TYPE collection_record_status AS ENUM (
            'in_progress',
            'completed',
            'stacking_pending',
            'stacked'
        );
    EXCEPTION
        WHEN duplicate_object THEN null;
    END $$;
    """)

    # 2. Add status column to collection_record
    op.execute("""
    ALTER TABLE collection_record
    ADD COLUMN status collection_record_status NOT NULL DEFAULT 'in_progress';
    """)

    # 3. Create bundle_status type (if not exists)
    op.execute("""
    DO $$ BEGIN
        CREATE TYPE bundle_status AS ENUM (
            'ready',
            'in_progress',
            'completed'
        );
    EXCEPTION
        WHEN duplicate_object THEN null;
    END $$;
    """)

    # 4. Add status column to processing_bundle (if not exists)
    op.execute("""
    DO $$ BEGIN
        ALTER TABLE processing_bundle
        ADD COLUMN status bundle_status NOT NULL DEFAULT 'ready';
    EXCEPTION
        WHEN duplicate_column THEN null;
    END $$;
    """)


def downgrade() -> None:
    # 1. Drop status columns
    op.execute("ALTER TABLE collection_record DROP COLUMN IF EXISTS status CASCADE;")
    op.execute("ALTER TABLE processing_bundle DROP COLUMN IF EXISTS status CASCADE;")

    # 2. Drop ENUM types
    op.execute("DROP TYPE IF EXISTS collection_record_status CASCADE;")
    op.execute("DROP TYPE IF EXISTS bundle_status CASCADE;")

