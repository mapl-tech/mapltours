'use client'

import React, { useState } from 'react'
import { useServerInsertedHTML } from 'next/navigation'
import { StyleRegistry, createStyleRegistry } from 'styled-jsx'

/**
 * Server-side rendering registry for styled-jsx in the App Router.
 *
 * Without this, `<style jsx>` blocks in client components (e.g. the whole
 * transfers hero in TransfersView) are injected only on the client, so the
 * page paints unstyled and then reflows when the JS chunk lands, a large
 * Cumulative Layout Shift. With the registry, the collected styles are
 * flushed into the server HTML `<head>`, so the markup is correct on first
 * paint and there is no shift.
 */
export default function StyledJsxRegistry({ children }: { children: React.ReactNode }) {
  const [jsxStyleRegistry] = useState(() => createStyleRegistry())

  useServerInsertedHTML(() => {
    const styles = jsxStyleRegistry.styles()
    jsxStyleRegistry.flush()
    return <>{styles}</>
  })

  return <StyleRegistry registry={jsxStyleRegistry}>{children}</StyleRegistry>
}
