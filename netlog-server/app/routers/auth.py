from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session
from sqlalchemy import text
from app.database import get_db
from app.core.security import verify_password, create_access_token

router = APIRouter(prefix="/auth", tags=["auth"])

# ── 요청 스키마 ──
class SiteLoginRequest(BaseModel):
    site_code: str
    pin: str

class ManagerLoginRequest(BaseModel):
    login_id: str
    password: str

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