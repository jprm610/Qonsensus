# Extensión: elección de líder con W local, variante Closing Window

## ▶ Instrucciones para el modelo que ejecuta una fase (leer primero)

Eres uno de varios modelos que implementan esta extensión, una fase por sesión, en la rama `feature/LocalWState`.

1. **Identifica tu fase:** es la primera sin ✅ de la sección "Extensión W local" del checklist de `CLAUDE.md`, salvo que el usuario indique otra. Si esa sección no existe, estás en la **Fase L0**.
2. **Confirma el estado:** ejecuta `git log --oneline -5`. El último commit debe ser el de la fase anterior y no debe haber cambios sin commitear de otra fase. Si algo no cuadra, detente y avisa.
3. **Verifica el modelo:** si no eres el modelo asignado a tu fase, avísalo en una línea y espera confirmación.
4. **Lee sólo lo necesario:** la sección **Contratos** de `docs/LOCAL_W.md`, tu fase y los archivos de su lista **Leer**. Para el resto, usa `grep` sobre el símbolo concreto.
5. **Implementa sólo tu fase.** Verifica con su criterio de **Aceptación**. Para detener procesos de prueba, filtra **siempre** por la línea de comandos exacta (puerto o perfil temporal); nunca uses `taskkill /IM python.exe` ni filtros amplios.
6. **Cierra la fase:** marca ✅ en `CLAUDE.md`, anota desviaciones en "Notas de handoff" (y en Contratos si cambian), haz commit con el mensaje exacto más la co-autoría, y resume en 3 líneas: qué hiciste, cómo lo verificaste y cuál es la siguiente fase con su modelo.
7. Si fallas dos veces en lo mismo, detente y recomienda escalar de modelo (Haiku → Sonnet → Opus).

Prompt para abrir cada sesión (tras `/clear` y `/model <modelo>`):
> Continúa con la siguiente fase según `CLAUDE.md` y `docs/LOCAL_W.md`.

---

## Contexto

Hoy la app elige al líder con un |Wₙ⟩ **global**: un solo estado repartido, una medición y exactamente un 1 (salvo ruido). Es el escenario "Global ideal" de la diapositiva, el que haría falta en una red cuántica.

El paper *W-State Leader Election for PBFT Based Quantum Leader Election* (Robledo, Mišić, Mišić) propone en cambio **distribuir una copia local completa de |W⟩ a cada validador**, que mide sólo el qubit que se le asigna. Las colisiones se resuelven con un handshake INTENT/ACK al estilo CSMA/CA. De sus tres variantes, **Closing Window (§VI) es la que converge más rápido**: con n = 10, E[T] ≈ 2.37 rondas, frente a 2.58 de Fixed W. Es el escenario "Local realista" de la diapositiva: "copias locales → colisiones → el handshake las resuelve en vivo".

**Objetivo:** el host elige en el LOBBY entre "Global ideal" (lo actual) y "Local · closing window". En modo local, la sala ve cada ronda del handshake en vivo: quién midió 1, si hubo colisión y cómo se cierra la ventana hasta llegar a un único líder.

### El protocolo que se implementa (paper §III-B y §VI)

Ronda r, con un conjunto de contendientes C (al empezar, todos los validadores) y m = |C|:

1. **Medición local.** Cada contendiente j ∈ C tiene su propia copia de |W_m⟩ y mide el qubit de posición j dentro de C. Como las copias son independientes, X_j ~ Bernoulli(1/m).
2. **INTENT.** Quien obtiene X_j = 1 se anuncia a todos.
3. **ACK.** Si hay **exactamente un** INTENT, todos los demás validadores (n−1, incluidos los que ya no compiten) envían ACK. Si el candidato reúne **Q = n − 1 − t** ACKs, hace COMMIT y es el líder.
4. **Si la ronda falla:**
   - **colisión** (≥2 INTENT): la ventana **se cierra**, y C pasa a ser el conjunto de empatados;
   - **silencio** (0 INTENT): C no cambia.

   Siguiente ronda con m = |C|. Con m = 1, |W₁⟩ = |1⟩ y el único contendiente gana en la siguiente ronda (salvo ruido).

