import sys
import os
from datetime import datetime, date, timedelta
from sqlalchemy import text

# netlog-server 루트 경로를 Python PATH에 추가
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from app.database import SessionLocal
from app.core.security import hash_password

def setup_dummy_data():
    db = SessionLocal()
    try:
        print("Cleaning up old test data...")
        # 1. 기존 테스트 데이터 삭제 (외래키 순서 고려)
        # 1-1. bag 삭제
        db.execute(text("""
            DELETE FROM bag 
            WHERE collection_id IN (
                SELECT collection_id FROM collection_record WHERE discharger_name = 'TEST_DISCHARGER'
            )
        """))
        
        # 1-2. test processing bundles 삭제
        db.execute(text("""
            DELETE FROM processing_bundle 
            WHERE processing_method_name = 'TEST_METHOD'
        """))
        
        # 1-3. collection_site_detail 삭제
        db.execute(text("""
            DELETE FROM collection_site_detail 
            WHERE collection_id IN (
                SELECT collection_id FROM collection_record WHERE discharger_name = 'TEST_DISCHARGER'
            )
        """))

        # 1-4. collection_record 삭제
        db.execute(text("DELETE FROM collection_record WHERE discharger_name = 'TEST_DISCHARGER'"))

        # 1-5. site_bag_queue 삭제
        db.execute(text("""
            DELETE FROM site_bag_queue
            WHERE site_id IN (
                SELECT site_id FROM site WHERE site_code IN ('TEST-SITE-01', 'TEST-SITE-02')
            )
        """))

        # 1-6. inspection_record 삭제
        db.execute(text("""
            DELETE FROM inspection_record
            WHERE site_id IN (
                SELECT site_id FROM site WHERE site_code IN ('TEST-SITE-01', 'TEST-SITE-02')
            )
        """))

        # 1-7. vessel 삭제
        db.execute(text("DELETE FROM vessel WHERE name = 'TEST_VESSEL'"))

        # 1-8. site 삭제
        db.execute(text("DELETE FROM site WHERE site_code IN ('TEST-SITE-01', 'TEST-SITE-02')"))

        # 1-9. netspa_manager 삭제
        db.execute(text("DELETE FROM netspa_manager WHERE login_id IN ('testadmin', 'testoperator')"))

        db.commit()

        print("Creating new dummy data...")
        
        # 2. site 생성 (PIN 번호 '123456' 해싱하여 저장)
        site_id_1 = db.execute(text("""
            INSERT INTO site (site_code, name, region, address, latitude, longitude, pin_hash)
            VALUES ('TEST-SITE-01', '테스트 집하장 A', '통영시', '경상남도 통영시 용남면', 34.854000, 128.432000, :pin)
            RETURNING site_id
        """), {"pin": hash_password("123456")}).scalar()
 
        site_id_2 = db.execute(text("""
            INSERT INTO site (site_code, name, region, address, latitude, longitude, pin_hash)
            VALUES ('TEST-SITE-02', '테스트 집하장 B', '통영시', '경상남도 통영시 광도면', 34.887000, 128.411000, :pin)
            RETURNING site_id
        """), {"pin": hash_password("123456")}).scalar()

        # 3. netspa_manager 생성 (비밀번호 각각 'admin123', 'operator123')
        admin_id = db.execute(text("""
            INSERT INTO netspa_manager (name, login_id, role, password_hash)
            VALUES ('테스트관리자', 'testadmin', 'admin', :pw)
            RETURNING manager_id
        """), {"pw": hash_password("admin123")}).scalar()
 
        operator_id = db.execute(text("""
            INSERT INTO netspa_manager (name, login_id, role, password_hash)
            VALUES ('테스트기사', 'testoperator', 'operator', :pw)
            RETURNING manager_id
        """), {"pw": hash_password("operator123")}).scalar()

        # 4. vessel 생성
        vessel_id = db.execute(text("""
            INSERT INTO vessel (name)
            VALUES ('TEST_VESSEL')
            RETURNING vessel_id
        """)).scalar()

        # 5. inspection_record 생성 (site_bag_queue가 트리거에 의해 자동 생성됨)
        # 10일 전 입고: 25개
        db.execute(text("""
            INSERT INTO inspection_record (site_id, vessel_id, bag_count, inspected_at)
            VALUES (:site_id, :vessel_id, 25, now() - interval '10 days')
        """), {"site_id": site_id_1, "vessel_id": vessel_id})

        # 8일 전 입고: 40개
        db.execute(text("""
            INSERT INTO inspection_record (site_id, vessel_id, bag_count, inspected_at)
            VALUES (:site_id, :vessel_id, 40, now() - interval '8 days')
        """), {"site_id": site_id_2, "vessel_id": vessel_id})

        # 5일 전 입고: 35개
        db.execute(text("""
            INSERT INTO inspection_record (site_id, vessel_id, bag_count, inspected_at)
            VALUES (:site_id, :vessel_id, 35, now() - interval '5 days')
        """), {"site_id": site_id_1, "vessel_id": vessel_id})

        # 2일 전 입고: 20개
        db.execute(text("""
            INSERT INTO inspection_record (site_id, vessel_id, bag_count, inspected_at)
            VALUES (:site_id, :vessel_id, 20, now() - interval '2 days')
        """), {"site_id": site_id_2, "vessel_id": vessel_id})

        # 6. 첫 번째 과거 수거 계획 수립 및 완료 처리 (10일 전 계획, 8일 전 완료)
        # planned 생성
        historical_collection_id_1 = db.execute(text("""
            INSERT INTO collection_record (manager_id, planned_at, status, discharger_name, waste_type_code)
            VALUES (:manager_id, now() - interval '10 days', 'planned', 'TEST_DISCHARGER', '510308')
            RETURNING collection_id
        """), {"manager_id": admin_id}).scalar()

        # 수거 상세 연결 (site_bag_queue 잔여량이 자동으로 bag_count가 됨: site1=25, site2=40)
        db.execute(text("""
            INSERT INTO collection_site_detail (collection_id, site_id, weight_kg)
            VALUES 
                (:collection_id, :site_id_1, 500.0),
                (:collection_id, :site_id_2, 400.0)
        """), {
            "collection_id": historical_collection_id_1,
            "site_id_1": site_id_1,
            "site_id_2": site_id_2
        })

        # 상태 전환 진행 (트리거 발동하여 queue 차감 및 collected_at 설정)
        db.execute(text("""
            UPDATE collection_record SET status = 'in_progress' WHERE collection_id = :cid
        """), {"cid": historical_collection_id_1})
        db.execute(text("""
            UPDATE collection_record SET status = 'completed' WHERE collection_id = :cid
        """), {"cid": historical_collection_id_1})
        db.execute(text("""
            UPDATE collection_record SET status = 'stacking_pending' WHERE collection_id = :cid
        """), {"cid": historical_collection_id_1})
        db.execute(text("""
            UPDATE collection_record SET status = 'stacked' WHERE collection_id = :cid
        """), {"cid": historical_collection_id_1})

        # collected_at을 실제 수거 완료일인 8일 전 시점으로 보정
        db.execute(text("""
            UPDATE collection_record SET collected_at = now() - interval '8 days' WHERE collection_id = :cid
        """), {"cid": historical_collection_id_1})

        # 7. 두 번째 과거 수거 계획 수립 및 완료 처리 (5일 전 계획, 3일 전 완료)
        historical_collection_id_2 = db.execute(text("""
            INSERT INTO collection_record (manager_id, planned_at, status, discharger_name, waste_type_code)
            VALUES (:manager_id, now() - interval '5 days', 'planned', 'TEST_DISCHARGER', '510308')
            RETURNING collection_id
        """), {"manager_id": admin_id}).scalar()

        # 수거 상세 연결 (site_bag_queue 잔여량 자동 매핑: site1=35)
        db.execute(text("""
            INSERT INTO collection_site_detail (collection_id, site_id, weight_kg)
            VALUES (:collection_id, :site_id_1, 300.0)
        """), {
            "collection_id": historical_collection_id_2,
            "site_id_1": site_id_1
        })

        # 상태 전환 진행
        db.execute(text("""
            UPDATE collection_record SET status = 'in_progress' WHERE collection_id = :cid
        """), {"cid": historical_collection_id_2})
        db.execute(text("""
            UPDATE collection_record SET status = 'completed' WHERE collection_id = :cid
        """), {"cid": historical_collection_id_2})
        db.execute(text("""
            UPDATE collection_record SET status = 'stacking_pending' WHERE collection_id = :cid
        """), {"cid": historical_collection_id_2})
        db.execute(text("""
            UPDATE collection_record SET status = 'stacked' WHERE collection_id = :cid
        """), {"cid": historical_collection_id_2})

        # collected_at을 3일 전 시점으로 보정
        db.execute(text("""
            UPDATE collection_record SET collected_at = now() - interval '3 days' WHERE collection_id = :cid
        """), {"cid": historical_collection_id_2})

        # 8. 현재 진행 중인 수거계획 생성 (dashboard 확인용)
        # 큐 추가입고 (오늘)
        db.execute(text("""
            INSERT INTO inspection_record (site_id, vessel_id, bag_count, inspected_at)
            VALUES (:site_id, :vessel_id, 15, now())
        """), {"site_id": site_id_1, "vessel_id": vessel_id})

        current_collection_id = db.execute(text("""
            INSERT INTO collection_record (manager_id, planned_at, status, discharger_name, waste_type_code)
            VALUES (:manager_id, now(), 'planned', 'TEST_DISCHARGER', '510308')
            RETURNING collection_id
        """), {"manager_id": admin_id}).scalar()

        db.execute(text("""
            INSERT INTO collection_site_detail (collection_id, site_id, weight_kg)
            VALUES (:collection_id, :site_id_1, NULL)
        """), {
            "collection_id": current_collection_id,
            "site_id_1": site_id_1
        })

        db.execute(text("""
            UPDATE collection_record SET status = 'in_progress' WHERE collection_id = :cid
        """), {"cid": current_collection_id})

        # 9. 렉 보관 중인 마대(bag) 생성
        # 8일 전 보관 10개 (A렉, historical_collection_id_1 소속)
        for i in range(1, 11):
            db.execute(text("""
                INSERT INTO bag (serial_number, collection_id, site_id, rack_code, status, stored_at)
                VALUES (:serial, :cid, :sid, 'A', 'stored', now() - interval '8 days')
            """), {
                "serial": f"BAG-TEST-{date.today().strftime('%Y%m%d')}-A{i:03d}",
                "cid": historical_collection_id_1,
                "sid": site_id_1
            })

        # 8일 전 보관 8개 (B렉, historical_collection_id_1 소속)
        for i in range(1, 9):
            db.execute(text("""
                INSERT INTO bag (serial_number, collection_id, site_id, rack_code, status, stored_at)
                VALUES (:serial, :cid, :sid, 'B', 'stored', now() - interval '8 days')
            """), {
                "serial": f"BAG-TEST-{date.today().strftime('%Y%m%d')}-B{i:03d}",
                "cid": historical_collection_id_1,
                "sid": site_id_2
            })

        # 3일 전 보관 12개 (C렉, historical_collection_id_2 소속)
        for i in range(1, 13):
            db.execute(text("""
                INSERT INTO bag (serial_number, collection_id, site_id, rack_code, status, stored_at)
                VALUES (:serial, :cid, :sid, 'C', 'stored', now() - interval '3 days')
            """), {
                "serial": f"BAG-TEST-{date.today().strftime('%Y%m%d')}-C{i:03d}",
                "cid": historical_collection_id_2,
                "sid": site_id_1
            })

        db.commit()
        print("\n=== Dummy Data Setup Summary ===")
        print(f"Created Historical collection_id 1: {historical_collection_id_1} (Status: stacked)")
        print(f"Created Historical collection_id 2: {historical_collection_id_2} (Status: stacked)")
        print(f"Created Current collection_id: {current_collection_id} (Status: in_progress)")
        print(f"TEST-SITE-01 ID: {site_id_1}")
        print(f"TEST-SITE-02 ID: {site_id_2}")
        print("Admin Login: testadmin / admin123")
        print("Operator Login: testoperator / operator123")
        print("================================")

    except Exception as e:
        db.rollback()
        print(f"Error during dummy data creation: {e}")
    finally:
        db.close()

if __name__ == "__main__":
    setup_dummy_data()
