import os
from logging.config import fileConfig
from sqlalchemy import engine_from_config, pool
from alembic import context
from dotenv import load_dotenv

# .env 파일 로드
load_dotenv()

config = context.config
fileConfig(config.config_file_name)

# DATABASE_URL None 체크
database_url = os.getenv("DATABASE_URL")
if database_url is None:
    raise ValueError(".env 파일에 DATABASE_URL이 없습니다.")

config.set_main_option("sqlalchemy.url", database_url)

def run_migrations_online():
    connectable = engine_from_config(
        config.get_section(config.config_ini_section),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )
    with connectable.connect() as connection:
        context.configure(connection=connection)
        with context.begin_transaction():
            context.run_migrations()

run_migrations_online()