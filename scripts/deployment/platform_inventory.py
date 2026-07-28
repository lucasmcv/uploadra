"""
INVENTARIO COMPLETO de la plataforma "Dictado" tal como corre hoy en local
(Docker Compose), escrito en código para no perder ningún detalle al migrar
a un hosting público (Fly.io, ver breezy-whistling-lynx.md / Parte F del
plan de despliegue). Este archivo no se ejecuta como parte de la app — es
documentación ejecutable/inspeccionable, en el mismo espíritu que
scripts/pending_features/*.py.

Actualizar este archivo cada vez que se agregue una env var, un servicio
nuevo, o un comportamiento que dependa de la configuración local, ANTES de
tocar la infraestructura de producción.

Última actualización: 2026-07-28 (justo antes de arrancar Parte F —
despliegue en Fly.io — del plan).
"""

# ---------------------------------------------------------------------------
# SERVICIOS (docker-compose.yml)
# ---------------------------------------------------------------------------
# En Fly.io cada uno de estos (salvo postgres/minio/redis, que se
# reemplazan por versiones gestionadas) se despliega como una "app" de Fly
# separada, con su propio Dockerfile y fly.toml — docker-compose.yml NO se
# consume directamente en producción, solo sirve para dev local.

SERVICES = {
    "postgres": {
        "role": "Base de datos principal (todas las tablas de la app).",
        "local_image": "postgres:16",
        "production_replacement": "Fly Postgres administrado (o Neon/Supabase) — swap de DATABASE_URL, sin cambios de código.",
    },
    "minio": {
        "role": "Storage S3-compatible para archivos de video/audio subidos (uploads, no youtube).",
        "local_image": "minio/minio",
        "production_replacement": "AWS S3 real — mismo driver (lib/storage/s3.ts), solo cambian env vars S3_*.",
    },
    "minio-init": {
        "role": "One-shot: crea el bucket 'videos' en minio al levantar el stack. No tiene equivalente en producción (el bucket de S3 se crea a mano una vez).",
    },
    "redis": {
        "role": "Cola de trabajos de transcripción (RQ) — desacopla la API del worker de la transcripción real.",
        "local_image": "redis:7-alpine",
        "production_replacement": "Upstash Redis (capa gratis, fácil con Fly.io) — swap de REDIS_URL.",
    },
    "worker": {
        "role": "API FastAPI liviana. Recibe POST /transcribe, encola el job en Redis, responde 202 al instante. NO carga Whisper — no necesita las env vars de storage/whisper/cookies.",
        "key_env_vars": ["REDIS_URL"],
        "production_note": "Réplica única alcanza (es solo un enqueuer, sin trabajo pesado).",
    },
    "worker-rq": {
        "role": "Uno o más procesos 'rq worker' que sacan jobs de la cola y hacen la transcripción real (yt-dlp + faster-whisper). Cada réplica carga su propia instancia de Whisper en memoria.",
        "key_env_vars": [
            "REDIS_URL", "WHISPER_MODEL_SIZE", "WHISPER_DEVICE", "WHISPER_COMPUTE_TYPE",
            "MIN_SEGMENT_DURATION", "STORAGE_DRIVER", "S3_*", "INTERNAL_CALLBACK_SECRET",
            "YT_DLP_COOKIES_FILE",
        ],
        "production_note": (
            "Esto es lo que de verdad necesita RAM (mínimo 6-8GB por réplica, mismo salto que "
            "hizo falta localmente tras el diagnóstico de OOM — ver KNOWN_FIXES). Escalar réplicas "
            "según cuántas transcripciones simultáneas se quieran soportar de verdad en paralelo "
            "(cada una es un proceso Whisper independiente, no comparten memoria entre sí)."
        ),
    },
    "web": {
        "role": "Next.js — toda la UI, auth, API routes, Prisma.",
        "key_env_vars": [
            "DATABASE_URL", "AUTH_SECRET", "AUTH_TRUST_HOST", "STORAGE_DRIVER", "S3_*",
            "WORKER_URL", "NEXT_PUBLIC_APP_URL", "INTERNAL_CALLBACK_SECRET", "GEMINI_API_KEY",
            "STRIPE_SECRET_KEY", "STRIPE_PUBLISHABLE_KEY", "STRIPE_WEBHOOK_SECRET (pendiente, Parte D)",
        ],
    },
}

