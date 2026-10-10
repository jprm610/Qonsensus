# Entangled Consensus multijugador: plan por fases

## ▶ Instrucciones para el modelo que ejecuta una fase (leer primero)

Eres uno de varios modelos que implementan este proyecto, una fase por sesión. Para ubicarte:

1. **Identifica tu fase.** Mira el checklist de `CLAUDE.md`: tu fase es **la primera sin ✅**, salvo que el usuario indique otra en su mensaje. Si `CLAUDE.md` no existe, estás en la **Fase 0**.
2. **Confirma el estado del repo.** Ejecuta `git log --oneline -5`. El último commit debe coincidir con el mensaje de commit de la fase anterior. Si no coincide, o hay cambios sin commitear de otra fase, **detente y avisa al usuario**.
3. **Verifica el modelo.** Cada fase indica qué modelo la implementa. Si tú no eres ese modelo, avisa al usuario en una línea (por ejemplo: "Esta fase está asignada a Sonnet 5.5; cambia con `/model`") y espera su confirmación antes de seguir.
4. **Lee solo lo necesario:** la sección **Contratos compartidos**, la sección de **tu fase** y los archivos de su lista **Leer**. No leas `PLAN.md` completo, `qollab/` completo ni el código de otras fases salvo que tu fase lo pida. Si un contrato no te alcanza, busca con `grep` el símbolo concreto en vez de abrir el archivo entero.
5. **Implementa** solo lo que pide tu fase. No adelantes trabajo de fases posteriores ni refactorices las anteriores. Si encuentras un bug en una fase anterior, corrígelo con el cambio mínimo y anótalo.
6. **Verifica** con el criterio de **Aceptación** de tu fase (tests o arranque). No hagas commit si falla.
7. **Cierra la fase:**
   - Marca la fase con ✅ en el checklist de `CLAUDE.md`.
   - Si te desviaste del contrato (firma, mensaje o campo), actualiza la sección **Contratos** de `docs/PHASES.md` y añade una línea en "Notas de handoff" de `CLAUDE.md`.
   - Haz commit con el mensaje exacto de la fase (más la línea de co-autoría).
   - Termina con un resumen de 3 líneas para el usuario: qué se hizo, cómo se verificó y **cuál es la siguiente fase y su modelo**.
8. **Si te atascas:** después de dos intentos fallidos en lo mismo, detente, explica el bloqueo y recomienda escalar al modelo superior (Haiku → Sonnet → Opus).

**Prompt sugerido para que el usuario abra cada sesión** (tras `/clear` y `/model <modelo>`):
> Continúa con la siguiente fase según `CLAUDE.md` y `docs/PHASES.md`.

---

## Contexto

`PLAN.md` define la app multijugador (FastAPI + Qiskit Aer + WebSockets + frontend vanilla) que extiende la versión de Qollab (`qollab/main.js`, `qollab/main.css`, `qollab/index.html`, ya en el repo). Hoy es 10 oct 2026 y el **cierre es el 11 oct a las 19:00 ET**. El repo solo tiene `PLAN.md` y `qollab/`.

Objetivo de este documento: dividir el trabajo en fases, **un commit por fase**, y asignar a cada fase el modelo más barato capaz de hacerla. Para gastar pocos tokens:

- **Los contratos (firmas, mensajes y estado) se fijan aquí.** Ninguna fase necesita leer el código de las fases anteriores salvo los archivos que su sección indica.
- **Cada fase empieza en una sesión nueva** (`/clear`). Antes se cambia de modelo con `/model`. Primero se lee `CLAUDE.md`, luego **solo** la sección de la fase en `docs/PHASES.md` y los archivos de la lista "Leer".
- Ningún modelo debe releer `PLAN.md` completo ni `qollab/main.js` completo si su fase no lo pide.

En la Fase 0 este documento se copia al repo como `docs/PHASES.md`.

### Modelos

| Modelo | Uso |
|---|---|
| **Haiku 5.5** | Andamiaje, código trivial muy especificado, config, docs |
| **Sonnet 5.5** | Código bien especificado de complejidad media (cuántica, UI) |
| **Opus 5.5** | Concurrencia/async, máquina de estados, depuración difícil |

