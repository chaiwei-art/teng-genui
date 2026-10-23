"""teng-genui 后端：FastAPI + SSE，流式输出生成式 UI 组件 JSON。"""
from __future__ import annotations

import asyncio
import json
from typing import Any, AsyncIterator, Awaitable, Callable, Dict

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from genui import COMPONENT_CATALOG, run_generate, run_submit

app = FastAPI(title="teng-genui", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


class GenerateRequest(BaseModel):
    message: str


class FormSubmitRequest(BaseModel):
    form_id: str
    values: Dict[str, Any] = {}


EmitFn = Callable[[str, Dict[str, Any]], Awaitable[None]]


@app.get("/api/health")
async def health() -> Dict[str, str]:
    return {"status": "ok"}


@app.get("/api/schema")
async def schema() -> Dict[str, str]:
    return {"catalog": COMPONENT_CATALOG}


def _sse(event: str, data: Dict[str, Any]) -> str:
    return f"event: {event}\ndata: {json.dumps(data, ensure_ascii=False)}\n\n"


async def _stream(runner: Callable[[EmitFn], Awaitable[None]]) -> StreamingResponse:
    """把 (emit) => runner 包装成 SSE 流：worker 线程 emit 进队列，生成器逐帧写出。"""
    queue: asyncio.Queue = asyncio.Queue()
    done_marker = object()

    async def emit(event: str, data: Dict[str, Any]) -> None:
        queue.put_nowait((event, data))

    async def worker() -> None:
        try:
            await runner(emit)
        except Exception as exc:  # noqa: BLE001 - 把错误也推给前端展示
            await emit("error", {"message": f"{type(exc).__name__}: {exc}"})
        finally:
            queue.put_nowait((done_marker, None))

    asyncio.ensure_future(worker())

    async def gen() -> AsyncIterator[str]:
        while True:
            event, data = await queue.get()
            if event is done_marker:
                yield _sse("done", {})
                break
            yield _sse(event, data)

    return StreamingResponse(
        gen(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@app.post("/api/generate")
async def generate(req: GenerateRequest) -> StreamingResponse:
    message = req.message.strip()
    return await _stream(lambda emit: run_generate(message, emit))


@app.post("/api/submit")
async def submit(req: FormSubmitRequest) -> StreamingResponse:
    return await _stream(lambda emit: run_submit(req.form_id, req.values, emit))


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8001)
