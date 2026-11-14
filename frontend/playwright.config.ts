import { defineConfig, devices } from '@playwright/test'

// End-to-end: the real backend in demo mode (no API key) on a fresh SQLite database, plus the
// Vite dev server. PYTHON can point at a virtualenv's python (default: python on PATH).
const python = process.env.PYTHON ?? 'python'

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  outputDir: './e2e-results',
  use: { baseURL: 'http://localhost:5173', trace: 'off' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 1000 } } }],
  webServer: [
    {
      command: `rm -f e2e.db && ${python} -m scripts.bootstrap && ${python} -m flask --app wsgi run --port 5000`,
      cwd: '../backend',
      url: 'http://localhost:5000/api/health',
      env: {
        DATABASE_URL: 'sqlite:///e2e.db',
        LLM_PROVIDER: 'demo',
        DEMO_STEP_DELAY: '0.2',
        EMBEDDER: 'hashing',
        OPENAI_API_KEY: '',
        GEMINI_API_KEY: '',
      },
      timeout: 120_000,
      reuseExistingServer: false,
    },
    {
      command: 'npm run dev -- --port 5173 --strictPort',
      url: 'http://localhost:5173',
      reuseExistingServer: false,
    },
  ],
})