# ---------------------------------------------------------------------------
# VARIABLES DE ENTORNO — qué son, y qué cambia entre local y producción.
# Los VALORES reales viven solo en .env (local) / los secrets del host de
# producción — nunca en este archivo ni en el chat.
# ---------------------------------------------------------------------------

ENV_VARS = {
    "DATABASE_URL": {
        "local": "postgresql://app:app@postgres:5432/app (hardcoded en docker-compose.yml)",
        "production": "Connection string del Postgres gestionado elegido.",
    },
    "AUTH_SECRET": {
        "local": ".env, requerido (${AUTH_SECRET:?...})",
        "production": "Mismo secreto o uno nuevo generado — Auth.js lo necesita para firmar JWT.",
    },
    "AUTH_TRUST_HOST": {
        "local": "\"true\" hardcoded — Auth.js rechaza requests de host \"untrusted\" fuera de Vercel.",
        "production": "Debe seguir en \"true\" (Fly.io tampoco es Vercel).",
    },
    "STORAGE_DRIVER": {
        "local": "\"s3\" (contra minio)",
        "production": "\"s3\" (contra AWS S3 real) — el driver es el mismo código, no cambia.",
    },
    "S3_ENDPOINT": {
        "local": "http://minio:9000",
        "production": "\"\" vacío (AWS S3 usa su endpoint default).",
    },
    "S3_PUBLIC_ENDPOINT": {
        "local": "http://localhost:9000 — necesario porque las URLs prefirmadas las sigue el navegador, que no puede resolver el hostname interno 'minio'.",
        "production": "\"\" vacío (AWS S3 ya es público, no hace falta separar el endpoint de firma del de acceso).",
    },
    "S3_BUCKET": {"local": "videos", "production": "Nombre del bucket real de S3 (crear a mano una vez)."},
    "S3_ACCESS_KEY / S3_SECRET_KEY": {
        "local": "minioadmin / minioadmin",
        "production": "Credenciales de un IAM user/rol de AWS con acceso solo a ese bucket (principio de mínimo privilegio).",
    },
    "S3_FORCE_PATH_STYLE": {"local": "\"true\" (minio lo requiere)", "production": "\"false\" (AWS S3 usa virtual-hosted style)."},
    "WORKER_URL": {
        "local": "http://worker:8001 — hostname interno de docker compose.",
        "production": "URL interna de la app 'worker' en Fly.io (red privada de Fly, no la URL pública).",
    },
    "NEXT_PUBLIC_APP_URL": {
        "local": "http://web:3000 — usado SERVER-SIDE por Next.js para armar la URL de callback que el worker llama de vuelta. CRÍTICO: debe ser la dirección interna, no la pública, o el worker nunca puede llamar de vuelta (bug ya diagnosticado una vez, ver KNOWN_FIXES).",
        "production": "URL interna de la app 'web' en la red privada de Fly.io.",
    },
    "INTERNAL_CALLBACK_SECRET": {
        "local": "valor compartido entre web y worker, default de desarrollo si no está en .env.",
        "production": "Generar uno real, distinto del de dev, y que coincida entre ambos servicios.",
    },
    "GEMINI_API_KEY": {"local": ".env, requerido.", "production": "Misma clave o una nueva — usada para generar preguntas."},
    "REDIS_URL": {
        "local": "redis://redis:6379/0",
        "production": "Connection string de Upstash Redis (o el proveedor elegido).",
    },
    "WHISPER_MODEL_SIZE / WHISPER_DEVICE / WHISPER_COMPUTE_TYPE": {
        "local": "small / auto / int8",
        "production": "Mantener igual salvo que se agregue GPU (ahí WHISPER_DEVICE=cuda tendría sentido).",
    },
    "MIN_SEGMENT_DURATION": {
        "local": "12 (segundos) — fusiona segmentos crudos de Whisper para que cada pregunta de práctica cubra un fragmento más sustancial, en vez de pausar en cada micro-segmento de VAD.",
        "production": "Mantener igual salvo feedback de usuarios reales.",
    },
    "YT_DLP_COOKIES_FILE": {
        "local": "/run/secrets/yt-cookies.txt, montado desde worker/secrets/yt-cookies.txt (nunca commiteado).",
        "production": "Mismo archivo de cookies debe subirse como secret al host de producción — sin él, YouTube probablemente bloquee las descargas desde IPs de datacenter con más agresividad todavía que en un ISP residencial.",
    },
    "STRIPE_SECRET_KEY / STRIPE_PUBLISHABLE_KEY": {
        "local": "en .env, agregadas por el usuario directamente (nunca pegadas en el chat).",
        "production": "Mismo par o uno nuevo — el usuario decidió usar claves LIVE desde el principio (ver nota de riesgo en la conversación: sin modo test disponible para probar el flujo de pago completo).",
    },
    "STRIPE_WEBHOOK_SECRET": {
        "local": "Pendiente — se agrega cuando se implemente app/api/stripe/webhook/route.ts (Parte D del plan).",
        "production": "Cada endpoint de webhook (test y producción) tiene su propio secret — no reusar el de local si en algún momento se prueba con Stripe CLI.",
    },
}

