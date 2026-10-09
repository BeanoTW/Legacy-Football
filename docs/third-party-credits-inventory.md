# Legacy Football third-party credits and licence inventory

This file tracks third-party software, fonts, assets and services that need
licence/attribution review before stable release.

It is an inventory/checklist, not the final player-facing Credits page.

## Runtime libraries

The application currently declares runtime dependencies including:

- React / React DOM
- TanStack Router / Query / Start
- Supabase JavaScript
- Radix UI component packages
- Tailwind CSS
- Lucide React
- Recharts
- date-fns
- Embla Carousel
- react-hook-form
- react-day-picker
- react-resizable-panels
- sonner
- vaul
- cmdk
- clsx
- class-variance-authority
- tailwind-merge
- zod

Before stable release:
- generate a complete dependency + transitive licence report from the locked
  dependency graph;
- verify all licences permit the intended distribution/use;
- preserve required copyright/licence notices;
- identify any dependency whose licence changed between locked versions.

Do not rely on this hand-written list as the complete licence report.

## Build/development tooling

Developer/build dependencies include:
- Vite;
- TypeScript;
- ESLint and plugins;
- Prettier;
- Bun-facing tooling/workflows;
- Lovable Vite/TanStack configuration;
- fake-indexeddb;
- Nitro.

Most build-only dependencies will not require prominent player-facing credit,
but their licences must still be respected where distribution obligations apply.

## Icons

Lucide icons are used throughout the interface.

Before release:
- verify the locked Lucide licence;
- include its required notice if applicable.

## Fonts

Remote Google Fonts currently requested:
- Barlow Condensed;
- Instrument Serif;
- Inter;
- JetBrains Mono;
- Work Sans.

Before release:
- verify the exact font licences;
- determine whether attribution/notice is required;
- decide whether fonts remain served by Google or are self-hosted;
- do not redistribute font files without confirming permitted distribution.

## Generated / custom visual assets

Audit these separately:
- Legacy Football app icon and maskable icon;
- splash artwork;
- stadium artwork;
- club badges / generated crest elements;
- player portrait/hair assets;
- match-viewer visual assets;
- any uploaded reference imagery used during design.

For each asset record:
- creator/source;
- licence/ownership basis;
- whether modified;
- attribution requirement;
- whether commercial use is permitted.

Do not assume that an asset is cleared merely because it exists in the repo.

## Football names and branding

The game intentionally uses fictional/parody club and player identities rather
than presenting itself as officially licensed.

Before stable release review:
- club names that are intentionally close to real clubs;
- badge/kit shapes and colours;
- competition naming;
- sponsor-style marks;
- player names and likenesses.

The Credits/Terms should make clear that Legacy Football is not endorsed by or
affiliated with real football clubs, leagues, governing bodies or players unless
such a licence is actually obtained.

## Services

Potential credits/legal disclosures:
- Supabase — authentication and optional cloud saves.
- Google Fonts — remote font delivery if retained.
- Production hosting/CDN provider.
- Lovable — development tooling; determine whether player-facing attribution is
  required by the applicable product/licence terms.

## Final credits release gate

Before 1.0:

- [ ] Generate locked dependency licence report.
- [ ] Resolve every unknown/non-standard licence.
- [ ] Include required open-source notices.
- [ ] Audit all fonts.
- [ ] Audit all image/audio/icon assets.
- [ ] Audit fictional/parody football branding.
- [ ] Record production service providers.
- [ ] Produce player-facing Credits / Open Source Notices surface.
- [ ] Have Privacy/Terms wording reviewed against the deployed product.
