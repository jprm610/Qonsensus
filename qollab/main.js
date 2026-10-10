// Entangled Consensus — W-state leader election + GHZ phase voting on a tiny blockchain
// NOTE: 'backend' is pre-created by Qollab.
//
// Design: IonQ backends accept ONE job per run. So we build a single circuit with
//   • a W register (n qubits)          → each shot = one leader election
//   • one GHZ register per possible     → each shot = one parity sample for k "yes" votes
//     number of yes votes k = 0..n
// run it once, and the blockchain then consumes those real measurement outcomes.

import { QuantumCircuit } from 'qiskit';

// ---------------- Parameters ----------------
const N = 3;                         // validators (N=4 → 24 qubits, near the simulator limit)
const THETA = Math.PI / N;           // phase per yes vote → total phase in [0, π], invertible
const SHOTS = 300;                   // size of the quantum measurement bank
const GHZ_WINDOW = 50;               // shots used to estimate one vote count
const QUORUM = Math.ceil((2 * N) / 3);
const NAMES = ['Alice', 'Bob', 'Carol', 'Dave'].slice(0, N);

// ---------------- Quantum circuit ----------------
function cry(qc, t, c, tgt) {        // controlled-RY from RY + CX
  qc.ry(t / 2, tgt); qc.cx(c, tgt); qc.ry(-t / 2, tgt); qc.cx(c, tgt);
}
function addW(qc, q) {               // |W_n>: amplitude 1/sqrt(n) on each validator's qubit
  const n = q.length;
  qc.x(q[0]);
  for (let k = 0; k < n - 1; k++) {
    cry(qc, 2 * Math.acos(Math.sqrt(1 / (n - k))), q[k], q[k + 1]);
    qc.cx(q[k + 1], q[k]);
  }
}
function addGHZVote(qc, q, yes) {    // GHZ; each of `yes` voters applies phase θ to OWN qubit
  qc.h(q[0]);
  for (let i = 1; i < q.length; i++) qc.cx(q[0], q[i]);
  for (let i = 0; i < yes; i++) qc.p(THETA, q[i]);
  for (const i of q) qc.h(i);        // P(even parity) = (1 + cos(yes·θ)) / 2
}

const range = (a, n) => Array.from({ length: n }, (_, i) => a + i);
const wQ = range(0, N);
const ghzQ = range(0, N + 1).map(k => range(N + k * N, N));
const TOTAL = N + (N + 1) * N;

const qc = QuantumCircuit(TOTAL, TOTAL);
addW(qc, wQ);
ghzQ.forEach((q, k) => addGHZVote(qc, q, k));
qc.measure(range(0, TOTAL), range(0, TOTAL));

// ---------------- SHA-256 (pure JS, no browser APIs needed) ----------------
function sha256(str) {
  const s = unescape(encodeURIComponent(str));
  const K = [], H = [];
  let p = 0;
  for (let c = 2; p < 64; c++) {
    let prime = true;
    for (let d = 2; d * d <= c; d++) if (c % d === 0) { prime = false; break; }
    if (prime) {
      if (p < 8) H[p] = (Math.pow(c, 1 / 2) * 2 ** 32) | 0;
      K[p++] = (Math.pow(c, 1 / 3) * 2 ** 32) | 0;
    }
  }
  const words = [];
  const bitLen = s.length * 8;
  let m = s + '\x80';
  while (m.length % 64 !== 56) m += '\x00';
  for (let i = 0; i < m.length; i++) words[i >> 2] |= m.charCodeAt(i) << ((3 - i) % 4) * 8;
  words[words.length] = (bitLen / 2 ** 32) | 0;
  words[words.length] = bitLen;
  const rotr = (v, n) => (v >>> n) | (v << (32 - n));
  for (let j = 0; j < words.length; j += 16) {
    const w = words.slice(j, j + 16);
    let [a, b, c, d, e, f, g, h] = H;
    for (let i = 0; i < 64; i++) {
      if (i >= 16) {
        const w15 = w[i - 15], w2 = w[i - 2];
        w[i] = (w[i - 16] + (rotr(w15, 7) ^ rotr(w15, 18) ^ (w15 >>> 3)) + w[i - 7] +
               (rotr(w2, 17) ^ rotr(w2, 19) ^ (w2 >>> 10))) | 0;
      }
      const t1 = (h + (rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)) + ((e & f) ^ (~e & g)) + K[i] + w[i]) | 0;
      const t2 = ((rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) | 0;
      h = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t2) | 0;
    }
    H[0] = (H[0] + a) | 0; H[1] = (H[1] + b) | 0; H[2] = (H[2] + c) | 0; H[3] = (H[3] + d) | 0;
    H[4] = (H[4] + e) | 0; H[5] = (H[5] + f) | 0; H[6] = (H[6] + g) | 0; H[7] = (H[7] + h) | 0;
  }
  return H.map(x => (x >>> 0).toString(16).padStart(8, '0')).join('');
}

