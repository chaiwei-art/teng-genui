/** 富文本块：支持 **粗体**、`代码`、- 列表、| 表格 |、# 标题。不做 HTML 注入，全部转义后拼 React 节点。 */
export default function Markdown({ text }: { text: string }) {
  const lines = text.split('\n')
  const out: React.ReactNode[] = []
  let listBuf: string[] = []
  let tableBuf: string[][] = []

  const flushList = () => {
    if (listBuf.length) {
      out.push(
        <ul key={out.length}>
          {listBuf.map((l, i) => (
            <li key={i}>{inline(l)}</li>
          ))}
        </ul>,
      )
      listBuf = []
    }
  }
  const flushTable = () => {
    if (tableBuf.length) {
      const [head, ...rows] = tableBuf
      out.push(
        <div className="md-table-wrap" key={out.length}>
          <table>
            <thead>
              <tr>
                {head.map((c, i) => (
                  <th key={i}>{inline(c.trim())}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, ri) => (
                <tr key={ri}>
                  {r.map((c, ci) => (
                    <td key={ci}>{inline(c.trim())}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>,
      )
      tableBuf = []
    }
  }

  for (const raw of lines) {
    if (/^\s*[-*]\s+/.test(raw)) {
      flushTable()
      listBuf.push(raw.replace(/^\s*[-*]\s+/, ''))
      continue
    }
    if (raw.includes('|') && /^\s*\|.*\|\s*$/.test(raw)) {
      flushList()
      tableBuf.push(raw.split('|').slice(1, -1))
      continue
    }
    flushList()
    flushTable()
    if (raw.startsWith('### ')) out.push(<h4 key={out.length}>{raw.slice(4)}</h4>)
    else if (raw.startsWith('## ')) out.push(<h3 key={out.length}>{raw.slice(3)}</h3>)
    else if (raw.startsWith('# ')) out.push(<h3 key={out.length}>{raw.slice(2)}</h3>)
    else if (raw.trim()) out.push(<p key={out.length}>{inline(raw)}</p>)
  }
  flushList()
  flushTable()

  return <div className="md">{out}</div>
}

/** 行内格式：**bold** 与 `code`。文本先不转义——React 文本节点天然安全。 */
function inline(text: string): React.ReactNode[] {
  const parts: React.ReactNode[] = []
  const re = /(\*\*[^*]+\*\*|`[^`]+`)/g
  let last = 0
  let m: RegExpExecArray | null
  while ((m = re.exec(text))) {
    if (m.index > last) parts.push(text.slice(last, m.index))
    const tok = m[0]
    if (tok.startsWith('**')) parts.push(<strong key={m.index}>{tok.slice(2, -2)}</strong>)
    else parts.push(<code key={m.index}>{tok.slice(1, -1)}</code>)
    last = m.index + tok.length
  }
  if (last < text.length) parts.push(text.slice(last))
  return parts
}
