# Worker de transcripción (FastAPI + faster-whisper)

## Setup local

```bash
cd worker
python -m venv .venv
./.venv/Scripts/pip install -r requirements.txt
```

## Correr

Debe ejecutarse desde `worker/` (así `LOCAL_STORAGE_DIR` relativo apunta a `../data/uploads`):

```bash
WHISPER_MODEL_SIZE=small \
LOCAL_STORAGE_DIR="../data/uploads" \
INTERNAL_CALLBACK_SECRET="<mismo valor que .env de la app>" \
./.venv/Scripts/python -m uvicorn main:app --port 8001
```

La primera vez descarga los pesos del modelo Whisper elegido desde Hugging Face
(por ejemplo "small" ≈ 500 MB) y los cachea en `~/.cache/huggingface`.

## Variables de entorno

- `WHISPER_MODEL_SIZE`: tiny | base | small | medium | large-v3 (default `small`)
- `WHISPER_DEVICE`: `auto` | `cpu` | `cuda` (default `auto`)
- `WHISPER_COMPUTE_TYPE`: default `int8` (bueno para CPU)
- `STORAGE_DRIVER`: `local` (default, comparte disco con la app Next.js) | `s3`
- `LOCAL_STORAGE_DIR`: debe apuntar al mismo directorio que `LOCAL_STORAGE_DIR` de la app
- `S3_*`: solo si `STORAGE_DRIVER=s3` (mismos valores que la app)
- `INTERNAL_CALLBACK_SECRET`: debe coincidir con el de la app Next.js
- `YT_DLP_COOKIES_FILE`: opcional, ver más abajo

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

Para correr el worker fuera de Docker (directo en el host), `YT_DLP_COOKIES_FILE`
en `.env` ya apunta a `./secrets/yt-cookies.txt` relativo a `worker/`.
