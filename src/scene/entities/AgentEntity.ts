import { Container, Graphics, Rectangle } from 'pixi.js'
import type { Agent, AgentState } from '@/types/agent'
import {
  resolveWalkViewFacing,
  viewFacingToLR,
} from '@/scene/systems/movementFacing'
import { ApartmentCharacter } from '@/scene/characters/ApartmentCharacter'
import { transformWorkSurface, type WorkSurface } from '@/scene/characters/workSurface'
import { shouldSitAtDesk } from '@/scene/characters/apartmentFrames'
import { isApartmentReady } from '@/scene/assets/loadApartmentAssets'
import { Bubble } from '@/scene/ui/Bubble'
import { StatusLabel } from '@/scene/ui/StatusLabel'

export class AgentEntity extends Container {
  readonly agentId: string
  private agent: Agent
  private character: ApartmentCharacter | null = null
  private fallbackBody: Graphics | null = null
  private fallbackScarf: Graphics | null = null
  private statusLabel: StatusLabel
  private bubble: Bubble
  private walkPhase = 0
  private animationX: number
  private animationY: number

  constructor(agent: Agent, frameResourcesOwned = true) {
    super()
    this.agentId = agent.id
    this.agent = { ...agent }
    this.animationX = agent.x
    this.animationY = agent.y

    this.statusLabel = new StatusLabel(agent.name)
    this.bubble = new Bubble()

    if (frameResourcesOwned && isApartmentReady(agent.appearanceId ?? agent.id)) {
      this.character = new ApartmentCharacter(agent.appearanceId ?? agent.id)
      if (this.character.isReady) {
        this.character.setAgentColor(agent.color)
        this.character.setFacing(agent.facing)
        this.character.setViewFacing(agent.viewFacing ?? 'front')
        this.syncCharacterState()
        this.addChild(this.character, this.statusLabel, this.bubble)
      } else {
        this.character.destroy()
        this.character = null
        this.initFallbackGraphics()
      }
    } else {
      this.initFallbackGraphics()
    }

    this.eventMode = 'static'
    this.cursor = 'pointer'
    this.hitArea = new Rectangle(-34, -92, 68, 124)

    this.syncVisual()
    this.position.set(agent.x, agent.y)
  }

  get data(): Agent {
    return this.agent
  }

  apply(patch: Partial<Agent>) {
    const previousName = this.agent.name
    const previousBubble = this.agent.bubbleText
    const prevState = this.agent.state
    const prevFacing = this.agent.facing
    const prevViewFacing = this.agent.viewFacing
    const prevColor = this.agent.color
    const prevCustomAnimation = this.agent.customAnimation
    this.agent = { ...this.agent, ...patch }
    if (previousName !== this.agent.name) this.statusLabel.setName(this.agent.name)
    if (previousBubble !== this.agent.bubbleText) {
      if (this.agent.bubbleText) this.bubble.show(this.agent.bubbleText, 86400)
      else this.bubble.hide()
    }

    if (this.character) {
      this.character.setAtDesk(shouldSitAtDesk(this.agent))
      if (patch.viewFacing != null && patch.viewFacing !== prevViewFacing) {
        this.character.setViewFacing(patch.viewFacing)
      }
      if (patch.facing != null && patch.facing !== prevFacing) {
        this.character.setFacing(patch.facing)
      }
      if (
        (patch.state != null && patch.state !== prevState) ||
        patch.customAnimation !== prevCustomAnimation
      ) {
        this.syncCharacterState()
      }
      if (patch.color != null && patch.color !== prevColor) {
        this.character.setAgentColor(patch.color)
      }
      this.updateOverlayPositions()
    } else {
      this.syncVisual()
    }
  }

  setPosition(x: number, y: number) {
    this.agent.x = x
    this.agent.y = y
    this.position.set(x, y)
  }

  showBubble(text: string, duration = 4) {
    this.agent.bubbleText = text
    this.bubble.show(text, duration)
    this.character?.setSpeechText(text)
    this.updateOverlayPositions()
  }

  hideBubble() {
    this.agent.bubbleText = undefined
    this.bubble.hide()
    this.character?.setSpeechText(undefined)
  }

  playCustomAnimation(animation: string, task?: string) {
    this.agent = {
      ...this.agent,
      state: 'talking',
      currentTask: task,
      customAnimation: animation,
      viewFacing: 'front',
      facing: 1,
      targetX: undefined,
      targetY: undefined,
      walkPath: undefined,
      walkPathIndex: undefined,
      mission: undefined,
      bubbleText: undefined,
    }

    if (this.character) {
      this.character.setViewFacing('front')
      this.character.setFacing(1)
      this.character.playAnimation(animation)
      this.updateOverlayPositions()
      return
    }

    this.syncVisual()
  }

  setWorkSurface(surface?: WorkSurface) {
    this.character?.setWorkSurface(surface && transformWorkSurface(surface, 1, -this.agent.x, -this.agent.y))
  }

