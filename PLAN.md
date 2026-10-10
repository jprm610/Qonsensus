# Entangled Consensus — App multijugador

Plan de implementación de la versión multijugador del proyecto *Entangled Consensus* (hackathon Qollab × IonQ, 9–11 oct 2026, y charla en el Quantum Lab de Bancolombia, 19 oct 2026).

La versión de Qollab (`index.html` + `main.js` + `main.css`, JS/Qiskit) ya funciona en el simulador integrado y en IonQ Forte. Esta app la extiende: **varias personas se conectan desde su celular, cada una es un validador**, y la blockchain avanza con elección de líder por estado W y votación por estado GHZ.

> Qollab no tiene API, así que esta app **no** llama a Qollab. Simula los mismos circuitos en el servidor con Qiskit Aer.

---

## 1. Objetivo y alcance

**Debe tener (MVP):**
1. Una sala a la que se entra escaneando un QR desde el celular, poniendo un nombre.
2. Una vista de "pantalla grande" (proyector) con los validadores conectados, la ronda en curso y la cadena.
3. Ronda de consenso:
   1. El anfitrión pulsa "Nuevo bloque".
   2. El servidor prepara un **|Wₙ⟩ repartido** (un qubit por validador conectado), mide, y el validador con 1 es el líder. Si sale 0 o más de un 1 (solo posible con ruido), se repite y se registra el intento.
   3. Al líder le llega "Eres el líder" y escribe el contenido del bloque.
   4. Todos los validadores votan Sí / No en su celular.
   5. El servidor arma un **|GHZₙ⟩**, cada votante "sí" aplica una fase θ = π/n **a su propio qubit**, se aplica H a todos, se mide con muchos shots y se estima el número de votos sí a partir de la paridad.
   6. Si los votos estimados alcanzan el quórum, el bloque se agrega a la cadena con su hash SHA-256.
4. Visualización de la cadena (hash, hash previo, líder, contenido, votos estimados) y de la "evidencia cuántica" de cada ronda (bitstring de W, P(par) del GHZ).

**Deseable (si hay tiempo):**
- Interruptor de ruido (modelo de ruido de Aer) para mostrar rondas de W descartadas y estimaciones GHZ imperfectas.
- Modo "alterar bloque" en la pantalla grande: editar el contenido de un bloque y ver la cadena romperse (ya existe en la versión de Qollab).
- Dibujo del circuito de la ronda actual.

**Fuera de alcance:** persistencia en base de datos, autenticación, varias salas simultáneas a escala, ejecución en hardware IonQ.

---

## 2. Arquitectura

```
 Celulares (validadores)  ──┐
                            ├── WebSocket ──►  Servidor FastAPI  ──►  Qiskit + Aer
 Pantalla grande (host)  ───┘                   (estado en memoria)     (circuitos W y GHZ)
```

- **Backend:** Python 3.11+, FastAPI, Uvicorn, WebSockets nativos de FastAPI, `qiskit` 2.x, `qiskit-aer`.
- **Frontend:** HTML + CSS + JavaScript sin framework, servido como estático por FastAPI. Dos páginas: `/` (validador, móvil) y `/host` (pantalla grande).
- **QR:** generado en el frontend del host con una librería JS desde CDN (por ejemplo `qrcode` en cdnjs) apuntando a la URL pública de la app.
- **Estado:** en memoria del proceso (una sola sala es suficiente para el MVP). Se pierde al reiniciar; aceptable.
- **Despliegue:** Render (web service gratuito, soporta WebSockets). El plan gratuito se duerme tras inactividad: abrir la URL unos minutos antes de la demo.

### Estructura de repo sugerida

```
entangled-consensus/
├── app/
│   ├── main.py            # FastAPI: rutas, WebSocket, máquina de estados de la ronda
│   ├── quantum.py         # circuitos W y GHZ + ejecución en Aer
│   ├── chain.py           # Block, Chain, SHA-256, verificación
│   └── room.py            # validadores conectados, ronda actual, broadcast
├── static/
│   ├── index.html         # vista validador (móvil)
│   ├── host.html          # vista pantalla grande
│   ├── app.js / host.js
│   └── style.css
├── qollab/                # copia de la versión de Qollab, como referencia
│   ├── index.html
│   ├── main.js
│   └── main.css
├── tests/
│   ├── test_quantum.py
│   └── test_chain.py
├── requirements.txt
├── render.yaml            # opcional
├── LICENSE                # MIT (requisito de la hackathon)
└── README.md
```

