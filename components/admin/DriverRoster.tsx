'use client'

import { useEffect, useId, useState } from 'react'
import { useResultNote } from '@/components/admin/AdminUi'
import { parseDriverFields, vehicleInWords, type Driver, type DriverFields } from '@/lib/drivers'

/**
 * The Drivers page (/admin/drivers): the saved drivers the dispatch console's
 * dropdowns offer. Add one, change one, retire one (never deleted, so an old
 * booking still names who drove it). The same rules as the server
 * (lib/drivers.ts parseDriverFields) check a form before it is sent, so a
 * mistake is said at the field, in words.
 */

/** A saved driver as this page reads it, with the role (migration 043). */
type RosterDriver = Driver & { role?: 'driver' | 'fleet_manager' | null }
type Role = 'driver' | 'fleet_manager'
type Draft = Record<keyof DriverFields, string> & { role: Role }
const EMPTY: Draft = { name: '', whatsapp: '', vehicle: '', colour: '', plate: '', email: '', role: 'driver' }
const draftOf = (d: RosterDriver): Draft => ({ name: d.name, whatsapp: d.whatsapp, vehicle: d.vehicle, colour: d.colour, plate: d.plate, email: d.email ?? '', role: d.role === 'fleet_manager' ? 'fleet_manager' : 'driver' })

const FIELDS: { k: keyof DriverFields; label: string; help: string; auto?: string; mode?: 'tel' | 'email'; placeholder: string }[] = [
  { k: 'name', label: 'Name', help: 'As the guest should read it.', auto: 'off', placeholder: 'First and last name' },
  { k: 'whatsapp', label: 'WhatsApp for guests', help: 'The number guests message, with + and the country code.', mode: 'tel', auto: 'off', placeholder: '+1 876 919-7534' },
  { k: 'vehicle', label: 'Make and model', help: 'No colour here.', auto: 'off', placeholder: 'Toyota Hiace' },
  { k: 'colour', label: 'Colour', help: 'In words, as it reads in a sentence.', auto: 'off', placeholder: 'silver' },
  { k: 'plate', label: 'License plate', help: 'As it reads on the vehicle.', auto: 'off', placeholder: 'PJ 1234' },
  { k: 'email', label: 'Driver email (optional)', help: 'The Google address the driver signs in to the driver portal with. It also gets a copy of each driver update sent with this driver.', mode: 'email', auto: 'off', placeholder: 'None' },
]

function DriverForm({ initial, submitLabel, busy, onSubmit, onCancel }: {
  initial: Draft; submitLabel: string; busy: boolean
  onSubmit: (d: Draft) => Promise<{ error?: string; field?: keyof DriverFields | 'role' } | null>
  onCancel?: () => void
}) {
  const id = useId()
  const [d, setD] = useState<Draft>(initial)
  const [err, setErr] = useState<{ error: string; field?: keyof DriverFields | 'role' } | null>(null)
  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (busy) return
    const parsed = parseDriverFields(d)
    if (!parsed.ok) { setErr({ error: parsed.error, field: parsed.field }); document.getElementById(`${id}-${parsed.field}`)?.focus(); return }
    const res = await onSubmit(d)
    if (res?.error) { setErr({ error: res.error, field: res.field }); if (res.field) document.getElementById(`${id}-${res.field}`)?.focus() }
    else setErr(null)
  }
  return (
    <form onSubmit={submit} noValidate>
      <div className="adm-cp-grid">
        {FIELDS.map((f) => (
          <div key={f.k} className="adm-cp-field">
            <label className="adm-label" htmlFor={`${id}-${f.k}`}>{f.label}</label>
            <input
              id={`${id}-${f.k}`} className="adm-input" value={d[f.k]} placeholder={f.placeholder}
              type={f.mode === 'email' ? 'email' : 'text'} inputMode={f.mode} autoComplete={f.auto}
              aria-invalid={err?.field === f.k || undefined}
              aria-describedby={`${id}-${f.k}-h${err?.field === f.k ? ` ${id}-err` : ''}`}
              onChange={(e) => setD((x) => ({ ...x, [f.k]: e.target.value }))}
            />
            <p id={`${id}-${f.k}-h`} className="adm-help">{f.help}</p>
          </div>
        ))}
        <div className="adm-cp-field">
          <label className="adm-label" htmlFor={`${id}-role`}>Role in the driver portal</label>
          <select
            id={`${id}-role`} className="adm-input" value={d.role}
            aria-invalid={err?.field === 'role' || undefined}
            aria-describedby={`${id}-role-h${err?.field === 'role' ? ` ${id}-err` : ''}`}
            onChange={(e) => setD((x) => ({ ...x, role: e.target.value === 'fleet_manager' ? 'fleet_manager' : 'driver' }))}
          >
            <option value="driver">Driver</option>
            <option value="fleet_manager">Fleet manager</option>
          </select>
          <p id={`${id}-role-h`} className="adm-help">A driver sees only the rides and tours given to them. A fleet manager sees every ride and tour, changes drivers and times, and adds drivers.</p>
        </div>
      </div>
      {err && <p id={`${id}-err`} role="alert" className="adm-error" style={{ marginTop: 12 }}>{err.error}</p>}
      <div className="adm-actions" style={{ marginTop: 16 }}>
        <button type="submit" className="adm-btn adm-btn--primary" aria-disabled={busy || undefined} aria-busy={busy || undefined}>{busy ? 'Saving…' : submitLabel}</button>
        {onCancel && <button type="button" className="adm-btn" onClick={onCancel}>Cancel</button>}
      </div>
    </form>
  )
}

