import json
import warnings
from pathlib import Path

from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.responses import FileResponse, PlainTextResponse
from fastapi.staticfiles import StaticFiles

from app import quantum
from app.room import Room, error_msg

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
                await ws.send_json(error_msg("invalid_json"))
                continue
            await current.handle(ws, msg)
    except WebSocketDisconnect:
        pass
    finally:
        await current.disconnect(ws)


@app.get("/health")
def health():
    return {"ok": True}


@app.get("/circuit", response_class=PlainTextResponse)
def circuit(kind: str, n: int, yes: str | None = None):
    """Dibujo en texto del circuito W o GHZ para n validadores.

    `yes`: qubits que votan sí en el GHZ, separados por comas (por defecto, todos).
    """
    if kind not in ("w", "ghz"):
        raise HTTPException(400, "kind debe ser 'w' o 'ghz'")
    if not quantum.MIN_VALIDATORS <= n <= quantum.MAX_VALIDATORS:
        raise HTTPException(
            400, f"n debe estar entre {quantum.MIN_VALIDATORS} y {quantum.MAX_VALIDATORS}"
        )
    if kind == "w":
        qc = quantum.w_circuit(n)
    else:
        try:
            qubits = list(range(n)) if yes is None else [int(x) for x in yes.split(",") if x != ""]
            qc = quantum.ghz_circuit(n, qubits)
        except ValueError as exc:
            raise HTTPException(400, f"yes inválido: {exc}") from exc
    with warnings.catch_warnings():  # Qiskit avisa si stdout no es UTF-8 y dibuja igual en UTF-8
        warnings.simplefilter("ignore", RuntimeWarning)
        return str(qc.draw("text", fold=-1))


@app.get("/")
def validator_page():
    return FileResponse(STATIC_DIR / "index.html")


@app.get("/host")
def host_page():
    return FileResponse(STATIC_DIR / "host.html")
