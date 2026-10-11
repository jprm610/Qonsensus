// Entangled Consensus — pantalla grande (host). Sin frameworks.
// El servidor es la fuente de verdad: este cliente solo renderiza `state` y los resultados.
'use strict';

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
let state = null;
let skew = 0;           // reloj del servidor − reloj local (s)
let yesReal = null;     // solo llega en `ghz_result` (no está en `state`)
let retry = 0;
let toastTimer = null;

// ---------------- QR (se construye una sola vez) ----------------
const params = new URLSearchParams(location.search);
const JOIN_URL = params.get('url') || (location.origin + '/');
const LOCAL_URL = /^(localhost|127\.|\[::1\])/.test(new URL(JOIN_URL).hostname);

function buildQR() {
  $('url').textContent = JOIN_URL;
  const box = $('qr');
  if (typeof QRCode === 'undefined') {   // CDN no disponible (sin internet)
    box.append(h('div', { class: 'noqr', id: 'noqr' }));
  } else {
    new QRCode(box, { text: JOIN_URL, width: 512, height: 512, colorDark: '#000000', colorLight: '#ffffff', correctLevel: QRCode.CorrectLevel.M });
  }
  $('hint').classList.toggle('warn', LOCAL_URL);
  renderQRText();
}

function renderQRText() {
  setText('noqr', t('h.noQR'));
  setText('hint', LOCAL_URL ? t('h.localUrl') : t('h.scanHint'));
}

// ---------------- WebSocket con reconexión ----------------
function connect() {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  ws = new WebSocket(`${proto}://${location.host}/ws`);
  ws.onopen = () => {
    retry = 0;
    $('conn').hidden = true;
    send({ type: 'join_host' });
  };
  ws.onmessage = ev => {
    let m;
    try { m = JSON.parse(ev.data); } catch { return; }
    onMessage(m);
  };
  ws.onclose = () => {
    $('conn').hidden = false;
    setTimeout(connect, Math.min(5000, 1000 * 2 ** retry++));
  };
  ws.onerror = () => { try { ws.close(); } catch { /* ya cerrado */ } };
}

function send(msg) {
  if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
}

function onMessage(m) {
  switch (m.type) {
    case 'state':
      state = m;
      if (typeof m.now === 'number') skew = m.now - Date.now() / 1000;
      if (m.phase === 'ELECTING' || m.phase === 'LOBBY') yesReal = null;
      render();
      break;
    case 'ghz_result':
      yesReal = m.yes_real;
      render();
      break;
    case 'error':
      toast(I18N.err(m));
      if (state) renderChain();          // descarta una edición rechazada
      break;
    default:
      break;                             // w_result: ya reflejado en `state.last_w`
  }
}

// ---------------- Render ----------------
function nameOf(id) {
  const v = state.validators.find(x => x.id === id);
  return v ? `${v.name} (q${v.qubit})` : '—';
}

function render() {
  if (!state) return;
  const vals = state.validators;
  const online = vals.filter(v => v.connected).length;

  // Panel QR
  setText('count', t('h.count', { n: vals.length }));

  // Botones
  const inLobby = state.phase === 'LOBBY';
  $('newblock').disabled = !(inLobby && vals.length >= 2 && online === vals.length);
  $('next').disabled = state.phase !== 'RESULT';
  const noise = $('noise');
  noise.disabled = !state.noise_available || !inLobby;
  noise.checked = !!state.noise;
  document.querySelectorAll('#election button').forEach(b => {
    const on = b.dataset.mode === (state.election_mode || 'global');
    b.classList.toggle('active', on);
    b.setAttribute('aria-checked', String(on));
    b.disabled = !inLobby;
  });
  $('election').classList.toggle('locked', !inLobby);
  $('noise-label').classList.toggle('off', !state.noise_available);
  $('noise-label').title = state.noise_available ? t('h.noiseOn') : t('h.noiseOff');

  renderValidators();
  renderRound();
  renderChain();
}

function setText(id, text) {
  const e = $(id);
  if (e && e.textContent !== text) e.textContent = text;
}

