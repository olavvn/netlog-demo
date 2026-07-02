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

# 6. Copy application source code
COPY . .

# 7. Expose default port (Railway will map the internal port)
EXPOSE 8080

# 8. Run uvicorn server mapping dynamic port provided by Railway
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8080}"]
