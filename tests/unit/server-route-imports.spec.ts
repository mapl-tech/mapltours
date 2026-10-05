import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import ts from 'typescript'

/**
 * No route handler may reach a 'use client' module.
 *
 * Next bundles route handlers for the server, and a value imported from a
 * 'use client' module arrives there as a client reference object, not the
 * value. The guest-clip webhook read VIDEO_REWARD_MILESTONE that way: an
 * object, so every "your clip is live" email would have counted rewards as
 * NaN (measured on the dev server, Oct 4 2026). Vitest does not reproduce the
 * substitution, so a route's own tests pass either way; this scan is the
 * guard. It reads each file with the TypeScript parser (comments, multi-line
 * import lists, export-from, require() and import() all count; type-only
 * imports do not) and follows '@/' and relative imports transitively.
 */

const root = process.cwd()

/**
 * Chains known to be harmless, with the reason. checkout imports only
 * DAILY_HOUR_LIMIT and parseDurationHours, both defined in lib/cart itself;
 * trackAddToCart is called only from reportAdd, inside the browser store's
 * addItem and swapDayFor actions.
 */
const ALLOWED = new Set([
  'app/api/checkout/route.ts -> lib/cart.ts -> lib/analytics.ts',
])

const EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '/index.ts', '/index.tsx', '/index.js', '/index.jsx']

function resolveImport(from: string, spec: string): string | null {
  let base: string
  if (spec.startsWith('@/')) base = join(root, spec.slice(2))
  else if (spec.startsWith('.')) base = resolve(dirname(from), spec)
  else return null
  if (existsSync(base) && statSync(base).isFile()) return base
  for (const ext of EXTENSIONS) {
    if (existsSync(base + ext)) return base + ext
  }
  return null
}

const parsed = new Map<string, ts.SourceFile>()
function parse(file: string): ts.SourceFile {
  let sf = parsed.get(file)
  if (!sf) {
    sf = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true)
    parsed.set(file, sf)
  }
  return sf
}

/** 'use client' anywhere in the directive prologue (after 'use strict' too). */
function isClientModule(file: string): boolean {
  for (const st of parse(file).statements) {
    if (!ts.isExpressionStatement(st) || !ts.isStringLiteral(st.expression)) return false
    if (st.expression.text === 'use client') return true
  }
  return false
}

/** Runtime module specifiers: imports and re-exports that are not type-only, require() and import(). */
function importsOf(file: string): string[] {
  const specs: string[] = []
  const visit = (node: ts.Node) => {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      if (!node.importClause?.isTypeOnly) specs.push(node.moduleSpecifier.text)
    } else if (ts.isExportDeclaration(node) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
      if (!node.isTypeOnly) specs.push(node.moduleSpecifier.text)
    } else if (ts.isCallExpression(node) && node.arguments.length === 1 && ts.isStringLiteralLike(node.arguments[0])) {
      const callee = node.expression
      if (callee.kind === ts.SyntaxKind.ImportKeyword || (ts.isIdentifier(callee) && callee.text === 'require')) {
        specs.push(node.arguments[0].text)
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(parse(file))
  return specs
}

function routeFiles(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name)
    if (entry.isDirectory()) routeFiles(p, acc)
    else if (/^route\.(ts|tsx|js)$/.test(entry.name)) acc.push(p)
  }
  return acc
}

function clientChains(route: string): string[] {
  const chains: string[] = []
  const seen = new Set<string>()
  const stack: [string, string[]][] = [[route, [route]]]
  while (stack.length) {
    const [file, chain] = stack.pop()!
    for (const spec of importsOf(file)) {
      const target = resolveImport(file, spec)
      if (!target || seen.has(target)) continue
      seen.add(target)
      const next = chain.concat(target)
      if (isClientModule(target)) chains.push(next.map((f) => relative(root, f)).join(' -> '))
      else stack.push([target, next])
    }
  }
  return chains
}

describe('server routes never import client modules', () => {
  const routes = routeFiles(join(root, 'app'))

  it('finds the routes', () => {
    expect(routes.length).toBeGreaterThan(20)
  })

  it('no route reaches a use client module, except the listed harmless chains', () => {
    const found = routes.flatMap(clientChains)
    expect(found.filter((c) => !ALLOWED.has(c))).toEqual([])
    // A listed chain that no longer exists should leave the list too.
    expect(Array.from(ALLOWED).filter((c) => !found.includes(c))).toEqual([])
  })

  it('the guest-clip webhook reads the milestone from the plain module', () => {
    expect(clientChains(join(root, 'app/api/hooks/video-status/route.ts'))).toEqual([])
  })
})