**Modelo de red simulado:** todos los validadores son honestos y no se pierden mensajes, así que t = 0 y, con un único INTENT, llegan n−1 ACKs (Q = n−1). El ACK se muestra igualmente para que se vea el handshake.

---

## Contratos (fuente de verdad para todas las fases)

### `app/quantum.py` (se añade; lo existente no cambia)

```python
ACK_LOSS_TOLERANCE = 0          # t del paper: Q = n - 1 - t

@dataclass
class LocalRound:
    contenders: list[int]       # qubits (= índice del validador) que compiten, en orden ascendente
    m: int                      # tamaño de cada |W_m⟩ local = len(contenders)
    bits: list[int]             # bit medido por cada contendiente (alineado con contenders)
    intents: list[int]          # qubits que midieron 1 y envían INTENT
    outcome: str                # "leader" | "collision" | "silence"
    acks: int                   # ACKs recibidos por el candidato (n-1 si outcome == "leader"; 0 si no)
    quorum: int                 # Q = n - 1 - ACK_LOSS_TOLERANCE

@dataclass
class LocalWResult:
    leader_qubit: int | None    # None si se agotó max_rounds
    rounds: list[LocalRound]

def local_w_bits(m: int, noise: bool = False) -> list[int]
    # m copias locales de |W_m⟩: un solo job de Aer con shots=m y memory=True;
    # el contendiente j toma el qubit j del disparo j. Admite m = 1 (x(0) + measure).
def elect_leader_local(n: int, noise: bool = False, max_rounds: int = 50) -> LocalWResult
    # Closing Window: valida 2 <= n <= 12 (ValueError si no), aplica las reglas de arriba.
```

- `w_circuit(n)` sigue validando n ≥ 2. Para m = 1, usa un helper interno sin esa validación.
- Con `noise=True` usa `_compile(..., True)` y `_simulator(True)`, como la elección global.
- Se reutiliza la escalera `cry + cx` de `w_circuit`: prepara el mismo |W⟩ que la escalera XY (RXX·RYY) del Algoritmo 1 del paper. Cambiar a esa escalera no entra en esta extensión.

### Protocolo WebSocket (cambios)

- `state.election_mode`: `"global"` (por defecto) o `"local"`.
- Cliente → servidor, nuevo mensaje `set_election{mode}`: sólo el host, sólo en LOBBY. `mode` inválido → `error`.
- `state.last_w`:
  - global: `{mode: "global", leader_qubit, attempts}`. Se añade `mode`; lo demás no cambia.
  - local: `{mode: "local", leader_qubit, rounds: [LocalRound…], total_rounds, done}`.
    - Durante ELECTING, `rounds` es el **prefijo revelado hasta ahora**: el servidor emite un `state` por ronda, con `Room.local_round_delay` segundos entre rondas (1.5 s por defecto; 0 en los tests). Al final, `done = true`.
    - `leader_qubit` sólo se rellena cuando `done`.
- `w_result`: global sin cambios más `mode`; local `{type, mode: "local", rounds, leader_id}`.
- Fases y temporizadores no cambian. La revelación ocurre dentro de ELECTING con el lock tomado: los `join` ya se rechazan durante la ronda y los demás mensajes esperan. Si se agota `max_rounds`, se manda `error` y se vuelve a LOBBY, igual que la elección global sin líder.

### UI (nombres)

- Selector del host: **"Global ideal"** / **"Local · closing window"**.
- Glosario visible: INTENT = "quiero liderar", ACK = "te reconozco", Q = quórum de ACKs, ventana = contendientes activos.

---

## Fases

| Fase | Contenido | Modelo |
|---|---|---|
| L0 | Documentar la extensión y el checklist | **Haiku 5.5** |
| L1 | Motor: `local_w_bits` y `elect_leader_local`, con tests | **Sonnet 5.5** |
| L2 | Servidor: modo de elección, revelación por rondas y tests WS | **Sonnet 5.5**; escalar a Opus si la concurrencia falla |
| L3 | Host: selector y visualización del handshake | **Sonnet 5.5** |
| L4 | Validador: su copia local, su bit e INTENT/ACK por ronda | **Sonnet 5.5** |
| L5 | READMEs (en/es) y `PR.md` | **Haiku 5.5** |

