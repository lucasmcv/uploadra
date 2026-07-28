import os

from faster_whisper import WhisperModel

from config import settings

_model: WhisperModel | None = None

# Whisper's VAD-based segments follow speech-pause boundaries, which often
# produces many short (5-11s) chunks for continuous speech. Using each one
# as its own practice question pauses very frequently and gives the user
# little time to answer before the next one is due — merge consecutive raw
# segments until each practice segment spans at least this long.
MIN_SEGMENT_DURATION = float(os.environ.get("MIN_SEGMENT_DURATION", "12"))


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

    raw = [
        {"start": segment.start, "end": segment.end, "text": segment.text.strip()}
        for segment in segments_iter
    ]
    merged = _merge_short_segments(raw, MIN_SEGMENT_DURATION)

    return [
        {
            "order_index": order_index,
            "start_time": segment["start"],
            "end_time": segment["end"],
            "transcript_text": segment["text"],
        }
        for order_index, segment in enumerate(merged)
    ]


def _merge_short_segments(raw: list[dict], min_duration: float) -> list[dict]:
    """Greedily merges each segment into the previous one while the
    previous one is still under min_duration, so every merged segment
    (except possibly the last, if not enough audio remains) is at least
    min_duration long. Keeps segment count down without needing any
    semantic/sentence-boundary awareness.
    """
    if not raw:
        return []

    merged = [dict(raw[0])]
    for segment in raw[1:]:
        last = merged[-1]
        if (last["end"] - last["start"]) < min_duration:
            last["end"] = segment["end"]
            last["text"] = f"{last['text']} {segment['text']}".strip()
        else:
            merged.append(dict(segment))
    return merged
