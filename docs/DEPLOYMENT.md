# De desarrollo local a nube

## Estado actual (desarrollo local, sin Docker)

- **DB**: SQLite (`./dev.db` en la raíz del repo) vía `@prisma/adapter-libsql`, cero instalación.
- **Storage**: disco local (`./data/uploads`) vía `lib/storage/local.ts`.
- **Worker**: FastAPI corriendo directo con un venv de Python (`worker/README.md`).

Este modo existe para poder desarrollar sin Docker Desktop instalado. Antes de
desplegar a la nube (o de correr `docker compose up`), hay que migrar DB y
storage a sus equivalentes "reales" — Postgres y S3/MinIO — siguiendo los
pasos de abajo.

## 1. Cambiar Prisma de SQLite a Postgres

Prisma no permite mezclar providers en un mismo `schema.prisma`, así que es un
cambio explícito (una sola vez):

1. En `prisma/schema.prisma`, cambiar:
   ```prisma
   datasource db {
     provider = "postgresql"
   }
   ```
2. Instalar el adapter de Postgres y quitar el de libsql:
   ```bash
   npm install @prisma/adapter-pg pg
   npm uninstall @prisma/adapter-libsql @libsql/client
   ```
3. En `lib/db.ts`, reemplazar `PrismaLibSql` por `PrismaPg`:
   ```ts
   import { PrismaPg } from "@prisma/adapter-pg";
   const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
   ```
4. Borrar `prisma/migrations/` (las migraciones de sqlite no son compatibles
   con Postgres) y generar una migración inicial nueva contra el Postgres del
   compose:
   ```bash
   npx prisma migrate dev --name init
   ```
5. `DATABASE_URL` pasa a ser una connection string de Postgres, por ejemplo
   `postgresql://app:app@localhost:5432/app` (ver `docker-compose.yml`).

## 2. Cambiar storage de disco local a S3/MinIO

No requiere tocar código — la abstracción en `lib/storage/index.ts` ya soporta
ambos. Solo cambiar env vars:

```
STORAGE_DRIVER=s3
S3_ENDPOINT=http://localhost:9000   # MinIO local, o el endpoint de S3 real
S3_BUCKET=videos
S3_ACCESS_KEY=minioadmin
S3_SECRET_KEY=minioadmin
S3_FORCE_PATH_STYLE=true            # false para AWS S3 real
```

El worker de Python necesita las mismas variables (`worker/config.py` ya las
lee) para poder descargar los archivos por su cuenta en vez de leerlos del
disco compartido.

## 3. Correr todo con Docker Compose

Requiere Docker Desktop instalado y corriendo. Una vez hechos los pasos 1 y 2:

```bash
cp .env.example .env   # completar AUTH_SECRET, INTERNAL_CALLBACK_SECRET
docker compose up --build
```

Esto levanta: `postgres`, `minio` (+ `minio-init` que crea el bucket
automáticamente), `worker` y `web`. La app queda en `http://localhost:3000`.

La primera vez, el contenedor `worker` va a descargar los pesos del modelo
Whisper configurado (`WHISPER_MODEL_SIZE`, default `small`) — quedan
cacheados en el volumen `whisper-model-cache` entre reinicios.

## 4. De MinIO a AWS S3 real / de Postgres local a uno gestionado

Sin cambios de código, solo de configuración:

- Postgres gestionado (Neon, RDS, Supabase, etc.): reemplazar `DATABASE_URL`
  por su connection string.
- AWS S3 real: `S3_ENDPOINT=""` (vacío, usa el endpoint default de AWS),
  `S3_FORCE_PATH_STYLE=false`, credenciales de un IAM user/rol con acceso al
  bucket.

## Límites conocidos del MVP

- El worker procesa una transcripción a la vez (sin cola de trabajos ni
  reintentos automáticos más allá del callback). Para más volumen, reemplazar
  `BackgroundTasks` por una cola real (ej. Redis + RQ/Celery) sin cambiar el
  contrato HTTP (`POST /transcribe` + webhook de callback).
- Sin compartir videos entre usuarios, sin edición de transcripciones, sin
  notificación por websocket (se usa polling).