function renderValidators() {
  const box = $('validators');
  const inRound = state.phase !== 'LOBBY';
  setText('vsub', inRound ? t('h.roundN', { n: state.validators.length }) : '');
  if (!state.validators.length) {
    box.replaceChildren(h('p', { class: 'muted' }, t('h.noValidators')));
    return;
  }
  const active = localActive();   // null si no es una elección local en curso
  box.replaceChildren(...state.validators.map(v => {
    const leader = inRound && v.id === state.leader_id && state.phase !== 'ELECTING';
    const out = active && !active.includes(v.qubit);
    const cls = ['vnode', leader ? 'leader' : '', out ? 'out' : '', v.voted && state.phase === 'VOTING' ? 'voted' : '', v.connected ? '' : 'off']
      .filter(Boolean).join(' ');
    let tag = '';
    if (!v.connected) tag = t('h.tag.off');
    else if (active) tag = out ? t('h.tag.out') : t('h.tag.contender');
    else if (leader && state.phase === 'PROPOSING') tag = t('h.tag.writing');
    else if (leader) tag = t('h.tag.leader');
    else if (state.phase === 'VOTING') tag = v.voted ? t('h.tag.voted') : t('h.tag.thinking');
    return h('div', { class: cls },
      h('div', { class: 'q' }, `q${v.qubit}`),
      h('div', { class: 'n' }, v.name),
      h('div', { class: 'tag' }, tag));
  }));
}

function renderRound() {
  const ph = $('phase');
  ph.textContent = t('h.phase.' + state.phase);
  ph.className = 'chip' + (state.phase === 'LOBBY' ? '' : ' active');

  const n = state.validators.length;
  let msg = '';
  switch (state.phase) {
    case 'LOBBY':
      msg = n < 2 ? t('h.waitTwo') : t('h.ready');
      break;
    case 'ELECTING': {
      const w = state.last_w;
      if (state.election_mode !== 'local') msg = t('h.measuringGlobal', { sub: sub(n) });
      else if (w && w.mode === 'local' && w.rounds.length) {
        const r = w.rounds[w.rounds.length - 1];
        msg = t('h.measuringLocal', { r: w.rounds.length, m: r.m, sub: sub(r.m) });
      } else msg = t('h.preparingLocal', { sub: sub(n) });
      break;
    }
    case 'PROPOSING': msg = t('h.leaderWriting', { name: nameOf(state.leader_id) }); break;
    case 'VOTING': {
      const done = state.validators.filter(v => v.voted).length;
      msg = t('h.votingProgress', { done, n });
      break;
    }
    case 'RESULT': msg = state.last_ghz && state.last_ghz.accepted ? t('h.accepted') : t('h.rejected'); break;
    default: break;
  }
  setText('phasemsg', msg);

  const prop = $('proposal');
  if (state.proposal && state.phase !== 'LOBBY') {
    prop.hidden = false;
    prop.textContent = `“${state.proposal}”`;
  } else {
    prop.hidden = true;
  }

  renderW();
  renderGHZ();
  tick();
}

function sub(n) {   // subíndice numérico: 3 -> ₃
  return String(n).replace(/\d/g, d => '₀₁₂₃₄₅₆₇₈₉'[d]);
}

// Contendientes que siguen en la ventana tras la última ronda revelada (null = no aplica)
function localActive() {
  if (state.election_mode !== 'local' || state.phase !== 'ELECTING') return null;
  const w = state.last_w;
  const all = state.validators.map(v => v.qubit);
  if (!w || w.mode !== 'local' || !w.rounds.length) return all;
  const r = w.rounds[w.rounds.length - 1];
  if (r.outcome === 'collision' || r.outcome === 'leader') return r.intents;
  return r.contenders;
}

function renderWLocal(box, w) {
  const who = q => {
    const v = state.validators.find(x => x.qubit === q);
    return v ? `${v.name} (q${q})` : `q${q}`;
  };
  const list = qs => '{' + qs.map(q => `q${q}`).join(', ') + '}';
  const rows = w.rounds.map((r, i) => {
    let res;
    if (r.outcome === 'collision') {
      res = t('h.lr.collision', { k: r.intents.length, list: list(r.intents) });
    } else if (r.outcome === 'silence') {
      res = t('h.lr.silence');
    } else {
      res = t('h.lr.leader', { acks: r.acks, q: r.quorum, who: who(r.intents[0]) });
    }
    return h('div', { class: 'lround ' + r.outcome },
      h('div', { class: 'lhead' }, t('h.lr.head', { i: i + 1, m: r.m })),
      h('div', { class: 'lchips' }, r.contenders.map((q, j) =>
        h('span', { class: 'lchip' + (r.bits[j] === 1 ? ' intent' : '') }, `q${q}:${r.bits[j]}`))),
      h('div', { class: 'lres ' + r.outcome }, res));
  });
  const scroll = h('div', { class: 'lscroll' }, rows);
  box.replaceChildren(scroll, h('div', { class: 'gloss' }, t('c.gloss')));
  scroll.scrollTop = scroll.scrollHeight;   // sigue a la ronda más nueva
}

