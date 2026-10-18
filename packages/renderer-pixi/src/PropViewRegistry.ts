import { Container, Graphics, Text } from 'pixi.js'
import type { Prop, Template } from '@pixoffice/runtime/model'
import type { PresentedActor } from '@pixoffice/contracts/presentation'
import type { SceneProjection } from '@pixoffice/contracts/projection'
import { createOrthogonalProjection } from './projection.ts'

export interface PropView {
  roots: Container[]
  hitTarget: Container
  update(prop: Prop, template: Template, actors: PresentedActor[]): void
  updateFrame?(elapsedSeconds: number): void
}
export type PropViewFactory = (prop: Prop, template: Template) => PropView

const placeholderView = (projection: SceneProjection): PropViewFactory => (prop, template) => {
  const root = new Container(), graphic = new Graphics(), bounds = template.footprint
  const origin = projection.gridToScreen({ x: 0, y: 0 })
  graphic.poly(projection.areaPolygon(bounds).flatMap(p => [p.x - origin.x, p.y - origin.y])).fill({ color: 0xdce2de, alpha: .6 }).stroke({ color: 0x8c968f, width: 1 })
  const label = new Text({ text: prop.name, style: { fontSize: 10, fill: 0x67766b, wordWrap: true, wordWrapWidth: 90 } })
  label.anchor.set(.5, 1); root.addChild(graphic, label)
  return { roots: [root], hitTarget: root, update(p) { const point = projection.gridToScreen(p.position); root.position.set(point.x, point.y); root.zIndex = projection.depth(p.position) } }
}

/** Trusted view factories are assembled by the application, never downloaded by commands. */
export class PropViewRegistry {
  private factories = new Map<string, PropViewFactory>()
  private fallback: PropViewFactory
  constructor(projection: number | SceneProjection = 50) { this.fallback = placeholderView(typeof projection === 'number' ? createOrthogonalProjection(projection) : projection) }
  register(id: string, factory: PropViewFactory) {
    if (this.factories.has(id)) throw new Error(`Duplicate view: ${id}`)
    this.factories.set(id, factory)
  }
  create(prop: Prop, template: Template): PropView { return (this.factories.get(template.view) ?? this.fallback)(prop, template) }
}
