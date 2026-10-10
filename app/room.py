"""Sala única: validadores conectados, máquina de estados de la ronda y broadcast.

LOBBY -> ELECTING -> PROPOSING -> VOTING -> RESULT -> LOBBY  (ver PLAN.md §5)

Todo cambio de estado ocurre con `self.lock` tomado. Los circuitos cuánticos se
ejecutan con asyncio.to_thread para no bloquear el event loop.
"""
from __future__ import annotations

import asyncio
import time
import uuid
from dataclasses import asdict, dataclass
from enum import Enum
from functools import lru_cache
from typing import Any, Awaitable, Callable

from fastapi import WebSocket

from app import quantum
from app.chain import Chain, quorum

MAX_NAME = 24
MAX_PROPOSAL = 280
SEND_TIMEOUT = 2.0


class Phase(str, Enum):
    LOBBY = "LOBBY"
    ELECTING = "ELECTING"
    PROPOSING = "PROPOSING"
    VOTING = "VOTING"
    RESULT = "RESULT"


ROUND_PHASES = {Phase.ELECTING, Phase.PROPOSING, Phase.VOTING}


@dataclass
class Validator:
    id: str
    token: str
    name: str
    ws: WebSocket | None
    qubit: int
    voted: bool = False
    vote: bool | None = None
    connected: bool = True
    grace_task: asyncio.Task | None = None


