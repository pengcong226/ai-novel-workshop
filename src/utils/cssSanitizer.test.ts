import { describe, expect, it } from 'vitest'
import { sanitizeThemeCss } from '@/utils/cssSanitizer'

// ---------------------------------------------------------------------------
// sanitizeThemeCss
// ---------------------------------------------------------------------------
describe('sanitizeThemeCss', () => {
  it('returns empty string for empty input', () => {
    expect(sanitizeThemeCss('')).toBe('')
  })

  it('returns empty string for falsy input', () => {
    expect(sanitizeThemeCss('' as unknown as string)).toBe('')
  })

  it('passes safe CSS through unchanged', () => {
    const safe = 'body { color: red; font-size: 14px; }'
    expect(sanitizeThemeCss(safe)).toBe(safe)
  })

  it('removes @import rules', () => {
    const css = '@import url("https://evil.com/style.css"); body { color: red; }'
    const result = sanitizeThemeCss(css)
    expect(result).not.toContain('evil.com')
    expect(result).toContain('[removed: @import]')
    expect(result).toContain('body { color: red; }')
  })

  it('removes @import with bare string syntax', () => {
    const css = '@import "malicious.css";'
    const result = sanitizeThemeCss(css)
    expect(result).not.toContain('malicious.css')
    expect(result).toContain('[removed: @import]')
  })

  it('neutralises url() with javascript: URI', () => {
    const css = "background: url('javascript:alert(1)');"
    const result = sanitizeThemeCss(css)
    expect(result).not.toContain('javascript:')
    expect(result).toContain('about:blank')
  })

  it('neutralises url() with data: URI', () => {
    const css = 'background: url(data:text/html,<script>alert(1)</script>);'
    const result = sanitizeThemeCss(css)
    expect(result).not.toContain('data:')
    expect(result).toContain('about:blank')
  })

  it('removes CSS expression() (IE legacy vector)', () => {
    const css = 'width: expression(alert(1));'
    const result = sanitizeThemeCss(css)
    expect(result).not.toContain('expression(')
    expect(result).toContain('[removed: expression]')
  })

  it('removes -moz-binding (Firefox XBL injection)', () => {
    const css = '-moz-binding: url("https://evil.com/binding.xml#xss"); color: blue;'
    const result = sanitizeThemeCss(css)
    expect(result).not.toContain('evil.com')
    expect(result).toContain('[removed: -moz-binding]')
  })

  it('removes behavior property (IE HTC injection)', () => {
    const css = 'behavior: url("evil.htc"); color: green;'
    const result = sanitizeThemeCss(css)
    expect(result).not.toContain('behavior:')
    expect(result).toContain('[removed: behavior]')
  })

  it('handles case-insensitive attack variants', () => {
    const css = '@IMPORT url("evil.css");'
    const result = sanitizeThemeCss(css)
    expect(result).not.toContain('evil.css')
  })

  it('handles multiple dangerous constructs in the same input', () => {
    const css = [
      '@import url("evil.css");',
      "background: url('javascript:void(0)');",
      '-moz-binding: url("xss.xml#x");',
      'color: red;',
    ].join('\n')
    const result = sanitizeThemeCss(css)
    expect(result).toContain('[removed: @import]')
    expect(result).not.toContain('javascript:')
    expect(result).toContain('[removed: -moz-binding]')
    expect(result).toContain('color: red;')
  })
})
