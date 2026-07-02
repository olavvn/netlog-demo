from fastapi import APIRouter, Depends, HTTPException, Path, Query, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session
from sqlalchemy import text, cast
from sqlalchemy.dialects.postgresql import UUID, ARRAY
from app.database import get_db
from app.core.security import verify_token

from datetime import date, datetime
from typing import List, Optional

from pydantic import BaseModel
import uuid as uuid_lib


router = APIRouter(prefix="/dashboard", tags=["dashboard"])
security = HTTPBearer()


def get_current_manager(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: Session = Depends(get_db)
):
    payload = verify_token(credentials.credentials)
    if not payload or payload.get("type") != "manager":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="관리자 로그인이 필요합니다"
        )
    return payload


def require_admin(current_manager: dict = Depends(get_current_manager)):
    if current_manager.get("role") != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="관리자(admin) 권한이 필요합니다"
        )
    return current_manager


# ── Request Body 스키마 ──
class CreateCollectionRecordRequest(BaseModel):
    manager_id: str
    planned_at: str
    site_ids: list[str]

class CreateBundleRequest(BaseModel):
    bag_count: int
    processing_method_code: Optional[str] = None
    processing_method_name: Optional[str] = None

class UpdateBundleStatusRequest(BaseModel):
    status: str  # in_progress / completed


# ── API 1 ────────────────────────────────────────────────────────────────────
@router.get("/main/summary")
def get_main_summary(
    db: Session = Depends(get_db),
    current_manager: dict = Depends(require_admin)
):
    # 기존 4번의 순차 라운드트립을 CTE로 묶어 1번의 쿼리로 통합 (결과/계산 로직은 동일)
    row = db.execute(text("""
        WITH site_stats AS (
            SELECT
                COALESCE(SUM(current_bag_count), 0) AS total_bag_count,
                COUNT(*) FILTER (WHERE current_bag_count >= 200) AS urgent_site_count
            FROM v_site_dashboard
        ),
        last_week_bag AS (
            SELECT COALESCE(SUM(ir.bag_count), 0) AS last_week_bag_count
            FROM inspection_record ir
            WHERE ir.inspected_at < NOW() - INTERVAL '7 days'
              AND ir.is_collected = FALSE
        ),
        this_month AS (
            SELECT this_month_weight_kg
            FROM v_summary_stats
            LIMIT 1
        ),
        last_week_weight AS (
            SELECT COALESCE(SUM(total_weight_kg), 0) AS last_week_weight_kg
            FROM collection_record
            WHERE status = 'stacked'
              AND collected_at BETWEEN DATE_TRUNC('month', NOW() - INTERVAL '7 days')
                                    AND NOW() - INTERVAL '7 days'
        )
        SELECT
            site_stats.total_bag_count,
            site_stats.urgent_site_count,
            last_week_bag.last_week_bag_count,
            COALESCE(this_month.this_month_weight_kg, 0) AS this_month_weight_kg,
            last_week_weight.last_week_weight_kg
        FROM site_stats
        CROSS JOIN last_week_bag
        CROSS JOIN last_week_weight
        LEFT JOIN this_month ON TRUE
    """)).fetchone()

    total_bag = int(row.total_bag_count)
    urgent = int(row.urgent_site_count)
    last_week_bag = int(row.last_week_bag_count)
    this_weight = float(row.this_month_weight_kg)
    last_week_weight = float(row.last_week_weight_kg)

    return {
        "success": True,
        "code": 200,
        "message": "조회 성공",
        "data": {
            "total_bag_count": total_bag,
            "total_bag_count_diff": total_bag - last_week_bag,
            "urgent_site_count": urgent,
            "urgent_site_count_diff": None,  # 집하장 수는 전주 비교 어려움
            "this_month_weight_kg": this_weight,
            "this_month_weight_kg_diff": round(this_weight - last_week_weight, 2),
        }
    }