# ---------------------------------------------------------------------------
# COMPORTAMIENTOS / FEATURES YA IMPLEMENTADOS — checklist de paridad para
# verificar después de migrar que nada se rompió en el camino.
# ---------------------------------------------------------------------------

FEATURES_IMPLEMENTED = [
    "Auth: registro/login con Credentials + sesión JWT (Auth.js v5). middleware.ts protege /videos, /upload, /documents (no protege /api/* — cada route chequea sesión inline).",
    "Subida de video/audio por archivo (a S3/MinIO) o link de YouTube (sourceType='youtube', sin storageKey — el audio se baja solo transitoriamente para transcribir y se borra al terminar).",
    "Reproducción: <video> nativo para uploads, IFrame API oficial de YouTube embebido para youtube (nunca se descarga/re-aloja el video).",
    "Transcripción vía faster-whisper con VAD, ahora con merge de segmentos cortos (MIN_SEGMENT_DURATION) y despachada vía Redis+RQ para concurrencia real entre usuarios.",
    "Preguntas generadas con Gemini (open o mcq, elegido al subir) — 100% de cobertura garantizada en código (backfillMissingQuestions), nunca embeben la respuesta en el texto de la pregunta (stripEmbeddedAnswerParens).",
    "Modo práctica: pausa al llegar a un segmento sin responder (auto-pause), o toggle 'reproducir sin pausas' que sigue reproduciendo pero NO avanza la pregunta mostrada hasta que la actual se responda o se salte (fix de findActiveIndex, ver KNOWN_FIXES).",
    "Modo repaso: reproduce normal, overlay sincronizado con transcripción + respuesta propia guardada.",
    "Sin calificación por IA en ningún lado (removido explícitamente): en video/audio el usuario se autocompara escuchando el segmento; en documentos se muestra el texto literal del fragmento tras responder.",
    "Documentos de texto: .txt, .pdf (páginas reales vía unpdf), .docx (mammoth, página 1 fija) — mismo pipeline de preguntas que video, con líneas página-relativas.",
    "Borrado real de video/documento (no soft-toggle): borra la fila (cascada a segmentos/fragmentos/respuestas) y, si corresponde, el archivo en storage.",
    "Vigilancia de trabajos colgados (lib/processing-watchdog.ts): si un video/documento queda en estado 'en curso' más de cierto tiempo sin actualizarse (probable crash del worker), se marca 'failed' automáticamente la próxima vez que se consulta, en vez de quedar colgado para siempre.",
]

