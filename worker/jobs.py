from typing import Optional

from callback import post_callback
from storage_client import resolve_local_path
from transcription import transcribe_file
from youtube_ingest import delete_transient_audio, download_audio_transiently


def run_transcription_job(req: dict) -> None:
    """The actual transcription work, run inside an RQ worker process (see
    worker/README.md for how to start one) — never inside the FastAPI
    request/response cycle. `req` mirrors TranscribeRequest's fields.
    """
    transient_audio_path: Optional[str] = None
    try:
        if req.get("youtube_video_id"):
            transient_audio_path = download_audio_transiently(req["youtube_video_id"])
            path = transient_audio_path
        elif req.get("storage_key"):
            path = resolve_local_path(req["storage_key"])
        else:
            raise ValueError("Se necesita storage_key o youtube_video_id")

        segments = transcribe_file(path)
        post_callback(
            req["callback_url"],
            {"video_id": req["video_id"], "status": "ready", "segments": segments},
        )
    except Exception as exc:  # noqa: BLE001
        post_callback(
            req["callback_url"],
            {"video_id": req["video_id"], "status": "failed", "error": str(exc)},
        )
    finally:
        if transient_audio_path:
            delete_transient_audio(transient_audio_path)
