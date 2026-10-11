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


# ---------------- W local, closing window (Fase L1) ----------------
from app.quantum import (  # noqa: E402
    ACK_LOSS_TOLERANCE,
    elect_leader_local,
    local_w_bits,
)


def check_trace(n, res):
    """Invariantes de una traza de closing window."""
    assert res.rounds[0].contenders == list(range(n))
    for i, r in enumerate(res.rounds):
        assert r.m == len(r.contenders) == len(r.bits)
        assert r.contenders == sorted(r.contenders)
        assert r.intents == [q for q, b in zip(r.contenders, r.bits) if b == 1]
        assert r.quorum == n - 1 - ACK_LOSS_TOLERANCE
        last = i == len(res.rounds) - 1
        if r.outcome == "leader":
            assert last and len(r.intents) == 1 and r.acks == r.quorum == n - 1
        else:
            assert not last and r.acks == 0
            nxt = res.rounds[i + 1].contenders
            if r.outcome == "collision":
                assert len(r.intents) >= 2 and nxt == r.intents
            else:
                assert r.intents == [] and nxt == r.contenders
    assert res.rounds[-1].outcome == "leader"
    assert res.leader_qubit == res.rounds[-1].intents[0]


def test_local_w_bits_shape_and_single_copy():
    for m in (1, 2, 5, 12):
        bits = local_w_bits(m)
        assert len(bits) == m and set(bits) <= {0, 1}
    assert all(local_w_bits(1) == [1] for _ in range(20))  # |W_1> = |1>


def test_local_w_bits_frequency_is_one_over_m():
    m, trials = 4, 400
    ones = [0] * m
    for _ in range(trials):
        for j, b in enumerate(local_w_bits(m)):
            ones[j] += b
    for j in range(m):
        assert abs(ones[j] / trials - 1 / m) < 0.07, f"pos {j}: {ones[j] / trials:.3f}"


@pytest.mark.parametrize("n", [2, 3, 6, 12])
def test_elect_leader_local_trace_invariants(n):
    for _ in range(10):
        check_trace(n, elect_leader_local(n))


def test_elect_leader_local_mean_rounds_close_to_paper():
    n, trials = 10, 200
    mean = sum(len(elect_leader_local(n).rounds) for _ in range(trials)) / trials
    assert 2.0 <= mean <= 2.8, f"rondas medias {mean:.2f} (paper: 2.365)"


def test_elect_leader_local_is_fair():
    n, trials = 4, 300
    freq = Counter(elect_leader_local(n).leader_qubit for _ in range(trials))
    for q in range(n):
        assert abs(freq[q] / trials - 1 / n) < 0.09, f"q{q}: {freq[q] / trials:.3f}"


@pytest.mark.parametrize("n", [3, 8])
def test_elect_leader_local_with_noise_terminates(n):
    for _ in range(5):
        check_trace(n, elect_leader_local(n, noise=True))


@pytest.mark.parametrize("n", [0, 1, 13, 50])
def test_elect_leader_local_n_out_of_limits(n):
    with pytest.raises(ValueError):
        elect_leader_local(n)
