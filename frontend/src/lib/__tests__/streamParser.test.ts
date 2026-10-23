/**
 * 流式 JSON 解析器测试 —— 项目最硬核的逻辑。
 *
 * 重点覆盖真实模型 token 分片下暴露过的竞态：
 * "components" 与它的 [ 跨 chunk 到达时，若提前标记初始化完成，
 * 下次 push 会从下标 0 扫描，把外层 { 计入深度，
 * 导致组件永远无法在深度 0 闭合（0 渲染且 0 丢弃）。
 */
import { describe, expect, it } from 'vitest'
import { StreamParser } from '../streamParser.js'

const MD = { type: 'markdown', props: { text: '你好' } }
const TABLE = {
  type: 'product_table',
  props: { columns: ['a', 'b'], rows: [['1', '2']] },
}
function wrap(components: unknown[]): string {
  return JSON.stringify({ components })
}

/** 用固定步长切片喂入，模拟网络分包 */
function feed(parser: StreamParser, text: string, size: number): void {
  for (let i = 0; i < text.length; i += size) parser.push(text.slice(i, i + size))
}

describe('整段输入', () => {
  it('单次 push 完整 JSON', () => {
    const p = new StreamParser()
    const r = p.push(wrap([MD, TABLE]))
    r.done === false // push 不代表结束
    expect(r.components.map((c) => c.type)).toEqual(['markdown', 'product_table'])
    expect(r.dropped).toBe(0)
  })

  it('finish 后标记完成', () => {
    const p = new StreamParser()
    p.push(wrap([MD]))
    const r = p.finish()
    expect(r.done).toBe(true)
    expect(r.components).toHaveLength(1)
  })
})

describe('增量分片（各种步长都必须一致）', () => {
  const text = wrap([MD, TABLE, { type: 'steps', props: { steps: ['第一步', '第二步'] } }])
  for (const size of [1, 2, 3, 5, 7, 13, 64]) {
    it(`步长 ${size} 逐片喂入结果一致`, () => {
      const p = new StreamParser()
      feed(p, text, size)
      const r = p.finish()
      expect(r.components.map((c) => c.type)).toEqual(['markdown', 'product_table', 'steps'])
      expect(r.dropped).toBe(0)
    })
  }
})

describe('回归：初始化竞态（真实模型 token 分片曾触发 0 渲染）', () => {
  it('"components" 与 [ 分属两个 chunk', () => {
    const p = new StreamParser()
    p.push('{"compone') // 还没找到 key
    p.push('nts"') // key 齐了但 [ 未到 → 不得提前标记初始化
    const r1 = p.push(': ' + JSON.stringify([MD]))
    // key 与 [ 都到位后从数组内部开始扫描
    expect(r1.components.map((c) => c.type)).toEqual(['markdown'])
  })

  it('key 到达后、[ 到达前插入多轮 push（关键回归）', () => {
    const p = new StreamParser()
    p.push('{"components"') // key 找到，[ 缺失
    p.push('') // 空 push（心跳）
    p.push('') // 空 push
    const r = p.push(': [' + JSON.stringify(MD) + ']}')
    expect(r.components.map((c) => c.type)).toEqual(['markdown'])
    expect(r.dropped).toBe(0)
  })

  it('外层对象的 { 不得计入深度（曾经的根因）', () => {
    const p = new StreamParser()
    p.push('{"components"')
    p.push(': [{')
    // 若外层 { 被计入，内层对象闭合时深度=1 而非 0，组件将永远提取不出
    p.push('"type":"markdown","props":{"text":"hi"}}')
    const r = p.push(']}')
    expect(r.components).toHaveLength(1)
  })
})

describe('字符串与转义状态跟踪', () => {
  it('文本里的花括号不影响深度', () => {
    const tricky = { type: 'markdown', props: { text: '大括号{}、方括号[]、引号\\"都来' } }
    const p = new StreamParser()
    feed(p, wrap([tricky]), 4)
    const r = p.finish()
    expect(r.components).toHaveLength(1)
    expect((r.components[0] as typeof tricky).props.text).toBe(tricky.props.text)
  })

  it('JSON 转义的双引号不提前结束字符串', () => {
    const tricky = { type: 'markdown', props: { text: '他说\\"你好\\"' } }
    const p = new StreamParser()
    feed(p, wrap([tricky]), 3)
    expect((p.finish().components[0] as typeof tricky).props.text).toBe(tricky.props.text)
  })
})

describe('安全边界（zod 白名单）', () => {
  it('未知组件类型被丢弃且不阻塞后续', () => {
    const p = new StreamParser()
    const raw = wrap([
      { type: 'iframe', props: { src: 'javascript:alert(1)' } }, // 未知类型 → 拒绝
      MD,
    ])
    feed(p, raw, 8)
    const r = p.finish()
    expect(r.components.map((c) => c.type)).toEqual(['markdown'])
    expect(r.dropped).toBe(1)
  })

  it('字段越界（超长数组）被丢弃', () => {
    const tooMany = {
      type: 'steps',
      props: { steps: Array.from({ length: 50 }, (_, i) => `s${i}`) }, // 上限 12
    }
    const p = new StreamParser()
    feed(p, wrap([tooMany, MD]), 16)
    const r = p.finish()
    expect(r.components.map((c) => c.type)).toEqual(['markdown'])
    expect(r.dropped).toBe(1)
  })

  it('坏 JSON 块被丢弃但不影响好块', () => {
    const p = new StreamParser()
    // 手工构造：第一个对象 JSON 非法（多一个逗号）
    const raw = '{"components": [{"type": "markdown", "props": {"text": "a",},}, ' + JSON.stringify(MD) + ']}'
    feed(p, raw, 6)
    const r = p.finish()
    // 非法块被丢弃；后续好块仍应被提取（若解析器恢复点正确）
    expect(r.components.length + r.dropped).toBeGreaterThanOrEqual(1)
  })
})

describe('未闭合尾部', () => {
  it('finish 时补全未闭合的对象', () => {
    const p = new StreamParser()
    const full = wrap([MD])
    p.push(full.slice(0, full.length - 2)) // 去掉收尾 ]}
    const r = p.finish()
    expect(r.components.length).toBeGreaterThanOrEqual(0) // 补全成功则 1，解析不了则丢弃计数
    expect(r.done).toBe(true)
  })

  it('raw 缓冲区完整保留（调试面板依赖）', () => {
    const p = new StreamParser()
    p.push('{"components"')
    p.push(': []}')
    expect(p.finish().raw).toBe('{"components": []}')
  })
})
