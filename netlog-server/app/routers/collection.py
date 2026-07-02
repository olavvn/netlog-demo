import io
from datetime import date

# [추가] Query: GET 파라미터 선언에 사용, StreamingResponse: 파일 스트리밍 응답에 사용
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, Query, status
from fastapi.responses import StreamingResponse

from sqlalchemy.orm import Session
from sqlalchemy import text
from app.database import get_db
from app.core.security import verify_token
from app.services.cloudinary_service import upload_image

# [추가] Excel export 기능을 담당하는 서비스 함수 import (신규 파일: app/services/excel_service.py)
from app.services.excel_service import generate_inspection_excel

from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

router = APIRouter(prefix="/inspection", tags=["inspection"])
security = HTTPBearer()


# JWT 토큰에서 검수자(site) 정보를 추출하는 의존성 함수.
# Authorization 헤더의 Bearer 토큰을 파싱하여 payload를 반환한다.
# type이 "site"가 아니면 401을 발생시켜 다른 사용자 유형의 접근을 차단한다.
def get_current_site(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: Session = Depends(get_db)
):
    payload = verify_token(credentials.credentials)
    if not payload or payload.get("type") != "site":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="검수자 로그인이 필요합니다"
        )
    return payload


# POST /inspection/record
# 검수자가 마대 입고 기록을 등록하는 엔드포인트.
# multipart/form-data로 선박명, 마대 수량, 사진 파일을 받는다.
@router.post("/record", status_code=201)
def create_inspection_record(
    vessel_name: str = Form(...),
    bag_count: int = Form(...),
    image: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_site: dict = Depends(get_current_site)
):
    # JWT payload의 "sub" 필드가 site_id (UUID 문자열)
    site_id = current_site["sub"]

    # 1. 선박 조회 → 없으면 INSERT
    # 선박은 이름으로만 식별하며, 최초 등록 시 자동으로 vessel 테이블에 추가된다.
    vessel = db.execute(
        text("SELECT vessel_id FROM vessel WHERE name = :name"),
        {"name": vessel_name}
    ).fetchone()

    if not vessel:
        vessel = db.execute(
            text("""
                INSERT INTO vessel (name)
                VALUES (:name)
                RETURNING vessel_id
            """),
            {"name": vessel_name}
        ).fetchone()

    vessel_id = vessel.vessel_id

    # 2. 사진 Cloudinary 업로드
    # 업로드된 이미지는 Cloudinary의 "netlog/inspection" 폴더에 저장되고 URL을 반환받는다.
    file_bytes = image.file.read()
    image_url = upload_image(file_bytes, folder="netlog/inspection")

    # 3. 입고 기록 INSERT
    record = db.execute(
        text("""
            INSERT INTO inspection_record
                (site_id, vessel_id, bag_image_url, bag_count)
            VALUES
                (:site_id, :vessel_id, :image_url, :bag_count)
            RETURNING record_id, inspected_at
        """),
        {
            "site_id": site_id,
            "vessel_id": str(vessel_id),
            "image_url": image_url,
            "bag_count": bag_count
        }
    ).fetchone()

    db.commit()

    # 누적 미수거 수량 조회
    # 해당 집하장에서 아직 수거되지 않은 마대 총 수량을 반환한다.
    # is_fully_collected = false 인 행의 remaining_bag_count 합산
    total_remaining = db.execute(
        text("""
            SELECT COALESCE(SUM(remaining_bag_count), 0)
            FROM site_bag_queue
            WHERE site_id = :site_id
            AND is_fully_collected = false
        """),
        {"site_id": site_id}
    ).scalar()

    return {
        "success": True,
        "code": 201,
        "message": "입고 기록이 등록되었습니다",
        "data": {
            "record_id": str(record.record_id),
            "site_id": site_id,
            "vessel_id": str(vessel_id),
            "vessel_name": vessel_name,
            "bag_count": bag_count,
            "bag_image_url": image_url,
            "inspected_at": record.inspected_at.isoformat(),
            "total_remaining_bag_count": int(total_remaining)
        }
    }


# GET /inspection/records?page=1&size=100
# 필터 기능 추가
@router.get("/records")
def get_inspection_records(
    page: int = 1,
    size: int = 100,
    vessel_ids: str = None,   # 콤마로 구분된 vessel_id 목록
    date_from: str = None,    # YYYY-MM-DD
    date_to: str = None,      # YYYY-MM-DD
    db: Session = Depends(get_db),
    current_site: dict = Depends(get_current_site)
):
    site_id = current_site["sub"]
    offset = (page - 1) * size

    where_clauses = ["ir.site_id = :site_id"]
    params = {"site_id": site_id, "size": size, "offset": offset}

    if vessel_ids:
        id_list = vessel_ids.split(",")
        placeholders = ",".join([f":vid_{i}" for i in range(len(id_list))])
        where_clauses.append(f"ir.vessel_id::text IN ({placeholders})")
        for i, vid in enumerate(id_list):
            params[f"vid_{i}"] = vid

    if date_from:
        where_clauses.append("ir.inspected_at >= :date_from")
        params["date_from"] = date_from

    if date_to:
        where_clauses.append("ir.inspected_at < CAST(:date_to AS date) + interval '1 day'")
        params["date_to"] = date_to

    where_sql = " AND ".join(where_clauses)

    total = db.execute(
        text(f"SELECT COUNT(*) FROM inspection_record ir WHERE {where_sql}"),
        params
    ).scalar()

    records = db.execute(
        text(f"""
            SELECT
                ir.record_id,
                v.name AS vessel_name,
                ir.bag_count,
                ir.bag_image_url,
                ir.inspected_at
            FROM inspection_record ir
            JOIN vessel v ON ir.vessel_id = v.vessel_id
            WHERE {where_sql}
            ORDER BY ir.inspected_at DESC
            LIMIT :size OFFSET :offset
        """),
        params
    ).fetchall()

    return {
        "success": True,
        "code": 200,
        "message": "조회 성공",
        "data": {
            "total": total,
            "page": page,
            "size": size,
            "items": [
                {
                    "record_id": str(r.record_id),
                    "vessel_name": r.vessel_name,
                    "bag_count": r.bag_count,
                    "bag_image_url": r.bag_image_url,
                    "inspected_at": r.inspected_at.isoformat()
                }
                for r in records
            ]
        }
    }