# ── API 2 ────────────────────────────────────────────────────────────────────
@router.get("/main/sites")
def get_main_sites(
    sort_by: str = Query(default="current_bag_count", pattern="^(current_bag_count|last_collected_at)$"),
    order: str = Query(default="desc", pattern="^(asc|desc)$"),
    db: Session = Depends(get_db),
    current_manager: dict = Depends(require_admin)
):
    null_order = "NULLS LAST"
    order_sql = f"{sort_by} {order.upper()} {null_order}"

    rows = db.execute(text(f"""
        SELECT
            s.site_id,
            s.name                                              AS site_name,
            s.site_code,
            s.address,
            vsd.current_bag_count,
            vsd.bag_status,
            -- collection_site_detail.completed_at 이 NULL 이면
            -- collection_record.collected_at 을 fallback 으로 사용
            COALESCE(
                vsd.last_collected_at,
                (
                    SELECT MAX(cr.collected_at)
                    FROM collection_site_detail csd2
                    JOIN collection_record cr ON cr.collection_id = csd2.collection_id
                    WHERE csd2.site_id = s.site_id
                      AND cr.collected_at IS NOT NULL
                )
            )                                                   AS last_collected_at,
            CASE
                WHEN COALESCE(
                    vsd.last_collected_at,
                    (
                        SELECT MAX(cr2.collected_at)
                        FROM collection_site_detail csd3
                        JOIN collection_record cr2 ON cr2.collection_id = csd3.collection_id
                        WHERE csd3.site_id = s.site_id
                          AND cr2.collected_at IS NOT NULL
                    )
                ) IS NULL THEN NULL
                ELSE EXTRACT(DAY FROM NOW() - COALESCE(
                    vsd.last_collected_at,
                    (
                        SELECT MAX(cr3.collected_at)
                        FROM collection_site_detail csd4
                        JOIN collection_record cr3 ON cr3.collection_id = csd4.collection_id
                        WHERE csd4.site_id = s.site_id
                          AND cr3.collected_at IS NOT NULL
                    )
                ))::INT
            END                                                 AS waiting_days
        FROM site s
        JOIN v_site_dashboard vsd ON vsd.site_id = s.site_id
        ORDER BY {order_sql}
    """)).fetchall()

    def bag_status(count: int) -> str:
        if count <= 50:
            return "green"
        elif count <= 150:
            return "yellow"
        return "red"

    items = [
        {
            "site_id": str(r.site_id),
            "site_name": r.site_name,
            "site_code": r.site_code,
            "address": r.address,
            "current_bag_count": int(r.current_bag_count),
            "last_collected_at": r.last_collected_at.isoformat() if r.last_collected_at else None,
            "waiting_days": r.waiting_days,
            "bag_status": bag_status(int(r.current_bag_count))
        }
        for r in rows
    ]

    return {
        "success": True,
        "code": 200,
        "message": "조회 성공",
        "data": {"items": items}
    }


# ── API 3 ────────────────────────────────────────────────────────────────────
# POST /dashboard/collection-records
# 수거 계획 생성
@router.post("/collection-records", status_code=201)
def create_collection_record(
    request: CreateCollectionRecordRequest,
    db: Session = Depends(get_db),
    current_manager: dict = Depends(get_current_manager)
):
    if not request.site_ids:
        raise HTTPException(status_code=400, detail="집하장 ID는 1개 이상 필요합니다")

    # collection_record INSERT
    record = db.execute(
        text("""
            INSERT INTO collection_record (manager_id, planned_at, status)
            VALUES (:manager_id, :planned_at, 'planned')
            RETURNING collection_id, status, planned_at, manager_id
        """),
        {
            "manager_id": request.manager_id,
            "planned_at": request.planned_at,
        }
    ).fetchone()

    collection_id = str(record.collection_id)

    # 각 집하장 collection_site_detail INSERT (bag_count는 트리거 자동 계산)
    sites = []
    for site_id in request.site_ids:
        detail = db.execute(
            text("""
                INSERT INTO collection_site_detail (collection_id, site_id)
                VALUES (:collection_id, :site_id)
                RETURNING detail_id, site_id, bag_count
            """),
            {"collection_id": collection_id, "site_id": site_id}
        ).fetchone()

        site = db.execute(
            text("SELECT name, site_code FROM site WHERE site_id = :site_id"),
            {"site_id": site_id}
        ).fetchone()

        sites.append({
            "detail_id": str(detail.detail_id),
            "site_id": site_id,
            "site_name": site.name if site else "",
            "site_code": site.site_code if site else "",
            "bag_count": detail.bag_count,
        })

    db.commit()

    return {
        "success": True,
        "code": 201,
        "message": "수거 계획이 생성되었습니다.",
        "data": {
            "collection_id": collection_id,
            "status": record.status,
            "planned_at": record.planned_at.isoformat(),
            "manager_id": request.manager_id,
            "sites": sites,
        }
    }


