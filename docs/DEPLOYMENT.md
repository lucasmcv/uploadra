# Despliegue con Docker Compose

## Estado actual

La app corre sobre Postgres real y S3/MinIO (ya migrada desde el modo
SQLite + disco local que se usó al principio del proyecto para poder
desarrollar sin Docker Desktop instalado). El stack completo (`postgres`,
`minio` + `minio-init`, `worker`, `web`) fue levantado y verificado de
punta a punta con `docker compose up --build`.

## Correr todo con Docker Compose

```bash
cp .env.example .env   # completar AUTH_SECRET, INTERNAL_CALLBACK_SECRET, GEMINI_API_KEY
docker compose up -d --build
```

Esto levanta: `postgres`, `minio` (+ `minio-init` que crea el bucket
automáticamente), `worker` y `web`. La app queda en `http://localhost:3000`.

La primera vez, el contenedor `worker` va a descargar los pesos del modelo
Whisper configurado (`WHISPER_MODEL_SIZE`, default `small`) — quedan
cacheados en el volumen `whisper-model-cache` entre reinicios.

Para desarrollar contra la infraestructura real pero con `npm run dev` en
el host (más rápido para iterar que reconstruir la imagen `web` en cada
cambio), alcanza con levantar la infraestructura y correr el worker aparte:

```bash
docker compose up -d postgres minio minio-init
# .env con DATABASE_URL=postgresql://app:app@localhost:5432/app
#          STORAGE_DRIVER=s3, S3_ENDPOINT=http://localhost:9000
npm run dev
# en otra terminal, worker/README.md para correrlo apuntando a localhost:9000
```

## Gotchas ya resueltos (para no repetirlos)

Estos problemas aparecieron migrando de SQLite/disco local a
Postgres/MinIO reales y quedaron corregidos en el código actual — se
documentan acá por si algo similar reaparece en otro entorno:

1. **`npm ci` fallaba dentro del contenedor** con
   `Missing: @emnapi/runtime ... from lock file`. El lockfile se generó en
   Windows, que nunca resuelve los paquetes opcionales linux/wasm de
   Tailwind (`@tailwindcss/oxide-wasm32-wasi` y sus peer deps), así que
   esas entradas faltan aunque estén referenciadas. Solución: el
   `Dockerfile` usa `npm install` en vez de `npm ci` (resuelve lo que
   falte en el momento, para la plataforma real del build).

2. **`.dockerignore` faltante**: sin él, el build transfería ~1.8 GB de
   contexto (`node_modules`, `.next`, etc.), tardando 10+ minutos solo en
   esa etapa. Ya existe un `.dockerignore` que excluye eso — y también
   excluye `.env*` explícitamente (nunca debe terminar copiado a una capa
   de la imagen).

3. **Auth.js rechazaba todas las requests** en producción con
   `UntrustedHost`. No estamos en Vercel (que confía el host
   automáticamente), así que hace falta `AUTH_TRUST_HOST=true` explícito
   — ya seteado en el `environment` del servicio `web`.

4. **El callback del worker nunca llegaba** (`NEXT_PUBLIC_APP_URL`
   apuntaba a `http://localhost:3000`, que desde el contenedor `worker` se
   resuelve a sí mismo, no al contenedor `web`). Dentro de Compose tiene
   que ser la dirección de red interna: `http://web:3000`. Ya seteado así
   en `docker-compose.yml` (fijo, no viene de `.env`, porque siempre debe
   ser la URL interna sin importar el `NEXT_PUBLIC_APP_URL` público que
   use el navegador).

5. **El video no reproducía** (`NotSupportedError` en el `<video>`): la
   URL prefirmada de MinIO usaba el hostname interno `minio:9000`, que el
   navegador del usuario no puede resolver (solo los contenedores lo
   resuelven entre sí). Solución: `lib/storage/s3.ts` ahora firma las URLs
   de lectura con un cliente S3 separado apuntado a `S3_PUBLIC_ENDPOINT`
   (`http://localhost:9000` en Compose), mientras las operaciones
   servidor-a-servidor siguen usando `S3_ENDPOINT` (`http://minio:9000`).

6. **Preguntas no se generaban** (quedaban en `null`): faltaba pasar
   `GEMINI_API_KEY` al contenedor `web` en `docker-compose.yml` — ya
   agregado.

## De MinIO a AWS S3 real / de Postgres local a uno gestionado

Sin cambios de código, solo de configuración:

- Postgres gestionado (Neon, RDS, Supabase, etc.): reemplazar `DATABASE_URL`
  por su connection string.
- AWS S3 real: `S3_ENDPOINT=""` (vacío, usa el endpoint default de AWS),
  `S3_PUBLIC_ENDPOINT=""` (AWS S3 ya es público, no hace falta separarlo),
  `S3_FORCE_PATH_STYLE=false`, credenciales de un IAM user/rol con acceso
  al bucket.

## Límites conocidos del MVP

- El worker procesa una transcripción a la vez (sin cola de trabajos ni
  reintentos automáticos más allá del callback). Para más volumen, reemplazar
  `BackgroundTasks` por una cola real (ej. Redis + RQ/Celery) sin cambiar el
  contrato HTTP (`POST /transcribe` + webhook de callback).
- Sin compartir videos entre usuarios, sin edición de transcripciones, sin
  notificación por websocket (se usa polling).
- YouTube bloquea frecuentemente las descargas automatizadas de audio desde
  IPs de servidor con un error de "bot check" (PO Token), incluso con el
  runtime de JS (`deno`) incluido en el worker. Cuando pasa, ese video
  específico falla la transcripción; el resto de la app no se ve afectado.
  Mitigación documentada en `worker/README.md` (`YT_DLP_COOKIES_FILE`).
- Si el proceso del worker se reinicia/recrea mientras una transcripción
  está en curso (ej. `docker compose up --build worker` con un job
  pendiente), ese video queda trabado en `transcribing` para siempre — no
  hay persistencia de jobs en memoria (`BackgroundTasks`). Mismo límite que
  el de "una transcripción a la vez" de arriba; la solución es la misma
  (cola real con reintentos).
