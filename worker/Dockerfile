FROM python:3.11-slim

WORKDIR /app

# ffmpeg not strictly required for faster-whisper itself (decodes via
# bundled PyAV), but yt-dlp's audio extraction needs it, and it's useful
# for troubleshooting/format edge cases either way.
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg curl unzip \
    && rm -rf /var/lib/apt/lists/*

# yt-dlp needs a JS runtime to execute YouTube's player challenge script —
# without one, extraction degrades and is far more likely to hit YouTube's
# bot-check. Deno is what yt-dlp's own docs recommend for this.
RUN curl -fsSL https://deno.land/install.sh | sh -s -- -y \
    && ln -s /root/.deno/bin/deno /usr/local/bin/deno

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 8001
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8001"]
