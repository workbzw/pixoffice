import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: '.', testMatch: '*.spec.ts', fullyParallel: false, workers: 1, retries: 0,
  timeout: 60000, expect: { timeout: 15000 },
  outputDir: '../artifacts/test-results/integration-e2e',
  reporter: [['list'], ['html', { outputFolder: '../artifacts/integration-e2e-report', open: 'never' }],
    ['json', { outputFile: '../artifacts/test-results/integration-e2e-results.json' }]],
  use: {
    browserName: 'chromium', channel: process.env.PIXOFFICE_E2E_BROWSER_CHANNEL, headless: true, viewport: { width: 1440, height: 1050 }, deviceScaleFactor: 2,
    locale: 'zh-CN', timezoneId: 'Asia/Shanghai',
    screenshot: 'only-on-failure', trace: 'retain-on-failure',
    launchOptions: { args: ['--use-angle=swiftshader', '--enable-webgl', '--enable-unsafe-swiftshader'] },
  },
})
