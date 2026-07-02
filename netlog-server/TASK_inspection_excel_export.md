# 작업지시서: 검수자용 검수 기록 Excel Export 기능

> **대상 프로젝트**: `netlog-server` (FastAPI + PostgreSQL on Railway)
> **작업 목적**: 집하장 검수자가 자신의 집하장에 기록된 검수 내역을 기간을 지정하여 `.xlsx` 파일로 다운로드
> **작업 범위**: 신규 파일 1개 생성 + 기존 파일 1개 수정

---

## 1. 현재 코드베이스 분석 요약

### 1-1. 인증 구조 (auth.py 기반)

- **검수자 로그인** (`/auth/site/login`): JWT payload → `{"sub": site_id, "type": "site"}`
- **export는 검수자 전용**: `type == "site"` 검증
- **site_id는 토큰에서 추출**: 쿼리 파라미터로 받지 않음 (다른 집하장 데이터 접근 차단)
- 기존 `collection.py`의 `get_current_site()` 함수가 동일한 패턴 → **그대로 재사용**

```python
# collection.py에 이미 구현된 의존성 함수 (재사용)
def get_current_site(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: Session = Depends(get_db)
):
    payload = verify_token(credentials.credentials)
    if not payload or payload.get("type") != "site":
        raise HTTPException(status_code=401, detail="검수자 로그인이 필요합니다")
    return payload
```

### 1-2. inspection_record 테이블 전체 필드

```sql
inspection_record (
    record_id     UUID        -- PK
    site_id       UUID        -- FK → site (집하장)
    vessel_id     UUID        -- FK → vessel (선박)
    bag_image_url TEXT        -- Cloudinary 이미지 URL
    bag_count     INT         -- 검수된 마대자루 수량
    inspected_at  TIMESTAMPTZ -- 검수 일시
)
```

### 1-3. 현재 라우터 상태

- `GET /inspection/records` — 이미 구현됨 (페이지네이션, site_id 필터 포함)
- `POST /inspection/record` — 이미 구현됨
- **`GET /inspection/export`** — 신규 추가 대상

### 1-4. 조인 대상

| 컬럼 | 조인 경로 | Excel에 표시할 값 |
|:---|:---|:---|
| `site_id` | `site_id` → `site.name` | 집하장명 |
| `vessel_id` | `vessel_id` → `vessel.name` | 선박명 |

---

## 2. 구현할 기능 명세

### 2-1. API 엔드포인트

```
GET /inspection/export?start_date=2025-06-01&end_date=2025-06-30
```

| 항목 | 내용 |
|:---|:---|
| **메서드** | `GET` |
| **경로** | `/inspection/export` |
| **인증** | Bearer JWT (검수자 토큰 필수, `type == "site"`) |
| **쿼리 파라미터** | `start_date: date` (필수), `end_date: date` (필수) |
| **응답** | `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet` |
| **파일명** | `inspection_{site_code}_{start}_{end}.xlsx` |
| **site_id** | 토큰에서 추출 (파라미터 X) |

> **파일명 예시**: `inspection_JEONGJA_2025-06-01_2025-06-30.xlsx`
> site_code 조회가 번거로우면 `inspection_{YYYY-MM-DD}_{YYYY-MM-DD}.xlsx`도 허용

### 2-2. 쿼리 파라미터 유효성 검사

```python
from datetime import date
from fastapi import Query

start_date: date = Query(..., description="조회 시작일 (YYYY-MM-DD)")
end_date: date   = Query(..., description="조회 종료일 (YYYY-MM-DD)")

# 검증 로직 (라우터 함수 내부에서 처리)
if end_date < start_date:
    raise HTTPException(status_code=400, detail="종료일은 시작일보다 이후여야 합니다")
if (end_date - start_date).days > 365:
    raise HTTPException(status_code=400, detail="조회 기간은 최대 1년입니다")
```

---

## 3. Excel 파일 구조 (단일 시트)

### 시트명: `검수 기록`

| 열 번호 | 헤더명 | 원천 필드 | 비고 |
|:---:|:---|:---|:---|
| A | 검수일시 | `inspection_record.inspected_at` | `YYYY-MM-DD HH:MM` 형식, UTC+9 변환 |
| B | 집하장명 | `site.name` | site_id JOIN |
| C | 선박명 | `vessel.name` | vessel_id JOIN |
| D | 마대 수량 (자루) | `inspection_record.bag_count` | 숫자 형식 |
| E | 수거 완료 여부 | `site_bag_queue.is_fully_collected` | "수거완료" / "부분수거" / "수거대기" |
| F | 잔여 마대 수 | `site_bag_queue.remaining_bag_count` | 숫자 형식 |
| G | 이미지 URL | `inspection_record.bag_image_url` | 하이퍼링크 처리 |
| H | 검수 ID | `inspection_record.record_id` | UUID 문자열 |