### Fase L0: documentación (Haiku 5.5)
- **Leer:** este plan.
- **Hacer:**
  - Copiar este plan a `docs/LOCAL_W.md`.
  - En `CLAUDE.md`, añadir bajo el checklist una sección `## Extensión W local (closing window) — docs/LOCAL_W.md` con L0–L5 y su modelo, y una línea en "Notas de handoff" que apunte a `docs/LOCAL_W.md`.
- **Aceptación:** los dos archivos existen y el checklist tiene L0 ✅.
- **Commit:** `docs: plan for local W-state leader election (closing window)`

### Fase L1: motor cuántico (Sonnet 5.5)
- **Leer:** Contratos › `quantum.py`; `app/quantum.py`, completo (149 líneas).
- **Hacer:** `ACK_LOSS_TOLERANCE`, `LocalRound`, `LocalWResult`, `local_w_bits`, `elect_leader_local` y un helper de circuito W sin validación para m ≥ 1.
  - Tests en `tests/test_quantum.py`:
    1. `local_w_bits(m)` devuelve m bits en {0, 1}, y con m = 1 sin ruido siempre `[1]`.
    2. Frecuencia de 1 por posición ≈ 1/m (m = 4, 400 llamadas, ±0.07).
    3. Invariantes de cada traza: `m == len(contenders)`; los contendientes se mantienen o se reducen a `intents` tras una colisión; silencio → mismos contendientes; la última ronda es `"leader"` con un único INTENT y `acks == quorum == n-1`.
    4. Rondas medias con n = 10 y 200 elecciones dentro de [2.0, 2.8] (el paper da 2.365).
    5. Equidad: n = 4, 300 elecciones, cada líder ≈ 0.25 ± 0.09.
    6. Con `noise=True`, la elección termina y las invariantes se cumplen.
    7. `ValueError` para n fuera de 2..12.
- **Aceptación:** `pytest -q` en verde (los tests nuevos en menos de 30 s).
- **Commit:** `feat(quantum): local W-state leader election with closing window`

### Fase L2: servidor (Sonnet 5.5)
- **Leer:** Contratos › Protocolo; con `grep`: `_elect`, `_on_toggle_noise`, `_state`, `_handlers` y `__init__` en `app/room.py`; `tests/test_ws.py` (helpers `setup_room`, `start_round`, `recv_until`, `ws_conn`).
- **Hacer:**
  - `Room.__init__(…, local_round_delay=1.5)` y `self.election_mode = "global"`.
  - `_on_set_election`, con el mismo patrón que `_on_toggle_noise`: host y LOBBY.
  - `_state` añade `election_mode`.
  - `_elect` ramifica por modo. En local: `res = await asyncio.to_thread(quantum.elect_leader_local, n, self.noise)`; luego, por cada ronda, actualiza `last_w` con el prefijo, hace broadcast de `state` y `await asyncio.sleep(self.local_round_delay)` (sin sleep tras la última). Al terminar, `done = true`, `leader_qubit` y el mismo flujo que hoy (`w_result`, `you`, PROPOSING).
  - En global, añadir `mode: "global"` a `last_w` y a `w_result`.
- **Tests (`tests/test_ws.py`, `Room(local_round_delay=0)`):**
  - `set_election` por un validador → error;
  - `set_election` fuera de LOBBY → error;
  - modo inválido → error;
  - ronda completa en modo local hasta RESULT, con `last_w.mode == "local"`, `done`, rondas coherentes y el líder en la última ronda;
  - los `state` intermedios revelan las rondas de una en una (longitud creciente);
  - el modo global sigue pasando todos los tests existentes.
- **Aceptación:** `pytest -q` en verde, 5 corridas seguidas de `tests/test_ws.py` sin fallos intermitentes, y un smoke contra uvicorn real en modo local.
- **Commit:** `feat(server): selectable election mode with live closing-window rounds`

