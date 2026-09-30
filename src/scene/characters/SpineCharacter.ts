import { Spine } from '@esotericsoftware/spine-pixi-v8'
import { Container, Graphics } from 'pixi.js'
import type { AgentState } from '@/types/agent'
import {
  getSpineAtlasAlias,
  getSpineCharacterPack,
  getSpineSkeletonAlias,
  type SpineCharacterPack,
} from '@/scene/assets/loadSpineAssets'
import {
  type ChibiFacing,
  resolveChibiPresetAnim,
} from '@/scene/characters/chibiAgentPresets'
import { getChibiSkinName } from '@/scene/characters/chibiStickerSkins'

type AnimMap = Record<AgentState, string>

type PackConfig = {
  scale: number
  y: number
  shadow: { w: number; h: number; y: number }
  anim: AnimMap
  /** 左右用不同动画名，不用 scale 镜像 */
  directional?: boolean
  timeScale?: Partial<Record<AgentState, number>>
  /** 方向性动画：按朝向选 left/right 键 */
  animLR?: Partial<Record<AgentState, { left: string; right: string }>>
}

/**
 * 屏幕移动方向 → Spine 动画（Chibi 资源里 left/right 与屏幕左右相反）
 */
const CHIBI_DIR_ANIM: Record<
  'idle' | 'walking',
  Record<ChibiFacing, string>
> = {
  idle: {
    front: 'movement/idle-front',
    back: 'movement/idle-back',
    left: 'movement/idle-right',
    right: 'movement/idle-left',
  },
  walking: {
    front: 'movement/trot-front',
    back: 'movement/trot-back',
    left: 'movement/trot-right',
    right: 'movement/trot-left',
  },
}

const PACK_CONFIG: Record<SpineCharacterPack, PackConfig> = {
  'chibi-stickers': {
    scale: 0.3,
    y: 2,
    shadow: { w: 24, h: 7, y: 4 },
    directional: true,
    anim: {
      idle: 'movement/idle-front',
      walking: 'movement/trot-front',
      working: 'movement/idle-front',
      thinking: 'emotes/thinking',
      talking: 'emotes/wave',
    },
    animLR: {
      idle: { left: 'movement/idle-left', right: 'movement/idle-right' },
      walking: { left: 'movement/trot-left', right: 'movement/trot-right' },
      working: { left: 'movement/idle-left', right: 'movement/idle-right' },
    } satisfies Partial<Record<AgentState, { left: string; right: string }>>,
    timeScale: { thinking: 0.85, talking: 1.1 },
  },
}

export class SpineCharacter extends Container {
  private readonly agentId: string
  private readonly agentColor: number
  private spine: Spine | null = null
  private shadow: Graphics
  private currentAnim = ''
  private ready = false
  private pack: SpineCharacterPack | null = null
  private agentState: AgentState = 'idle'
  private customAnimation: string | undefined
  private facing: 1 | -1 = 1
  private viewFacing: ChibiFacing = 'front'

  constructor(agentId: string, agentColor: number) {
    super()
    this.agentId = agentId
    this.agentColor = agentColor
    this.shadow = new Graphics()
    this.addChild(this.shadow)
    this.createSpine()
  }

  get isReady() {
    return this.ready
  }

  setAgentColor(color: number) {
    if (!this.spine) return
    void color
    this.spine.skeleton.color.set(1, 1, 1, 1)
  }

  setFacing(dir: 1 | -1) {
    if (!this.spine || !this.pack) return
    const cfg = PACK_CONFIG[this.pack]
    this.facing = dir

    if (cfg.directional) {
      return
    }

    const base = Math.abs(this.spine.scale.x) || cfg.scale
    this.spine.scale.x = base * dir
  }

  setViewFacing(facing: ChibiFacing) {
    if (!this.spine || !this.pack) return
    const changed = this.viewFacing !== facing
    this.viewFacing = facing
    const cfg = PACK_CONFIG[this.pack]
    if (!cfg.directional) return
    if (changed) this.currentAnim = ''
    this.applyAnimation()
  }

  playState(state: AgentState, customAnimation?: string) {
    if (!this.spine || !this.ready || !this.pack) return
    this.agentState = state
    if (this.customAnimation !== customAnimation) {
      this.customAnimation = customAnimation
      this.currentAnim = ''
    }
    this.applyAnimation()
  }