---

## 3. Motor cuántico (`quantum.py`)

Portar desde `qollab/main.js`. La matemática ya está verificada (simulación numérica y ejecuciones en Qollab).

### 3.1 Estado W (elección de líder)

Escalera con n qubits; deja amplitud 1/√n en cada qubit:

```
x(q[0])
para k = 0 … n-2:           # ojo: hasta n-2 (el Algoritmo 1 del paper itera hasta n-1, que se sale del registro)
    t = 2·acos( sqrt(1/(n-k)) )
    cry(t, q[k], q[k+1])
    cx(q[k+1], q[k])
measure all
```

- En Python, `QuantumCircuit.cry` existe; usarlo directamente.
- Resultado esperado sin ruido: exactamente un bit en 1, uniforme entre los n validadores.
- Qiskit ordena los bits little-endian: el qubit i es el carácter `s[-1-i]` del bitstring.
- Ejecutar con `shots=1` por intento (o un lote de shots e ir consumiéndolos). Si el resultado no tiene exactamente un 1, repetir y registrar el intento descartado.

### 3.2 Votación GHZ

```
h(q[0])
para i = 1 … n-1: cx(q[0], q[i])
para cada validador i que votó SÍ: p(θ, q[i])     # θ = π/n, cada uno sobre SU qubit
para todo i: h(q[i])
measure all
```

- P(paridad par) = (1 + cos(k·θ)) / 2, con k = número de votos sí.
- Estimación: `k_hat = round( acos(clamp(2·P_par − 1, −1, 1)) / θ )`.
- θ = π/n garantiza que k·θ ∈ [0, π], donde el coseno es invertible.
- **Shots:** la resolución empeora al crecer n y cerca de k = 0 y k = n. Usar ~2000 shots por votación (Aer es rápido). Verificar en tests que con n ≤ 10 y 2000 shots sin ruido `k_hat == k` siempre.
- Devolver también `P_par` y el conteo de paridades para mostrarlos como evidencia.

### 3.3 Ruido (deseable)

- `qiskit_aer.noise.NoiseModel` con error depolarizante de 1 y 2 qubits (por ejemplo 0.5–2 %) y error de lectura.
- Interruptor en la vista host. Con ruido aparecen rondas W descartadas (0 o 2 líderes) y `P_par` se aleja de la teoría.

### 3.4 Límites

- Validadores mínimos: 2. Máximos: 12 (circuitos de n qubits, cómodo para Aer).
- Si un validador se desconecta durante la ronda, se cancela la ronda y se vuelve al estado inicial.

---

## 4. Blockchain (`chain.py`)

- `Block`: `index`, `timestamp`, `leader`, `data`, `yes_estimated`, `n_validators`, `evidence` (bitstrings W, P_par), `prev_hash`, `hash`.
- `hash = sha256(json.dumps([index, timestamp, leader, data, yes_estimated, prev_hash]))` (misma idea que en Qollab).
- Bloque génesis con `prev_hash = "0"*64`.
- `verify()` devuelve el índice del primer bloque roto o −1.
- **Quórum:** `ceil(2n/3)` votos sí estimados (supermayoría estilo PBFT).

---

## 5. Máquina de estados de la ronda (`room.py` / `main.py`)

```
LOBBY ──(host: nuevo bloque, n ≥ 2)──► ELECTING ──(W con un solo 1)──► PROPOSING
  ▲                                                                       │ (líder envía contenido)
  │                                                                       ▼
  └──(bloque agregado o rechazado; host: siguiente)── RESULT ◄──(todos votaron o timeout)── VOTING
```

- **ELECTING:** el servidor corre W, emite el líder (y los intentos descartados).
- **PROPOSING:** solo el líder puede enviar `propose`. Timeout de 60 s → se re-elige.
- **VOTING:** cada validador envía `vote` una vez. Termina cuando todos votaron o a los 30 s (los que no votaron cuentan como No).
- **RESULT:** se corre GHZ, se decide, se agrega o no el bloque y se muestra el resultado.

---

## 6. Protocolo WebSocket

Un solo endpoint `/ws`. Mensajes JSON `{ "type": ..., ... }`.

**Cliente → servidor**

