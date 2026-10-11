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
let lastError = null;      // error mostrado en la pantalla de entrada (mensaje del servidor)
let retry = 0;
let screenKey = null;
let toastTimer = null;
let typedName = null;      // nombre a medio escribir, para no perderlo al cambiar de idioma

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
      lastError = null;
      break;
    }
    case 'state':
      state = m;
      if (typeof m.now === 'number') skew = m.now - Date.now() / 1000;
      if (m.phase === 'LOBBY' || m.phase === 'ELECTING') myVote = null;  // se conserva hasta el resultado
      break;
    case 'error':
      if (!you) lastError = m;           // rechazo al unirse
      else toast(I18N.err(m));
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
          h('p', { class: 'muted' }, t('v.youAre')),
          h('span', { class: 'qubit-badge', id: 'qid' }),
          h('p', { id: 'who' })),
        h('p', { id: 'peers', class: 'muted' }),
        h('p', {}, t('v.waitRound')),
        circuitCard(t('v.yourW')),
      ];
    case 'electing':
      return [
        h('h2', {}, t('v.electing')),
        h('p', { id: 'elecmsg' }, isLocal() ? t('v.electLocal') : t('v.electGlobal')),
        h('p', { class: 'muted' }, t('v.yourQubit'), h('span', { class: 'mono', id: 'qid' })),
        isLocal() ? wCard() : null,
        circuitCard(t('v.wMeasuring')),
      ];
    case 'propose':
      return [
        h('div', { class: 'card leader' },
          isLocal()
            ? [h('h2', {}, t('v.leaderLocalH')), h('p', {}, t('v.leaderLocalP'))]
            : [h('h2', {}, t('v.leaderGlobalH')), h('p', {}, t('v.leaderGlobalP'))]),
        h('textarea', { id: 'data', maxlength: '280', placeholder: t('v.blockPh'), rows: '4' }),
        h('button', { class: 'btn', id: 'propose', onclick: onPropose }, t('v.propose')),
        h('p', { class: 'countdown', id: 'countdown' }),
        wCard(),
      ];
    case 'waitpropose':
      return [
        h('h2', {}, t('v.leaderChosen')),
        h('p', { id: 'leadername' }),
        h('p', {}, t('v.writing')),
        h('p', { class: 'countdown', id: 'countdown' }),
        wCard(),
        circuitCard(t('v.wCircuit')),
      ];
    case 'vote':
      return [
        h('h2', {}, t('v.voteH')),
        h('div', { class: 'card' },
          h('p', { class: 'muted', id: 'proposer' }),
          h('p', { id: 'proposal' })),
        h('div', { class: 'vote-row' },
          h('button', { class: 'btn yes', onclick: () => onVote(true) }, t('v.yes')),
          h('button', { class: 'btn no', onclick: () => onVote(false) }, t('v.no'))),
        h('p', { class: 'countdown', id: 'countdown' }),
        circuitCard(t('v.ghzVoteCircuit')),
      ];
    case 'voted':
      return [
        h('h2', {}, t('v.voteSent')),
        h('p', { id: 'voteinfo' }),
        h('div', { class: 'card' }, h('p', { id: 'proposal' })),
        h('p', { class: 'muted', id: 'tally' }),
        h('p', { class: 'countdown', id: 'countdown' }),
        circuitCard(t('v.ghzVoteCircuit')),
      ];
    case 'result':
      return [
        h('h1', { id: 'verdict' }),
        h('p', { id: 'counts', class: 'mono' }),
        h('div', { class: 'card', id: 'blockcard' }),
        h('p', { class: 'muted' }, t('v.waitHost')),
        ghzCard(),
        circuitCard(t('v.ghzCircuit')),
        wCard(),
      ];
    default:
      return [h('p', { class: 'muted' }, t('v.connecting'))];
  }
}

