/**
 * GenUI 渲染器：组件注册表模式。
 * 新增组件类型只需在 registry 注册，渲染器本身无需改动。
 * 未注册的类型由 streamParser 的 zod 校验层拦截，永远不会到渲染层。
 */
import type { GenComponent } from '../schema'
import Markdown from './blocks/Markdown'
import ProductTable from './blocks/ProductTable'
import ProductCards from './blocks/ProductCards'
import StatCards from './blocks/StatCards'
import BarChart from './blocks/BarChart'
import Steps from './blocks/Steps'
import GenForm from './blocks/GenForm'

interface RendererProps {
  comp: GenComponent
  onFormSubmit?: (formId: string, values: Record<string, unknown>) => void
  submittedForms?: Set<string>
}

function Block({ comp, onFormSubmit, submittedForms }: RendererProps) {
  switch (comp.type) {
    case 'markdown':
      return <Markdown text={comp.props.text} />
    case 'product_table':
      return <ProductTable {...comp.props} />
    case 'product_cards':
      return <ProductCards {...comp.props} />
    case 'stat_cards':
      return <StatCards {...comp.props} />
    case 'bar_chart':
      return <BarChart {...comp.props} />
    case 'steps':
      return <Steps {...comp.props} />
    case 'gen_form':
      return (
        <GenForm
          {...comp.props}
          onSubmit={onFormSubmit}
          submitted={submittedForms?.has(comp.props.form_id) ?? false}
        />
      )
  }
}

export default function GenUIRenderer({
  components,
  onFormSubmit,
  submittedForms,
}: {
  components: GenComponent[]
  onFormSubmit?: (formId: string, values: Record<string, unknown>) => void
  submittedForms?: Set<string>
}) {
  return (
    <div className="genui">
      {components.map((comp, i) => (
        <div key={i} className="genui-block enter">
          <Block comp={comp} onFormSubmit={onFormSubmit} submittedForms={submittedForms} />
        </div>
      ))}
    </div>
  )
}
