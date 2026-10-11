# Entangled Consensus

Blockchain multijugador donde cada celular es un validador: el líder se elige con un estado **W** repartido entre los validadores y cada bloque se aprueba contando votos con un estado **GHZ** con fases.

> **Demo desplegada:** <https://qonsensus.onrender.com> · pantalla grande en <https://qonsensus.onrender.com/host> (plan gratuito: tarda ~1 min en despertar si estuvo inactiva).
>
> *GIF o captura pendiente:* pantalla grande con el QR, la elección del líder, la votación y la cadena.

---

## Cómo funciona

Cada ronda sigue cuatro pasos. Todos los números salen de mediciones reales de un simulador cuántico (Qiskit Aer), no de un generador aleatorio clásico.

1. **Elección del líder (estado W).** El servidor prepara un |Wₙ⟩ con un qubit por validador conectado (2 a 12). Al medirlo, exactamente un qubit sale en 1: ese validador es el líder. Si sale cero unos o más de uno (sólo posible con ruido), se repite y el intento queda registrado.
2. **Propuesta.** El líder escribe el contenido del bloque (280 caracteres como máximo). Si no propone en 60 s, se elige otro líder.
3. **Votación (estado GHZ).** Se prepara un |GHZₙ⟩. Cada validador que vota **sí** aplica una fase θ = π/n a **su propio qubit**; luego se mide el estado con 2000 shots. La paridad de los resultados revela cuántos votaron sí: P(par) = (1 + cos(k·θ))/2, de donde se estima k. Quien no vota en 30 s cuenta como no.
4. **Quórum.** Si los votos sí estimados alcanzan ⌈2n/3⌉ (supermayoría al estilo PBFT), el bloque entra en la cadena con su hash SHA-256 y el hash del bloque anterior. Cualquier edición posterior rompe la cadena desde ese punto.

La pantalla grande muestra la evidencia de cada ronda: los intentos de W (los descartados tachados), P(par) del GHZ, θ total, votos estimados frente al quórum y la verificación de la cadena.

### Ruido (opcional)

El interruptor "Ruido" de la pantalla grande activa un modelo de Aer con error depolarizante de 1 qubit (1 %), de 2 qubits (2 %) y de lectura (2 %). Con ruido aparecen rondas de W descartadas (del 12 % de los disparos con 3 validadores, hasta casi la mitad con 12) y la estimación de votos se sesga hacia el centro: con pocos votos sube y con casi todos baja. Por eso el quórum puede rechazar, o aceptar, algún bloque que la votación real no decidía.

### Modo demostración

El anfitrión puede **alterar el contenido de un bloque** desde la pantalla grande: la cadena se rompe y todos los celulares la ven rota. El botón "Reparar" recalcula los hashes desde el bloque alterado; es sólo para mostrar que la verificación detecta la manipulación, no es una corrección real.

El botón "Circuito" dibuja el circuito W o GHZ actual.

---

## Relación con la versión de Qollab

La carpeta [`qollab/`](qollab/) contiene la versión original que corre como un solo trabajo en un simulador o en hardware IonQ desde la plataforma de Qollab. Usa un único job por ejecución: un registro de W y uno GHZ por cada número posible de votos, y consume esas mediciones reales para el consenso.

Esta app existe porque **Qollab no tiene API**, así que no se puede llamar desde una aplicación que necesite varios participantes. Aquí no se llama a Qollab: los mismos circuitos se simulan en el servidor con Qiskit Aer, y los validadores se conectan desde sus celulares por WebSocket.

---

## Correr en local

Requiere Python 3.11 o superior.

```bash
python -m venv .venv
source .venv/bin/activate        # en Windows: .venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload --host 0.0.0.0
```

- Validadores: `http://<tu-IP>:8000/` (desde el celular, en la misma red).
- Pantalla grande: `http://localhost:8000/host`. Para que el QR apunte a tu IP de red local, usa `http://localhost:8000/host?url=http://<tu-IP>:8000/`.

Con Docker (la misma imagen que usa el despliegue en Render):

```bash
docker build -t entangled-consensus .
docker run -p 8000:8000 entangled-consensus
```

Pruebas:

```bash
pytest -q
```

Hay 70 pruebas: circuitos y estimación de votos, cadena y quórum, máquina de estados por WebSocket, ruido, y el endpoint del circuito.

### Estructura

```
app/
  main.py      rutas HTTP y WebSocket /ws
  room.py      sala, validadores, fases y temporizadores
  quantum.py   circuitos W y GHZ, ruido, ejecución en Aer
  chain.py     bloques, SHA-256, verificación y quórum
static/        vista validador (index.html) y pantalla grande (host.html)
tests/         pruebas unitarias y de integración
qollab/        versión original de Qollab, como referencia
docs/PHASES.md plan de implementación por fases, con el modelo asignado a cada una
```

---

## Referencias

- J. P. Robledo, J. Mišić, V. Mišić. *W-State Leader Election for PBFT Based Quantum Leader Election.*
- J. Mišić, V. B. Mišić. *Scalable Quantum Based Solutions for Blockchain Systems* (votación con estados GHZ).

## Qué existía antes de la hackathon

Antes de la ventana de la hackathon (9–11 oct 2026) no existía código de esta app. La base teórica son los dos papers de arriba.

`<CONFIRMAR: indicar si la versión de Qollab en qollab/ se escribió antes o durante la ventana.>`

## Uso de IA

El proyecto se desarrolló con **Claude Code**, con un modelo distinto por fase para optimizar el uso de tokens. El plan de cada fase y el modelo asignado están en [`docs/PHASES.md`](docs/PHASES.md). Los modelos usados fueron:

| Fase | Contenido | Modelo |
|---|---|---|
| 0 | Andamiaje | Claude Haiku 5.5 |
| 1 | Motor cuántico | Claude Sonnet 5.5 |
| 2 | Blockchain | Claude Haiku 4.5 |
| 3 | Servidor y máquina de estados | Claude Opus 5.5 |
| 4 | Vista del validador | Claude Sonnet 5.5 |
| 5 | Pantalla grande | Claude Sonnet 5.5 |
| 6 | Despliegue en Render | Claude Haiku 5.5 |
| 7 | Ruido | Claude Sonnet 5.5 |
| 8 | Alterar bloque y circuito | Claude Sonnet 5.5 |
| 9 | README | Claude Haiku 5.5 |

El plan, la dirección del trabajo y las decisiones de diseño son de una persona; Claude Code escribió el código y las pruebas. Cada fase se verificó con pruebas automáticas, y las fases de interfaz además en un navegador headless contra el servidor real.

## Créditos

- Hackathon Qollab × IonQ (9–11 oct 2026) y charla en el Quantum Lab de Bancolombia (19 oct 2026).
- Autor: jprm610.

## Licencia

[MIT](LICENSE).