Si un modelo barato falla dos veces en la misma fase, se escala un nivel (Haiku → Sonnet → Opus) y queda anotado en `CLAUDE.md`.

---

## Estructura final del repo (raíz = `Qonsensus/`)

```
Qonsensus/
├── CLAUDE.md              # guía corta para los modelos: fase actual, reglas, comandos
├── PLAN.md                # especificación original (no editar)
├── docs/PHASES.md         # este plan
├── app/
│   ├── __init__.py
│   ├── main.py            # FastAPI: rutas estáticas, /ws, /health
│   ├── quantum.py         # circuitos W/GHZ, ejecución Aer, ruido
│   ├── chain.py           # Block, Chain, quorum
│   └── room.py            # Room: validadores, fases, timers, broadcast
├── static/
│   ├── index.html  app.js     # validador (móvil)
│   ├── host.html   host.js    # pantalla grande
│   └── style.css              # compartido, paleta de qollab/main.css
├── qollab/                # referencia (ya existe, no tocar)
├── tests/
│   ├── test_quantum.py
│   ├── test_chain.py
│   └── test_ws.py         # integración WebSocket (TestClient)
├── requirements.txt
├── render.yaml
├── .gitignore
├── LICENSE                # MIT
└── README.md
```

---

## Contratos compartidos (fuente de verdad para todas las fases)

### `app/quantum.py`
```python
MAX_VALIDATORS = 12
MIN_VALIDATORS = 2
GHZ_SHOTS = 2000
W_BATCH = 32            # shots por lote de W; se consumen en orden (memory=True)

@dataclass
class WResult:
    leader_qubit: int | None    # None si se agotaron los intentos
    attempts: list[str]         # bitstrings por qubit, orden q0..qn-1 (NO little-endian)

@dataclass
class GHZResult:
    p_even: float
    k_hat: int
    theta: float                # π/n
    theta_total: float          # acos(clamp(2p-1)) (rad)
    even: int
    odd: int
    shots: int

def w_circuit(n: int) -> QuantumCircuit
def ghz_circuit(n: int, yes_qubits: list[int]) -> QuantumCircuit
def elect_leader(n: int, noise: bool = False, max_attempts: int = 50) -> WResult
def count_votes(n: int, yes_qubits: list[int], noise: bool = False, shots: int = GHZ_SHOTS) -> GHZResult
def noise_model() -> NoiseModel        # Fase 7; antes puede lanzar NotImplementedError
```
- Bitstrings de Qiskit: el qubit i es `s[-1-i]`. `attempts` se normaliza a orden q0..qn-1 (como `qollab/main.js:192`).
- Las funciones son síncronas (CPU). `room.py` las llama con `await asyncio.to_thread(...)`.
- `AerSimulator` se cachea a nivel de módulo (uno sin ruido y uno con ruido).

### `app/chain.py`
```python
GENESIS_PREV = "0" * 64
def quorum(n: int) -> int               # ceil(2n/3)

@dataclass
class Block:
    index: int; timestamp: str; leader: str; data: str
    yes_estimated: int; n_validators: int
    evidence: dict | None; prev_hash: str; hash: str = ""
    def compute_hash(self) -> str      # sha256(json.dumps([index, timestamp, leader, data, yes_estimated, prev_hash], ensure_ascii=False))
    def to_dict(self) -> dict

class Chain:
    blocks: list[Block]                 # el constructor crea el génesis (leader="—", data="Genesis")
    def add(self, leader, data, yes_estimated, n_validators, evidence) -> Block
    def verify(self) -> int             # índice del primer bloque roto o -1
    def tamper(self, index: int, data: str) -> None   # cambia data sin rehashear (demo)
    def to_list(self) -> list[dict]     # cada dict incluye "valid": bool
```
`timestamp` es una cadena ISO-8601 UTC.

