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

## Notas de handoff
- Fase 1: `attempts` incluye todos los shots consumidos (el último es el válido). `noise_model()` lanza NotImplementedError hasta la Fase 7, así que `noise=True` falla por ahora. Se añadió `pytest.ini` (pythonpath=.) para que `pytest -q` encuentre `app`.
- Fase 2: Implementada sin desviaciones. Se agregaron tests para génesis, add, verify, tamper y to_list. `quorum(n)` devuelve ceil(2n/3).
- Fase 3: contrato de `state` ampliado (`noise_available`, `last_ghz.quorum/accepted`), ver docs/PHASES.md › Protocolo. `Room(propose_timeout, vote_timeout, grace)`; los tests reemplazan `app.main.room`. En tests usar `ws_conn(client)` de `tests/test_ws.py` (tolera la cancelación del TestClient al cerrar) y siempre `with TestClient(...)` para compartir event loop. Para probar contra uvicorn real hay un cliente `websockets` disponible en el venv.
- Fase 4: `state` ahora incluye `now` (hora del servidor) para corregir el desfase de reloj en la cuenta regresiva (`skew = now - Date.now()/1000`); ver docs/PHASES.md. La vista validador guarda `ec.name` y `ec.token` en localStorage y se reconstruye solo al cambiar de pantalla (el textarea del líder no se pierde con cada `state`). Texto de usuario siempre con `textContent` (helper `h()`), nunca `innerHTML`. Clases CSS de la vista móvil al final de `static/style.css` (`.screen`, `.card`, `.btn`, `.conn`, `.toast`); la Fase 5 puede reutilizar las variables `:root`, `.card`, `.mono`, `.okt`, `.errt`, `.hash`.
- Fase 5: `/host` (static/host.html + host.js) usa `state` + `ghz_result` (el `yes_real` solo llega en ese mensaje; no está en `state`). QR con qrcodejs 1.0.0 desde cdnjs (sin internet muestra solo la URL); `?url=` fija la URL del QR y sin él avisa si el origen es localhost. El interruptor de ruido sale deshabilitado mientras `noise_available` sea false o fuera de LOBBY: la Fase 7 solo debe implementar `noise_model()`. `renderChain()` en host.js reconstruye todo `#chain` en cada `state` (la Fase 8 debe evitar re-renderizar mientras un `.bdata` tiene el foco). Falta la prueba manual con un celular real por QR en la LAN (`/host?url=http://<IP-LAN>:8000`, arrancando uvicorn con `--host 0.0.0.0`).
- Fase 6: `render.yaml` (web Python, plan free, `/health`, PYTHON_VERSION 3.11). Escaneo de secretos sin hallazgos. Pendiente manual del usuario: repo público en GitHub, `git push`, crear el Blueprint en Render, probar `/host` con 2–3 celulares por wss. El plan free se duerme tras inactividad: abrir la URL unos minutos antes de la demo.
- Fase 7: `noise_model()` implementado (depolarizante 1q 0.01 en x/h/p/ry, 2q 0.02 en cx, lectura 0.02). Con ruido se transpila a `NOISY_BASIS` con `optimization_level=0` (`_compile`) para que toda puerta quede ruidosa. Medido: W descarta ~12% (n=3), ~25% (n=6), ~48% (n=12) de los shots; `elect_leader` converge en pocos intentos. En GHZ el ruido encoge el contraste y sesga k̂ hacia el centro: en n=6 el error es ≤1 para k=1..5 pero llega a 2 en k=0 y k=n (a n=10 hasta 3), por eso el test de ±1 solo cubre el centro. Un bloque con todos "sí" puede salir con k̂ < n; con ruido alto puede incluso quedar bajo el quórum. El interruptor del host solo se habilita en LOBBY. Si en la demo el ruido rechaza demasiados bloques válidos, bajar `P_1Q`/`P_2Q`/`P_READOUT` en quantum.py.
- Fase 8: mensajes `tamper{index,data}` y `repair{}` (solo host) y `GET /circuit?kind=&n=[&yes=]`; ver docs/PHASES.md › Protocolo. `Chain.rehash_from(i)` solo para la demo. En host.js los bloques son `contenteditable`: blur envía `tamper`, Enter confirma, Escape cancela, y `renderChain()` no reconstruye mientras un `.bdata` tiene el foco. El circuito va en un `<dialog>` (no añade alto de página: sigue cabiendo en 1920x1080). Qiskit avisa por stdout cp1252 al dibujar; se silencia con `warnings` en main.py (el dibujo sale en UTF-8 igualmente).
- Fase 9: README completo (secciones de PLAN.md §10 y créditos de §9). Pendiente de rellenar por el usuario: `<URL-DE-RENDER>` (demo), GIF o captura, y la línea `<CONFIRMAR …>` sobre si qollab/ se escribió antes o durante la ventana (los commits `V 0` y `0.1` son del 10 oct 2026 17:29–17:33). En la tabla de modelos del README, la Fase 2 figura como Claude Haiku 4.5 (la sesión corrió con ese modelo; el plan pedía 5.5). Tras eso, falta solo: enlazar repo y sitio en Qollab y grabar el video.
