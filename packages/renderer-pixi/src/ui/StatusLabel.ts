import { Container, Graphics, Text } from 'pixi.js'

const NAME_STYLE = {
  fontFamily: 'system-ui, -apple-system, sans-serif',
  fontSize: 11,
  fontWeight: '600' as const,
  fill: 0x333333,
}

const TASK_STYLE = {
  fontFamily: 'system-ui, -apple-system, sans-serif',
  fontSize: 10,
  fill: 0x666666,
  fontStyle: 'italic' as const,
}

const STATE_COLORS: Record<string, number> = {
  idle: 0xaaaaaa,
  walking: 0x4a90d9,
  working: 0x50b86c,
  talking: 0xe8a838,
  thinking: 0x9b6dd7,
}

/** 名字顶边与任务框底边的间距（任务在名字上方） */
const NAME_TASK_GAP = 2
/** 名字底边与发顶之间的空隙 */
const CROWN_GAP = 8

export class StatusLabel extends Container {
  private nameText: Text
  private taskText: Text
  private stateDot: Graphics
  private taskBg: Graphics
  private taskLayer = new Container()
  private nameBg = new Graphics()
  private currentState = 'idle'
  private namePlateKey = ''

  constructor(name: string) {
    super()
    this.nameText = new Text({ text: name, style: NAME_STYLE })
    this.nameText.anchor.set(0.5, 1)
    this.nameText.position.set(0, 0)

    this.taskBg = new Graphics()
    this.taskText = new Text({ text: '', style: TASK_STYLE })
    this.taskText.anchor.set(0.5, 0)

    this.stateDot = new Graphics()
    this.taskLayer.addChild(this.taskBg, this.taskText)
    this.addChild(this.nameBg, this.taskLayer, this.nameText, this.stateDot)
    this.taskBg.visible = false
    this.paintStateDot()
  }

  setName(name: string) {
    if (this.nameText.text === name) return
    this.nameText.text = name
    this.paintStateDot()
  }

  setTask(task?: string) {
    if (this.taskText.text === (task ?? '')) return
    if (!task) {
      this.taskText.text = ''
      this.taskBg.visible = false
      return
    }
    this.taskText.text = task
    this.taskBg.visible = true

    this.layoutTaskAboveName()
  }

  private layoutTaskAboveName() {
    const padX = 5
    const padY = 3
    const w = this.taskText.width + padX * 2
    const h = this.taskText.height + padY * 2
    const nameH = this.nameText.height
    const taskTop = -h

    this.taskBg.clear()
    this.taskBg.roundRect(-w / 2, taskTop, w, h, 3)
    this.taskBg.fill({ color: 0xffffff, alpha: 0.9 })
    this.taskText.position.set(0, taskTop + padY)
    this.taskLayer.position.set(0, -nameH - NAME_TASK_GAP)
  }

  setState(state: string) {
    if (this.currentState === state) return
    this.currentState = state
    this.paintStateDot()
  }

  /** 发顶 Y：名字贴在发顶上方，任务叠在名字上面 */
  layout(crownTopY: number) {
    this.scale.set(1)
    if (this.namePlateKey) { this.nameBg.clear(); this.namePlateKey = '' }
    this.position.set(0, crownTopY - CROWN_GAP)
    this.taskLayer.position.set(0, this.taskBg.visible ? -this.nameText.height - NAME_TASK_GAP : 0)
  }

  layoutBeside(x: number, y: number, scale = 1, crownTopY?: number) {
    this.position.set(x, y); this.scale.set(scale)
    const width = this.nameText.width + 27, height = this.nameText.height + 12
    const key = `${width}:${height}`
    if (key !== this.namePlateKey) {
      this.namePlateKey = key
      this.nameBg.clear().roundRect(-width / 2, -this.nameText.height - 6, width, height, 6).fill({ color: 0xffffff, alpha: .96 })
    }
    if (crownTopY !== undefined) {
      // Keep the task over the actor even when the identity label sits beside the seat.
      this.taskLayer.position.set(-x / scale, (crownTopY - CROWN_GAP - y) / scale)
    }
  }

  /** 名字/任务标签块顶边 Y（Agent 本地坐标） */
  getLabelTopY(crownTopY: number): number {
    const baselineY = crownTopY - CROWN_GAP
    if (!this.taskBg.visible) {
      return baselineY - this.nameText.height * this.scale.y
    }
    return this.y + (this.taskLayer.y - this.taskText.height - 6) * this.scale.y
  }

  private paintStateDot() {
    const color = STATE_COLORS[this.currentState] ?? 0xaaaaaa
    this.stateDot.clear()
    this.stateDot.circle(
      this.nameText.width * 0.5 + 6,
      -this.nameText.height * 0.5,
      3.5,
    )
    this.stateDot.fill(color)
  }
}
