# GRACE Trade Ledger

進口・庫存・販售・利益管理系統 — Import / Landed Cost / Inventory / Sales / Profit management
for the three-entity flow **摩囍 (TW) → GRACE (JP) → リープ株式会社 (JP)**.

This is Phase-1 (MVP) of the system described in the architecture document
(published earlier in this conversation as the "GRACE Trade Ledger" artifact).
Every table, calculation and business rule below traces back to that
document's numbered sections (§05, §21, §42 …) — see code comments for the
exact cross-references.

## What's implemented in this MVP

- **Company / Product / Supplier / Customer master data**, with the
  intercompany link (`linkedCompanyId`) that lets 摩囍 and リープ be modeled
  as a supplier row and a customer row *pointing at* their own company
  record, instead of duplicating data across three separate systems (§05.6).
- **Import → Landed Cost**: create an import, add cost items (freight,
  duty, customs clearance, port handling, warehouse handling …), choosing
  the allocation method **per cost item, not hardcoded** — BY_VALUE /
  BY_WEIGHT / BY_QTY / BY_CBM / MANUAL — then finalize to compute landed
  unit cost per product and open the first inventory lot.
- **Inventory**: lot-tracked stock (`inventory_lots`) with expiry-date
  awareness, moving-average cost, FEFO (first-expiry-first-out) picking on
  delivery, low-stock and expiry alerts.
- **Pricing**: markup vs. gross-margin calculation, minimum-margin guard
  (WARNING_ONLY — see Confirmed Business Rules below).
- **Quotation → Sales Order → Delivery → Invoice → Payment**, all sharing
  the same customer/product/cost/transaction rows end to end (§57):
  - Quotations are versioned (`quotation_versions`, `is_current` flag) —
    a quotation is never overwritten, only superseded.
  - Converting a quotation to a sales order carries the line items over
    verbatim; a sales order can also be created directly (skip-quotation
    flow).
  - Delivery performs the actual FEFO stock deduction and, when the buyer
    is a linked intercompany customer (リープ buying from GRACE), **also**
    opens the paired inbound lot on the buyer's own inventory ledger in
    the same call — this is the one place the system intentionally writes
    a second row, because physical stock has to exist on both companies'
    books (§05.6, §37).
  - Invoice bills either the delivered quantity (cost snapshot = landed
    cost at the moment of shipment) or the full sales order for the
    "invoice before delivery" flow.
  - Payment recomputes outstanding amount and invoice status
    (ISSUED → PARTIALLY_PAID → PAID).
  - Guards: an already-invoiced delivery cannot be invoiced a second time
    (409), and a fully-delivered sales order cannot be delivered again
    with zero quantity (400).
- **Dashboard**: this-month import spend, inventory value, sales, gross
  margin %, top-10 inventory by value, 30-day expiry alerts.
- Document numbers (`QT/SO/DO/INV/PAY-YYYY-NNNNN`, `IMP-YYYY-NNNN`) are
  generated atomically per company/type/year so two simultaneous requests
  can never collide.
- **日本語 / 中文 UI toggle** — the switch at the bottom of the sidebar
  changes every screen (nav, labels, buttons, table headers) between
  Japanese and Traditional Chinese instantly, no reload. It defaults to
  日本語. Product names follow the toggle too (`products.name_ja` /
  `products.name_zh`, falling back to `name_local` if a translation
  wasn't entered). Company/customer/supplier names are shown as entered
  in the master data (e.g. リープ株式会社, 摩囍) since those are each
  company's actual registered name, not something to translate.
  Business-document numbers and system error messages are bilingual by
  design already (e.g. the duplicate-invoice guard shows
  "此出貨單已開立請款單 / この出荷はすでに請求済みです" regardless of
  the UI toggle) — see the architecture doc's own bilingual approach.

## Stack

- **DB**: PostgreSQL 16, schema managed with Drizzle ORM (see note below
  on why Drizzle instead of Prisma).
- **API**: Express 5 + TypeScript, `decimal.js` for all monetary math
  (never floating point).
- **Frontend**: React 19 + TypeScript + Vite, no external state library.
- **Tests**: Vitest — 22 unit tests reproducing the architecture doc's
  worked examples exactly (landed cost ¥615/unit, quotation margin 23.1%,
  invoice ¥240,000, outstanding ¥90,000, BY_CBM allocation, etc.)

## Running it

Prerequisites: Node 20+, PostgreSQL running locally.

```bash
# 1. Database
createdb grace_erp
cd server
cp .env.example .env   # edit DATABASE_URL if needed
npm install
npx drizzle-kit migrate

# 2. Seed example data (摩囍/GRACE/リープ, 3 products, one full
#    import → quotation → sales order → delivery → invoice → payment
#    reproducing the architecture doc's worked numbers)
npm run seed

# 3. Start the API (port 4000)
npm run dev

# 4. Frontend (new terminal)
cd ../web
npm install
npm run dev   # http://localhost:5173
```

Run the business-logic test suite any time with `cd server && npm test`.

## What's a placeholder, not a finished feature

- **Authentication.** There is no login. The sidebar's "登入身分 (demo)"
  dropdown just picks which seeded user's ID gets stamped as
  `createdById` on new records — anyone can pick any user. Before this
  goes anywhere near production data it needs real auth and the RBAC
  permission checks the architecture doc's §26 describes (the roles/
  permissions tables exist in the schema; nothing enforces them yet).
