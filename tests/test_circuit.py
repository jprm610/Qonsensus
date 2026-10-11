"""Endpoint GET /circuit: dibujo de texto de los circuitos W y GHZ."""
import pytest
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_w_circuit_drawing():
    r = client.get("/circuit", params={"kind": "w", "n": 3})
    assert r.status_code == 200
    assert r.headers["content-type"].startswith("text/plain")
    for q in ("q_0", "q_1", "q_2"):
        assert q in r.text
    assert "Ry(" in r.text and "X" in r.text


def test_ghz_circuit_drawing_with_yes_subset():
    r = client.get("/circuit", params={"kind": "ghz", "n": 4, "yes": "0,2"})
    assert r.status_code == 200
    assert r.text.count("P(") == 2          # una fase por votante "sí"
    assert "H" in r.text


def test_ghz_default_is_all_yes():
    r = client.get("/circuit", params={"kind": "ghz", "n": 3})
    assert r.text.count("P(") == 3


@pytest.mark.parametrize(
    "params",
    [
        {"kind": "x", "n": 3},
        {"kind": "w", "n": 1},
        {"kind": "w", "n": 13},
        {"kind": "ghz", "n": 3, "yes": "9"},
        {"kind": "ghz", "n": 3, "yes": "a"},
    ],
)
def test_circuit_rejects_bad_input(params):
    assert client.get("/circuit", params=params).status_code == 400
