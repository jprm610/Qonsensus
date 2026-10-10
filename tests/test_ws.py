"""Integración del WebSocket /ws y la máquina de estados de la sala."""
import concurrent.futures
import contextlib

import pytest
from fastapi.testclient import TestClient

import app.main as main_mod
from app.room import Room


def recv_until(ws, type_, pred=lambda m: True, limit=200):
    """Lee mensajes hasta encontrar uno del tipo dado que cumpla `pred`."""
    for _ in range(limit):
        m = ws.receive_json()
        if m["type"] == type_ and pred(m):
            return m
    raise AssertionError(f"No llegó {type_}")


@contextlib.contextmanager
def ws_conn(client):
    """websocket_connect que tolera la cancelación del TestClient al cerrar.

    Al salir, Starlette cancela la tarea del servidor; si el `finally` de /ws
    aún está en room.disconnect(), aflora un CancelledError (solo en tests).
    """
    session = client.websocket_connect("/ws")
    ws = session.__enter__()
    try:
        yield ws
    finally:
        with contextlib.suppress(concurrent.futures.CancelledError):
            session.__exit__(None, None, None)


@pytest.fixture
def room_client():
    """Fábrica: room_client(**timeouts) -> (client, stack)."""
    with contextlib.ExitStack() as stack:

        def make(**kw):
            main_mod.room = Room(**kw)
            client = stack.enter_context(TestClient(main_mod.app))
            return client, stack

        yield make


def connect_host(client, stack):
    ws = stack.enter_context(ws_conn(client))
    ws.send_json({"type": "join_host"})
    recv_until(ws, "state")
    return ws


def connect_validator(client, stack, name, token=None):
    ws = stack.enter_context(ws_conn(client))
    msg = {"type": "join", "name": name}
    if token:
        msg["token"] = token
    ws.send_json(msg)
    return ws, recv_until(ws, "you")


def setup_room(make, names=("Ana", "Beto", "Caro"), **kw):
    client, stack = make(**kw)
    host = connect_host(client, stack)
    vals = [connect_validator(client, stack, n) for n in names]
    recv_until(host, "state", lambda m: len(m["validators"]) == len(names))
    return client, stack, host, vals


def start_round(host, vals):
    """new_block -> devuelve (leader_ws, others_ws, leader_id)."""
    host.send_json({"type": "new_block"})
    w = recv_until(host, "w_result")
    leader_id = w["leader_id"]
    leader, others = None, []
    for ws, you in vals:
        recv_until(ws, "w_result")  # descarta `you` viejos de la ronda anterior
        me = recv_until(ws, "you")
        assert me["is_leader"] == (you["id"] == leader_id)
        if me["is_leader"]:
            leader = ws
        else:
            others.append(ws)
    assert leader is not None
    recv_until(host, "state", lambda m: m["phase"] == "PROPOSING")
    return leader, others, leader_id


def test_join_assigns_qubits_and_dedupes_names(room_client):
    client, stack = room_client()
    host = connect_host(client, stack)
    _, a = connect_validator(client, stack, "Ana")
    _, b = connect_validator(client, stack, "ana")
    assert (a["qubit"], b["qubit"]) == (0, 1)
    st = recv_until(host, "state", lambda m: len(m["validators"]) == 2)
    assert [v["name"] for v in st["validators"]] == ["Ana", "ana 2"]


def test_full_round_accepted_then_rejected(room_client):
    _, _, host, vals = setup_room(room_client)

    # Ronda 1: 3 sí -> aceptado
    leader, _, leader_id = start_round(host, vals)
    leader.send_json({"type": "propose", "data": "hola cadena"})
    recv_until(host, "state", lambda m: m["phase"] == "VOTING")
    for ws, _ in vals:
        ws.send_json({"type": "vote", "yes": True})
    g = recv_until(host, "ghz_result")
    assert (g["k_hat"], g["yes_real"], g["quorum"], g["accepted"]) == (3, 3, 2, True)
    st = recv_until(host, "state", lambda m: m["phase"] == "RESULT")
    assert len(st["chain"]) == 2
    assert st["chain"][1]["data"] == "hola cadena"
    assert st["chain"][1]["yes_estimated"] == 3
    assert all(b["valid"] for b in st["chain"])
    # los validadores no reciben yes_real
    vg = recv_until(vals[0][0], "ghz_result")
    assert "yes_real" not in vg

    host.send_json({"type": "next"})
    recv_until(host, "state", lambda m: m["phase"] == "LOBBY")

    # Ronda 2: 0 sí -> rechazado
    leader, _, _ = start_round(host, vals)
    leader.send_json({"type": "propose", "data": "otro"})
    recv_until(host, "state", lambda m: m["phase"] == "VOTING")
    for ws, _ in vals:
        ws.send_json({"type": "vote", "yes": False})
    g = recv_until(host, "ghz_result")
    assert (g["k_hat"], g["accepted"]) == (0, False)
    st = recv_until(host, "state", lambda m: m["phase"] == "RESULT")
    assert len(st["chain"]) == 2


def test_non_leader_cannot_propose(room_client):
    _, _, host, vals = setup_room(room_client)
    _, others, _ = start_round(host, vals)
    others[0].send_json({"type": "propose", "data": "intruso"})
    err = recv_until(others[0], "error")
    assert "líder" in err["message"]


