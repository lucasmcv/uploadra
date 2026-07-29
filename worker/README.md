# Worker de transcripción (FastAPI + faster-whisper + RQ)

Dos procesos separados, ambos desde el mismo código (`worker/`):

1. **API** (`main.py`, `uvicorn main:app`): recibe `POST /transcribe`, encola
   el job en Redis y responde `202` al instante. No carga Whisper.
2. **Worker RQ** (`rq worker transcriptions --url $REDIS_URL`): toma jobs de
   la cola y hace la transcripción real (`jobs.py` → `transcription.py`).
   Cada proceso de este tipo carga su propia instancia de `WhisperModel` —
   correr varias réplicas es lo que permite transcribir en paralelo para
   distintos usuarios sin que se pisen entre sí ni se maten por falta de
   memoria (ver `docker-compose.yml`, servicio `worker-rq`, y
   `docker compose up -d --scale worker-rq=N` para correr N réplicas).

## Setup local

```bash
cd worker
python -m venv .venv
./.venv/Scripts/pip install -r requirements.txt
```

Necesita un Redis corriendo (`docker compose up -d redis`, o uno local).

## Correr

Debe ejecutarse desde `worker/` (así `LOCAL_STORAGE_DIR` relativo apunta a `../data/uploads`).

En una terminal, la API:
```bash
REDIS_URL="redis://localhost:6379/0" \
./.venv/Scripts/python -m uvicorn main:app --port 8001
```

En otra, al menos un worker RQ (el que realmente transcribe):
```bash
WHISPER_MODEL_SIZE=small \
LOCAL_STORAGE_DIR="../data/uploads" \
REDIS_URL="redis://localhost:6379/0" \
INTERNAL_CALLBACK_SECRET="<mismo valor que .env de la app>" \
./.venv/Scripts/python -m rq worker transcriptions --url redis://localhost:6379/0
```

La primera vez descarga los pesos del modelo Whisper elegido desde Hugging Face
(por ejemplo "small" ≈ 500 MB) y los cachea en `~/.cache/huggingface`.

## Variables de entorno

- `REDIS_URL`: conexión a Redis (default `redis://localhost:6379/0`) — la API la usa para encolar, el worker RQ para tomar jobs.
- `WHISPER_MODEL_SIZE`: tiny | base | small | medium | large-v3 (default `small`) — solo importa para el worker RQ.
- `WHISPER_DEVICE`: `auto` | `cpu` | `cuda` (default `auto`)
- `WHISPER_COMPUTE_TYPE`: default `int8` (bueno para CPU)
- `STORAGE_DRIVER`: `local` (default, comparte disco con la app Next.js) | `s3`
- `LOCAL_STORAGE_DIR`: debe apuntar al mismo directorio que `LOCAL_STORAGE_DIR` de la app
- `S3_*`: solo si `STORAGE_DRIVER=s3` (mismos valores que la app)
- `INTERNAL_CALLBACK_SECRET`: debe coincidir con el de la app Next.js
- `YT_DLP_COOKIES_FILE`: opcional, ver más abajo — solo lo necesita el worker RQ (es quien corre yt-dlp)
- `BGUTIL_POT_BASE_URL`: opcional, ver más abajo — URL del servicio `bgutil-pot`

## Videos de YouTube

Cuando un video viene de un link de YouTube (en vez de un archivo subido), el
worker usa `yt-dlp` para bajar **solo el audio, de forma transitoria** (se
borra apenas termina la transcripción) — nunca se descarga ni se re-aloja el
video/audio de forma permanente. La reproducción en la app usa el reproductor
oficial embebido de YouTube (IFrame API), no este archivo.

**Limitación conocida:** YouTube bloquea cada vez más las descargas
automatizadas desde IPs de servidor/datacenter con un error de tipo
"Sign in to confirm you're not a bot" (PO Token), incluso con un runtime de
JavaScript disponible (el worker incluye `deno` para esto). Cuando pasa, la
transcripción de ese video falla con ese mensaje de error — el resto de la
app (subida de archivos, documentos de texto) no se ve afectado.

**Mitigación ya configurada en este proyecto**, con una cuenta de Google
dedicada solo a esto (no la personal de quien administra la plataforma):
las cookies de esa cuenta, exportadas con la extensión "Get cookies.txt
LOCALLY", viven en `worker/secrets/yt-cookies.txt` (nunca se commitea, está
en `.gitignore`) y `docker-compose.yml` ya la monta en el contenedor del
worker en `/run/secrets/yt-cookies.txt`, apuntada por `YT_DLP_COOKIES_FILE`.
Esto es transparente para los usuarios de la plataforma — nadie necesita
loguearse en YouTube ni saber que esto existe, solo pegan el link.

Si esa cuenta dedicada llega a tener problemas (cierre, verificación
adicional, etc.), el arreglo es volver a exportar sus cookies y
reemplazar `worker/secrets/yt-cookies.txt`, sin tocar código.

**Segunda línea de defensa (independiente de la reputación de la IP):** el
servicio `bgutil-pot` (`docker-compose.yml`, imagen
`brainicism/bgutil-ytdlp-pot-provider`) genera "proof-of-origin tokens"
válidos que YouTube acepta como prueba de que la petición no es de un bot,
sin depender de que la IP tenga buena reputación. El paquete pip
`bgutil-ytdlp-pot-provider` (en `requirements.txt`) es el lado cliente que
yt-dlp usa para hablar con ese servicio — configurado vía
`BGUTIL_POT_BASE_URL` (ver `worker/youtube_ingest.py`). Diagnóstico: se
confirmó en producción (servidor Hetzner) que el bloqueo de YouTube
("Sign in to confirm you're not a bot") ocurre incluso con cookies frescas
y cambiando el "client" de extracción (android/ios/tv/etc.) — parece
disparado por volumen de peticiones en poco tiempo más que por la IP en sí
(un video que había funcionado dejó de funcionar tras varias pruebas
seguidas), así que probablemente se recupera solo pasado un tiempo sin
pedir muchos videos seguidos. El PO Token provider es la mitigación que no
depende de esperar ese enfriamiento.

Para correr el worker fuera de Docker (directo en el host), `YT_DLP_COOKIES_FILE`
en `.env` ya apunta a `./secrets/yt-cookies.txt` relativo a `worker/`.
