"""genui 引擎测试：Mock 场景、表单闭环、流式事件序列。"""
import asyncio
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from genui import (  # noqa: E402
    estimate_tokens,
    mock_components,
    mock_followup,
    run_generate,
    run_submit,
)


# ---------------- 场景路由 ----------------

def test_scenario_compare():
    comps = mock_components("对比 Teng Phone 15 和 Ultra")
    types = [c["type"] for c in comps]
    assert "product_table" in types


def test_scenario_travel_form():
    comps = mock_components("帮我规划一次旅行")
    forms = [c for c in comps if c["type"] == "gen_form"]
    assert forms, "旅行场景必须生成表单"
    kinds = {f["kind"] for f in forms[0]["props"]["fields"]}
    assert "select" in kinds and "slider" in kinds


def test_scenario_sales():
    types = [c["type"] for c in mock_components("看看本季度销售数据")]
    assert "bar_chart" in types and "stat_cards" in types


def test_scenario_products():
    types = [c["type"] for c in mock_components("推荐一款通勤耳机")]
    assert "product_cards" in types


def test_scenario_default():
    comps = mock_components("你好")
    assert comps and all("type" in c and "props" in c for c in comps)


def test_every_scenario_shape_valid():
    """所有场景输出必须符合 {"components": [{type, props}]} 契约。"""
    for msg in ["对比 A 和 B", "旅行", "销量数据", "推荐耳机", "随便聊聊"]:
        comps = mock_components(msg)
        assert isinstance(comps, list) and comps
        for c in comps:
            assert set(c.keys()) == {"type", "props"}


# ---------------- 表单闭环回传 ----------------

def test_followup_echoes_values():
    comps = mock_followup("travel_pref", {
        "destination": "云南大理", "days": "7",
        "style": ["自然风光", "美食探店"], "budget": "3000-8000", "depart": "2026-11-20",
    })
    md = "".join(c["props"].get("text", "") for c in comps if c["type"] == "markdown")
    assert "云南大理" in md
    assert "7" in md
    assert "自然风光" in md and "美食探店" in md


def test_followup_days_string_and_number():
    a = mock_followup("f", {"days": "5"})
    b = mock_followup("f", {"days": 5})
    # 两种输入形态都不崩，且天数进入步骤文案
    assert any("D5" in " ".join(c["props"].get("steps", [])) for c in a if c["type"] == "steps")
    assert any("D5" in " ".join(c["props"].get("steps", [])) for c in b if c["type"] == "steps")


def test_followup_single_style_string():
    comps = mock_followup("f", {"style": "躺平度假"})  # 单选可能传来字符串
    assert comps


def test_followup_has_stat_cards():
    types = [c["type"] for c in mock_followup("f", {"days": 7})]
    assert "steps" in types and "stat_cards" in types


# ---------------- 流式事件序列 ----------------

def _run(runner, monkeypatch):
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)  # 强制 Mock，绝不联网
    events = []

    async def emit(event, data):
        events.append((event, data))

    asyncio.run(runner(emit))
    return events


def test_run_generate_event_sequence(monkeypatch):
    events = _run(lambda emit: run_generate("对比手机", emit), monkeypatch)
    names = [e for e, _ in events]
    assert names[0] == "meta"
    assert events[0][1]["mode"] == "mock"
    assert "fallback" not in names
    assert "delta" in names
    # runner 以 usage 收尾（done 事件由 server 层追加，见 test_server）
    assert names[-1] == "usage"


def test_run_generate_deltas_reassemble(monkeypatch):
    """所有 delta 文本拼接后必须是完整可解析的组件 JSON。"""
    events = _run(lambda emit: run_generate("看看本季度销售数据", emit), monkeypatch)
    raw = "".join(d["text"] for e, d in events if e == "delta")
    obj = json.loads(raw)
    types = [c["type"] for c in obj["components"]]
    assert "bar_chart" in types


def test_run_generate_delta_chunk_sizes(monkeypatch):
    """逐字符小块流式（非一次性），保证前端能边收边渲染。"""
    events = _run(lambda emit: run_generate("推荐耳机", emit), monkeypatch)
    chunks = [d["text"] for e, d in events if e == "delta"]
    assert len(chunks) > 10
    assert all(len(c) <= 20 for c in chunks)


def test_run_submit_event_sequence(monkeypatch):
    events = _run(lambda emit: run_submit("travel_pref", {"days": 6}, emit), monkeypatch)
    names = [e for e, _ in events]
    assert names[0] == "meta"
    assert names[-1] == "usage"  # done 由 server 层追加
    raw = "".join(d["text"] for e, d in events if e == "delta")
    assert json.loads(raw)["components"]


def test_usage_present(monkeypatch):
    events = _run(lambda emit: run_generate("对比", emit), monkeypatch)
    usage = next(d for e, d in events if e == "usage")
    assert usage["total_tokens"] > 0


# ---------------- 杂项 ----------------

def test_estimate_tokens_mixed():
    assert estimate_tokens("hello 世界测试") >= 3
    assert estimate_tokens("") >= 1
