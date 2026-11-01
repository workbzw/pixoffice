import { Container, NineSliceSprite } from 'pixi.js'
import type { Texture } from 'pixi.js'
import type { SceneBackdrop } from '@pixoffice/renderer-pixi/ScenePresentationPack'

const CORE_WIDTH = 1100, CORE_HEIGHT = 950, COMPOSITION_WIDTH = 1600, WINDOW_WIDTH = 400

export function adaptiveOfficeViewport(width: number, height: number) {
  const scale = Math.min(width / COMPOSITION_WIDTH, height / CORE_HEIGHT)
  const inset = (width - CORE_WIDTH * scale) / 2
  return { left: inset, top: 0, right: width - inset, bottom: CORE_HEIGHT * scale }
}

export function createAdaptiveOfficeBackdrop(texture: Texture): SceneBackdrop {
  const root = new Container()
  // Keep side furniture outside the walkable area, without stretching chairs, artwork or windows.
  const room = new NineSliceSprite({ texture, leftWidth: 360, rightWidth: texture.height * WINDOW_WIDTH / CORE_HEIGHT,
    topHeight: 740, bottomHeight: 0 })
  root.eventMode = 'none'
  root.addChild(room)
  return { root, resize(width, height) {
    const viewport = adaptiveOfficeViewport(width, height)
    const scale = viewport.bottom / texture.height
    root.scale.set(scale)
    room.setSize(width / scale, height / scale)
  } }
}
