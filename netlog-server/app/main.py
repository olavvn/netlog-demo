from fastapi import FastAPI, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from app.core.config import settings
from app.routers import auth, collection, dashboard, map
from app import models
from app.database import get_db

app = FastAPI(title="NETLOG API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[origin.strip() for origin in settings.cors_origins.split(",") if origin.strip()],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(collection.router)
app.include_router(dashboard.router)
app.include_router(map.router)

@app.get("/")
def health_check():
    return {"status": "ok", "message": "NETLOG API 작동 중"}

@app.post("/dev/seed")
def seed(db: Session = Depends(get_db)):
    if settings.environment != "development":
        raise HTTPException(status_code=404)

    from app.core.security import hash_password
    from sqlalchemy import text

    db.execute(text("""
        INSERT INTO site (site_code, name, region, latitude, longitude, pin_hash)
        VALUES ('JEONGJA', '정자항 집하장', '울산', 35.5894, 129.3762, :pin)
        ON CONFLICT (site_code) DO NOTHING
    """), {"pin": hash_password("netspa1234")})

    db.execute(text("""
        INSERT INTO netspa_manager (name, login_id, role, password_hash)
        VALUES ('김관리자', 'admin', 'admin', :pw)
        ON CONFLICT (login_id) DO NOTHING
    """), {"pw": hash_password("netspa1234")})

    db.commit()
    return {"message": "시드 데이터 생성 완료"}