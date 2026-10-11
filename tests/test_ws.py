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
    assert err["code"] == "leader_only_propose"


def test_new_block_needs_two_validators(room_client):
    client, stack = room_client()
    host = connect_host(client, stack)
    connect_validator(client, stack, "Solo")
    host.send_json({"type": "new_block"})
    assert recv_until(host, "error")["code"] == "min_validators"


def test_validator_cannot_start_block(room_client):
    _, _, _, vals = setup_room(room_client)
    ws = vals[0][0]
    ws.send_json({"type": "new_block"})
    assert recv_until(ws, "error")["code"] == "host_only_new_block"


def test_join_rejected_during_round(room_client):
    client, stack, host, vals = setup_room(room_client)
    start_round(host, vals)
    ws = stack.enter_context(ws_conn(client))
    ws.send_json({"type": "join", "name": "Tarde"})
    assert recv_until(ws, "error")["code"] == "join_during_round"


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
    err = recv_until(host, "error")
    assert err["code"] == "round_cancelled" and err["params"]["name"] == "Caro"
    assert err["message"] == "Round cancelled: Caro disconnected"
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
    assert recv_until(ws, "error")["code"] == "host_only_noise"


def test_invalid_json_and_unknown_type(room_client):
    client, stack = room_client()
    ws = stack.enter_context(ws_conn(client))
    ws.send_text("no es json")
    err = recv_until(ws, "error")
    assert (err["code"], err["message"]) == ("invalid_json", "Invalid JSON")
    ws.send_json({"type": "bailar"})
    err = recv_until(ws, "error")
    assert err["code"] == "unknown_type" and err["params"] == {"type": "bailar"}


def accepted_block(host, vals):
    """Corre una ronda con 3 sí y espera RESULT."""
    leader, _, _ = start_round(host, vals)
    leader.send_json({"type": "propose", "data": "bloque honesto"})
    recv_until(host, "state", lambda m: m["phase"] == "VOTING")
    for ws, _ in vals:
        ws.send_json({"type": "vote", "yes": True})
    return recv_until(host, "state", lambda m: m["phase"] == "RESULT")


def test_host_tamper_breaks_chain_and_repair_fixes_it(room_client):
    _, _, host, vals = setup_room(room_client)
    st = accepted_block(host, vals)
    assert [b["valid"] for b in st["chain"]] == [True, True]

    host.send_json({"type": "tamper", "index": 1, "data": "robé las monedas"})
    st = recv_until(host, "state", lambda m: len(m["chain"]) > 1 and m["chain"][1]["data"] == "robé las monedas")
    assert [b["valid"] for b in st["chain"]] == [True, False]
    # todos los clientes reciben la cadena rota
    st_v = recv_until(vals[0][0], "state", lambda m: len(m["chain"]) > 1 and m["chain"][1]["data"] == "robé las monedas")
    assert st_v["chain"][1]["valid"] is False

    host.send_json({"type": "repair"})
    st = recv_until(host, "state", lambda m: all(b["valid"] for b in m["chain"]))
    assert st["chain"][1]["data"] == "robé las monedas"

    host.send_json({"type": "repair"})
    assert recv_until(host, "error")["code"] == "chain_already_valid"


def test_tamper_rejected_for_validators_and_bad_input(room_client):
    _, _, host, vals = setup_room(room_client)
    ws = vals[0][0]
    ws.send_json({"type": "tamper", "index": 0, "data": "x"})
    assert recv_until(ws, "error")["code"] == "host_only_tamper"
    ws.send_json({"type": "repair"})
    assert recv_until(ws, "error")["code"] == "host_only_repair"

    host.send_json({"type": "tamper", "index": 5, "data": "x"})
    err = recv_until(host, "error")
    assert err["code"] == "no_such_block" and err["params"] == {"index": 5}
    host.send_json({"type": "tamper", "index": "0", "data": "x"})
    assert recv_until(host, "error")["code"] == "tamper_bad_args"
    host.send_json({"type": "tamper", "index": True, "data": "x"})
    assert recv_until(host, "error")["code"] == "tamper_bad_args"


# ---------------- Modo de elección local, closing window (Fase L2) ----------------
from app import quantum  # noqa: E402


def local_round(contenders, bits, outcome, n=3):
    intents = [q for q, b in zip(contenders, bits) if b == 1]
    return quantum.LocalRound(
        contenders=contenders, m=len(contenders), bits=bits, intents=intents,
        outcome=outcome, acks=n - 1 if outcome == "leader" else 0, quorum=n - 1,
    )


def set_local(host):
    host.send_json({"type": "set_election", "mode": "local"})
    recv_until(host, "state", lambda m: m["election_mode"] == "local")


def test_set_election_updates_state_and_defaults_to_global(room_client):
    _, _, host, _ = setup_room(room_client)
    host.send_json({"type": "toggle_noise", "on": False})
    assert recv_until(host, "state")["election_mode"] == "global"
    host.send_json({"type": "set_election", "mode": "local"})
    assert recv_until(host, "state", lambda m: m["election_mode"] == "local")
    host.send_json({"type": "set_election", "mode": "global"})
    assert recv_until(host, "state", lambda m: m["election_mode"] == "global")


