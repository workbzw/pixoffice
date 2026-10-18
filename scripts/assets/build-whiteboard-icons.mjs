import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { Lightbulb, FileText, ArrowUpRight } from 'lucide-react'
import { readFile, writeFile } from 'node:fs/promises'

const icons = Object.fromEntries(Object.entries({ lightbulb: Lightbulb, file: FileText, arrow: ArrowUpRight })
  .map(([name, component]) => [name, renderToStaticMarkup(createElement(component, { size: 24, strokeWidth: 1.8, 'aria-hidden': true }))]))
const license = await readFile(new URL('../../node_modules/lucide-react/LICENSE', import.meta.url), 'utf8')
const notice = `/*!\n${license.trim()}\n*/\n// Generated from lucide-react. Regenerate: node scripts/assets/build-whiteboard-icons.mjs\n`
await writeFile(new URL('../../packages/scene-office/src/whiteboardIcons.ts', import.meta.url), `${notice}export const whiteboardIcons = ${JSON.stringify(icons, null, 2)} as const\n`)