> **수거 완료 여부** 판단 로직 (Python 레벨에서 처리):
> ```
> is_fully_collected == True              → "수거완료"
> remaining < original AND remaining > 0 → "부분수거"
> remaining == original                  → "수거대기"
> site_bag_queue 행 없음 (NULL)          → "대기중"
> ```

### 시트 상단 메타 정보 (2행 추가 후 데이터 시작)

```
행 1: [집하장명] | [site.name 값]
행 2: [조회 기간] | [start_date ~ end_date]
행 3: (빈 행)
행 4: (헤더 행 - 파란 배경)
행 5~: (데이터)
```

---

## 4. 작업 파일 목록

### 4-1. 신규 생성 파일

#### `app/services/excel_service.py`
Excel 생성 로직 서비스

### 4-2. 수정 파일

#### `app/routers/collection.py`
export 엔드포인트 추가 (기존 파일에 라우터 함수 1개 추가)

> `dashboard.py`가 아닌 `collection.py`에 추가하는 이유:
> - 동일한 `/inspection` prefix 공유
> - `get_current_site()` 의존성을 같은 파일에서 바로 재사용
> - 기존 라우터 패턴과 일관성 유지

---

## 5. 세부 구현 지시

### Step 1: 의존성 확인

`requirements.txt`에 추가:
```
openpyxl>=3.1.0
```

---

### Step 2: `app/services/excel_service.py` 작성

#### 2-1. 데이터 조회 함수

```python
def get_inspection_records_for_export(
    db, 
    site_id: str, 
    start_date: date, 
    end_date: date
) -> list[dict]:
    """
    검수자의 site_id 기준으로 기간 내 inspection_record 전체 조회
    
    반환 필드:
    - record_id, inspected_at, bag_count, bag_image_url (inspection_record 전체)
    - site_name (site.name)
    - vessel_name (vessel.name)
    - is_fully_collected, remaining_bag_count, original_bag_count (site_bag_queue)
    """
```

**SQL**:

```sql
SELECT
    ir.record_id,
    ir.inspected_at,
    ir.bag_count,
    ir.bag_image_url,
    s.name  AS site_name,
    v.name  AS vessel_name,
    q.is_fully_collected,
    q.remaining_bag_count,
    q.original_bag_count
FROM inspection_record ir
JOIN site   s ON s.site_id   = ir.site_id
JOIN vessel v ON v.vessel_id = ir.vessel_id
LEFT JOIN site_bag_queue q ON q.record_id = ir.record_id
WHERE ir.site_id = :site_id
  AND ir.inspected_at >= :start_dt   -- :start_date 의 00:00:00 KST (= UTC-9h)
  AND ir.inspected_at <  :end_dt     -- :end_date 다음날 00:00:00 KST
ORDER BY ir.inspected_at ASC
```

> **날짜 범위 변환 방법**:
> ```python
> from datetime import datetime, timezone, timedelta
> KST = timezone(timedelta(hours=9))
> start_dt = datetime(start_date.year, start_date.month, start_date.day, 0, 0, 0, tzinfo=KST)
> end_dt   = datetime(end_date.year,   end_date.month,   end_date.day,   0, 0, 0, tzinfo=KST) + timedelta(days=1)
> ```

#### 2-2. 수거 상태 계산 함수 (헬퍼)

```python
def derive_collection_status(row: dict) -> tuple[str, int]:
    """
    site_bag_queue 정보로부터 수거 상태 문자열과 잔여 수량 반환
    
    반환: (status_str, remaining_count)
    - ("수거완료", 0)
    - ("부분수거", N)
    - ("수거대기", original_bag_count)
    - ("대기중",  original_bag_count)  # queue 행 없을 때
    """
    if row["is_fully_collected"] is None:
        # site_bag_queue 행이 없는 경우 (데이터 정합성 이슈)
        return "대기중", row["bag_count"]
    if row["is_fully_collected"]:
        return "수거완료", 0
    remaining = row["remaining_bag_count"]
    original  = row["original_bag_count"]
    if remaining < original:
        return "부분수거", remaining
    return "수거대기", remaining
```

#### 2-3. Excel 파일 생성 함수

```python
def generate_inspection_excel(
    db,
    site_id: str,
    start_date: date,
    end_date: date
) -> bytes:
    """
    검수 기록 xlsx 파일을 bytes로 반환
    
    구현 순서:
    1. get_inspection_records_for_export() 호출
    2. openpyxl.Workbook() 생성
    3. 시트 상단 메타 정보 2행 작성 (집하장명, 조회 기간)
    4. 빈 행 1개 삽입
    5. 헤더 행 작성 (스타일 적용)
    6. 데이터 행 작성 (derive_collection_status 호출 포함)
    7. 이미지 URL 컬럼(G열) → openpyxl hyperlink 처리
    8. 컬럼 너비 자동 조정
    9. io.BytesIO → bytes 반환
    """
```

