"""Generative UI 引擎。

核心思路：LLM 返回的不是纯文本，而是结构化 UI 组件 JSON：
    {"components": [{"type": "product_table", "props": {...}}, ...]}
前端流式接收、边收边渲染。

- Mock 引擎：按关键词返回组件方案，逐字符流式推送，无需 API Key
- 真实 LLM：OpenAI 兼容接口 + JSON mode，失败自动降级 Mock
"""
from __future__ import annotations

import asyncio
import json
import os
import random
import re
from typing import Any, Dict, List

# ---------------------------------------------------------------- 组件目录（给真实 LLM 的 schema 说明）

COMPONENT_CATALOG = """
可用组件（只输出 JSON，不要输出其它任何文字）：
1. markdown: {"text": string}                    富文本说明
2. product_table: {"title": string, "columns": string[], "rows": string[][]}   对比表格
3. product_cards: {"title": string, "items": [{"name","emoji","price","tag"}]} 商品卡片组
4. stat_cards: {"cards": [{"label","value","delta"?}]}                        统计卡片
5. bar_chart: {"title": string, "unit"?: string, "data": [{"label","value":number}]}  柱状图
6. steps: {"title"?: string, "steps": string[]}              步骤清单
7. gen_form: {"form_id": string, "title"?: string, "submit_text"?: string,
              "fields": [{"name","label","kind":"text|select|multiselect|slider|date",
                          "options"?: string[], "min"?: number, "max"?: number}]}   交互表单

输出格式（单个 JSON 对象）：
{"components": [{"type": "...", "props": {...}}, ...]}
"""

SYSTEM_PROMPT = (
    "你是 TengMall 的生成式 UI 引擎。根据用户请求输出最合适的 UI 组件组合，"
    "严格输出一个 JSON 对象，禁止 markdown 代码块围栏。\n" + COMPONENT_CATALOG
)

# ---------------------------------------------------------------- Mock 场景

_PHONE_TABLE = {
    "type": "product_table",
    "props": {
        "title": "📱 旗舰手机对比",
        "columns": ["维度", "Teng Phone 15 Ultra", "Teng Phone 15"],
        "rows": [
            ["价格", "¥4999", "¥3299"],
            ["主摄", "5000万 哈苏联合调校", "5000万 标准"],
            ["电池", "5800mAh", "5200mAh"],
            ["卫星通信", "✅ 支持", "❌ 不支持"],
            ["推荐人群", "摄影 / 商务", "日常 / 性价比"],
        ],
    },
}

_TRAVEL_FORM = {
    "type": "gen_form",
    "props": {
        "form_id": "travel_pref",
        "title": "🧭 旅行偏好收集",
        "submit_text": "生成行程",
        "fields": [
            {"name": "destination", "label": "目的地", "kind": "select",
             "options": ["云南大理", "新疆喀纳斯", "日本京都", "冰岛环岛"]},
            {"name": "days", "label": "旅行天数", "kind": "slider", "min": 2, "max": 15, "default": 5},
            {"name": "style", "label": "旅行风格", "kind": "multiselect",
             "options": ["自然风光", "人文历史", "美食探店", "冒险户外", "躺平度假"]},
            {"name": "budget", "label": "人均预算", "kind": "select",
             "options": ["3000以内", "3000-8000", "8000-15000", "15000+"]},
            {"name": "depart", "label": "出发日期", "kind": "date"},
        ],
    },
}


def _scenario_compare() -> List[Dict[str, Any]]:
    return [
        {"type": "markdown", "props": {"text": "好的，我从价格、影像、续航三个维度对比了这两款旗舰机："}},
        _PHONE_TABLE,
        {"type": "stat_cards", "props": {"cards": [
            {"label": "价差", "value": "¥1700", "delta": "Ultra 贵 52%"},
            {"label": "续航差距", "value": "600mAh", "delta": "Ultra 多 11%"},
        ]}},
        {"type": "markdown", "props": {"text":
            "**结论**：预算充足选 Ultra 的影像与卫星通信；追求性价比选标准版，日常体验差距不大。"}},
    ]


