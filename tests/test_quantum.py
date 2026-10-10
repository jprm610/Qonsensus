import random
from collections import Counter

import pytest
from qiskit import transpile
from qiskit_aer import AerSimulator

from app.quantum import (
    MAX_VALIDATORS,
    MIN_VALIDATORS,
    count_votes,
    elect_leader,
    ghz_circuit,
    w_circuit,
)


@pytest.mark.parametrize("n", range(2, 9))
def test_w_state_exactly_one_one_and_uniform(n):
    sim = AerSimulator()
    qc = transpile(w_circuit(n), sim)
    shots = 2000
    memory = sim.run(qc, shots=shots, memory=True).result().get_memory()
    freq = Counter()
    for raw in memory:
        s = raw[::-1]  # q0..qn-1
        assert s.count("1") == 1, f"n={n}: bitstring con {s.count('1')} unos: {s}"
        freq[s.index("1")] += 1
    for q in range(n):
        assert abs(freq[q] / shots - 1 / n) < 0.05, f"n={n} q{q}: {freq[q] / shots:.3f}"


@pytest.mark.parametrize("n", range(2, 9))
def test_elect_leader_without_noise_first_attempt(n):
    res = elect_leader(n)
    assert res.leader_qubit is not None and 0 <= res.leader_qubit < n
    assert len(res.attempts) == 1
    assert res.attempts[0].count("1") == 1
    assert res.attempts[0][res.leader_qubit] == "1"


def test_elect_leader_covers_all_validators():
    n = 4
    seen = {elect_leader(n).leader_qubit for _ in range(80)}
    assert seen == set(range(n))


@pytest.mark.parametrize("n", range(2, 11))
def test_ghz_estimates_every_k(n):
    rng = random.Random(n)
    for k in range(n + 1):
        yes = rng.sample(range(n), k)  # qubits arbitrarios, no solo los primeros k
        res = count_votes(n, yes)
        assert res.k_hat == k, f"n={n} k={k} yes={yes} p_even={res.p_even:.3f}"
        assert res.even + res.odd == res.shots


def test_ghz_result_fields():
    res = count_votes(4, [0, 2])
    assert res.shots == 2000
    assert res.theta == pytest.approx(3.141592653589793 / 4)
    assert 0 <= res.theta_total <= 3.1416


@pytest.mark.parametrize("n", [0, 1, MIN_VALIDATORS - 1, MAX_VALIDATORS + 1, 50])
def test_n_out_of_limits(n):
    with pytest.raises(ValueError):
        w_circuit(n)
    with pytest.raises(ValueError):
        ghz_circuit(n, [])
    with pytest.raises(ValueError):
        elect_leader(n)
    with pytest.raises(ValueError):
        count_votes(n, [])


def test_invalid_yes_qubits():
    with pytest.raises(ValueError):
        ghz_circuit(3, [3])
    with pytest.raises(ValueError):
        ghz_circuit(3, [1, 1])


def test_limits_accepted():
    assert elect_leader(MIN_VALIDATORS).leader_qubit is not None
    assert elect_leader(MAX_VALIDATORS).leader_qubit is not None


# ---------------- Ruido (Fase 7) ----------------
def test_noise_model_available():
    from qiskit_aer.noise import NoiseModel

    from app.quantum import noise_model

    assert isinstance(noise_model(), NoiseModel)


def test_w_with_noise_produces_discarded_bitstrings():
    from app import quantum

    n = 6
    sim = quantum._simulator(True)
    qc = quantum._compile(quantum.w_circuit(n), True)
    memory = sim.run(qc, shots=200, memory=True).result().get_memory()
    bad = [s for s in memory if s.count("1") != 1]
    assert bad, "con ruido deberían aparecer bitstrings sin exactamente un 1"
    assert len(bad) < len(memory)  # y también hay intentos válidos


@pytest.mark.parametrize("n", [3, 6, 12])
def test_elect_leader_with_noise_is_consistent(n):
    res = elect_leader(n, noise=True)
    assert res.leader_qubit is not None
    last = res.attempts[-1]
    assert last.count("1") == 1 and last[res.leader_qubit] == "1"
    assert all(a.count("1") != 1 for a in res.attempts[:-1])  # solo se descartan los inválidos


def test_ghz_with_noise_degrades_estimate_but_stays_close():
    n = 6
    rng = random.Random(7)
    # p_even se aleja de la teoría (contraste reducido): k=0 teórico 1.0
    r0 = count_votes(n, [], noise=True)
    assert r0.p_even < 0.95
    # en el centro del rango k_hat se mantiene a ±1 (en los extremos el sesgo es mayor)
    for k in range(1, n):
        res = count_votes(n, rng.sample(range(n), k), noise=True)
        assert abs(res.k_hat - k) <= 1, f"k={k} k_hat={res.k_hat} p_even={res.p_even:.3f}"
