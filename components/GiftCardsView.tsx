'use client'

import { useState } from 'react'
import Image from 'next/image'
import { DESTINATION_IMAGES } from '@/lib/experiences'

const presetAmounts = [
  { amount: 50, label: '$50', tagline: 'A taste of Jamaica', desc: 'Street food crawl or sunrise fishing' },
  { amount: 100, label: '$100', tagline: 'The essentials', desc: 'Most individual experiences' },
  { amount: 150, label: '$150', tagline: 'Go deeper', desc: 'Full-day cultural immersion' },
  { amount: 250, label: '$250', tagline: 'For two', desc: 'Multi-experience couples package' },
  { amount: 500, label: '$500', tagline: 'The collection', desc: 'The ultimate Jamaica experience' },
]

export default function GiftCardsView() {
  const [selectedAmount, setSelectedAmount] = useState(100)
  const [customAmount, setCustomAmount] = useState('')
  const [isCustom, setIsCustom] = useState(false)
  const [recipientName, setRecipientName] = useState('')
  const [recipientEmail, setRecipientEmail] = useState('')
  const [senderName, setSenderName] = useState('')
  const [message, setMessage] = useState('')
  const [submitted, setSubmitted] = useState(false)

  const finalAmount = isCustom ? (parseInt(customAmount) || 0) : selectedAmount

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', paddingTop: 56 }}>

      {/* ── Hero ── */}
      <div style={{
        position: 'relative', height: 420, overflow: 'hidden',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <Image
          src={DESTINATION_IMAGES['Negril']}
          alt="Gift Cards"
          fill sizes="100vw"
          style={{ objectFit: 'cover', objectPosition: 'center 40%' }}
          priority
        />
        <div style={{
          position: 'absolute', inset: 0,
          background: 'linear-gradient(180deg, rgba(0,0,0,0.35) 0%, rgba(0,0,0,0.6) 60%, rgba(0,0,0,0.8) 100%)',
        }} />

        <div style={{
          position: 'relative', zIndex: 1, textAlign: 'center',
          maxWidth: 640, padding: '0 24px',
        }}>
          <p style={{
            fontSize: 11, fontWeight: 700, textTransform: 'uppercase',
            letterSpacing: '0.16em', color: 'var(--gold-warm)',
            fontFamily: 'var(--font-dm-sans)', marginBottom: 16,
          }}>
            Give Jamaica
          </p>
          <h1 style={{
            fontFamily: 'var(--font-syne)', fontWeight: 800,
            fontSize: 'clamp(2.25rem, 5vw, 3.5rem)', color: 'white',
            lineHeight: 1.05, letterSpacing: '-0.035em',
            marginBottom: 16,
          }}>
            The gift of<br />unforgettable experiences
          </h1>
          <p style={{
            fontSize: 16, color: 'rgba(255,255,255,0.7)',
            fontFamily: 'var(--font-dm-sans)', lineHeight: 1.6,
            maxWidth: 460, margin: '0 auto',
          }}>
            No expiration. No restrictions. Just the freedom to discover Jamaica on their own terms.
          </p>
        </div>
      </div>

      {/* ── Main content ── */}
      <div style={{ maxWidth: 1000, margin: '0 auto', padding: '0 24px', paddingBottom: 80 }}>

        {/* ── Gift Card Preview + Amount Selection ── */}
        <div style={{
          display: 'flex', gap: 48, alignItems: 'flex-start',
          marginTop: -60, position: 'relative', zIndex: 2,
        }}>

          {/* Left: Card preview */}
          <div style={{ flex: 1 }}>
            <div style={{
              aspectRatio: '1.6',
              borderRadius: 'var(--r-xl)',
              overflow: 'hidden',
              position: 'relative',
              boxShadow: '0 20px 60px rgba(0,0,0,0.15), 0 4px 16px rgba(0,0,0,0.08)',
            }}>
              <Image
                src={DESTINATION_IMAGES['Ocho Rios']}
                alt="Gift card"
                fill sizes="50vw"
                style={{ objectFit: 'cover' }}
              />
              <div style={{
                position: 'absolute', inset: 0,
                background: 'linear-gradient(160deg, rgba(0,0,0,0.2) 0%, rgba(0,0,0,0.55) 100%)',
              }} />

              {/* Card content */}
              <div style={{
                position: 'absolute', inset: 0,
                padding: '32px 36px',
                display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <p style={{
                      fontFamily: 'var(--font-syne)', fontWeight: 800,
                      fontSize: 18, color: 'white', letterSpacing: '0.04em',
                    }}>
                      MAPL
                    </p>
                    <p style={{
                      fontSize: 9, fontWeight: 700, color: 'rgba(255,255,255,0.5)',
                      fontFamily: 'var(--font-dm-sans)', letterSpacing: '0.12em',
                      textTransform: 'uppercase',
                    }}>
                      Tours Jamaica
                    </p>
                  </div>
                  <p style={{
                    fontSize: 10, fontWeight: 600, color: 'rgba(255,255,255,0.45)',
                    fontFamily: 'var(--font-dm-sans)', letterSpacing: '0.08em',
                    textTransform: 'uppercase',
                  }}>
                    Gift Card
                  </p>
                </div>

                <div>
                  {recipientName && (
                    <p style={{
                      fontSize: 13, color: 'rgba(255,255,255,0.6)',
                      fontFamily: 'var(--font-dm-sans)', marginBottom: 6,
                    }}>
                      For {recipientName}
                    </p>
                  )}
                  <p style={{
                    fontFamily: 'var(--font-syne)', fontWeight: 800,
                    fontSize: finalAmount > 0 ? 48 : 36, color: 'white',
                    letterSpacing: '-0.03em', lineHeight: 1,
                  }}>
                    {finalAmount > 0 ? `$${finalAmount}` : '$—'}
                  </p>
                  {senderName && (
                    <p style={{
                      fontSize: 12, color: 'rgba(255,255,255,0.45)',
                      fontFamily: 'var(--font-dm-sans)', marginTop: 8,
                    }}>
                      From {senderName}
                    </p>
                  )}
                </div>
              </div>
            </div>

            {/* Message preview */}
            {message && (
              <div style={{
                marginTop: 16, padding: '16px 20px',
                borderRadius: 'var(--r-lg)',
                background: 'var(--bg-warm)',
                border: '1px solid var(--border)',
              }}>
                <p style={{
                  fontSize: 12, fontWeight: 600, color: 'var(--text-tertiary)',
                  fontFamily: 'var(--font-dm-sans)',
                  textTransform: 'uppercase', letterSpacing: '0.06em',
                  marginBottom: 8,
                }}>
                  Personal message
                </p>
                <p style={{
                  fontSize: 14, color: 'var(--text-secondary)',
                  fontFamily: 'var(--font-dm-sans)', lineHeight: 1.6,
                  fontStyle: 'italic',
                }}>
                  &ldquo;{message}&rdquo;
                </p>
              </div>
            )}
          </div>

          {/* Right: Amount + Form */}
          <div style={{ width: 380, flexShrink: 0 }}>

            {!submitted ? (
              <>
                {/* Amount selection */}
                <div style={{
                  padding: '32px',
                  background: 'var(--card-bg)',
                  borderRadius: 'var(--r-xl)',
                  border: '1px solid var(--border)',
                  boxShadow: 'var(--shadow-lg)',
                  marginBottom: 20,
                }}>
                  <h2 style={{
                    fontFamily: 'var(--font-syne)', fontWeight: 800,
                    fontSize: 20, color: 'var(--text-primary)',
                    letterSpacing: '-0.02em', marginBottom: 20,
                  }}>
                    Choose an amount
                  </h2>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12 }}>
                    {presetAmounts.map((p) => {
                      const active = !isCustom && selectedAmount === p.amount
                      return (
                        <button
                          key={p.amount}
                          onClick={() => { setSelectedAmount(p.amount); setIsCustom(false) }}
                          style={{
                            padding: '16px 12px', borderRadius: 'var(--r-md)',
                            border: active ? '2px solid var(--accent)' : '1px solid var(--border)',
                            background: active ? 'var(--surface)' : 'var(--card-bg)',
                            cursor: 'pointer', textAlign: 'left',
                            transition: 'all 0.15s ease',
                          }}
                        >
                          <p style={{
                            fontFamily: 'var(--font-syne)', fontWeight: 800,
                            fontSize: 22, color: 'var(--text-primary)',
                            marginBottom: 2,
                          }}>
                            {p.label}
                          </p>
                          <p style={{
                            fontSize: 11, color: 'var(--text-tertiary)',
                            fontFamily: 'var(--font-dm-sans)',
                          }}>
                            {p.tagline}
                          </p>
                        </button>
                      )
                    })}

                    {/* Custom amount */}
                    <button
                      onClick={() => setIsCustom(true)}
                      style={{
                        padding: '16px 12px', borderRadius: 'var(--r-md)',
                        border: isCustom ? '2px solid var(--accent)' : '1px solid var(--border)',
                        background: isCustom ? 'var(--surface)' : 'var(--card-bg)',
                        cursor: 'pointer', textAlign: 'left',
                        transition: 'all 0.15s ease',
                      }}
                    >
                      {isCustom ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                          <span style={{ fontFamily: 'var(--font-syne)', fontWeight: 800, fontSize: 22, color: 'var(--text-primary)' }}>$</span>
                          <input
                            type="number"
                            value={customAmount}
                            onChange={(e) => setCustomAmount(e.target.value)}
                            placeholder="0"
                            autoFocus
                            min={10}
                            style={{
                              width: '100%', border: 'none', background: 'transparent',
                              fontFamily: 'var(--font-syne)', fontWeight: 800, fontSize: 22,
                              color: 'var(--text-primary)', outline: 'none',
                            }}
                          />
                        </div>
                      ) : (
                        <p style={{
                          fontFamily: 'var(--font-syne)', fontWeight: 800,
                          fontSize: 22, color: 'var(--text-primary)', marginBottom: 2,
                        }}>
                          Custom
                        </p>
                      )}
                      <p style={{
                        fontSize: 11, color: 'var(--text-tertiary)',
                        fontFamily: 'var(--font-dm-sans)',
                      }}>
                        Any amount
                      </p>
                    </button>
                  </div>
                </div>

                {/* Personalize */}
                <div style={{
                  padding: '32px',
                  background: 'var(--card-bg)',
                  borderRadius: 'var(--r-xl)',
                  border: '1px solid var(--border)',
                  boxShadow: 'var(--shadow-sm)',
                }}>
                  <h3 style={{
                    fontFamily: 'var(--font-syne)', fontWeight: 700,
                    fontSize: 17, color: 'var(--text-primary)',
                    marginBottom: 20,
                  }}>
                    Personalize
                  </h3>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                    {[
                      { label: 'Recipient name', value: recipientName, onChange: setRecipientName, placeholder: 'Their name' },
                      { label: 'Recipient email', value: recipientEmail, onChange: setRecipientEmail, placeholder: 'their@email.com', type: 'email' },
                      { label: 'Your name', value: senderName, onChange: setSenderName, placeholder: 'Your name' },
                    ].map((f) => (
                      <div key={f.label}>
                        <label style={{
                          display: 'block', fontSize: 12, fontWeight: 600,
                          color: 'var(--text-tertiary)', fontFamily: 'var(--font-dm-sans)',
                          marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.04em',
                        }}>
                          {f.label}
                        </label>
                        <input
                          type={f.type || 'text'}
                          value={f.value}
                          onChange={(e) => f.onChange(e.target.value)}
                          placeholder={f.placeholder}
                          style={{
                            width: '100%', height: 44, borderRadius: 'var(--r-sm)',
                            border: '1px solid var(--border-strong)', padding: '0 14px',
                            fontSize: 14, fontFamily: 'var(--font-dm-sans)',
                            color: 'var(--text-primary)', background: 'var(--bg)',
                            outline: 'none', boxSizing: 'border-box',
                          }}
                        />
                      </div>
                    ))}

                    <div>
                      <label style={{
                        display: 'block', fontSize: 12, fontWeight: 600,
                        color: 'var(--text-tertiary)', fontFamily: 'var(--font-dm-sans)',
                        marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.04em',
                      }}>
                        Personal message
                      </label>
                      <textarea
                        value={message}
                        onChange={(e) => setMessage(e.target.value)}
                        placeholder="Wishing you an amazing time in Jamaica..."
                        rows={3}
                        style={{
                          width: '100%', borderRadius: 'var(--r-sm)',
                          border: '1px solid var(--border-strong)', padding: '12px 14px',
                          fontSize: 14, fontFamily: 'var(--font-dm-sans)',
                          color: 'var(--text-primary)', background: 'var(--bg)',
                          outline: 'none', resize: 'vertical', boxSizing: 'border-box',
                        }}
                      />
                    </div>
                  </div>

                  <button
                    onClick={() => setSubmitted(true)}
                    disabled={finalAmount < 10 || !recipientEmail}
                    className="btn-primary"
                    style={{
                      width: '100%', height: 48, marginTop: 24,
                      fontSize: 15, fontWeight: 700,
                      opacity: (finalAmount < 10 || !recipientEmail) ? 0.5 : 1,
                    }}
                  >
                    Purchase ${finalAmount} Gift Card
                  </button>

                  <p style={{
                    fontSize: 11, color: 'var(--text-tertiary)',
                    fontFamily: 'var(--font-dm-sans)', textAlign: 'center',
                    marginTop: 12, lineHeight: 1.5,
                  }}>
                    Delivered instantly by email. Never expires.
                  </p>
                </div>
              </>
            ) : (
              /* ── Success state ── */
              <div style={{
                padding: '48px 32px', textAlign: 'center',
                background: 'var(--card-bg)',
                borderRadius: 'var(--r-xl)',
                border: '1px solid var(--border)',
                boxShadow: 'var(--shadow-lg)',
              }}>
                <p style={{ fontSize: 48, marginBottom: 16 }}>🎉</p>
                <h2 style={{
                  fontFamily: 'var(--font-syne)', fontWeight: 800,
                  fontSize: 24, color: 'var(--text-primary)',
                  marginBottom: 8,
                }}>
                  Gift card sent!
                </h2>
                <p style={{
                  fontSize: 14, color: 'var(--text-secondary)',
                  fontFamily: 'var(--font-dm-sans)', lineHeight: 1.6,
                  marginBottom: 24,
                }}>
                  A ${finalAmount} gift card has been sent to {recipientEmail}. They&apos;ll receive it within minutes.
                </p>
                <button
                  onClick={() => {
                    setSubmitted(false)
                    setRecipientName('')
                    setRecipientEmail('')
                    setSenderName('')
                    setMessage('')
                  }}
                  className="btn-outline"
                  style={{
                    height: 42, padding: '0 28px',
                    fontSize: 14, fontWeight: 600,
                    borderRadius: 'var(--r-sm)',
                  }}
                >
                  Send another
                </button>
              </div>
            )}
          </div>
        </div>

        {/* ── How It Works ── */}
        <div style={{ marginTop: 80 }}>
          <h2 style={{
            fontFamily: 'var(--font-syne)', fontWeight: 800,
            fontSize: 24, color: 'var(--text-primary)',
            letterSpacing: '-0.02em', textAlign: 'center',
            marginBottom: 40,
          }}>
            How it works
          </h2>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 24 }}>
            {[
              { step: '01', title: 'Choose & personalize', desc: 'Select an amount, add a personal message, and enter the recipient\'s email.' },
              { step: '02', title: 'They receive it instantly', desc: 'A beautifully designed digital gift card arrives in their inbox with a unique redemption code.' },
              { step: '03', title: 'They choose their adventure', desc: 'From cliff diving in Negril to a reggae studio session in Kingston — they pick what excites them.' },
            ].map((item) => (
              <div key={item.step} style={{ textAlign: 'center' }}>
                <p style={{
                  fontFamily: 'var(--font-syne)', fontWeight: 800,
                  fontSize: 40, color: 'var(--border-strong)',
                  marginBottom: 12, letterSpacing: '-0.03em',
                }}>
                  {item.step}
                </p>
                <h3 style={{
                  fontFamily: 'var(--font-syne)', fontWeight: 700,
                  fontSize: 17, color: 'var(--text-primary)',
                  marginBottom: 8,
                }}>
                  {item.title}
                </h3>
                <p style={{
                  fontSize: 14, color: 'var(--text-tertiary)',
                  fontFamily: 'var(--font-dm-sans)', lineHeight: 1.6,
                }}>
                  {item.desc}
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* ── Bottom CTA ── */}
        <div style={{
          marginTop: 64, padding: '48px 40px',
          borderRadius: 'var(--r-xl)',
          background: 'var(--accent)', textAlign: 'center',
        }}>
          <h2 style={{
            fontFamily: 'var(--font-syne)', fontWeight: 800,
            fontSize: 24, color: 'white',
            letterSpacing: '-0.02em', marginBottom: 8,
          }}>
            Questions about gift cards?
          </h2>
          <p style={{
            fontSize: 15, color: 'rgba(255,255,255,0.7)',
            fontFamily: 'var(--font-dm-sans)', marginBottom: 24,
          }}>
            Our team is happy to help with bulk orders, corporate gifts, or custom amounts.
          </p>
          <a href="mailto:gifts@mapltours.com" style={{
            display: 'inline-flex', alignItems: 'center',
            height: 44, padding: '0 28px',
            borderRadius: 9999, background: 'white', color: 'var(--accent)',
            fontSize: 14, fontWeight: 700, fontFamily: 'var(--font-dm-sans)',
            textDecoration: 'none',
          }}>
            Contact gifts@mapltours.com
          </a>
        </div>
      </div>
    </div>
  )
}
