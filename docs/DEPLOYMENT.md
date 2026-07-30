# Despliegue con Docker Compose

## Estado actual

La app corre sobre Postgres real y S3/MinIO. No hay transcripción
server-side: el usuario pega un link de YouTube o sube un archivo, junto
con una transcripción con tiempos que él mismo consigue (panel de YouTube
o TurboScribe) — Gemini solo genera las preguntas a partir de eso. Esto
significa que el stack ya **no** incluye worker de Whisper, Redis ni cola
de trabajos: son solo `postgres`, `minio` + `minio-init` y `web`.

En producción (`uploadra.duckdns.org`) corre sobre una VPS de Hetzner con
Docker Compose + Caddy como reverse proxy/HTTPS (no Fly.io — el `fly.toml`
en la raíz es un borrador que nunca se usó).

## Correr todo con Docker Compose

```bash
cp .env.example .env   # completar AUTH_SECRET, ENCRYPTION_KEY, GEMINI_API_KEY
docker compose up -d --build
```

Esto levanta: `postgres`, `minio` (+ `minio-init` que crea el bucket
automáticamente) y `web`. La app queda en `http://localhost:3000`.

Para desarrollar contra la infraestructura real pero con `npm run dev` en
el host (más rápido para iterar que reconstruir la imagen `web` en cada
cambio):

```bash
docker compose up -d postgres minio minio-init
# .env con DATABASE_URL=postgresql://app:app@localhost:5432/app
#          STORAGE_DRIVER=s3, S3_ENDPOINT=http://localhost:9000
npm run dev
```

## Despliegue en un VPS (Hetzner u otro)

1. Instalar Docker + Docker Compose en el servidor.
2. Cloná el repo ahí (`git clone`) — el deploy es `git pull` + `docker
   compose up -d --build web` desde ese checkout, no hay pipeline de CI/CD.
3. Completá un `.env` en el servidor con las variables reales (nunca
   commiteado — ver `.env.example` para la lista completa). Notablemente
   `DATABASE_URL` ahí debe reflejar las credenciales reales de Postgres
   del servidor si difieren del default local (`app`/`app`) — Postgres
   solo aplica `POSTGRES_PASSWORD` la primera vez que inicializa un volumen
   vacío, así que un valor hardcodeado en `docker-compose.yml` puede dejar
   de coincidir con la base real si el volumen ya existía de antes.
4. Reverse proxy (Caddy, nginx, etc.) para HTTPS: proxyear el dominio
   público hacia `web:3000` dentro de la red de Docker Compose. En el VPS
   de Hetzner esto es un `Caddyfile` separado, no versionado en este repo
   (config específica del servidor).
5. Correr `npx prisma migrate deploy` (dentro del contenedor `web`, o
   `docker compose run --rm web npx prisma migrate deploy`) después de
   cada `git pull` con migraciones nuevas, antes de reconstruir `web`.

## Gotchas ya resueltos (para no repetirlos)

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

4. **El video no reproducía** (`NotSupportedError` en el `<video>`): la
   URL prefirmada de MinIO usaba el hostname interno `minio:9000`, que el
   navegador del usuario no puede resolver (solo los contenedores lo
   resuelven entre sí). Solución: `lib/storage/s3.ts` ahora firma las URLs
   de lectura con un cliente S3 separado apuntado a `S3_PUBLIC_ENDPOINT`
   (`http://localhost:9000` en Compose), mientras las operaciones
   servidor-a-servidor siguen usando `S3_ENDPOINT` (`http://minio:9000`).

5. **Preguntas no se generaban** (quedaban en `null`): faltaba pasar
   `GEMINI_API_KEY` al contenedor `web` en `docker-compose.yml` — ya
   agregado.

6. **Cuota diaria gratuita de Gemini agotada** (20 requests/día): ver
   `lib/gemini-retry.ts` — falla rápido en vez de reintentar en vano, y
   la UI ofrece configurar una clave propia (BYOK, `app/(app)/settings`)
   como escape hatch. El arreglo real a largo plazo es habilitar
   facturación (Tier 1) en la cuenta de Gemini de la plataforma.

## De MinIO a AWS S3 real / de Postgres local a uno gestionado

Sin cambios de código, solo de configuración:

- Postgres gestionado (Neon, RDS, Supabase, etc.): reemplazar `DATABASE_URL`
  por su connection string.
- AWS S3 real: `S3_ENDPOINT=""` (vacío, usa el endpoint default de AWS),
  `S3_PUBLIC_ENDPOINT=""` (AWS S3 ya es público, no hace falta separarlo),
  `S3_FORCE_PATH_STYLE=false`, credenciales de un IAM user/rol con acceso
  al bucket.

## Límites conocidos

- Sin compartir videos entre usuarios, sin edición de transcripciones, sin
  notificación por websocket (se usa polling).
- La transcripción es 100% manual (el usuario la pega) — no hay descarga
  ni transcripción automática de audio en el servidor.
