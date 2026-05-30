# BazaarLens Web

shadcn/ui + Vite React console for BazaarLens.

```bash
pnpm --filter @bazaarlens/web dev
pnpm --filter @bazaarlens/web build
pnpm --filter @bazaarlens/web typecheck
```

The web build reads `VITE_API_URL` as a build-time fallback. In Docker, public runtime config is generated at startup into `/bazaarlens-config.js` from:

- `BAZAARLENS_API_URL`
- `BAZAARLENS_GOOGLE_CLIENT_ID`

These values are public browser config only. Keep API keys and OAuth secrets on the API side.
