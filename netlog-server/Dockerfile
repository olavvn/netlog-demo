# 1. Official lightweight Python image
FROM python:3.12-slim

# 2. Prevent Python from writing pyc files and buffering stdout/stderr
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

# 3. Set workspace directory
WORKDIR /workspace

# 4. Copy dependency definition
COPY requirements.txt .

# 5. Install dependencies
RUN pip install --no-cache-dir -r requirements.txt

# 6. Copy application source code (dev-only files excluded via .dockerignore)
COPY . .

# 7. Run as non-root user
RUN useradd --create-home --uid 1000 appuser \
    && chown -R appuser:appuser /workspace
USER appuser

# 8. Expose default port (Railway/Podman host will map the internal port)
EXPOSE 8080

# 9. Basic liveness check against the health endpoint
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:${PORT:-8080}/')" || exit 1

# 10. Run uvicorn server mapping dynamic port provided by the host
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8080}"]
