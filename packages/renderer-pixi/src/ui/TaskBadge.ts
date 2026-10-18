import { Container, Graphics, Rectangle, Text } from 'pixi.js'
import type { ActorTaskPresentation } from '@pixoffice/contracts/presentation'

const FONT = 'system-ui, -apple-system, sans-serif'
const COLORS = { idle: 0x8b948f, queued: 0x8b948f, running: 0x36b57e, blocked: 0xe1a12d, completed: 0x36b57e, failed: 0xd16d66 }
const STATUS = { idle: '待命', queued: '待开始', running: '进行中', blocked: '待处理', completed: '已完成', failed: '需关注' }
const ACTIVITY_PROGRESS_LIMIT = 99
const ACTIVITY_PROGRESS_SECONDS = 12

export class TaskBadge extends Container {
  private bg = new Graphics()
  private mark = new Graphics()
  private track = new Graphics()
  private titleText = new Text({ text: '', style: { fontFamily: FONT, fontSize: 16, fontWeight: '700', fill: 0x263c36 } })
  private statusText = new Text({ text: '已完成', style: { fontFamily: FONT, fontSize: 10, fontWeight: '600', fill: COLORS.completed } })
  private detailText = new Text({ text: '', style: { fontFamily: FONT, fontSize: 12, fontWeight: '400', lineHeight: 16, fill: 0x727c77 } })
  private percentText = new Text({ text: '', style: { fontFamily: FONT, fontSize: 10, fill: 0x727c77 } })
  private data?: ActorTaskPresentation
  private key = ''
  private expanded = false
  private hovered = false
  private selected = false
  private occluded = false
  private compact = false
  private fullBounds = new Rectangle()
  private bodyTop = 0
  private placement: 'above' | 'right' = 'above'
  private displayedProgress?: number
  private targetProgress?: number
  private progressFrom = 0
  private progressElapsed = 0
  private barLayout?: { left: number; right: number; width: number; color: number; y: number }
  private readonly reduceMotion = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches

  constructor() {
    super()
    this.addChild(this.bg, this.mark, this.track, this.titleText, this.statusText, this.detailText, this.percentText)
    this.bg.alpha = .5
    this.eventMode = 'static'; this.cursor = 'pointer'; this.visible = false
    this.on('pointerover', () => this.setHovered(true))
    this.on('pointerout', () => this.setHovered(false))
  }

  setTask(data?: ActorTaskPresentation) {
    const key = JSON.stringify(data)
    if (key === this.key) return
    const sameTask = this.data && data && (this.data.id ?? this.data.title) === (data.id ?? data.title) && this.data.progressMode === data.progressMode
    const next = data?.status !== 'idle' && data?.progress !== undefined && Number.isFinite(data.progress) && data.progress >= 0 && data.progress <= 100 ? data.progress : undefined
    if (data?.progressMode === 'activity') {
      if (!sameTask || this.displayedProgress === undefined || this.data?.status === 'completed' && data.status !== 'completed') this.displayedProgress = 0
      if (data.status === 'completed') this.displayedProgress = 100
      else if (data.status === 'idle') this.displayedProgress = undefined
      this.targetProgress = undefined
    } else {
      if (!sameTask || this.displayedProgress === undefined || next === undefined || this.reduceMotion) this.displayedProgress = next
      if (next !== this.targetProgress) {
        this.progressFrom = this.displayedProgress ?? next ?? 0
        this.progressElapsed = 0
      }
      this.targetProgress = next
    }
    this.key = key; this.data = data; this.visible = Boolean(data)
    if (data) this.redraw()
  }

  update(elapsedSeconds: number) {
    if (!Number.isFinite(elapsedSeconds) || elapsedSeconds <= 0) return
    if (this.data?.progressMode === 'activity') {
      if (this.reduceMotion || this.data.status !== 'running' || this.displayedProgress === undefined) return
      const next = Math.min(ACTIVITY_PROGRESS_LIMIT, ACTIVITY_PROGRESS_LIMIT
        - (ACTIVITY_PROGRESS_LIMIT - this.displayedProgress) * Math.exp(-elapsedSeconds / ACTIVITY_PROGRESS_SECONDS))
      if (next === this.displayedProgress) return
      this.displayedProgress = next
      this.paintProgress()
      return
    }
    if (this.targetProgress === undefined || this.displayedProgress === this.targetProgress) return
    this.progressElapsed = Math.min(.28, this.progressElapsed + elapsedSeconds)
    const t = this.progressElapsed / .28, eased = 1 - (1 - t) ** 3
    this.displayedProgress = t === 1 ? this.targetProgress : this.progressFrom + (this.targetProgress - this.progressFrom) * eased
    this.paintProgress()
  }

