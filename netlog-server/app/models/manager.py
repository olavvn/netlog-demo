import uuid
import enum
from sqlalchemy import Column, Text, TIMESTAMP, Enum
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.sql import func
from app.database import Base

class ManagerRole(enum.Enum):
    admin = "admin"
    operator = "operator"

class NetSpaManager(Base):
    __tablename__ = "netspa_manager"

    manager_id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(Text, nullable=False)
    login_id = Column(Text, unique=True, nullable=False)
    role = Column(Enum(ManagerRole, name="manager_role"), nullable=False, default=ManagerRole.operator)
    password_hash = Column(Text, nullable=False)
    created_at = Column(TIMESTAMP(timezone=True), server_default=func.now(), nullable=False)