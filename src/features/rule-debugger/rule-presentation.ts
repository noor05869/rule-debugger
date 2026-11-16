/** Short UI labels; source names/severity/action still come from example_rules.json. */
export const RULE_PRESENTATION = [
  {
    name: "High value",
    label: "Amount threshold",
  },
  {
    name: "Small & frequent",
    label: "Maximum small amount",
  },
  {
    name: "Unusual type",
    label: "Channel rarity cutoff",
  },
  { name: "Risk watchlist", label: "Watchlist" },
  {
    name: "Cross-border",
    label: "Significant amount",
  },
  {
    name: "Outside hours",
    label: "Business hours start",
  },
  {
    name: "Cash withdrawal",
    label: "Withdrawal threshold",
  },
] as const;
