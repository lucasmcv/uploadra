from typing import Optional

from fastapi import FastAPI
from pydantic import BaseModel
from redis import Redis
from rq import Queue

from config import settings
from jobs import run_transcription_job

app = FastAPI()

_redis = Redis.from_url(settings.redis_url)
_queue = Queue("transcriptions", connection=_redis)


class TranscribeRequest(BaseModel):
    video_id: str
    callback_url: str
    storage_key: Optional[str] = None
    youtube_video_id: Optional[str] = None


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/transcribe", status_code=202)
def transcribe(req: TranscribeRequest):
    # This process only enqueues — the actual transcription (and its
    # WhisperModel memory footprint) lives in separate "rq worker"
    # processes, so N concurrent uploads never contend for one shared
    # model instance the way the old BackgroundTasks dispatch did.
    _queue.enqueue(run_transcription_job, req.model_dump())
    return {"accepted": True}