def _scenario_travel() -> List[Dict[str, Any]]:
    return [
        {"type": "markdown", "props": {"text": "没问题！填写下面的偏好表单，我会生成一份专属行程："}},
        _TRAVEL_FORM,
    ]


def _scenario_sales() -> List[Dict[str, Any]]:
    return [
        {"type": "markdown", "props": {"text": "这是本季度各品类销量数据："}},
        {"type": "stat_cards", "props": {"cards": [
            {"label": "季度 GMV", "value": "¥1,284万", "delta": "+18.2%"},
            {"label": "订单量", "value": "3.2万", "delta": "+9.4%"},
            {"label": "客单价", "value": "¥401", "delta": "+5.1%"},
        ]}},
        {"type": "bar_chart", "props": {"title": "各品类销量", "unit": "万元", "data": [
            {"label": "手机", "value": 520},
            {"label": "耳机", "value": 310},
            {"label": "手表", "value": 268},
            {"label": "平板", "value": 186},
        ]}},
        {"type": "markdown", "props": {"text":
            "**洞察**：手机占比 40% 仍是主力；耳机增速最快，建议 Q4 加大投放。"}},
    ]


def _scenario_products() -> List[Dict[str, Any]]:
    return [
        {"type": "markdown", "props": {"text": "根据通勤场景，推荐这三款："}},
        {"type": "product_cards", "props": {"title": "🎧 通勤耳机推荐", "items": [
            {"name": "Teng Buds Pro 3", "emoji": "🔇", "price": "¥599", "tag": "降噪之王"},
            {"name": "Teng Buds Air", "emoji": "🪶", "price": "¥299", "tag": "轻量性价比"},
            {"name": "Teng OpenFit", "emoji": "👂", "price": "¥899", "tag": "开放式不闷耳"},
        ]}},
        {"type": "markdown", "props": {"text": "告诉我预算，我可以进一步筛选并生成参数对比表。"}},
    ]


def _scenario_default() -> List[Dict[str, Any]]:
    return [
        {"type": "markdown", "props": {"text":
            "你好！我是 **TengGenUI** 演示助手。我返回的不是纯文字，而是**结构化 UI 组件**，"
            "前端会实时渲染成可交互界面（对比表 / 统计卡 / 图表 / 表单）。"}},
        {"type": "steps", "props": {"title": "💡 试试这些", "steps": [
            "对比 Teng Phone 15 和 Ultra → 渲染对比表格",
            "帮我规划一次旅行 → 生成交互式表单",
            "看看本季度销售数据 → 统计卡片 + 柱状图",
            "推荐一款通勤耳机 → 商品卡片",
        ]}},
    ]


def mock_components(message: str) -> List[Dict[str, Any]]:
    msg = message.strip()
    if any(k in msg for k in ("对比", "比较", "哪款好")):
        return _scenario_compare()
    if any(k in msg for k in ("旅行", "行程", "旅游", "规划")):
        return _scenario_travel()
    if any(k in msg for k in ("销量", "数据", "报表", "GMV", "季度")):
        return _scenario_sales()
    if any(k in msg for k in ("推荐", "耳机", "买")):
        return _scenario_products()
    return _scenario_default()


def mock_followup(form_id: str, values: Dict[str, Any]) -> List[Dict[str, Any]]:
    """表单提交后的生成式回复（echo 用户输入，展示闭环交互）。"""
    dest = str(values.get("destination", "目的地"))
    raw_days = values.get("days", 5)
    try:
        days = int(float(raw_days))
    except (TypeError, ValueError):
        days = 5
    style = values.get("style", [])
    if isinstance(style, str):
        style = [style]
    styles = "、".join(str(s) for s in style) if style else "随性安排"

    return [
        {"type": "markdown", "props": {"text":
            f"收到！已根据 **{dest} · {days} 天 · {styles}** 生成行程概览："}},
        {"type": "steps", "props": {"title": "🗺 行程骨架", "steps": [
            f"D1-D2：抵达{dest} + 周边漫步 + 当地美食",
            f"D3-D{max(days - 1, 3)}：核心景点 + 摄影点位（{styles}）",
            f"D{days}：返程 + 伴手礼采购",
        ]}},
        {"type": "stat_cards", "props": {"cards": [
            {"label": "预计花费", "value": f"¥{days * 1300:,}"},
            {"label": "行程强度", "value": "适中"},
            {"label": "最佳季节", "value": "3-4 月"},
        ]}},
        {"type": "markdown", "props": {"text": "完整行程含酒店推荐与避坑清单，要不要导出成 PDF？"}},
    ]


