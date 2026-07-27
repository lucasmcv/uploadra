from faster_whisper import WhisperModel

from config import settings

_model: WhisperModel | None = None


def load_model() -> WhisperModel:
    global _model
    if _model is None:
        _model = WhisperModel(
            settings.whisper_model_size,
            device=settings.whisper_device,
            compute_type=settings.whisper_compute_type,
        )
    return _model


def transcribe_file(path: str) -> list[dict]:
    model = load_model()
    segments_iter, _info = model.transcribe(path, vad_filter=True)

    segments = []
    for order_index, segment in enumerate(segments_iter):
        segments.append(
            {
                "order_index": order_index,
                "start_time": segment.start,
                "end_time": segment.end,
                "transcript_text": segment.text.strip(),
            }
        )
    return segments
