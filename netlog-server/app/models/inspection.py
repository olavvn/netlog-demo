import uuid
from sqlalchemy import Column, Text, Integer, TIMESTAMP, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.sql import func
from app.database import Base

class InspectionRecord(Base):
    __tablename__ = "inspection_record"

    record_id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    site_id = Column(UUID(as_uuid=True), ForeignKey("site.site_id"), nullable=False)
    vessel_id = Column(UUID(as_uuid=True), ForeignKey("vessel.vessel_id"), nullable=False)
    bag_image_url = Column(Text, nullable=False)
    bag_count = Column(Integer, nullable=False)
    inspected_at = Column(TIMESTAMP(timezone=True), server_default=func.now(), nullable=False)