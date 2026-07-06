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

  target_currency_in: z
    .array(z.string())
    .min(1)
    .optional()
    .describe(
      "Filter by multiple target currencies at once (e.g. ['SATS', 'USDT']). " +
      "Use this instead of target_currency for 'X or Y currency' questions. " +
      "Ignored if target_currency is also set.",
    ),

  status: z
    .enum(["pending", "completed", "failed", "cancelled", "expired", "paid"])
    .optional()
    .describe("Filter by a specific deposit status. Omit to include all statuses."),

  status_in: z
    .array(z.enum(["pending", "completed", "failed", "cancelled", "expired", "paid"]))
    .min(1)
    .optional()
    .describe(
      "Filter by multiple statuses at once (e.g. ['pending', 'failed']). " +
      "Use this instead of status for 'X or Y status' questions. " +
      "Ignored if status is also set.",
    ),

  deposit_method: z
    .string()
    .optional()
    .describe("Filter by payment method (e.g. lightning, solana, onchain). Omit for all methods."),

  group_by: z
    .enum(["status", "target_currency", "status_and_target_currency", "deposit_method", "source", "account_id"])
    .optional()
    .default("status_and_target_currency")
    .describe(
      "How to break down the aggregation. " +
      "'status_and_target_currency' (default) groups by both. " +
      "'deposit_method' groups by payment method. " +
      "'source' groups by deposit source/provider. " +
      "'account_id' groups by player account — use with a date range and prefer a narrow window, " +
      "since this can return one row per depositing account.",
    ),

  limit: z
    .number().int().min(1).max(500).optional()
    .describe(
      "Max number of breakdown rows to return, ordered by amount desc. " +
      "Only meaningful with group_by='account_id' (which can otherwise return one row per account). " +
      "Ignored for other group_by values.",
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

  deposit_method_a: z
    .string()
    .optional()
    .describe(
      "Filter period A by payment method (e.g. lightning, solana, onchain). " +
      "Set this and deposit_method_b to different methods over the SAME period " +
      "to compare cohorts, e.g. 'lightning vs onchain this month'.",
    ),

  deposit_method_b: z
    .string()
    .optional()
    .describe("Filter period B by payment method (e.g. lightning, solana, onchain)."),
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

  deposit_method: z
    .string()
    .optional()
    .describe(
      "Filter by payment method (e.g. lightning, solana, onchain). " +
      "Use this for questions like 'top depositors who used lightning'.",
    ),

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

// ---------------------------------------------------------------------------
// Tool 9: Generic filtered deposit list — no account required
// Answers: "all deposits over $1000 today", "all expired lightning deposits
//          this week", "who deposited $100+ in lightning today"
// Paginated — never silently truncates
// ---------------------------------------------------------------------------
export const DepositListSchema = DateRangeSchema.extend({
  target_currency: z
    .string()
    .optional()
    .describe("Filter by target currency (e.g. SATS, USDT, USDC)."),

  status: z
    .enum(["pending", "completed", "failed", "cancelled", "expired", "paid"])
    .optional()
    .describe("Filter by deposit status."),

  deposit_method: z
    .string()
    .optional()
    .describe("Filter by payment method (e.g. lightning, solana, onchain)."),

  min_amount: z
    .number()
    .nonnegative()
    .optional()
    .describe("Only include deposits with amount >= this value (source currency amount)."),

  max_amount: z
    .number()
    .nonnegative()
    .optional()
    .describe("Only include deposits with amount <= this value (source currency amount)."),

  page: z
    .number().int().min(1).optional().default(1)
    .describe("Page number (default 1)."),

  page_size: z
    .number().int().min(1).max(100).optional().default(50)
    .describe("Records per page, max 100."),
}).refine(
  (v) => v.min_amount === undefined || v.max_amount === undefined || v.min_amount <= v.max_amount,
  { message: "min_amount must be less than or equal to max_amount." },
);

// ---------------------------------------------------------------------------
// Tool 10: New vs returning depositors
// Answers: "how many first-time depositors today vs repeat depositors",
//          new depositor revenue vs returning depositor revenue
// A depositor counts as "new" if their earliest deposit (any status) falls
// inside the requested period; otherwise they are "returning".
// ---------------------------------------------------------------------------
export const NewVsReturningDepositorsSchema = DateRangeSchema.extend({
  target_currency: z
    .string()
    .optional()
    .describe("Filter by target currency (e.g. SATS, USDT, USDC)."),

  status: z
    .enum(["pending", "completed", "failed", "cancelled", "expired", "paid"])
    .optional()
    .describe("Filter by status. Usually 'paid' or 'completed' for real revenue."),

  deposit_method: z
    .string()
    .optional()
    .describe("Filter by payment method (e.g. lightning, solana, onchain)."),
});

// ---------------------------------------------------------------------------
// Tool 11: Depositors by player segment (country / signup cohort)
// Answers: "deposits from users who signed up this week", "deposit revenue
//          by country", "deposits from players registered in the last 30 days"
// Joins Deposit -> tbl_accounts -> tbl_user (account_id -> user_id).
// Note: 'country' groups by the raw tbl_user.country_id — there is no
// countries lookup table in this database, so segments are numeric IDs,
// not country names.
// ---------------------------------------------------------------------------
export const DepositsBySegmentSchema = DateRangeSchema.extend({
  target_currency: z
    .string()
    .optional()
    .describe("Filter by target currency (e.g. SATS, USDT, USDC)."),

  status: z
    .enum(["pending", "completed", "failed", "cancelled", "expired", "paid"])
    .optional()
    .describe("Filter by status. Usually 'paid' or 'completed' for real revenue."),

  deposit_method: z
    .string()
    .optional()
    .describe("Filter by payment method (e.g. lightning, solana, onchain)."),

  segment_by: z
    .enum(["country", "signup_week", "signup_month"])
    .describe(
      "How to segment depositors. " +
      "'country' groups by the player's tbl_user.country_id (a numeric ID — there is no " +
      "countries lookup table, so this returns raw IDs, not country names). " +
      "'signup_week'/'signup_month' groups by the ISO week or calendar month the player registered in.",
    ),

  signup_from_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
    .describe(
      "Only include players who signed up on/after this date (YYYY-MM-DD). " +
      "Use this for 'players who signed up this week/month' style questions.",
    ),

  signup_to_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
    .describe("Only include players who signed up on/before this date (YYYY-MM-DD)."),
});

// Exported types
export type DepositSummaryInput              = z.infer<typeof DepositSummarySchema>;
export type DepositTimeseriesInput           = z.infer<typeof DepositTimeseriesSchema>;
export type DepositComparisonInput           = z.infer<typeof DepositComparisonSchema>;
export type DepositUserLookupInput           = z.infer<typeof DepositUserLookupSchema>;
export type DepositFunnelInput               = z.infer<typeof DepositFunnelSchema>;
export type TopDepositorsInput               = z.infer<typeof TopDepositorsSchema>;
export type DepositMethodBreakdownInput      = z.infer<typeof DepositMethodBreakdownSchema>;
export type DepositDetailInput               = z.infer<typeof DepositDetailSchema>;
export type DepositListInput                 = z.infer<typeof DepositListSchema>;
export type NewVsReturningDepositorsInput    = z.infer<typeof NewVsReturningDepositorsSchema>;
export type DepositsBySegmentInput           = z.infer<typeof DepositsBySegmentSchema>;