def test_set_election_rejected_for_validator_bad_mode_and_outside_lobby(room_client):
    _, _, host, vals = setup_room(room_client)
    ws = vals[0][0]
    ws.send_json({"type": "set_election", "mode": "local"})
    assert recv_until(ws, "error")["code"] == "host_only_election"

    host.send_json({"type": "set_election", "mode": "cuantico"})
    assert recv_until(host, "error")["code"] == "election_bad_mode"
    host.send_json({"type": "set_election", "mode": 3})
    assert recv_until(host, "error")["code"] == "election_bad_mode"

    start_round(host, vals)  # ya no estamos en LOBBY
    host.send_json({"type": "set_election", "mode": "local"})
    assert recv_until(host, "error")["code"] == "election_lobby_only"


def test_local_rounds_are_revealed_one_at_a_time(room_client, monkeypatch):
    canned = quantum.LocalWResult(
        leader_qubit=2,
        rounds=[
            local_round([0, 1, 2], [1, 0, 1], "collision"),
            local_round([0, 2], [0, 0], "silence"),
            local_round([0, 2], [0, 1], "leader"),
        ],
    )
    monkeypatch.setattr(quantum, "elect_leader_local", lambda n, noise=False, **kw: canned)
    _, _, host, vals = setup_room(room_client, local_round_delay=0)
    set_local(host)
    host.send_json({"type": "new_block"})

    seen = []
    while True:
        m = host.receive_json()
        if m["type"] == "state" and m["last_w"] and m["last_w"]["mode"] == "local":
            seen.append(m["last_w"])
        if m["type"] == "w_result":
            break
    assert [len(w["rounds"]) for w in seen] == [1, 2, 3]
    assert [w["done"] for w in seen] == [False, False, True]
    assert [w["leader_qubit"] for w in seen] == [None, None, 2]
    assert all(w["total_rounds"] == 3 for w in seen)
    assert [r["outcome"] for r in seen[-1]["rounds"]] == ["collision", "silence", "leader"]

    caro_id = vals[2][1]["id"]
    assert m["mode"] == "local" and m["leader_id"] == caro_id and len(m["rounds"]) == 3
    st = recv_until(host, "state", lambda s: s["phase"] == "PROPOSING")
    assert st["leader_id"] == caro_id
    assert recv_until(vals[2][0], "you", lambda y: y["is_leader"])["id"] == caro_id


def test_full_local_round_with_real_engine(room_client):
    _, _, host, vals = setup_room(room_client, local_round_delay=0)
    set_local(host)
    leader, _, leader_id = start_round(host, vals)
    leader.send_json({"type": "propose", "data": "elegido en local"})
    recv_until(host, "state", lambda m: m["phase"] == "VOTING")
    for ws, _ in vals:
        ws.send_json({"type": "vote", "yes": True})
    st = recv_until(host, "state", lambda m: m["phase"] == "RESULT")

    w = st["last_w"]
    assert w["mode"] == "local" and w["done"] is True
    assert w["total_rounds"] == len(w["rounds"])
    last = w["rounds"][-1]
    assert last["outcome"] == "leader" and len(last["intents"]) == 1
    assert last["acks"] == last["quorum"] == len(vals) - 1
    assert w["leader_qubit"] == last["intents"][0]
    assert st["validators"][w["leader_qubit"]]["id"] == leader_id
    assert st["chain"][-1]["data"] == "elegido en local"


def test_local_election_without_leader_returns_to_lobby(room_client, monkeypatch):
    canned = quantum.LocalWResult(
        leader_qubit=None, rounds=[local_round([0, 1, 2], [0, 0, 0], "silence")]
    )
    monkeypatch.setattr(quantum, "elect_leader_local", lambda n, noise=False, **kw: canned)
    _, _, host, _ = setup_room(room_client, local_round_delay=0)
    set_local(host)
    host.send_json({"type": "new_block"})
    assert recv_until(host, "error")["code"] == "no_unique_leader"
    st = recv_until(host, "state", lambda m: m["phase"] == "LOBBY" and m["last_w"] is not None)
    assert st["leader_id"] is None and st["election_mode"] == "local"


def test_global_mode_reports_mode_in_last_w_and_w_result(room_client):
    _, _, host, vals = setup_room(room_client)
    host.send_json({"type": "new_block"})
    w = recv_until(host, "w_result")
    assert w["mode"] == "global" and "attempts" in w
    st = recv_until(host, "state", lambda m: m["phase"] == "PROPOSING")
    assert st["last_w"]["mode"] == "global" and st["last_w"]["attempts"]


def test_every_error_code_has_an_english_message():
    from app.room import ERRORS, error_msg

    for code, tpl in ERRORS.items():
        assert tpl and tpl.isascii(), code
    m = error_msg("room_full", max=12)
    assert m == {"type": "error", "code": "room_full", "params": {"max": 12},
                 "message": "The room is full (12 validators)"}
