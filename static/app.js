// Entangled Consensus — vista del validador (móvil). Sin frameworks.
// El servidor es la fuente de verdad: este cliente solo renderiza `state` y `you`.
'use strict';

// ---------------- Almacenamiento (puede fallar en modo privado) ----------------
const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* sin persistencia */ } },
  del(k) { try { localStorage.removeItem(k); } catch { /* sin persistencia */ } },
};

// ---------------- Helpers DOM (texto siempre vía textContent: sin XSS) ----------------
const $ = id => document.getElementById(id);
function h(tag, props = {}, ...children) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === 'class') e.className = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else if (v === true) e.setAttribute(k, '');
    else if (v !== false && v != null) e.setAttribute(k, v);
  }
  for (const c of children.flat()) {
    if (c != null && c !== false) e.append(c.nodeType ? c : document.createTextNode(String(c)));
  }
  return e;
}

// ---------------- Estado del cliente ----------------
let ws = null;
let you = null;            // {id, token, qubit, is_leader}
let state = null;          // último `state` del servidor
let skew = 0;              // reloj del servidor − reloj local (s)
let myVote = null;         // true/false/null (solo en memoria)
let lastError = '';        // error mostrado en la pantalla de entrada
let retry = 0;
let screenKey = null;
let toastTimer = null;

const name = () => store.get('ec.name') || '';

// ---------------- WebSocket con reconexión ----------------
function connect() {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  ws = new WebSocket(`${proto}://${location.host}/ws`);
  ws.onopen = () => {
    retry = 0;
    $('conn').hidden = true;
    const token = store.get('ec.token');
    if (token && name()) send({ type: 'join', name: name(), token });
    render();
  };
  ws.onmessage = ev => {
    let m;
    try { m = JSON.parse(ev.data); } catch { return; }
    onMessage(m);
  };
  ws.onclose = () => {
    $('conn').hidden = false;
    const delay = Math.min(5000, 1000 * 2 ** retry++);
    setTimeout(connect, delay);
  };
  ws.onerror = () => { try { ws.close(); } catch { /* ya cerrado */ } };
}

function send(msg) {
  if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
}

function onMessage(m) {
  switch (m.type) {
    case 'you': {
      const wasLeader = you && you.is_leader;
      you = m;
      store.set('ec.token', m.token);
      if (m.is_leader && !wasLeader && navigator.vibrate) navigator.vibrate(200);
      lastError = '';
      break;
    }
    case 'state':
      state = m;
      if (typeof m.now === 'number') skew = m.now - Date.now() / 1000;
      if (m.phase === 'LOBBY' || m.phase === 'ELECTING') myVote = null;  // se conserva hasta el resultado
      break;
    case 'error':
      if (!you) lastError = m.message;   // rechazo al unirse
      else toast(m.message);
      break;
    default:
      return;                            // w_result / ghz_result: ya reflejados en `state`
  }
  render();
}

// ---------------- Pantallas ----------------
function me() {
  return state && you ? state.validators.find(v => v.id === you.id) : null;
}

function currentScreen() {
  if (!you) return 'entry';
  if (!state) return 'wait';
  switch (state.phase) {
    case 'LOBBY': return 'lobby';
    case 'ELECTING': return 'electing';
    case 'PROPOSING': return state.leader_id === you.id ? 'propose' : 'waitpropose';
    case 'VOTING': return me() && me().voted ? 'voted' : 'vote';
    case 'RESULT': return 'result';
    default: return 'wait';
  }
}

function render() {
  const key = currentScreen();
  const app = $('app');
  if (key !== screenKey) {          // reconstruye solo al cambiar de pantalla
    screenKey = key;
    app.replaceChildren(...build(key));
  }
  update(key);
}

