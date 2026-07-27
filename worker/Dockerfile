FROM python:3.11-slim

WORKDIR /app

# ffmpeg not strictly required (faster-whisper decodes via bundled PyAV),
# but useful to have for troubleshooting/format edge cases.
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 8001
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8001"]
