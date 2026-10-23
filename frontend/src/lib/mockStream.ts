/**
 * 浏览器端生成式 UI 模拟流（离线 Demo 模式）。
 *
 * 后端不可达时（GitHub Pages），在浏览器内重放与 backend/genui.py
 * 同构的组件 JSON 流：meta → delta×N → usage → done。
 * 组件 Schema 与 Mock 场景保持一致，前端渲染路径零分叉。
 */

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
const est = (t: string) =>
  Math.max(1, Math.ceil((t.match(/[一-鿿]/g) || []).length + (t.length - (t.match(/[一-鿿]/g) || []).length) / 4))

type Emit = (event: string, data: Record<string, unknown>) => Promise<void> | void

// ---------------- 场景（与 backend/genui.py 对应场景同构） ----------------

function scenarioCompare(): unknown[] {
  return [
    { type: 'markdown', props: { text: '好的，我从价格、影像、续航三个维度对比了这两款旗舰机：' } },
    {
      type: 'product_table',
      props: {
        title: '📱 旗舰手机对比',
        columns: ['维度', 'Teng Phone 15 Ultra', 'Teng Phone 15'],
        rows: [
          ['价格', '¥4999', '¥3299'],
          ['主摄', '5000万 哈苏联合调校', '5000万 标准'],
          ['电池', '5800mAh', '5200mAh'],
          ['卫星通信', '✅ 支持', '❌ 不支持'],
          ['推荐人群', '摄影 / 商务', '日常 / 性价比'],
        ],
      },
    },
    {
      type: 'stat_cards',
      props: {
        cards: [
          { label: '价差', value: '¥1700', delta: 'Ultra 贵 52%' },
          { label: '续航差距', value: '600mAh', delta: 'Ultra 多 11%' },
        ],
      },
    },
    {
      type: 'markdown',
      props: { text: '**结论**：预算充足选 Ultra 的影像与卫星通信；追求性价比选标准版，日常体验差距不大。' },
    },
  ]
}

function scenarioTravel(): unknown[] {
  return [
    { type: 'markdown', props: { text: '没问题！填写下面的偏好表单，我会生成一份专属行程：' } },
    {
      type: 'gen_form',
      props: {
        form_id: 'travel_pref',
        title: '🧭 旅行偏好收集',
        submit_text: '生成行程',
        fields: [
          {
            name: 'destination', label: '目的地', kind: 'select',
            options: ['云南大理', '新疆喀纳斯', '日本京都', '冰岛环岛'],
          },
          { name: 'days', label: '旅行天数', kind: 'slider', min: 2, max: 15, default: 5 },
          {
            name: 'style', label: '旅行风格', kind: 'multiselect',
            options: ['自然风光', '人文历史', '美食探店', '冒险户外', '躺平度假'],
          },
          { name: 'budget', label: '人均预算', kind: 'select', options: ['3000以内', '3000-8000', '8000-15000', '15000+'] },
          { name: 'depart', label: '出发日期', kind: 'date' },
        ],
      },
    },
  ]
}

function scenarioSales(): unknown[] {
  return [
    { type: 'markdown', props: { text: '这是本季度各品类销量数据：' } },
    {
      type: 'stat_cards',
      props: {
        cards: [
          { label: '季度 GMV', value: '¥1,284万', delta: '+18.2%' },
          { label: '订单量', value: '3.2万', delta: '+9.4%' },
          { label: '客单价', value: '¥401', delta: '+5.1%' },
        ],
      },
    },
    {
      type: 'bar_chart',
      props: {
        title: '各品类销量', unit: '万元',
        data: [
          { label: '手机', value: 520 },
          { label: '耳机', value: 310 },
          { label: '手表', value: 268 },
          { label: '平板', value: 186 },
        ],
      },
    },
    { type: 'markdown', props: { text: '**洞察**：手机占比 40% 仍是主力；耳机增速最快，建议 Q4 加大投放。' } },
  ]
}

function scenarioProducts(): unknown[] {
  return [
    { type: 'markdown', props: { text: '根据通勤场景，推荐这三款：' } },
    {
      type: 'product_cards',
      props: {
        title: '🎧 通勤耳机推荐',
        items: [
          { name: 'Teng Buds Pro 3', emoji: '🔇', price: '¥599', tag: '降噪之王' },
          { name: 'Teng Buds Air', emoji: '🪶', price: '¥299', tag: '轻量性价比' },
          { name: 'Teng OpenFit', emoji: '👂', price: '¥899', tag: '开放式不闷耳' },
        ],
      },
    },
    { type: 'markdown', props: { text: '告诉我预算，我可以进一步筛选并生成参数对比表。' } },
  ]
}