### Protocolo WebSocket (`/ws`, JSON)
Cliente → servidor: `join{name, token?}`, `join_host{}`, `new_block{}`, `propose{data}`, `vote{yes}`, `toggle_noise{on}`, `next{}` (host: RESULT → LOBBY), `tamper{index, data}` (host, Fase 8).

Servidor → cliente:
- `state{phase, validators:[{id,name,qubit,voted,connected}], leader_id, proposal, chain, noise, noise_available, deadline, last_w, last_ghz, quorum}`: broadcast en cada cambio. `deadline` es epoch en segundos o null; `now` es la hora del servidor (epoch s) al emitir el `state`: el cliente calcula `skew = now - Date.now()/1000` y usa `deadline - (Date.now()/1000 + skew)` para la cuenta regresiva. `last_w` es `{leader_qubit, attempts}` o null. `last_ghz` es `{p_even, k_hat, theta, theta_total, even, odd, shots, quorum, accepted}` o null (no incluye `yes_real`). `noise_available` es false hasta la Fase 7 (el host deshabilita el interruptor).
- El servidor reenvía `you` a cada validador cuando cambia su qubit o su rol de líder (elección, reset a LOBBY). Los clientes deben usar siempre el último `you`.
- `new_block` se rechaza con `error` si algún validador está desconectado (en gracia). `join` sin token durante una ronda recibe `error`.
- `you{id, token, qubit, is_leader}`: solo al validador.
- `w_result{attempts, leader_id}`, `ghz_result{p_even, k_hat, theta_total, quorum, accepted, yes_real}`: `yes_real` solo va a los hosts.
- `error{message}`.

Fases: `LOBBY, ELECTING, PROPOSING, VOTING, RESULT`, tal como `PLAN.md §5`. Timeouts: PROPOSING 60 s (se re-elige), VOTING 30 s (quien no votó cuenta como No).

**Reconexión (crítico para celulares):** el cliente guarda `token` en `localStorage` y lo reenvía en `join`. Si el WebSocket de un validador se cae, queda `connected=false` durante 15 s de gracia. Si vuelve con el mismo token, recupera id y qubit. Si la gracia vence: en LOBBY se elimina y se reasignan los qubits de forma compacta; durante una ronda se cancela la ronda y se vuelve a LOBBY.

---

## Fases

Cada fase indica: **Modelo · Leer · Hacer · Aceptación · Commit · Al terminar**.
"Al terminar" siempre significa: marcar la fase como ✅ en `CLAUDE.md`, anotar cualquier desviación del contrato y hacer commit.

### Fase 0: andamiaje (Haiku 5.5)
- **Leer:** solo esta sección.
- **Hacer:**
  1. Copiar este plan a `docs/PHASES.md`.
  2. Crear `CLAUDE.md` (≤ 40 líneas): propósito en 2 líneas; "antes de nada sigue la sección ▶ Instrucciones de docs/PHASES.md"; comandos (`pip install -r requirements.txt`, `uvicorn app.main:app --reload --host 0.0.0.0`, `pytest -q`); reglas (no editar `PLAN.md` ni `qollab/`, sin secretos, un commit por fase, UI en español); checklist de fases 0–9 con su modelo (`- [ ] Fase 1 · Sonnet 5.5 · motor cuántico`); sección vacía "Notas de handoff".
  3. `requirements.txt`: `fastapi`, `uvicorn[standard]`, `qiskit>=2.0`, `qiskit-aer`, `pytest`, `httpx`.
  4. `.gitignore` (Python, venv, `__pycache__`, `.pytest_cache`), `LICENSE` MIT (2026, jprm610), `README.md` con un título y una línea.
  5. `app/__init__.py`, y `app/main.py` mínimo: `/health` → `{"ok": true}`, `/` → `static/index.html`, `/host` → `static/host.html`, montar `/static`.
  6. `static/index.html` y `static/host.html` placeholder; `static/style.css` con las variables `:root` de `qollab/main.css:1-10`.
  7. Crear un venv e instalar dependencias.
