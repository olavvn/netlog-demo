from datetime import date, timedelta

from fastapi import APIRouter, Depends, HTTPException, Path, Query
from sqlalchemy.orm import Session
from sqlalchemy import text

from app.database import get_db

router = APIRouter(prefix="/map", tags=["map"])

# 지도에 표시할 집하장 site_code 목록 (고정)
MAP_SITE_CODES = ("MINRAK", "GIJANG", "JEONGJA", "DADAEPO")


# ── MAP API 1 ─────────────────────────────────────────────────────────────────
# GET /map/sites
# 지도 초기 로드용. 마커 위치 목록만 반환 (통계 없음).
# 대상 site_code의 위도/경도 및 기본 식별 정보만 반환한다.
# 인증 불필요 (공개 API).
@router.get("/sites")
def get_map_sites(db: Session = Depends(get_db)):
    rows = db.execute(
        text("""
            SELECT
                s.site_id,
                s.site_code,
                s.name,
                s.latitude,
                s.longitude
            FROM site s
            WHERE s.site_code = ANY(:codes)
            ORDER BY s.name
        """),
        {"codes": list(MAP_SITE_CODES)}
    ).fetchall()

    sites = [
        {
            "site_id": str(r.site_id),
            "site_code": r.site_code,
            "name": r.name,
            "latitude": float(r.latitude),
            "longitude": float(r.longitude),
        }
        for r in rows
    ]

    return {
        "success": True,
        "code": 200,
        "message": "조회 성공",
        "data": {"sites": sites},
    }


# ── MAP API 2 ─────────────────────────────────────────────────────────────────
# GET /map/sites/{site_id}/stats
# 지도 마커 클릭 시 팝업용. 특정 집하장의 누적 수거량 및 마지막 수거일 반환.
# - total_weight_kg: 해당 site_id의 collection_site_detail.weight_kg 전체 합산
# - last_collected_date: 해당 site_id를 포함하는 collection_record.collected_at 최대값 (날짜만)
# 인증 불필요 (공개 API).
@router.get("/sites/{site_id}/stats")
def get_site_stats(
    site_id: str = Path(..., description="집하장 UUID"),
    db: Session = Depends(get_db),
):
    # site 존재 여부 확인
    site = db.execute(
        text("SELECT site_id, name FROM site WHERE site_id = :site_id"),
        {"site_id": site_id}
    ).fetchone()

    if not site:
        raise HTTPException(status_code=404, detail="해당 집하장을 찾을 수 없습니다")

    stats = db.execute(
        text("""
            SELECT
                COALESCE(
                    (
                        SELECT SUM(csd.weight_kg)
                        FROM collection_site_detail csd
                        WHERE csd.site_id = :site_id
                          AND csd.weight_kg IS NOT NULL
                    ),
                    0.0
                ) AS total_weight_kg,
                (
                    SELECT MAX(cr.collected_at)::date
                    FROM collection_site_detail csd2
                    JOIN collection_record cr ON cr.collection_id = csd2.collection_id
                    WHERE csd2.site_id = :site_id
                      AND cr.collected_at IS NOT NULL
                ) AS last_collected_date
        """),
        {"site_id": site_id}
    ).fetchone()

    return {
        "success": True,
        "code": 200,
        "message": "조회 성공",
        "data": {
            "site_id": site_id,
            "name": site.name,
            "total_weight_kg": float(stats.total_weight_kg) if stats.total_weight_kg else 0.0,
            "last_collected_date": str(stats.last_collected_date) if stats.last_collected_date else None,
        },
    }


# ── MAP API 3 ─────────────────────────────────────────────────────────────────
# GET /map/summary?start_date=YYYY-MM-DD&end_date=YYYY-MM-DD
# 지도 SummaryPanel용 전체 수거 요약 반환.
# 지정된 날짜 범위 내 collection_record.total_weight_kg 합계 및
# 가장 최근 collected_at 날짜를 반환한다.
# collected_at이 NULL인 레코드(미완료 수거 계획)는 제외한다.
# 인증 불필요 (공개 API).
@router.get("/summary")
def get_map_summary(
    start_date: date = Query(..., description="조회 시작일 (YYYY-MM-DD)"),
    end_date: date   = Query(..., description="조회 종료일 (YYYY-MM-DD)"),
    db: Session = Depends(get_db),
):
    if end_date < start_date:
        raise HTTPException(status_code=400, detail="종료일은 시작일보다 이후여야 합니다")

    # PostgreSQL은 바인딩 파라미터에 INTERVAL을 직접 더할 수 없으므로
    # Python에서 end_date + 1일을 미리 계산하여 파라미터로 전달
    end_date_exclusive = end_date + timedelta(days=1)

    row = db.execute(
        text("""
            SELECT
                COALESCE(SUM(total_weight_kg), 0.0) AS total_weight_kg,
                MAX(collected_at)::date              AS last_collected_date
            FROM collection_record
            WHERE collected_at IS NOT NULL
              AND collected_at >= :start_date
              AND collected_at < :end_date_exclusive
        """),
        {
            "start_date": start_date,
            "end_date_exclusive": end_date_exclusive,
        }
    ).fetchone()

    return {
        "success": True,
        "code": 200,
        "message": "조회 성공",
        "data": {
            "total_weight_kg": float(row.total_weight_kg) if row.total_weight_kg else 0.0,
            "last_collected_date": str(row.last_collected_date) if row.last_collected_date else None,
        },
    }