export default function DriverRoster() {
  const [drivers, setDrivers] = useState<RosterDriver[] | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const [editing, setEditing] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const { setNote, keepClear, toast } = useResultNote()

  async function load() {
    const r = await fetch('/api/admin/drivers', { cache: 'no-store' }).catch(() => null)
    const j = r ? await r.json().catch(() => null) : null
    if (!r?.ok || !j) { setLoadError(j?.error ?? 'The drivers did not load. Reload the page to try again.'); return }
    setLoadError(null)
    setDrivers(j.drivers)
  }
  useEffect(() => { void load() }, [])

  async function save(method: 'POST' | 'PATCH', body: Record<string, unknown>, key: string) {
    setBusy(key)
    const r = await fetch('/api/admin/drivers', { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }).catch(() => null)
    const j = r ? await r.json().catch(() => null) : null
    setBusy(null)
    if (!r?.ok || !j?.driver) return { error: j?.error ?? 'That did not save. Check the connection and try again.', field: j?.field }
    setDrivers((list) => {
      const rest = (list ?? []).filter((d) => d.id !== j.driver.id)
      return [...rest, j.driver].sort((a, b) => Number(b.active) - Number(a.active) || a.name.localeCompare(b.name))
    })
    return { driver: j.driver as RosterDriver }
  }

  const working = (drivers ?? []).filter((d) => d.active)
  const retired = (drivers ?? []).filter((d) => !d.active)

  // A plain function, not a component: a component declared in here would be
  // a new type on every render, and the open edit form would lose its typing.
  function item(d: RosterDriver) {
    const isEditing = editing === d.id
    return (
      <li key={d.id} className="adm-card">
        <div className="adm-card-in">
          <div className="adm-cp-head" style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
            <h2 className="adm-h3">{d.name}</h2>
            {d.role === 'fleet_manager' && <span className="adm-badge">Fleet manager</span>}
            {!d.active && <span className="adm-badge adm-badge--plain">Retired</span>}
          </div>
          {!isEditing && (
            <>
              <p className="adm-meta">{vehicleInWords(d)} · plate {d.plate} · WhatsApp {d.whatsapp}{d.email ? ` · signs in to the portal with ${d.email}` : ' · no portal sign-in'}</p>
              <div className="adm-actions" style={{ marginTop: 12 }}>
                {d.active && <button type="button" className="adm-btn adm-btn--sm" onClick={() => setEditing(d.id)}>Edit</button>}
                <button
                  type="button" className="adm-btn adm-btn--sm" aria-busy={busy === d.id || undefined}
                  onClick={async () => {
                    const res = await save('PATCH', { id: d.id, action: d.active ? 'retire' : 'restore' }, d.id)
                    setNote(res.error ? { text: res.error, bad: true } : { text: d.active ? `${d.name} is retired and no longer offered.` : `${d.name} is back on the list.` })
                  }}
                >
                  {d.active ? 'Retire' : 'Bring back'}
                </button>
              </div>
            </>
          )}
          {isEditing && (
            <div style={{ marginTop: 12 }}>
              <DriverForm
                initial={draftOf(d)} submitLabel="Save changes" busy={busy === d.id}
                onCancel={() => setEditing(null)}
                onSubmit={async (draft) => {
                  const res = await save('PATCH', { id: d.id, ...draft }, d.id)
                  if (res.error) return res
                  setEditing(null)
                  setNote({ text: `${draft.name.trim()} saved. Bookings already sent keep the details they were given.` })
                  return null
                }}
              />
            </div>
          )}
        </div>
      </li>
    )
  }

  return (
    <div onFocus={keepClear}>
      <div className="adm-cp-top">
        <h1 className="adm-h1">Drivers</h1>
        {!adding && <button type="button" className="adm-btn adm-btn--primary" onClick={() => setAdding(true)}>Add a driver</button>}
      </div>
      <p className="adm-lead">
        The drivers the dispatch console offers. Choosing one on a booking copies these details onto it and can email the guest.
        Changing a driver here does not change bookings that already have them.
      </p>

      {adding && (
        <section className="adm-card" style={{ marginTop: 16 }} aria-labelledby="dr-new-h">
          <div className="adm-card-in">
            <h2 id="dr-new-h" className="adm-h3" style={{ marginBottom: 12 }}>New driver</h2>
            <DriverForm
              initial={EMPTY} submitLabel="Add driver" busy={busy === 'new'}
              onCancel={() => setAdding(false)}
              onSubmit={async (draft) => {
                const res = await save('POST', draft, 'new')
                if (res.error) return res
                setAdding(false)
                setNote({ text: `${draft.name.trim()} added.` })
                return null
              }}
            />
          </div>
        </section>
      )}

      {loadError && <p role="alert" className="adm-error" style={{ marginTop: 16 }}>{loadError}</p>}
      {drivers === null && !loadError && <p className="adm-empty">Loading drivers…</p>}
      {drivers !== null && working.length === 0 && <p className="adm-empty">No drivers saved yet. Add the first one with Add a driver. 🇯🇲</p>}
      {working.length > 0 && <ol className="adm-list" aria-label="Working drivers">{working.map(item)}</ol>}
      {retired.length > 0 && (
        <>
          <h2 className="adm-h3" style={{ marginTop: 28 }}>Retired</h2>
          <ol className="adm-list" aria-label="Retired drivers">{retired.map(item)}</ol>
        </>
      )}
      {toast}
    </div>
  )
}