function renderW() {
  const box = $('wbox');
  const w = state.last_w;
  setText('wtitle', state.election_mode === 'local' ? t('h.wTitleLocal') : t('h.wTitleGlobal'));
  if (!w || state.phase === 'LOBBY') {
    box.replaceChildren(h('span', { class: 'k' }, '—'));
    return;
  }
  if (w.mode === 'local') { renderWLocal(box, w); return; }
  const att = w.attempts || [];
  const ok = w.leader_qubit != null;
  const rows = [h('div', { class: 'row' },
    h('span', { class: 'k' }, t('h.attempts')),
    ...att.map((s, i) => h('span', { class: 'att ' + (ok && i === att.length - 1 ? 'ok' : 'bad') }, s)))];
  if (att.length > 1) {
    rows.push(h('div', { class: 'k' }, t('h.discarded', { n: att.length - 1 })));
  }
  if (ok) {
    const v = state.validators.find(x => x.qubit === w.leader_qubit);
    rows.push(h('div', {}, t('h.leader'), h('b', {}, v ? `${v.name} (q${w.leader_qubit})` : `q${w.leader_qubit}`)));
  }
  box.replaceChildren(...rows);
}

function renderGHZ() {
  const box = $('gbox');
  const g = state.last_ghz;
  if (!g || state.phase !== 'RESULT') {
    box.replaceChildren(h('span', { class: 'k' }, state.phase === 'VOTING' ? t('h.waitingVotes') : '—'));
    return;
  }
  const row = (k, v, cls) => h('div', { class: 'row' }, h('span', { class: 'k' }, k), h('span', { class: cls || '' }, v));
  box.replaceChildren(
    row(t('h.pEven'), g.p_even.toFixed(3)),
    row('θ_total =', `${g.theta_total.toFixed(3)} rad`),
    row(t('h.yesEst'), `${g.k_hat}  ${t('h.quorumParen', { q: g.quorum })}`),
    row(t('h.yesReal'), yesReal == null ? '—' : String(yesReal)),
    row('', g.accepted ? t('h.ACCEPTED') : t('h.REJECTED'), 'verdict ' + (g.accepted ? 'okt' : 'errt')));
}

// Contenido editable: al perder el foco se envía `tamper` (el servidor no rehashea)
function editableData(b) {
  const e = h('div', {
    class: 'bdata', contenteditable: 'true', spellcheck: 'false',
    title: t('h.editTitle'),
  }, b.data);
  e.addEventListener('keydown', ev => {
    if (ev.key === 'Enter') { ev.preventDefault(); e.blur(); }
    if (ev.key === 'Escape') { e.textContent = b.data; e.blur(); }
  });
  e.addEventListener('blur', () => {
    const text = e.textContent;
    if (text !== b.data) send({ type: 'tamper', index: b.index, data: text });
    else renderChain();
  });
  return e;
}

