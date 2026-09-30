import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createCharacterMouthLayer } from './mouth-layer-tools.mjs'

// Face crops are 80x65 source pixels in the reviewed ImageGen edit, ordered by cell.
export const mouthRegistration = [
  { file: 'idle/front/001.png', crop: [78, 138], patch: [117, 177, 23, 11], mouth: { x: 128, y: 182, view: 'front' } },
  { file: 'idle/right/001.png', crop: [116, 137], patch: [164, 178, 12, 9], mouth: { x: 170, y: 182, view: 'right' } },
  { file: 'walk/front/001.png', crop: [78, 138], patch: [116, 175, 25, 17], mouth: { x: 128, y: 182, view: 'front' } },
  { file: 'walk/front/003.png', crop: [78, 137], patch: [117, 177, 24, 11], mouth: { x: 128, y: 182, view: 'front' } },
  { file: 'walk/right/001.png', crop: [116, 138], patch: [164, 179, 12, 9], mouth: { x: 170, y: 183, view: 'right' } },
  { file: 'walk/right/003.png', crop: [116, 138], patch: [164, 179, 12, 9], mouth: { x: 170, y: 183, view: 'right' } },
  { file: 'talk/seated-right/001.png', crop: [125, 198], patch: [172, 237, 12, 10], mouth: { x: 177, y: 241, view: 'right', scale: .85, rotation: 0 } },
]

export async function createMarvisMouthLayer() {
  return createCharacterMouthLayer({
    id: 'marvis', art: fileURLToPath(new URL('../../art/characters/marvis-mouth-layer/', import.meta.url)), mouthRegistration,
    reuse: Object.fromEntries(['front', 'right'].flatMap(view => ['002', '004'].map(number => [`walk/${view}/${number}.png`, `idle/${view}/001.png`]))),
  })
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await createMarvisMouthLayer()
  console.log('Created independent body and mouth layers for Wang Ming')
}
