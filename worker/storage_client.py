import os
import tempfile

from config import settings


def resolve_local_path(storage_key: str) -> str:
    """Return a local filesystem path for the given storage key, downloading
    from S3/MinIO first if the worker is configured for that driver. In
    "local" mode, Next.js and the worker share the same disk (same machine
    in dev), so we just join the key onto the shared uploads directory.
    """
    if settings.storage_driver == "s3":
        return _download_from_s3(storage_key)

    path = os.path.normpath(os.path.join(settings.local_storage_dir, storage_key))
    if not os.path.isfile(path):
        raise FileNotFoundError(f"No se encontró el archivo en almacenamiento local: {path}")
    return path


def _download_from_s3(storage_key: str) -> str:
    import boto3

    client = boto3.client(
        "s3",
        endpoint_url=settings.s3_endpoint or None,
        region_name=settings.s3_region,
        aws_access_key_id=settings.s3_access_key,
        aws_secret_access_key=settings.s3_secret_key,
        config=boto3.session.Config(s3={"addressing_style": "path"})
        if settings.s3_force_path_style
        else None,
    )

    suffix = os.path.splitext(storage_key)[1] or ".bin"
    fd, tmp_path = tempfile.mkstemp(suffix=suffix)
    os.close(fd)
    client.download_file(settings.s3_bucket, storage_key, tmp_path)
    return tmp_path
