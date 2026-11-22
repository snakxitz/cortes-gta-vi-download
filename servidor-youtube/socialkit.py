import re
import time
from urllib.parse import urlsplit

import httpx
from fastapi import HTTPException

API = "https://api.socialkit.dev"
MEDIA_HOST = re.compile(r"socialkit-downloads\.s3(?:[.-][a-z0-9-]+)?\.amazonaws\.com")
JOB_ID = re.compile(r"[A-Za-z0-9_-]{1,64}")
MAX_TEST_SECONDS = 300


def read_job(response):
    if response.status_code in {401, 403}:
        raise HTTPException(422, "Confira a validade da chave e o saldo de créditos do SocialKit.")
    if response.status_code == 429:
        raise HTTPException(429, "O SocialKit atingiu o limite de pedidos. Aguarde antes de tentar novamente.")
    response.raise_for_status()
    payload = response.json()
    data = payload.get("data") if isinstance(payload, dict) else None
    if not isinstance(data, dict):
        raise HTTPException(502, "O SocialKit devolveu uma resposta inesperada.")
    return data


def copy_mp4(client, url, output, max_bytes, deadline):
    parts = urlsplit(url)
    if (parts.scheme != "https" or not MEDIA_HOST.fullmatch(parts.hostname or "")
            or parts.username or parts.password or parts.port not in {None, 443}):
        raise HTTPException(502, "O endereço do arquivo retornado pelo SocialKit é inválido.")
    with client.stream("GET", url) as response:
        if response.status_code != 200:
            raise HTTPException(502, "O arquivo do SocialKit está indisponível ou expirou.")
        length = response.headers.get("content-length", "")
        if length.isdecimal() and int(length) > max_bytes:
            raise HTTPException(413, "O vídeo excede o limite de 250 MB por link.")
        size = 0
        with output.open("wb") as target:
            for block in response.iter_bytes(chunk_size=256 * 1024):
                if time.monotonic() >= deadline:
                    raise HTTPException(504, "O download do SocialKit excedeu o tempo de teste.")
                if not size and block[4:8] != b"ftyp":
                    raise HTTPException(502, "O SocialKit não entregou um arquivo MP4 válido.")
                size += len(block)
                if size > max_bytes:
                    raise HTTPException(413, "O vídeo excede o limite de 250 MB por link.")
                target.write(block)
        if not size:
            raise HTTPException(502, "O SocialKit entregou um arquivo vazio.")


def download_socialkit(video_id, directory, access_key, max_bytes):
    headers = {"x-access-key": access_key}
    deadline = time.monotonic() + 160
    try:
        with httpx.Client(timeout=15, follow_redirects=False) as client:
            job = read_job(client.post(API + "/v2/youtube/download", headers=headers, json={
                "url": "https://www.youtube.com/watch?v=" + video_id,
                "format": "mp4",
                "quality": "480p",
                "max_duration": MAX_TEST_SECONDS,
            }))
            job_id = job.get("jobId")
            if not isinstance(job_id, str) or not JOB_ID.fullmatch(job_id):
                raise HTTPException(502, "O SocialKit não retornou um identificador de importação válido.")
            while time.monotonic() < deadline:
                response = client.get(API + "/v2/downloads/" + job_id, headers=headers)
                if response.status_code == 503:
                    time.sleep(3)
                    continue
                job = read_job(response)
                state = job.get("status")
                if state == "failed":
                    if job.get("errorCode") == "duration_limit_exceeded":
                        raise HTTPException(422, "O teste com SocialKit aceita vídeos de até 5 minutos.")
                    raise HTTPException(422, "O SocialKit não conseguiu importar esse vídeo. Confira se o vídeo está disponível.")
                if state == "ready":
                    duration = job.get("durationSeconds")
                    if not isinstance(duration, (int, float)) or not 30 <= duration <= MAX_TEST_SECONDS:
                        raise HTTPException(422, "Use um vídeo de 30 segundos a 5 minutos neste teste.")
                    url = job.get("downloadUrl")
                    if job.get("format") != "mp4" or not isinstance(url, str):
                        raise HTTPException(502, "O SocialKit não devolveu um MP4 para o estúdio.")
                    output = directory / "origem.mp4"
                    copy_mp4(client, url, output, max_bytes, deadline)
                    return output, job.get("title")
                if state not in {"queued", "processing"}:
                    raise HTTPException(502, "O SocialKit retornou um estado de importação desconhecido.")
                time.sleep(3)
    except (httpx.HTTPError, ValueError) as error:
        raise HTTPException(502, "O serviço de importação do SocialKit está indisponível neste momento.") from error
    raise HTTPException(504, "A importação do SocialKit excedeu o tempo de teste.")
