"""add_actual_bag_count_to_collection_site_detail

Revision ID: 906189558e71
Revises: 9ee59e86435b
Create Date: 2026-06-08 18:00:19.377086

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '906189558e71'
down_revision: Union[str, Sequence[str], None] = '9ee59e86435b'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Add actual_bag_count column to collection_site_detail table
    op.add_column('collection_site_detail', sa.Column('actual_bag_count', sa.Integer(), nullable=True))


def downgrade() -> None:
    # Drop actual_bag_count column from collection_site_detail table
    op.drop_column('collection_site_detail', 'actual_bag_count')