  setHovered(value: boolean) { this.hovered = value; this.updateExpansion() }
  setSelected(value: boolean) { this.selected = value; this.updateExpansion() }
  setOccluded(value: boolean) {
    if (this.occluded === value) return
    this.occluded = value; this.updateExpansion()
  }
  setPlacement(value: 'above' | 'right') {
    if (value === this.placement) return
    this.placement = value
    if (this.data) this.redraw()
  }
  get isExpanded() { return this.expanded }
  get isCompact() { return this.compact }
  get occlusionBounds() { return this.fullBounds }
  get topY() { return this.y + this.bodyTop }

  private updateExpansion() {
    const next = this.hovered || this.selected
    const compact = this.occluded && !next
    if (next === this.expanded && compact === this.compact) return
    this.expanded = next
    this.compact = compact
    if (this.data) this.redraw()
  }

  private fit(text: Text, value: string, width: number, height = Infinity) {
    text.text = value
    const fits = () => text.width <= width && text.height <= height
    if (fits()) return
    const characters = [...new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(value)].map(item => item.segment)
    let low = 0, high = characters.length
    while (low < high) {
      const mid = Math.ceil((low + high) / 2)
      text.text = characters.slice(0, mid).join('') + '\u2026'
      if (fits()) low = mid
      else high = mid - 1
    }
    text.text = characters.slice(0, low).join('') + '\u2026'
  }

  private redraw() {
    const data = this.data!
    const idle = data.status === 'idle'
    const expanded = this.expanded && !idle
    const compact = this.compact && !idle
    const normalWidth = idle ? 76 : expanded ? 226 : 186
    const normalHeight = idle ? 27 : expanded ? 88 : 70
    const width = compact ? 146 : normalWidth
    const height = compact ? 31 : normalHeight
    const beside = this.placement === 'right'
    // Keep testing the full card area while folded to avoid repeated expand/collapse cycles.
    this.fullBounds = new Rectangle(beside ? 8 : -normalWidth / 2, beside ? -normalHeight / 2 : -normalHeight - 7, normalWidth, normalHeight)
    const left = beside ? 8 : -width / 2, right = left + width, top = beside ? -height / 2 : -height - 7, color = COLORS[data.status]
    this.bodyTop = top
    this.bg.clear().roundRect(left, top, width, height, 7).fill(0xffffff).stroke({ color: 0xdce3de, width: .7 })
    if (beside) this.bg.moveTo(left, -7).lineTo(0, 0).lineTo(left, 7).fill(0xffffff)
    else this.bg.moveTo(-7, -7).lineTo(0, 0).lineTo(7, -7).fill(0xffffff)
    this.hitArea = new Rectangle(beside ? 0 : left, top, width + (beside ? 8 : 0), height + (beside ? 0 : 7))
    const markY = top + (idle || compact ? height / 2 : 19)
    this.mark.clear().circle(left + 15, markY, 4).fill(color)
    if (data.status === 'completed') this.mark.moveTo(left + 12.5, markY).lineTo(left + 14.5, markY + 2).lineTo(left + 17.8, markY - 2.5).stroke({ color: 0xffffff, width: 1.2 })
    this.titleText.style.fontSize = idle ? 13 : 16
    this.titleText.position.set(left + 27, top + (idle || compact ? 5 : 8))
    this.statusText.visible = data.status === 'completed' && Boolean(data.detail?.trim()) && !compact
    this.statusText.anchor.set(1, 0); this.statusText.position.set(right - 12, top + 11)
    this.fit(this.titleText, idle ? '待命' : data.title, width - 37 - (this.statusText.visible ? 42 : 0))
    this.detailText.visible = !idle && !compact
    if (!idle && !compact) {
      const detail = (data.detail?.trim() || STATUS[data.status]).replace(/\s+/g, ' ').trim()
      this.detailText.style.wordWrap = expanded; this.detailText.style.wordWrapWidth = width - 24; this.detailText.style.breakWords = true
      this.fit(this.detailText, detail, width - 24, expanded ? 32 : 16)
      this.detailText.position.set(left + 12, top + 33)
    }
    this.barLayout = compact ? undefined : { left: left + 12, right: right - 12, width: width - 24 - 36,
      color: data.progressMode === 'activity' ? COLORS.running : color, y: top + height - 10 }
    this.paintProgress()
  }

  private paintProgress() {
    this.track.clear()
    const progress = this.displayedProgress, bar = this.barLayout
    this.percentText.visible = progress !== undefined && Boolean(bar)
    if (progress === undefined || !bar) return
    this.track.roundRect(bar.left, bar.y, bar.width, 5, 2.5).fill(0xe5ebe7)
    if (progress > 0) this.track.roundRect(bar.left, bar.y, bar.width * progress / 100, 5, 2.5).fill(bar.color)
    this.percentText.text = `${this.data?.progressMode === 'activity' ? Math.floor(progress) : Math.round(progress)}%`
    this.percentText.anchor.set(1, .5); this.percentText.position.set(bar.right, bar.y + 2.5)
  }
}
