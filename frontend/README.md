# STI-OS frontend preview

This is a **read-only client demonstration** of STI-OS. The visible projects, service orders, people, activity, and counts are mock examples. There is no login, live API, database connection, order persistence, signature capture, time tracking, or geolocation. Browsing, filtering, and changing the light/dark theme only affect the current page session. The preview cannot create, edit, move, or invoice orders.

The dashboard and project views show only the client-facing example stages: draft, to do, in progress, and awaiting signature. Billed and cancelled stages are excluded. Each project board and list show only records mapped to that project; projects without examples show an empty view. Unknown project IDs return 404. These display filters are **not access control**; a future backend must enforce authorization.

The current UI is a visual prototype. It does not demonstrate a deployed service, client workflow, or integration with Libertya or SIFEN. Some secondary sections are placeholders with static sample content.

## Run locally

Use Node.js 24, then:

```sh
npm ci
npm run dev
```

Validation: `npm run typecheck` and `npm run lint`. The available build script uses Webpack and prepares standalone static assets.

Selected UI components and the Vercel theme were adapted from [Kiranism/next-shadcn-dashboard-starter](https://github.com/Kiranism/next-shadcn-dashboard-starter), commit `9084ffd954d24591d9b1d279c4b18e119b02b34e`. The upstream MIT license is included in [LICENSE](LICENSE).
