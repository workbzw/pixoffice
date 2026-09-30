import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createCharacterMouthLayer } from './mouth-layer-tools.mjs'

const files = ['idle/front/001.png', 'idle/right/001.png', 'walk/front/001.png', 'walk/front/002.png', 'walk/front/003.png', 'walk/right/001.png', 'walk/right/002.png', 'walk/right/003.png', 'talk/seated-right/001.png']

// Each entry follows the reviewed 4-column face sheet: patch rectangle, then mouth anchor.
const placements = {
  'code-agent': {
    crops: [[71, 146], [125, 141], [122, 201]],
    frames: [
      [[109, 185, 23, 11], [120, 190]], [[178, 179, 12, 10], [184, 184]],
      [[107, 181, 26, 20], [120, 190]], [[109, 186, 24, 11], [121, 191]], [[108, 184, 25, 12], [120, 189]],
      [[176, 180, 14, 15], [184, 185]], [[178, 179, 12, 11], [184, 184]], [[177, 180, 13, 12], [183, 185]],
      [[176, 240, 11, 10], [181, 244]],
    ],
  },
  'file-agent': {
    crops: [[80, 137], [109, 139], [116, 204]],
    frames: [
      [[117, 175, 24, 11], [129, 180]], [[162, 177, 12, 11], [168, 182]],
      [[115, 173, 27, 20], [129, 181]], [[117, 176, 24, 11], [129, 181]], [[118, 176, 24, 11], [130, 181]],
      [[162, 178, 13, 16], [169, 184]], [[162, 177, 12, 11], [168, 182]], [[162, 180, 12, 13], [168, 185]],
      [[168, 241, 12, 11], [174, 246]],
    ],
  },
  'app-agent': {
    crops: [[77, 135], [119, 138], [128, 197]],
    frames: [
      [[115, 173, 24, 12], [127, 179]], [[172, 176, 12, 10], [178, 181]],
      [[111, 169, 29, 21], [126, 178]], [[115, 173, 24, 12], [127, 179]], [[114, 172, 24, 12], [126, 178]],
      [[173, 176, 12, 10], [179, 181]], [[172, 176, 12, 11], [178, 181]], [[171, 176, 12, 11], [177, 181]],
      [[181, 235, 12, 11], [187, 240]],
    ],
  },
  'review-agent': {
    crops: [[80, 140], [111, 140], [119, 201]],
    frames: [
      [[116, 178, 25, 12], [128, 184]], [[163, 177, 12, 11], [169, 182]],
      [[115, 174, 27, 20], [129, 183]], [[116, 180, 25, 12], [128, 186]], [[117, 178, 25, 12], [129, 184]],
      [[161, 177, 12, 12], [167, 183]], [[163, 177, 12, 11], [169, 182]], [[162, 177, 12, 12], [168, 183]],
      [[171, 239, 11, 11], [176, 244]],
    ],
  },
  'data-agent': {
    crops: [[81, 135], [120, 133], [126, 196]],
    frames: [
      [[118, 172, 24, 11], [130, 177]], [[172, 171, 12, 10], [178, 176]],
      [[118, 170, 26, 19], [131, 177]], [[118, 172, 24, 11], [130, 177]], [[117, 172, 24, 11], [129, 177]],
      [[173, 173, 12, 10], [179, 178]], [[172, 171, 12, 10], [178, 176]], [[172, 172, 12, 10], [178, 177]],
      [[178, 234, 12, 11], [184, 239]],
    ],
  },
}

export const officeMouthRegistrations = Object.fromEntries(Object.entries(placements).map(([id, { crops, frames }]) => [id, files.map((file, index) => {
  const seated = file.startsWith('talk/'), front = file.includes('/front/')
  const [patch, [x, y]] = frames[index]
  return { file, crop: crops[seated ? 2 : front ? 0 : 1], patch, mouth: { x, y, view: front ? 'front' : 'right', ...(seated ? { scale: .85 } : {}) } }
})]))

export async function createOfficeMouthLayers() {
  for (const [id, mouthRegistration] of Object.entries(officeMouthRegistrations)) {
    await createCharacterMouthLayer({
      id, mouthRegistration, art: fileURLToPath(new URL(`../../art/characters/mouth-layers/${id}/`, import.meta.url)),
      reuse: Object.fromEntries(['front', 'right'].map(view => [`walk/${view}/004.png`, `walk/${view}/002.png`])),
    })
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await createOfficeMouthLayers()
  console.log('Created independent body and mouth layers for five office characters')
}