# ── API 4 ────────────────────────────────────────────────────────────────────
# GET /dashboard/collection-records
# 수거 기록 전체 목록 조회 (status 필터, 페이지네이션)
@router.get("/collection-records")
def get_collection_records(
    status: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    size: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
    current_manager: dict = Depends(get_current_manager)
):
    offset = (page - 1) * size
    where_clause = "WHERE 1=1"
    params = {"size": size, "offset": offset}

    if status:
        where_clause += " AND cr.status = :status"
        params["status"] = status

    # 1. 전체 수거 기록 개수 조회
    total = db.execute(
        text(f"""
            SELECT COUNT(*)
            FROM collection_record cr
            {where_clause}
        """),
        params
    ).scalar() or 0

    # 2. 현재 페이지에 표시할 수거 기록 조회
    records = db.execute(
        text(f"""
            SELECT
                cr.collection_id,
                cr.status,
                cr.planned_at,
                cr.collected_at,
                cr.total_weight_kg,
                cr.vehicle_number,
                m.name AS manager_name,
                COUNT(csd.detail_id) AS site_count
            FROM collection_record cr
            JOIN netspa_manager m
              ON m.manager_id = cr.manager_id
            LEFT JOIN collection_site_detail csd
              ON csd.collection_id = cr.collection_id
            {where_clause}
            GROUP BY
                cr.collection_id,
                cr.status,
                cr.planned_at,
                cr.collected_at,
                cr.total_weight_kg,
                cr.vehicle_number,
                m.name
            ORDER BY cr.planned_at DESC
            LIMIT :size OFFSET :offset
        """),
        params
    ).fetchall()

    # 현재 페이지에 기록이 없으면 즉시 반환
    if not records:
        return {
            "success": True,
            "code": 200,
            "message": "조회 성공",
            "data": {
                "total": int(total),
                "page": page,
                "size": size,
                "items": [],
            }
        }

    # 3. 현재 페이지에 포함된 모든 집하장 정보를 한 번에 조회
    collection_ids = [str(r.collection_id) for r in records]

    site_rows = db.execute(
        text("""
            SELECT
                csd.collection_id,
                csd.site_id,
                s.name AS site_name,
                s.site_code,
                csd.bag_count,
                csd.actual_bag_count,
                csd.weight_kg
            FROM collection_site_detail csd
            JOIN site s
              ON s.site_id = csd.site_id
            WHERE csd.collection_id = ANY(CAST(:collection_ids AS uuid[]))
            ORDER BY csd.collection_id
        """),
        {"collection_ids": collection_ids}
    ).fetchall()

    # 4. collection_id별로 집하장 목록 묶기
    sites_by_collection: dict[str, list[dict]] = {
        collection_id: []
        for collection_id in collection_ids
    }

    for s in site_rows:
        collection_id = str(s.collection_id)

        sites_by_collection[collection_id].append({
            "site_id": str(s.site_id),
            "site_name": s.site_name,
            "site_code": s.site_code,
            "bag_count": s.bag_count,
            "actual_bag_count": int(s.actual_bag_count) if s.actual_bag_count is not None else None,
            "weight_kg": float(s.weight_kg) if s.weight_kg is not None else None,
        })

    # 5. 최종 응답 구성
    items = []

    for r in records:
        collection_id = str(r.collection_id)

        items.append({
            "collection_id": collection_id,
            "status": r.status,
            "planned_at": r.planned_at.isoformat() if r.planned_at else None,
            "collected_at": r.collected_at.isoformat() if r.collected_at else None,
            "total_weight_kg": float(r.total_weight_kg) if r.total_weight_kg is not None else None,
            "vehicle_number": r.vehicle_number,
            "manager_name": r.manager_name,
            "site_count": int(r.site_count),
            "sites": sites_by_collection.get(collection_id, []),
        })

    return {
        "success": True,
        "code": 200,
        "message": "조회 성공",
        "data": {
            "total": int(total),
            "page": page,
            "size": size,
            "items": items,
        }
    }


# ── API 9 ────────────────────────────────────────────────────────────────────
@router.get("/racks/summary")
def get_racks_summary(
    db: Session = Depends(get_db),
    current_manager: dict = Depends(require_admin)
):
    total_stored_bag_count = db.execute(
        text("SELECT COUNT(*) FROM bag WHERE status = 'stored'")
    ).scalar() or 0

    stored_count_last_week = db.execute(
        text("""
            SELECT COUNT(*)
            FROM bag b
            LEFT JOIN processing_bundle pb ON b.bundle_id = pb.bundle_id
            WHERE b.stored_at <= NOW() - INTERVAL '7 days'
              AND (b.bundle_id IS NULL OR pb.processed_at > NOW() - INTERVAL '7 days')
        """)
    ).scalar() or 0
    total_stored_bag_count_diff = total_stored_bag_count - stored_count_last_week

    current_weight = db.execute(
        text("SELECT COALESCE(SUM(total_weight_kg), 0) FROM collection_record WHERE status = 'stacked'")
    ).scalar() or 0.0

    weight_last_week = db.execute(
        text("""
            SELECT COALESCE(SUM(total_weight_kg), 0)
            FROM collection_record
            WHERE status = 'stacked' AND collected_at <= NOW() - INTERVAL '7 days'
        """)
    ).scalar() or 0.0
    total_weight_kg_diff = float(current_weight) - float(weight_last_week)

    current_collection_count = db.execute(
        text("SELECT COUNT(*) FROM collection_record WHERE status = 'stacked'")
    ).scalar() or 0

    collection_count_last_week = db.execute(
        text("""
            SELECT COUNT(*)
            FROM collection_record
            WHERE status = 'stacked' AND collected_at <= NOW() - INTERVAL '7 days'
        """)
    ).scalar() or 0
    collection_count_diff = current_collection_count - collection_count_last_week

    oldest_row = db.execute(
        text("""
            SELECT
                b.serial_number,
                s.name AS site_name,
                b.stored_at,
                (
                    SELECT COUNT(*)
                    FROM bag b2
                    WHERE b2.collection_id = b.collection_id AND b2.site_id = b.site_id
                ) AS bag_count
            FROM bag b
            JOIN site s ON b.site_id = s.site_id
            WHERE b.status = 'stored'
            ORDER BY b.stored_at ASC
            LIMIT 1
        """)
    ).fetchone()

    oldest_bag = None
    if oldest_row:
        oldest_bag = {
            "serial_number": oldest_row.serial_number,
            "site_name": oldest_row.site_name,
            "bag_count": int(oldest_row.bag_count),
            "stored_at": oldest_row.stored_at.isoformat() if oldest_row.stored_at else None
        }

    return {
        "success": True,
        "code": 200,
        "message": "조회 성공",
        "data": {
            "total_stored_bag_count": int(total_stored_bag_count),
            "total_stored_bag_count_diff": int(total_stored_bag_count_diff),
            "total_weight_kg": float(current_weight),
            "total_weight_kg_diff": round(total_weight_kg_diff, 2),
            "collection_count": int(current_collection_count),
            "collection_count_diff": int(collection_count_diff),
            "oldest_bag": oldest_bag
        }
    }


