// Entangled Consensus — idiomas de la interfaz (inglés por defecto, español opcional).
// Orden de elección: ?lang=en|es (se recuerda) → localStorage `ec.lang` → inglés.
'use strict';

const I18N = (() => {
  const LANGS = ['en', 'es'];
  const KEY = 'ec.lang';
  const read = () => { try { return localStorage.getItem(KEY); } catch { return null; } };
  const save = l => { try { localStorage.setItem(KEY, l); } catch { /* sin persistencia */ } };
  const s = (n, one, many) => (n === 1 ? one : many);

  const DICT = {
    en: {
      // común
      'c.reconnecting': 'Reconnecting…',
      'c.toVote': 'to vote',
      'c.toPropose': 'to propose',
      'c.gloss': 'INTENT = I want to lead · ACK = I recognize you · Q = ACK quorum · window = active contenders',
      'c.loadingCircuit': 'Loading circuit…',
      'c.circuitFailed': 'Could not load the circuit.',

      // pantalla grande: estático
      'h.tagline': 'Leader elected with a |W⟩ state · votes counted with a |GHZ⟩ state',
      'h.electionLabel': 'Leader election',
      'h.electionTitle': 'How the leader is elected (can only be changed in the waiting room)',
      'h.globalSub': 'one shared |W⟩',
      'h.localSub': 'local copies + INTENT/ACK',
      'h.noise': 'Noise',
      'h.circuit': 'Circuit',
      'h.next': 'Next',
      'h.newBlock': 'New block',
      'h.join': 'Scan to join',
      'h.validators': 'Validators',
      'h.round': 'Round',
      'h.vote': 'Voting · |GHZ⟩',
      'h.chain': 'Chain',
      'h.repair': 'Repair',
      'h.repairTitle': 'Recomputes the hashes from the broken block (demo only)',
      'h.chainHint': "Click a block's content to tamper with it",
      'h.wElection': '|W⟩ election',
      'h.ghzVote': '|GHZ⟩ vote',
      'h.close': 'Close',

      // pantalla grande: dinámico
      'h.noQR': 'QR code not available offline. Use the URL below.',
      'h.localUrl': "This URL is local: phones won't be able to open it. Use /host?url=http://<LAN-IP>:8000",
      'h.scanHint': "Point your phone's camera at the code and enter your name.",
      'h.count': p => `${p.n} validator${s(p.n, '', 's')} connected`,
      'h.noiseOn': 'Aer noise model',
      'h.noiseOff': 'The noise model is not available yet',
      'h.roundN': 'round with n = {n}',
      'h.noValidators': 'No validators yet. Scan the QR code to join.',
      'h.tag.off': 'DISCONNECTED',
      'h.tag.out': 'OUT · listening',
      'h.tag.contender': 'CONTENDER',
      'h.tag.writing': 'LEADER · WRITING',
      'h.tag.leader': 'LEADER',
      'h.tag.voted': 'VOTED ✓',
      'h.tag.thinking': 'THINKING…',
      'h.phase.LOBBY': 'LOBBY',
      'h.phase.ELECTING': 'ELECTION',
      'h.phase.PROPOSING': 'PROPOSAL',
      'h.phase.VOTING': 'VOTING',
      'h.phase.RESULT': 'RESULT',
      'h.waitTwo': 'Waiting for at least 2 validators…',
      'h.ready': 'All set: press “New block”.',
      'h.measuringGlobal': 'Measuring the shared |W{sub}⟩ state…',
      'h.measuringLocal': 'Round {r}: {m} contenders measure their local copy of |W{sub}⟩',
      'h.preparingLocal': 'Each validator prepares its local copy of |W{sub}⟩…',
      'h.leaderWriting': '{name} is the leader and is writing the block',
      'h.votingProgress': 'Voting: {done} of {n} have voted',
      'h.accepted': 'Block accepted',
      'h.rejected': 'Block rejected',
      'h.wTitleLocal': 'Local election · closing window',
      'h.wTitleGlobal': 'Election · |W⟩',
      'h.lr.head': 'Round {i} · m = {m}',
      'h.lr.collision': 'collision: {k} INTENT → the window closes to {list}',
      'h.lr.silence': 'silence: no INTENT → repeat with the same contenders',
      'h.lr.leader': '1 INTENT → ACK {acks}/{q} ≥ Q = {q} → COMMIT: leader {who}',
      'h.attempts': 'Attempts:',
      'h.discarded': p => `${p.n} discarded (not exactly one 1)`,
      'h.leader': 'Leader: ',
      'h.waitingVotes': 'Waiting for votes…',
      'h.pEven': 'P(even) =',
      'h.yesEst': 'estimated yes votes =',
      'h.quorumParen': '(quorum {q})',
      'h.yesReal': 'actual yes votes =',
      'h.ACCEPTED': 'ACCEPTED',
      'h.REJECTED': 'REJECTED',
      'h.editTitle': 'Edit it to tamper with the block',
      'h.chainOk': p => `Valid chain ✓ · ${p.n} block${s(p.n, '', 's')}`,
      'h.chainBroken': 'Chain broken ✗ at block #{i}',
      'h.genesis': 'genesis',
      'h.leaderOf': 'leader: {name}',
      'h.genesisBlock': 'genesis block',
      'h.yesGhz': 'yes votes (GHZ): {y}/{n}',
      'h.valid': '✓ valid',
      'h.broken': '✗ broken',
      'h.circuitInfo': '{ket} with n = {n}',
      'h.circuitLocal': ' (local copy from round {r})',
      'h.circuitLocalOne': ' (local copy from round {r}: with one contender |W₁⟩ = |1⟩)',
      'h.circuitGhz': ' (everyone votes yes: phase θ = π/n on each qubit)',
      'h.loading': 'Loading…',

      // celular
      'v.title': 'Entangled Consensus · Validator',
      'v.youAre': 'You are validator',
      'v.waitRound': 'Waiting for a round… the host will start a new block.',
      'v.yourW': 'Your |W⟩ circuit',
      'v.electing': 'Electing a leader',
      'v.electLocal': 'Each validator measures its qubit from its own local copy of |W⟩.',
      'v.electGlobal': 'Measuring the |W⟩ state shared by the validators…',
      'v.yourQubit': 'Your qubit: ',
      'v.wMeasuring': '|W⟩ circuit being measured',
      'v.leaderLocalH': 'You are the leader!',
      'v.leaderLocalP': 'You were the only one to send INTENT and the others recognized you with ACK. Write the block content.',
      'v.leaderGlobalH': 'You got the 1 in the W state!',
      'v.leaderGlobalP': 'You are the leader. Write the block content.',
      'v.blockPh': 'Block content…',
      'v.propose': 'Propose',
      'v.leaderChosen': 'Leader elected',
      'v.writing': 'They are writing the block content…',
      'v.wCircuit': '|W⟩ circuit',
      'v.voteH': 'Vote on the block',
      'v.yes': 'Yes',
      'v.no': 'No',
      'v.ghzVoteCircuit': '|GHZ⟩ voting circuit',
      'v.voteSent': 'Vote sent',
      'v.waitHost': 'Waiting for the host to start the next round…',
      'v.ghzCircuit': '|GHZ⟩ circuit',
      'v.connecting': 'Connecting…',
      'v.namePh': 'Your name',
      'v.joinIntro': 'Join as a validator: your phone will be a qubit in the round.',
      'v.joinBtn': 'Join',
      'v.alone': 'You are the only validator for now.',
      'v.peers': p => `${p.n} more validator${s(p.n, '', 's')} connected.`,
      'v.roundMsg': p => `Round ${p.r}: ${p.m} contender${s(p.m, '', 's')} measure${s(p.m, 's', '')} their local copy of |W${p.sub}⟩.`,
      'v.prepMsg': 'Each validator prepares its local copy of |W{sub}⟩…',
      'v.isLeader': '{name} (q{q}) is the leader.',
      'v.proposedBy': 'Proposed by {name}',
      'v.votedYes': 'You voted Yes (phase θ applied to your qubit).',
      'v.votedNo': 'You voted No (your qubit gets no phase).',
      'v.voteRecorded': 'Your vote was recorded.',
      'v.tally': '{done} of {n} have voted. Waiting for the rest…',
      'v.cap.r1': 'Round 1: the {n} validators measure their local copy of |W{sub}⟩. Your qubit is q_{q}.',
      'v.cap.round': p => `Round ${p.r}: ${p.m} contender${s(p.m, '', 's')} measure${s(p.m, 's', '')} their local copy of |W${p.sub}⟩.`,
      'v.cap.mine': ' Your qubit is line q_{pos} (highlighted).',
      'v.cap.out': ' You no longer compete: you listen for INTENTs.',
      'v.cap.lobbyLocal': 'Local election (closing window): each validator prepares its own copy of |W{sub}⟩ and measures only its qubit q_{q} (highlighted).',
      'v.cap.lobby': 'One qubit per validator: the circuit grows with each person who joins. Your qubit is q_{q} (highlighted).',
      'v.cap.w': '|W{sub}⟩ puts amplitude 1/√{n} on each qubit; when measured, exactly one comes out as 1. Your qubit is q_{q}.',
      'v.cap.vote': 'If you vote Yes, a phase P({theta}) is added on your qubit q_{q}.',
      'v.cap.mineYes': 'Your phase P({theta}) is on q_{q}. Everyone else\'s phases are secret.',
      'v.cap.mineNo': 'You voted No: your qubit q_{q} gets no phase. Everyone else\'s phases are secret.',
      'v.cap.secret': "Voters' phases are secret; this is the GHZ without phases.",
      'v.cap.one': ' With a single contender |W₁⟩ = |1⟩ (one X gate is enough): there is no circuit to draw.',
      'v.cap.needTwo': 'The circuit appears once there are at least 2 validators.',
      'v.wLocal': 'Local measurement · closing window',
      'v.wGlobal': '|W⟩ measurement',
      'v.lr.inside': p => `You measured your qubit (position ${p.pos} of ${p.m}) from your local copy of |W${p.sub}⟩ → ${p.bit} → ${p.sent ? 'you sent INTENT' : 'you listened'}.`,
      'v.lr.outside': 'You no longer compete in this window: you listen for INTENTs.',
      'v.lr.hit': 'Collision: you collided with {others}. The window closes to {all}; you keep competing.',
      'v.lr.collision': p => `Collision between ${p.all}: you send no ACK.${p.inside ? ' You drop out of the window.' : ''}`,
      'v.lr.silence': 'Nobody sent INTENT: the round repeats with the same contenders.',
      'v.lr.mine': 'You are the only INTENT: you receive {acks}/{q} ACK ≥ Q = {q} → COMMIT: you are the leader.',
      'v.lr.other': '{who} is the only INTENT: you send an ACK → COMMIT: {who} is the leader.',
      'v.won': 'You won the election: you are the leader.',
      'v.otherWon': '{who} won the election and is the leader.',
      'v.resolving': 'Resolving the next round…',
      'v.noMeasure': 'No measurement yet.',
      'v.discardedTag': 'discarded',
      'v.noLeader': 'No unique leader was obtained.',
      'v.mine1': 'Your qubit q{q} measured 1: you are the leader.',
      'v.mine0': 'Your qubit q{q} measured 0. The 1 came out on q{lq}: {name} is the leader.',
      'v.discarded': p => `${p.n} measurement${s(p.n, '', 's')} discarded: ${s(p.n, 'it did', 'they did')} not have exactly one 1 (noise).`,
      'v.ghzEvidence': '|GHZ⟩ evidence',
      'v.ev.p': 'P(even) = {p}  ({even} of {shots} shots)',
      'v.ev.k': 'k̂ = θ_total / (π/{n}) ≈ {ratio} → {k} yes votes',
      'v.ev.q': p => `quorum ${p.q} → ${p.ok ? 'accepted' : 'rejected'}`,
      'v.ev.note': 'With k yes votes, P(even) = (1 + cos(k·π/{n})) / 2. Measuring the parity many times recovers k without revealing who voted what.',
      'v.accepted': 'Block accepted',
      'v.rejected': 'Block rejected',
      'v.counts': 'Estimated yes votes (GHZ): {k} · quorum {q}',
      'v.blockHead': 'Block #{i} · leader: {name}',
      'v.discardedProposal': 'Proposal discarded',

      // errores del servidor (por código)
      'err.invalid_json': 'Invalid JSON',
      'err.bad_message': 'Invalid message',
      'err.unknown_type': 'Unknown message type: {type}',
      'err.round_cancelled': 'Round cancelled: {name} disconnected',
      'err.already_registered': 'You are already registered on this connection',
      'err.join_during_round': 'A round is in progress; you can join when it ends',
      'err.room_full': 'The room is full ({max} validators)',
      'err.already_validator': 'This connection is already a validator',
      'err.host_only_new_block': 'Only the host can start a block',
      'err.round_running': 'A round is already in progress',
      'err.min_validators': 'At least {min} validators are needed',
      'err.waiting_reconnect': 'Waiting for {names} to reconnect',
      'err.election_failed': 'W election failed: {detail}',
      'err.no_unique_leader': 'No unique leader after several attempts',
      'err.validator_only_propose': 'Only a validator can propose',
      'err.not_proposing': 'It is not time to propose',
      'err.leader_only_propose': 'Only the leader can propose the block',
      'err.validator_only_vote': 'Only a validator can vote',
      'err.no_voting': 'There is no open vote',
      'err.not_in_round': 'You are not part of this round',
      'err.already_voted': 'You already voted',
      'err.vote_failed': 'GHZ vote failed: {detail}',
      'err.host_only_next': 'Only the host can advance',
      'err.round_not_finished': 'The round has not finished yet',
      'err.host_only_tamper': 'Only the host can tamper with blocks',
      'err.tamper_bad_args': 'tamper requires index (integer) and data (text)',
      'err.no_such_block': 'Block #{index} does not exist',
      'err.host_only_repair': 'Only the host can repair the chain',
      'err.chain_already_valid': 'The chain is already valid',
      'err.host_only_noise': 'Only the host can change the noise',
      'err.noise_unavailable': 'The noise model is not available yet',
      'err.host_only_election': 'Only the host can change the election mode',
      'err.election_lobby_only': 'The election mode can only be changed in the waiting room',
      'err.election_bad_mode': 'Invalid election mode (global or local)',
    },

    es: {
      'c.reconnecting': 'Reconectando…',
      'c.toVote': 'para votar',
      'c.toPropose': 'para proponer',
      'c.gloss': 'INTENT = quiero liderar · ACK = te reconozco · Q = quórum de ACKs · ventana = contendientes activos',
      'c.loadingCircuit': 'Cargando circuito…',
      'c.circuitFailed': 'No se pudo cargar el circuito.',

      'h.tagline': 'Líder elegido con un estado |W⟩ · votos contados con un estado |GHZ⟩',
      'h.electionLabel': 'Elección del líder',
      'h.electionTitle': 'Cómo se elige al líder (solo se cambia en la sala de espera)',
      'h.globalSub': 'un |W⟩ compartido',
      'h.localSub': 'copias locales + INTENT/ACK',
      'h.noise': 'Ruido',
      'h.circuit': 'Circuito',
      'h.next': 'Siguiente',
      'h.newBlock': 'Nuevo bloque',
      'h.join': 'Únete escaneando',
      'h.validators': 'Validadores',
      'h.round': 'Ronda',
      'h.vote': 'Votación · |GHZ⟩',
      'h.chain': 'Cadena',
      'h.repair': 'Reparar',
      'h.repairTitle': 'Recalcula los hashes desde el bloque roto (solo demostración)',
      'h.chainHint': 'Haz clic en el contenido de un bloque para alterarlo',
      'h.wElection': '|W⟩ elección',
      'h.ghzVote': '|GHZ⟩ votación',
      'h.close': 'Cerrar',

      'h.noQR': 'QR no disponible sin conexión. Usa la URL de abajo.',
      'h.localUrl': 'Esta URL es local: los celulares no podrán abrirla. Usa /host?url=http://<IP-LAN>:8000',
      'h.scanHint': 'Apunta la cámara del celular al código y escribe tu nombre.',
      'h.count': p => `${p.n} validador${s(p.n, '', 'es')} conectado${s(p.n, '', 's')}`,
      'h.noiseOn': 'Modelo de ruido de Aer',
      'h.noiseOff': 'El modelo de ruido aún no está disponible',
      'h.roundN': 'ronda con n = {n}',
      'h.noValidators': 'Aún no hay validadores. Escanea el código QR para unirte.',
      'h.tag.off': 'DESCONECTADO',
      'h.tag.out': 'FUERA · escucha',
      'h.tag.contender': 'CONTENDIENTE',
      'h.tag.writing': 'LÍDER · ESCRIBE',
      'h.tag.leader': 'LÍDER',
      'h.tag.voted': 'VOTÓ ✓',
      'h.tag.thinking': 'PENSANDO…',
      'h.phase.LOBBY': 'LOBBY',
      'h.phase.ELECTING': 'ELECCIÓN',
      'h.phase.PROPOSING': 'PROPUESTA',
      'h.phase.VOTING': 'VOTACIÓN',
      'h.phase.RESULT': 'RESULTADO',
      'h.waitTwo': 'Esperando al menos 2 validadores…',
      'h.ready': 'Todo listo: pulsa «Nuevo bloque».',
      'h.measuringGlobal': 'Midiendo el estado |W{sub}⟩ repartido…',
      'h.measuringLocal': 'Ronda {r}: {m} contendientes miden su copia local de |W{sub}⟩',
      'h.preparingLocal': 'Cada validador prepara su copia local de |W{sub}⟩…',
      'h.leaderWriting': '{name} es el líder y escribe el bloque',
      'h.votingProgress': 'Votación: {done} de {n} han votado',
      'h.accepted': 'Bloque aceptado',
      'h.rejected': 'Bloque rechazado',
      'h.wTitleLocal': 'Elección local · closing window',
      'h.wTitleGlobal': 'Elección · |W⟩',
      'h.lr.head': 'Ronda {i} · m = {m}',
      'h.lr.collision': 'colisión: {k} INTENT → la ventana se cierra a {list}',
      'h.lr.silence': 'silencio: nadie envía INTENT → se repite con los mismos',
      'h.lr.leader': '1 INTENT → ACK {acks}/{q} ≥ Q = {q} → COMMIT: líder {who}',
      'h.attempts': 'Intentos:',
      'h.discarded': p => `${p.n} descartado${s(p.n, '', 's')} (no hay exactamente un 1)`,
      'h.leader': 'Líder: ',
      'h.waitingVotes': 'Esperando votos…',
      'h.pEven': 'P(par) =',
      'h.yesEst': 'votos sí estimados =',
      'h.quorumParen': '(quórum {q})',
      'h.yesReal': 'votos sí reales =',
      'h.ACCEPTED': 'ACEPTADO',
      'h.REJECTED': 'RECHAZADO',
      'h.editTitle': 'Edítalo para alterar el bloque',
      'h.chainOk': p => `Cadena válida ✓ · ${p.n} bloque${s(p.n, '', 's')}`,
      'h.chainBroken': 'Cadena rota ✗ en el bloque #{i}',
      'h.genesis': 'génesis',
      'h.leaderOf': 'líder: {name}',
      'h.genesisBlock': 'bloque génesis',
      'h.yesGhz': 'votos sí (GHZ): {y}/{n}',
      'h.valid': '✓ válido',
      'h.broken': '✗ roto',
      'h.circuitInfo': '{ket} con n = {n}',
      'h.circuitLocal': ' (copia local de la ronda {r})',
      'h.circuitLocalOne': ' (copia local de la ronda {r}: con un contendiente |W₁⟩ = |1⟩)',
      'h.circuitGhz': ' (todos votan sí: fase θ = π/n en cada qubit)',
      'h.loading': 'Cargando…',

      'v.title': 'Entangled Consensus · Validador',
      'v.youAre': 'Eres el validador',
      'v.waitRound': 'Esperando ronda… el anfitrión iniciará un nuevo bloque.',
      'v.yourW': 'Tu circuito |W⟩',
      'v.electing': 'Eligiendo líder',
      'v.electLocal': 'Cada validador mide su qubit de su propia copia local de |W⟩.',
      'v.electGlobal': 'Midiendo el estado |W⟩ repartido entre los validadores…',
      'v.yourQubit': 'Tu qubit: ',
      'v.wMeasuring': 'Circuito |W⟩ que se está midiendo',
      'v.leaderLocalH': '¡Eres el líder!',
      'v.leaderLocalP': 'Fuiste el único en enviar INTENT y los demás te reconocieron con ACK. Escribe el contenido del bloque.',
      'v.leaderGlobalH': '¡Saliste 1 en el estado W!',
      'v.leaderGlobalP': 'Eres el líder. Escribe el contenido del bloque.',
      'v.blockPh': 'Contenido del bloque…',
      'v.propose': 'Proponer',
      'v.leaderChosen': 'Líder elegido',
      'v.writing': 'Está escribiendo el contenido del bloque…',
      'v.wCircuit': 'Circuito |W⟩',
      'v.voteH': 'Vota el bloque',
      'v.yes': 'Sí',
      'v.no': 'No',
      'v.ghzVoteCircuit': 'Circuito |GHZ⟩ de la votación',
      'v.voteSent': 'Voto enviado',
      'v.waitHost': 'Esperando al anfitrión para la siguiente ronda…',
      'v.ghzCircuit': 'Circuito |GHZ⟩',
      'v.connecting': 'Conectando…',
      'v.namePh': 'Tu nombre',
      'v.joinIntro': 'Únete como validador: tu celular será un qubit de la ronda.',
      'v.joinBtn': 'Unirme',
      'v.alone': 'Eres el único validador por ahora.',
      'v.peers': p => `Hay ${p.n} validador${s(p.n, '', 'es')} más conectado${s(p.n, '', 's')}.`,
      'v.roundMsg': p => `Ronda ${p.r}: ${p.m} contendiente${s(p.m, '', 's')} miden su copia local de |W${p.sub}⟩.`,
      'v.prepMsg': 'Cada validador prepara su copia local de |W{sub}⟩…',
      'v.isLeader': '{name} (q{q}) es el líder.',
      'v.proposedBy': 'Propuesto por {name}',
      'v.votedYes': 'Votaste Sí (fase θ aplicada a tu qubit).',
      'v.votedNo': 'Votaste No (tu qubit queda sin fase).',
      'v.voteRecorded': 'Tu voto ya fue registrado.',
      'v.tally': 'Han votado {done} de {n}. Esperando al resto…',
      'v.cap.r1': 'Ronda 1: los {n} validadores miden su copia local de |W{sub}⟩. Tu qubit es q_{q}.',
      'v.cap.round': p => `Ronda ${p.r}: ${p.m} contendiente${s(p.m, '', 's')} miden su copia local de |W${p.sub}⟩.`,
      'v.cap.mine': ' Tu qubit es la línea q_{pos} (resaltada).',
      'v.cap.out': ' Ya no compites: escuchas los INTENT.',
      'v.cap.lobbyLocal': 'Elección local (closing window): cada validador prepara su propia copia de |W{sub}⟩ y mide solo su qubit q_{q} (resaltado).',
      'v.cap.lobby': 'Un qubit por validador: con cada persona que entra, el circuito crece. Tu qubit es q_{q} (resaltado).',
      'v.cap.w': '|W{sub}⟩ deja amplitud 1/√{n} en cada qubit; al medirlo, exactamente uno sale en 1. Tu qubit es q_{q}.',
      'v.cap.vote': 'Si votas Sí, se añade una fase P({theta}) en tu qubit q_{q}.',
      'v.cap.mineYes': 'Tu fase P({theta}) está en q_{q}. Las fases de los demás son secretas.',
      'v.cap.mineNo': 'Votaste No: tu qubit q_{q} queda sin fase. Las fases de los demás son secretas.',
      'v.cap.secret': 'Las fases de los votantes son secretas; aquí se ve el GHZ sin fases.',
      'v.cap.one': ' Con un solo contendiente |W₁⟩ = |1⟩ (basta una puerta X): no hay circuito que dibujar.',
      'v.cap.needTwo': 'El circuito aparece cuando haya al menos 2 validadores.',
      'v.wLocal': 'Medición local · closing window',
      'v.wGlobal': 'Medición del |W⟩',
      'v.lr.inside': p => `Mediste tu qubit (posición ${p.pos} de ${p.m}) de tu copia local de |W${p.sub}⟩ → ${p.bit} → ${p.sent ? 'enviaste INTENT' : 'escuchaste'}.`,
      'v.lr.outside': 'Ya no compites en esta ventana: escuchas los INTENT.',
      'v.lr.hit': 'Colisión: chocaste con {others}. La ventana se cierra a {all}; sigues compitiendo.',
      'v.lr.collision': p => `Colisión entre ${p.all}: no envías ACK.${p.inside ? ' Quedas fuera de la ventana.' : ''}`,
      'v.lr.silence': 'Nadie envió INTENT: se repite con los mismos contendientes.',
      'v.lr.mine': 'Eres el único INTENT: recibes {acks}/{q} ACK ≥ Q = {q} → COMMIT: eres el líder.',
      'v.lr.other': '{who} es el único INTENT: le envías ACK → COMMIT: es el líder.',
      'v.won': 'Ganaste la elección: eres el líder.',
      'v.otherWon': '{who} ganó la elección y es el líder.',
      'v.resolving': 'Resolviendo la siguiente ronda…',
      'v.noMeasure': 'Aún no hay medición.',
      'v.discardedTag': 'descartado',
      'v.noLeader': 'No se obtuvo un líder único.',
      'v.mine1': 'Tu qubit q{q} midió 1: eres el líder.',
      'v.mine0': 'Tu qubit q{q} midió 0. Salió 1 en q{lq}: {name} es el líder.',
      'v.discarded': p => `${p.n} medición${s(p.n, '', 'es')} descartada${s(p.n, '', 's')}: no tenía${s(p.n, '', 'n')} exactamente un 1 (efecto del ruido).`,
      'v.ghzEvidence': 'Evidencia |GHZ⟩',
      'v.ev.p': 'P(par) = {p}  ({even} de {shots} disparos)',
      'v.ev.k': 'k̂ = θ_total / (π/{n}) ≈ {ratio} → {k} votos sí',
      'v.ev.q': p => `quórum ${p.q} → ${p.ok ? 'aceptado' : 'rechazado'}`,
      'v.ev.note': 'Con k votos sí, P(par) = (1 + cos(k·π/{n})) / 2. Midiendo la paridad muchas veces se despeja k sin revelar quién votó qué.',
      'v.accepted': 'Bloque aceptado',
      'v.rejected': 'Bloque rechazado',
      'v.counts': 'Votos sí estimados (GHZ): {k} · quórum {q}',
      'v.blockHead': 'Bloque #{i} · líder: {name}',
      'v.discardedProposal': 'Propuesta descartada',

      'err.invalid_json': 'JSON inválido',
      'err.bad_message': 'Mensaje inválido',
      'err.unknown_type': 'Tipo de mensaje desconocido: {type}',
      'err.round_cancelled': 'Ronda cancelada: {name} se desconectó',
      'err.already_registered': 'Ya estás registrado en esta conexión',
      'err.join_during_round': 'Hay una ronda en curso; podrás unirte cuando termine',
      'err.room_full': 'La sala está llena ({max} validadores)',
      'err.already_validator': 'Esta conexión ya es un validador',
      'err.host_only_new_block': 'Solo el anfitrión puede iniciar un bloque',
      'err.round_running': 'Ya hay una ronda en curso',
      'err.min_validators': 'Se necesitan al menos {min} validadores',
      'err.waiting_reconnect': 'Esperando a que se reconecte: {names}',
      'err.election_failed': 'Fallo en la elección W: {detail}',
      'err.no_unique_leader': 'No se obtuvo un líder único tras varios intentos',
      'err.validator_only_propose': 'Solo un validador puede proponer',
      'err.not_proposing': 'No es momento de proponer',
      'err.leader_only_propose': 'Solo el líder puede proponer el bloque',
      'err.validator_only_vote': 'Solo un validador puede votar',
      'err.no_voting': 'No hay votación abierta',
      'err.not_in_round': 'No participas en esta ronda',
      'err.already_voted': 'Ya votaste',
      'err.vote_failed': 'Fallo en la votación GHZ: {detail}',
      'err.host_only_next': 'Solo el anfitrión puede avanzar',
      'err.round_not_finished': 'La ronda aún no ha terminado',
      'err.host_only_tamper': 'Solo el anfitrión puede alterar bloques',
      'err.tamper_bad_args': 'tamper requiere index (entero) y data (texto)',
      'err.no_such_block': 'No existe el bloque #{index}',
      'err.host_only_repair': 'Solo el anfitrión puede reparar la cadena',
      'err.chain_already_valid': 'La cadena ya es válida',
      'err.host_only_noise': 'Solo el anfitrión puede cambiar el ruido',
      'err.noise_unavailable': 'El modelo de ruido aún no está disponible',
      'err.host_only_election': 'Solo el anfitrión puede cambiar el modo de elección',
      'err.election_lobby_only': 'El modo de elección solo se cambia en la sala de espera',
      'err.election_bad_mode': 'Modo de elección inválido (global o local)',
    },
  };

  function initial() {
    const q = new URLSearchParams(location.search).get('lang');
    if (LANGS.includes(q)) { save(q); return q; }
    const saved = read();
    return LANGS.includes(saved) ? saved : 'en';
  }

  let lang = initial();
  const switches = [];

  function t(key, params = {}) {
    const d = DICT[lang][key] !== undefined ? DICT[lang][key] : DICT.en[key];
    if (d === undefined) return key;
    if (typeof d === 'function') return d(params);
    return d.replace(/\{(\w+)\}/g, (m, k) => (k in params ? String(params[k]) : m));
  }

  // Errores del servidor: se traducen por `code`; si el código es desconocido, se usa `message`.
  function err(m) {
    if (m && m.code && DICT.en['err.' + m.code] !== undefined) return t('err.' + m.code, m.params || {});
    return (m && m.message) || '';
  }

  function applyStatic(root = document) {
    document.documentElement.lang = lang;
    root.querySelectorAll('[data-i18n]').forEach(e => { e.textContent = t(e.dataset.i18n); });
    root.querySelectorAll('[data-i18n-title]').forEach(e => { e.title = t(e.dataset.i18nTitle); });
  }

  function paintSwitches() {
    switches.forEach(box => box.querySelectorAll('button').forEach(b => {
      const on = b.dataset.lang === lang;
      b.classList.toggle('active', on);
      b.setAttribute('aria-pressed', String(on));
    }));
  }

  function set(l) {
    if (!LANGS.includes(l) || l === lang) return;
    lang = l;
    save(l);
    applyStatic();
    paintSwitches();
    document.dispatchEvent(new Event('langchange'));
  }

  // Selector EN | ES; `box` es un contenedor vacío del HTML
  function mountSwitch(box) {
    box.classList.add('langsw');
    box.setAttribute('role', 'group');
    box.setAttribute('aria-label', 'Language / Idioma');
    for (const l of LANGS) {
      const b = document.createElement('button');
      b.type = 'button';
      b.dataset.lang = l;
      b.textContent = l.toUpperCase();
      b.lang = l;
      b.title = l === 'en' ? 'English' : 'Español';
      b.addEventListener('click', () => set(l));
      box.append(b);
    }
    switches.push(box);
    paintSwitches();
  }

  return { t, err, set, applyStatic, mountSwitch, get lang() { return lang; }, DICT };
})();

const t = I18N.t;
