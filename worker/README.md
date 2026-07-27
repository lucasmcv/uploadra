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
