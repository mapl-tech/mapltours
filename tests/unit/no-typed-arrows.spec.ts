import { describe, test, expect } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import ts from 'typescript'

/**
 * The site draws its arrows (components/ui/Arrow.tsx). The font's typed "→"
 * was long and hairline beside bold words and sat under link underlines, and
 * the owner asked for better arrows (Nov 13 2026). This keeps typed arrows
 * out of anything the site renders: JSX text, string and template literals
 * placed straight into JSX, and text attributes. Route data such as
 * label: 'MBJ → Negril' stays plain and is drawn by RouteText, so object
 * literals and the `text` and `route` props RouteText reads are allowed.
 *
 * Not checked: emails (email clients cannot show the drawn arrow), code
 * comments, and four screens no route mounts any more.
 */
const ROOTS = ['app', 'components']
const UNMOUNTED = new Set([
  'components/checkout/CheckoutView.tsx',
  'components/transfers/TransfersCheckoutView.tsx',
  'components/LeftNav.tsx',
  'components/ReelCard.tsx',
])
const TYPED = /[→←›‹]|&(larr|rarr|lsaquo|rsaquo|laquo|raquo);/
const ROUTE_PROPS = new Set(['text', 'route'])

function files(dir: string): string[] {
  const out: string[] = []
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) out.push(...files(p))
    else if (p.endsWith('.tsx')) out.push(p)
  }
  return out
}

function typedArrowsIn(path: string): string[] {
  const src = readFileSync(path, 'utf8')
  if (!TYPED.test(src)) return []
  const sf = ts.createSourceFile(path, src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  const hits: string[] = []
  const at = (n: ts.Node) => `${relative(process.cwd(), path)}:${sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1}`
  const isLiteral = (n: ts.Node) => ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n) || ts.isTemplateExpression(n)
  // A literal rendered as text: inside a {…} child of an element, possibly
  // through a ternary or && chain, but not inside a function call or an
  // attribute other than the route props.
  const rendersAsText = (n: ts.Node): boolean => {
    let cur: ts.Node = n
    while (cur.parent) {
      const p = cur.parent
      if (ts.isJsxExpression(p)) {
        if (ts.isJsxAttribute(p.parent)) return !ROUTE_PROPS.has(p.parent.name.getText(sf))
        return ts.isJsxElement(p.parent) || ts.isJsxFragment(p.parent)
      }
      if (ts.isConditionalExpression(p) || ts.isBinaryExpression(p) || ts.isParenthesizedExpression(p) || ts.isTemplateSpan(p) || ts.isTemplateExpression(p)) { cur = p; continue }
      return false
    }
    return false
  }
  const visit = (n: ts.Node) => {
    if (ts.isJsxText(n) && TYPED.test(n.getText(sf))) hits.push(`${at(n)} text "${n.getText(sf).trim().slice(0, 40)}"`)
    else if (ts.isJsxAttribute(n) && n.initializer && ts.isStringLiteral(n.initializer) && TYPED.test(n.initializer.text) && !ROUTE_PROPS.has(n.name.getText(sf))) {
      hits.push(`${at(n)} ${n.name.getText(sf)}="${n.initializer.text.slice(0, 40)}"`)
    } else if (isLiteral(n) && TYPED.test(n.getText(sf)) && rendersAsText(n)) hits.push(`${at(n)} literal ${n.getText(sf).slice(0, 40)}`)
    ts.forEachChild(n, visit)
  }
  visit(sf)
  return hits
}

describe('arrows on the site are drawn, never typed', () => {
  test('no typed arrow in any rendered text', () => {
    const hits = ROOTS.flatMap((r) => files(r))
      .filter((p) => !UNMOUNTED.has(relative(process.cwd(), p)))
      .flatMap(typedArrowsIn)
    expect(hits).toEqual([])
  })

  test('the guard sees what it should', () => {
    const probe = (code: string) => {
      const sf = ts.createSourceFile('probe.tsx', code, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
      let found = 0
      const walk = (n: ts.Node) => { if (ts.isJsxText(n) && TYPED.test(n.getText(sf))) found++; ts.forEachChild(n, walk) }
      walk(sf)
      return found
    }
    expect(probe('const a = <a>Book now →</a>')).toBe(1)
    expect(probe('const a = <a>Book now</a>')).toBe(0)
  })
})
