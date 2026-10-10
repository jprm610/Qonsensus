"""Circuitos W (elección de líder) y GHZ (votación por fase) sobre Qiskit Aer.

Portado de qollab/main.js. Las funciones son síncronas; room.py las llama con
asyncio.to_thread.
"""
from __future__ import annotations

import math
from dataclasses import dataclass

from qiskit import QuantumCircuit, transpile
from qiskit_aer import AerSimulator

MAX_VALIDATORS = 12
MIN_VALIDATORS = 2
GHZ_SHOTS = 2000
W_BATCH = 32  # shots por lote de W; se consumen en orden (memory=True)


@dataclass
class WResult:
    leader_qubit: int | None  # None si se agotaron los intentos
    attempts: list[str]  # bitstrings por qubit, orden q0..qn-1 (NO little-endian)


@dataclass
class GHZResult:
    p_even: float
    k_hat: int
    theta: float  # π/n
    theta_total: float  # acos(clamp(2p-1)) en rad
    even: int
    odd: int
    shots: int


_simulators: dict[bool, AerSimulator] = {}


def noise_model():
    """Modelo de ruido de Aer. Se implementa en la Fase 7."""
    raise NotImplementedError("El modelo de ruido llega en la Fase 7")


def _simulator(noise: bool) -> AerSimulator:
    if noise not in _simulators:
        if noise:
            _simulators[noise] = AerSimulator(noise_model=noise_model())
        else:
            _simulators[noise] = AerSimulator()
    return _simulators[noise]


def _check_n(n: int) -> None:
    if not MIN_VALIDATORS <= n <= MAX_VALIDATORS:
        raise ValueError(
            f"n debe estar entre {MIN_VALIDATORS} y {MAX_VALIDATORS}, recibido {n}"
        )


def w_circuit(n: int) -> QuantumCircuit:
    """|W_n>: amplitud 1/sqrt(n) en cada qubit (escalera cry + cx)."""
    _check_n(n)
    qc = QuantumCircuit(n, n)
    qc.x(0)
    for k in range(n - 1):  # hasta n-2: el Algoritmo 1 del paper se sale del registro
        qc.cry(2 * math.acos(math.sqrt(1 / (n - k))), k, k + 1)
        qc.cx(k + 1, k)
    qc.measure(range(n), range(n))
    return qc


def ghz_circuit(n: int, yes_qubits: list[int]) -> QuantumCircuit:
    """|GHZ_n> donde cada votante "sí" aplica fase θ=π/n a SU propio qubit."""
    _check_n(n)
    yes = set(yes_qubits)
    if len(yes) != len(yes_qubits) or any(not 0 <= q < n for q in yes):
        raise ValueError(f"yes_qubits inválidos para n={n}: {yes_qubits}")
    theta = math.pi / n
    qc = QuantumCircuit(n, n)
    qc.h(0)
    for i in range(1, n):
        qc.cx(0, i)
    for q in sorted(yes):
        qc.p(theta, q)
    for i in range(n):
        qc.h(i)
    qc.measure(range(n), range(n))
    return qc


def elect_leader(n: int, noise: bool = False, max_attempts: int = 50) -> WResult:
    """Mide |W_n> hasta obtener exactamente un 1; registra cada intento."""
    sim = _simulator(noise)
    qc = transpile(w_circuit(n), sim)
    attempts: list[str] = []
    while len(attempts) < max_attempts:
        batch = sim.run(qc, shots=W_BATCH, memory=True).result().get_memory()
        for raw in batch:
            s = raw.replace(" ", "")[::-1]  # Qiskit: qubit i es s[-1-i] -> q0..qn-1
            attempts.append(s)
            if s.count("1") == 1:
                return WResult(leader_qubit=s.index("1"), attempts=attempts)
            if len(attempts) >= max_attempts:
                break
    return WResult(leader_qubit=None, attempts=attempts)


def count_votes(
    n: int, yes_qubits: list[int], noise: bool = False, shots: int = GHZ_SHOTS
) -> GHZResult:
    """Estima el número de votos sí a partir de la paridad del GHZ."""
    sim = _simulator(noise)
    qc = transpile(ghz_circuit(n, yes_qubits), sim)
    counts = sim.run(qc, shots=shots).result().get_counts()
    even = sum(c for s, c in counts.items() if s.replace(" ", "").count("1") % 2 == 0)
    odd = shots - even
    p_even = even / shots
    theta = math.pi / n
    theta_total = math.acos(max(-1.0, min(1.0, 2 * p_even - 1)))
    return GHZResult(
        p_even=p_even,
        k_hat=round(theta_total / theta),
        theta=theta,
        theta_total=theta_total,
        even=even,
        odd=odd,
        shots=shots,
    )