class Room:
    def __init__(
        self,
        propose_timeout: float = 60,
        vote_timeout: float = 30,
        grace: float = 15,
    ):
        self.propose_timeout = propose_timeout
        self.vote_timeout = vote_timeout
        self.grace = grace

        self.lock = asyncio.Lock()
        self.validators: dict[str, Validator] = {}  # orden de inserción = qubit
        self.hosts: set[WebSocket] = set()
        self.conns: dict[WebSocket, str | None] = {}  # ws -> validator id (None = host)

        self.phase = Phase.LOBBY
        self.round_ids: list[str] = []  # validadores congelados de la ronda, índice = qubit
        self.leader_id: str | None = None
        self.proposal: str | None = None
        self.chain = Chain()
        self.noise = False
        self.deadline: float | None = None
        self.last_w: dict | None = None
        self.last_ghz: dict | None = None
        self._timer: asyncio.Task | None = None

    # ------------------------------------------------------------------ envío

    async def _send(self, ws: WebSocket | None, msg: dict) -> None:
        if ws is None:
            return
        try:
            await asyncio.wait_for(ws.send_json(msg), SEND_TIMEOUT)
        except Exception:
            pass  # un cliente caído no debe tumbar el broadcast

    async def _error(self, ws: WebSocket, message: str) -> None:
        await self._send(ws, {"type": "error", "message": message})

    def _all_sockets(self) -> list[WebSocket]:
        socks = [v.ws for v in self.validators.values() if v.ws is not None]
        return socks + list(self.hosts)

    async def _broadcast(self, msg: dict) -> None:
        await asyncio.gather(*(self._send(ws, msg) for ws in self._all_sockets()))

    def _state(self) -> dict:
        n = len(self.round_ids) if self.round_ids else len(self.validators)
        return {
            "type": "state",
            "phase": self.phase.value,
            "validators": [
                {
                    "id": v.id,
                    "name": v.name,
                    "qubit": v.qubit,
                    "voted": v.voted,
                    "connected": v.connected,
                }
                for v in self.validators.values()
            ],
            "leader_id": self.leader_id,
            "proposal": self.proposal,
            "chain": self.chain.to_list(),
            "noise": self.noise,
            "noise_available": _noise_available(),
            "deadline": self.deadline,
            "now": time.time(),  # para que el cliente corrija el desfase de su reloj
            "last_w": self.last_w,
            "last_ghz": self.last_ghz,
            "quorum": quorum(n),
        }

    async def _broadcast_state(self) -> None:
        await self._broadcast(self._state())

    async def _send_you(self, v: Validator) -> None:
        await self._send(
            v.ws,
            {
                "type": "you",
                "id": v.id,
                "token": v.token,
                "qubit": v.qubit,
                "is_leader": v.id == self.leader_id,
            },
        )

    # ---------------------------------------------------------------- timers

    def _cancel_timer(self) -> None:
        if self._timer is not None and self._timer is not asyncio.current_task():
            self._timer.cancel()
        self._timer = None
        self.deadline = None

    def _start_timer(self, seconds: float, callback: Callable[[], Awaitable[None]]) -> None:
        self._cancel_timer()
        self.deadline = time.time() + seconds
        self._timer = asyncio.create_task(self._run_timer(seconds, callback))

    async def _run_timer(self, seconds: float, callback: Callable[[], Awaitable[None]]) -> None:
        await asyncio.sleep(seconds)
        async with self.lock:
            if self._timer is not asyncio.current_task():
                return  # timer obsoleto
            self._timer = None
            self.deadline = None
            await callback()

    # ------------------------------------------------------------ conexiones

    async def handle(self, ws: WebSocket, msg: Any) -> None:
        if not isinstance(msg, dict) or not isinstance(msg.get("type"), str):
            await self._error(ws, "Mensaje inválido")
            return
        handler = self._handlers().get(msg["type"])
        if handler is None:
            await self._error(ws, f"Tipo de mensaje desconocido: {msg['type']}")
            return
        async with self.lock:
            await handler(ws, msg)

    def _handlers(self) -> dict[str, Callable[[WebSocket, dict], Awaitable[None]]]:
        return {
            "join": self._on_join,
            "join_host": self._on_join_host,
            "new_block": self._on_new_block,
            "propose": self._on_propose,
            "vote": self._on_vote,
            "toggle_noise": self._on_toggle_noise,
            "next": self._on_next,
        }

    async def disconnect(self, ws: WebSocket) -> None:
        async with self.lock:
            if ws not in self.conns:
                return
            vid = self.conns.pop(ws)
            if vid is None:
                self.hosts.discard(ws)
                return
            v = self.validators.get(vid)
            if v is None or v.ws is not ws:
                return  # ya se reconectó con otro socket
            v.ws = None
            v.connected = False
            v.grace_task = asyncio.create_task(self._grace_expire(vid))
            await self._broadcast_state()

    async def _grace_expire(self, vid: str) -> None:
        await asyncio.sleep(self.grace)
        async with self.lock:
            v = self.validators.get(vid)
            if v is None or v.connected or v.grace_task is not asyncio.current_task():
                return
            v.grace_task = None
            if self.phase in ROUND_PHASES and vid in self.round_ids:
                await self._reset_to_lobby()
                await self._broadcast(
                    {"type": "error", "message": f"Ronda cancelada: {v.name} se desconectó"}
                )
            del self.validators[vid]
            await self._reassign_qubits()
            await self._broadcast_state()

    async def _reassign_qubits(self) -> None:
        for i, v in enumerate(self.validators.values()):
            if v.qubit != i:
                v.qubit = i
                await self._send_you(v)

    def _role(self, ws: WebSocket) -> tuple[bool, Validator | None]:
        """(es_host, validador) del socket."""
        if ws not in self.conns:
            return False, None
        vid = self.conns[ws]
        if vid is None:
            return True, None
        return False, self.validators.get(vid)

    # --------------------------------------------------------------- handlers

    async def _on_join(self, ws: WebSocket, msg: dict) -> None:
        if ws in self.conns:
            await self._error(ws, "Ya estás registrado en esta conexión")
            return

        token = msg.get("token")
        if isinstance(token, str):
            v = next((x for x in self.validators.values() if x.token == token), None)
            if v is not None:  # reconexión
                if v.ws is not None and v.ws is not ws:
                    self.conns.pop(v.ws, None)  # pestaña vieja: queda huérfana
                v.ws = ws
                v.connected = True
                if v.grace_task is not None:
                    v.grace_task.cancel()
                    v.grace_task = None
                self.conns[ws] = v.id
                await self._send_you(v)
                await self._broadcast_state()
                return

        if self.phase != Phase.LOBBY:
            await self._error(ws, "Hay una ronda en curso; podrás unirte cuando termine")
            return
        if len(self.validators) >= quantum.MAX_VALIDATORS:
            await self._error(ws, f"La sala está llena ({quantum.MAX_VALIDATORS} validadores)")
            return

        v = Validator(
            id=uuid.uuid4().hex[:8],
            token=uuid.uuid4().hex,
            name=self._unique_name(msg.get("name")),
            ws=ws,
            qubit=len(self.validators),
        )
        self.validators[v.id] = v
        self.conns[ws] = v.id
        await self._send_you(v)
        await self._broadcast_state()

    def _unique_name(self, raw: Any) -> str:
        base = (str(raw).strip() if raw is not None else "")[:MAX_NAME] or "Validador"
        taken = {v.name.lower() for v in self.validators.values()}
        name, i = base, 2
        while name.lower() in taken:
            suffix = f" {i}"
            name = base[: MAX_NAME - len(suffix)] + suffix
            i += 1
        return name

    async def _on_join_host(self, ws: WebSocket, msg: dict) -> None:
        if ws in self.conns and self.conns[ws] is not None:
            await self._error(ws, "Esta conexión ya es un validador")
            return
        self.conns[ws] = None
        self.hosts.add(ws)
        await self._send(ws, self._state())

    async def _on_new_block(self, ws: WebSocket, msg: dict) -> None:
        is_host, _ = self._role(ws)
        if not is_host:
            await self._error(ws, "Solo el anfitrión puede iniciar un bloque")
            return
        if self.phase != Phase.LOBBY:
            await self._error(ws, "Ya hay una ronda en curso")
            return
        if len(self.validators) < quantum.MIN_VALIDATORS:
            await self._error(ws, f"Se necesitan al menos {quantum.MIN_VALIDATORS} validadores")
            return
        offline = [v.name for v in self.validators.values() if not v.connected]
        if offline:
            await self._error(ws, f"Esperando a que se reconecte: {', '.join(offline)}")
            return

        self.round_ids = list(self.validators)
        for v in self.validators.values():
            v.voted, v.vote = False, None
        self.proposal = None
        self.last_w = None
        self.last_ghz = None
        await self._elect()

    async def _elect(self) -> None:
        """ELECTING: corre W y pasa a PROPOSING con el líder medido."""
        self._cancel_timer()
        self.phase = Phase.ELECTING
        self.leader_id = None
        await self._broadcast_state()

        n = len(self.round_ids)
        try:
            res = await asyncio.to_thread(quantum.elect_leader, n, self.noise)
        except Exception as exc:  # p. ej. ruido no disponible
            await self._reset_to_lobby()
            await self._broadcast({"type": "error", "message": f"Fallo en la elección W: {exc}"})
            await self._broadcast_state()
            return

        self.last_w = asdict(res)
        if res.leader_qubit is None:
            await self._reset_to_lobby()
            await self._broadcast(
                {"type": "error", "message": "No se obtuvo un líder único tras varios intentos"}
            )
            await self._broadcast_state()
            return

        self.leader_id = self.round_ids[res.leader_qubit]
        await self._broadcast(
            {"type": "w_result", "attempts": res.attempts, "leader_id": self.leader_id}
        )
        self.phase = Phase.PROPOSING
        self._start_timer(self.propose_timeout, self._on_propose_timeout)
        for vid in self.round_ids:
            await self._send_you(self.validators[vid])
        await self._broadcast_state()

    async def _on_propose_timeout(self) -> None:
        if self.phase == Phase.PROPOSING:
            await self._elect()

    async def _on_propose(self, ws: WebSocket, msg: dict) -> None:
        _, v = self._role(ws)
        if v is None:
            await self._error(ws, "Solo un validador puede proponer")
            return
        if self.phase != Phase.PROPOSING:
            await self._error(ws, "No es momento de proponer")
            return
        if v.id != self.leader_id:
            await self._error(ws, "Solo el líder puede proponer el bloque")
            return
        data = msg.get("data")
        self.proposal = (str(data).strip() if data is not None else "")[:MAX_PROPOSAL] or "(vacío)"
        self.phase = Phase.VOTING
        self._start_timer(self.vote_timeout, self._finish_round)
        await self._broadcast_state()

    async def _on_vote(self, ws: WebSocket, msg: dict) -> None:
        _, v = self._role(ws)
        if v is None:
            await self._error(ws, "Solo un validador puede votar")
            return
        if self.phase != Phase.VOTING:
            await self._error(ws, "No hay votación abierta")
            return
        if v.id not in self.round_ids:
            await self._error(ws, "No participas en esta ronda")
            return
        if v.voted:
            await self._error(ws, "Ya votaste")
            return
        v.voted = True
        v.vote = bool(msg.get("yes"))

        round_vals = [self.validators[vid] for vid in self.round_ids]
        if all(x.voted for x in round_vals if x.connected):
            await self._finish_round()
        else:
            await self._broadcast_state()

    async def _finish_round(self) -> None:
        """RESULT: corre GHZ con los votos (los que no votaron cuentan como No)."""
        if self.phase != Phase.VOTING:
            return
        self._cancel_timer()
        n = len(self.round_ids)
        yes_qubits = [i for i, vid in enumerate(self.round_ids) if self.validators[vid].vote]
        try:
            res = await asyncio.to_thread(quantum.count_votes, n, yes_qubits, self.noise)
        except Exception as exc:
            await self._reset_to_lobby()
            await self._broadcast({"type": "error", "message": f"Fallo en la votación GHZ: {exc}"})
            await self._broadcast_state()
            return

        q = quorum(n)
        accepted = res.k_hat >= q
        if accepted:
            leader = self.validators[self.leader_id]
            self.chain.add(
                leader=leader.name,
                data=self.proposal or "(vacío)",
                yes_estimated=res.k_hat,
                n_validators=n,
                evidence={
                    "w_attempts": (self.last_w or {}).get("attempts", []),
                    "p_even": res.p_even,
                    "theta_total": res.theta_total,
                },
            )
        self.last_ghz = {**asdict(res), "quorum": q, "accepted": accepted}
        self.phase = Phase.RESULT

        public = {
            "type": "ghz_result",
            "p_even": res.p_even,
            "k_hat": res.k_hat,
            "theta_total": res.theta_total,
            "quorum": q,
            "accepted": accepted,
        }
        host_msg = {**public, "yes_real": len(yes_qubits)}
        await asyncio.gather(
            *(self._send(v.ws, public) for v in self.validators.values()),
            *(self._send(h, host_msg) for h in self.hosts),
        )
        await self._broadcast_state()

    async def _on_next(self, ws: WebSocket, msg: dict) -> None:
        is_host, _ = self._role(ws)
        if not is_host:
            await self._error(ws, "Solo el anfitrión puede avanzar")
            return
        if self.phase != Phase.RESULT:
            await self._error(ws, "La ronda aún no ha terminado")
            return
        await self._reset_to_lobby()
        await self._broadcast_state()

    async def _on_toggle_noise(self, ws: WebSocket, msg: dict) -> None:
        is_host, _ = self._role(ws)
        if not is_host:
            await self._error(ws, "Solo el anfitrión puede cambiar el ruido")
            return
        on = bool(msg.get("on"))
        if on and not _noise_available():
            await self._error(ws, "El modelo de ruido aún no está disponible")
            return
        self.noise = on
        await self._broadcast_state()

    async def _reset_to_lobby(self) -> None:
        self._cancel_timer()
        self.phase = Phase.LOBBY
        self.round_ids = []
        self.leader_id = None
        self.proposal = None
        for v in self.validators.values():
            v.voted, v.vote = False, None
        for v in self.validators.values():
            await self._send_you(v)  # is_leader vuelve a False


@lru_cache(maxsize=1)
def _noise_available() -> bool:
    try:
        quantum.noise_model()
        return True
    except NotImplementedError:
        return False
