import path from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const root = fileURLToPath(new URL('../../', import.meta.url))
const ids = ['marvis', 'code-agent', 'file-agent', 'app-agent', 'review-agent', 'data-agent']
await sharp({ create: { width: 768, height: 768, channels: 4, background: '#00000000' } })
  .composite(ids.map((id, index) => ({
    input: path.join(root, 'art/characters/packs', id, 'standard-v2/sit/back/001.png'),
    left: index % 3 * 256,
    top: Math.floor(index / 3) * 384,
  })))
  .png().toFile(path.join(root, 'art/characters/office-typing-v1/references.png'))