# ── API 10 ────────────────────────────────────────────────────────────────────
@router.get("/racks")
def get_racks(
    db: Session = Depends(get_db),
    current_manager: dict = Depends(require_admin)
):
    rows = db.execute(text("""
        SELECT
            r.rack_code,
            r.max_capacity,
            COALESCE(b.current_count, 0)                          AS current_count,
            r.max_capacity - COALESCE(b.current_count, 0)         AS available_count
        FROM rack r
        LEFT JOIN (
            SELECT rack_code, COUNT(*) AS current_count
            FROM bag
            WHERE status = 'stored'
            GROUP BY rack_code
        ) b ON b.rack_code = r.rack_code
        ORDER BY r.rack_code
    """)).fetchall()

    return {
        "success": True,
        "code": 200,
        "message": "조회 성공",
        "data": {
            "items": [
                {
                    "rack_code": r.rack_code,
                    "max_capacity": r.max_capacity,
                    "current_count": int(r.current_count),
                    "available_count": int(r.available_count)
                }
                for r in rows
            ]
        }
    }


# ── API 11 ────────────────────────────────────────────────────────────────────
@router.get("/racks/{rack_code}/bags")
def get_rack_bags(
    rack_code: str = Path(..., description="렉 코드 (A / B / C / D)"),
    page: int = Query(default=1, ge=1),
    size: int = Query(default=20, ge=1, le=100),
    db: Session = Depends(get_db),
    current_manager: dict = Depends(require_admin)
):
    rack = db.execute(
        text("SELECT rack_code FROM rack WHERE rack_code = :rack_code"),
        {"rack_code": rack_code}
    ).fetchone()

    if not rack:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"렉 코드 '{rack_code}'를 찾을 수 없습니다"
        )

    offset = (page - 1) * size
    total = db.execute(
        text("SELECT COUNT(*) FROM bag WHERE rack_code = :rack_code AND status = 'stored'"),
        {"rack_code": rack_code}
    ).scalar()

    rows = db.execute(text("""
        SELECT
            b.bag_id, b.serial_number, b.collection_id,
            b.site_id, s.name AS site_name,
            b.status, b.stored_at, b.bundle_id
        FROM bag b
        JOIN site s ON s.site_id = b.site_id
        WHERE b.rack_code = :rack_code AND b.status = 'stored'
        ORDER BY b.stored_at ASC
        LIMIT :size OFFSET :offset
    """), {"rack_code": rack_code, "size": size, "offset": offset}).fetchall()

    return {
        "success": True,
        "code": 200,
        "message": "조회 성공",
        "data": {
            "rack_code": rack_code,
            "total": int(total),
            "page": page,
            "size": size,
            "items": [
                {
                    "bag_id": str(r.bag_id),
                    "serial_number": r.serial_number,
                    "collection_id": str(r.collection_id),
                    "site_id": str(r.site_id),
                    "site_name": r.site_name,
                    "status": r.status,
                    "stored_at": r.stored_at.isoformat() if r.stored_at else None,
                    "bundle_id": str(r.bundle_id) if r.bundle_id else None
                }
                for r in rows
            ]
        }
    }


# ── API 13 ────────────────────────────────────────────────────────────────────
@router.post("/processing/bundles", status_code=201)
def create_processing_bundle(
    body: CreateBundleRequest,
    db: Session = Depends(get_db),
    current_manager: dict = Depends(require_admin)
):
    available = db.execute(
        text("SELECT COUNT(*) FROM bag WHERE status = 'stored' AND bundle_id IS NULL"),
    ).scalar()

    if int(available) < body.bag_count:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"적재된 마대가 부족합니다. (요청: {body.bag_count}개, 가용: {available}개)"
        )

    selected_bags = db.execute(
        text("""
            SELECT
                b.bag_id, b.serial_number, b.rack_code,
                b.site_id, s.name AS site_name, b.stored_at
            FROM bag b
            JOIN site s ON s.site_id = b.site_id
            WHERE b.status = 'stored' AND b.bundle_id IS NULL
            ORDER BY
                b.stored_at ASC,
                CASE b.rack_code
                    WHEN 'A' THEN 1 WHEN 'B' THEN 2
                    WHEN 'C' THEN 3 WHEN 'D' THEN 4
                    ELSE 5
                END ASC
            LIMIT :cnt
        """),
        {"cnt": body.bag_count}
    ).fetchall()

    bundle_row = db.execute(
        text("""
            INSERT INTO processing_bundle
                (bag_count, processing_method_code, processing_method_name)
            VALUES
                (:bag_count, :method_code, :method_name)
            RETURNING bundle_id, status, processed_at
        """),
        {
            "bag_count": body.bag_count,
            "method_code": body.processing_method_code,
            "method_name": body.processing_method_name,
        }
    ).fetchone()

    bundle_id = str(bundle_row.bundle_id)
    selected_ids = [str(b.bag_id) for b in selected_bags]

    id_list = ', '.join([f"'{i}'" for i in selected_ids])
    db.execute(
        text(f"UPDATE bag SET bundle_id = :bid WHERE bag_id = ANY(ARRAY[{id_list}]::uuid[]) AND status = 'stored'"),
        {"bid": bundle_id}
    )

    db.commit()

    return {
        "success": True,
        "code": 201,
        "message": "공정 투입이 생성되었습니다.",
        "data": {
            "bundle_id": bundle_id,
            "status": bundle_row.status,
            "bag_count": body.bag_count,
            "processing_method_code": body.processing_method_code,
            "processing_method_name": body.processing_method_name,
            "processed_at": bundle_row.processed_at.isoformat() if bundle_row.processed_at else None,
            "bags": [
                {
                    "bag_id": str(b.bag_id),
                    "serial_number": b.serial_number,
                    "rack_code": b.rack_code,
                    "site_id": str(b.site_id),
                    "site_name": b.site_name,
                    "stored_at": b.stored_at.isoformat() if b.stored_at else None
                }
                for b in selected_bags
            ]
        }
    }


