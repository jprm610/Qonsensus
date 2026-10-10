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
- [ ] Fase 3 · Opus 5.5 · servidor y máquina de estados
- [ ] Fase 4 · Sonnet 5.5 · vista validador (móvil)
- [ ] Fase 5 · Sonnet 5.5 · vista host (pantalla grande)
- [ ] Fase 6 · Haiku 5.5 · despliegue en Render
- [ ] Fase 7 · Sonnet 5.5 · ruido (deseable)
- [ ] Fase 8 · Sonnet 5.5 · alterar bloque y circuito (deseable)
- [ ] Fase 9 · Haiku 5.5 · README y entrega

## Notas de handoff
- Fase 1: `attempts` incluye todos los shots consumidos (el último es el válido). `noise_model()` lanza NotImplementedError hasta la Fase 7, así que `noise=True` falla por ahora. Se añadió `pytest.ini` (pythonpath=.) para que `pytest -q` encuentre `app`.
- Fase 2: Implementada sin desviaciones. Se agregaron tests para génesis, add, verify, tamper y to_list. `quorum(n)` devuelve ceil(2n/3).
