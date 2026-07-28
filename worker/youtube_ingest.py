import os
import tempfile

import yt_dlp

from config import settings


def download_audio_transiently(youtube_video_id: str) -> str:
    """Downloads only the audio for a YouTube video to a temp file and
    returns its path. Caller is responsible for deleting it — this is a
    transient download for transcription only; the audio/video bytes are
    never persisted or served back to users (playback uses YouTube's own
    embedded player, not this file).

    NOTE: YouTube frequently blocks server/datacenter IPs with a "Sign in
    to confirm you're not a bot" (PO Token) error, even with a JS runtime
    available for yt-dlp. If that happens consistently, set
    YT_DLP_COOKIES_FILE to a Netscape-format cookies.txt exported from a
    real logged-in browser session — that's yt-dlp's own recommended
    mitigation, not something we can code around.
    """
    url = f"https://www.youtube.com/watch?v={youtube_video_id}"
    tmp_dir = tempfile.mkdtemp(prefix="yt_audio_")
    out_template = os.path.join(tmp_dir, "audio.%(ext)s")

    ydl_opts = {
        "format": "bestaudio/best",
        "outtmpl": out_template,
        "quiet": True,
        "no_warnings": True,
        "postprocessors": [
            {
                "key": "FFmpegExtractAudio",
                "preferredcodec": "wav",
            }
        ],
    }
    if settings.yt_dlp_cookies_file:
        ydl_opts["cookiefile"] = settings.yt_dlp_cookies_file

    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
        ydl.download([url])

    produced = os.listdir(tmp_dir)
    if not produced:
        raise RuntimeError(f"yt-dlp no generó ningún archivo de audio para {youtube_video_id}")
    return os.path.join(tmp_dir, produced[0])


def delete_transient_audio(path: str) -> None:
    try:
        os.remove(path)
        os.rmdir(os.path.dirname(path))
    except OSError:
        pass