function entryScreen() {
  const input = h('input', {
    id: 'name', type: 'text', maxlength: '24', placeholder: t('v.namePh'),
    autocomplete: 'nickname', autocapitalize: 'words', value: typedName != null ? typedName : name(),
  });
  const join = () => {
    const n = input.value.trim();
    if (!n) { input.focus(); return; }
    store.set('ec.name', n);
    lastError = null;
    send({ type: 'join', name: n, token: store.get('ec.token') || undefined });
    update('entry');
  };
  input.addEventListener('keydown', e => { if (e.key === 'Enter') join(); });
  return [
    h('h1', {}, 'Entangled Consensus'),
    h('p', { class: 'muted' }, t('v.joinIntro')),
    input,
    h('button', { class: 'btn', onclick: join }, t('v.joinBtn')),
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
  if (key === 'entry') { setText('entryerr', lastError ? I18N.err(lastError) : ''); return; }
  if (!state || !you) return;
  const mine = me();
  setText('qid', `q${you.qubit}`);
  switch (key) {
    case 'lobby': {
      setText('who', mine ? mine.name : '');
      const others = state.validators.length - 1;
      setText('peers', others <= 0 ? t('v.alone') : t('v.peers', { n: others }));
      break;
    }
    case 'electing':
      if (isLocal()) {
        const rounds = localRounds();
        const r = rounds[rounds.length - 1];
        setText('elecmsg', r
          ? t('v.roundMsg', { r: rounds.length, m: r.m, sub: sub(r.m) })
          : t('v.prepMsg', { sub: sub(state.validators.length) }));
      }
      break;
    case 'waitpropose':
      setText('leadername', t('v.isLeader', { name: leaderName(), q: (state.validators.find(v => v.id === state.leader_id) || {}).qubit }));
      break;
    case 'vote':
      setText('proposer', t('v.proposedBy', { name: leaderName() }));
      setText('proposal', state.proposal || '');
      break;
    case 'voted': {
      setText('proposal', state.proposal || '');
      setText('voteinfo', myVote === true ? t('v.votedYes')
        : myVote === false ? t('v.votedNo') : t('v.voteRecorded'));
      const done = state.validators.filter(v => v.voted).length;
      setText('tally', t('v.tally', { done, n: state.validators.length }));
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
    return { kind: 'w', yes: null, caption: t('v.cap.r1', { n, sub: sub(n), q }) };
  }
  const r = rounds[rounds.length - 1];
  const pos = r.contenders.indexOf(q);
  const base = t('v.cap.round', { r: rounds.length, m: r.m, sub: sub(r.m) });
  return {
    kind: 'w', yes: null, n: r.m, hl: pos >= 0 ? pos : null,
    caption: base + (pos >= 0 ? t('v.cap.mine', { pos }) : t('v.cap.out')),
  };
}

function circuitSpec(key) {
  const n = state.validators.length;
  const q = you.qubit;
  const theta = `π/${n}`;
  switch (key) {
    case 'lobby':
      if (isLocal()) {
        return { kind: 'w', yes: null, caption: t('v.cap.lobbyLocal', { sub: sub(n), q }) };
      }
      return { kind: 'w', yes: null, caption: t('v.cap.lobby', { q }) };
    case 'electing':
    case 'waitpropose':
      if (isLocal()) return localCircuitSpec(n, q);
      return { kind: 'w', yes: null, caption: t('v.cap.w', { sub: sub(n), n, q }) };
    case 'vote':
      return { kind: 'ghz', yes: [], caption: t('v.cap.vote', { theta, q }) };
    case 'voted':
    case 'result':
      if (myVote === true) return { kind: 'ghz', yes: [q], caption: t('v.cap.mineYes', { theta, q }) };
      if (myVote === false) return { kind: 'ghz', yes: [], caption: t('v.cap.mineNo', { q }) };
      return { kind: 'ghz', yes: [], caption: t('v.cap.secret') };
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
    setText('circuitcap', spec.n === 1 ? spec.caption + t('v.cap.one') : t('v.cap.needTwo'));
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
  pre.textContent = t('c.loadingCircuit');
  fetch(url)
    .then(r => (r.ok ? r.text() : Promise.reject(r.status)))
    .then(text => { circuitCache.set(url, text); paint(text); })
    .catch(() => {
      if (pre.dataset.key !== key) return;
      pre.textContent = t('c.circuitFailed');
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
    h('h3', {}, isLocal() ? t('v.wLocal') : t('v.wGlobal')),
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
      ? t('v.lr.inside', { pos: pos + 1, m: r.m, sub: sub(r.m), bit: r.bits[pos], sent })
      : t('v.lr.outside');
    let res;
    if (r.outcome === 'collision') {
      res = sent
        ? t('v.lr.hit', { others: names(r.intents.filter(x => x !== q)), all: names(r.intents) })
        : t('v.lr.collision', { all: names(r.intents), inside });
    } else if (r.outcome === 'silence') {
      res = t('v.lr.silence');
    } else {
      const lead = r.intents[0];
      res = lead === q
        ? t('v.lr.mine', { acks: r.acks, q: r.quorum })
        : t('v.lr.other', { who: qname(lead) });
    }
    return h('div', { class: 'lround ' + r.outcome },
      h('div', { class: 'lhead' }, t('h.lr.head', { i: i + 1, m: r.m })),
      h('div', { class: 'lchips' }, r.contenders.map((c, j) =>
        h('span', { class: 'lchip' + (r.bits[j] === 1 ? ' intent' : '') + (c === q ? ' mine' : '') }, `q${c}:${r.bits[j]}`))),
      h('p', { class: 'small' }, role),
      h('div', { class: 'lres ' + r.outcome }, res));
  });
  if (w.done && w.leader_qubit != null) {
    nodes.push(h('p', { class: 'wmsg' }, w.leader_qubit === q
      ? t('v.won') : t('v.otherWon', { who: qname(w.leader_qubit) })));
  } else if (!w.done) {
    nodes.push(h('p', { class: 'muted small' }, t('v.resolving')));
  }
  nodes.push(h('p', { class: 'muted small' }, t('c.gloss') + '.'));
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
    box.replaceChildren(h('p', { class: 'muted' }, t('v.noMeasure')));
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
      valid ? null : h('span', { class: 'muted small' }, t('v.discardedTag')));
  });
  let msg = t('v.noLeader');
  if (ok) {
    msg = w.attempts[last][q] === '1'
      ? t('v.mine1', { q })
      : t('v.mine0', { q, lq: w.leader_qubit, name: leaderName() });
  }
  const discarded = ok ? last : w.attempts.length;
  const nodes = [labels, ...rows, h('p', { class: 'wmsg' }, msg)];
  if (discarded > 0) {
    nodes.push(h('p', { class: 'muted small' }, t('v.discarded', { n: discarded })));
  }
  box.replaceChildren(...nodes);
}

