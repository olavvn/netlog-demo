from sqlalchemy import Column, Text, Numeric, TIMESTAMP
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.sql import func
import uuid
from app.database import Base

class Site(Base):
    __tablename__ = "site"

    site_id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    site_code = Column(Text, unique=True, nullable=False)
    name = Column(Text, nullable=False)
    region = Column(Text, nullable=False)
    address = Column(Text)
    latitude = Column(Numeric(9, 6), nullable=False)
    longitude = Column(Numeric(9, 6), nullable=False)
    pin_hash = Column(Text, nullable=False)
    created_at = Column(TIMESTAMP(timezone=True), server_default=func.now(), nullable=False)