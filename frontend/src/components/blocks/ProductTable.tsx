export default function ProductTable({
  title,
  columns,
  rows,
}: {
  title?: string
  columns: string[]
  rows: string[][]
}) {
  return (
    <div className="block table-block">
      {title && <div className="block-title">{title}</div>}
      <div className="md-table-wrap">
        <table>
          <thead>
            <tr>
              {columns.map((c, i) => (
                <th key={i}>{c}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, ri) => (
              <tr key={ri}>
                {r.map((c, ci) => (
                  <td key={ci}>{c}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
