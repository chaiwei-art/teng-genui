/**
 * SSE 客户端（fetch + ReadableStream 手写解析）。
 * 与 teng-agent-console 同款实现：维护跨 chunk 的帧缓冲。
 */
export type EventHandler = (data: Record<string, unknown>) => void

export async function streamSSE(
  url: string,
  body: unknown,
  handlers: Record<string, EventHandler>,
  signal?: AbortSignal,
): Promise<void> {
  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  })
  if (!resp.ok || !resp.body) throw new Error(`HTTP ${resp.status}`)

  const reader = resp.body.getReader()
  const decoder = new TextDecoder('utf-8')
  let buffer = ''

  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })

    let idx: number
    while ((idx = buffer.indexOf('\n\n')) !== -1) {
      const frame = buffer.slice(0, idx)
      buffer = buffer.slice(idx + 2)
      dispatch(frame, handlers)
    }
  }
}

function dispatch(frame: string, handlers: Record<string, EventHandler>): void {
  let event = 'message'
  const dataLines: string[] = []
  for (const line of frame.split('\n')) {
    if (line.startsWith('event:')) event = line.slice(6).trim()
    else if (line.startsWith('data:')) dataLines.push(line.slice(5).trim())
  }
  if (!dataLines.length) return
  try {
    const data = JSON.parse(dataLines.join('\n'))
    handlers[event]?.(data)
  } catch {
    // 忽略坏帧
  }
}