function build(key) {
  switch (key) {
    case 'entry': return entryScreen();
    case 'lobby':
      return [
        h('h1', {}, 'Entangled Consensus'),
        h('div', { class: 'card' },
          h('p', { class: 'muted' }, 'Eres el validador'),
          h('span', { class: 'qubit-badge', id: 'qid' }),
          h('p', { id: 'who' })),
        h('p', { id: 'peers', class: 'muted' }),
        h('p', {}, 'Esperando ronda… el anfitrión iniciará un nuevo bloque.'),
        circuitCard('Tu circuito |W⟩'),
      ];
    case 'electing':
      return [
        h('h2', {}, 'Eligiendo líder'),
        h('p', { id: 'elecmsg' }, isLocal()
          ? 'Cada validador mide su qubit de su propia copia local de |W⟩.'
          : 'Midiendo el estado |W⟩ repartido entre los validadores…'),
        h('p', { class: 'muted' }, 'Tu qubit: ', h('span', { class: 'mono', id: 'qid' })),
        isLocal() ? wCard() : null,
        circuitCard('Circuito |W⟩ que se está midiendo'),
      ];
    case 'propose':
      return [
        h('div', { class: 'card leader' },
          isLocal()
            ? [h('h2', {}, '¡Eres el líder!'),
              h('p', {}, 'Fuiste el único en enviar INTENT y los demás te reconocieron con ACK. Escribe el contenido del bloque.')]
            : [h('h2', {}, '¡Saliste 1 en el estado W!'),
              h('p', {}, 'Eres el líder. Escribe el contenido del bloque.')]),
        h('textarea', { id: 'data', maxlength: '280', placeholder: 'Contenido del bloque…', rows: '4' }),
        h('button', { class: 'btn', id: 'propose', onclick: onPropose }, 'Proponer'),
        h('p', { class: 'countdown', id: 'countdown' }),
        wCard(),
      ];
    case 'waitpropose':
      return [
        h('h2', {}, 'Líder elegido'),
        h('p', { id: 'leadername' }),
        h('p', {}, 'Está escribiendo el contenido del bloque…'),
        h('p', { class: 'countdown', id: 'countdown' }),
        wCard(),
        circuitCard('Circuito |W⟩'),
      ];
    case 'vote':
      return [
        h('h2', {}, 'Vota el bloque'),
        h('div', { class: 'card' },
          h('p', { class: 'muted', id: 'proposer' }),
          h('p', { id: 'proposal' })),
        h('div', { class: 'vote-row' },
          h('button', { class: 'btn yes', onclick: () => onVote(true) }, 'Sí'),
          h('button', { class: 'btn no', onclick: () => onVote(false) }, 'No')),
        h('p', { class: 'countdown', id: 'countdown' }),
        circuitCard('Circuito |GHZ⟩ de la votación'),
      ];
    case 'voted':
      return [
        h('h2', {}, 'Voto enviado'),
        h('p', { id: 'voteinfo' }),
        h('div', { class: 'card' }, h('p', { id: 'proposal' })),
        h('p', { class: 'muted', id: 'tally' }),
        h('p', { class: 'countdown', id: 'countdown' }),
        circuitCard('Circuito |GHZ⟩ de la votación'),
      ];
    case 'result':
      return [
        h('h1', { id: 'verdict' }),
        h('p', { id: 'counts', class: 'mono' }),
        h('div', { class: 'card', id: 'blockcard' }),
        h('p', { class: 'muted' }, 'Esperando al anfitrión para la siguiente ronda…'),
        ghzCard(),
        circuitCard('Circuito |GHZ⟩'),
        wCard(),
      ];
    default:
      return [h('p', { class: 'muted' }, 'Conectando…')];
  }
}

function entryScreen() {
  const input = h('input', {
    id: 'name', type: 'text', maxlength: '24', placeholder: 'Tu nombre',
    autocomplete: 'nickname', autocapitalize: 'words', value: name(),
  });
  const join = () => {
    const n = input.value.trim();
    if (!n) { input.focus(); return; }
    store.set('ec.name', n);
    lastError = '';
    send({ type: 'join', name: n, token: store.get('ec.token') || undefined });
    update('entry');
  };
  input.addEventListener('keydown', e => { if (e.key === 'Enter') join(); });
  return [
    h('h1', {}, 'Entangled Consensus'),
    h('p', { class: 'muted' }, 'Únete como validador: tu celular será un qubit de la ronda.'),
    input,
    h('button', { class: 'btn', onclick: join }, 'Unirme'),
    h('p', { class: 'errt', id: 'entryerr' }),
  ];
}

