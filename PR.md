# Local W-state leader election (closing window), selectable from the host

**Branch:** `feature/LocalWState` → `main`

## Summary

Adds a second leader-election mode based on *W-State Leader Election for PBFT Based Quantum Leader Election* (Robledo, Mišić, Mišić), and lets the host pick it in the waiting room:

| Mode | How the leader is elected |
|---|---|
| **Global ideal** (default, unchanged) | One |Wₙ⟩ shared by all validators, measured once: exactly one qubit is 1. |
| **Local · closing window** (new) | Each contender measures its own copy of |W_m⟩. Collisions are resolved with an INTENT/ACK handshake and the window closes to the tied contenders until a single one remains. |

In local mode the server reveals one round every 1.5 s, so the room watches the handshake live: the big screen shows every round and its outcome, and each phone shows its own bit and role.

## The protocol (paper §III-B and §VI)

Round r with contender set C (initially all n validators) and m = |C|:

1. Each contender measures its assigned qubit of its own |W_m⟩, so its bit is 1 with probability 1/m, independently of the others.
2. Whoever measures 1 sends **INTENT**.
3. Exactly one INTENT → the other n − 1 validators send **ACK**; with Q = n − 1 − t ACKs the candidate **COMMITs** and is the leader.
4. Two or more INTENTs (**collision**) → C becomes the tied contenders. No INTENT (**silence**) → C stays the same.

The network is modelled as lossless with honest validators (t = 0, so Q = n − 1). Measured over 3,000 elections with n = 10: **2.33 rounds on average** (paper: 2.365), 95% finish within 5 rounds.

## Changes

**Quantum engine — `app/quantum.py`**
- `LocalRound` / `LocalWResult` dataclasses and `ACK_LOSS_TOLERANCE = 0`.
- `local_w_bits(m, noise)`: one Aer job with `shots=m`; shot j is contender j's copy and contributes its qubit j. Supports m = 1 (|W₁⟩ = |1⟩).
- `elect_leader_local(n, noise, max_rounds=50)`: the closing-window loop above.
- The compiled |W_m⟩ circuit is cached per `(m, noise)`. Without the cache each round cost ~170 ms of transpilation; with it ~2 ms, and a whole election ~14 ms.
- `w_circuit`, `elect_leader` and `count_votes` are unchanged.

**Server — `app/room.py`**
- `Room.election_mode` (`"global"` by default) and `Room(local_round_delay=1.5)`.
- New message `set_election{mode}`: host only, LOBBY only; invalid modes are rejected.
- `state` gains `election_mode`; `state.last_w` and `w_result` gain `mode`. In local mode `last_w` carries `rounds`, `total_rounds` and `done`, and `leader_qubit` is filled in only when `done`.
- Local rounds are revealed one `state` at a time while in ELECTING (lock held, so joins and other messages wait). If `max_rounds` runs out, the round is cancelled back to LOBBY with an error, as in global mode.

**Big screen — `static/host.html`, `static/host.js`, `static/style.css`**
- "Elección del líder" selector next to the noise switch: two radio-style options with a subtitle, the active one in orange; locked outside LOBBY.
- Local election panel: one row per round with a chip per contender (`q3:1`, INTENTs highlighted) and the outcome, e.g. "colisión: 2 INTENT → la ventana se cierra a {q3, q4}" or "1 INTENT → ACK 5/5 ≥ Q = 5 → COMMIT: líder Eli (q4)". The list scrolls to the latest round so the page still fits 1920×1080.
- Validator cards show CONTENDIENTE or FUERA · escucha during a local election.
- The circuit dialog shows the |W_m⟩ of the last round.

**Phones — `static/app.js`**
- Per round: their bit and position in the window, whether they sent INTENT or listened, and the outcome from their point of view (who they collided with, that they dropped out, that they receive or send ACKs).
- The live circuit is the |W_m⟩ of the current round with **their position in the window** highlighted (not their global qubit); no highlight once they are out, and a note instead of a circuit when m = 1.
- Global mode looks exactly as before.

**Static asset versioning — `static/host.html`, `static/index.html`**
- CSS and JS are now loaded with `?v=lw1`. On Render the browser mixed the new `host.html` with a cached old `style.css`, so the selector rendered as unstyled buttons. Bump the version whenever CSS or JS change.

**Docs**
- `docs/LOCAL_W.md`: protocol, contracts and phase plan (Spanish).
- `README.md` / `README.es.md`: new "Leader election modes" section, test count (70 → 90), and the AI-usage row for this extension.

## How it was tested

- `pytest -q`: **90 passed** (20 new).
  - Quantum (14): bit shape and m = 1, per-position frequency ≈ 1/m, trace invariants for n = 2, 3, 6, 12, mean rounds for n = 10 within [2.0, 2.8], fairness across leaders, termination with noise, invalid n.
  - WebSocket (6): `set_election` permissions, mode, and phase checks; rounds revealed one at a time with growing prefixes; a full local round to RESULT with the real engine; no leader → back to LOBBY; global mode reports `mode`.
  - `tests/test_ws.py` run 5 times in a row with no flaky failures.
- Smoke test against real uvicorn with 6 validators: rounds arrive 1.5 s apart (e.g. 3 silences, a collision, then the leader in 6.5 s).
- Headless Chrome E2E:
  - big screen with a fixed 4-round trace (collision, silence, collision, leader): 24 checks, fits 1920×1080;
  - 4 emulated phones with a fixed 4-round trace: 24 checks, no horizontal scroll at 390 px;
  - selector in global, local, and locked states, at 1920 px and 1773 px.

## Not covered yet

- **A local round with real phones on the LAN or on Render.** The E2E tests use fixed traces, so they exercise the UI but not real random collisions across devices.
- With noise, a lone contender (m = 1) can measure 0 and produce "silence" rounds until it measures 1. This is rare and covered by `max_rounds`, but each such round still costs 1.5 s on screen.
- Lossy networks (t > 0) and the paper's other variants (fixed W and others) are out of scope.

## Review notes

- Behaviour in global mode is unchanged; the only protocol change for existing clients is the extra `mode` field in `last_w` and `w_result`.
- `local_round_delay` controls the pacing of the reveal: lower it in `Room(...)` if elections feel slow in the demo.
- This was built phase by phase with Claude Code, one commit per phase (plan in `docs/LOCAL_W.md`):

| Commit | Phase | Model |
|---|---|---|
| `2c860f4` | L0 · plan and checklist | Claude Haiku 4.5 |
| `9aeb96a` | L1 · quantum engine | Claude Sonnet 5.5 |
| `07c62d7` | L2 · server | Claude Sonnet 5.5 |
| `a0ae401` | L3 · big screen | Claude Sonnet 5.5 |
| `538dda1` | L4 · phones | Claude Sonnet 5.5 |
| `393f2e0` | L5 · READMEs | Claude Haiku 4.5 |
| `c6326cb` | Selector redesign and asset versioning | Claude Opus 5.5 |
| *(this commit)* | README corrections and this PR description | Claude Opus 5.5 |

🤖 Generated with [Claude Code](https://claude.com/claude-code)
