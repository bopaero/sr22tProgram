# bop Aero — 2026 SR22T G7+ Ownership Program

Live (unlisted): https://sr22tprogram.bopaero.com (custom domain + HTTPS since
2026-10-04; bopaero.github.io/sr22tProgram redirects here).

Set up 2026-10-04 the same way as the SF50 program (`bopaero/sf50Program`):

**Costing has one source of truth: `data/costing.json`.** Every figure in the
document and the bopaero.com SR22T calculator comes from it, through one
implementation of the math, `assets/costing.js`. `index.html` holds only the
document's wording and layout. Raymond's Numbers spreadsheet ("BopAero Ownership
Program Costing Sheets") stays his independent working reference.

Initial figures: the 2026 SR22T G7+ Ownership Pricing Overview, 15-share column
(CSV export 2026-09-21) — $100,956 per share, $33,976 Annual Program Fee,
matching the live calculator.

## What is in the costing

- One program, `G7+`: new Cirrus SR22T G7+ GTS (Cirrus base + options), 15 shares
  + 1 bop Aero interest, 96 flying hours per share per year, Starlink connectivity
  cost, 7.8% Ohio use tax, closing/registration/LLC setup, management, fixed costs,
  Future Value Reserve, sales commission rate (0% for now; never its own line in
  anything a customer sees — folded into the acquisition / closing line).
- `bridge`: the pre-owned bridge aircraft (2022 SR22T G6 GTS) owners fly until the
  new aircraft is delivered — value, loan and insurance (carrying cost), dry-lease
  rates and average hours. **Internal economics**: shown in the costing editor
  only. The document names the bridge aircraft and its equipment, never its costs.

## Changing costing — the costing editor

**https://sf50-costing.compilotrc.workers.dev/sr22t** — the same private editor
(and Cloudflare Access login) as the SF50; its Worker lives in
`sf50Program/admin/worker.js`, and this repo's editor page is `admin/editor.html`
(bundled into that Worker). Publishing commits `data/costing.json` here; the
**Publish** workflow builds the 5-page PDF and deploys site + PDF together.

## Market check

`.github/workflows/market-check.yml` (daily) compares the bridge aircraft's value
with the median asking price of comparable Cirrus-listed aircraft and proposes
changes through a `market-check` issue. Closing the issue declines those figures.
The new SR22T G7+ price is not checked automatically (Cirrus's public page does
not show the G7+ GTS list price) — update it from the Cirrus price list.