// ---------------- Actualizaciones sin reconstruir (conserva el textarea) ----------------
function setText(id, text) {
  const e = $(id);
  if (e && e.textContent !== text) e.textContent = text;
}

function leaderName() {
  const v = state.validators.find(x => x.id === state.leader_id);
  return v ? v.name : '—';
}

function update(key) {
  if (key === 'entry') { setText('entryerr', lastError); return; }
  if (!state || !you) return;
  const mine = me();
  setText('qid', `q${you.qubit}`);
  switch (key) {
    case 'lobby': {
      setText('who', mine ? mine.name : '');
      const others = state.validators.length - 1;
      setText('peers', others <= 0
        ? 'Eres el único validador por ahora.'
        : `Hay ${others} validador${others === 1 ? '' : 'es'} más conectado${others === 1 ? '' : 's'}.`);
      break;
    }
    case 'electing':
      if (isLocal()) {
        const rounds = localRounds();
        const r = rounds[rounds.length - 1];
        setText('elecmsg', r
          ? `Ronda ${rounds.length}: ${r.m} contendiente${r.m === 1 ? '' : 's'} miden su copia local de |W${sub(r.m)}⟩.`
          : `Cada validador prepara su copia local de |W${sub(state.validators.length)}⟩…`);
      }
      break;
    case 'waitpropose':
      setText('leadername', `${leaderName()} (q${(state.validators.find(v => v.id === state.leader_id) || {}).qubit}) es el líder.`);
      break;
    case 'vote':
      setText('proposer', `Propuesto por ${leaderName()}`);
      setText('proposal', state.proposal || '');
      break;
    case 'voted': {
      setText('proposal', state.proposal || '');
      setText('voteinfo', myVote === true
        ? 'Votaste Sí (fase θ aplicada a tu qubit).'
        : myVote === false ? 'Votaste No (tu qubit queda sin fase).'
        : 'Tu voto ya fue registrado.');
      const done = state.validators.filter(v => v.voted).length;
      setText('tally', `Han votado ${done} de ${state.validators.length}. Esperando al resto…`);
      break;
    }
    case 'result': renderResult(); break;
  }
  renderWMeasure();
  renderGhzEvidence();
  const spec = circuitSpec(key);
  if (spec) showCircuit(spec);
  tick();
}

// ---------------- Circuito en vivo (crece con cada validador) ----------------
const circuitCache = new Map();   // url -> dibujo de texto

function sub(n) {   // subíndice numérico: 3 -> ₃
  return String(n).replace(/\d/g, d => '₀₁₂₃₄₅₆₇₈₉'[d]);
}

function circuitCard(title) {
  return h('div', { class: 'card' },
    h('h3', {}, title),
    h('p', { class: 'muted small', id: 'circuitcap' }),
    h('pre', { class: 'circuit', id: 'circuit' }));
}

function isLocal() { return !!state && state.election_mode === 'local'; }

function qname(q) {
  const v = state.validators.find(x => x.qubit === q);
  return v ? `${v.name} (q${q})` : `q${q}`;
}

function localRounds() {
  const w = state.last_w;
  return w && w.mode === 'local' ? w.rounds : [];
}

// Circuito de la ronda local en curso: m contendientes, resaltando mi posición en la ventana
function localCircuitSpec(n, q) {
  const rounds = localRounds();
  if (!rounds.length) {
    return { kind: 'w', yes: null, caption: `Ronda 1: los ${n} validadores miden su copia local de |W${sub(n)}⟩. Tu qubit es q_${q}.` };
  }
  const r = rounds[rounds.length - 1];
  const pos = r.contenders.indexOf(q);
  const base = `Ronda ${rounds.length}: ${r.m} contendiente${r.m === 1 ? '' : 's'} miden su copia local de |W${sub(r.m)}⟩.`;
  return {
    kind: 'w', yes: null, n: r.m, hl: pos >= 0 ? pos : null,
    caption: base + (pos >= 0 ? ` Tu qubit es la línea q_${pos} (resaltada).` : ' Ya no compites: escuchas los INTENT.'),
  };
}

