// `server-only` throws when imported outside a React Server Component.
// Under vitest there is no such boundary, so it aliases to this no-op and the
// server modules that guard themselves with it stay testable.
export {}
