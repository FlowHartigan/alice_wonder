import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'tests',
  testMatch: '*.e2e.ts',
  ...(process.env.CI ? {
    forbidOnly: true,
    reporter: [['github'], ['list'], ['html', { open: 'never' }]],
    use: { trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  } : {}),
});
