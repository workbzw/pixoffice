import { readFile, mkdtemp, mkdir, copyFile, writeFile, rm } from 'node:fs/promises'
import path from 'node:path'
import { tmpdir } from 'node:os'
import { Texture, TextureSource, Rectangle } from 'pixi.js'
import { buildCharacter } from '../../scripts/characters/build.mjs'

export async function characterPackFixture(id = 'marvis') {
  const registry = JSON.parse(await readFile(new URL('../../public/characters/registry.json', import.meta.url), 'utf8'))
  const entry = registry.characters.find(entry => entry.id === id)
  const manifest = JSON.parse(await readFile(new URL(`../../public/characters/${entry.manifest}`, import.meta.url), 'utf8'))
  return fixtureFromManifest(manifest)
}

// Rebuild a real pre-layer pack from retained originals, without relying on stale build output.
export async function legacyCharacterPackFixture() {
  const root = new URL('../../art/characters/packs/code-agent/', import.meta.url)
  const directory = await mkdtemp(path.join(tmpdir(), 'office-legacy-mouth-'))
  try {
    const source = JSON.parse(await readFile(new URL('character.json', root), 'utf8'))
    delete source.mouth
    for (const [name, clip] of Object.entries(source.clips)) {
      if (name.startsWith('mouth.')) { delete source.clips[name]; continue }
      if ('frames' in clip) clip.frames = clip.frames.map(({ file, durationMs }) => ({ file: file.replace(/^body\//, ''), durationMs }))
    }
    for (const view of ['front', 'right', 'seated-right']) {
      const closed = view === 'seated-right' ? 'talk/seated-right/001.png' : `idle/${view}/001.png`
      const open = stage => `speak/${view}/00${stage}.png`
      source.clips[`speak.${view}`] = { loop: true, frames: [[open(1), 110], [open(2), 100], [closed, 100], [open(3), 120], [open(2), 90], [closed, 210]].map(([file, durationMs]) => ({ file, durationMs })) }
    }
    source.clips['speak.left'] = { alias: 'speak.right', mirrorX: true }
    source.clips['speak.seated-left'] = { alias: 'speak.seated-right', mirrorX: true }
    const files = new Set(Object.values(source.clips).flatMap(clip => 'frames' in clip ? clip.frames.map(frame => frame.file) : []))
    for (const file of files) {
      await mkdir(path.dirname(path.join(directory, file)), { recursive: true })
      await copyFile(new URL(file, root), path.join(directory, file))
    }
    await writeFile(path.join(directory, 'character.json'), JSON.stringify(source))
    return fixtureFromManifest((await buildCharacter(directory)).manifest)
  } finally { await rm(directory, { recursive: true, force: true }) }
}

function fixtureFromManifest(manifest) {
  const pages = manifest.pages.map(page => new TextureSource({ width: page.width, height: page.height }))
  const textures = new Map(Object.entries(manifest.frames).map(([key, frame]) => [key, new Texture({
    source: pages[frame.page], frame: new Rectangle(frame.rect.x, frame.rect.y, frame.rect.width, frame.rect.height),
    orig: new Rectangle(0, 0, manifest.canvas.width, manifest.canvas.height),
    trim: new Rectangle(frame.offset.x, frame.offset.y, frame.rect.width, frame.rect.height),
  })]))
  return { manifest, pageUrls: [], textures, dispose() { textures.forEach(texture => texture.destroy()); pages.forEach(page => page.destroy()) } }
}
