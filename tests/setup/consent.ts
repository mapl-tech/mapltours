import { beforeEach } from 'vitest'
import { __resetConsentForTests } from '../../lib/consent'

/**
 * Every test starts as a visitor who has already been placed OUTSIDE the
 * consent region (lib/consent), so a test that stands on the live host reads
 * the tracking rules it always did, whatever time zone the machine running
 * it is in. Without this, lib/consent falls back to the machine's clock for
 * a visitor not yet placed, and the suite would pass in Toronto and fail in
 * Berlin. Tests about consent itself reset this in their own beforeEach.
 */
beforeEach(() => {
  __resetConsentForTests(false)
})