# ---------------------------------------------------------------------------
# BUGS REALES DIAGNOSTICADOS Y ARREGLADOS — para no reintroducirlos sin
# querer al portar código o "simplificar" algo durante la migración.
# ---------------------------------------------------------------------------

KNOWN_FIXES = [
    {
        "bug": "Worker OOM-killed a mitad de transcripción (docker events mostraba 'container oom' + exitCode 137), dejando el video colgado en 'transcribing' para siempre sin ningún error visible.",
        "root_cause": "Docker Desktop/WSL2 solo tenía ~3.8GB de RAM asignados para todo el stack; cargar Whisper + procesar audio superaba ese límite.",
        "fix": "Usuario subió el límite de WSL2 a 8GB vía .wslconfig. Además se agregó lib/processing-watchdog.ts para que, si vuelve a pasar (por cualquier causa, no solo OOM), el job se marque 'failed' automáticamente en vez de quedar colgado en silencio.",
        "production_implication": "Dimensionar cada réplica de worker-rq en Fly.io con RAM equivalente (mínimo 6-8GB) — el mismo límite aplica en la nube.",
    },
    {
        "bug": "NEXT_PUBLIC_APP_URL apuntando a localhost:3000 hacía que el callback del worker nunca llegara (desde el contenedor worker, localhost se resuelve a sí mismo, no a 'web').",
        "fix": "Hardcodeado a la dirección interna http://web:3000 en docker-compose.yml, independientemente del valor público-facing en .env.",
        "production_implication": "En Fly.io debe ser la dirección interna de la app 'web' en la red privada, NUNCA la URL pública — mismo principio.",
    },
    {
        "bug": "YouTubePlayer.tsx: el efecto que registra los callbacks de YouTube (onTimeUpdate, onPlay, etc.) solo corría una vez al montar, quedando pegado a la primera versión de esas funciones para siempre — ignoraba el toggle 'sin pausas' y el estado de respuestas ya enviadas.",
        "fix": "Patrón 'latest ref': refs actualizados en un efecto que corre en cada render, dereferenciados dentro de los handlers de YouTube en vez de cerrar sobre los props directamente.",
        "production_implication": "Ninguna específica de infraestructura — es un bug de React puro, ya resuelto, no reintroducir el patrón de cerrar sobre props dentro de un efecto con deps limitadas.",
    },
    {
        "bug": "En modo práctica, la pregunta activa saltaba al segmento donde estuviera el playhead en ese momento, descartando una respuesta a medio escribir del segmento anterior si el video seguía reproduciendo (modo 'sin pausas') más rápido de lo que el usuario tardaba en responder.",
        "fix": "findActiveIndex en usePracticePlayback.ts ahora se queda en el segmento alcanzado-pero-sin-responder más antiguo, en vez del último alcanzado — el video sigue reproduciendo pero la pregunta no cambia hasta responderla o saltarla.",
        "production_implication": "Ninguna — comportamiento de UI puro.",
    },
    {
        "bug": "Los segmentos crudos de Whisper (VAD) eran de solo 5-11 segundos cada uno, causando pausas muy frecuentes con poco tiempo para responder cada pregunta.",
        "fix": "transcription.py fusiona segmentos consecutivos hasta alcanzar MIN_SEGMENT_DURATION (default 12s) antes de generar una pregunta por segmento fusionado.",
        "production_implication": "Ninguna — ajustable vía env var si hace falta afinar según feedback real de usuarios.",
    },
]

# ---------------------------------------------------------------------------
# SECRETOS QUE NUNCA VIAJAN AL REPO (verificar que .gitignore los siga
# cubriendo después de cualquier reorganización de carpetas al migrar)
# ---------------------------------------------------------------------------

NEVER_COMMIT = [
    ".env",
    "worker/secrets/yt-cookies.txt",
]
