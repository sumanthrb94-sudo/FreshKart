# Test Files

Playwright E2E tests and Vitest unit tests live here (outside the Next.js build scope).

## Run Tests

```bash
# E2E tests
npx playwright test -c tests/playwright.config.ts

# Unit tests
npx vitest run src/lib/__tests__
```
