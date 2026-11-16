# RuleLens — Rule Debugging UI

A transaction workbench for understanding why seven rules fire, clear, or cannot evaluate. It joins the supplied transaction and feature files, shows source-level evidence, and lets you tune assumptions while comparing results with documented defaults.

Built with Next.js 16.4.6, React 19.3, TypeScript, Tailwind CSS 4, Radix Tabs, and a browser Web Worker. Tests use Vitest and Testing Library. The UI follows the pinned [RuleLens reference](docs/design-reference/README.md), including IBM Plex fonts, light/dark themes, and responsive configuration/inspector panels.

## Run locally

Use Node.js **24.x** and npm. Verification used Node 24.18.1 and npm 11.16.0 on Windows. No environment variables, API credentials, database, or sibling assessment directory are required.

```bash
npm ci --no-audit --no-fund
npm run dev
```

Open [localhost:3000](http://localhost:3000). To use another port:

```bash
npm run dev -- --port 3001
```

Install requires npm registry access. The initial production build also downloads IBM Plex through `next/font/google`; built fonts are then served by the app.

For production, stop any server using your chosen port, then:

```bash
npm run build
npm start -- --port 3002
```

Open [localhost:3002](http://localhost:3002). Plain `npm start` uses port 3000 instead. The worker and `/data/` assets are served by the same Next.js app; no separate data server is needed.

## Verify

```bash
npm test
npm run lint
npx next typegen
npx tsc --noEmit
npm run build
```

`next typegen` creates route types and `next-env.d.ts` for a fresh checkout before standalone TypeScript checking. `next dev` and `next build` also generate them. `npm run test:watch` is available while editing.

The suite covers source-file integrity, parsing/validation/joins, evaluator boundaries, real rolling windows, worker messages/lifecycle, filters/pagination, numeric drafts, default/current comparisons, and inspector interactions. Browser checks are described in the [final verification report](docs/reviews/spec-08/README.md); jsdom tests do not claim to execute a real browser worker.

## Provided data

Keep these existing files in `public/data/`:

| File | Role |
|---|---|
| `transactions.json` | Original transaction fields |
| `feature_vectors.json` | Feature records linked by `transaction_id` |
| `example_rules.json` | Rule IDs, names, descriptions, severity, and action metadata |

The supplied corpus has 38,903 transaction/feature pairs and 108 sender baselines. Counts shown by the app are computed, not hardcoded. Source-file hashes are pinned in the integrity test and the files are preserved unchanged.

The transaction/feature inputs contain unquoted `NaN`, so they are not strict JSON. The worker fetches **text**, replaces only bare missing-number tokens with a string-aware scanner, then parses and validates. Quoted merchant text is not globally replaced. Duplicate IDs are rejected; missing feature rows and conflicting shared fields remain explicit. Neither input silently overwrites the other.

## Investigation loop

1. Select a rule in the top strip to inspect or edit its settings.
2. Search transaction ID, sender ID, or merchant; combine verdict and preset filters.
3. Select a row. The inspector shows exact rule comparisons, separate source inputs, and the sender's dataset baseline.
4. Edit a setting or switch to indicative USD. Ordinary selected-record conditions update immediately; corpus counts refresh through the worker.
5. Compare defaults/current results or filter changed verdicts. Reset rules restores configuration without silently clearing search.

The list renders at most 50 rows per page, ordered by source timestamp then transaction ID. A selected transaction remains inspectable when a filter or page hides its row; the inspector labels it outside the visible results. On mobile, Inspect selection reopens that retained record. Sender filtering is visible and removable.

The inspector highlights the highest severity among currently fired rules, using severity from the supplied rule metadata. Its badge identifies a single rule or counts rules at that severity. Clear, data-gap, and pending results do not contribute; this is a rule-severity summary, not a transaction risk score.

Loading placeholders follow actual pending data: table rows during load/filter/page/config queries, inspector evidence when a selected record is unavailable, and rule-count/impact placeholders during evaluation. R2 shows a placeholder while its window context refreshes. Already loaded selections and theme/tab re-renders stay immediate. Placeholders respect reduced motion and stop on errors or empty results.

Verdict filters form separate transaction groups: **Fired** means at least one rule fired; **Data gap** means none fired but at least one has missing evidence; **Clear** means every rule is clear. With Selected rule only enabled, the chosen verdict applies to that rule; All verdicts adds no verdict restriction. Row counts always summarize all rules. The supplied dataset has no fully clear transactions because R7 lacks cash evidence, even if every other rule clears. The Missing inputs preset intentionally finds any gap, including in transactions that also fired.

Keyboard: `/` focuses search from non-editable workbench content; Enter/Space selects a row; Up/Down moves between rows and crosses page boundaries. Escape closes open panels when focus is outside native editable controls. Input/select/tab shortcuts and modified browser shortcuts remain native. On mobile, selecting a row opens the inspector and close/Escape returns focus to its origin.

## Architecture and reading order

```text
page.tsx (server route)
  └─ RuleWorkbench (client state and panels)
      ├─ toolbar / health strip / configuration / table / inspector
      ├─ previewRecord → evaluateRules for one selected record
      └─ useRuleWorker
          └─ data.worker → worker-runtime
              ├─ text fetch → parse/validate → ID join → sender profiles
              ├─ rolling context → pure rule evaluations
              └─ bounded query results + corpus summaries/comparisons
```

Start with these files under `src/features/rule-debugger/`; the [interview walkthrough](docs/interview-walkthrough.md) has the detailed reading order.

| File | Responsibility |
|---|---|
| `data.ts` | Safe text parsing, validation, joins/conflicts, currency-separated sender profiles |
| `rule-config.ts` | Documented defaults and configuration validation |
| `rules.ts` | Seven named pure evaluators returning verdicts and structured evidence |
| `worker-runtime.ts`, `hooks/use-rule-worker.ts` | Dataset processing and React's worker connection |
| `rule-workbench.tsx` | Configuration, selection, filters, page, and panel state |
| `forensic-inspector.tsx`, `rule-trace.tsx` | Display source values and rule evidence |

The two large inputs total about 38 MB. The worker parses and evaluates them outside React's main thread and returns at most 50 rows per page. Configuration changes use a 120ms debounce; request IDs prevent stale responses from replacing current results. The selected transaction uses the same pure evaluator immediately, while R2 shows **Pending context** when its rolling-window inputs change.

## Rule assumptions

The rule file contains metadata, not executable conditions, thresholds, a risk watchlist, FX rates, or timezone configuration. These are explicit assessment interpretations:

| Rule | Default interpretation |
|---|---|
| R1 High value | Comparable amount **> 1,000**; optional same-currency sender-average check is off |
| R2 Small/frequent | Amount **<= 50**, at least **5** small payments in the sender's trailing **60 minutes** |
| R3 Unusual type | Known-type share in the sender snapshot **< 10%** |
| R4 Watchlist | Trimmed, case-insensitive exact merchant **OR** country match; lists start empty |
| R5 Cross-border | Merchant country differs from modal sender country and amount **>= 500** |
| R6 Outside hours | Source hour **< 8 OR >= 20**; weekends off initially |
| R7 Cash withdrawal | Established cash/ATM signal and amount **>= 1,000**; this schema lacks that signal |

- **FIRED**, **CLEAR**, and **DATA_GAP** are distinct. Clear means an evaluated predicate did not match, not that a transaction is safe. Missing required evidence produces a gap even when another required condition fails. R4 evaluates configured list branches only.
- R2 counts a real window, not cumulative `feature_vectors.transaction_count`. It excludes later timestamps, includes the exact lower boundary and all current-time ties, and sorts/groups once per sender when context changes.
- Timestamp arithmetic uses source wall-clock components deterministically. The source timezone is unknown. Feature weekday numbering is Python-style: Monday=0 through Sunday=6.
- Sender profiles describe the complete **dataset snapshot**, not knowledge available before each historical transaction. Modal country is not verified residence. Country ties use ascending country code; missing types are excluded from the share denominator.
- Amount aggregates/averages stay separated by source currency. Optional sender-average comparisons use the same original currency, converted consistently in USD mode.
- All supplied terminal IDs are 0; that does not establish a cash channel. R7 honestly remains a gap instead of inventing 38,903 non-cash decisions.

### Currency and comparison policy

Raw mode intentionally exposes unlike-currency comparisons and labels thresholds as local units. USD mode uses fixed, **illustrative** USD-per-unit rates: PAB=1, USD=1, MXN=1/20, BRL=1/5.7, COP=1/4200, CRC=1/510, GTQ=1/7.7. These are not live market quotes. Unsupported conversion is a data gap; raw amounts/currencies remain visible.

The comparison reference is always documented defaults in **original currency mode**. Current settings may use USD; both modes are labeled. Changed-only counts status changes for the selected rule, including gap→clear/fired transitions, not simply the difference between fired totals.

Number inputs keep a string draft: clearing a field never commits zero. Valid values commit while typing; invalid values preserve the last valid config and reset on blur. Counts/windows must be positive integers, rarity is 0–100%, and business hours require `0 <= start < end <= 24`.

## Demo examples

Start from Reset rules, clear table filters, search the ID, select its row, and choose the corresponding rule:

| Example | Real ID | What to show |
|---|---|---|
| High value | `TXN_00388935` | 2,129.64 USD fires R1 at 1,000 |
| Currency trap | `TXN_00001392` | 218,515 COP fires R1 raw; about 52.03 USD clears it |
| Rare type | `TXN_00000901` | Contactless channel share below 10%; inspect snapshot evidence |
| Missing type | `TXN_00048610` | Null channel gives R3 a gap; inspect raw/features and actual receiver |
| Cross-border | `TXN_00009994` | Merchant BRA vs modal PAN; 3,704.26 BRL still meets R5's minimum after USD conversion |
| Outside hours | `TXN_00000008` | Source feature hour 23 fires R6 |
| Coverage gaps | `TXN_00000008` | Empty R4 watchlist and unavailable R7 cash signal are explicit gaps |

See the [5–7 minute interview walkthrough and change exercises](docs/interview-walkthrough.md), [final verification report](docs/reviews/spec-08/README.md), and [spec-by-spec review notes](docs/reviews/).

## Limits and deliberate scope

- Theme, settings, filters, and selection are in memory and return to deterministic dark/default state on reload; there is no local-storage persistence or hydration-warning suppression.
- Country/currency/channel facets are implemented in the query contract, but extra facet dropdowns were not added to the chosen reference layout. Existing search/verdict/preset/sender controls are functional.
- Risk actions/severity are displayed metadata; the app does not block or execute financial transactions. No auth, database, live feed, risk scoring, or fraud-accuracy claims are included.
- This supplied assessment dataset is served as public assets. The architecture is not a production storage design for private financial records.
- Request freshness prevents stale publication but does not cancel a synchronous evaluation already running inside a worker. One default evaluation and one current evaluation are retained in memory.
- Fonts, optional Clipboard API availability, and browser support depend on the execution environment. Copy failure is reported honestly with a manual-copy fallback.

AI assistance was used for implementation and verification. The named functions, tests, rule assumptions, and review notes are intended to make every major behavior inspectable and explainable during the assessment.
