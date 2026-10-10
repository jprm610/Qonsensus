from pathlib import Path

from fastapi import FastAPI
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

STATIC_DIR = Path(__file__).resolve().parent.parent / "static"

app = FastAPI(title="Entangled Consensus")
app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")


@app.get("/health")
def health():
    return {"ok": True}


@app.get("/")
def validator_page():
    return FileResponse(STATIC_DIR / "index.html")


@app.get("/host")
def host_page():
    return FileResponse(STATIC_DIR / "host.html")
