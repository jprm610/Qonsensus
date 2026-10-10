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
- [ ] Fase 6 · Haiku 5.5 · despliegue en Render
- [ ] Fase 7 · Sonnet 5.5 · ruido (deseable)
- [ ] Fase 8 · Sonnet 5.5 · alterar bloque y circuito (deseable)
- [ ] Fase 9 · Haiku 5.5 · README y entrega

## Notas de handoff
- Fase 1: `attempts` incluye todos los shots consumidos (el último es el válido). `noise_model()` lanza NotImplementedError hasta la Fase 7, así que `noise=True` falla por ahora. Se añadió `pytest.ini` (pythonpath=.) para que `pytest -q` encuentre `app`.
- Fase 2: Implementada sin desviaciones. Se agregaron tests para génesis, add, verify, tamper y to_list. `quorum(n)` devuelve ceil(2n/3).
- Fase 3: contrato de `state` ampliado (`noise_available`, `last_ghz.quorum/accepted`), ver docs/PHASES.md › Protocolo. `Room(propose_timeout, vote_timeout, grace)`; los tests reemplazan `app.main.room`. En tests usar `ws_conn(client)` de `tests/test_ws.py` (tolera la cancelación del TestClient al cerrar) y siempre `with TestClient(...)` para compartir event loop. Para probar contra uvicorn real hay un cliente `websockets` disponible en el venv.
- Fase 4: `state` ahora incluye `now` (hora del servidor) para corregir el desfase de reloj en la cuenta regresiva (`skew = now - Date.now()/1000`); ver docs/PHASES.md. La vista validador guarda `ec.name` y `ec.token` en localStorage y se reconstruye solo al cambiar de pantalla (el textarea del líder no se pierde con cada `state`). Texto de usuario siempre con `textContent` (helper `h()`), nunca `innerHTML`. Clases CSS de la vista móvil al final de `static/style.css` (`.screen`, `.card`, `.btn`, `.conn`, `.toast`); la Fase 5 puede reutilizar las variables `:root`, `.card`, `.mono`, `.okt`, `.errt`, `.hash`.
- Fase 5: `/host` (static/host.html + host.js) usa `state` + `ghz_result` (el `yes_real` solo llega en ese mensaje; no está en `state`). QR con qrcodejs 1.0.0 desde cdnjs (sin internet muestra solo la URL); `?url=` fija la URL del QR y sin él avisa si el origen es localhost. El interruptor de ruido sale deshabilitado mientras `noise_available` sea false o fuera de LOBBY: la Fase 7 solo debe implementar `noise_model()`. `renderChain()` en host.js reconstruye todo `#chain` en cada `state` (la Fase 8 debe evitar re-renderizar mientras un `.bdata` tiene el foco). Falta la prueba manual con un celular real por QR en la LAN (`/host?url=http://<IP-LAN>:8000`, arrancando uvicorn con `--host 0.0.0.0`).
