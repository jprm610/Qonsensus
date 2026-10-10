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
      if (m.phase !== 'VOTING') myVote = null;
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
      ];
    case 'electing':
      return [
        h('h2', {}, 'Eligiendo líder'),
        h('p', {}, 'Midiendo el estado |W⟩ repartido entre los validadores…'),
        h('p', { class: 'muted' }, 'Tu qubit: ', h('span', { class: 'mono', id: 'qid' })),
      ];
    case 'propose':
      return [
        h('div', { class: 'card leader' },
          h('h2', {}, '¡Saliste 1 en el estado W!'),
          h('p', {}, 'Eres el líder. Escribe el contenido del bloque.')),
        h('textarea', { id: 'data', maxlength: '280', placeholder: 'Contenido del bloque…', rows: '4' }),
        h('button', { class: 'btn', id: 'propose', onclick: onPropose }, 'Proponer'),
        h('p', { class: 'countdown', id: 'countdown' }),
      ];
    case 'waitpropose':
      return [
        h('h2', {}, 'Líder elegido'),
        h('p', { id: 'leadername' }),
        h('p', {}, 'Está escribiendo el contenido del bloque…'),
        h('p', { class: 'countdown', id: 'countdown' }),
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
      ];
    case 'voted':
      return [
        h('h2', {}, 'Voto enviado'),
        h('p', { id: 'voteinfo' }),
        h('div', { class: 'card' }, h('p', { id: 'proposal' })),
        h('p', { class: 'muted', id: 'tally' }),
        h('p', { class: 'countdown', id: 'countdown' }),
      ];
    case 'result':
      return [
        h('h1', { id: 'verdict' }),
        h('p', { id: 'counts', class: 'mono' }),
        h('div', { class: 'card', id: 'blockcard' }),
        h('p', { class: 'muted' }, 'Esperando al anfitrión para la siguiente ronda…'),
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
  tick();
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
