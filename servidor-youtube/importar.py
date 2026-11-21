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
VIDEO_FORMAT = "bv[height<=720][ext=mp4]+ba[ext=m4a]/b[height<=720][ext=mp4]"
DEPLOY_REVISION = os.environ.get("RENDER_GIT_COMMIT", "local")[:7]

IMPORT_ERRORS = (
    ("youtube-verificacao", 422, r"sign in to confirm.{0,100}not a bot|confirm you.re not a bot",
     "O YouTube exigiu verificação no servidor de importação. Para gerar o corte desse vídeo, envie o MP4 pelo seletor."),
    ("youtube-restricao", 422, r"private video|members.only|age.restricted|sign in to confirm your age|"
     r"not available in your country|video unavailable|this video is unavailable",
     "O YouTube informou que o vídeo está indisponível ou restrito para o importador. Envie o arquivo MP4 se tiver acesso a ele."),
    ("arquivo-grande", 413, r"larger than max.filesize|exceeds.{0,40}max.filesize|file is too large",
     "O vídeo excede o limite de 250 MB por link."),
    ("duracao-ou-live", 422, r"does not pass filter|doesn.t pass filter|live stream is not currently live|"
     r"this live event will begin|is a live stream",
     "O importador aceita vídeos gravados de 30 segundos a 2 horas."),
    ("formato-indisponivel", 422, r"requested format is not available|no video formats found|only images are available|"
     r"no formats found",
     "O YouTube não ofereceu um formato de vídeo e áudio compatível para este link. Envie o MP4 pelo seletor."),
    ("rede-youtube", 502, r"http error (403|429|5\d\d)|unable to connect to proxy|connection refused|"
     r"temporary failure in name resolution|read timed out|remote end closed connection",
     "O servidor não conseguiu acessar o YouTube neste momento. Tente mais tarde ou envie o MP4 pelo seletor."),
)

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


def log_import_error(video_id, code, returncode, stderr, stdout):
    lines = [line.strip() for line in (stderr or stdout).splitlines() if line.strip()]
    errors = [line for line in lines if line.startswith("ERROR:")]
    last_line = (errors or lines or ["yt-dlp terminou sem mensagem"])[-1]
    last_line = re.sub(r"https?://\S+|/tmp/\S+", "[endereço omitido]", last_line)
    last_line = re.sub(r"(?i)\b(authorization|cookie|token)\s*[:=].*", "[credencial omitida]", last_line)
    last_line = "".join(char for char in last_line if char.isprintable())
    LOGGER.warning(
        "Importação %s · commit %s · %s · status %s · %s",
        video_id, DEPLOY_REVISION, code, returncode, last_line[:500],
    )


def download(video_id, directory):
    output = directory / "origem.mp4"
    title_file = directory / "titulo.jsonl"
    command = [
        sys.executable, "-m", "yt_dlp", "--ignore-config",
        "--no-playlist", "--no-simulate", "--no-progress",
        "--socket-timeout", "12", "--retries", "1", "--fragment-retries", "1",
        "--match-filter", "!is_live & duration >= 30 & duration <= 7200",
        "--max-filesize", "250M",
        "-f", VIDEO_FORMAT,
        "--merge-output-format", "mp4", "-o", str(directory / "origem.%(ext)s"),
        "--print-to-file", "after_move:%(title)j", str(title_file),
        "--no-quiet", "--", "https://www.youtube.com/watch?v=" + video_id,
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
            stdout, stderr = process.communicate()
            log_import_error(video_id, "tempo-limite", process.returncode, stderr, stdout)
            raise HTTPException(504, "O YouTube demorou a responder. Envie o MP4 ou tente mais tarde.") from None
        if process.returncode or not output.is_file():
            report = stdout + "\n" + stderr
            for code, status, pattern, message in IMPORT_ERRORS:
                if re.search(pattern, report, re.IGNORECASE):
                    log_import_error(video_id, code, process.returncode, stderr, stdout)
                    raise HTTPException(status, message)
            log_import_error(video_id, "falha-sem-classificar", process.returncode, stderr, stdout)
            raise HTTPException(
                422, "O importador falhou ao obter o vídeo. Para diagnosticar, consulte a linha "
                "“Importação” nos logs do Render. Você também pode enviar o MP4 pelo seletor.",
            )

    if output.stat().st_size > MAX_BYTES:
        raise HTTPException(413, "O vídeo excede o limite de 250 MB por link.")
    if not output.stat().st_size:
        raise HTTPException(422, "O servidor recebeu um vídeo vazio.")
    try:
        title = json.loads(title_file.read_text(encoding="utf-8").strip().splitlines()[-1])
    except (OSError, ValueError, IndexError):
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
