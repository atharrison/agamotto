import ReactMarkdown, { type Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeHighlight from 'rehype-highlight'
// Dark highlight.js theme; matches the app's gray-950 surfaces.
import 'highlight.js/styles/github-dark.css'

/**
 * ATH-63: renders agent-written text (finding bodies, ATH-29 section text) as
 * markdown — paragraphs, lists, inline code, and fenced code with syntax
 * highlighting.
 *
 * Safety: react-markdown builds React elements and does not parse raw HTML
 * (no rehype-raw), so model output can't inject markup. Unsafe link protocols
 * such as `javascript:` are stripped by its default urlTransform.
 *
 * Soft newlines inside a paragraph or list item are kept visible with
 * `whitespace-pre-line`, which matches how the same text reads on GitHub.
 *
 * Not unit-tested under Jest: react-markdown is ESM-only. Keep this component
 * presentational; any logic belongs in src/lib.
 */

/** react-markdown passes the hast `node` to every override; keep it off the DOM. */
function omitNode<P extends { node?: unknown }>(props: P): Omit<P, 'node'> {
  const { node, ...rest } = props
  void node
  return rest
}

const COMPONENTS: Components = {
  p: props => (
    <p
      {...omitNode(props)}
      className="whitespace-pre-line [&:not(:first-child)]:mt-2"
    />
  ),
  ul: props => (
    <ul {...omitNode(props)} className="mt-2 list-disc space-y-1 pl-5" />
  ),
  ol: props => (
    <ol {...omitNode(props)} className="mt-2 list-decimal space-y-1 pl-5" />
  ),
  li: props => <li {...omitNode(props)} className="whitespace-pre-line" />,
  a: props => (
    <a
      {...omitNode(props)}
      target="_blank"
      rel="noopener noreferrer"
      className="text-indigo-400 underline hover:text-indigo-300"
    />
  ),
  strong: props => (
    <strong {...omitNode(props)} className="font-semibold text-gray-200" />
  ),
  blockquote: props => (
    <blockquote
      {...omitNode(props)}
      className="mt-2 border-l-2 border-gray-700 pl-3 text-gray-500"
    />
  ),
  pre: props => (
    <pre
      {...omitNode(props)}
      // Code inside a fence drops the inline-code chip look; the highlight.js
      // theme adds its own padding/background, which <pre> already provides.
      className="mt-2 overflow-x-auto rounded-md border border-gray-800 bg-gray-950 p-3 text-xs leading-relaxed [&_code]:bg-transparent [&_code]:p-0 [&_code]:text-[1em] [&_code.hljs]:bg-transparent [&_code.hljs]:p-0"
    />
  ),
  // Inline-code chip styling; <pre> above overrides it for fenced blocks.
  code: ({ className, ...props }) => (
    <code
      {...omitNode(props)}
      className={`rounded bg-gray-800 px-1 py-0.5 font-mono text-[0.85em] text-gray-200 ${className ?? ''}`}
    />
  ),
}

export function Markdown({
  children,
  className = '',
}: {
  children: string
  className?: string
}) {
  return (
    <div className={className}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[
          // detect:false → only fences with a language get colors; unlabeled
          // blocks stay plain instead of being mis-guessed.
          [rehypeHighlight, { detect: false, ignoreMissing: true }],
        ]}
        components={COMPONENTS}
      >
        {children}
      </ReactMarkdown>
    </div>
  )
}
