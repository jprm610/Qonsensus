import json
from pathlib import Path

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from app.room import Room

STATIC_DIR = Path(__file__).resolve().parent.parent / "static"

app = FastAPI(title="Entangled Consensus")
app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")

room = Room()  # una sola sala en memoria; los tests la reemplazan


@app.websocket("/ws")
async def ws_endpoint(ws: WebSocket):
    await ws.accept()
    current = room  # la sala no cambia durante la vida del socket
    try:
        while True:
            text = await ws.receive_text()
            try:
                msg = json.loads(text)
            except json.JSONDecodeError:
                await ws.send_json({"type": "error", "message": "JSON inválido"})
                continue
            await current.handle(ws, msg)
    except WebSocketDisconnect:
        pass
    finally:
        await current.disconnect(ws)


@app.get("/health")
def health():
    return {"ok": True}


@app.get("/")
def validator_page():
    return FileResponse(STATIC_DIR / "index.html")


@app.get("/host")
def host_page():
    return FileResponse(STATIC_DIR / "host.html")
