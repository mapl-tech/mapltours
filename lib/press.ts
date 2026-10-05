/**
 * Whether a click came from a key or a screen reader rather than a pointer.
 * A key press clicks with detail 0. NVDA and JAWS in Firefox click with
 * detail 1, but leave Firefox's mozInputSource at 0 (unknown) on a trusted
 * event. Chrome's screen-reader presses (TalkBack, NVDA in Chrome) arrive as
 * a mouse would, pointerdown and all, and are not caught here: callers that
 * must tell those apart also look at where focus was (components/FeedView)
 * or at whether a pointer could reach the control at all (the reel's play
 * button, components/ExperienceDetail).
 */
export function isKeyOrReaderClick(e: { detail: number; nativeEvent: Event }): boolean {
  const native = e.nativeEvent as MouseEvent & { mozInputSource?: number }
  return e.detail === 0 || (native.mozInputSource === 0 && native.isTrusted)
}