- **Aceptación:** `uvicorn app.main:app` arranca, `/health` responde OK y `python -c "import qiskit, qiskit_aer"` funciona.
- **Commit:** `chore: scaffold FastAPI app, phases plan and MIT license`

### Fase 1: motor cuántico (Sonnet 5.5)
- **Leer:** Contratos › `quantum.py`; `PLAN.md §3.1–3.2` (líneas 81–112); `qollab/main.js:21-37` como referencia.
- **Hacer:** implementar `app/quantum.py` según el contrato.
  - W: `x(0)` y, para k = 0..n-2, `cry(2·acos(sqrt(1/(n-k))), k, k+1)` seguido de `cx(k+1, k)`; luego `measure_all`.
  - `elect_leader`: ejecuta lotes de `W_BATCH` con `memory=True` y consume shots hasta encontrar uno con exactamente un 1.
  - GHZ: `p(π/n)` sobre **los qubits de quienes votaron sí** (no sobre los primeros k, como hace Qollab). `p_even` se calcula a partir de la paridad de cada bitstring y `k_hat = round(acos(clamp(2p-1, -1, 1)) / θ)`.
  - Validar que `MIN_VALIDATORS ≤ n ≤ MAX_VALIDATORS` (si no, `ValueError`).
  - `tests/test_quantum.py` según `PLAN.md §8`: W con n = 2..8 y 2000 shots (exactamente un 1; frecuencias en 1/n ± 0.05); GHZ con n = 2..10 y todo k (`k_hat == k`, usando yes_qubits aleatorios, no solo los primeros); que `ValueError` salte en los límites.
- **Aceptación:** `pytest tests/test_quantum.py -q` en verde, en menos de unos 60 s.
- **Commit:** `feat(quantum): W-state leader election and GHZ phase voting on Aer`

### Fase 2: blockchain (Haiku 5.5)
- **Leer:** Contratos › `chain.py`; `PLAN.md §4`.
- **Hacer:** `app/chain.py` según el contrato, con `hashlib.sha256` y `verify()` igual que `qollab/main.js:99-106` (hash recalculado ≠ guardado, o `prev_hash` ≠ hash del anterior). Escribir `tests/test_chain.py` con: génesis válido; varios `add` y luego `verify() == -1`; `tamper` del bloque 2 de 4 hace que `verify() == 2`; `to_list` marca como inválidos los bloques ≥ 2; `quorum(n)` para n = 2..12 (2→2, 3→2, 4→3, 12→8).
- **Aceptación:** `pytest -q` pasa completo.
- **Commit:** `feat(chain): SHA-256 blockchain with verification and PBFT quorum`

### Fase 3: servidor, sala y máquina de estados (Opus 5.5)
- **Leer:** Contratos completos; `PLAN.md §5–6`; `app/main.py`. **No** leer la implementación de `quantum.py` ni de `chain.py` (basta con el contrato).
- **Hacer:**
  - `app/room.py`: clase `Room` con un `asyncio.Lock`, un dict de validadores (`id`, `token` uuid, `name`, `ws`, `qubit`, `voted`, `vote`, `connected`), el set de hosts, la fase, `leader_id`, `proposal`, `Chain`, `noise`, `last_w`/`last_ghz` y la tarea del timer activo.
  - Handlers de cada mensaje con la validación de rol y fase; si algo no corresponde, se responde `error`.
  - El quantum se ejecuta con `asyncio.to_thread`. Las ráfagas de `state` se emiten tras cada transición. Si un envío falla, no debe tumbar el broadcast.
  - Timers PROPOSING/VOTING implementados como `asyncio.Task` cancelables. VOTING termina antes de tiempo cuando todos los conectados votaron.
  - Al entrar en ELECTING se congela la lista de validadores de la ronda. No se aceptan `join` nuevos durante una ronda (quedan en espera hasta LOBBY, o reciben `error` con un mensaje claro).
  - Reconexión con token y 15 s de gracia, según el contrato.
  - Límites: `new_block` exige n ≥ 2, y `join` se rechaza si ya hay 12 validadores.
  - Contenido de `propose`: recortar a 280 caracteres. Nombres: recortar a 24 caracteres y evitar duplicados.
  - Al cerrar RESULT: si `k_hat ≥ quorum(n)` se hace `chain.add(...)` con evidence `{w_attempts, p_even, theta_total}`; el host pasa a LOBBY con `next`.
  - `app/main.py`: un solo endpoint `/ws` que delega en una instancia global de `Room`.
  - `tests/test_ws.py` con `fastapi.testclient.TestClient`: 3 validadores y 1 host, ronda completa con 3 sí → bloque agregado y cadena de 2; ronda con 0 sí → rechazada; el no-líder que intenta `propose` recibe `error`; `new_block` con 1 validador recibe `error`. Hacer los timeouts parametrizables (atributos de `Room`) para que los tests usen valores cortos.
