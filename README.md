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
  new aircraft is delivered — purchase price ($880,000, what bop Aero paid; fixed),
  loan and insurance (carrying cost), and the bop Aero SR22T Leasing Program terms
  on this aircraft ($5,208/month incl. 14 hours, $372 additional hour, $410 hourly).
  **Internal economics**: shown in the costing editor only. The document names the
  bridge aircraft and its equipment, never its costs.

## Changing costing — the costing editor

**https://bopaero-admin.compilotrc.workers.dev/sr22t/** — the same private editor
(and Cloudflare Access login) as the SF50; its Worker (`bopaero-admin`) lives in
bopaero/programs `admin/worker.js`, and this repo's editor page is `admin/editor.html`
(bundled into that Worker). Publishing commits `data/costing.json` here; the
**Publish** workflow builds the 5-page PDF and deploys site + PDF together.

## Market check

`.github/workflows/market-check.yml` (daily) estimates the bridge aircraft's
current market value from the median asking price of comparable Cirrus-listed
aircraft. **Information only** — shown in the editor beside the purchase price;
it proposes nothing and opens no issue (the purchase price never follows the market).
The new SR22T G7+ price is not checked automatically (Cirrus's public page does
not show the G7+ GTS list price) — update it from the Cirrus price list.

## Expo 1-pager

`expo.html` → `bop-Aero-SR22T-Expo-1-Pager.pdf` (one Letter page for events and expos), rebuilt from
Raymond's Pages 1-pager on 2026-10-10. Program figures come from the costing like
the document; operating-cost estimates and aircraft specifications are wording in
`expo.html`. The Publish workflow builds it with the document (fails unless exactly
1 page with the version stamp) and archives `versions/<version>-expo.pdf`.

## Financial Detail Sheet

`financial.html` → `bop-Aero-SR22T-Financial-Detail-Sheet.pdf` (2 pages), rebuilt
from Raymond's Pages sheet (Rev_8) on 2026-10-13. Option 1 (new aircraft, bridge
pre-pay) comes from the G7+ program; Option 2 (bridge post-pay) from the costing's
`bridge` block: purchase price, tax, acquisitionCosts, engineReserve and
annualProgramTotal (all shares), divided by the program's shares — the balance
due at the new-aircraft purchase is the G7+ share price minus the post-pay
investment. Founder's Circle fee = the G7+ Founder premium. Footnote wording and
the fuel/pilot estimates are edited in `financial.html`. Archived per version as
`versions/<version>-financial.pdf`.
