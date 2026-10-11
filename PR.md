# Local W-state leader election with closing window variant

## Summary

Extended **Entangled Consensus** with a **local W-state leader election mode** based on *W-State Leader Election for PBFT Based Quantum Leader Election* (Robledo, Mišić, Mišić). The host can now select between:

- **Global ideal** (original): one shared |Wₙ⟩ measured once per round
- **Local · closing window** (new): each validator runs a local copy of |W_m⟩, detects collisions with an INTENT/ACK handshake, and closes the window to contenders. Expected convergence: ~2.37 rounds with n=10.

Both modes use the same GHZ voting and blockchain logic. The demo shows all handshake rounds and collisions as they resolve in real time.

## Phases and models (branches with linked phase commits)

| Phase | Scope | Model | Commit |
|---|---|---|---|
| L0 | Documentation and plan | Haiku 4.5 | `2c860f4` |
| L1 | Quantum motor: `local_w_bits` and `elect_leader_local` | Sonnet 5.5 | `9aeb96a` |
| L2 | Server: mode selection, round-by-round revelation | Sonnet 5.5 | `07c62d7` |
| L3 | Host: selector and closing-window handshake view | Sonnet 5.5 | `a0ae401` |
| L4 | Validator: local rounds, INTENT/ACK status per round | Sonnet 5.5 | `538dda1` |
| L5 | READMEs (en/es) and PR documentation | Haiku 4.5 | this PR |

## What's new

### Backend (app/quantum.py)

- `LocalRound` and `LocalWResult` dataclasses encode each ronda's contenders, bits, intents, and outcome
- `local_w_bits(m)`: m independent |W_m⟩ copies, one shot per contender → their qubit index
- `elect_leader_local(n)`: Closing Window algorithm; expected ~2.37 rounds with n=10, 95% finish in ≤5 rounds
- `@lru_cache` on compiled circuits: rounds drop from ~170 ms to ~2 ms each

### Server (app/room.py)

- `Room.election_mode`: "global" (default) or "local"
- `set_election` message: host-only, LOBBY-only
- `_elect` ramifies by mode; local reveals one round per `state` with 1.5 s delay (0 in tests)
- `state.last_w.mode`, `w_result.mode`, and structured round data

### Host UI (static/host.html, static/host.js)

- Segmented selector "Global ideal" / "Local · closing window" in header (LOBBY-only)
- `renderWLocal`: per-round rows with contender chips, INTENT/ACK color coding, collision/silence/COMMIT logic
- Validator tags: "CONTENDIENTE" or "FUERA · escucha" during ELECTING local
- Glossary: INTENT = "quiero liderar", ACK = "te reconozco", Q = quorum, ventana = contenders

### Validator UI (static/app.js)

- `renderLocalMeasure`: per-round summary (my bit, my position in window, INTENT sent/listened, outcome)
- Collision details: who I collided with, which qubits closed the window, whether I stay or drop out
- `circuitSpec` for local: |W_m⟩ of the round, line resalted = my position in window (not global qubit)
- If m=1: aviso in place of circuit

### Documentation (README.md, README.es.md)

- New "Leader election modes" section: global vs. local, handshake, E[T] ≈ 2.37 with n=10
- AI usage table: L0–L5 phases and model breakdown
- Links to [`docs/LOCAL_W.md`](docs/LOCAL_W.md) for protocol and phase details

## Testing

- **Quantum**: `local_w_bits` uniformity, collision detection, fairness (each qubit → leader ≈ 1/n), mean rounds [2.0, 2.8]
- **Server**: 6 new WS tests (set_election, mode switches, round revelation, no spurious leader)
- **Host E2E**: Chrome headless with fixed trace n=6: colisión, silencio, colisión, COMMIT. Fits 1920×1080.
- **Validator E2E**: 4 emulated phones n=4, rounds follow INTENT/ACK/COMMIT correctly. No horizontal scroll at 390 px.
- **Full suite**: 90 tests passing; 5 sequential runs of test_ws without intermittent failures

## Backward compatibility

- Global mode is the default and behaves exactly as before
- All existing tests pass unchanged
- No changes to chain, quorum, or GHZ voting

## Known limitations / future work

- Noise in local mode: contenders with m=1 may measure 0 and timeout; lower `P_1Q`/`P_2Q`/`P_READOUT` if needed
- ACK_LOSS_TOLERANCE is hardcoded to 0 (perfect network); extending to t>0 requires quorum adjustment
- Fixed-window and adaptive-window variants from the paper are not implemented

🤖 Generated with [Claude Code](https://claude.com/claude-code)