function circuitSpec(key) {
  const n = state.validators.length;
  const q = you.qubit;
  const theta = `π/${n}`;
  switch (key) {
    case 'lobby':
      if (isLocal()) {
        return { kind: 'w', yes: null, caption: `Elección local (closing window): cada validador prepara su propia copia de |W${sub(n)}⟩ y mide solo su qubit q_${q} (resaltado).` };
      }
      return { kind: 'w', yes: null, caption: `Un qubit por validador: con cada persona que entra, el circuito crece. Tu qubit es q_${q} (resaltado).` };
    case 'electing':
    case 'waitpropose':
      if (isLocal()) return localCircuitSpec(n, q);
      return { kind: 'w', yes: null, caption: `|W${sub(n)}⟩ deja amplitud 1/√${n} en cada qubit; al medirlo, exactamente uno sale en 1. Tu qubit es q_${q}.` };
    case 'vote':
      return { kind: 'ghz', yes: [], caption: `Si votas Sí, se añade una fase P(${theta}) en tu qubit q_${q}.` };
    case 'voted':
    case 'result':
      if (myVote === true) return { kind: 'ghz', yes: [q], caption: `Tu fase P(${theta}) está en q_${q}. Las fases de los demás son secretas.` };
      if (myVote === false) return { kind: 'ghz', yes: [], caption: `Votaste No: tu qubit q_${q} queda sin fase. Las fases de los demás son secretas.` };
      return { kind: 'ghz', yes: [], caption: 'Las fases de los votantes son secretas; aquí se ve el GHZ sin fases.' };
    default:
      return null;
  }
}

function showCircuit(spec) {
  const pre = $('circuit');
  if (!pre) return;
  const n = spec.n != null ? spec.n : state.validators.length;
  const hl = spec.hl !== undefined ? spec.hl : you.qubit;   // null = sin línea resaltada
  if (n < 2) {
    pre.hidden = true;
    pre.dataset.key = '';
    setText('circuitcap', spec.n === 1
      ? `${spec.caption} Con un solo contendiente |W₁⟩ = |1⟩ (basta una puerta X): no hay circuito que dibujar.`
      : 'El circuito aparece cuando haya al menos 2 validadores.');
    return;
  }
  pre.hidden = false;
  setText('circuitcap', spec.caption);
  let url = `/circuit?kind=${spec.kind}&n=${n}`;
  if (spec.yes) url += `&yes=${spec.yes.join(',')}`;
  const key = `${url}#${hl}`;
  if (pre.dataset.key === key) return;       // ya pintado
  pre.dataset.key = key;
  const paint = text => { if (pre.dataset.key === key) paintCircuit(pre, text, hl); };
  if (circuitCache.has(url)) { paint(circuitCache.get(url)); return; }
  pre.textContent = 'Cargando circuito…';
  fetch(url)
    .then(r => (r.ok ? r.text() : Promise.reject(r.status)))
    .then(text => { circuitCache.set(url, text); paint(text); })
    .catch(() => {
      if (pre.dataset.key !== key) return;
      pre.textContent = 'No se pudo cargar el circuito.';
      pre.dataset.key = '';                   // reintenta en el próximo `state`
    });
}

function paintCircuit(pre, text, q) {   // resalta la línea del qubit propio
  const lines = text.split('\n');
  const nodes = [];
  lines.forEach((line, i) => {
    const m = line.match(/^\s*q_(\d+):/);
    nodes.push(m && Number(m[1]) === q ? h('span', { class: 'mine' }, line) : document.createTextNode(line));
    if (i < lines.length - 1) nodes.push(document.createTextNode('\n'));
  });
  pre.replaceChildren(...nodes);
}

// ---------------- Tu qubit en la medición W ----------------
function wCard() {
  return h('div', { class: 'card' },
    h('h3', {}, isLocal() ? 'Medición local · closing window' : 'Medición del |W⟩'),
    h('div', { id: 'wmeas' }));
}

