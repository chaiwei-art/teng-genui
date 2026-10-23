export default function Steps({ title, steps }: { title?: string; steps: string[] }) {
  return (
    <div className="block">
      {title && <div className="block-title">{title}</div>}
      <ol className="steps-list">
        {steps.map((s, i) => (
          <li key={i}>
            <span className="step-num">{i + 1}</span>
            {s}
          </li>
        ))}
      </ol>
    </div>
  )
}
