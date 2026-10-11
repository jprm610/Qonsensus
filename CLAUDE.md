# Entangled Consensus (multijugador)

App FastAPI + Qiskit Aer + WebSocket. Validadores desde el celular (`/`), pantalla grande en `/host`. Blockchain con líder por estado W y votación por GHZ.

**Antes de nada** sigue la sección "▶ Instrucciones para el modelo que ejecuta una fase" de `docs/PHASES.md`.

## Comandos
- Instalar: `pip install -r requirements.txt`
- Servidor: `uvicorn app.main:app --reload --host 0.0.0.0`
- Tests: `pytest -q`

## Reglas
- No editar `PLAN.md` ni `qollab/`.
- Sin secretos ni claves en el código.
- Un commit por fase, con el mensaje exacto de `docs/PHASES.md`.
- UI en español.

## Checklist de fases
- [x] Fase 0 · Haiku 5.5 · andamiaje
- [x] Fase 1 · Sonnet 5.5 · motor cuántico
- [x] Fase 2 · Haiku 5.5 · blockchain
- [x] Fase 3 · Opus 5.5 · servidor y máquina de estados
- [x] Fase 4 · Sonnet 5.5 · vista validador (móvil)
- [x] Fase 5 · Sonnet 5.5 · vista host (pantalla grande)
- [x] Fase 6 · Haiku 5.5 · despliegue en Render
- [x] Fase 7 · Sonnet 5.5 · ruido (deseable)
- [x] Fase 8 · Sonnet 5.5 · alterar bloque y circuito (deseable)
- [x] Fase 9 · Haiku 5.5 · README y entrega

## Extensión W local (closing window) — docs/LOCAL_W.md
- [x] Fase L0 · Haiku 4.5 · documentación
- [x] Fase L1 · Sonnet 5.5 · motor cuántico
- [x] Fase L2 · Sonnet 5.5 · servidor
- [x] Fase L3 · Sonnet 5.5 · host
- [x] Fase L4 · Sonnet 5.5 · validador
- [ ] Fase L5 · Haiku 4.5 · documentación final