# ── [신규 추가] GET /inspection/export?start_date=YYYY-MM-DD&end_date=YYYY-MM-DD ──
# 검수자가 자신의 집하장 검수 기록을 지정 기간만큼 Excel(.xlsx)로 다운로드하는 엔드포인트.
#
# 인증: Bearer JWT 필수 (검수자 토큰, type == "site")
# site_id는 토큰에서 자동 추출하므로, 다른 집하장 데이터에 대한 접근이 구조적으로 차단된다.
#
# 응답: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet (xlsx 바이너리)
# 파일명: 검수기록_{집하장명}_{시작일}_{종료일}.xlsx (한글 파일명은 RFC 5987 UTF-8 인코딩 적용)
@router.get("/export")
def export_inspection_records(
    start_date: date = Query(..., description="조회 시작일 (YYYY-MM-DD)"),
    end_date: date   = Query(..., description="조회 종료일 (YYYY-MM-DD)"),
    vessel_ids: str  = Query(None, description="콤마로 구분된 vessel_id 목록"),  # ← 추가
    db: Session      = Depends(get_db),
    current_site: dict = Depends(get_current_site)
):
    if end_date < start_date:
        raise HTTPException(status_code=400, detail="종료일은 시작일보다 이후여야 합니다")
    if (end_date - start_date).days > 365:
        raise HTTPException(status_code=400, detail="조회 기간은 최대 1년입니다")

    site_id = current_site["sub"]

    # vessel_ids 파싱 추가
    vessel_id_list = vessel_ids.split(",") if vessel_ids else []

    excel_bytes = generate_inspection_excel(db, site_id, start_date, end_date, vessel_id_list)  # ← 인자 추가

    # 파일명에 집하장 이름을 포함하기 위해 site 테이블에서 name 조회
    site = db.execute(
        text("SELECT name FROM site WHERE site_id = :site_id"),
        {"site_id": site_id}
    ).fetchone()
    site_name = site.name if site else "집하장"

    # 한글 파일명은 URL 인코딩 필요.
    # RFC 5987에 따라 filename*=UTF-8''<encoded> 형식을 사용하면
    # 브라우저가 한글 파일명을 정상적으로 인식하고 저장한다.
    import urllib.parse
    filename = f"검수기록_{site_name}_{start_date}_{end_date}.xlsx"
    encoded_filename = urllib.parse.quote(filename)

    # StreamingResponse: 파일을 메모리에서 바로 스트리밍하여 클라이언트에 전달.
    # 서버 디스크에 임시 파일을 저장하지 않는다.
    return StreamingResponse(
        io.BytesIO(excel_bytes),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename*=UTF-8''{encoded_filename}"}
    )

@router.get("/stats")
def get_site_stats(
    db: Session = Depends(get_db),
    current_site: dict = Depends(get_current_site)
):
    site_id = current_site["sub"]

    stats = db.execute(
        text("""
            SELECT
                COALESCE(SUM(ir.bag_count), 0) AS total_bag_count,
                COUNT(DISTINCT ir.vessel_id) AS vessel_count,
                MAX(ir.inspected_at) AS last_inspected_at
            FROM inspection_record ir
            WHERE ir.site_id = :site_id
        """),
        {"site_id": site_id}
    ).fetchone()

    return {
        "success": True,
        "code": 200,
        "message": "조회 성공",
        "data": {
            "total_bag_count": int(stats.total_bag_count),
            "vessel_count": int(stats.vessel_count),
            "last_inspected_at": stats.last_inspected_at.strftime("%m.%d") if stats.last_inspected_at else "-"
        }
    }

# 선박 목록 조회 API
@router.get("/vessels")
def get_vessels(
    db: Session = Depends(get_db),
    current_site: dict = Depends(get_current_site)
):
    site_id = current_site["sub"]

    vessels = db.execute(
        text("""
            SELECT DISTINCT v.vessel_id, v.name
            FROM inspection_record ir
            JOIN vessel v ON ir.vessel_id = v.vessel_id
            WHERE ir.site_id = :site_id
            ORDER BY v.name
        """),
        {"site_id": site_id}
    ).fetchall()

    return {
        "success": True,
        "code": 200,
        "message": "조회 성공",
        "data": {
            "vessels": [
                {"vessel_id": str(v.vessel_id), "name": v.name}
                for v in vessels
            ]
        }
    }