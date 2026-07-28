"""
IMPLEMENTED — see lib/youtube.ts (URL parsing), components/player/YouTubePlayer.tsx
(IFrame API wrapper), lib/types.ts's MinimalPlayer (the shared interface that
let usePracticePlayback/useSegmentSync drive either a native <video> or the
YouTube player), worker/youtube_ingest.py (transient audio-only download via
yt-dlp) and worker/main.py (branches on youtube_video_id vs storage_key).

Known real-world limitation, not a bug: YouTube frequently blocks
automated audio downloads from server/datacenter IPs with a "Sign in to
confirm you're not a bot" (PO Token) error, even with a JS runtime (deno)
available. Mitigation (cookies.txt from a real browser session) is
documented in worker/README.md and wired via YT_DLP_COOKIES_FILE — this
isn't something that can be fully solved in code, since it's YouTube's
own anti-bot measure. Playback (via the official embedded IFrame player)
is unaffected by this — only the transcription step for a given video can
fail this way, verified end-to-end including the failure path (video
correctly ends up status="failed" with the real yt-dlp error message).

GOAL
----
Let the user paste a YouTube URL instead of uploading a file, and get the
same practice/review experience (segments -> generated question -> answer)
as with an uploaded video.

WHY THIS ISN'T A DROP-IN EXTENSION OF THE CURRENT UPLOAD FLOW
--------------------------------------------------------------
1. Playback (ToS-sensitive):
   Must use YouTube's official embedded IFrame Player API — never download
   and re-host the video/audio file for playback. The current
   components/player/VideoPlayer.tsx wraps a native <video> element; a
   YouTube-backed source needs a parallel implementation since:
     - There is no native 'timeupdate' event from the IFrame API. Must poll
       player.getCurrentTime() on an interval (~250ms) to approximate it.
     - play()/pause()/seek() go through the IFrame API
       (player.playVideo() / pauseVideo() / seekTo()), not the native
       HTMLMediaElement methods hooks/usePracticePlayback.ts currently calls
       via videoRef.current.
     - hooks/usePracticePlayback.ts and hooks/useSegmentSync.ts are written
       against RefObject<HTMLVideoElement>. They'd need to accept a small
       common interface instead, e.g.:

         class PlaybackController(Protocol):
             def get_current_time(self) -> float: ...
             def play(self) -> None: ...
             def pause(self) -> None: ...
             def seek(self, seconds: float) -> None: ...
             def is_paused(self) -> bool: ...

       (illustrative — real implementation is TypeScript, not Python; shown
       here just to capture the shape of the abstraction needed)

2. Transcription (also ToS-sensitive):
   The worker needs the AUDIO to run through the existing faster-whisper
   pipeline (for consistent segmentation/quality with uploaded videos).
   Plan: use yt-dlp to extract audio-only, TRANSIENTLY:
     - download audio to a temp file
     - run the existing transcribe_file() from worker/transcription.py
     - delete the temp audio file immediately after
     - only the resulting transcript segments (text + timestamps) are ever
       persisted — never the audio/video bytes themselves.
   This needs a new worker dependency (yt-dlp) and ffmpeg (already present
   in worker/Dockerfile for other reasons).

   Sketch (worker/youtube_ingest.py, not yet created):

       import tempfile, os
       import yt_dlp

       def download_audio_transiently(youtube_url: str) -> str:
           '''Returns a path to a temp audio file. Caller must delete it.'''
           tmp_dir = tempfile.mkdtemp()
           out_path = os.path.join(tmp_dir, "audio.%(ext)s")
           ydl_opts = {
               "format": "bestaudio/best",
               "outtmpl": out_path,
               "quiet": True,
               "postprocessors": [{
                   "key": "FFmpegExtractAudio",
                   "preferredcodec": "wav",
               }],
           }
           with yt_dlp.YoutubeDL(ydl_opts) as ydl:
               ydl.download([youtube_url])
           # yt-dlp substitutes the real extension; find the produced file
           produced = [f for f in os.listdir(tmp_dir)]
           assert produced, "yt-dlp produced no output file"
           return os.path.join(tmp_dir, produced[0])

3. Schema:
   Video currently assumes an uploaded file (storageKey, mimeType). Needs:
     - sourceType: "upload" | "youtube"  (String, like questionMode)
     - youtubeVideoId: String? (the 11-char YouTube ID, extracted from the
       pasted URL — support youtube.com/watch?v=, youtu.be/, shorts/ forms)
     - storageKey / mimeType become nullable (only meaningful for uploads)

4. Legal/ToS nuance to keep surfacing to the user, not just bury in code:
   Downloading YouTube audio (even transiently, even for transformative
   analysis) sits in a gray area of YouTube's Terms of Service. The
   embed-and-never-rehost approach for PLAYBACK is the defensible part;
   the transient-download-for-transcription part is common practice
   (yt-dlp is widely used this way) but not officially licensed. Mention
   this again before actually building it, don't just silently ship it.

OPEN QUESTIONS FOR THE USER (ask before implementing)
------------------------------------------------------
- Confirm OK with: official embedded player for playback + yt-dlp
  transient audio-only download for transcription (audio discarded after).
- Any length/quota limits desired (YouTube videos can be much longer than
  typical uploaded clips — Whisper cost/time scales with duration)?
"""