## Notas de handoff
- Fase 1: `attempts` incluye todos los shots consumidos (el último es el válido). `noise_model()` lanza NotImplementedError hasta la Fase 7, así que `noise=True` falla por ahora. Se añadió `pytest.ini` (pythonpath=.) para que `pytest -q` encuentre `app`.
- Fase 2: Implementada sin desviaciones. Se agregaron tests para génesis, add, verify, tamper y to_list. `quorum(n)` devuelve ceil(2n/3).
- Fase 3: contrato de `state` ampliado (`noise_available`, `last_ghz.quorum/accepted`), ver docs/PHASES.md › Protocolo. `Room(propose_timeout, vote_timeout, grace)`; los tests reemplazan `app.main.room`. En tests usar `ws_conn(client)` de `tests/test_ws.py` (tolera la cancelación del TestClient al cerrar) y siempre `with TestClient(...)` para compartir event loop. Para probar contra uvicorn real hay un cliente `websockets` disponible en el venv.
- Fase 4: `state` ahora incluye `now` (hora del servidor) para corregir el desfase de reloj en la cuenta regresiva (`skew = now - Date.now()/1000`); ver docs/PHASES.md. La vista validador guarda `ec.name` y `ec.token` en localStorage y se reconstruye solo al cambiar de pantalla (el textarea del líder no se pierde con cada `state`). Texto de usuario siempre con `textContent` (helper `h()`), nunca `innerHTML`. Clases CSS de la vista móvil al final de `static/style.css` (`.screen`, `.card`, `.btn`, `.conn`, `.toast`); la Fase 5 puede reutilizar las variables `:root`, `.card`, `.mono`, `.okt`, `.errt`, `.hash`.
- Fase 5: `/host` (static/host.html + host.js) usa `state` + `ghz_result` (el `yes_real` solo llega en ese mensaje; no está en `state`). QR con qrcodejs 1.0.0 desde cdnjs (sin internet muestra solo la URL); `?url=` fija la URL del QR y sin él avisa si el origen es localhost. El interruptor de ruido sale deshabilitado mientras `noise_available` sea false o fuera de LOBBY: la Fase 7 solo debe implementar `noise_model()`. `renderChain()` en host.js reconstruye todo `#chain` en cada `state` (la Fase 8 debe evitar re-renderizar mientras un `.bdata` tiene el foco). Falta la prueba manual con un celular real por QR en la LAN (`/host?url=http://<IP-LAN>:8000`, arrancando uvicorn con `--host 0.0.0.0`).
- Fase 6: `render.yaml` (web, plan free, `/health`). Después se cambió a runtime Docker: `Dockerfile` (python:3.11-slim + libgomp1, usuario sin privilegios, escucha en `${PORT:-8000}`) y `.dockerignore` (sin tests, docs ni qollab). La imagen no se pudo construir en local (no hay Docker en esta máquina); la primera construcción real es la de Render. Escaneo de secretos sin hallazgos. Pendiente manual del usuario: repo público en GitHub, `git push`, crear el Blueprint en Render, probar `/host` con 2–3 celulares por wss. El plan free se duerme tras inactividad: abrir la URL unos minutos antes de la demo.
- Fase 7: `noise_model()` implementado (depolarizante 1q 0.01 en x/h/p/ry, 2q 0.02 en cx, lectura 0.02). Con ruido se transpila a `NOISY_BASIS` con `optimization_level=0` (`_compile`) para que toda puerta quede ruidosa. Medido: W descarta ~12% (n=3), ~25% (n=6), ~48% (n=12) de los shots; `elect_leader` converge en pocos intentos. En GHZ el ruido encoge el contraste y sesga k̂ hacia el centro: en n=6 el error es ≤1 para k=1..5 pero llega a 2 en k=0 y k=n (a n=10 hasta 3), por eso el test de ±1 solo cubre el centro. Un bloque con todos "sí" puede salir con k̂ < n; con ruido alto puede incluso quedar bajo el quórum. El interruptor del host solo se habilita en LOBBY. Si en la demo el ruido rechaza demasiados bloques válidos, bajar `P_1Q`/`P_2Q`/`P_READOUT` en quantum.py.
- Fase 8: mensajes `tamper{index,data}` y `repair{}` (solo host) y `GET /circuit?kind=&n=[&yes=]`; ver docs/PHASES.md › Protocolo. `Chain.rehash_from(i)` solo para la demo. En host.js los bloques son `contenteditable`: blur envía `tamper`, Enter confirma, Escape cancela, y `renderChain()` no reconstruye mientras un `.bdata` tiene el foco. El circuito va en un `<dialog>` (no añade alto de página: sigue cabiendo en 1920x1080). Qiskit avisa por stdout cp1252 al dibujar; se silencia con `warnings` en main.py (el dibujo sale en UTF-8 igualmente).
- Fase 9: README completo (secciones de PLAN.md §10 y créditos de §9). Demo desplegada en https://qonsensus.onrender.com (Render, Web Service Docker desde la rama V-1; /health, /host y wss verificados). Pendiente de rellenar por el usuario: GIF o captura (confirmado por el usuario: qollab/ también se escribió durante la hackathon; no había código previo). En la tabla de modelos del README, la Fase 2 figura como Claude Haiku 4.5 (la sesión corrió con ese modelo; el plan pedía 5.5). Tras eso, falta solo: enlazar repo y sitio en Qollab y grabar el video.
- Post-plan (Opus 5.5): `README.md` es la versión en inglés (por defecto) y `README.es.md` la española; ambas enlazan entre sí en la línea 3 y tienen las mismas secciones: cualquier cambio va en las dos. La vista validador (static/app.js) ahora muestra el circuito en vivo (`/circuit`, línea del qubit propio resaltada, cache por URL), su bit en la medición W (`state.last_w`) y la evidencia GHZ (`state.last_ghz`); `myVote` se conserva hasta RESULT para dibujar la fase propia. Sin cambios de backend.
- Extensión (Haiku 4.5, L0): plan y checklist de la extensión W local (closing window) según paper de Robledo et al. Guía en `docs/LOCAL_W.md` con secciones de Contexto, Contratos y Fases L0-L5.
- Extensión L1 (Sonnet 5.5): `elect_leader_local(n, noise, max_rounds=50)` y `local_w_bits(m, noise)` en quantum.py, con `LocalRound`/`LocalWResult` según docs/LOCAL_W.md (sin desviaciones de contrato). `local_w_bits` usa un solo job con `shots=m` (el disparo j es la copia del contendiente j) y el circuito compilado se cachea por `(m, noise)` con `lru_cache`: sin caché cada ronda costaba ~170 ms (transpilación), con caché ~2 ms y una elección completa ~14 ms. `w_circuit(n)` sigue validando 2..12; el helper `_w_ladder(m)` admite m=1 (|W_1>=|1>). Medido: n=10 sin ruido 2.33 rondas de media (paper 2.365), 95% en ≤5; con ruido 2.44; n=12 ≈ 0.67 colisiones y 0.66 silencios por elección. Con ruido un contendiente solo (m=1) puede medir 0 y producir "silencio" hasta que acierte.
- Extensión L2 (Sonnet 5.5): `Room(local_round_delay=1.5)`, `election_mode` ("global" por defecto) y mensaje `set_election{mode}` (host, solo LOBBY); `state.election_mode`; `last_w` y `w_result` llevan `mode`. En local `_reveal_local_rounds` emite un `state` por ronda con el prefijo revelado y duerme `local_round_delay` entre rondas (sin pausa tras la última, que ya trae `done=true` y `leader_qubit`); todo ocurre dentro de ELECTING con el lock tomado, así que un `disconnect` espera a que acabe la revelación. Con 1.5 s por ronda una elección de 5 rondas tarda ~6.5 s (95% de las elecciones con n=10 acaban en ≤5 rondas); el temporizador de propuesta arranca después. Sin líder tras `max_rounds` → `error` y LOBBY (con `last_w` conservado). Para tests: `Room(local_round_delay=0)` y `monkeypatch.setattr(quantum, "elect_leader_local", ...)` para trazas deterministas; sin cambios en las vistas (L3/L4).
- Extensión L3 (Sonnet 5.5): host.js/host.html con selector segmentado `#election` (botones `data-mode`, deshabilitado fuera de LOBBY) que envía `set_election`. `renderW` ramifica por `last_w.mode`: `renderWLocal` pinta una `.lround` por ronda (chips `q{n}:{bit}`, INTENT resaltado, resultado colisión/silencio/COMMIT) dentro de `.lscroll` (max-height 270 px, baja sola a la última ronda) para que la página siga cabiendo en 1920x1080 aun con muchas rondas. `localActive()` calcula la ventana tras la última ronda revelada: las tarjetas muestran CONTENDIENTE o FUERA · escucha (clase `.out`) solo durante ELECTING local. El diálogo del circuito usa m de la última ronda en modo local. Pendiente para L4: el celular debe leer `state.last_w.mode === "local"` (rounds, contenders, bits, intents, outcome); `app.js` aún asume el formato global (`attempts`) y no muestra el bit local.
- Extensión L4 (Sonnet 5.5): app.js lee `state.last_w.mode === "local"`. `renderLocalMeasure` pinta por ronda (reutiliza `.lround/.lchips/.lchip/.lres` de style.css, más `.lchip.mine`): mi bit y posición en la ventana, INTENT/escuchaste, y el desenlace (colisión: choqué con X / quedo fuera; silencio; único INTENT: recibo n-1/n-1 ACK o envío ACK a X). Quien ya no compite lo dice y no envía ACK en colisiones (sí en la ronda del líder, como en el paper). La pantalla `electing` añade `wCard()` solo en modo local y `elecmsg` con la ronda actual. `circuitSpec`/`showCircuit` aceptan `n` y `hl`: en local el circuito es |W_m⟩ de la última ronda con la línea de MI POSICIÓN en la ventana resaltada (no mi qubit global); `hl: null` si estoy fuera; m=1 muestra aviso en vez de circuito. La pantalla de líder cambia de texto en local. En LOBBY local la leyenda explica la copia local. El modo global no cambia. Siguiente: L5 (README en/es y PR.md).
