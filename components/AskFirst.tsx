'use client'

import { Mail, MessageCircle } from 'lucide-react'
import { SUPPORT_EMAIL, REPLY_PROMISE, whatsappLink, mailtoLink } from '@/lib/contact'
import { trackContactClick } from '@/lib/analytics'

/**
 * The "ask a person first" row for the moment a guest hesitates: under the
 * pay button, next to a quote. `context` becomes the opening line of the
 * message so the reply can be specific ("the Negril round trip on Oct 12").
 */
export default function AskFirst({ context, heading = 'Questions before you pay?', place }: { context: string; heading?: string; place: string }) {
  const wa = whatsappLink(`Hi MAPL Tours, ${context}`)
  const mail = mailtoLink(`Question about ${context}`, `Hi MAPL Tours,\n\nI am looking at ${context} and wanted to ask: `)
  return (
    <div className="ask-first">
      <p className="ask-first-h">{heading} <span>{REPLY_PROMISE}</span></p>
      <div className="ask-first-row">
        {wa && (
          <a className="ask-first-btn ask-first-wa" href={wa} target="_blank" rel="noopener noreferrer" onClick={() => trackContactClick('whatsapp', place)}>
            <MessageCircle size={16} strokeWidth={2.2} aria-hidden="true" /> WhatsApp us
          </a>
        )}
        <a className="ask-first-btn" href={mail} onClick={() => trackContactClick('email', place)}>
          <Mail size={16} strokeWidth={2.2} aria-hidden="true" /> {SUPPORT_EMAIL}
        </a>
      </div>
    </div>
  )
}
