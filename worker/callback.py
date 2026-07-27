import time

import requests

from config import settings


def post_callback(callback_url: str, payload: dict, retries: int = 3) -> None:
    headers = {}
    if settings.callback_secret:
        headers["Authorization"] = f"Bearer {settings.callback_secret}"

    last_error: Exception | None = None
    for attempt in range(retries):
        try:
            response = requests.post(callback_url, json=payload, headers=headers, timeout=10)
            response.raise_for_status()
            return
        except Exception as exc:  # noqa: BLE001
            last_error = exc
            time.sleep(2**attempt)

    print(f"[worker] Falló el callback a {callback_url} tras {retries} intentos: {last_error}")