| type | quién | campos |
|---|---|---|
| `join` | validador | `name` |
| `join_host` | host | — |
| `new_block` | host | — |
| `propose` | líder | `data` |
| `vote` | validador | `yes: bool` |
| `toggle_noise` | host | `on: bool` |

**Servidor → clientes (broadcast)**

| type | campos |
|---|---|
| `state` | `phase`, `validators: [{id, name, qubit, voted}]`, `leader_id`, `proposal`, `chain`, `noise` |
| `you` | `id`, `qubit`, `is_leader` (solo al cliente correspondiente) |
| `w_result` | `bitstrings` (intentos), `leader_id` |
| `ghz_result` | `yes_real` (solo para la pantalla grande, opcional), `p_even`, `k_hat`, `quorum`, `accepted` |
| `error` | `message` |

El servidor es la fuente de verdad. Los clientes solo renderizan `state`.

---

## 7. Interfaz

### Validador (`/`, móvil)
- Pantalla de entrada: nombre y botón "Unirme".
- En espera: "Eres el validador q3 · esperando ronda".
- Si es líder: pantalla resaltada "¡Saliste 1 en el estado W! Eres el líder", campo de contenido del bloque y botón "Proponer".
- Votación: contenido propuesto, dos botones grandes Sí / No, y confirmación "Voto enviado (fase θ aplicada a tu qubit)".
- Resultado: aceptado o rechazado, y el bloque nuevo.

### Pantalla grande (`/host`)
- QR grande con la URL y el número de validadores conectados.
- Validadores como tarjetas `q0…qn-1`; el líder resaltado.
- Panel de la ronda: bitstring de W, intentos descartados, P(par) del GHZ, θ_total, votos estimados contra quórum.
- La cadena horizontal con hashes y estado de verificación.
- Botones: "Nuevo bloque", interruptor de ruido.
- Estética coherente con la versión de Qollab (`qollab/main.css`): fondo oscuro, acento naranja #ff7a1a, monoespaciada para datos cuánticos.

---

## 8. Tests mínimos

- `test_quantum.py`
  - W sin ruido, n = 2…8, 2000 shots: todos los bitstrings tienen exactamente un 1; cada validador entre 1/n ± 5 %.
  - GHZ sin ruido, n = 2…10, cada k = 0…n: `k_hat == k`.
- `test_chain.py`
  - Agregar bloques y verificar → −1.
  - Alterar `data` de un bloque intermedio → `verify()` devuelve ese índice.

---

## 9. Requisitos de la hackathon para el repo externo

- Repo **público**, sin login para verlo.
- Licencia **MIT** (`LICENSE`).
- Dependencias listadas en `requirements.txt`.
- **Sin claves ni secretos** en el código.
- En el README: qué existía antes de la ventana de la hackathon (nada de código; la base teórica son los papers), uso de IA (Claude / Claude Code) y créditos.

---

## 10. README (contenido a completar al final)

1. Qué es, en una línea, más un GIF o captura.
2. Cómo funciona: W repartido → líder; GHZ con fases → conteo de votos; quórum → bloque.
3. Relación con la versión de Qollab (un solo job, corre en IonQ) y por qué existe esta versión (multijugador, Qollab no tiene API).
4. Cómo correrlo local (`pip install -r requirements.txt`, `uvicorn app.main:app`) y el link desplegado.
5. Referencias:
   - J. P. Robledo, J. Mišić, V. Mišić — *W-State Leader Election for PBFT Based Quantum Leader Election*.
   - J. Mišić, V. B. Mišić — *Scalable Quantum Based Solutions for Blockchain Systems* (votación GHZ).
6. Uso de IA y licencia MIT.

---

## 11. Orden de trabajo sugerido

1. `quantum.py` + tests (portar desde `qollab/main.js`).
2. `chain.py` + tests.
3. Servidor con WebSocket y máquina de estados; probar con varias pestañas del navegador.
4. Vista validador (móvil).
5. Vista host con QR.
6. Despliegue en Render y prueba con 2–3 celulares reales.
7. Ruido (deseable).
8. README, enlazar repo y sitio en Qollab, grabar el video.

**Cierre de envíos:** domingo 11 oct, 19:00 ET (6:00 p. m. Colombia). Enviar un borrador en Qollab antes de terminar el multijugador; el formulario se puede editar hasta el cierre.
