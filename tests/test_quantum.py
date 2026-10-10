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
