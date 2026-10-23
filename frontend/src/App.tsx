import { useRef, useState } from 'react'
import { StreamParser, type ParsedStream } from './lib/streamParser'
import { streamSSE } from './lib/sse'
import { probeBackend, runLocalGenerate, runLocalSubmit } from './lib/mockStream'
import GenUIRenderer from './components/GenUIRenderer'
import type { GenComponent } from './schema'

interface ChatEntry {
  id: number
  role: 'user' | 'agent'
  text?: string // 用户消息或纯文本回退
  components?: GenComponent[]
  stream?: ParsedStream
  mode?: string
  fallback?: string
  error?: string
}

const SUGGESTIONS = ['对比 Teng Phone 15 和 Ultra', '帮我规划一次旅行', '看看本季度销售数据', '推荐一款通勤耳机']

let uid = 0

export default function App() {
  const [entries, setEntries] = useState<ChatEntry[]>([])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [submittedForms, setSubmittedForms] = useState<Set<string>>(new Set())
  const parserRef = useRef<StreamParser | null>(null)
  const entryIdRef = useRef(0)
  const scrollerRef = useRef<HTMLDivElement>(null)

  const patch = (id: number, fn: (e: ChatEntry) => ChatEntry) =>
    setEntries((prev) => prev.map((e) => (e.id === id ? fn(e) : e)))

  const scrollDown = () =>
    requestAnimationFrame(() => {
      const el = scrollerRef.current
      if (el) el.scrollTop = el.scrollHeight
    })

  type H = Record<string, (d: Record<string, unknown>) => void>

  /**
   * 统一事件处理 + 后端探测：
   * 后端可达 → SSE 真实流；不可达（GitHub Pages）→ 浏览器端同构模拟流。
   * 两种来源产出相同事件序列，渲染路径零分叉。
   */
  async function runStream(
    agentId: number,
    parser: StreamParser,
    doReal: (handlers: H) => Promise<void>,
    doLocal: (emit: (event: string, data: Record<string, unknown>) => void) => Promise<void>,
  ) {
    const modeTag = (d: Record<string, unknown>) =>
      `${d.mode === 'real' ? '🤖' : d.mode === 'local' ? '🖥' : '🧪'} ${String(d.model)}`
    const handlers: H = {
      meta: (d) => patch(agentId, (e) => ({ ...e, mode: modeTag(d) })),
      fallback: (d) => patch(agentId, (e) => ({ ...e, fallback: String(d.reason) })),
      delta: (d) => {
        const r = parser.push(String(d.text))
        patch(agentId, (e) => ({ ...e, stream: r }))
        scrollDown()
      },
      error: (d) => patch(agentId, (e) => ({ ...e, error: String(d.message) })),
      done: () => {
        const r = parser.finish()
        patch(agentId, (e) => ({ ...e, stream: r }))
        scrollDown()
      },
    }
    if (await probeBackend()) {
      await doReal(handlers)
    } else {
      await doLocal((event, data) => handlers[event]?.(data))
    }
  }

  async function send(message: string) {
    if (!message.trim() || busy) return
    setInput('')
    setBusy(true)
    setSubmittedForms(new Set())

    const userId = ++uid
    const agentId = ++uid
    entryIdRef.current = agentId
    const parser = new StreamParser()
    parserRef.current = parser

    setEntries((p) => [
      ...p,
      { id: userId, role: 'user', text: message.trim() },
      { id: agentId, role: 'agent', stream: { components: [], raw: '', done: false, dropped: 0 } },
    ])
    scrollDown()

    try {
      await runStream(
        agentId,
        parser,
        (h) => streamSSE('/api/generate', { message }, h),
        (emit) => runLocalGenerate(message, emit),
      )
    } catch (err) {
      patch(agentId, (e) => ({ ...e, error: String(err) }))
    } finally {
      setBusy(false)
    }
  }

  async function onFormSubmit(formId: string, values: Record<string, unknown>) {
    if (busy) return
    setBusy(true)
    setSubmittedForms((p) => new Set(p).add(formId))

    const userId = ++uid
    const agentId = ++uid
    const summary = Object.entries(values)
      .map(([k, v]) => `${k}=${Array.isArray(v) ? v.join('/') : v}`)
      .join(', ')
    const parser = new StreamParser()

    setEntries((p) => [
      ...p,
      { id: userId, role: 'user', text: `📋 提交表单 ${formId}：${summary}` },
      { id: agentId, role: 'agent', stream: { components: [], raw: '', done: false, dropped: 0 } },
    ])
    scrollDown()

    try {
      await runStream(
        agentId,
        parser,
        (h) => streamSSE('/api/submit', { form_id: formId, values }, h),
        (emit) => runLocalSubmit(formId, values, emit),
      )
    } catch (err) {
      patch(agentId, (e) => ({ ...e, error: String(err) }))
    } finally {
      setBusy(false)
    }
  }

  const lastStream = [...entries].reverse().find((e) => e.role === 'agent' && e.stream)?.stream

  return (
    <div className="layout">
      <section className="chat">
        <header className="chat-header">
          <div className="brand">
            <span className="brand-logo">🧬</span>
            <div>
              <h1>TengGenUI</h1>
              <p>生成式 UI · LLM 输出组件而非文本</p>
            </div>
          </div>
        </header>

        <div className="chat-box" ref={scrollerRef}>
          {entries.length === 0 && (
            <div className="welcome">
              <h2>AI 回复的不是文字，是界面</h2>
              <p>
                LLM 流式输出组件 JSON，前端<b>边收边渲染</b>：表格 / 卡片 / 图表 / 可交互表单，
                全部经 zod 白名单校验后渲染。
              </p>
              <div className="suggestions">
                {SUGGESTIONS.map((s) => (
                  <button key={s} className="sug-btn" onClick={() => send(s)} disabled={busy}>
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {entries.map((e) =>
            e.role === 'user' ? (
              <div key={e.id} className="msg user-msg">{e.text}</div>
            ) : (
              <div key={e.id} className="msg agent-msg">
                {e.mode && <div className="mode-chip">{e.mode}</div>}
                {e.fallback && <div className="fallback-chip">⚠️ 真实模型失败，已降级 Mock：{e.fallback.slice(0, 80)}</div>}
                {e.error && <div className="error-chip">❌ {e.error}</div>}
                {e.stream && e.stream.components.length > 0 && (
                  <GenUIRenderer
                    components={e.stream.components}
                    onFormSubmit={onFormSubmit}
                    submittedForms={submittedForms}
                  />
                )}
                {e.stream && e.stream.components.length === 0 && !e.stream.done && (
                  <div className="thinking">接收组件流…</div>
                )}
                {e.stream && e.stream.dropped > 0 && (
                  <div className="dropped-chip">已丢弃 {e.stream.dropped} 个未通过校验的组件块</div>
                )}
              </div>
            ),
          )}
        </div>

        <footer className="chat-input">
          <textarea
            value={input}
            rows={2}
            placeholder="Enter 发送，Shift+Enter 换行…"
            onChange={(ev) => setInput(ev.target.value)}
            onKeyDown={(ev) => {
              if (ev.key === 'Enter' && !ev.shiftKey) {
                ev.preventDefault()
                send(input)
              }
            }}
          />
          <button className="send-btn" disabled={busy || !input.trim()} onClick={() => send(input)}>
            {busy ? '…' : '发送'}
          </button>
        </footer>
      </section>

      <aside className="panel">
        <div className="panel-title">原始组件流（LLM 输出）</div>
        <pre className="raw-json">{lastStream?.raw || '等待流式输出…'}</pre>
        {lastStream && (
          <div className="panel-stats">
            <span>已渲染 {lastStream.components.length} 个组件</span>
            {lastStream.dropped > 0 && <span className="warn">丢弃 {lastStream.dropped}</span>}
            <span>{lastStream.done ? '✓ 流结束' : '接收中…'}</span>
          </div>
        )}
      </aside>
    </div>
  )
}
