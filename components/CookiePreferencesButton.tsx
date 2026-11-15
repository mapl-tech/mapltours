'use client'

import { useI18n } from '@/lib/i18n'
import { requestConsentPrompt } from '@/lib/consent'

/**
 * Opens the cookie question again (components/ConsentPrompt), for anyone: the
 * way to change an answer, or to give one without being asked. It sits in the
 * Privacy Policy's Cookies section, beside the sentence that promises it; the
 * footer has the same control as a link (components/Footer), but the pages
 * without that footer (the transfers page, the reel) do not, so this one is
 * the place the policy points to.
 */
export default function CookiePreferencesButton() {
  const { t } = useI18n()
  return (
    <button type="button" className="cookie-prefs-btn" onClick={(e) => requestConsentPrompt(e.currentTarget)}>
      {t('Cookie Preferences')}
    </button>
  )
}
