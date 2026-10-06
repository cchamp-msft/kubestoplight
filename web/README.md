# kubestoplight web UI

React + TypeScript + Vite SPA, styled with the [Jewel](https://github.com/willchambers/jewel-design-system) design system. The Go binary embeds the
built `dist/` and serves it with `kubestoplight --web`.

| Command | What it does |
|---------|--------------|
| `npm run dev:mock` | Dev server with a fake backend — **no Go or Kubernetes needed** |
| `npm run dev` | Dev server proxying `/api` and `/ws` to a Go server on `:8080` |
| `npm test` | Vitest |
| `npm run lint` | Oxlint |
| `npm run build` | Typecheck + production build into `dist/` |
| `npm run preview:mock` | Serve the production build with the fake backend |
| `npm run screenshots` | Regenerate `../docs/screenshots/*.png` from mock mode (needs Google Chrome) |

Mock scenarios (`MOCK_SCENARIO=mixed|healthy|failing|empty|large`) and the
rest of the details are in [`../AGENTS.md`](../AGENTS.md).