// ---------------- Blockchain ----------------
const blockContent = b => JSON.stringify([b.index, b.time, b.leader, b.data, b.yes, b.kHat, b.prev]);
const chain = [];
function addBlock(fields) {
  const prev = chain.length ? chain[chain.length - 1].hash : '0'.repeat(64);
  const b = { index: chain.length, time: new Date().toISOString(), prev, ...fields };
  b.hash = sha256(blockContent(b));
  chain.push(b);
  return b;
}
function verifyChain() {             // index of first broken block, or -1
  for (let i = 0; i < chain.length; i++) {
    const b = chain[i];
    if (sha256(blockContent(b)) !== b.hash) return i;
    if (i > 0 && b.prev !== chain[i - 1].hash) return i;
  }
  return -1;
}
addBlock({ leader: '—', data: 'Genesis', yes: N, kHat: N, evidence: null });

// ---------------- UI helpers ----------------
const $ = id => document.getElementById(id);
const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function renderValidators(leader = -1, votes = null) {
  const box = $('validators');
  box.innerHTML = '';
  NAMES.forEach((name, i) => {
    const v = el('div', 'node' + (i === leader ? ' leader' : ''));
    v.innerHTML = `<div class="qubit">q${i}</div><div class="name">${name}</div>` +
      (i === leader ? '<div class="tag">LÍDER</div>' : '');
    if (votes) {
      const btn = el('button', 'vote ' + (votes[i] ? 'yes' : 'no'), votes[i] ? 'Sí' : 'No');
      btn.onclick = () => { votes[i] = !votes[i]; renderValidators(leader, votes); };
      v.appendChild(btn);
    }
    box.appendChild(v);
  });
}

function renderChain() {
  const box = $('chain');
  box.innerHTML = '';
  const broken = verifyChain();
  chain.forEach((b, i) => {
    const bad = broken !== -1 && i >= broken;
    const card = el('div', 'block' + (bad ? ' bad' : ''));
    card.innerHTML = `
      <div class="bhead"><span>#${b.index}</span><span>${b.leader === '—' ? 'génesis' : 'líder: ' + esc(b.leader)}</span></div>
      <div class="bdata" contenteditable="true" spellcheck="false" title="Edítalo para alterar el bloque">${esc(b.data)}</div>
      <div class="bmeta">votos sí estimados (GHZ): ${b.kHat}/${N}</div>
      <div class="hash">prev ${b.prev.slice(0, 12)}…</div>
      <div class="hash">hash ${b.hash.slice(0, 12)}…</div>`;
    card.querySelector('.bdata').addEventListener('input', e => {
      b.data = e.target.textContent;           // tamper: hash no longer matches
      renderStatus();
      card.classList.toggle('bad', true);
    });
    card.querySelector('.bdata').addEventListener('blur', renderChain);
    box.appendChild(card);
    if (i < chain.length - 1) box.appendChild(el('div', 'link', '→'));
  });
  renderStatus();
}
function renderStatus() {
  const broken = verifyChain();
  $('status').textContent = broken === -1
    ? `Cadena válida ✓ · ${chain.length} bloques`
    : `Cadena rota ✗ en el bloque #${broken} — su hash ya no coincide`;
  $('status').className = broken === -1 ? 'ok' : 'err';
}