- **Aceptación:** `pytest -q` en verde. Prueba manual con `websocat`, o simplemente las pestañas de las fases 4–5.
- **Commit:** `feat(server): WebSocket room with consensus state machine`

### Fase 4: vista validador, móvil (Sonnet 5.5)
- **Leer:** Contratos › Protocolo; `PLAN.md §7` (Validador); `static/style.css`.
- **Hacer:** `static/index.html` y `static/app.js` (sin frameworks). WebSocket a `(location.protocol==='https:'?'wss':'ws')://host/ws` con reconexión automática (backoff de 1 s a 5 s) que reenvía `join` con el token y el nombre guardados en `localStorage`.
  - Pantallas según `phase`, `you` y `state`: entrada; espera ("Eres el validador q3 · esperando ronda"); líder (textarea + "Proponer" + cuenta regresiva desde `deadline`); votación (propuesta + botones grandes Sí/No y luego "Voto enviado (fase θ aplicada a tu qubit)"); resultado (aceptado/rechazado + `k_hat`/quórum).
  - Mobile-first: botones ≥ 56 px, sin scroll horizontal. Escapar todo el texto del usuario (función `esc` como en `qollab/main.js:112`). Mostrar un indicador de "reconectando…".
- **Aceptación:** con 3 pestañas en modo móvil (DevTools) más un host improvisado por consola (`ws.send(JSON.stringify({type:'join_host'}))`, `new_block`) se completa una ronda.
- **Commit:** `feat(ui): mobile validator view`

### Fase 5: vista host / pantalla grande (Sonnet 5.5)
- **Leer:** Contratos › Protocolo; `PLAN.md §7` (Pantalla grande); `qollab/main.css` (completo, para la estética); `qollab/main.js:114-160` (render de validadores y cadena).
- **Hacer:** `static/host.html` y `static/host.js`.
  - QR con `qrcodejs` desde cdnjs (versión fija, p. ej. `qrcodejs/1.0.0/qrcode.min.js`) hacia `location.origin + '/'`, o hacia `?url=` si está presente (útil en local con la IP de la LAN).
  - Tarjetas `q0…qn-1` con el líder resaltado y el estado voted/connected.
  - Panel de la ronda: intentos W (los descartados tachados), P(par), θ_total, `k_hat` frente a quórum, `yes_real`.
  - Cadena horizontal con hashes cortos y verificación (✓ / ✗ desde el bloque roto).
  - Botones "Nuevo bloque" (deshabilitado si n < 2 o fuera de LOBBY), "Siguiente" (en RESULT) e interruptor de ruido (envía `toggle_noise`; si el backend aún no lo soporta, se ve deshabilitado).
  - Layout para 1920×1080 y legible a distancia (fuentes grandes).
- **Aceptación:** ronda completa con el host más 3 pestañas de validador; el QR se escanea desde un celular en la misma LAN (`?url=http://<IP-LAN>:8000`).
- **Commit:** `feat(ui): host big-screen view with QR, round evidence and chain`

> **Hito MVP.** Tras la Fase 5, enviar ya el **borrador en Qollab** (lo pide PLAN.md §11).

