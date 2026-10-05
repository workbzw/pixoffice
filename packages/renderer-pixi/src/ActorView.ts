import { Container, Graphics, Rectangle } from 'pixi.js'
import type { DestroyOptions } from 'pixi.js'
import type { AnimatedVisual, VisualAssetLease } from '@pixoffice/contracts/animation'
import type { PresentedActor } from '@pixoffice/contracts/presentation'
import { AnimationPresenter } from './presentation/AnimationPresenter.ts'
import { StatusLabel } from './ui/StatusLabel.ts'
import { Bubble } from './ui/Bubble.ts'

/** Labels and pointer targets do not depend on the animation backend. */
export class ActorView extends Container {
  private visual?: AnimatedVisual<Container>
  private lease?: VisualAssetLease<Container>
  private presenter = new AnimationPresenter()
  private statusLabel: StatusLabel
  private bubble = new Bubble()
  private speech?: string
  private appearance: Container
  private animationError?: string

  constructor(actor: PresentedActor, lease?: VisualAssetLease<Container>) {
    super()
    this.lease = lease
    this.statusLabel = new StatusLabel(actor.name)
    this.appearance = new Container()
    if (lease) {
      this.visual = lease.create(this.presenter.sample(actor, lease.manifest, 0))
      this.appearance.addChild(this.visual.root)
    } else {
      this.appearance.addChild(new Graphics().circle(0, -.5, .15).fill(0xbfc5c1))
    }
    this.addChild(this.appearance, this.statusLabel, this.bubble)
    this.eventMode = 'static'; this.cursor = 'pointer'
    this.update(actor, 0)
  }
  get actionError() { return this.animationError }
  update(actor: PresentedActor, dt: number) {
    this.position.set(actor.position.x, actor.position.y); this.zIndex = actor.depth
    this.appearance.scale.set(actor.displayHeight)
    if (this.visual && this.lease) {
      try { this.visual.sample(this.presenter.sample(actor, this.lease.manifest, dt)); this.animationError = undefined }
      catch (error) { this.animationError = error instanceof Error ? error.message : String(error) }
    }
    this.statusLabel.setName(actor.name); this.statusLabel.setState(actor.status); this.statusLabel.setTask(this.animationError ?? actor.title)
    if (this.speech !== actor.bubble) {
      this.speech = actor.bubble
      if (this.speech) this.bubble.show(this.speech, 86400)
      else this.bubble.hide()
    }
    this.bubble.update(dt)
    const top = (this.visual?.getSocket('ui.label')?.y ?? -1) * actor.displayHeight
    this.statusLabel.layout(top)
    this.bubble.position.set(0, this.statusLabel.getLabelTopY(top) - 24 - Bubble.TAIL_TIP_Y)
    const b = this.visual?.getHitBounds() ?? { left: -.4, top: -1.1, right: .4, bottom: .4 }
    this.hitArea = new Rectangle(b.left * actor.displayHeight, b.top * actor.displayHeight, (b.right - b.left) * actor.displayHeight, (b.bottom - b.top) * actor.displayHeight)
  }
  override destroy(options?: DestroyOptions) {
    if (this.destroyed) return
    this.visual?.dispose(); this.visual = undefined
    super.destroy(options)
  }
}
