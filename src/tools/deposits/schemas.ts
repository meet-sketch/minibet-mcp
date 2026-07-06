import { z } from "zod";

// ---------------------------------------------------------------------------
// Shared date range — every tool that accepts a time window uses this.
// Claude can either pass a `period` keyword OR explicit from_date/to_date.
// If neither is given, the query covers all-time data.
// ---------------------------------------------------------------------------
export const DateRangeSchema = z.object({
  period: z
    .enum([
      "today",
      "yesterday",
      "this_week",
      "last_week",
      "this_month",
      "last_month",
      "last_7_days",
      "last_30_days",
      "last_60_days",
      "last_90_days",
      "this_quarter",
      "last_quarter",
      "this_year",
      "last_year",
      "last_two_month",
      "last_three_month",
    ])
    .optional()
    .describe(
      "Relative time period. Examples: 'this_month', 'last_quarter', 'last_30_days', 'this_year'. " +
      "Use this for questions like 'this month', 'last 30 days', 'Q1', 'last year'.",
    ),

  from_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
    .describe(
      "Start date (inclusive) in YYYY-MM-DD format UTC. " +
      "Use for explicit ranges like '2025-05-01'. " +
      "If only from_date is given, to_date defaults to today.",
    ),

  to_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
    .describe(
      "End date (inclusive) in YYYY-MM-DD format UTC. " +
      "Use alongside from_date for custom ranges like '2025-05-31'. " +
      "The end date is included in the results (i.e. up to end of that day).",
    ),
});

export type DateRange = z.infer<typeof DateRangeSchema>;

// ---------------------------------------------------------------------------
// Tool 1: Aggregated summary
// Answers: total deposits, revenue, counts grouped by status/target_currency/method
// No row limit — uses COUNT/SUM at DB level
// ---------------------------------------------------------------------------
export const DepositSummarySchema = DateRangeSchema.extend({
  target_currency: z
    .string()
    .optional()
    .describe("Filter by target currency (e.g. SATS, USDT, USDC). Omit for all currencies."),

  status: z
    .enum(["pending", "completed", "failed", "cancelled", "expired", "paid"])
    .optional()
    .describe("Filter by a specific deposit status. Omit to include all statuses."),

  group_by: z
    .enum(["status", "target_currency", "status_and_target_currency", "deposit_method", "source"])
    .optional()
    .default("status_and_target_currency")
    .describe(
      "How to break down the aggregation. " +
      "'status_and_target_currency' (default) groups by both. " +
      "'deposit_method' groups by payment method. " +
      "'source' groups by deposit source/provider.",
    ),
});

// ---------------------------------------------------------------------------
// Tool 2: Time-series trends
// Answers: deposit volume over time, daily/weekly/monthly charts,
//          growth trends, which days had most deposits
// No row limit — returns one aggregated row per time bucket
// ---------------------------------------------------------------------------
export const DepositTimeseriesSchema = DateRangeSchema.extend({
  granularity: z
    .enum(["hour", "day", "week", "month"])
    .optional()
    .default("day")
    .describe(
      "Size of each time bucket. " +
      "Use 'hour' for today/yesterday. " +
      "Use 'day' for week/month ranges. " +
      "Use 'week' or 'month' for quarterly/yearly ranges.",
    ),

  target_currency: z
    .string()
    .optional()
    .describe("Filter by target currency (e.g. SATS, USDT, USDC). Omit to aggregate all."),

  status: z
    .enum(["pending", "completed", "failed", "cancelled", "expired", "paid"])
    .optional()
    .describe("Filter by deposit status. Omit to include all statuses."),
});

// ---------------------------------------------------------------------------
// Tool 3: Period vs period comparison
// Answers: how does this month compare to last month, growth %, YoY comparisons
// ---------------------------------------------------------------------------
export const DepositComparisonSchema = z.object({
  period_a: z
    .enum([
      "today", "yesterday", "this_week", "last_week",
      "this_month", "last_month", "last_7_days", "last_30_days",
      "this_quarter", "last_quarter", "this_year", "last_year",
    ])
    .optional()
    .describe("First period (e.g. 'this_month'). Use this OR from_a/to_a."),
  from_a: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
    .describe("Start date of first period YYYY-MM-DD. Use instead of period_a for custom ranges."),
  to_a: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
    .describe("End date of first period YYYY-MM-DD."),

  period_b: z
    .enum([
      "today", "yesterday", "this_week", "last_week",
      "this_month", "last_month", "last_7_days", "last_30_days",
      "this_quarter", "last_quarter", "this_year", "last_year",
    ])
    .optional()
    .describe("Second period (e.g. 'last_month'). Use this OR from_b/to_b."),
  from_b: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
    .describe("Start date of second period YYYY-MM-DD."),
  to_b: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
    .describe("End date of second period YYYY-MM-DD."),

  target_currency: z
    .string()
    .optional()
    .describe("Filter both periods by target currency (e.g. SATS, USDT, USDC)."),
});

