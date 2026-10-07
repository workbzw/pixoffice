import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildCharacter as buildFrame, buildCharacters as buildFrames } from '../assets/build-character.mjs'
import { officeFrameBuildProfile } from '../../assets/office/build-profile.mjs'
export { alphaBounds } from '../assets/build-character.mjs'
const root = fileURLToPath(new URL('../../', import.meta.url))
export const buildCharacter = (directory, options = {}) => buildFrame(directory, { ...options, profile: officeFrameBuildProfile })
export const buildCharacters = (options = {}) => buildFrames({
  sourceRoot: path.join(root, 'art/characters/packs'), outputRoot: path.join(root, 'public/characters'),
  requireAdmission: true, ...options, profile: officeFrameBuildProfile,
})
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2), options = {}
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--check') options.check = true
    else if (args[i] === '--ids' && args[i + 1]) options.ids = args[++i].split(',')
    else if (args[i] === '--out' && args[i + 1]) options.outputRoot = path.resolve(args[++i])
    else throw new Error(`Unknown or incomplete option: ${args[i]}`)
  }
  if (options.ids && (!options.outputRoot || options.outputRoot === path.join(root, 'public/characters'))) throw new Error('--ids requires a separate --out directory')
  const result = await buildCharacters(options)
  console.log(`Character packs ${options.check ? 'verified' : 'built'}: ${result.characters.length}`)
}
