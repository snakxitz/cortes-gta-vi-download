FROM python:3.12-slim-trixie

ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 DENO_DIR=/tmp/deno
RUN apt-get update \
    && apt-get install -y --no-install-recommends ffmpeg \
    && rm -rf /var/lib/apt/lists/* \
    && useradd --uid 10001 --create-home --no-log-init cortes

WORKDIR /app
COPY requirements.txt .
RUN python -m pip install --no-cache-dir -r requirements.txt
COPY importar.py .

USER 10001
EXPOSE 8080
CMD ["python", "-m", "uvicorn", "importar:app", "--host", "0.0.0.0", "--port", "8080", "--limit-concurrency", "8"]