// ---------------- Evidencia GHZ ----------------
function ghzCard() {
  return h('div', { class: 'card' }, h('h3', {}, t('v.ghzEvidence')), h('div', { id: 'gev', class: 'mono gev' }));
}

function renderGhzEvidence() {
  const box = $('gev');
  if (!box) return;
  const g = state.last_ghz;
  if (!g) { box.replaceChildren(h('p', { class: 'muted' }, '—')); return; }
  const n = Math.round(Math.PI / g.theta);
  box.replaceChildren(
    h('div', {}, t('v.ev.p', { p: g.p_even.toFixed(3), even: g.even, shots: g.shots })),
    h('div', {}, `θ_total = ${g.theta_total.toFixed(3)} rad`),
    h('div', {}, t('v.ev.k', { n, ratio: (g.theta_total / g.theta).toFixed(2), k: g.k_hat })),
    h('div', { class: g.accepted ? 'okt' : 'errt' }, t('v.ev.q', { q: g.quorum, ok: g.accepted })),
    h('p', { class: 'muted small' }, t('v.ev.note', { n })));
}

function renderResult() {
  const g = state.last_ghz;
  const accepted = !!(g && g.accepted);
  const verdict = $('verdict');
  if (verdict) {
    verdict.textContent = accepted ? t('v.accepted') : t('v.rejected');
    verdict.className = accepted ? 'okt' : 'errt';
  }
  if (g) setText('counts', t('v.counts', { k: g.k_hat, q: g.quorum }));
  const card = $('blockcard');
  if (!card) return;
  const b = accepted ? state.chain[state.chain.length - 1] : null;
  card.replaceChildren(...(b
    ? [
      h('p', { class: 'muted' }, t('v.blockHead', { i: b.index, name: b.leader })),
      h('p', {}, b.data),
      h('p', { class: 'hash' }, `hash ${b.hash.slice(0, 16)}…`),
    ]
    : [
      h('p', { class: 'muted' }, t('v.discardedProposal')),
      h('p', {}, state.proposal || ''),
    ]));
}

// ---------------- Cuenta regresiva ----------------
function tick() {
  const e = $('countdown');
  if (!e || !state || state.deadline == null) { if (e) e.textContent = ''; return; }
  const left = Math.max(0, Math.ceil(state.deadline - (Date.now() / 1000 + skew)));
  const label = state.phase === 'VOTING' ? t('c.toVote') : t('c.toPropose');
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

// ---------------- Idioma ----------------
document.addEventListener('langchange', () => {
  const input = $('name');
  typedName = input ? input.value : null;
  const area = $('data');
  const draft = area ? area.value : null;
  screenKey = null;                  // fuerza a reconstruir la pantalla en el nuevo idioma
  render();
  typedName = null;
  if (draft != null && $('data')) $('data').value = draft;
});

// ---------------- Arranque ----------------
I18N.applyStatic();
I18N.mountSwitch($('lang'));
render();
connect();
