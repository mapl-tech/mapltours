import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'

/**
 * Unit-test runner for pure logic and email templates.
 *
 * Vitest rather than @playwright/test: Playwright applies its own JSX
 * transform to any .tsx it imports (producing `__pw_type` objects), so React
 * Email templates cannot be rendered under it.
 *
 * @vitejs/plugin-react rather than bare esbuild: the root tsconfig sets
 * `jsx: "preserve"` because Next runs its own transform, and esbuild honours
 * that and leaves JSX unparsed. The plugin transforms JSX itself, so the
 * templates render exactly as they do in the app.
 */
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('.', import.meta.url)),
    },
  },
  test: {
    include: ['tests/unit/**/*.spec.ts', 'tests/unit/**/*.spec.tsx'],
    environment: 'node',
  },
})