- **Re-opening an already-invoiced sales order.** The Sales Order page
  doesn't yet re-fetch an existing invoice when you reselect an order
  you'd already invoiced earlier in a previous session — you'd see the
  "Create Invoice" button disabled correctly, but not the invoice/payment
  detail itself. (`GET /api/deliveries/:id/invoice` would close this gap;
  not built in this pass.)
- **CSV/API integration, audit log UI, full RBAC screens, multi-currency
  rate history UI** — all designed for in the schema/architecture doc but
  out of scope for this MVP pass per the doc's explicit phase-1 cut.

## Confirmed business rules (2026-08-28)

The 5 previously-open questions have been confirmed and are enforced as
actual business logic — not just UI copy — at the code locations noted
below, so inventory, sales, quotation, invoicing and profit calculations
all use one consistent rule. Each was also verified live against the
running system (not just read out of the code) before being written up
here.

1. **Minimum margin guard = `WARNING_ONLY`, permanently.** A below-minimum
   price only shows a warning pill; it never blocks the quotation and
   never requires approval. Enforced in `logic/pricing.ts`
   (`evaluateMinimumMarginGuard`) — `APPROVAL_REQUIRED`/`BLOCKED` exist in
   the enum for a possible future per-product exception, but nothing
   currently turns them on.
2. **Import exchange rate is fixed per import, forever.** Each import
   records its own rate (`imports.exchange_rate`) at creation and it is
   never rewritten by any later action; `amountJpy` is computed from it
   immediately and stored. Re-opening an old import always reconstructs
   exactly the landed cost that was calculated at the time, regardless of
   what today's real FX rate is. Enforced in `routes/imports.ts`.
3. **Intercompany transfers never touch the seller's own moving-average
   cost.** GRACE → リープ is an outbound movement on GRACE's books, and
   outbound movements only reduce quantity — they never blend cost. Live
   -verified: after a GRACE→リープ delivery, GRACE's own weighted-average
   cost was unchanged (still ¥615.00) while quantity dropped by exactly
   the shipped amount. Enforced in `routes/salesOrders.ts` (see the
   comment block above the deliveries handler) via `applyOutbound` in
   `logic/movingAverage.ts`.
4. **Cost allocation method is never hardcoded — chosen per cost item.**
   BY_VALUE / BY_WEIGHT / BY_QTY / BY_CBM / MANUAL are all selectable
   per cost item (warehouse fee → weight, ocean freight → CBM, duty → 依
   申報價值/BY_VALUE, anything else → whatever fits). BY_CBM is new this
   round — see **Schema change** below, since volume didn't previously
   exist anywhere in the data model.
5. **GRACE's Landed Cost and the GRACE→リープ transfer price are two
   separate numbers, never conflated.** リープ's purchase cost is exactly
   the GRACE→リープ Sales Order unit price — not GRACE's landed cost.
   Live-verified: selling PINE-001 to リープ at ¥900 (landed cost ¥615)
   left GRACE's own cost at ¥615, while リープ's own weighted-average
   cost blended the new ¥900 lot with its existing ¥800 lots into
   ¥803.23 — entirely from リープ's own purchase prices, never touching
   GRACE's figure. Enforced structurally: `inventory_lots` is scoped per
   company, so GRACE's and リープ's cost bases are physically separate
   tables of lots, not one shared mutable field.

### Schema change: BY_CBM needed a new field

Confirming rule 4 surfaced one real gap: nothing in the data model held
a volume/CBM figure anywhere (only `products.weight_kg` existed, for
BY_WEIGHT). Rather than block on this, I added `products.volume_cbm`
(m³ per unit) as an **additive** migration, mirroring `weight_kg`
exactly — same table, same "fixed per-product attribute × shipment
quantity = basis" pattern already used for BY_WEIGHT. Flagging it here
per your instruction rather than silently deciding: if CBM should
instead vary shipment-to-shipment (e.g. packed differently each time
rather than a fixed per-unit figure), it would need to move to a
per-import-item field instead — let me know if that's actually how it
works and I'll adjust. There's also no product-management screen yet
(products are only added via the seed script), so real `weight_kg` /
`volume_cbm` values need to come from you until that screen exists.

## What to send me next

To move from the example data (鳳梨酥/PINE-001, 芋圓, 茶葉) to your real
numbers, most useful first:

1. **Real product list** — code, name (ZH/JA), unit, weight, and CBM/m³
   per unit (needed for BY_WEIGHT and BY_CBM cost allocation), default
   supplier.
2. **A real import invoice/packing list** from 摩囍 — the actual cost
   breakdown (freight/duty/clearance/other, and which allocation method
   applies to each) so the allocation rules can be checked against a real
   shipment rather than the doc's example.
3. **Current price list** — what リープ actually pays GRACE per product,
   and target/minimum margins if those differ product-to-product.
