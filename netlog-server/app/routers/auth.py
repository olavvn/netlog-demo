import uuid
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session
from sqlalchemy import text
from app.database import get_db
from app.core.security import verify_password, create_access_token, hash_password

router = APIRouter(prefix="/auth", tags=["auth"])

# ── 요청 스키마 ──
class SiteLoginRequest(BaseModel):
    site_code: str
    pin: str

class ManagerLoginRequest(BaseModel):
    login_id: str
    password: str

class ManagerSignupRequest(BaseModel):
    name: str
    login_id: str
    password: str
    role: str = "operator" # admin or operator

class SiteSignupRequest(BaseModel):
    site_code: str
    name: str
    region: str
    address: str | None = None
    latitude: float
    longitude: float
    pin: str

# ── 응답 헬퍼 ──
def success_response(code: int, message: str, data: dict):
    return {"success": True, "code": code, "message": message, "data": data}

def error_response(code: int, message: str):
    return {"success": False, "code": code, "message": message, "data": None}


# ── 집하장 검수자 로그인 ──
@router.post("/site/login")
def site_login(request: SiteLoginRequest, db: Session = Depends(get_db)):
    result = db.execute(
        text("SELECT site_id, name, pin_hash FROM site WHERE site_code = :code"),
        {"code": request.site_code}
    ).fetchone()

    if not result:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=error_response(401, "집하장 코드 또는 PIN이 올바르지 않습니다")
        )

    if not verify_password(request.pin, result.pin_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=error_response(401, "집하장 코드 또는 PIN이 올바르지 않습니다")
        )

    token = create_access_token(data={
        "sub": str(result.site_id),
        "type": "site"
    })

    return success_response(200, "로그인 성공", {
        "access_token": token,
        "token_type": "bearer",
        "site_id": str(result.site_id),
        "site_name": result.name
    })


# ── 넷스파 관리자 로그인 ──
@router.post("/manager/login")
def manager_login(request: ManagerLoginRequest, db: Session = Depends(get_db)):
    result = db.execute(
        text("SELECT manager_id, name, role, password_hash FROM netspa_manager WHERE login_id = :id"),
        {"id": request.login_id}
    ).fetchone()

    if not result:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=error_response(401, "아이디 또는 비밀번호가 올바르지 않습니다")
        )

    if not verify_password(request.password, result.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=error_response(401, "아이디 또는 비밀번호가 올바르지 않습니다")
        )

    token = create_access_token(data={
        "sub": str(result.manager_id),
        "type": "manager",
        "role": result.role
    })

    return success_response(200, "로그인 성공", {
        "access_token": token,
        "token_type": "bearer",
        "manager_id": str(result.manager_id),
        "name": result.name,
        "role": result.role
    })


# ── 넷스파 관리자 회원가입 ──
@router.post("/manager/signup")
def manager_signup(request: ManagerSignupRequest, db: Session = Depends(get_db)):
    # 중복 체크
    dup = db.execute(
        text("SELECT 1 FROM netspa_manager WHERE login_id = :id"),
        {"id": request.login_id}
    ).fetchone()
    
    if dup:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=error_response(400, "이미 존재하는 아이디입니다")
        )
    
    pw_hash = hash_password(request.password)
    manager_id = str(uuid.uuid4())
    
    db.execute(
        text("""
            INSERT INTO netspa_manager (manager_id, name, login_id, role, password_hash, created_at)
            VALUES (:manager_id, :name, :id, :role, :pw_hash, NOW())
        """),
        {
            "manager_id": manager_id,
            "name": request.name,
            "id": request.login_id,
            "role": request.role,
            "pw_hash": pw_hash
        }
    )
    db.commit()
    
    return success_response(201, "회원가입 성공", {
        "manager_id": manager_id,
        "name": request.name,
        "login_id": request.login_id,
        "role": request.role
    })


# ── 집하장 검수자 회원가입 ──
@router.post("/site/signup")
def site_signup(request: SiteSignupRequest, db: Session = Depends(get_db)):
    # 중복 체크
    dup = db.execute(
        text("SELECT 1 FROM site WHERE site_code = :code"),
        {"code": request.site_code}
    ).fetchone()
    
    if dup:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=error_response(400, "이미 존재하는 집하장 코드입니다")
        )
    
    pin_hash = hash_password(request.pin)
    site_id = str(uuid.uuid4())
    
    db.execute(
        text("""
            INSERT INTO site (site_id, site_code, name, region, address, latitude, longitude, pin_hash, created_at)
            VALUES (:site_id, :code, :name, :region, :address, :lat, :lng, :pin_hash, NOW())
        """),
        {
            "site_id": site_id,
            "code": request.site_code,
            "name": request.name,
            "region": request.region,
            "address": request.address,
            "lat": request.latitude,
            "lng": request.longitude,
            "pin_hash": pin_hash
        }
    )
    db.commit()
    
    return success_response(201, "회원가입 성공", {
        "site_id": site_id,
        "site_code": request.site_code,
        "name": request.name
    })