def estimate_tokens(text: str) -> int:
    cn = len(re.findall(r"[一-鿿]", text))
    return max(1, cn + (len(text) - cn) // 4)


# ---------------------------------------------------------------- 流式输出

async def stream_components(components: List[Dict[str, Any]], emit: Any) -> None:
    """把组件 JSON 切成小块流式推送，模拟真实 LLM 的 token 流。"""
    payload = json.dumps({"components": components}, ensure_ascii=False)
    i = 0
    while i < len(payload):
        n = random.randint(6, 14)
        await emit("delta", {"text": payload[i:i + n]})
        i += n
        await asyncio.sleep(random.uniform(0.012, 0.03))
    await emit("usage", {
        "prompt_tokens": estimate_tokens(payload) // 2,
        "completion_tokens": estimate_tokens(payload),
        "total_tokens": estimate_tokens(payload) * 3 // 2,
    })


async def stream_real(message: str, emit: Any) -> None:
    """调用 OpenAI 兼容接口流式生成组件 JSON；异常向上抛，由调用方降级。"""
    from openai import AsyncOpenAI

    client = AsyncOpenAI()
    model = os.getenv("GENUI_MODEL", os.getenv("AGENT_MODEL", "gpt-4o-mini"))
    stream = await client.chat.completions.create(
        model=model,
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": message},
        ],
        temperature=0.3,
        stream=True,
    )
    completion, prompt = "", ""
    async for chunk in stream:
        if not chunk.choices:
            continue
        delta = chunk.choices[0].delta.content or ""
        if delta:
            completion += delta
            await emit("delta", {"text": delta})
    prompt = SYSTEM_PROMPT + message
    await emit("usage", {
        "prompt_tokens": estimate_tokens(prompt),
        "completion_tokens": estimate_tokens(completion),
        "total_tokens": estimate_tokens(prompt) + estimate_tokens(completion),
    })


async def run_generate(message: str, emit: Any) -> None:
    """生成入口：真实 LLM 优先，失败降级 Mock（demo 永不白屏）。"""
    use_real = bool(os.getenv("OPENAI_API_KEY"))
    await emit("meta", {
        "mode": "real" if use_real else "mock",
        "model": os.getenv("GENUI_MODEL", "gpt-4o-mini" if use_real else "mock-rules-v1"),
    })
    if use_real:
        try:
            await stream_real(message, emit)
            return
        except Exception as exc:  # noqa: BLE001
            await emit("fallback", {"reason": f"{type(exc).__name__}: {exc}", "to": "mock-rules-v1"})
    await stream_components(mock_components(message), emit)


async def run_submit(form_id: str, values: Dict[str, Any], emit: Any) -> None:
    """表单回传入口：Mock 直接生成闭环回复；真实模式把 values 拼进 prompt。"""
    use_real = bool(os.getenv("OPENAI_API_KEY"))
    await emit("meta", {
        "mode": "real" if use_real else "mock",
        "model": os.getenv("GENUI_MODEL", "gpt-4o-mini" if use_real else "mock-rules-v1"),
    })
    if use_real:
        try:
            summary = json.dumps(values, ensure_ascii=False)
            await stream_real(f"用户提交了表单 {form_id}，内容：{summary}。请生成确认与下一步的 UI。", emit)
            return
        except Exception as exc:  # noqa: BLE001
            await emit("fallback", {"reason": f"{type(exc).__name__}: {exc}", "to": "mock-rules-v1"})
    await stream_components(mock_followup(form_id, values), emit)
