/**
 * Put text on the clipboard for /connect's copy controls. The Clipboard API
 * first; then the older hidden-textarea route for browsers and in-app web
 * views without it (focus goes back to the control that asked). Resolves
 * false when neither worked, so the caller can offer a manual way instead.
 */
export async function copyText(text: string, returnFocusTo?: HTMLElement | null): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {
    // Permission refused or no clipboard here: try the older route.
  }
  try {
    const area = document.createElement('textarea')
    area.value = text
    area.setAttribute('readonly', '')
    area.style.position = 'absolute'
    area.style.left = '-9999px'
    document.body.appendChild(area)
    area.select()
    const ok = document.execCommand('copy')
    area.remove()
    returnFocusTo?.focus()
    return ok
  } catch {
    return false
  }
}