// Closing window: por ronda, mi bit, si envié INTENT y cómo se resolvió
function renderLocalMeasure(box, w) {
  const q = you.qubit;
  const names = qs => qs.map(qname).join(', ');
  const nodes = w.rounds.map((r, i) => {
    const pos = r.contenders.indexOf(q);
    const inside = pos >= 0;
    const sent = inside && r.bits[pos] === 1;
    const role = inside
      ? `Mediste tu qubit (posición ${pos + 1} de ${r.m}) de tu copia local de |W${sub(r.m)}⟩ → ${r.bits[pos]} → ${sent ? 'enviaste INTENT' : 'escuchaste'}.`
      : 'Ya no compites en esta ventana: escuchas los INTENT.';
    let res;
    if (r.outcome === 'collision') {
      res = sent
        ? `Colisión: chocaste con ${names(r.intents.filter(x => x !== q))}. La ventana se cierra a ${names(r.intents)}; sigues compitiendo.`
        : `Colisión entre ${names(r.intents)}: no envías ACK.${inside ? ' Quedas fuera de la ventana.' : ''}`;
    } else if (r.outcome === 'silence') {
      res = 'Nadie envió INTENT: se repite con los mismos contendientes.';
    } else {
      const lead = r.intents[0];
      res = lead === q
        ? `Eres el único INTENT: recibes ${r.acks}/${r.quorum} ACK ≥ Q = ${r.quorum} → COMMIT: eres el líder.`
        : `${qname(lead)} es el único INTENT: le envías ACK → COMMIT: es el líder.`;
    }
    return h('div', { class: 'lround ' + r.outcome },
      h('div', { class: 'lhead' }, `Ronda ${i + 1} · m = ${r.m}`),
      h('div', { class: 'lchips' }, r.contenders.map((c, j) =>
        h('span', { class: 'lchip' + (r.bits[j] === 1 ? ' intent' : '') + (c === q ? ' mine' : '') }, `q${c}:${r.bits[j]}`))),
      h('p', { class: 'small' }, role),
      h('div', { class: 'lres ' + r.outcome }, res));
  });
  if (w.done && w.leader_qubit != null) {
    nodes.push(h('p', { class: 'wmsg' }, w.leader_qubit === q
      ? 'Ganaste la elección: eres el líder.'
      : `${qname(w.leader_qubit)} ganó la elección y es el líder.`));
  } else if (!w.done) {
    nodes.push(h('p', { class: 'muted small' }, 'Resolviendo la siguiente ronda…'));
  }
  nodes.push(h('p', { class: 'muted small' },
    'INTENT = quiero liderar · ACK = te reconozco · Q = quórum de ACKs · ventana = contendientes activos.'));
  box.replaceChildren(...nodes);
}

function renderWMeasure() {
  const box = $('wmeas');
  if (!box) return;
  const w = state.last_w;
  if (w && w.mode === 'local' && w.rounds.length) {
    renderLocalMeasure(box, w);
    return;
  }
  if (!w || !w.attempts || !w.attempts.length) {
    box.replaceChildren(h('p', { class: 'muted' }, 'Aún no hay medición.'));
    return;
  }
  const q = you.qubit;
  const ok = w.leader_qubit != null;
  const last = w.attempts.length - 1;
  const labels = h('div', { class: 'wbits labels' },
    [...w.attempts[0]].map((_, j) => h('span', { class: 'bit' + (j === q ? ' mine' : '') }, `q${j}`)));
  const rows = w.attempts.map((s, i) => {
    const valid = ok && i === last;
    return h('div', { class: 'wrow' + (valid ? '' : ' bad') },
      h('div', { class: 'wbits' },
        [...s].map((c, j) => h('span', { class: 'bit' + (c === '1' ? ' one' : '') + (j === q ? ' mine' : '') }, c))),
      valid ? null : h('span', { class: 'muted small' }, 'descartado'));
  });
  let msg = 'No se obtuvo un líder único.';
  if (ok) {
    msg = w.attempts[last][q] === '1'
      ? `Tu qubit q${q} midió 1: eres el líder.`
      : `Tu qubit q${q} midió 0. Salió 1 en q${w.leader_qubit}: ${leaderName()} es el líder.`;
  }
  const discarded = ok ? last : w.attempts.length;
  const nodes = [labels, ...rows, h('p', { class: 'wmsg' }, msg)];
  if (discarded > 0) {
    nodes.push(h('p', { class: 'muted small' },
      `${discarded} medición${discarded === 1 ? '' : 'es'} descartada${discarded === 1 ? '' : 's'}: no tenía${discarded === 1 ? '' : 'n'} exactamente un 1 (efecto del ruido).`));
  }
  box.replaceChildren(...nodes);
}

