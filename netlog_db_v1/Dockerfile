# One-shot job image: runs Alembic migrations against DATABASE_URL and exits.
FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /workspace

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

RUN useradd --create-home --uid 1000 appuser \
    && chown -R appuser:appuser /workspace
USER appuser

CMD ["alembic", "upgrade", "head"]
