import { CanvasSource, DOMAdapter, HTMLText, Sprite, Texture } from 'pixi.js'
import type { HTMLTextOptions, Renderer } from 'pixi.js'

/** Keep the displayed pixels independent of Pixi's reusable HTML image pool. */
export class WhiteboardContent extends Sprite {
  text: string
  private requested = ''
  private pending = false
  private retryAt = 0
  private ownedTexture?: Texture
  private options: HTMLTextOptions
  private completion: Promise<void> = Promise.resolve()

  constructor(options: HTMLTextOptions) {
    super(Texture.EMPTY)
    this.options = options
    this.text = String(options.text ?? '')
    this.onRender = renderer => {
      if (this.pending || !this.text || this.text === this.requested || performance.now() < this.retryAt) return
      this.requested = this.text
      this.pending = true
      this.completion = this.refreshContent(renderer, this.text)
    }
    this.on('destroyed', () => this.ownedTexture?.destroy(true))
  }

  whenReady() { return this.completion }

  private async refreshContent(renderer: Renderer, markup: string) {
    const text = new HTMLText({ ...this.options, text: markup })
    let generated: Promise<Texture> | undefined
    try {
      generated = renderer.htmlText.getTexturePromise({ text: text.text, style: text.style, resolution: text.resolution,
        textureStyle: text.textureStyle, autoGenerateMipmaps: text.autoGenerateMipmaps })
      const texture = await generated
      if (this.destroyed || this.text !== markup) return
      const { frame, source } = texture, resolution = source.resolution
      const resource = source.resource as CanvasImageSource & { complete?: boolean }
      if (!resource || resource.complete === false) throw new Error('Whiteboard image is not ready')
      const canvas = DOMAdapter.get().createCanvas(Math.ceil(frame.width * resolution), Math.ceil(frame.height * resolution))
      const context = canvas.getContext('2d')
      if (!context) throw new Error('Whiteboard canvas context is unavailable')
      // Copy synchronously before returning the pooled image, then swap complete frames only.
      context.drawImage(resource, frame.x * resolution, frame.y * resolution,
        frame.width * resolution, frame.height * resolution, 0, 0, canvas.width, canvas.height)
      const next = new Texture({ source: new CanvasSource({ resource: canvas, resolution }) })
      const previous = this.ownedTexture
      this.texture = next
      this.ownedTexture = next
      previous?.destroy(true)
    } catch (error) {
      if (!this.destroyed) {
        this.requested = ''
        this.retryAt = performance.now() + 1000
        console.warn('[WhiteboardContent] keeping the previous frame after a render failure', error)
      }
    } finally {
      if (generated) renderer.htmlText.returnTexturePromise(generated)
      text.destroy({ style: true })
      this.pending = false
    }
  }
}