  updateVisuals(state: AgentState, dt: number) {
    const distanceMoved = Math.hypot(this.agent.x - this.animationX, this.agent.y - this.animationY)
    this.animationX = this.agent.x
    this.animationY = this.agent.y
    if (this.character) {
      if (
        state === 'walking' &&
        this.agent.targetX != null &&
        this.agent.targetY != null
      ) {
        // Docking supplies its own facing; a raw grid target is not the next visual waypoint.
        const viewFacing = this.agent.seatTransition && this.agent.viewFacing
          ? this.agent.viewFacing
          : resolveWalkViewFacing(
            this.agent.targetX - this.agent.x,
            this.agent.targetY - this.agent.y,
            this.agent.viewFacing ?? 'front',
          )
        this.agent.viewFacing = viewFacing
        this.agent.facing = viewFacingToLR(viewFacing)
        this.character.setViewFacing(viewFacing)
        this.character.setFacing(this.agent.facing)
      } else if ((state === 'working' || state === 'thinking') && this.agent.seated !== true) {
        if (this.agent.viewFacing !== 'back') {
          this.agent.viewFacing = 'back'
          this.character.setViewFacing('back')
        }
      }
      this.syncCharacterState(state)
      this.character.update(dt, distanceMoved)
    } else {
      this.walkPhase += dt * 8
      this.drawFallbackBody(state, 0)
    }

    this.bubble.update(dt)
    this.statusLabel.setState(state)
    this.statusLabel.setTask(
      state === 'working' || state === 'thinking' ? this.agent.currentTask : undefined,
    )
    this.updateOverlayPositions()
  }

  private updateOverlayPositions() {
    const crownTopY = this.character?.getHeadOffsetY() ?? -58
    this.statusLabel.layout(crownTopY)
    const labelTopY = this.statusLabel.getLabelTopY(crownTopY)
    const gapAboveLabel = 24
    this.bubble.position.set(
      0,
      labelTopY - gapAboveLabel - Bubble.TAIL_TIP_Y,
    )
  }

  private syncCharacterState(state = this.agent.state) {
    this.character?.setAtDesk(shouldSitAtDesk(this.agent))
    this.character?.setSeatTransition(this.agent.seatTransition)
    this.character?.setSpeechText(this.agent.bubbleText)
    this.character?.playState(state, this.agent.customAnimation)
  }

  private syncVisual() {
    this.statusLabel.setName(this.agent.name)
    this.statusLabel.setState(this.agent.state)
    this.statusLabel.setTask(
      this.agent.state === 'working' || this.agent.state === 'thinking'
        ? this.agent.currentTask
        : undefined,
    )
    if (this.agent.bubbleText) {
      this.bubble.show(this.agent.bubbleText)
    }
    if (this.character) {
      this.syncCharacterState()
      this.character.setFacing(this.agent.facing)
      this.character.setViewFacing(this.agent.viewFacing ?? 'front')
      this.character.setAgentColor(this.agent.color)
    } else {
      this.drawFallbackBody(this.agent.state, 0)
    }
    this.updateOverlayPositions()
  }

  private initFallbackGraphics() {
    this.fallbackBody = new Graphics()
    this.fallbackScarf = new Graphics()
    this.addChild(this.fallbackBody, this.fallbackScarf, this.statusLabel, this.bubble)
  }

  private drawFallbackBody(state: AgentState, bob: number) {
    if (!this.fallbackBody || !this.fallbackScarf) return

    const facing = this.agent.facing
    const g = this.fallbackBody
    const s = this.fallbackScarf
    g.clear()
    s.clear()

    const bounce =
      state === 'walking'
        ? Math.sin(this.walkPhase) * 2
        : state === 'working'
          ? Math.sin(this.walkPhase * 2) * 1
          : bob

    // shadow
    g.ellipse(0, 16 + bounce, 14, 4)
    g.fill({ color: 0x000000, alpha: 0.1 })

    // legs / pants
    const legSwing = state === 'walking' ? Math.sin(this.walkPhase) * 3 : 0
    g.roundRect(-9, 6 + bounce + legSwing, 7, 12, 2)
    g.fill(0x3a3f4a)
    g.roundRect(2, 6 + bounce - legSwing, 7, 12, 2)
    g.fill(0x3a3f4a)

    // shirt body
    g.roundRect(-11, -8 + bounce, 22, 18, 4)
    g.fill(0xf8f8f6)
    g.roundRect(-7, -8 + bounce, 14, 4, 2)
    g.fill(0xe8e8e6)

    // head
    g.circle(facing * 1, -20 + bounce, 10)
    g.fill(0xffe0c4)
    g.roundRect(facing * 1 - 10, -28 + bounce, 20, 8, 3)
    g.fill(0x2a2a30)

    // typing arm when working
    if (state === 'working') {
      const armY = -4 + bounce + Math.sin(this.walkPhase * 3) * 2
      g.roundRect(facing * 12, armY, 8, 4, 2)
      g.fill(0xf8f8f6)
    }

    // thinking dots
    if (state === 'thinking') {
      for (let i = 0; i < 3; i++) {
        g.circle(14 + i * 6, -34 + bounce, 2)
        g.fill({ color: 0x9b6dd7, alpha: i <= Math.floor(this.walkPhase) % 3 ? 1 : 0.3 })
      }
    }

    // badge / 工牌
    s.roundRect(facing * 4 - 5, -2 + bounce, 10, 8, 2)
    s.fill(this.agent.color)

    this.scale.x = facing
  }
}
