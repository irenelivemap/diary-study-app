const UNSAFE_TAGS = /<\/?(script|style|iframe|object|embed|svg|math|link|meta|base|form|input|button|textarea|select)[^>]*>/gi
const EVENT_ATTRS = /\s+on[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi
const JS_URLS = /\s+(href|src)\s*=\s*(["'])\s*javascript:[\s\S]*?\2/gi
const DANGEROUS_CSS = /\s+style\s*=\s*(["'])[\s\S]*?(expression\s*\(|javascript:|url\s*\()[\s\S]*?\1/gi

export function sanitizeHtml(value: string | null | undefined) {
  if (!value) return ''
  return String(value)
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(UNSAFE_TAGS, '')
    .replace(EVENT_ATTRS, '')
    .replace(JS_URLS, '')
    .replace(DANGEROUS_CSS, '')
}

export function plainTextFromHtml(value: string | null | undefined) {
  return sanitizeHtml(value)
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}
