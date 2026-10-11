# Entangled Consensus

**English** · [Español](README.es.md)

A multiplayer blockchain where every phone is a validator: the leader is elected with a **W** state shared across the validators, and each block is approved by counting votes with a phase-encoded **GHZ** state.

> **Live demo:** <https://qonsensus.onrender.com> · big screen at <https://qonsensus.onrender.com/host> (free plan: it takes about a minute to wake up after being idle).
>
> *GIF or screenshot pending:* big screen with the QR code, leader election, voting and the chain.

---

## How it works

Each round has four steps. Every number comes from real measurements of a quantum simulator (Qiskit Aer), not from a classical random number generator.

1. **Leader election (W state).** The server prepares a |Wₙ⟩ with one qubit per connected validator (2 to 12). When it is measured, exactly one qubit comes out as 1: that validator is the leader. If the outcome has no 1s or more than one (only possible with noise), the measurement is repeated and the attempt is logged.
2. **Proposal.** The leader writes the block content (280 characters max). If they don't propose within 60 s, a new leader is elected.
3. **Voting (GHZ state).** A |GHZₙ⟩ is prepared. Each validator who votes **yes** applies a phase θ = π/n to **their own qubit**; the state is then measured over 2000 shots. The parity of the outcomes reveals how many voted yes: P(even) = (1 + cos(k·θ))/2, from which k is estimated. Anyone who doesn't vote within 30 s counts as a no.
4. **Quorum.** If the estimated yes votes reach ⌈2n/3⌉ (a PBFT-style supermajority), the block is appended to the chain with its SHA-256 hash and the previous block's hash. Any later edit breaks the chain from that point on.

The big screen shows the evidence for each round: the W attempts (discarded ones struck through), P(even) from the GHZ, total θ, estimated votes against the quorum, and chain verification.

### On each validator's phone

Besides joining, proposing and voting, every validator sees:

- **Their live circuit.** In the waiting room they see the |W⟩ circuit with their own line highlighted, and it grows as more people join. During voting they see the |GHZ⟩ with their P(π/n) phase if they voted yes; other people's phases are never shown.
- **Their qubit in the W measurement.** The measured outcome with their own bit highlighted: if it measured 1 they are the leader; if it measured 0, they see which qubit came out as 1. Discarded attempts are struck through.
- **The GHZ evidence.** When the round ends: P(even), total θ, the estimated yes votes against the quorum, and the formula that links them.

### Noise (optional)

The "Ruido" (noise) switch on the big screen enables an Aer noise model with 1-qubit depolarizing error (1%), 2-qubit depolarizing error (2%) and readout error (2%). With noise, discarded W rounds appear (from 12% of shots with 3 validators to almost half with 12), and the vote estimate is biased towards the middle: it goes up when there are few yes votes and down when almost everyone votes yes. As a result, the quorum may reject, or accept, a block that the actual vote would not have decided that way.

### Demo mode

The host can **tamper with a block's content** from the big screen: the big screen then shows the chain broken from that block on. The "Reparar" (repair) button recomputes the hashes from the tampered block; it only exists to show that verification detects tampering, it is not a real fix.

The "Circuito" button draws the current W or GHZ circuit.

The user interface is in Spanish.

### Leader election modes

The host picks the mode in the waiting room with the "Elección del líder" selector:

- **Global ideal** (default). A single |Wₙ⟩ is shared across all validators and measured once: exactly one qubit comes out as 1, so the leader is known in one measurement (with noise, invalid outcomes are discarded and the measurement is repeated). It assumes a quantum network able to distribute one entangled state to everyone.
- **Local · closing window.** The variant from *W-State Leader Election for PBFT Based Quantum Leader Election* (Robledo, Mišić, Mišić) that converges fastest. Each contender gets **its own copy** of |W_m⟩, where m is the number of contenders, and measures only its assigned qubit, so several can get 1 at once (collision) or nobody can (silence). Each round:
  1. Whoever measures 1 broadcasts **INTENT** ("I want to lead").
  2. If there is exactly one INTENT, the other n − 1 validators reply with **ACK**; with Q = n − 1 ACKs the candidate does **COMMIT** and becomes the leader.
  3. On a collision the window **closes** to the tied contenders; on silence it is repeated with the same ones.

  The paper gives E[T] ≈ 2.37 rounds for n = 10; this simulation measures 2.33. The network is modelled without losses or faulty validators (t = 0, so Q = n − 1). The server reveals one round every 1.5 s: the big screen shows each round with its INTENTs and its outcome, and each phone shows its own bit, its position in the window and whether it sent INTENT, listened or dropped out.

