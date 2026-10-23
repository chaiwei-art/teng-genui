import { useState } from 'react'
import type { FormField } from '../../schema'

export default function GenForm({
  form_id,
  title,
  submit_text,
  fields,
  onSubmit,
  submitted,
}: {
  form_id: string
  title?: string
  submit_text?: string
  fields: FormField[]
  onSubmit?: (formId: string, values: Record<string, unknown>) => void
  submitted: boolean
}) {
  const [values, setValues] = useState<Record<string, string | string[]>>(() => {
    const init: Record<string, string | string[]> = {}
    for (const f of fields) {
      if (f.kind === 'multiselect') init[f.name] = []
      else if (f.default !== undefined) init[f.name] = String(f.default)
      else if (f.kind === 'slider') init[f.name] = String(f.min ?? 0)
      else init[f.name] = ''
    }
    return init
  })

  const set = (name: string, v: string | string[]) => setValues((p) => ({ ...p, [name]: v }))

  const toggleMulti = (name: string, opt: string) =>
    setValues((p) => {
      const cur = (p[name] as string[]) ?? []
      return { ...p, [name]: cur.includes(opt) ? cur.filter((x) => x !== opt) : [...cur, opt] }
    })

  const submit = () => {
    if (submitted) return
    onSubmit?.(form_id, values)
  }

  return (
    <div className={`block form-block ${submitted ? 'submitted' : ''}`}>
      {title && <div className="block-title">{title}</div>}
      <div className="form-fields">
        {fields.map((f) => (
          <label key={f.name} className="field">
            <span className="field-label">{f.label}</span>
            {f.kind === 'text' && (
              <input
                type="text"
                value={values[f.name] as string}
                disabled={submitted}
                onChange={(e) => set(f.name, e.target.value)}
              />
            )}
            {f.kind === 'date' && (
              <input
                type="date"
                value={values[f.name] as string}
                disabled={submitted}
                onChange={(e) => set(f.name, e.target.value)}
              />
            )}
            {f.kind === 'select' && (
              <select
                value={values[f.name] as string}
                disabled={submitted}
                onChange={(e) => set(f.name, e.target.value)}
              >
                <option value="" disabled>
                  请选择…
                </option>
                {f.options?.map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
              </select>
            )}
            {f.kind === 'slider' && (
              <div className="slider-row">
                <input
                  type="range"
                  min={f.min ?? 0}
                  max={f.max ?? 100}
                  value={values[f.name] as string}
                  disabled={submitted}
                  onChange={(e) => set(f.name, e.target.value)}
                />
                <span className="slider-val">{values[f.name]}</span>
              </div>
            )}
            {f.kind === 'multiselect' && (
              <div className="chip-row">
                {f.options?.map((o) => {
                  const active = ((values[f.name] as string[]) ?? []).includes(o)
                  return (
                    <button
                      key={o}
                      type="button"
                      disabled={submitted}
                      className={`chip ${active ? 'active' : ''}`}
                      onClick={() => toggleMulti(f.name, o)}
                    >
                      {o}
                    </button>
                  )
                })}
              </div>
            )}
          </label>
        ))}
      </div>
      <button className="form-submit" disabled={submitted} onClick={submit}>
        {submitted ? '✓ 已提交，生成中…' : (submit_text ?? '提交')}
      </button>
    </div>
  )
}
