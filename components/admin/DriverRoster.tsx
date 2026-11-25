'use client'

import { useEffect, useId, useRef, useState } from 'react'
import { useResultNote } from '@/components/admin/AdminUi'
import Sheet from '@/components/driver/fleet/Sheet'
import { EditReviewSteps, useEditReview } from '@/components/driver/fleet/EditReview'
import { parseDriverFields, vehicleInWords, type Driver, type DriverFields } from '@/lib/drivers'

/**
 * The Drivers page (/admin/drivers): the saved drivers the dispatch console's
 * dropdowns offer. Add one, change one, retire one (never deleted, so an old
 * booking still names who drove it). The same rules as the server
 * (lib/drivers.ts parseDriverFields) check a form before it is sent, so a
 * mistake is said at the field, in words.
 *
 * A change of details is reviewed before it is saved (Nov 25 2026, the same
 * review as the driver portal's, components/driver/fleet/EditReview): the
 * rides still ahead that carry the old details move with it, and the review
 * says when each guest hears. A driver with rides still ahead is not retired.
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

type FormError = { error: string; field?: keyof DriverFields | 'role' }

function DriverForm({ initial, submitLabel, busy, busyLabel = 'Saving…', onSubmit, onCancel, external }: {
  initial: Draft; submitLabel: string; busy: boolean
  /** What the button says while busy: "Saving…" for an add, "Checking…" while a change is being checked. */
  busyLabel?: string
  onSubmit: (d: Draft, submitter: HTMLElement | null) => Promise<FormError | null>
  onCancel?: () => void
  /** A refusal that came after the form was sent (a clash found while saving), shown at its field. */
  external?: FormError | null
}) {
  const id = useId()
  const [d, setD] = useState<Draft>(initial)
  const [err, setErr] = useState<FormError | null>(null)
  useEffect(() => {
    if (!external) return
    setErr(external)
    if (external.field) document.getElementById(`${id}-${external.field}`)?.focus()
  }, [external, id])
  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (busy) return
    const parsed = parseDriverFields(d)
    if (!parsed.ok) { setErr({ error: parsed.error, field: parsed.field }); document.getElementById(`${id}-${parsed.field}`)?.focus(); return }
    const submitter = (e.nativeEvent as SubmitEvent).submitter ?? null
    const res = await onSubmit(d, submitter instanceof HTMLElement ? submitter : null)
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
        <button type="submit" className="adm-btn adm-btn--primary" aria-disabled={busy || undefined} aria-busy={busy || undefined}>{busy ? busyLabel : submitLabel}</button>
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
  const [formError, setFormError] = useState<FormError | null>(null)
  const [opener, setOpener] = useState<HTMLElement | null>(null)
  const { setNote, keepClear, toast } = useResultNote()
  const sheetTitle = useId()
  const review = useEditReview('/api/admin/drivers', {
    onSaved: () => { void load() },
    onFieldError: (field, message) => setFormError({ error: message, field: (FIELDS.some((f) => f.k === field) || field === 'role') ? field as FormError['field'] : undefined }),
  })
  const reviewing = useRef<RosterDriver | null>(null)
  /** The review sheet closes: after a save, the form closes too and the page says what happened. */
  function closeReview() {
    if (review.step === 'saving') return
    const done = review.step === 'done' ? review.result : null
    review.reset()
    if (done) {
      setEditing(null)
      setNote(done.tone === 'ok' ? { text: done.text } : { text: done.text, bad: true })
    }
  }

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
    if (!r?.ok || !j?.driver) {
      // Retiring a driver with rides ahead: the refusal names each ride, to give to another driver first.
      const rides = Array.isArray(j?.rides) ? (j.rides as { ref: string; guest: string; when: string | null }[]) : []
      const list = rides.map((x) => `${x.ref} (${x.guest}${x.when ? `, ${x.when}` : ''})`).join(', ')
      return { error: `${j?.error ?? 'That did not save. Check the connection and try again.'}${list ? ` ${list}.` : ''}`, field: j?.field }
    }
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
                {d.active && <button type="button" className="adm-btn adm-btn--sm" onClick={() => { setFormError(null); setEditing(d.id) }}>Edit</button>}
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
                initial={draftOf(d)} submitLabel="Review changes" busy={review.pending} busyLabel="Checking…"
                external={formError}
                onCancel={() => { setEditing(null); setFormError(null) }}
                onSubmit={async (draft, submitter) => {
                  const parsed = parseDriverFields(draft)
                  if (!parsed.ok) return { error: parsed.error, field: parsed.field }
                  const was = draftOf(d)
                  const same = (Object.keys(parsed.fields) as (keyof DriverFields)[]).every((k) => (parsed.fields[k] ?? '') === (d[k] ?? '')) && draft.role === was.role
                  if (same) return { error: 'Nothing has changed yet. Change a detail, or cancel.' }
                  setFormError(null)
                  setOpener(submitter)
                  reviewing.current = d
                  const r = await review.start({ id: d.id, ...parsed.fields, role: draft.role })
                  return r.ok ? null : { error: r.message, field: (r.field as FormError['field']) ?? undefined }
                }}
              />
              <p className="adm-help" style={{ marginTop: 8 }}>Nothing is saved until you check what changes on the next screen.</p>
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
        Changing a driver&apos;s details also changes the rides still ahead that carry them, once you have checked what changes; past rides keep what their guests were told.
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
      <Sheet open={!!review.step} onClose={closeReview} labelledBy={sheetTitle} busy={review.pending || review.step === 'saving'} returnTo={opener}>
        <div className="fm-sheet-head">
          <p className="fm-eyebrow">Drivers{reviewing.current ? ` · ${reviewing.current.name}` : ''}</p>
          {review.step !== 'saving' && review.step !== 'done' && (
            <button type="button" className="fm-x" onClick={closeReview} aria-label="Close without saving"><span aria-hidden="true">×</span></button>
          )}
        </div>
        <EditReviewSteps review={review} titleId={sheetTitle} onBack={() => review.reset()} onClose={closeReview} />
      </Sheet>
      {toast}
    </div>
  )
}
