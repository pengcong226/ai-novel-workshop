/**
 * CSS sanitizer for user-provided theme styles.
 *
 * Strips dangerous CSS constructs that could enable data exfiltration
 * or code execution when injected via innerHTML into a <style> tag.
 *
 * NOTE: A full CSS parser is not practical for the browser runtime.
 * This sanitizer uses targeted regex to neutralise the most common
 * attack vectors while preserving legitimate styling directives.
 */

/**
 * Sanitize a CSS string before injecting it into the DOM via a
 * `<style>` element.  Removes constructs that can exfiltrate data
 * or execute code.
 */
export function sanitizeThemeCss(css: string): string {
  if (!css) return ''

  let sanitized = css

  // Remove @import rules (can load external CSS with data-uris)
  sanitized = sanitized.replace(/@import\s+[^;]+;?/gi, '/* [removed: @import] */')

  // Remove url() references that use javascript: or data: URIs
  sanitized = sanitized.replace(/url\s*\(\s*(['"]?)\s*javascript\s*:/gi, 'url($1about:blank')
  sanitized = sanitized.replace(/url\s*\(\s*(['"]?)\s*data\s*:/gi, 'url($1about:blank')

  // Remove CSS expressions (IE legacy, but still a vector)
  sanitized = sanitized.replace(/expression\s*\([^)]*\)/gi, '/* [removed: expression] */')

  // Remove -moz-binding (Firefox XBL injection)
  sanitized = sanitized.replace(/-moz-binding\s*:[^;]+;?/gi, '/* [removed: -moz-binding] */')

  // Remove behavior property (IE HTC injection)
  sanitized = sanitized.replace(/behavior\s*:[^;]+;?/gi, '/* [removed: behavior] */')

  return sanitized
}
