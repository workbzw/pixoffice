import { copyFile, mkdir } from 'node:fs/promises'
import sharp from 'sharp'

const directory = new URL('./public/', import.meta.url)
await mkdir(directory, { recursive: true })
await copyFile(new URL('../../LICENSE', import.meta.url), new URL('LICENSE.txt', directory))
await copyFile(new URL('../../public/THIRD_PARTY_NOTICES.txt', import.meta.url), new URL('THIRD_PARTY_NOTICES.txt', directory))
await mkdir(new URL('studio/', directory), { recursive: true })
for (const name of ['room', 'stations', 'board', 'robot', 'portraits']) {
  const input = new URL(`./art/studio-v1/${name === 'board' ? 'board-v2' : name}.png`, import.meta.url)
  const output = new URL(`studio/${name}.webp`, directory)
  await sharp(input.pathname).webp(name === 'room' ? { quality: 88 } : { lossless: true }).toFile(output.pathname)
}
