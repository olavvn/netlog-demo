"""update_v2_add_weight_kg_and_triggers_views

Revision ID: 09e3c44cd210
Revises: 906189558e71
Create Date: 2026-06-08 19:50:31.888022

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '09e3c44cd210'
down_revision: Union[str, Sequence[str], None] = '906189558e71'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Add weight_kg column to collection_site_detail table with CHECK constraint
    op.add_column('collection_site_detail', sa.Column('weight_kg', sa.Numeric(precision=10, scale=2), nullable=True))
    op.create_check_constraint(
        'chk_detail_weight_pos',
        'collection_site_detail',
        'weight_kg IS NULL OR weight_kg > 0'
    )
    
    # 2. Create trigger function and trigger to auto-calculate total weight
    op.execute("""
    CREATE OR REPLACE FUNCTION fn_update_collection_total_weight()
    RETURNS TRIGGER AS $$
    DECLARE v_collection_id UUID;
    BEGIN
        IF TG_OP = 'DELETE' THEN v_collection_id := OLD.collection_id;
        ELSE v_collection_id := NEW.collection_id; END IF;

        UPDATE collection_record
        SET total_weight_kg = (
            SELECT SUM(weight_kg) FROM collection_site_detail WHERE collection_id = v_collection_id
        )
        WHERE collection_id = v_collection_id;

        IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
    END;
    $$ LANGUAGE plpgsql;
    """)
    
    op.execute("""
    CREATE TRIGGER trg_update_collection_total_weight
    AFTER INSERT OR UPDATE OF weight_kg OR DELETE ON collection_site_detail
    FOR EACH ROW EXECUTE FUNCTION fn_update_collection_total_weight();
    """)
    
    # 3. Update v_collection_composition view to use actual_weight_kg (csd.weight_kg)
    op.execute("DROP VIEW IF EXISTS v_collection_composition CASCADE;")
    op.execute("""
    CREATE OR REPLACE VIEW v_collection_composition AS
    SELECT cr.collection_id, cr.collected_at, cr.total_weight_kg,
           csd.site_id, s.name AS site_name, csd.bag_count,
           ROUND(csd.bag_count * 100.0 / SUM(csd.bag_count) OVER (PARTITION BY cr.collection_id), 2) AS ratio_pct,
           csd.weight_kg AS actual_weight_kg
    FROM  collection_record cr
    JOIN  collection_site_detail csd ON csd.collection_id = cr.collection_id
    JOIN  site s ON s.site_id = csd.site_id;
    """)
    
    # 4. Recreate v_olbaro_export with correct UTF-8 headers to fix encoding corruption
    op.execute("SET client_encoding = 'UTF8';")
    op.execute("DROP VIEW IF EXISTS v_olbaro_export CASCADE;")
    op.execute("""
    CREATE OR REPLACE VIEW v_olbaro_export AS
    SELECT cr.collection_id,
           cr.olbaro_doc_number AS "인계서번호", cr.waste_type_code AS "폐기물코드",
           '폐어망(고상)' AS "폐기물종류", cr.discharger_name AS "배출자",
           cr.collected_at::DATE AS "배출자인계일자", cr.transfer_person_name AS "인계자명",
           cr.total_weight_kg AS "위탁량_kg", m.name AS "운반자명",
           cr.vehicle_number AS "차량번호", cr.collected_at::DATE AS "인수일자",
           cr.total_weight_kg AS "인수량_kg", cr.acceptor_name AS "인수자명",
           cr.processing_method_code AS "처리방법코드", cr.processing_method_name AS "처리방법명",
           CASE WHEN cr.olbaro_doc_number IS NULL THEN '미등록' ELSE '등록완료' END AS "올바로등록상태"
    FROM  collection_record cr
    JOIN  netspa_manager m ON m.manager_id = cr.manager_id
    ORDER BY cr.collected_at DESC;
    """)


def downgrade() -> None:
    # 1. Drop and restore v_olbaro_export view (may use standard encoding but headers preserved)
    op.execute("DROP VIEW IF EXISTS v_olbaro_export CASCADE;")
    op.execute("""
    CREATE OR REPLACE VIEW v_olbaro_export AS
    SELECT cr.collection_id,
           cr.olbaro_doc_number AS "인계서번호", cr.waste_type_code AS "폐기물코드",
           '폐어망(고상)' AS "폐기물종류", cr.discharger_name AS "배출자",
           cr.collected_at::DATE AS "배출자인계일자", cr.transfer_person_name AS "인계자명",
           cr.total_weight_kg AS "위탁량_kg", m.name AS "운반자명",
           cr.vehicle_number AS "차량번호", cr.collected_at::DATE AS "인수일자",
           cr.total_weight_kg AS "인수량_kg", cr.acceptor_name AS "인수자명",
           cr.processing_method_code AS "처리방법코드", cr.processing_method_name AS "처리방법명",
           CASE WHEN cr.olbaro_doc_number IS NULL THEN '미등록' ELSE '등록완료' END AS "올바로등록상태"
    FROM  collection_record cr
    JOIN  netspa_manager m ON m.manager_id = cr.manager_id
    ORDER BY cr.collected_at DESC;
    """)
    
    # 2. Restore v_collection_composition to use old estimated_weight_kg
    op.execute("DROP VIEW IF EXISTS v_collection_composition CASCADE;")
    op.execute("""
    CREATE OR REPLACE VIEW v_collection_composition AS
    SELECT cr.collection_id, cr.collected_at, cr.total_weight_kg,
           csd.site_id, s.name AS site_name, csd.bag_count,
           ROUND(csd.bag_count * 100.0 / SUM(csd.bag_count) OVER (PARTITION BY cr.collection_id), 2) AS ratio_pct,
           ROUND(cr.total_weight_kg * csd.bag_count / NULLIF(SUM(csd.bag_count) OVER (PARTITION BY cr.collection_id), 0), 2) AS estimated_weight_kg
    FROM  collection_record cr
    JOIN  collection_site_detail csd ON csd.collection_id = cr.collection_id
    JOIN  site s ON s.site_id = csd.site_id;
    """)
    
    # 3. Drop trigger and function
    op.execute("DROP TRIGGER IF EXISTS trg_update_collection_total_weight ON collection_site_detail;")
    op.execute("DROP FUNCTION IF EXISTS fn_update_collection_total_weight();")
    
    # 4. Drop column and constraint
    op.drop_constraint('chk_detail_weight_pos', 'collection_site_detail', type_='check')
    op.drop_column('collection_site_detail', 'weight_kg')
