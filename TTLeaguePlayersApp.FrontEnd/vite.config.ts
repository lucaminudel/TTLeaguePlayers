/// <reference types="vitest" />
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import fs from 'node:fs'
import path from 'node:path'

function loadBuildTimeConfig(): Record<string, unknown> {
  const environment = process.env.ENVIRONMENT ?? 'dev'
  const frontEndRoot = process.cwd()
  // config/*.env.json lives at repo root (one level up from TTLeaguePlayersApp.FrontEnd)
  const configPath = path.resolve(frontEndRoot, '..', 'config', `${environment}.env.json`)

  try {
    const json = fs.readFileSync(configPath, 'utf8')
    const parsed: unknown = JSON.parse(json)
    return parsed as Record<string, unknown>
  } catch (e) {
    // Fail fast: environment is declared to be build-time.
    throw new Error(`Failed to read build-time config at ${configPath}: ${String(e)}`)
  }
}

const appConfig = loadBuildTimeConfig()

// Fixed version, maintained by hand in package.json.
const appVersion = (JSON.parse(
  fs.readFileSync(path.resolve(process.cwd(), 'package.json'), 'utf8')
) as { version: string }).version

// Build stamp: UTC build date (e.g. 14-Aug-2026) plus seconds elapsed since that day's
// midnight UTC (e.g. 56460), which increases at every build within the day.
const buildDateTime = new Date()
const buildDate = buildDateTime.toLocaleDateString('en-GB', {
  timeZone: 'UTC', day: '2-digit', month: 'short', year: 'numeric',
}).replace(/ /g, '-')
const buildSecondsOfDay =
  buildDateTime.getUTCHours() * 3600 +
  buildDateTime.getUTCMinutes() * 60 +
  buildDateTime.getUTCSeconds()

// https://vite.dev/config/
export default defineConfig({
  plugins: [react({
    babel: {
      plugins: [["babel-plugin-react-compiler", { target: "18" }]],
    },
  })],
  define: {
    // Expose ENVIRONMENT and config to the browser at build time.
    'import.meta.env.ENVIRONMENT': JSON.stringify(process.env.ENVIRONMENT ?? 'dev'),
    'import.meta.env.APP_CONFIG': JSON.stringify(appConfig),

    // App version and build stamp, shown on the About & Contact Us page.
    'import.meta.env.APP_VERSION': JSON.stringify(appVersion),
    'import.meta.env.APP_BUILD_DATE': JSON.stringify(buildDate),
    'import.meta.env.APP_BUILD_SECONDS': JSON.stringify(String(buildSecondsOfDay)),

    // Fix for amazon-cognito-identity-js global object requirement
    global: 'globalThis'
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './test/setup.ts',
    include: ['test/unit/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    exclude: ['test/e2e/**', 'node_modules/**', 'dist/**'],
  },
})
