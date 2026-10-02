/**
 * Just enough DOM for react-dom/client to mount, update and unmount a tree in
 * vitest's node environment, and for a test to click a button through React's
 * own event delegation.
 *
 * The repo has no jsdom, happy-dom or testing-library, and adding one would
 * change the lockfile the site deploys with. Components under test here are
 * plain divs, spans and buttons (Stripe's iframes are mocked), so a tree of
 * nodes with attributes, inline styles, text and capture/bubble listeners is
 * all React touches. Install it BEFORE react-dom is imported (vi.hoisted), so
 * react-dom sees a browser, and remove it afterwards.
 */

const HTML_NS = 'http://www.w3.org/1999/xhtml'

type Listener = { type: string; fn: (event: unknown) => void; capture: boolean }

export class MiniNode {
  parentNode: MiniNode | null = null
  childNodes: MiniNode[] = []
  nodeValue: string | null = null
  private listeners: Listener[] = []

  constructor(public nodeType: number, public nodeName: string, public ownerDocument: MiniDocument | null) {}

  get firstChild(): MiniNode | null { return this.childNodes[0] ?? null }
  get lastChild(): MiniNode | null { return this.childNodes[this.childNodes.length - 1] ?? null }
  get nextSibling(): MiniNode | null {
    const siblings = this.parentNode?.childNodes ?? []
    return siblings[siblings.indexOf(this) + 1] ?? null
  }

  appendChild<T extends MiniNode>(child: T): T {
    child.parentNode?.removeChild(child)
    child.parentNode = this
    this.childNodes.push(child)
    return child
  }

  insertBefore<T extends MiniNode>(child: T, before: MiniNode | null): T {
    if (!before) return this.appendChild(child)
    child.parentNode?.removeChild(child)
    child.parentNode = this
    this.childNodes.splice(this.childNodes.indexOf(before), 0, child)
    return child
  }

  removeChild<T extends MiniNode>(child: T): T {
    const at = this.childNodes.indexOf(child)
    if (at >= 0) this.childNodes.splice(at, 1)
    child.parentNode = null
    return child
  }

  get textContent(): string {
    return this.nodeType === 3 ? (this.nodeValue ?? '') : this.childNodes.map((c) => c.textContent).join('')
  }

  set textContent(text: string) {
    if (this.nodeType === 3) { this.nodeValue = text; return }
    for (const c of this.childNodes) c.parentNode = null
    this.childNodes = []
    if (text) this.appendChild(this.doc().createTextNode(String(text)))
  }

  addEventListener(type: string, fn: (event: unknown) => void, options?: boolean | { capture?: boolean }) {
    const capture = typeof options === 'boolean' ? options : !!options?.capture
    this.listeners.push({ type, fn, capture })
  }

  removeEventListener(type: string, fn: (event: unknown) => void, options?: boolean | { capture?: boolean }) {
    const capture = typeof options === 'boolean' ? options : !!options?.capture
    this.listeners = this.listeners.filter((l) => !(l.type === type && l.fn === fn && l.capture === capture))
  }

  /** Runs this node's listeners for one phase of a dispatch. */
  fire(event: { type: string }, capture: boolean) {
    for (const l of this.listeners) if (l.type === event.type && l.capture === capture) l.fn(event)
  }

  contains(node: MiniNode | null): boolean {
    for (let n = node; n; n = n.parentNode) if (n === this) return true
    return false
  }

  private doc(): MiniDocument {
    return this.ownerDocument ?? (this as unknown as MiniDocument)
  }
}

type Style = Record<string, unknown> & { setProperty(name: string, value: string): void; removeProperty(name: string): void }

export class MiniElement extends MiniNode {
  readonly attributes = new Map<string, string>()
  readonly style: Style
  readonly tagName: string

  constructor(doc: MiniDocument, tag: string, public namespaceURI: string) {
    const tagName = namespaceURI === HTML_NS ? tag.toUpperCase() : tag
    super(1, tagName, doc)
    this.tagName = tagName
    const style: Record<string, unknown> = {}
    this.style = Object.assign(style, {
      setProperty: (name: string, value: string) => { style[name] = value },
      removeProperty: (name: string) => { delete style[name] },
    })
  }

  setAttribute(name: string, value: unknown) { this.attributes.set(name, String(value)) }
  setAttributeNS(_ns: string | null, name: string, value: unknown) { this.setAttribute(name, value) }
  removeAttribute(name: string) { this.attributes.delete(name) }
  removeAttributeNS(_ns: string | null, name: string) { this.removeAttribute(name) }
  getAttribute(name: string): string | null { return this.attributes.get(name) ?? null }
  hasAttribute(name: string): boolean { return this.attributes.has(name) }
  focus() {}
  blur() {}
}

export class MiniDocument extends MiniNode {
  readonly documentElement: MiniElement
  readonly body: MiniElement
  activeElement: MiniElement | null = null

  constructor() {
    super(9, '#document', null)
    this.documentElement = this.createElement('html')
    this.body = this.createElement('body')
    this.documentElement.appendChild(this.body)
    this.appendChild(this.documentElement)
  }

  createElement(tag: string) { return new MiniElement(this, tag, HTML_NS) }
  createElementNS(ns: string, tag: string) { return new MiniElement(this, tag, ns) }
  createTextNode(text: string) {
    const node = new MiniNode(3, '#text', this)
    node.nodeValue = text
    return node
  }
}

const GLOBALS = ['window', 'document', 'IS_REACT_ACT_ENVIRONMENT'] as const

/** Puts a fresh document and window on globalThis. Returns them, and a teardown. */
export function installMiniDom(location: { origin: string; assign: (url: string) => void }) {
  const document = new MiniDocument()
  // Deliberately no dispatchEvent or createEvent: React's development build
  // then calls event handlers directly instead of through a fake DOM event.
  const window: Record<string, unknown> = {
    document,
    location,
    navigator: globalThis.navigator,
    HTMLIFrameElement: class HTMLIFrameElement {},
    addEventListener() {},
    removeEventListener() {},
  }
  window.top = window
  window.self = window
  const g = globalThis as Record<string, unknown>
  const saved = GLOBALS.map((k) => [k, g[k]] as const)
  g.window = window
  g.document = document
  g.IS_REACT_ACT_ENVIRONMENT = true
  return {
    document,
    window,
    uninstall() { for (const [k, v] of saved) { if (v === undefined) delete g[k]; else g[k] = v } },
  }
}

/** Every element under `root`, depth first. */
export function allElements(root: MiniNode): MiniElement[] {
  const out: MiniElement[] = []
  const walk = (n: MiniNode) => { for (const c of n.childNodes) { if (c instanceof MiniElement) out.push(c); walk(c) } }
  walk(root)
  return out
}

/**
 * A click the way a browser delivers it: capture listeners from the document
 * down to the target, then bubble listeners back up. React listens on the
 * root container, so this runs its real event path, including its rule that
 * a disabled button's onClick never fires.
 */
export function click(target: MiniElement) {
  const path: MiniNode[] = []
  for (let n: MiniNode | null = target; n; n = n.parentNode) path.push(n)
  let stopped = false
  const event = {
    type: 'click', target, bubbles: true, cancelable: true, isTrusted: true,
    defaultPrevented: false, timeStamp: Date.now(), button: 0, detail: 1,
    preventDefault() { this.defaultPrevented = true },
    stopPropagation() { stopped = true },
  }
  for (const n of [...path].reverse()) { if (stopped) return; n.fire(event, true) }
  for (const n of path) { if (stopped) return; n.fire(event, false) }
}