**스타일 상수**:
```python
from openpyxl.styles import PatternFill, Font, Alignment, Border, Side

HEADER_FILL  = PatternFill(fgColor="1E88E5", fill_type="solid")
HEADER_FONT  = Font(bold=True, color="FFFFFF", size=11)
HEADER_ALIGN = Alignment(horizontal="center", vertical="center", wrap_text=True)

META_FONT    = Font(bold=True, size=10)

ROW_EVEN_FILL = PatternFill(fgColor="F0F7FF", fill_type="solid")

THIN_BORDER = Border(
    left=Side(style="thin"),   right=Side(style="thin"),
    top=Side(style="thin"),    bottom=Side(style="thin")
)

# 수거 상태별 글자색
STATUS_COLORS = {
    "수거완료": "1565C0",   # 진파랑
    "부분수거": "E65100",   # 주황
    "수거대기": "757575",   # 회색
    "대기중":   "757575",
}
```

**이미지 URL 하이퍼링크 처리**:
```python
from openpyxl.utils import get_column_letter

# G열 셀에 하이퍼링크 적용
cell.value     = "이미지 보기"
cell.hyperlink = row["bag_image_url"]
cell.font      = Font(color="1565C0", underline="single")
```

**날짜 포맷 변환**:
```python
from datetime import timezone, timedelta
KST = timezone(timedelta(hours=9))

def fmt_dt(dt) -> str:
    if dt is None:
        return ""
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(KST).strftime("%Y-%m-%d %H:%M")
```

**컬럼 너비 자동 조정**:
```python
for col_cells in ws.columns:
    max_len = max((len(str(c.value or "")) for c in col_cells), default=0)
    ws.column_dimensions[get_column_letter(col_cells[0].column)].width = min(max_len + 4, 50)
```

---

### Step 3: `app/routers/collection.py` 수정

기존 파일 하단에 아래 엔드포인트 추가 (`import` 추가 포함):

```python
# 추가할 import
from datetime import date
from fastapi.responses import StreamingResponse
from app.services.excel_service import generate_inspection_excel
import io

# 추가할 엔드포인트
@router.get("/export")
def export_inspection_records(
    start_date: date = Query(..., description="조회 시작일 (YYYY-MM-DD)"),
    end_date: date   = Query(..., description="조회 종료일 (YYYY-MM-DD)"),
    db: Session      = Depends(get_db),
    current_site: dict = Depends(get_current_site)
):
    """
    검수자 자신의 집하장 검수 기록 Excel 다운로드
    - 인증: 검수자 토큰 필수
    - site_id는 토큰에서 자동 추출 (파라미터 없음)
    """
    if end_date < start_date:
        raise HTTPException(status_code=400, detail="종료일은 시작일보다 이후여야 합니다")
    if (end_date - start_date).days > 365:
        raise HTTPException(status_code=400, detail="조회 기간은 최대 1년입니다")

    site_id = current_site["sub"]

    excel_bytes = generate_inspection_excel(db, site_id, start_date, end_date)

    filename = f"inspection_{start_date}_{end_date}.xlsx"

    return StreamingResponse(
        io.BytesIO(excel_bytes),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )
```

---

## 6. 에러 핸들링

| 상황 | 처리 방법 |
|:---|:---|
| 해당 기간 데이터 없음 | 빈 데이터 행 + 메타 정보만 포함한 파일 정상 반환 |
| end_date < start_date | 400 Bad Request |
| 기간 > 365일 | 400 Bad Request |
| site_bag_queue 행 없음 (LEFT JOIN NULL) | `derive_collection_status()`에서 "대기중" 처리 |
| TIMESTAMPTZ 변환 오류 | try/except로 감싸고 원본 ISO 문자열 fallback |

---

## 7. 파일 생성 체크리스트

```
# 신규 생성
app/services/excel_service.py        ← 핵심 Excel 생성 로직

# 수정
app/routers/collection.py            ← GET /inspection/export 엔드포인트 추가

# 패키지 추가
requirements.txt                     ← openpyxl>=3.1.0 추가
```

---

## 8. 검증 방법

```bash
# 1. 패키지 설치
pip install openpyxl

# 2. 서버 실행
uvicorn app.main:app --reload

# 3. 검수자 토큰 발급
curl -X POST http://localhost:8000/auth/site/login \
  -H "Content-Type: application/json" \
  -d '{"site_code": "JEONGJA", "pin": "netspa1234"}'

# 4. Excel 다운로드
curl -X GET "http://localhost:8000/inspection/export?start_date=2025-01-01&end_date=2025-06-30" \
  -H "Authorization: Bearer {토큰}" \
  --output inspection_2025-01-01_2025-06-30.xlsx

# 5. 확인 사항
# - 시트 상단에 집하장명, 조회 기간 표시 여부
# - 헤더 파란 배경, 흰 글씨
# - 수거 완료 여부 컬럼 값 정확성
# - 이미지 URL 하이퍼링크 동작
# - 토큰의 site_id와 다른 집하장 데이터가 포함되지 않는지 보안 확인
```
