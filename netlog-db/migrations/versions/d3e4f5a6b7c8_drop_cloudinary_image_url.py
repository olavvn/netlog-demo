"""drop_cloudinary_image_url

Revision ID: d3e4f5a6b7c8
Revises: b2c3d4e5f6a7
Create Date: 2026-07-03

The photo-upload feature (Cloudinary) has been removed entirely, so
inspection_record.bag_image_url and site_bag_queue.bag_image_url are no
longer populated by the application. Drop NOT NULL on both so new rows
can be inserted without a value; the trigger fn_enqueue_bags already just
passes the (now possibly NULL) value through.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'd3e4f5a6b7c8'
down_revision: Union[str, Sequence[str], None] = 'b2c3d4e5f6a7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("ALTER TABLE inspection_record ALTER COLUMN bag_image_url DROP NOT NULL;")
    op.execute("ALTER TABLE site_bag_queue ALTER COLUMN bag_image_url DROP NOT NULL;")


def downgrade() -> None:
    # Backfill NULLs with a placeholder before restoring NOT NULL, since the
    # original Cloudinary URLs can no longer be reconstructed.
    op.execute("UPDATE inspection_record SET bag_image_url = '' WHERE bag_image_url IS NULL;")
    op.execute("UPDATE site_bag_queue SET bag_image_url = '' WHERE bag_image_url IS NULL;")
    op.execute("ALTER TABLE inspection_record ALTER COLUMN bag_image_url SET NOT NULL;")
    op.execute("ALTER TABLE site_bag_queue ALTER COLUMN bag_image_url SET NOT NULL;")
