/** Owns the renderer's DOM root independently of the surrounding React layout. */
export class SceneHost {
  private root?: HTMLDivElement
  private attachment = 0

  get element(): HTMLDivElement {
    if (!this.root) {
      this.root = document.createElement('div')
      this.root.dataset.pixofficeSceneRoot = ''
      Object.assign(this.root.style, { width: '100%', height: '100%', position: 'relative' })
    }
    return this.root
  }

  attach(parent: HTMLElement): () => void {
    const generation = ++this.attachment
    parent.appendChild(this.element)
    return () => {
      if (generation === this.attachment && this.root?.parentElement === parent) this.root.remove()
    }
  }
}
