/**
 * Where a guest can reach a person before they pay, and afterwards.
 *
 * Email always renders. WhatsApp renders only once NEXT_PUBLIC_WHATSAPP_NUMBER
 * is set (digits with country code, e.g. 18765551234); an unset number hides
 * the button rather than pointing at a chat nobody answers.
 */
export const SUPPORT_EMAIL = 'contact@mapltours.com'
export const REPLY_PROMISE = 'A person replies within 24 hours.'

export const WHATSAPP_NUMBER = (process.env.NEXT_PUBLIC_WHATSAPP_NUMBER ?? '').replace(/\D/g, '') || null

export function whatsappLink(text?: string): string | null {
  if (!WHATSAPP_NUMBER) return null
  return `https://wa.me/${WHATSAPP_NUMBER}${text ? `?text=${encodeURIComponent(text)}` : ''}`
}

export function mailtoLink(subject?: string, body?: string): string {
  const q = [subject && `subject=${encodeURIComponent(subject)}`, body && `body=${encodeURIComponent(body)}`].filter(Boolean).join('&')
  return `mailto:${SUPPORT_EMAIL}${q ? `?${q}` : ''}`
}
