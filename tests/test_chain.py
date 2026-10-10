"""Tests para la blockchain (Chain, Block, quorum)."""
import pytest

from app.chain import GENESIS_PREV, Block, Chain, quorum


def test_quorum():
    """Verifica los valores de quórum para n = 2..12."""
    expected = {
        2: 2,
        3: 2,
        4: 3,
        5: 4,
        6: 4,
        7: 5,
        8: 6,
        9: 6,
        10: 7,
        11: 8,
        12: 8,
    }
    for n, expected_q in expected.items():
        assert quorum(n) == expected_q, f"quorum({n}) should be {expected_q}"


def test_chain_genesis():
    """Verifica que la cadena inicia con un bloque génesis válido."""
    chain = Chain()
    assert len(chain.blocks) == 1
    genesis = chain.blocks[0]
    assert genesis.index == 0
    assert genesis.leader == "—"
    assert genesis.data == "Genesis"
    assert genesis.prev_hash == GENESIS_PREV
    assert genesis.hash != ""
    assert chain.verify() == -1  # cadena válida


def test_chain_add_and_verify():
    """Agrega varios bloques y verifica que la cadena es válida."""
    chain = Chain()
    chain.add("Alice", "Bloque 1", 2, 3, None)
    chain.add("Bob", "Bloque 2", 3, 3, None)
    chain.add("Carol", "Bloque 3", 2, 3, None)

    assert len(chain.blocks) == 4  # génesis + 3
    assert chain.verify() == -1  # cadena válida


def test_chain_tamper_breaks_chain():
    """Altera un bloque intermedio y verifica que se detecta."""
    chain = Chain()
    chain.add("Alice", "Bloque 1", 2, 3, None)
    chain.add("Bob", "Bloque 2", 3, 3, None)
    chain.add("Carol", "Bloque 3", 2, 3, None)

    # Tamper bloque 2 (índice 2 en la lista)
    chain.tamper(2, "Alterado")
    assert chain.verify() == 2


def test_to_list_marks_invalid_blocks():
    """Verifica que to_list marca correctamente los bloques válidos e inválidos."""
    chain = Chain()
    chain.add("Alice", "Bloque 1", 2, 3, None)
    chain.add("Bob", "Bloque 2", 3, 3, None)
    chain.add("Carol", "Bloque 3", 2, 3, None)

    # Cadena válida: todos válidos
    lst = chain.to_list()
    assert all(b["valid"] for b in lst)

    # Tamper bloque 2
    chain.tamper(2, "Alterado")
    lst = chain.to_list()
    assert lst[0]["valid"] and lst[1]["valid"]
    assert not lst[2]["valid"] and not lst[3]["valid"]


def test_block_compute_hash():
    """Verifica que el hash del bloque se computa correctamente."""
    block = Block(
        index=1,
        timestamp="2026-10-10T12:00:00+00:00",
        leader="Alice",
        data="Test",
        yes_estimated=2,
        n_validators=3,
        evidence=None,
        prev_hash=GENESIS_PREV,
    )
    hash1 = block.compute_hash()
    hash2 = block.compute_hash()
    assert hash1 == hash2
    assert len(hash1) == 64  # SHA-256 es 64 caracteres hex


def test_block_to_dict():
    """Verifica que to_dict incluye todos los campos."""
    block = Block(
        index=0,
        timestamp="2026-10-10T12:00:00+00:00",
        leader="—",
        data="Genesis",
        yes_estimated=0,
        n_validators=0,
        evidence=None,
        prev_hash=GENESIS_PREV,
        hash="abc123",
    )
    d = block.to_dict()
    assert d["index"] == 0
    assert d["leader"] == "—"
    assert d["hash"] == "abc123"
