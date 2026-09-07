import { describe, test, expect } from 'vitest'
import { readGaIds, sanitizeAttribution } from '../../lib/attribution'

describe('GA4 ids from cookies', () => {
  test('reads the client id and a GS2 session id', () => {
    const cookie = '_ga=GA1.1.1234567890.1725000000; _ga_2JVWPL4GBE=GS2.1.s1747323152$o28$g0$t1747323152$j60$l0$h69286059; other=x'
    expect(readGaIds(cookie)).toEqual({ ga_client_id: '1234567890.1725000000', ga_session_id: '1747323152' })
  })
  test('reads the older GS1 session format', () => {
    expect(readGaIds('_ga=GA1.2.111.222; _ga_2JVWPL4GBE=GS1.1.1700000000.3.1.1700000400.0.0.0')).toEqual({ ga_client_id: '111.222', ga_session_id: '1700000000' })
  })
  test('ignores another property\'s session cookie and malformed values', () => {
    expect(readGaIds('_ga=GA1.1.1.2; _ga_OTHER=GS2.1.s999$o1')).toEqual({ ga_client_id: '1.2' })
    expect(readGaIds('_ga=garbage; _ga_2JVWPL4GBE=GS9.1.x')).toEqual({})
    expect(readGaIds('')).toEqual({})
  })
  test('the server keeps the ids and still strips anything else', () => {
    expect(sanitizeAttribution({ source: 'google', ga_client_id: '1.2', ga_session_id: '3', evil: 'x', gclid: 'abc' })).toEqual({ source: 'google', gclid: 'abc', ga_client_id: '1.2', ga_session_id: '3' })
  })
})
