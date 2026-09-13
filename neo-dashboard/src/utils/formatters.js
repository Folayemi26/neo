import { formatDistanceToNowStrict, parseISO } from 'date-fns'

export function formatCurrency(value, locale = navigator.language || 'en-US', currency = 'USD') {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    minimumFractionDigits: value < 1 ? 2 : 0,
    maximumFractionDigits: 0,
  }).format(value)
}

export function formatRelativeTime(input) {
  const date =
    typeof input === 'number'
      ? new Date(input)
      : typeof input === 'string'
        ? parseISO(input)
        : input?.toDate
          ? input.toDate()
          : null

  if (!date || Number.isNaN(date.getTime())) {
    return 'Just now'
  }

  return `${formatDistanceToNowStrict(date, { addSuffix: true })}`
}

export function extractTitleFromCaption(caption) {
  if (!caption) return ''
  const match = caption.match(/(.+?[\.\!\?])(\s|$)/)
  if (match) return match[1].trim()
  return caption.length > 60 ? `${caption.slice(0, 57)}…` : caption
}


// Turns a BCP-47 code into a readable language name ("es" -> "Spanish").
// Intl.DisplayNames covers every language the browser knows, so there is no
// lookup table to keep current. Falls back to the raw code where the API is
// unavailable or the tag is unrecognized.
export function formatLanguageName(code) {
  if (!code) return null
  try {
    const names = new Intl.DisplayNames([navigator.language || 'en'], { type: 'language' })
    return names.of(code) || code
  } catch (_) {
    return code
  }
}

// True when the victim wrote in a language the responder is not reading in,
// and we have a translated summary to show them.
export function isTranslated(ai, responderLanguage = 'en') {
  if (!ai || !ai.detectedLanguage) return false
  const victim = String(ai.detectedLanguage).toLowerCase().split('-')[0]
  return victim !== responderLanguage && Boolean(ai.responderSummary)
}
