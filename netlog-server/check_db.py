import sys
from sqlalchemy import text
from app.database import SessionLocal

def main():
    db = SessionLocal()
    try:
        # 1. collection_site_detail 테이블 내용 조회
        print("=== Collection Site Details ===")
        rows = db.execute(text("""
            SELECT detail_id, collection_id, site_id, bag_count, actual_bag_count
            FROM collection_site_detail
            LIMIT 20
        """)).fetchall()
        for r in rows:
            print(f"DetailID: {r.detail_id} | CollectionID: {r.collection_id} | SiteID: {r.site_id} | Planned: {r.bag_count} | Actual: {r.actual_bag_count}")
        
        # 2. bag 테이블 데이터 개수 조회
        print("\n=== Bag Table Counts by Collection ===")
        bag_counts = db.execute(text("""
            SELECT collection_id, site_id, status, COUNT(*) 
            FROM bag 
            GROUP BY collection_id, site_id, status
        """)).fetchall()
        for b in bag_counts:
            print(f"CollectionID: {b.collection_id} | SiteID: {b.site_id} | Status: {b.status} | Count: {b[3]}")

        # 3. 특정 collection_id에 대해 update 시도 후 조회 테스트
        if rows:
            target = rows[0]
            print(f"\nTesting update on DetailID: {target.detail_id}...")
            # actual_bag_count를 임시로 99로 업데이트 시도
            db.execute(text("""
                UPDATE collection_site_detail 
                SET actual_bag_count = 99 
                WHERE detail_id = :detail_id
            """), {"detail_id": target.detail_id})
            db.commit()
            
            # 확인
            val = db.execute(text("""
                SELECT actual_bag_count 
                FROM collection_site_detail 
                WHERE detail_id = :detail_id
            """), {"detail_id": target.detail_id}).scalar()
            print(f"Value after direct UPDATE: {val}")
            
            # 원복
            db.execute(text("""
                UPDATE collection_site_detail 
                SET actual_bag_count = :val 
                WHERE detail_id = :detail_id
            """), {"val": target.actual_bag_count, "detail_id": target.detail_id})
            db.commit()
            print("Restored original value.")

    except Exception as e:
        print(f"Error: {e}", file=sys.stderr)
    finally:
        db.close()

if __name__ == "__main__":
    main()