function scenarioDefault(): unknown[] {
  return [
    {
      type: 'markdown',
      props: {
        text:
          '你好！我是 **TengGenUI** 演示助手。我返回的不是纯文字，而是**结构化 UI 组件**，' +
          '前端会实时渲染成可交互界面（对比表 / 统计卡 / 图表 / 表单）。',
      },
    },
    {
      type: 'steps',
      props: {
        title: '💡 试试这些',
        steps: [
          '对比 Teng Phone 15 和 Ultra → 渲染对比表格',
          '帮我规划一次旅行 → 生成交互式表单',
          '看看本季度销售数据 → 统计卡片 + 柱状图',
          '推荐一款通勤耳机 → 商品卡片',
        ],
      },
    },
  ]
}

export function pickScenario(message: string): unknown[] {
  if (/对比|比较|哪款好/.test(message)) return scenarioCompare()
  if (/旅行|行程|旅游|规划/.test(message)) return scenarioTravel()
  if (/销量|数据|报表|GMV|季度/.test(message)) return scenarioSales()
  if (/推荐|耳机|买/.test(message)) return scenarioProducts()
  return scenarioDefault()
}

function followupScenario(values: Record<string, unknown>): unknown[] {
  const dest = String(values.destination ?? '目的地')
  let days = 5
  try {
    days = Math.round(Number(values.days))
  } catch { /* ignore */ }
  if (!Number.isFinite(days) || days <= 0) days = 5
  const style = Array.isArray(values.style) ? (values.style as string[]) : [String(values.style ?? '')]
  const styles = style.filter(Boolean).join('、') || '随性安排'

  return [
    { type: 'markdown', props: { text: `收到！已根据 **${dest} · ${days} 天 · ${styles}** 生成行程概览：` } },
    {
      type: 'steps',
      props: {
        title: '🗺 行程骨架',
        steps: [
          `D1-D2：抵达${dest} + 周边漫步 + 当地美食`,
          `D3-D${Math.max(days - 1, 3)}：核心景点 + 摄影点位（${styles}）`,
          `D${days}：返程 + 伴手礼采购`,
        ],
      },
    },
    {
      type: 'stat_cards',
      props: {
        cards: [
          { label: '预计花费', value: `¥${(days * 1300).toLocaleString()}` },
          { label: '行程强度', value: '适中' },
          { label: '最佳季节', value: '3-4 月' },
        ],
      },
    },
    { type: 'markdown', props: { text: '完整行程含酒店推荐与避坑清单，要不要导出成 PDF？' } },
  ]
}

/** 组件 JSON 流式重放（与后端 stream_components 同构） */
async function streamComponents(components: unknown[], emit: Emit): Promise<void> {
  const payload = JSON.stringify({ components })
  for (let i = 0; i < payload.length; ) {
    const n = 6 + Math.floor(Math.random() * 9)
    await emit('delta', { text: payload.slice(i, i + n) })
    i += n
    await sleep(14 + Math.random() * 16)
  }
  await emit('usage', {
    prompt_tokens: est(payload) >> 1,
    completion_tokens: est(payload),
    total_tokens: Math.round(est(payload) * 1.5),
  })
}

export async function runLocalGenerate(message: string, emit: Emit): Promise<void> {
  await emit('meta', { mode: 'local', model: 'browser-demo-scenarios' })
  await streamComponents(pickScenario(message), emit)
  await emit('done', {})
}

export async function runLocalSubmit(
  formId: string,
  values: Record<string, unknown>,
  emit: Emit,
): Promise<void> {
  void formId
  await emit('meta', { mode: 'local', model: 'browser-demo-scenarios' })
  await streamComponents(followupScenario(values), emit)
  await emit('done', {})
}

/** 后端可用性探测（页面生命周期内一次并缓存） */
let _backendOk: boolean | null = null
export async function probeBackend(): Promise<boolean> {
  if (_backendOk !== null) return _backendOk
  try {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), 2500)
    const r = await fetch('/api/health', { signal: ctrl.signal })
    clearTimeout(timer)
    _backendOk = r.ok
  } catch {
    _backendOk = false
  }
  return _backendOk
}
