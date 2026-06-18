import sanitizeHtmlLibrary from 'sanitize-html'

const options: sanitizeHtmlLibrary.IOptions = {
  allowedTags: [
    'a',
    'b',
    'br',
    'div',
    'em',
    'font',
    'i',
    'li',
    'ol',
    'p',
    'span',
    'strong',
    'u',
    'ul',
  ],
  allowedAttributes: {
    a: ['href', 'target', 'rel'],
    font: ['color', 'size'],
    span: ['style'],
    p: ['style'],
    div: ['style'],
  },
  allowedSchemes: ['http', 'https', 'mailto'],
  allowedSchemesByTag: {
    a: ['http', 'https', 'mailto'],
  },
  allowedStyles: {
    '*': {
      color: [
        /^#[0-9a-f]{3,8}$/i,
        /^rgb\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*\)$/i,
        /^rgba\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*(0|1|0?\.\d+)\s*\)$/i,
      ],
      'font-size': [
        /^\d+(\.\d+)?(px|em|rem|%)$/i,
        /^(small|medium|large|x-large|xx-large|smaller|larger)$/i,
      ],
      'text-align': [/^(left|right|center)$/i],
    },
  },
  transformTags: {
    a: sanitizeHtmlLibrary.simpleTransform('a', { rel: 'noopener noreferrer' }),
  },
}

export function sanitizeHtml(value: string | null | undefined) {
  if (!value) return ''
  return sanitizeHtmlLibrary(String(value), options)
}

export function plainTextFromHtml(value: string | null | undefined) {
  return sanitizeHtml(value)
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}
