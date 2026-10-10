"""Blockchain con SHA-256 y verificación de integridad.

Portar desde qollab/main.js. Los bloques forman una cadena donde cada uno
referencia el hash del anterior, permitiendo detectar alteraciones.
"""
from __future__ import annotations

import hashlib
import json
import math
from dataclasses import dataclass, field, asdict
from datetime import datetime, timezone


GENESIS_PREV = "0" * 64


def quorum(n: int) -> int:
    """Supermayoría estilo PBFT: ceil(2n/3)."""
    return math.ceil(2 * n / 3)


@dataclass
class Block:
    index: int
    timestamp: str
    leader: str
    data: str
    yes_estimated: int
    n_validators: int
    evidence: dict | None
    prev_hash: str
    hash: str = ""

    def compute_hash(self) -> str:
        """SHA-256 del contenido del bloque (sin el hash guardado)."""
        content = [
            self.index,
            self.timestamp,
            self.leader,
            self.data,
            self.yes_estimated,
            self.prev_hash,
        ]
        json_str = json.dumps(content, ensure_ascii=False)
        return hashlib.sha256(json_str.encode("utf-8")).hexdigest()

    def to_dict(self) -> dict:
        """Convierte el bloque a diccionario."""
        return asdict(self)


class Chain:
    """Blockchain con un bloque génesis inicializado."""

    blocks: list[Block]

    def __init__(self):
        self.blocks = []
        # Crear bloque génesis
        now = datetime.now(timezone.utc).isoformat()
        genesis = Block(
            index=0,
            timestamp=now,
            leader="—",
            data="Genesis",
            yes_estimated=0,
            n_validators=0,
            evidence=None,
            prev_hash=GENESIS_PREV,
        )
        genesis.hash = genesis.compute_hash()
        self.blocks.append(genesis)

    def add(
        self,
        leader: str,
        data: str,
        yes_estimated: int,
        n_validators: int,
        evidence: dict | None = None,
    ) -> Block:
        """Agrega un nuevo bloque a la cadena."""
        prev_hash = self.blocks[-1].hash if self.blocks else GENESIS_PREV
        index = len(self.blocks)
        timestamp = datetime.now(timezone.utc).isoformat()
        block = Block(
            index=index,
            timestamp=timestamp,
            leader=leader,
            data=data,
            yes_estimated=yes_estimated,
            n_validators=n_validators,
            evidence=evidence,
            prev_hash=prev_hash,
        )
        block.hash = block.compute_hash()
        self.blocks.append(block)
        return block

    def verify(self) -> int:
        """Verifica la integridad de la cadena.

        Retorna el índice del primer bloque roto o -1 si la cadena es válida.
        Un bloque se considera roto si:
        - Su hash recalculado no coincide con el guardado
        - Su prev_hash no coincide con el hash del bloque anterior
        """
        for i, block in enumerate(self.blocks):
            # Verificar que el hash sea correcto
            if block.compute_hash() != block.hash:
                return i
            # Verificar que prev_hash coincida (salvo en el génesis)
            if i > 0 and block.prev_hash != self.blocks[i - 1].hash:
                return i
        return -1

    def tamper(self, index: int, data: str) -> None:
        """Altera el contenido de un bloque sin recalcular su hash (demo).

        Esto rompe la cadena desde ese punto, lo cual se detecta con verify().
        """
        if 0 <= index < len(self.blocks):
            self.blocks[index].data = data

    def rehash_from(self, index: int) -> None:
        """Recalcula enlaces y hashes desde `index` en adelante (solo demostración).

        "Legitima" el contenido alterado: la cadena vuelve a verificar, pero
        los hashes ya no coinciden con los originales.
        """
        for i in range(max(index, 0), len(self.blocks)):
            block = self.blocks[i]
            if i > 0:
                block.prev_hash = self.blocks[i - 1].hash
            block.hash = block.compute_hash()

    def to_list(self) -> list[dict]:
        """Convierte la cadena a lista de diccionarios.

        Cada dict incluye un campo "valid" booleano indicando si es válido
        (depende de la posición del primer bloque roto).
        """
        broken_index = self.verify()
        result = []
        for i, block in enumerate(self.blocks):
            block_dict = block.to_dict()
            block_dict["valid"] = broken_index == -1 or i < broken_index
            result.append(block_dict)
        return result
