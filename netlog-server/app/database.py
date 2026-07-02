from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, DeclarativeBase
from app.core.config import settings

# DATABASE_URL로 DB 연결 엔진 생성
engine = create_engine(settings.database_url)

# API 요청마다 세션 하나씩 열어서 쿼리 날리고 닫는 구조
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

class Base(DeclarativeBase):
    pass

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()