// ---------------- Run the single quantum job ----------------
$('log').textContent = `Preparando banco cuántico: ${TOTAL} qubits · ${SHOTS} shots · 1 job…`;
renderValidators();
renderChain();

const job = await backend.run(qc, { shots: SHOTS });
let counts = (await job.result()).get_counts().toJs();
if (counts instanceof Map) counts = Object.fromEntries(counts);

// Expand counts into individual shots and shuffle their order (outcomes are untouched)
const shots = [];
for (const [s, c] of Object.entries(counts)) for (let i = 0; i < c; i++) shots.push(s.replace(/ /g, ''));
for (let i = shots.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [shots[i], shots[j]] = [shots[j], shots[i]]; }
const bit = (s, i) => s[s.length - 1 - i] === '1';

let wCursor = 0;
const ghzCursor = Array(N + 1).fill(0);
$('log').textContent = `Banco cuántico listo: ${shots.length} mediciones reales de ${TOTAL} qubits.`;

// ---------------- Consensus round ----------------
let round = null;

$('propose').onclick = () => {
  // 1) Leader election: consume W shots until exactly one validator measures 1
  const attempts = [];
  let leader = -1;
  while (leader === -1) {
    if (wCursor >= shots.length) { $('log').textContent = 'Banco agotado: vuelve a ejecutar el proyecto.'; return; }
    const s = shots[wCursor++];
    const ones = wQ.filter(i => bit(s, i));
    attempts.push(wQ.map(i => (bit(s, i) ? 1 : 0)).join(''));
    if (ones.length === 1) leader = ones[0];
  }
  round = { leader, attempts, votes: Array(N).fill(true) };
  const retry = attempts.length > 1
    ? ` (${attempts.length - 1} medición(es) descartada(s) por ruido: ${attempts.slice(0, -1).join(', ')} — se repite la ronda)`
    : '';
  $('wresult').innerHTML = `Medición del |W<sub>${N}</sub>⟩ repartido: <b>${attempts[attempts.length - 1]}</b> → líder <b>${NAMES[leader]}</b>${retry}`;
  $('data').value = `Bloque #${chain.length} propuesto por ${NAMES[leader]}`;
  $('step2').hidden = false;
  $('step3').hidden = true;
  $('propose').disabled = true;
  renderValidators(leader, round.votes);
};

$('count').onclick = () => {
  if (!round) return;
  // 2) GHZ vote: k yes votes → each yes voter applied θ to its qubit in GHZ register k.
  //    Estimate k from the parity of a window of real shots.
  const k = round.votes.filter(Boolean).length;
  const q = ghzQ[k];
  let even = 0;
  for (let j = 0; j < GHZ_WINDOW; j++) {
    const s = shots[(ghzCursor[k]++) % shots.length];
    if (q.reduce((p, i) => p ^ (bit(s, i) ? 1 : 0), 0) === 0) even++;
  }
  const pEven = even / GHZ_WINDOW;
  const kReal = Math.acos(Math.max(-1, Math.min(1, 2 * pEven - 1))) / THETA;
  const kHat = Math.round(kReal);
  const accepted = kHat >= QUORUM;

  $('gresult').innerHTML =
    `Paridad par en ${GHZ_WINDOW} mediciones del |GHZ<sub>${N}</sub>⟩: <b>${pEven.toFixed(2)}</b> ` +
    `→ θ<sub>total</sub> = ${(kReal * THETA).toFixed(2)} rad → <b>${kHat}</b> votos sí ` +
    `(quórum ${QUORUM}/${N}) → <b class="${accepted ? 'okt' : 'errt'}">${accepted ? 'BLOQUE ACEPTADO' : 'BLOQUE RECHAZADO'}</b>`;
  $('step3').hidden = false;

  if (accepted) {
    addBlock({ leader: NAMES[round.leader], data: $('data').value || '(vacío)', yes: k, kHat, evidence: { w: round.attempts, pEven } });
    renderChain();
  }
  round = null;
  $('step2').hidden = true;
  $('propose').disabled = false;
  renderValidators();
};
