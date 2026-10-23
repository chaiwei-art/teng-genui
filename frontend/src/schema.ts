/**
 * 组件 Schema（zod）。
 *
 * 安全边界：LLM 输出的 JSON 永远不可信。渲染前必须通过 schema 校验，
 * 只有白名单内的组件类型会被渲染，未知类型降级为调试卡片——
 * 杜绝 LLM 输出任意 HTML/脚本的注入风险。
 */
import { z } from 'zod'

export const markdownSchema = z.object({
  type: z.literal('markdown'),
  props: z.object({ text: z.string().max(4000) }),
})

export const productTableSchema = z.object({
  type: z.literal('product_table'),
  props: z.object({
    title: z.string().optional(),
    columns: z.array(z.string().max(60)).min(1).max(12),
    rows: z.array(z.array(z.string().max(200))).max(30),
  }),
})

export const productCardsSchema = z.object({
  type: z.literal('product_cards'),
  props: z.object({
    title: z.string().optional(),
    items: z
      .array(
        z.object({
          name: z.string().max(80),
          emoji: z.string().max(8).optional(),
          price: z.string().max(30),
          tag: z.string().max(30).optional(),
        }),
      )
      .min(1)
      .max(8),
  }),
})

export const statCardsSchema = z.object({
  type: z.literal('stat_cards'),
  props: z.object({
    cards: z
      .array(
        z.object({
          label: z.string().max(40),
          value: z.string().max(40),
          delta: z.string().max(30).optional(),
        }),
      )
      .min(1)
      .max(6),
  }),
})

export const barChartSchema = z.object({
  type: z.literal('bar_chart'),
  props: z.object({
    title: z.string().optional(),
    unit: z.string().max(20).optional(),
    data: z
      .array(
        z.object({
          label: z.string().max(40),
          value: z.number().finite(),
        }),
      )
      .min(1)
      .max(12),
  }),
})

export const stepsSchema = z.object({
  type: z.literal('steps'),
  props: z.object({
    title: z.string().optional(),
    steps: z.array(z.string().max(200)).min(1).max(12),
  }),
})

export const formFieldSchema = z.object({
  name: z.string().max(40),
  label: z.string().max(40),
  kind: z.enum(['text', 'select', 'multiselect', 'slider', 'date']),
  options: z.array(z.string().max(60)).max(12).optional(),
  min: z.number().optional(),
  max: z.number().optional(),
  default: z.union([z.string(), z.number()]).optional(),
})

export const genFormSchema = z.object({
  type: z.literal('gen_form'),
  props: z.object({
    form_id: z.string().max(60),
    title: z.string().optional(),
    submit_text: z.string().max(30).optional(),
    fields: z.array(formFieldSchema).min(1).max(10),
  }),
})

export const componentSchema = z.discriminatedUnion('type', [
  markdownSchema,
  productTableSchema,
  productCardsSchema,
  statCardsSchema,
  barChartSchema,
  stepsSchema,
  genFormSchema,
])

export type GenComponent = z.infer<typeof componentSchema>
export type ComponentType = GenComponent['type']
export type FormField = z.infer<typeof formFieldSchema>

export const KNOWN_TYPES: ComponentType[] = [
  'markdown',
  'product_table',
  'product_cards',
  'stat_cards',
  'bar_chart',
  'steps',
  'gen_form',
]