# ── API 14 ────────────────────────────────────────────────────────────────────
@router.get("/processing/bundles")
def get_processing_bundles(
    bundle_status: Optional[str] = Query(default=None, alias="status"),
    page: int = Query(default=1, ge=1),
    size: int = Query(default=20, ge=1, le=100),
    db: Session = Depends(get_db),
    current_manager: dict = Depends(require_admin)
):
    valid_statuses = {"ready", "in_progress", "completed"}
    if bundle_status and bundle_status not in valid_statuses:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"유효하지 않은 상태값입니다. 허용값: {', '.join(sorted(valid_statuses))}"
        )

    where_clause = "WHERE pb.status = :status" if bundle_status else ""
    params: dict = {}
    if bundle_status:
        params["status"] = bundle_status

    total = db.execute(
        text(f"SELECT COUNT(*) FROM processing_bundle pb {where_clause}"),
        params
    ).scalar()

    offset = (page - 1) * size
    params.update({"size": size, "offset": offset})

    bundles = db.execute(
        text(f"""
            SELECT bundle_id, status, bag_count,
                   processing_method_code, processing_method_name, processed_at
            FROM processing_bundle pb
            {where_clause}
            ORDER BY processed_at DESC
            LIMIT :size OFFSET :offset
        """),
        params
    ).fetchall()

    bundle_ids = [str(b.bundle_id) for b in bundles]
    bags_by_bundle: dict = {bid: [] for bid in bundle_ids}

    if bundle_ids:
        bids_str = ', '.join([f"'{b}'" for b in bundle_ids])
        bag_rows = db.execute(
            text(f"""
                SELECT
                    b.bag_id, b.serial_number, b.rack_code,
                    b.site_id, s.name AS site_name,
                    b.status, b.stored_at, b.bundle_id,
                    b.collection_id
                FROM bag b
                JOIN site s ON s.site_id = b.site_id
                WHERE b.bundle_id = ANY(ARRAY[{bids_str}]::uuid[])
                ORDER BY b.stored_at ASC
            """)
        ).fetchall()

        for bag in bag_rows:
            bid = str(bag.bundle_id)
            if bid in bags_by_bundle:
                bags_by_bundle[bid].append({
                    "bag_id": str(bag.bag_id),
                    "serial_number": bag.serial_number,
                    "rack_code": bag.rack_code,
                    "site_id": str(bag.site_id),
                    "site_name": bag.site_name,
                    "status": bag.status,
                    "stored_at": bag.stored_at.isoformat() if bag.stored_at else None,
                    "collection_id": str(bag.collection_id) if bag.collection_id else None
                })

    items = []
    for b in bundles:
        bid = str(b.bundle_id)
        bundle_bags = bags_by_bundle.get(bid, [])

        rack_breakdown = {}
        site_breakdown = {}
        for bag in bundle_bags:
            r_code = bag.get("rack_code")
            s_name = bag.get("site_name")
            if r_code:
                rack_breakdown[r_code] = rack_breakdown.get(r_code, 0) + 1
            if s_name:
                site_breakdown[s_name] = site_breakdown.get(s_name, 0) + 1

        items.append({
            "bundle_id": bid,
            "status": b.status,
            "bag_count": b.bag_count,
            "processing_method_code": b.processing_method_code,
            "processing_method_name": b.processing_method_name,
            "processed_at": b.processed_at.isoformat() if b.processed_at else None,
            "rack_breakdown": rack_breakdown,
            "site_breakdown": site_breakdown,
            "bags": bundle_bags
        })

    return {
        "success": True,
        "code": 200,
        "message": "조회 성공",
        "data": {
            "total": int(total),
            "page": page,
            "size": size,
            "items": items
        }
    }