### Fase L3: host (Sonnet 5.5)
- **Leer:** Contratos (Protocolo y UI); con `grep`: `renderW`, `render`, `renderValidators` y el manejo de `#noise` en `static/host.js`; la cabecera de `static/host.html`.
- **Hacer:**
  - Selector segmentado en la cabecera, junto a "Ruido": habilitado sólo en LOBBY, envía `set_election` y refleja `state.election_mode`.
  - `renderW` en modo local: una fila por ronda, con "Ronda r · m = k", chips por contendiente (qubit y bit; los que mandan INTENT resaltados) y el resultado:
    - "colisión: 2 INTENT → la ventana se cierra a {q1, q3}";
    - "silencio → se repite con los mismos";
    - "1 INTENT → ACK 3/3 ≥ Q = 3 → COMMIT: líder Ana".

    Las rondas aparecen conforme llegan.
  - Tarjetas de validadores durante ELECTING local: etiqueta "CONTENDIENTE" o "FUERA · escucha", según la última ronda revelada.
  - Mensaje de fase: "Ronda r: m contendientes miden su copia local de |W_m⟩".
  - Que siga cabiendo en 1920×1080, como se comprobó en las fases 5 y 8.
- **Aceptación:** E2E en Chrome headless, con el mismo patrón CDP de las fases 5 y 8: el selector cambia de modo y una ronda local muestra rondas, colisiones y COMMIT. Para forzar una colisión visible, usar n = 6–8 o varias rondas. Revisión de una captura.
- **Commit:** `feat(host): election mode selector and live closing-window view`

### Fase L4: validador (Sonnet 5.5)
- **Leer:** Contratos; con `grep`: `renderWMeasure`, `circuitSpec`, `showCircuit` y `build(` en `static/app.js`.
- **Hacer:**
  - En modo local, `renderWMeasure` muestra, por ronda: "Ronda r: mediste tu qubit (posición j) de tu copia local de |W_m⟩ → 1 → enviaste INTENT" o "→ 0 → escuchaste"; si hubo colisión, con quién chocó y que la ventana se cerró; o "Quedaste fuera de la ventana: envías ACK".
  - `circuitSpec` en ELECTING local: circuito W de la ronda actual (`/circuit?kind=w&n=m` con m ≥ 2), resaltando la línea `q_j` con la posición del validador en esa ronda. Si m = 1, un aviso en lugar del circuito.
  - El modo global se ve igual que hoy.
- **Aceptación:** E2E con 3–4 celulares emulados en modo local: cada uno ve sus rondas y su papel (INTENT, escucha o fuera); sin scroll horizontal; captura revisada.
- **Commit:** `feat(ui): validator view of local W rounds and INTENT/ACK`

### Fase L5: documentación final (Haiku 5.5)
- **Leer:** este documento (Contexto y Protocolo); con `grep`, la sección "How it works" de `README.md` y "Cómo funciona" de `README.es.md`.
- **Hacer:**
  - Sección "Leader election modes" / "Modos de elección del líder" en **ambos** README: global ideal frente a local closing window, el handshake, E[T] ≈ 2.37 con n = 10 según el paper y el modelo de red simulado (t = 0).
  - Añadir la fila de esta extensión a la tabla de uso de IA.
  - Generar `PR.md` (sin commitear) para el PR `feature/LocalWState` → `main`.
- **Commit:** `docs: document local closing-window election mode`

---

## Verificación end-to-end
- `pytest -q` en verde tras L1 y L2 (suite actual de 70 tests más los nuevos).
- Local: `uvicorn app.main:app --host 0.0.0.0` y `/host?url=http://<IP-LAN>:8000/` con 4–6 celulares:
  1. Ronda en modo global: igual que hoy.
  2. Cambiar a "Local · closing window" en el LOBBY.
  3. Nuevo bloque: deben verse rondas con colisiones o silencios que se resuelven hasta el COMMIT, y cada celular ve su bit y su papel.
  4. Repetir con ruido activado.
- Producción: tras el merge y el redeploy en Render, una ronda local con celulares reales.