### Fase 6: despliegue en Render (Haiku 5.5 + pasos manuales del usuario)
- **Leer:** solo esta sección.
- **Hacer:** `render.yaml` con un servicio web Python: `buildCommand: pip install -r requirements.txt`, `startCommand: uvicorn app.main:app --host 0.0.0.0 --port $PORT`, `healthCheckPath: /health` y `PYTHON_VERSION` 3.11. Verificar que no haya secretos (`git grep -i -E "key|secret|token"`; los tokens de sesión son uuids en runtime, no secretos).
- **Manual (usuario):** hacer el repo público en GitHub, `git push`, crear el Blueprint en Render, abrir `/host` y probar con 2–3 celulares reales.
- **Aceptación:** la URL pública funciona con wss y se completa una ronda con celulares.
- **Commit:** `chore(deploy): Render blueprint`

### Fase 7: ruido, deseable (Sonnet 5.5)
- **Leer:** Contratos; `PLAN.md §3.3`; `app/quantum.py`; el handler `toggle_noise` en `app/room.py` (con grep, sin leer el archivo completo).
- **Hacer:**
  - `noise_model()`: depolarizante 1q 0.01 en `["x","h","p","ry"]`, 2q 0.02 en `["cx"]`, y `ReadoutError` 0.02.
  - Transpilar a una base compatible antes de ejecutar. Ojo: `cry` se descompone en `ry`/`cx`; usar `transpile(qc, sim)`.
  - Pasar `noise` hasta `elect_leader` y `count_votes`, y activar el interruptor del host.
  - Test: con ruido y n = 6, en 200 shots de W aparece al menos un bitstring descartado, y `p_even` difiere de la teoría pero `k_hat` se mantiene a ±1.
- **Aceptación:** `pytest -q` en verde; en la UI, con ruido se ven intentos descartados.
- **Commit:** `feat(quantum): optional Aer noise model with host toggle`

### Fase 8: alterar bloque y circuito, deseable (Sonnet 5.5)
- **Leer:** Contratos; `qollab/main.js:130-160`; `static/host.js`.
- **Hacer:**
  - Bloques con `data` editable en el host; al perder el foco se envía `tamper{index,data}`. El servidor llama a `chain.tamper`, hace broadcast y la cadena aparece rota desde ese bloque.
  - Botón "Reparar": opcional, reconstruye hashes desde el bloque roto (`Chain.rehash_from(i)`) solo como demostración.
  - Circuito: endpoint `GET /circuit?kind=w|ghz&n=` que devuelve `qc.draw('text')` y se muestra en un `<pre>` del host.
- **Commit:** `feat(host): tamper mode and circuit drawing`

### Fase 9: README y entrega (Haiku 5.5)
- **Leer:** `PLAN.md §9–10`; `CLAUDE.md`; `git log --oneline`.
- **Hacer:** README completo con las secciones 1–6 de `PLAN.md §10`, la URL desplegada (la proporciona el usuario), créditos, uso de IA (Claude Code, indicando qué modelo se usó por fase según la tabla de este plan), referencias y licencia. Hueco para el GIF o la captura.
- **Manual (usuario):** grabar el video y enlazar el repo y el sitio en Qollab antes de las 19:00 ET.
- **Commit:** `docs: README for hackathon submission`

---

## Orden y prioridades bajo el plazo
1. Fases 0 → 5 obligatorias (MVP). 6 inmediatamente después.
2. Fases 7 y 8 solo si sobra tiempo (7 antes que 8: da más valor a la demo).
3. Fase 9 siempre, aunque se salten 7 y 8.

Las fases 1 y 2 son independientes y pueden hacerse en paralelo en sesiones separadas; la 3 depende de ambas.

## Verificación end-to-end
- `pytest -q` (quantum, chain, ws) en verde tras las fases 1, 2, 3 y 7.
- Local: `uvicorn app.main:app --host 0.0.0.0`, abrir `/host?url=http://<IP-LAN>:8000`, unir 3 celulares por QR, completar una ronda aceptada y otra rechazada, recargar un celular a mitad de la votación y comprobar que recupera su qubit.
- Producción (Render): repetir la prueba con celulares reales en datos móviles y por wss.