# ── API 15 ────────────────────────────────────────────────────────────────────
@router.patch("/processing/bundles/{bundle_id}/status")
def update_bundle_status(
    bundle_id: str = Path(..., description="공정 번들 ID"),
    body: UpdateBundleStatusRequest = ...,
    db: Session = Depends(get_db),
    current_manager: dict = Depends(require_admin)
):
    allowed_transitions = {
        "ready": "in_progress",
        "in_progress": "completed"
    }

    if body.status not in ("in_progress", "completed"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="변경 가능한 상태는 in_progress 또는 completed입니다"
        )

    bundle = db.execute(
        text("SELECT bundle_id, status FROM processing_bundle WHERE bundle_id = :bid"),
        {"bid": bundle_id}
    ).fetchone()

    if not bundle:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="공정 번들을 찾을 수 없습니다"
        )

    current_status = bundle.status
    expected_next = allowed_transitions.get(current_status)

    if body.status != expected_next:
        if expected_next is None:
            detail = f"이미 완료된 번들입니다. (현재 상태: {current_status})"
        else:
            detail = (
                f"허용되지 않는 상태 전환입니다. "
                f"현재 상태 '{current_status}'에서는 '{expected_next}'으로만 전환 가능합니다."
            )
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=detail)

    if body.status == "in_progress":
        db.execute(
            text("UPDATE bag SET status = 'processing' WHERE bundle_id = :bid AND status = 'stored'"),
            {"bid": bundle_id}
        )
        message = "공정이 진행 중으로 변경되었습니다."
    else:
        db.execute(
            text("UPDATE bag SET status = 'processed' WHERE bundle_id = :bid AND status = 'processing'"),
            {"bid": bundle_id}
        )
        message = "공정이 완료되었습니다."

    db.execute(
        text("UPDATE processing_bundle SET status = :new_status WHERE bundle_id = :bid"),
        {"new_status": body.status, "bid": bundle_id}
    )

    db.commit()

    return {
        "success": True,
        "code": 200,
        "message": message,
        "data": {
            "bundle_id": bundle_id,
            "status": body.status
        }
    }


# ── API 5 ────────────────────────────────────────────────────────────────────
# GET /dashboard/collection-records/{collection_id}
# 수거 기록 상세 조회
@router.get("/collection-records/{collection_id}")
def get_collection_record_detail(
    collection_id: str = Path(..., description="수거 기록 ID"),
    db: Session = Depends(get_db),
    current_manager: dict = Depends(get_current_manager)
):
    record = db.execute(
        text("""
            SELECT
                cr.collection_id, cr.status, cr.planned_at, cr.collected_at,
                cr.total_weight_kg, cr.vehicle_number, cr.transfer_person_name,
                cr.discharger_name, cr.acceptor_name,
                cr.processing_method_code, cr.processing_method_name,
                cr.olbaro_doc_number,
                m.name AS manager_name
            FROM collection_record cr
            JOIN netspa_manager m ON m.manager_id = cr.manager_id
            WHERE cr.collection_id = :collection_id
        """),
        {"collection_id": collection_id}
    ).fetchone()

    if not record:
        raise HTTPException(status_code=404, detail="수거 기록을 찾을 수 없습니다")

    # 집하장별 상세 조회
    site_rows = db.execute(
        text("""
            SELECT
                csd.detail_id, csd.site_id, csd.bag_count,
                csd.actual_bag_count, csd.weight_kg,
                s.name AS site_name, s.site_code
            FROM collection_site_detail csd
            JOIN site s ON s.site_id = csd.site_id
            WHERE csd.collection_id = :collection_id
        """),
        {"collection_id": collection_id}
    ).fetchall()

    sites = []
    for s in site_rows:
        # stacking_pending / stacked 상태일 때 렉 정보 포함
        racks = None
        if record.status in ("stacking_pending", "stacked"):
            rack_rows = db.execute(
                text("""
                    SELECT rack_code, COUNT(*) AS bag_count
                    FROM bag
                    WHERE collection_id = :collection_id
                      AND site_id = :site_id
                      AND rack_code IS NOT NULL
                    GROUP BY rack_code
                    ORDER BY rack_code
                """),
                {"collection_id": collection_id, "site_id": str(s.site_id)}
            ).fetchall()
            racks = [{"rack_code": r.rack_code, "bag_count": int(r.bag_count)} for r in rack_rows]

        sites.append({
            "detail_id": str(s.detail_id),
            "site_id": str(s.site_id),
            "site_name": s.site_name,
            "site_code": s.site_code,
            "bag_count": s.bag_count,
            "actual_bag_count": s.actual_bag_count,
            "weight_kg": float(s.weight_kg) if s.weight_kg else None,
            "racks": racks,
        })

    return {
        "success": True,
        "code": 200,
        "message": "조회 성공",
        "data": {
            "collection_id": str(record.collection_id),
            "status": record.status,
            "planned_at": record.planned_at.isoformat() if record.planned_at else None,
            "collected_at": record.collected_at.isoformat() if record.collected_at else None,
            "total_weight_kg": float(record.total_weight_kg) if record.total_weight_kg else None,
            "vehicle_number": record.vehicle_number,
            "transfer_person_name": record.transfer_person_name,
            "discharger_name": record.discharger_name,
            "acceptor_name": record.acceptor_name,
            "processing_method_code": record.processing_method_code,
            "processing_method_name": record.processing_method_name,
            "olbaro_doc_number": record.olbaro_doc_number,
            "manager_name": record.manager_name,
            "sites": sites,
        }
    }


