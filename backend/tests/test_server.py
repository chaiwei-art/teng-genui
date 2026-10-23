"""genui FastAPI 端点测试。"""
import json
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from fastapi.testclient import TestClient  # noqa: E402

import server  # noqa: E402


@pytest.fixture()
def client(monkeypatch):
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)  # 强制 Mock，绝不联网
    return TestClient(server.app)


def test_health(client):
    assert client.get("/api/health").json() == {"status": "ok"}


def test_schema_catalog(client):
    r = client.get("/api/schema")
    assert "components" in r.json()["catalog"] or "组件" in r.json()["catalog"]


def test_generate_sse_stream(client):
    r = client.post("/api/generate", json={"message": "对比 Teng Phone 15 和 Ultra"})
    assert r.status_code == 200
    assert r.headers["content-type"].startswith("text/event-stream")
    body = r.text.replace("\r\n", "\n")
    assert "event: meta" in body
    assert "event: delta" in body
    assert body.rstrip().endswith("event: done\ndata: {}")


def test_generate_deltas_reassemble_to_valid_json(client):
    r = client.post("/api/generate", json={"message": "推荐一款通勤耳机"})
    deltas = []
    for block in r.text.strip().split("\n\n"):
        if block.startswith("event: delta"):
            line = [l for l in block.split("\n") if l.startswith("data:")][0]
            deltas.append(json.loads(line[5:].strip())["text"])
    obj = json.loads("".join(deltas))
    assert obj["components"], "组件数组不应为空"
    assert all("type" in c and "props" in c for c in obj["components"])


def test_submit_sse_stream(client):
    r = client.post("/api/submit", json={
        "form_id": "travel_pref",
        "values": {"destination": "云南大理", "days": "7"},
    })
    assert r.status_code == 200
    assert "event: delta" in r.text
    assert "event: done" in r.text


def test_submit_empty_values_not_crash(client):
    r = client.post("/api/submit", json={"form_id": "x", "values": {}})
    assert r.status_code == 200
    assert "event: done" in r.text
