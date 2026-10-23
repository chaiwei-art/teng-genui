export default function ProductCards({
  title,
  items,
}: {
  title?: string
  items: { name: string; emoji?: string; price: string; tag?: string }[]
}) {
  return (
    <div className="block">
      {title && <div className="block-title">{title}</div>}
      <div className="cards-grid">
        {items.map((it, i) => (
          <div key={i} className="product-card">
            <div className="pc-emoji">{it.emoji ?? '🛍️'}</div>
            <div className="pc-name">{it.name}</div>
            <div className="pc-price">{it.price}</div>
            {it.tag && <div className="pc-tag">{it.tag}</div>}
          </div>
        ))}
      </div>
    </div>
  )
}