# ── API 6 ────────────────────────────────────────────────────────────────────
# PATCH /dashboard/collection-records/{collection_id}/info
# 수거 정보 입력 STEP 1
# 운반 담당자, 차량번호, 계근 무게 입력 + planned → in_progress 전환
class Step1SiteInput(BaseModel):
    detail_id: str
    weight_kg: float

class Step1Request(BaseModel):
    transfer_person_name: str
    vehicle_number: str
    sites: list[Step1SiteInput]

@router.patch("/collection-records/{collection_id}/info")
def update_collection_info(
    collection_id: str = Path(...),
    body: Step1Request = ...,
    db: Session = Depends(get_db),
    current_manager: dict = Depends(get_current_manager)
):
    # 존재 및 상태 확인
    record = db.execute(
        text("SELECT collection_id, status FROM collection_record WHERE collection_id = :id"),
        {"id": collection_id}
    ).fetchone()

    if not record:
        raise HTTPException(status_code=404, detail="수거 기록을 찾을 수 없습니다")
    if record.status not in ("planned", "in_progress"):
        raise HTTPException(status_code=400, detail=f"planned 또는 in_progress 상태에서만 가능합니다. 현재: {record.status}")

    # collection_record 업데이트 (planned일 때만 in_progress로 전환)
    new_status = "in_progress" if record.status == "planned" else record.status
    db.execute(
        text("""
            UPDATE collection_record
            SET transfer_person_name = :transfer_person_name,
                vehicle_number = :vehicle_number,
                status = :new_status
            WHERE collection_id = :collection_id
        """),
        {
            "transfer_person_name": body.transfer_person_name,
            "vehicle_number": body.vehicle_number,
            "new_status": new_status,
            "collection_id": collection_id,
        }
    )

    # 거점별 weight_kg 업데이트 (트리거가 total_weight_kg 자동 계산)
    for site in body.sites:
        db.execute(
            text("""
                UPDATE collection_site_detail
                SET weight_kg = :weight_kg
                WHERE detail_id = :detail_id
            """),
            {"weight_kg": site.weight_kg, "detail_id": site.detail_id}
        )

    db.commit()

    # 업데이트된 거점 정보 조회
    site_rows = db.execute(
        text("""
            SELECT
                csd.detail_id, csd.site_id, csd.bag_count,
                csd.actual_bag_count, csd.weight_kg,
                s.name AS site_name
            FROM collection_site_detail csd
            JOIN site s ON s.site_id = csd.site_id
            WHERE csd.collection_id = :collection_id
        """),
        {"collection_id": collection_id}
    ).fetchall()

    total_weight = db.execute(
        text("SELECT total_weight_kg FROM collection_record WHERE collection_id = :id"),
        {"id": collection_id}
    ).scalar()

    return {
        "success": True,
        "code": 200,
        "message": "수거 정보가 입력되었습니다.",
        "data": {
            "collection_id": collection_id,
            "status": new_status,
            "transfer_person_name": body.transfer_person_name,
            "vehicle_number": body.vehicle_number,
            "total_weight_kg": float(total_weight) if total_weight else None,
            "sites": [
                {
                    "detail_id": str(s.detail_id),
                    "site_id": str(s.site_id),
                    "site_name": s.site_name,
                    "bag_count": s.bag_count,
                    "actual_bag_count": None,
                    "weight_kg": float(s.weight_kg) if s.weight_kg else None,
                }
                for s in site_rows
            ]
        }
    }


# ── API 7 ────────────────────────────────────────────────────────────────────
# POST /dashboard/collection-records/{collection_id}/stacking
# 보관 장소 입력 STEP 2
# 렉별 bag 생성 + in_progress → completed → stacking_pending 전환
class RackInput(BaseModel):
    rack_code: str
    bag_count: int

class Step2SiteInput(BaseModel):
    detail_id: str
    site_id: str
    racks: list[RackInput]

class Step2Request(BaseModel):
    sites: list[Step2SiteInput]