def test_new_block_needs_two_validators(room_client):
    client, stack = room_client()
    host = connect_host(client, stack)
    connect_validator(client, stack, "Solo")
    host.send_json({"type": "new_block"})
    assert "al menos 2" in recv_until(host, "error")["message"]


def test_validator_cannot_start_block(room_client):
    _, _, _, vals = setup_room(room_client)
    ws = vals[0][0]
    ws.send_json({"type": "new_block"})
    assert "anfitrión" in recv_until(ws, "error")["message"]


def test_join_rejected_during_round(room_client):
    client, stack, host, vals = setup_room(room_client)
    start_round(host, vals)
    ws = stack.enter_context(ws_conn(client))
    ws.send_json({"type": "join", "name": "Tarde"})
    assert "ronda en curso" in recv_until(ws, "error")["message"]


def test_vote_timeout_counts_missing_as_no(room_client):
    _, _, host, vals = setup_room(room_client, vote_timeout=0.5)
    leader, _, _ = start_round(host, vals)
    leader.send_json({"type": "propose", "data": "x"})
    recv_until(host, "state", lambda m: m["phase"] == "VOTING")
    vals[0][0].send_json({"type": "vote", "yes": True})
    vals[1][0].send_json({"type": "vote", "yes": True})
    g = recv_until(host, "ghz_result")  # llega tras el timeout
    assert (g["yes_real"], g["k_hat"], g["accepted"]) == (2, 2, True)


def test_propose_timeout_reelects(room_client):
    _, _, host, vals = setup_room(room_client, propose_timeout=0.3)
    host.send_json({"type": "new_block"})
    recv_until(host, "w_result")
    recv_until(host, "w_result")  # re-elección tras el timeout
    recv_until(host, "state", lambda m: m["phase"] == "PROPOSING")


def test_reconnect_with_token_keeps_seat(room_client):
    client, stack = room_client(grace=5)
    host = connect_host(client, stack)
    connect_validator(client, stack, "Ana")
    with ws_conn(client) as ws:
        ws.send_json({"type": "join", "name": "Beto"})
        you = recv_until(ws, "you")
    st = recv_until(host, "state", lambda m: any(not v["connected"] for v in m["validators"]))
    assert len(st["validators"]) == 2

    _, again = connect_validator(client, stack, "ignorado", token=you["token"])
    assert (again["id"], again["qubit"]) == (you["id"], you["qubit"])
    st = recv_until(host, "state", lambda m: all(v["connected"] for v in m["validators"]))
    assert [v["name"] for v in st["validators"]] == ["Ana", "Beto"]


def test_grace_expiry_removes_and_compacts_qubits(room_client):
    client, stack = room_client(grace=0.3)
    host = connect_host(client, stack)
    connect_validator(client, stack, "Ana")
    with ws_conn(client) as ws:
        ws.send_json({"type": "join", "name": "Beto"})
        recv_until(ws, "you")
    caro, you = connect_validator(client, stack, "Caro")
    assert you["qubit"] == 2

    st = recv_until(
        host, "state", lambda m: [v["name"] for v in m["validators"]] == ["Ana", "Caro"]
    )
    assert [v["qubit"] for v in st["validators"]] == [0, 1]
    assert recv_until(caro, "you")["qubit"] == 1


def test_disconnect_during_round_cancels_after_grace(room_client):
    client, stack = room_client(grace=0.3)
    host = connect_host(client, stack)
    vals = [connect_validator(client, stack, n) for n in ("Ana", "Beto")]
    with ws_conn(client) as ws:
        ws.send_json({"type": "join", "name": "Caro"})
        you = recv_until(ws, "you")
        recv_until(host, "state", lambda m: len(m["validators"]) == 3)
        host.send_json({"type": "new_block"})
        recv_until(host, "state", lambda m: m["phase"] == "PROPOSING")
    assert "cancelada" in recv_until(host, "error")["message"]
    st = recv_until(host, "state", lambda m: m["phase"] == "LOBBY" and len(m["validators"]) == 2)
    assert you["id"] not in {v["id"] for v in st["validators"]}
    assert st["leader_id"] is None


def test_noise_toggle_and_round_with_noise(room_client):
    _, _, host, vals = setup_room(room_client)
    host.send_json({"type": "toggle_noise", "on": True})
    st = recv_until(host, "state", lambda m: m["noise"] is True)
    assert st["noise_available"] is True

    leader, _, _ = start_round(host, vals)  # W con ruido: puede descartar intentos
    leader.send_json({"type": "propose", "data": "con ruido"})
    recv_until(host, "state", lambda m: m["phase"] == "VOTING")
    for ws, _ in vals:
        ws.send_json({"type": "vote", "yes": True})
    g = recv_until(host, "ghz_result")
    assert g["yes_real"] == 3 and 0 <= g["k_hat"] <= 3
    recv_until(host, "state", lambda m: m["phase"] == "RESULT")


def test_validator_cannot_toggle_noise(room_client):
    _, _, _, vals = setup_room(room_client)
    ws = vals[0][0]
    ws.send_json({"type": "toggle_noise", "on": True})
    assert "anfitrión" in recv_until(ws, "error")["message"]


def test_invalid_json_and_unknown_type(room_client):
    client, stack = room_client()
    ws = stack.enter_context(ws_conn(client))
    ws.send_text("no es json")
    assert recv_until(ws, "error")["message"] == "JSON inválido"
    ws.send_json({"type": "bailar"})
    assert "desconocido" in recv_until(ws, "error")["message"]
