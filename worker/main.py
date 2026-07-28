from contextlib import asynccontextmanager
from typing import Optional

from fastapi import BackgroundTasks, FastAPI
from pydantic import BaseModel

from callback import post_callback
from storage_client import resolve_local_path
from transcription import load_model, transcribe_file
from youtube_ingest import delete_transient_audio, download_audio_transiently


@asynccontextmanager
async def lifespan(_app: FastAPI):
    load_model()  # warm up once at startup, not per-request
    yield


app = FastAPI(lifespan=lifespan)


class TranscribeRequest(BaseModel):
    video_id: str
    callback_url: str
    storage_key: Optional[str] = None
    youtube_video_id: Optional[str] = None


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/transcribe", status_code=202)
def transcribe(req: TranscribeRequest, background_tasks: BackgroundTasks):
    background_tasks.add_task(_run_transcription, req)
    return {"accepted": True}


def _run_transcription(req: TranscribeRequest) -> None:
    transient_audio_path: Optional[str] = None
    try:
        if req.youtube_video_id:
            transient_audio_path = download_audio_transiently(req.youtube_video_id)
            path = transient_audio_path
        elif req.storage_key:
            path = resolve_local_path(req.storage_key)
        else:
            raise ValueError("Se necesita storage_key o youtube_video_id")

        segments = transcribe_file(path)
        post_callback(
            req.callback_url,
            {"video_id": req.video_id, "status": "ready", "segments": segments},
        )
    except Exception as exc:  # noqa: BLE001
        post_callback(
            req.callback_url,
            {"video_id": req.video_id, "status": "failed", "error": str(exc)},
        )
    finally:
        if transient_audio_path:
            delete_transient_audio(transient_audio_path)
