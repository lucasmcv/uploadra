import os


class Settings:
    whisper_model_size: str = os.environ.get("WHISPER_MODEL_SIZE", "small")
    whisper_device: str = os.environ.get("WHISPER_DEVICE", "auto")  # auto | cpu | cuda
    whisper_compute_type: str = os.environ.get("WHISPER_COMPUTE_TYPE", "int8")

    storage_driver: str = os.environ.get("STORAGE_DRIVER", "local")
    local_storage_dir: str = os.environ.get("LOCAL_STORAGE_DIR", "../data/uploads")

    s3_endpoint: str = os.environ.get("S3_ENDPOINT", "")
    s3_bucket: str = os.environ.get("S3_BUCKET", "videos")
    s3_access_key: str = os.environ.get("S3_ACCESS_KEY", "")
    s3_secret_key: str = os.environ.get("S3_SECRET_KEY", "")
    s3_region: str = os.environ.get("S3_REGION", "us-east-1")
    s3_force_path_style: bool = os.environ.get("S3_FORCE_PATH_STYLE", "true") == "true"

    port: int = int(os.environ.get("WORKER_PORT", "8001"))
    callback_secret: str = os.environ.get("INTERNAL_CALLBACK_SECRET", "")

    # Optional: path to a Netscape-format cookies.txt exported from a real
    # logged-in browser session. YouTube increasingly blocks yt-dlp with a
    # "Sign in to confirm you're not a bot" / PO Token error for
    # datacenter/server IPs even with a JS runtime available — cookies are
    # the mitigation yt-dlp itself recommends. Unset by default (feature
    # degrades to "YouTube videos may fail to transcribe" rather than
    # requiring this for the app to work at all).
    yt_dlp_cookies_file: str = os.environ.get("YT_DLP_COOKIES_FILE", "")


settings = Settings()