  playAnimation(animation: string) {
    if (!this.spine || !this.ready) return
    if (!this.spine.skeleton.data.findAnimation(animation)) {
      console.warn('[SpineCharacter] animation not found', animation)
      return
    }

    this.customAnimation = animation
    this.agentState = 'talking'
    this.currentAnim = animation
    const entry = this.spine.state.setAnimation(0, animation, true)
    this.spine.state.timeScale = 1
    if (entry) entry.mixDuration = 0.12
  }

  getHeadOffsetY(): number {
    if (!this.spine || !this.pack) return -52

    const sy = Math.abs(this.spine.scale.y)
    const gap = 5

    const head = this.spine.skeleton.findBone('head-base')
    if (!head) {
      return this.spine.y - 84
    }

    const headCenter = this.spine.y + head.worldY * sy
    if (headCenter > this.spine.y + 2) {
      return this.spine.y - 84
    }
    return headCenter - 50 * sy - gap
  }

  private resolveAnimationName(): string {
    if (!this.pack) return 'idle'

    if (this.customAnimation && this.agentState !== 'walking') {
      return this.customAnimation
    }

    if (this.pack === 'chibi-stickers') {
      if (this.agentState === 'walking') {
        return CHIBI_DIR_ANIM.walking[this.viewFacing]
      }
      // 工位 idle / work / think：按四向坐姿，归位 back = 背对镜头
      if (
        this.agentState === 'idle' ||
        this.agentState === 'working' ||
        this.agentState === 'thinking'
      ) {
        return CHIBI_DIR_ANIM.idle[this.viewFacing]
      }
      if (
        this.agentState === 'talking' &&
        (this.viewFacing === 'left' || this.viewFacing === 'right')
      ) {
        return CHIBI_DIR_ANIM.idle[this.viewFacing]
      }
      const presetAnim = resolveChibiPresetAnim(this.agentId, this.agentState)
      if (presetAnim) return presetAnim
    }

    const cfg = PACK_CONFIG[this.pack]
    const lr = cfg.animLR?.[this.agentState]
    if (cfg.directional && lr) {
      return this.facing >= 0 ? lr.right : lr.left
    }
    return cfg.anim[this.agentState] ?? cfg.anim.idle
  }

  private applyAnimation() {
    if (!this.spine || !this.pack) return

    const cfg = PACK_CONFIG[this.pack]
    const animName = this.resolveAnimationName()

    if (cfg.directional) {
      const base = cfg.scale
      this.spine.scale.x = base
      this.spine.scale.y = base
    }

    const walkKey =
      this.pack === 'chibi-stickers' && this.agentState === 'walking'
        ? `${animName}@${this.viewFacing}`
        : animName
    if (walkKey === this.currentAnim) {
      this.spine.state.timeScale = cfg.timeScale?.[this.agentState] ?? 1
      return
    }

    if (!this.spine.skeleton.data.findAnimation(animName)) {
      const fallback = cfg.anim.idle
      this.spine.state.setAnimation(0, fallback, true)
      this.currentAnim = fallback
      return
    }

    this.currentAnim = walkKey
    const entry = this.spine.state.setAnimation(0, animName, true)
    this.spine.state.timeScale = cfg.timeScale?.[this.agentState] ?? 1
    if (entry) entry.mixDuration = 0.22
  }

  private createSpine() {
    const pack = getSpineCharacterPack()
    if (!pack) return
    this.pack = pack

    try {
      const cfg = PACK_CONFIG[pack]
      const spine = Spine.from({
        skeleton: getSpineSkeletonAlias(),
        atlas: getSpineAtlasAlias(),
        scale: cfg.scale,
        autoUpdate: true,
      })

      if (pack === 'chibi-stickers') {
        const skinName = getChibiSkinName(this.agentId)
        if (spine.skeleton.data.findSkin(skinName)) {
          spine.skeleton.setSkinByName(skinName)
          spine.skeleton.setSlotsToSetupPose()
        }
      }

      spine.state.data.defaultMix = 0.22
      spine.position.set(0, cfg.y)
      this.spine = spine
      this.ready = true
      this.addChild(spine)
      this.drawShadow(cfg.shadow)
      this.setAgentColor(this.agentColor)
      this.applyAnimation()
    } catch (err) {
      console.error(`[SpineCharacter] 角色创建失败 (${pack}):`, err)
      this.ready = false
    }
  }

  private drawShadow(shadow: { w: number; h: number; y: number }) {
    this.shadow.clear()
    this.shadow.ellipse(0, shadow.y, shadow.w, shadow.h)
    this.shadow.fill({ color: 0x000000, alpha: 0.12 })
  }
}
