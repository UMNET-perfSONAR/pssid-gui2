# Branding & White-Labeling

pSSID GUI ships as a **single codebase** that can present different brand
identities — product name, color palette, logo glyph, and favicon — selected at
deploy time. There are no forks to maintain: every organization (including
UMich) is just a **brand profile**.

---

## How it works

- Brand profiles live in [`services/client/src/brand/brands.ts`](../services/client/src/brand/brands.ts).
- The active profile is chosen by the **`VITE_BRAND`** environment variable,
  surfaced to Docker Compose as **`BRAND`** in the root `.env`.
- At startup, [`applyBrand()`](../services/client/src/brand/index.ts) writes the
  palette to CSS custom properties on `:root`, sets `document.title`, and swaps
  the favicon. All UI colors derive from those variables, so switching brands
  re-themes the entire app.
- If `VITE_BRAND` is unset or unknown, the app falls back to the neutral
  `default` profile — it always renders with a valid identity.

Two profiles ship today:

| Profile | Identity | Use |
|---|---|---|
| `default` | Deep navy + cyan, "pSSID GUI" | Any organization |
| `umich` | UMich navy `#00274C` + maize `#FFCB05` | University of Michigan |

---

## Switching the active edition

At install time:

```bash
./install.sh --brand=umich     # or --brand=default
```

On a running deployment:

```bash
make brand-umich      # writes BRAND=umich to .env and recreates the client
make brand-default
```

(The client runs the Vite dev server, which reads `VITE_BRAND` at process start,
so recreating the container is enough — no rebuild required.)

---

## Adding a new organization

1. Add an entry to `brands.ts`. Copy an existing profile and adjust. Each color
   has a matching `*Rgb` value (comma-separated channels) so translucent tints
   track the brand:

   ```ts
   acme: {
     id: 'acme',
     productName: 'pSSID GUI · Acme University',
     shortName: 'pSSID',
     emphasis: 'GUI',
     org: 'Acme University',
     tagline: 'Wireless measurement orchestration for Acme.',
     glyph: 'wifi',          // any Material Icons name
     version: 'v2.0',
     colors: {
       primary:     '#1a2b4c',
       primaryDark: '#11203c',
       primaryRgb:  '26,43,76',
       accent:      '#e85d2a',
       accentRgb:   '232,93,42',
       accentText:  '#2a1206',
     },
   },
   ```

2. Deploy with `--brand=acme` (or `make brand-acme` after adding a Makefile alias,
   or set `BRAND=acme` in `.env`).

That's it — no component edits. The palette, navbar text, title, and favicon all
follow the profile.

### Choosing colors

- `primary` is the navbar/header/primary-button color; `primaryDark` is its hover
  shade.
- `accent` highlights the active nav item, brand mark, and warning buttons.
  `accentText` must be readable **on top of** `accent`.
- Keep `*Rgb` in sync with the hex values (they feed `rgba(var(--primary-rgb), …)`
  tints used across the UI).
- Semantic colors (success green, danger red, status badges) are intentionally
  **not** brand-controlled — they stay consistent so status always reads the same.

---

## Documentation per edition

Keep edition-specific deployment notes alongside the brand:

- Generic: [docs/generic/README.md](generic/README.md)
- UMich: [docs/umich/README.md](umich/README.md)

Add `docs/<org>/README.md` for a new organization with its IdP and hostname
specifics.