Both modes share the GHZ voting, the quorum and the chain. The full protocol and the phase plan are in [`docs/LOCAL_W.md`](docs/LOCAL_W.md) (in Spanish).

---

## Relation to the Qollab version

The [`qollab/`](qollab/) folder holds the original version, which runs as a single job on a simulator or on IonQ hardware from the Qollab platform. It uses one job per run: a W register plus one GHZ register for each possible number of votes, and the consensus consumes those real measurements.

This app exists because **Qollab has no API**, so it cannot be called from an application that needs several participants. This app does not call Qollab: the same circuits are simulated on the server with Qiskit Aer, and validators connect from their phones over WebSocket.

---

## Run locally

Requires Python 3.11 or later.

```bash
python -m venv .venv
source .venv/bin/activate        # on Windows: .venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload --host 0.0.0.0
```

- Validators: `http://<your-IP>:8000/` (from a phone on the same network).
- Big screen: `http://localhost:8000/host`. To make the QR code point to your local network IP, use `http://localhost:8000/host?url=http://<your-IP>:8000/`.

With Docker (the same image used for the Render deployment):

```bash
docker build -t entangled-consensus .
docker run -p 8000:8000 entangled-consensus
```

Tests:

```bash
pytest -q
```

There are 90 tests: circuits and vote estimation, local closing-window election, chain and quorum, the WebSocket state machine in both election modes, noise, and the circuit endpoint.

### Layout

```
app/
  main.py      HTTP routes and the /ws WebSocket
  room.py      room, validators, phases and timers
  quantum.py   W and GHZ circuits, noise, execution on Aer
  chain.py     blocks, SHA-256, verification and quorum
static/        validator view (index.html) and big screen (host.html)
tests/         unit and integration tests
qollab/        original Qollab version, for reference
docs/PHASES.md phased implementation plan, with the model assigned to each phase
```

---

## References

- J. P. Robledo, J. Mišić, V. Mišić. *W-State Leader Election for PBFT Based Quantum Leader Election.*
- J. Mišić, V. B. Mišić. *Scalable Quantum Based Solutions for Blockchain Systems* (GHZ-state voting).

## What existed before the hackathon

Before the hackathon window (Oct 9–11, 2026) there was no code: neither this app nor the Qollab version in [`qollab/`](qollab/). Both were written during the hackathon. The theoretical basis is the two papers above.

## Use of AI

The project was built with **Claude Code**, using a different model for each phase to optimize token usage. Each phase's plan and its assigned model are in [`docs/PHASES.md`](docs/PHASES.md) (in Spanish). The models used were:

| Phase | Scope | Model |
|---|---|---|
| 0 | Scaffolding | Claude Haiku 5.5 |
| 1 | Quantum engine | Claude Sonnet 5.5 |
| 2 | Blockchain | Claude Haiku 4.5 |
| 3 | Server and state machine | Claude Opus 5.5 |
| 4 | Validator view | Claude Sonnet 5.5 |
| 5 | Big screen | Claude Sonnet 5.5 |
| 6 | Render deployment | Claude Haiku 5.5 |
| 7 | Noise | Claude Sonnet 5.5 |
| 8 | Block tampering and circuit | Claude Sonnet 5.5 |
| 9 | README | Claude Haiku 5.5 |
| — | Docker deployment, extended validator view (live circuit, W measurement, GHZ evidence) and English README | Claude Opus 5.5 |
| L0–L5 | Local W-state leader election (closing window variant) | Claude Haiku 4.5 (L0, L5), Claude Sonnet 5.5 (L1–L4) and Claude Opus 5.5 (selector fix and review) |

The plan, the direction of the work and the design decisions are a person's; Claude Code wrote the code and the tests. Each phase was verified with automated tests, and the user-interface phases were also tested in a headless browser against the real server.

## Credits

- Qollab × IonQ hackathon (Oct 9–11, 2026) and talk at Bancolombia's Quantum Lab (Oct 19, 2026).
- Author: jprm610.

## License

[MIT](LICENSE).
