import json
import logging
import os
import re
import signal
import subprocess
import sys
from pathlib import Path
from tempfile import TemporaryDirectory
from threading import BoundedSemaphore
from urllib.parse import urlsplit

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse

VIDEO_ID = re.compile(r"[A-Za-z0-9_-]{11}")
MAX_BYTES = 250 * 1024 * 1024
IMPORT_TIMEOUT = 180
IMPORT_SLOT = BoundedSemaphore(1)
LOGGER = logging.getLogger("uvicorn.error")

origin = os.environ.get("CORTES_ORIGIN", "")
parsed = urlsplit(origin)
if (
    not parsed.hostname or parsed.username or parsed.password or parsed.path
    or parsed.query or parsed.fragment
    or (parsed.scheme != "https" and (parsed.scheme, parsed.hostname) not in {
        ("http", "localhost"), ("http", "127.0.0.1"),
    })
):
    raise RuntimeError("Defina CORTES_ORIGIN com a origem HTTPS do estúdio, sem caminho.")

app = FastAPI(docs_url=None, redoc_url=None, openapi_url=None)
app.add_middleware(
    CORSMiddleware, allow_origins=[origin], allow_methods=["POST"],
    expose_headers=["Content-Disposition"],
)


@app.get("/health")
async def health():
    return {"status": "ok"}


def download(video_id, directory):
    output = directory / "origem.mp4"
    command = [
        sys.executable, "-m", "yt_dlp", "--ignore-config",
        "--no-playlist", "--no-simulate", "--quiet", "--no-warnings",
        "--socket-timeout", "12", "--retries", "1", "--fragment-retries", "1",
        "--match-filter", "!is_live & duration >= 65 & duration <= 7200",
        "--max-filesize", "250M",
        "-f", "bv[height<=720][ext=mp4][protocol=https]+ba[ext=m4a][protocol=https]/b[height<=720][ext=mp4][protocol=https]",
        "--merge-output-format", "mp4", "-o", str(directory / "origem.%(ext)s"),
        "--print", "after_move:%(title)j", "--", "https://www.youtube.com/watch?v=" + video_id,
    ]
    with subprocess.Popen(
        command, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True,
        encoding="utf-8", errors="replace", start_new_session=True,
    ) as process:
        try:
            stdout, stderr = process.communicate(timeout=IMPORT_TIMEOUT)
        except subprocess.TimeoutExpired:
            try:
                os.killpg(process.pid, signal.SIGKILL)
            except ProcessLookupError:
                pass
            process.communicate()
            raise HTTPException(504, "O YouTube demorou a responder. Envie o MP4 ou tente mais tarde.") from None
        if process.returncode or not output.is_file():
            if stderr.strip():
                LOGGER.info("Importação %s indisponível (status %s).", video_id, process.returncode)
            raise HTTPException(
                422, "O servidor não conseguiu baixar esse vídeo. Use um vídeo disponível de "
                "65 segundos a 2 horas, com até 250 MB, ou envie o MP4 pelo seletor.",
            )

    if output.stat().st_size > MAX_BYTES:
        raise HTTPException(413, "O vídeo excede o limite de 250 MB por link.")
    if not output.stat().st_size:
        raise HTTPException(422, "O servidor recebeu um vídeo vazio.")
    try:
        title = json.loads(stdout.strip().splitlines()[-1])
    except (ValueError, IndexError):
        title = ""
    if not isinstance(title, str):
        title = ""
    title = re.sub(r'[\\/:*?"<>|\x00-\x1f\x7f]', " ", title).strip()[:150]
    return output, (title or video_id) + ".mp4"


class ImportedVideo(FileResponse):
    def __init__(self, path, filename, directory):
        super().__init__(path, media_type="video/mp4", filename=filename, headers={
            "Cache-Control": "no-store",
        })
        self.directory = directory

    async def __call__(self, scope, receive, send):
        try:
            await super().__call__(scope, receive, send)
        finally:
            try:
                self.directory.cleanup()
            finally:
                IMPORT_SLOT.release()


@app.post("/importar/{video_id}")
def import_video(video_id: str, request: Request):
    if request.headers.get("origin") != origin:
        raise HTTPException(403, "Abra a importação pela página do estúdio.")
    if not VIDEO_ID.fullmatch(video_id):
        raise HTTPException(400, "Use um link válido do YouTube.")
    if not IMPORT_SLOT.acquire(blocking=False):
        raise HTTPException(429, "O importador está ocupado. Aguarde e tente novamente.")
    directory = None
    try:
        directory = TemporaryDirectory(prefix="cortes-youtube-")
        path, filename = download(video_id, Path(directory.name))
        return ImportedVideo(path, filename, directory)
    except BaseException:
        try:
            if directory is not None:
                directory.cleanup()
        finally:
            IMPORT_SLOT.release()
        raise
