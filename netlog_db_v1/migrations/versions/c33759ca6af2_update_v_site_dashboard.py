"""update_v_site_dashboard

Revision ID: xxxx
Revises: 2cb18e63bed5
Create Date: 2026-06-06 16:34:44.109857

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'c33759ca6af2'
down_revision: Union[str, Sequence[str], None] = '2cb18e63bed5'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("DROP VIEW IF EXISTS v_site_dashboard")
    op.execute("""
        CREATE VIEW v_site_dashboard AS
        SELECT
            s.site_id,
            s.name                                              AS site_name,
            s.region,
            s.address,
            s.latitude,
            s.longitude,
            COALESCE(SUM(q.remaining_bag_count) FILTER (WHERE q.is_fully_collected = FALSE), 0)
                                                                AS current_bag_count,
            MAX(csd.completed_at)                               AS last_collected_at,
            CASE
                WHEN MAX(csd.completed_at) IS NULL THEN NULL
                ELSE EXTRACT(DAY FROM now() - MAX(csd.completed_at))::INTEGER
            END                                                 AS waiting_days,
            CASE
                WHEN COALESCE(SUM(q.remaining_bag_count) FILTER (WHERE q.is_fully_collected = FALSE), 0) <= 100
                    THEN 'green'
                WHEN COALESCE(SUM(q.remaining_bag_count) FILTER (WHERE q.is_fully_collected = FALSE), 0) <= 200
                    THEN 'yellow'
                ELSE 'red'
            END                                                 AS bag_status,
            COUNT(DISTINCT ir.record_id)                        AS total_inspection_count,
            COALESCE(SUM(ir.bag_count), 0)                      AS total_bag_count_cumulative
        FROM      site s
        LEFT JOIN site_bag_queue          q   ON q.site_id   = s.site_id
        LEFT JOIN collection_site_detail  csd ON csd.site_id = s.site_id
        LEFT JOIN inspection_record       ir  ON ir.site_id  = s.site_id
        GROUP BY  s.site_id, s.name, s.region, s.address, s.latitude, s.longitude
    """)



def downgrade() -> None:
    op.execute("DROP VIEW IF EXISTS v_site_dashboard")
    op.execute("""
        CREATE VIEW v_site_dashboard AS
        SELECT
            s.site_id,
            s.name                                              AS site_name,
            s.region,
            s.address,
            s.latitude,
            s.longitude,
            COALESCE(SUM(q.remaining_bag_count) FILTER (WHERE q.is_fully_collected = FALSE), 0)
                                                                AS current_bag_count,
            MAX(csd.completed_at)                               AS last_collected_at,
            COUNT(DISTINCT ir.record_id)                        AS total_inspection_count,
            COALESCE(SUM(ir.bag_count), 0)                      AS total_bag_count_cumulative
        FROM      site s
        LEFT JOIN site_bag_queue          q   ON q.site_id   = s.site_id
        LEFT JOIN collection_site_detail  csd ON csd.site_id = s.site_id
        LEFT JOIN inspection_record       ir  ON ir.site_id  = s.site_id
        GROUP BY  s.site_id, s.name, s.region, s.address, s.latitude, s.longitude
    """)