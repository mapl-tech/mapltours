'use client'

import { useRouter } from 'next/navigation'
import { Leaf } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

/**
 * Chrome around the driver portal: warm page background, slim sticky header
 * with the MAPL lockup, who is signed in, and sign out. Mobile-first;
 * max-width 720 (single-column reading width for a field tool).
 */

const dm = 'var(--font-dm-sans)'
const ink = '#171614'
const soft = '#57534C'

export default function DriverShell({ signedInAs, children }: { signedInAs: string; children: React.ReactNode }) {
  const router = useRouter()
  async function signOut() {
    await createClient().auth.signOut()
    router.push('/driver/login')
    router.refresh()
  }
  return (
    <div style={{ minHeight: '100vh', background: '#F4F1EB', fontFamily: dm }}>
      <header style={{
        position: 'sticky', top: 0, zIndex: 5, background: 'rgba(244,241,235,0.92)', backdropFilter: 'blur(10px)',
        borderBottom: '1px solid #E7E1D6',
      }}>
        <div style={{ maxWidth: 720, margin: '0 auto', padding: '0 16px', height: 58, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 9 }}>
            <span style={{ width: 30, height: 30, borderRadius: 8, background: ink, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
              <Leaf size={15} strokeWidth={2.5} color="#fff" />
            </span>
            <span style={{ display: 'inline-flex', flexDirection: 'column', lineHeight: 1 }}>
              <span style={{ fontWeight: 800, fontSize: 14, letterSpacing: '0.06em', textTransform: 'uppercase', color: ink }}>MAPL</span>
              <span style={{ fontWeight: 700, fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase', color: soft, marginTop: 1 }}>Driver portal</span>
            </span>
          </span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
            <span className="driver-shell-email" style={{ fontSize: 12.5, color: soft, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 180 }}>{signedInAs}</span>
            <button
              type="button" onClick={signOut}
              style={{
                minHeight: 40, padding: '0 14px', borderRadius: 9999, border: '1px solid #E7E1D6', background: '#fff',
                fontFamily: dm, fontSize: 13, fontWeight: 600, color: ink, cursor: 'pointer',
              }}
            >
              Sign out
            </button>
          </span>
        </div>
      </header>
      <main style={{ maxWidth: 720, margin: '0 auto', padding: '22px 16px 72px' }}>
        {children}
      </main>
      <style jsx>{`
        @media (max-width: 480px) {
          :global(.driver-shell-email) { display: none; }
        }
      `}</style>
    </div>
  )
}