// ---------------- Evidencia GHZ ----------------
function ghzCard() {
  return h('div', { class: 'card' }, h('h3', {}, 'Evidencia |GHZ⟩'), h('div', { id: 'gev', class: 'mono gev' }));
}

function renderGhzEvidence() {
  const box = $('gev');
  if (!box) return;
  const g = state.last_ghz;
  if (!g) { box.replaceChildren(h('p', { class: 'muted' }, '—')); return; }
  const n = Math.round(Math.PI / g.theta);
  box.replaceChildren(
    h('div', {}, `P(par) = ${g.p_even.toFixed(3)}  (${g.even} de ${g.shots} disparos)`),
    h('div', {}, `θ_total = ${g.theta_total.toFixed(3)} rad`),
    h('div', {}, `k̂ = θ_total / (π/${n}) ≈ ${(g.theta_total / g.theta).toFixed(2)} → ${g.k_hat} votos sí`),
    h('div', { class: g.accepted ? 'okt' : 'errt' }, `quórum ${g.quorum} → ${g.accepted ? 'aceptado' : 'rechazado'}`),
    h('p', { class: 'muted small' },
      `Con k votos sí, P(par) = (1 + cos(k·π/${n})) / 2. Midiendo la paridad muchas veces se despeja k sin revelar quién votó qué.`));
}

function renderResult() {
  const g = state.last_ghz;
  const accepted = !!(g && g.accepted);
  const verdict = $('verdict');
  if (verdict) {
    verdict.textContent = accepted ? 'Bloque aceptado' : 'Bloque rechazado';
    verdict.className = accepted ? 'okt' : 'errt';
  }
  if (g) setText('counts', `Votos sí estimados (GHZ): ${g.k_hat} · quórum ${g.quorum}`);
  const card = $('blockcard');
  if (!card) return;
  const b = accepted ? state.chain[state.chain.length - 1] : null;
  card.replaceChildren(...(b
    ? [
      h('p', { class: 'muted' }, `Bloque #${b.index} · líder: ${b.leader}`),
      h('p', {}, b.data),
      h('p', { class: 'hash' }, `hash ${b.hash.slice(0, 16)}…`),
    ]
    : [
      h('p', { class: 'muted' }, 'Propuesta descartada'),
      h('p', {}, state.proposal || ''),
    ]));
}

// ---------------- Cuenta regresiva ----------------
function tick() {
  const e = $('countdown');
  if (!e || !state || state.deadline == null) { if (e) e.textContent = ''; return; }
  const left = Math.max(0, Math.ceil(state.deadline - (Date.now() / 1000 + skew)));
  const label = state.phase === 'VOTING' ? 'para votar' : 'para proponer';
  e.replaceChildren(h('b', {}, `${left} s`), ` ${label}`);
}
setInterval(tick, 250);

// ---------------- Acciones ----------------
function onPropose() {
  const area = $('data');
  const data = area.value.trim();
  if (!data) { area.focus(); return; }
  $('propose').disabled = true;       // el estado VOTING reconstruye la pantalla
  send({ type: 'propose', data });
  setTimeout(() => { const b = $('propose'); if (b) b.disabled = false; }, 2000);
}

function onVote(yes) {
  myVote = yes;
  send({ type: 'vote', yes });
}

function toast(msg) {
  const t = $('toast');
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, 4000);
}

// ---------------- Arranque ----------------
render();
connect();
