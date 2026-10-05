import { Container, Graphics, Text } from 'pixi.js'
import type { Prop, Template } from '@pixoffice/runtime/model'
import type { PresentedActor } from '@pixoffice/contracts/presentation'

export interface PropView {
  roots: Container[]
  hitTarget: Container
  update(prop: Prop, template: Template, actors: PresentedActor[]): void
}
export type PropViewFactory = (prop: Prop, template: Template) => PropView

const placeholderView = (CELL_PIXELS: number): PropViewFactory => (prop, template) => {
  const root = new Container(), graphic = new Graphics(), bounds = template.footprint
  graphic.rect(bounds.left * CELL_PIXELS, bounds.top * CELL_PIXELS, (bounds.right - bounds.left) * CELL_PIXELS, (bounds.bottom - bounds.top) * CELL_PIXELS).fill({ color: 0xdce2de, alpha: .6 }).stroke({ color: 0x8c968f, width: 1 })
  const label = new Text({ text: prop.name, style: { fontSize: 10, fill: 0x67766b, wordWrap: true, wordWrapWidth: 90 } })
  label.anchor.set(.5, 1); root.addChild(graphic, label)
  return { roots: [root], hitTarget: root, update(p) { root.position.set(p.position.x * CELL_PIXELS, p.position.y * CELL_PIXELS); root.zIndex = p.position.y * CELL_PIXELS } }
}

/** Trusted view factories are assembled by the application, never downloaded by commands. */
export class PropViewRegistry {
  private factories = new Map<string, PropViewFactory>()
  private fallback: PropViewFactory
  constructor(cellPixels = 50) { this.fallback = placeholderView(cellPixels) }
  register(id: string, factory: PropViewFactory) {
    if (this.factories.has(id)) throw new Error(`Duplicate view: ${id}`)
    this.factories.set(id, factory)
  }
  create(prop: Prop, template: Template): PropView { return (this.factories.get(template.view) ?? this.fallback)(prop, template) }
}
