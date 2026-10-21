import { memo } from 'react'
import Markdown, { type Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'

const remarkPlugins = [remarkGfm]
const components: Components = {
  a: ({ children, href, title }) => <a href={href} title={title} target="_blank" rel="noopener noreferrer">{children}</a>,
  table: ({ children }) => <div className="office-chat-table" role="region" aria-label="表格" tabIndex={0}><table>{children}</table></div>,
  img: ({ src, alt, title }) => src ? <img src={src} alt={alt ?? ''} title={title} loading="lazy" /> : <span>{alt}</span>,
}

export const ChatMarkdown = memo(function ChatMarkdown({ content, pending = false }: { content: string; pending?: boolean }) {
  return <div className="office-chat-markdown">
    <Markdown remarkPlugins={remarkPlugins} components={components} skipHtml>{content}</Markdown>
    {pending && <span className="office-chat-caret" aria-hidden="true" />}
  </div>
})