// ---------------------------------------------------------------------------
// Tool 4: User deposit lookup
// Answers: all deposits by a specific player, their deposit history
// Paginated — never silently truncates
// Accepts any one of: account_id, user_id, email, or username
// ---------------------------------------------------------------------------
export const DepositUserLookupSchema = z.object({
  account_id: z
    .string()
    .optional()
    .describe("The internal account ID (UUID). Use this if you have it — it is the fastest lookup."),

  user_id: z
    .string()
    .optional()
    .describe("The user ID (from tbl_user). Will be resolved to an account_id automatically."),

  email: z
    .string()
    .optional()
    .describe("The player's email address. Will be resolved to an account_id automatically."),

  username: z
    .string()
    .optional()
    .describe("The player's username. Will be resolved to an account_id automatically."),

  status: z
    .enum(["pending", "completed", "failed", "cancelled", "expired", "paid"])
    .optional()
    .describe("Filter by deposit status."),

  target_currency: z
    .string()
    .optional()
    .describe("Filter by target currency (e.g. SATS, USDT, USDC)."),

  from_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
    .describe("Start date YYYY-MM-DD."),

  to_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
    .describe("End date YYYY-MM-DD."),

  page: z
    .number().int().min(1).optional().default(1)
    .describe("Page number (default 1)."),

  page_size: z
    .number().int().min(1).max(100).optional().default(50)
    .describe("Records per page, max 100."),
}).refine(
  (v) => v.account_id || v.user_id || v.email || v.username,
  { message: "Provide at least one of: account_id, user_id, email, or username." },
);

// ---------------------------------------------------------------------------
// Tool 5: Deposit funnel / conversion
// Answers: how many deposits complete vs fail, success rate, drop-off
// No row limit — pure aggregation
// ---------------------------------------------------------------------------
export const DepositFunnelSchema = DateRangeSchema.extend({
  target_currency: z
    .string()
    .optional()
    .describe("Filter by target currency (e.g. SATS, USDT, USDC)."),

  deposit_method: z
    .string()
    .optional()
    .describe("Filter by payment method to see funnel for that method only."),
});

// ---------------------------------------------------------------------------
// Tool 6: Top depositors
// Answers: who are the biggest depositors, VIP identification
// ---------------------------------------------------------------------------
export const TopDepositorsSchema = DateRangeSchema.extend({
  target_currency: z
    .string()
    .optional()
    .describe("Filter by target currency (e.g. SATS, USDT, USDC)."),

  status: z
    .enum(["pending", "completed", "failed", "cancelled", "expired", "paid"])
    .optional()
    .describe("Filter by status. Usually 'paid' or 'completed' for real revenue."),

  limit: z
    .number().int().min(1).max(100).optional().default(10)
    .describe("How many top depositors to return (default 10, max 100)."),
});

// ---------------------------------------------------------------------------
// Tool 7: Payment method breakdown
// Answers: which payment methods are most popular, method revenue share
// ---------------------------------------------------------------------------
export const DepositMethodBreakdownSchema = DateRangeSchema.extend({
  target_currency: z
    .string()
    .optional()
    .describe("Filter by target currency (e.g. SATS, USDT, USDC)."),

  status: z
    .enum(["pending", "completed", "failed", "cancelled", "expired", "paid"])
    .optional()
    .describe("Filter by status."),
});

// ---------------------------------------------------------------------------
// Tool 8: Single deposit detail
// Answers: look up one specific deposit by its ID or source transaction ID
// ---------------------------------------------------------------------------
export const DepositDetailSchema = z.object({
  deposit_id: z
    .string()
    .optional()
    .describe("Internal deposit UUID to look up."),

  source_id: z
    .string()
    .optional()
    .describe("External payment provider transaction ID to look up."),
}).refine(
  (v) => v.deposit_id || v.source_id,
  { message: "Provide at least one of: deposit_id or source_id." },
);

// Exported types
export type DepositSummaryInput         = z.infer<typeof DepositSummarySchema>;
export type DepositTimeseriesInput      = z.infer<typeof DepositTimeseriesSchema>;
export type DepositComparisonInput      = z.infer<typeof DepositComparisonSchema>;
export type DepositUserLookupInput      = z.infer<typeof DepositUserLookupSchema>;
export type DepositFunnelInput          = z.infer<typeof DepositFunnelSchema>;
export type TopDepositorsInput          = z.infer<typeof TopDepositorsSchema>;
export type DepositMethodBreakdownInput = z.infer<typeof DepositMethodBreakdownSchema>;
export type DepositDetailInput          = z.infer<typeof DepositDetailSchema>;
