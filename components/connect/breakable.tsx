import { Fragment } from 'react'

/**
 * An address with line breaks allowed only after "//", after the host's "/"
 * and before "?", so a narrow screen wraps it as "https://mapltours.com/mcp"
 * over "?via=muse" instead of splitting a word. <wbr> adds no text, so a
 * manual copy of the selection is still the exact address. Wrap the result in
 * one inline element: inside a flex box, bare parts would each become a column.
 */
export function breakable(address: string) {
  // Plain string work, not a lookbehind regex: Safari before 16.4 rejects
  // lookbehind at parse time, which would take the whole chunk down.
  const parts: string[] = []
  let rest = address
  const scheme = rest.indexOf('//')
  if (scheme >= 0) {
    parts.push(rest.slice(0, scheme + 2))
    rest = rest.slice(scheme + 2)
  }
  const q = rest.indexOf('?')
  const path = q >= 0 ? rest.slice(0, q) : rest
  const slash = path.indexOf('/')
  if (slash >= 0) parts.push(path.slice(0, slash + 1), path.slice(slash + 1))
  else parts.push(path)
  if (q >= 0) parts.push(rest.slice(q))
  return parts.filter(Boolean).map((part, i) => (
    <Fragment key={i}>
      {i > 0 && <wbr />}
      <span style={{ whiteSpace: 'nowrap' }}>{part}</span>
    </Fragment>
  ))
}