function renderChain() {
  const box = $('chain');
  const chain = state.chain || [];
  const broken = chain.findIndex(b => !b.valid);
  const status = $('status');
  status.textContent = broken === -1
    ? t('h.chainOk', { n: chain.length })
    : t('h.chainBroken', { i: broken });
  status.className = broken === -1 ? 'ok' : 'err';
  $('repair').hidden = broken === -1;

  // No reconstruir mientras se edita un bloque (se perdería el foco y el texto)
  const active = document.activeElement;
  if (active && active.classList.contains('bdata') && box.contains(active)) return;

  const nodes = [];
  chain.forEach((b, i) => {
    nodes.push(h('div', { class: 'block' + (b.valid ? '' : ' bad') },
      h('div', { class: 'bhead' }, h('span', {}, `#${b.index}`), h('span', {}, b.leader === '—' ? t('h.genesis') : t('h.leaderOf', { name: b.leader }))),
      editableData(b),
      h('div', { class: 'bmeta' }, b.index === 0 ? t('h.genesisBlock') : t('h.yesGhz', { y: b.yes_estimated, n: b.n_validators })),
      h('div', { class: 'hash' }, `prev ${b.prev_hash.slice(0, 12)}…`),
      h('div', { class: 'hash' }, `hash ${b.hash.slice(0, 12)}…`),
      h('div', { class: b.valid ? 'okt' : 'errt' }, b.valid ? t('h.valid') : t('h.broken'))));
    if (i < chain.length - 1) nodes.push(h('div', { class: 'link' }, '→'));
  });
  const wasAtEnd = box.scrollLeft + box.clientWidth >= box.scrollWidth - 8;
  box.replaceChildren(...nodes);
  if (wasAtEnd) box.scrollLeft = box.scrollWidth;   // sigue al bloque más nuevo
}

// ---------------- Cuenta regresiva ----------------
function tick() {
  const e = $('countdown');
  if (!state || state.deadline == null || !['PROPOSING', 'VOTING'].includes(state.phase)) {
    if (e) e.textContent = '';
    return;
  }
  const left = Math.max(0, Math.ceil(state.deadline - (Date.now() / 1000 + skew)));
  e.textContent = `${left} s ${state.phase === 'VOTING' ? t('c.toVote') : t('c.toPropose')}`;
}
setInterval(tick, 250);

// ---------------- Acciones ----------------
$('newblock').addEventListener('click', () => send({ type: 'new_block' }));
$('next').addEventListener('click', () => send({ type: 'next' }));
$('repair').addEventListener('click', () => send({ type: 'repair' }));
document.querySelectorAll('#election button').forEach(b =>
  b.addEventListener('click', () => send({ type: 'set_election', mode: b.dataset.mode })));
$('noise').addEventListener('change', e => send({ type: 'toggle_noise', on: e.target.checked }));

// ---------------- Circuito (diálogo) ----------------
let circuitKind = 'w';

async function loadCircuit(kind) {
  circuitKind = kind;
  let n = state ? Math.min(12, Math.max(2, state.validators.length)) : 3;
  let note = '';
  const w = state && state.last_w;
  if (kind === 'w' && w && w.mode === 'local' && w.rounds.length) {
    const r = w.rounds[w.rounds.length - 1];
    n = Math.min(12, Math.max(2, r.m));
    note = t(r.m < 2 ? 'h.circuitLocalOne' : 'h.circuitLocal', { r: w.rounds.length });
  }
  const pre = $('circuit');
  $('c-w').classList.toggle('active', kind === 'w');
  $('c-ghz').classList.toggle('active', kind === 'ghz');
  $('circuit-info').textContent = t('h.circuitInfo', { ket: kind === 'w' ? '|W⟩' : '|GHZ⟩', n }) + note +
    (kind === 'ghz' ? t('h.circuitGhz') : '');
  pre.textContent = t('h.loading');
  try {
    const r = await fetch(`/circuit?kind=${kind}&n=${n}`);
    pre.textContent = r.ok ? await r.text() : `Error ${r.status}`;
  } catch {
    pre.textContent = t('c.circuitFailed');
  }
}

$('circuit-open').addEventListener('click', () => {
  $('circuit-dlg').showModal();
  loadCircuit(circuitKind);
});
$('circuit-close').addEventListener('click', () => $('circuit-dlg').close());
$('circuit-dlg').addEventListener('click', e => { if (e.target === $('circuit-dlg')) $('circuit-dlg').close(); });
$('c-w').addEventListener('click', () => loadCircuit('w'));
$('c-ghz').addEventListener('click', () => loadCircuit('ghz'));

function toast(msg) {
  const t = $('toast');
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, 5000);
}

// ---------------- Idioma ----------------
document.addEventListener('langchange', () => {
  renderQRText();
  render();
  if ($('circuit-dlg').open) loadCircuit(circuitKind);
});

// ---------------- Arranque ----------------
I18N.applyStatic();
I18N.mountSwitch($('lang'));
buildQR();
connect();
