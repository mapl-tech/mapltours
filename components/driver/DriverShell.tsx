'use client'

import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

/**
 * Chrome around the driver portal: MAPL Tours branded. Ink header band with
 * the brand lockup (gold leaf tile + MAPL / TOURS JAMAICA) and a gold hairline
 * signature, warm paper page ground. Mobile-first; max-width 720.
 */

const dm = 'var(--font-dm-sans)'
const ink = '#171614'
const goldWarm = '#C4A44A'

export default function DriverShell({ signedInAs, children }: { signedInAs: string; children: React.ReactNode }) {
  const router = useRouter()
  async function signOut() {
    await createClient().auth.signOut()
    router.push('/driver/login')
    router.refresh()
  }
  return (
    <div style={{ minHeight: '100vh', background: '#F4F1EB', fontFamily: dm }}>
      <header style={{ position: 'sticky', top: 0, zIndex: 5, background: ink, boxShadow: '0 2px 14px rgba(23,22,20,0.28)' }}>
        {/* Gold brand signature */}
        <div aria-hidden="true" style={{ height: 3, background: `linear-gradient(90deg, transparent, ${goldWarm} 35%, ${goldWarm} 65%, transparent)` }} />
        <div style={{ width: '100%', padding: '0 clamp(16px, 2.5vw, 28px)', height: 60, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className="logo-on-dark" src="/mapl-logo-dark.svg" alt="MAPL TOURS JAMAICA" style={{ height: 46, width: 'auto', display: 'block', margin: '-8px 0' }} />
            <span className="driver-shell-tag" style={{
              fontSize: 12, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: goldWarm,
              padding: '5px 12px', borderRadius: 9999, border: '1px solid rgba(196,164,74,0.45)', whiteSpace: 'nowrap',
            }}>
              Driver portal
            </span>
          </span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
            <span className="driver-shell-email" style={{ fontSize: 12, color: 'rgba(255,255,255,0.66)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 180 }}>{signedInAs}</span>
            <button
              type="button" onClick={signOut} className="drv-act"
              style={{
                minHeight: 40, padding: '0 15px', borderRadius: 9999, border: '1px solid rgba(255,255,255,0.35)', background: 'transparent',
                fontFamily: dm, fontSize: 13, fontWeight: 600, color: '#fff', cursor: 'pointer',
              }}
            >
              Sign out
            </button>
          </span>
        </div>
      </header>
      <main style={{ width: '100%', padding: '24px clamp(16px, 2.5vw, 32px) 72px' }}>
        {children}
      </main>
      <style jsx>{`
        @media (max-width: 480px) {
          :global(.driver-shell-email) { display: none; }
        }
        @media (max-width: 419px) {
          :global(.driver-shell-tag) { display: none; }
        }
        header :global(.drv-act:focus-visible) {
          outline: 3px solid ${goldWarm};
          outline-offset: 2px;
        }
      `}</style>
    </div>
  )
}