@router.post("/collection-records/{collection_id}/stacking", status_code=201)
def input_stacking(
    collection_id: str = Path(...),
    body: Step2Request = ...,
    db: Session = Depends(get_db),
    current_manager: dict = Depends(get_current_manager)
):
    # 존재 및 상태 확인
    record = db.execute(
        text("SELECT collection_id, status FROM collection_record WHERE collection_id = :id"),
        {"id": collection_id}
    ).fetchone()

    if not record:
        raise HTTPException(status_code=404, detail="수거 기록을 찾을 수 없습니다")
    if record.status not in ("in_progress", "completed", "stacking_pending"):
        raise HTTPException(status_code=400, detail=f"in_progress, completed, 또는 stacking_pending 상태에서만 가능합니다. 현재: {record.status}")

    # 렉 용량 초과 검증
    capacity_errors = []
    for site in body.sites:
        for rack in site.racks:
            rack_info = db.execute(
                text("SELECT max_capacity FROM rack WHERE rack_code = :rack_code"),
                {"rack_code": rack.rack_code}
            ).fetchone()

            if not rack_info:
                raise HTTPException(status_code=400, detail=f"렉 코드 '{rack.rack_code}'를 찾을 수 없습니다")

            current_count = db.execute(
                text("SELECT COUNT(*) FROM bag WHERE rack_code = :rack_code AND status = 'stored'"),
                {"rack_code": rack.rack_code}
            ).scalar()

            available = rack_info.max_capacity - current_count
            if rack.bag_count > available:
                capacity_errors.append({
                    "rack_code": rack.rack_code,
                    "requested": rack.bag_count,
                    "available": int(available),
                    "max_capacity": rack_info.max_capacity,
                    "current_count": int(current_count),
                })

    if capacity_errors:
        raise HTTPException(
            status_code=400,
            detail={
                "success": False,
                "code": 400,
                "message": "렉 용량을 초과하였습니다.",
                "data": {"errors": capacity_errors}
            }
        )

    # bag 생성 및 actual_bag_count 업데이트
    result_sites = []
    
    try:
        for site in body.sites:
            total_actual = sum(r.bag_count for r in site.racks)
            rack_results = []
            
            for rack in site.racks:
                for i in range(rack.bag_count):
                    today = datetime.utcnow().strftime("%Y%m%d")
                    serial = f"BAG-{today}-{str(uuid_lib.uuid4())[:8].upper()}"
                    db.execute(
                        text("""
                            INSERT INTO bag (serial_number, collection_id, site_id, rack_code, status)
                            VALUES (:serial, :collection_id, :site_id, :rack_code, 'stored')
                        """),
                        {
                            "serial": serial,
                            "collection_id": collection_id,
                            "site_id": site.site_id,
                            "rack_code": rack.rack_code,
                        }
                    )

                current_after = db.execute(
                    text("SELECT COUNT(*) FROM bag WHERE rack_code = :rack_code AND status = 'stored'"),
                    {"rack_code": rack.rack_code}
                ).scalar()
                max_cap = db.execute(
                    text("SELECT max_capacity FROM rack WHERE rack_code = :rack_code"),
                    {"rack_code": rack.rack_code}
                ).scalar()
                rack_results.append({
                    "rack_code": rack.rack_code,
                    "bag_count": rack.bag_count,
                    "current_count": int(current_after),
                    "max_capacity": int(max_cap),
                })

            db.execute(
                text("UPDATE collection_site_detail SET actual_bag_count = :actual WHERE detail_id = :detail_id"),
                {"actual": total_actual, "detail_id": site.detail_id}
            )

            site_name = db.execute(
                text("SELECT name FROM site WHERE site_id = :site_id"),
                {"site_id": site.site_id}
            ).scalar()

            result_sites.append({
                "site_id": site.site_id,
                "site_name": site_name,
                "actual_bag_count": total_actual,
                "created_bag_count": total_actual,
                "racks": rack_results,
            })

        db.execute(
            text("UPDATE collection_record SET status = 'completed' WHERE collection_id = :id"),
            {"id": collection_id}
        )
        db.execute(
            text("UPDATE collection_record SET status = 'stacking_pending' WHERE collection_id = :id"),
            {"id": collection_id}
        )
        db.commit()

    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))

    return {
        "success": True,
        "code": 201,
        "message": "보관 장소가 입력되었습니다.",
        "data": {
            "collection_id": collection_id,
            "status": "stacking_pending",
            "sites": result_sites,
        }
    }


# ── API 8 ────────────────────────────────────────────────────────────────────
# PATCH /dashboard/collection-records/{collection_id}/status
# 수거완료 STEP 3 — stacking_pending → stacked 전환
class UpdateCollectionStatusRequest(BaseModel):
    status: str  # completed / stacked

@router.patch("/collection-records/{collection_id}/status")
def update_collection_status(
    collection_id: str = Path(...),
    body: UpdateCollectionStatusRequest = ...,
    db: Session = Depends(get_db),
    current_manager: dict = Depends(get_current_manager)
):
    if body.status not in ("completed", "stacked"):
        raise HTTPException(status_code=400, detail="completed 또는 stacked만 허용됩니다")

    record = db.execute(
        text("SELECT collection_id, status, collected_at FROM collection_record WHERE collection_id = :id"),
        {"id": collection_id}
    ).fetchone()

    if not record:
        raise HTTPException(status_code=404, detail="수거 기록을 찾을 수 없습니다")

    # 허용 전환 검증
    allowed = {
        "in_progress": "completed",
        "stacking_pending": "stacked",
    }
    if allowed.get(record.status) != body.status:
        raise HTTPException(
            status_code=400,
            detail={
                "success": False,
                "code": 400,
                "message": f"유효하지 않은 상태 전환입니다. 현재 상태: {record.status}, 요청 상태: {body.status}",
                "data": None
            }
        )

    try:
        db.execute(
            text("UPDATE collection_record SET status = :status WHERE collection_id = :id"),
            {"status": body.status, "id": collection_id}
        )
        db.commit()
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(e))

    updated = db.execute(
        text("SELECT status, collected_at FROM collection_record WHERE collection_id = :id"),
        {"id": collection_id}
    ).fetchone()

    message = "수거가 완료되었습니다." if body.status == "completed" else "적재가 완료되었습니다."

    return {
        "success": True,
        "code": 200,
        "message": message,
        "data": {
            "collection_id": collection_id,
            "status": updated.status,
            "collected_at": updated.collected_at.isoformat() if updated.collected_at else None,
        }
    }