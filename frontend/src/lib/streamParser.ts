/**
 * 流式 JSON 增量解析器 —— 本项目技术核心。
 *
 * 问题：LLM 以 token 流返回一段 JSON（如 {"components":[{...},{...}]}），
 * 我们希望"边接收边渲染"，而不是等全部收完再一次性渲染。
 *
 * 思路：不追求完整 JSON.parse，而是用括号深度扫描，
 * 把已完整闭合的数组元素逐个提取出来：
 * 1. 定位 components 数组的起始 [
 * 2. 逐字符扫描，跟踪 {} 深度与字符串/转义状态
 * 3. 深度回到 0 且遇到 } 时，切出一段完整对象立即 JSON.parse
 * 4. 解析失败的对象直接丢弃（LLM 偶尔输出坏 JSON 时不影响其余渲染）
 *
 * 这样组件可以在流式接收过程中逐个"点亮"，实现渐进式渲染。
 */
import type { GenComponent } from '../schema'
import { componentSchema } from '../schema'

export interface ParsedStream {
  /** 已成功校验、可渲染的组件 */
  components: GenComponent[]
  /** 原始缓冲区（给调试面板展示） */
  raw: string
  /** 是否已完整收流 */
  done: boolean
  /** 丢弃的坏块数量 */
  dropped: number
}

export class StreamParser {
  private buf = ''
  private scanned = 0 // 已扫描到的下标（在 components 数组内部）
  private arrayStart = -1
  private depth = 0
  private inString = false
  private escape = false
  private objStart = -1
  private components: GenComponent[] = []
  private dropped = 0

  /** 喂入一段增量文本，返回当前可渲染的组件列表 */
  push(chunk: string): ParsedStream {
    this.buf += chunk
    if (this.arrayStart === -1) {
      this.arrayStart = this.buf.indexOf('"components"')
      if (this.arrayStart === -1) return this.result(false)
      const bracket = this.buf.indexOf('[', this.arrayStart)
      if (bracket === -1) return this.result(false)
      this.scanned = bracket + 1
    }
    this.scan()
    return this.result(false)
  }

  private scan() {
    const buf = this.buf
    for (let i = this.scanned; i < buf.length; i++) {
      const ch = buf[i]
      if (this.inString) {
        if (this.escape) this.escape = false
        else if (ch === '\\') this.escape = true
        else if (ch === '"') this.inString = false
        continue
      }
      if (ch === '"') {
        this.inString = true
        continue
      }
      if (ch === '{') {
        if (this.depth === 0) this.objStart = i
        this.depth++
      } else if (ch === '}') {
        this.depth--
        if (this.depth === 0 && this.objStart !== -1) {
          this.take(buf.slice(this.objStart, i + 1))
          this.objStart = -1
        }
      } else if (ch === ']' && this.depth === 0) {
        // components 数组闭合，流结束
        this.scanned = buf.length
        return
      }
    }
    this.scanned = buf.length
  }

  private take(rawObj: string) {
    let json: unknown
    try {
      json = JSON.parse(rawObj)
    } catch {
      this.dropped++
      return
    }
    const parsed = componentSchema.safeParse(json)
    if (parsed.success) {
      this.components.push(parsed.data)
    } else {
      // 未通过 schema：未知类型或字段越界，丢弃不渲染（安全边界）
      this.dropped++
    }
  }

  /** 流结束时调用，尝试把残余内容也解析出来 */
  finish(): ParsedStream {
    if (this.objStart !== -1 && this.depth > 0) {
      // 未闭合的尾部对象：尝试补全右括号再解析一次
      const tail = this.buf.slice(this.objStart)
      const closers = '}'.repeat(this.depth)
      this.take(tail.slice(0, tail.length) + closers)
      this.objStart = -1
      this.depth = 0
    }
    return this.result(true)
  }

  private result(done: boolean): ParsedStream {
    return {
      components: this.components,
      raw: this.buf,
      done,
      dropped: this.dropped,
    }
  }
}
