import { Container, Graphics, Rectangle } from 'pixi.js'
import type { DestroyOptions } from 'pixi.js'
import type { AnimatedVisual, VisualAssetLease } from '@pixoffice/contracts/animation'
import type { PresentedActor } from '@pixoffice/contracts/presentation'
import { AnimationPresenter } from './presentation/AnimationPresenter.ts'
import { StatusLabel } from './ui/StatusLabel.ts'
import { Bubble } from './ui/Bubble.ts'
import { TaskBadge } from './ui/TaskBadge.ts'

/** Labels and pointer targets do not depend on the animation backend. */
export class ActorView extends Container {
  readonly overlay = new Container()
  private visual?: AnimatedVisual<Container>
  private lease?: VisualAssetLease<Container>
  private presenter = new AnimationPresenter()
  private statusLabel: StatusLabel
  private bubble = new Bubble()
  private taskBadge = new TaskBadge()
  private speech?: string
  private appearance: Container
  private animationError?: string
  private visualBounds = new Rectangle()
  private anchoredTask = false
  private taskOccluded = false
  private clearOcclusionSeconds = 0

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
    this.addChild(this.appearance)
    this.overlay.addChild(this.statusLabel, this.taskBadge, this.bubble)
    this.overlay.eventMode = 'passive'
    this.on('pointerover', () => this.taskBadge.setHovered(true))
    this.on('pointerout', () => this.taskBadge.setHovered(false))
    this.eventMode = 'static'; this.cursor = 'pointer'
    this.update(actor, 0)
  }
  get actionError() { return this.animationError }
  setSelected(value: boolean) { this.taskBadge.setSelected(value); this.overlay.zIndex = this.taskBadge.isExpanded ? Number.MAX_SAFE_INTEGER : this.zIndex }
  getVisualBounds() { return this.visualBounds }
  getTaskOcclusionBounds() {
    if (!this.anchoredTask || !this.taskBadge.visible) return undefined
    const bounds = this.taskBadge.occlusionBounds
    return new Rectangle(this.overlay.x + this.taskBadge.x + bounds.x, this.overlay.y + this.taskBadge.y + bounds.y, bounds.width, bounds.height)
  }
  setTaskOccluded(value: boolean, elapsedSeconds: number) {
    if (value) { this.taskOccluded = true; this.clearOcclusionSeconds = 0 }
    else if (this.taskOccluded) {
      this.clearOcclusionSeconds += Math.max(0, elapsedSeconds)
      if (this.clearOcclusionSeconds >= .18) this.taskOccluded = false
    }
    this.taskBadge.setOccluded(this.taskOccluded)
  }
  update(actor: PresentedActor, dt: number) {
    this.position.set(actor.position.x, actor.position.y); this.zIndex = actor.depth
    this.overlay.position.copyFrom(this.position)
    this.appearance.scale.set(actor.displayHeight)
    if (this.visual && this.lease) {
      try { this.visual.sample(this.presenter.sample(actor, this.lease.manifest, dt)); this.animationError = undefined }
      catch (error) { this.animationError = error instanceof Error ? error.message : String(error) }
    }
    this.statusLabel.setName(actor.name); this.statusLabel.setState(actor.status); this.statusLabel.setTask(this.animationError ?? (actor.task ? undefined : actor.title))
    this.taskBadge.setPlacement(actor.taskAnchor?.placement ?? 'above')
    this.taskBadge.setTask(actor.task)
    this.taskBadge.update(dt)
    if (this.speech !== actor.bubble) {
      this.speech = actor.bubble
      if (this.speech) this.bubble.show(this.speech, 86400)
      else this.bubble.hide()
    }
    this.bubble.update(dt)
    const top = (this.visual?.getSocket('ui.label')?.y ?? -1) * actor.displayHeight
    this.statusLabel.layout(top)
    if (actor.label?.placement === 'beside') this.statusLabel.layoutBeside(actor.label.x, actor.label.y, actor.label.scale, top)
    if (actor.label?.placement === 'above') this.statusLabel.scale.set(actor.label.scale ?? 1)
    const labelTop = this.statusLabel.getLabelTopY(top)
    this.taskBadge.position.set(actor.taskAnchor ? actor.taskAnchor.x - actor.position.x : 0,
      actor.taskAnchor ? actor.taskAnchor.y - actor.position.y : labelTop - 4)
    this.taskBadge.visible = Boolean(actor.task) && (Boolean(actor.taskAnchor) || !this.speech) && !this.animationError
    this.anchoredTask = Boolean(actor.taskAnchor)
    this.bubble.position.set(0, labelTop - 24 - Bubble.TAIL_TIP_Y)
    const b = this.visual?.getHitBounds() ?? { left: -.4, top: -1.1, right: .4, bottom: .4 }
    const hit = new Rectangle(b.left * actor.displayHeight, b.top * actor.displayHeight, (b.right - b.left) * actor.displayHeight, (b.bottom - b.top) * actor.displayHeight)
    this.hitArea = hit
    // Pointer targets are generous; occlusion follows the narrower visible body and stable crown.
    const bodyWidth = hit.width * .7, bodyBottom = Math.min(b.bottom * actor.displayHeight, actor.displayHeight * .1)
    this.visualBounds = new Rectangle(actor.position.x + hit.x + (hit.width - bodyWidth) / 2,
      actor.position.y + top, bodyWidth, Math.max(0, bodyBottom - top))
  }
  override destroy(options?: DestroyOptions) {
    if (this.destroyed) return
    this.visual?.dispose(); this.visual = undefined
    this.overlay.destroy({ children: true })
    super.destroy(options)
  }
}
