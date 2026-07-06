import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import {
  DepositSummarySchema,
  DepositTimeseriesSchema,
  DepositComparisonSchema,
  DepositUserLookupSchema,
  DepositFunnelSchema,
  TopDepositorsSchema,
  DepositMethodBreakdownSchema,
  DepositDetailSchema,
  DepositListSchema,
  NewVsReturningDepositorsSchema,
  DepositsBySegmentSchema,
} from './schemas';
import {
  getDepositSummary,
  getDepositTimeseries,
  getDepositComparison,
  getDepositsByUser,
  getDepositFunnel,
  getTopDepositors,
  getDepositMethodBreakdown,
  getDepositDetail,
  getDepositList,
  getNewVsReturningDepositors,
  getDepositsBySegment,
} from './queries';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyShape = Record<string, any>;

function errorText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export function registerDepositTools(server: McpServer): void {

  // -------------------------------------------------------------------------
  // 1. Summary — total counts, amounts, grouped by status/currency/method
  // Use for: "how many deposits today", "total revenue this month",
  //          "breakdown by currency", "how much was paid vs failed"
  // -------------------------------------------------------------------------
  server.registerTool(
    'get_deposit_summary',
    {
      description:
        'Get aggregated deposit counts and amounts for any time period. ' +
        'Supports preset periods (today, this_month, last_quarter, last_year, etc.) ' +
        'AND custom date ranges (from_date + to_date). ' +
        'Results are grouped by status and currency by default, or by deposit_method, source, or account_id. ' +
        'Use this for questions about totals, revenue, counts, breakdowns, and volume — ' +
        'including per-account breakdowns (pair group_by="account_id" with a date range and limit). ' +
        'No row limit — all data is aggregated at the database level.',
      inputSchema: DepositSummarySchema.shape as AnyShape,
    },
    async (input: unknown) => {
      try {
        const parsed = DepositSummarySchema.parse(input);
        const result = await getDepositSummary(parsed);
        return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
      } catch (err) {
        return { content: [{ type: 'text' as const, text: `Error: ${errorText(err)}` }], isError: true };
      }
    },
  );

  // -------------------------------------------------------------------------
  // 2. Time-series — deposit volume over time broken into buckets
  // Use for: "show deposits per day this week", "monthly trend this year",
  //          "which day had the most deposits", "hourly breakdown for today"
  // -------------------------------------------------------------------------
  server.registerTool(
    'get_deposit_timeseries',
    {
      description:
        'Get deposit volume broken down over time (hourly, daily, weekly, or monthly buckets). ' +
        'Supports all preset periods and custom date ranges. ' +
        'Use this for trend questions, charts, peak-day analysis, growth tracking, ' +
        'and any question that asks "per day", "per week", "over time", "trend", or "chart". ' +
        'No row limit — returns one aggregated row per time bucket.',
      inputSchema: DepositTimeseriesSchema.shape as AnyShape,
    },
    async (input: unknown) => {
      try {
        const parsed = DepositTimeseriesSchema.parse(input);
        const result = await getDepositTimeseries(parsed);
        return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
      } catch (err) {
        return { content: [{ type: 'text' as const, text: `Error: ${errorText(err)}` }], isError: true };
      }
    },
  );

  // -------------------------------------------------------------------------
  // 3. Comparison — period A vs period B, growth rates, MoM, YoY
  // Use for: "compare this month vs last month", "how did May compare to April",
  //          "YoY growth", "is revenue up or down vs last quarter"
  // -------------------------------------------------------------------------
  server.registerTool(
    'get_deposit_comparison',
    {
      description:
        'Compare deposits between two time periods and calculate growth rates. ' +
        'Supports preset period names (this_month vs last_month) ' +
        'AND explicit date ranges (2025-05-01 to 2025-05-31 vs 2025-04-01 to 2025-04-30). ' +
        'Returns counts, amounts, and percentage change for both periods. ' +
        'Use this for questions with "vs", "compare", "growth", "increase/decrease", ' +
        '"month over month", "year over year", "is X better than Y".',
      inputSchema: DepositComparisonSchema.shape as AnyShape,
    },
    async (input: unknown) => {
      try {
        const parsed = DepositComparisonSchema.parse(input);
        const result = await getDepositComparison(parsed);
        return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
      } catch (err) {
        return { content: [{ type: 'text' as const, text: `Error: ${errorText(err)}` }], isError: true };
      }
    },
  );

  // -------------------------------------------------------------------------
  // 4. User deposit lookup — all deposits for a specific player
  // Use for: "show deposits for user X", "how much has player Y deposited",
  //          "deposit history for account Z", lookup by email or username
  // -------------------------------------------------------------------------
  server.registerTool(
    'get_deposits_by_user',
    {
      description:
        'Fetch all deposits for a specific player. Accepts any one of: account_id, user_id, email, or username — ' +
        'the system resolves whichever you provide to the correct account automatically. ' +
        'Paginated so all records are always available regardless of volume. ' +
        'Returns individual deposit records with amounts, status, method, and timestamps, ' +
        'plus total count and total amount for the player. ' +
        'Use this for player-specific questions, support lookups, VIP analysis, ' +
        'and any question that mentions a specific player by name, email, user ID, or account ID.',
      inputSchema: DepositUserLookupSchema.innerType().shape as AnyShape,
    },
    async (input: unknown) => {
      try {
        const parsed = DepositUserLookupSchema.parse(input);
        const result = await getDepositsByUser(parsed);
        return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
      } catch (err) {
        return { content: [{ type: 'text' as const, text: `Error: ${errorText(err)}` }], isError: true };
      }
    },
  );

  // -------------------------------------------------------------------------
  // 5. Funnel / conversion — success vs failure rates
  // Use for: "what is the deposit success rate", "how many deposits failed",
  //          "conversion rate", "drop-off", "failure rate by method"
  // -------------------------------------------------------------------------
  server.registerTool(
    'get_deposit_funnel',
    {
      description:
        'Get deposit conversion and failure rates for any time period. ' +
        'Returns total initiated deposits, success rate, failure rate, pending rate, ' +
        'and a full breakdown by status with percentages. ' +
        'Supports filtering by payment method to see funnel for a specific method. ' +
        'Use this for questions about success rate, failure rate, conversion, ' +
        'drop-off, pending deposits, and payment reliability.',
      inputSchema: DepositFunnelSchema.shape as AnyShape,
    },
    async (input: unknown) => {
      try {
        const parsed = DepositFunnelSchema.parse(input);
        const result = await getDepositFunnel(parsed);
        return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
      } catch (err) {
        return { content: [{ type: 'text' as const, text: `Error: ${errorText(err)}` }], isError: true };
      }
    },
  );

  // -------------------------------------------------------------------------
  // 6. Top depositors — biggest players by deposit volume
  // Use for: "who are the top depositors", "biggest players this month",
  //          "VIP identification", "top 10 by amount"
  // -------------------------------------------------------------------------
  server.registerTool(
    'get_top_depositors',
    {
      description:
        'Get the top depositors ranked by total deposit amount for any time period. ' +
        'Returns account IDs, deposit count, and total amount for each top depositor. ' +
        'Use this for VIP identification, whale tracking, leaderboards, ' +
        'and any question about biggest/highest/most active depositors.',
      inputSchema: TopDepositorsSchema.shape as AnyShape,
    },
    async (input: unknown) => {
      try {
        const parsed = TopDepositorsSchema.parse(input);
        const result = await getTopDepositors(parsed);
        return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
      } catch (err) {
        return { content: [{ type: 'text' as const, text: `Error: ${errorText(err)}` }], isError: true };
      }
    },
  );

  // -------------------------------------------------------------------------
  // 7. Payment method breakdown — which methods are used most
  // Use for: "which payment method is most popular", "crypto vs card deposits",
  //          "revenue by payment method", "method performance"
  // -------------------------------------------------------------------------
  server.registerTool(
    'get_deposit_method_breakdown',
    {
      description:
        'Get deposit counts, amounts, and market share broken down by payment method. ' +
        'Shows which payment methods players use most and their revenue contribution. ' +
        'Supports all time periods and custom date ranges. ' +
        'Use this for questions about payment methods, crypto vs fiat, ' +
        'which method is most popular, and payment method performance.',
      inputSchema: DepositMethodBreakdownSchema.shape as AnyShape,
    },
    async (input: unknown) => {
      try {
        const parsed = DepositMethodBreakdownSchema.parse(input);
        const result = await getDepositMethodBreakdown(parsed);
        return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
      } catch (err) {
        return { content: [{ type: 'text' as const, text: `Error: ${errorText(err)}` }], isError: true };
      }
    },
  );

  // -------------------------------------------------------------------------
  // 8. Single deposit detail — look up one specific deposit
  // Use for: "find deposit ABC123", "what is the status of transaction XYZ",
  //          "details of this specific deposit"
  // -------------------------------------------------------------------------
  server.registerTool(
    'get_deposit_detail',
    {
      description:
        'Look up a single specific deposit by its internal deposit ID or external source/transaction ID. ' +
        'Returns all fields including amounts, status, method, timestamps, and exchange rate. ' +
        'Use this when you have a specific deposit ID or transaction ID to look up.',
      inputSchema: DepositDetailSchema.innerType().shape as AnyShape,
    },
    async (input: unknown) => {
      try {
        const parsed = DepositDetailSchema.parse(input);
        const result = await getDepositDetail(parsed);
        return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
      } catch (err) {
        return { content: [{ type: 'text' as const, text: `Error: ${errorText(err)}` }], isError: true };
      }
    },
  );

  // -------------------------------------------------------------------------
  // 9. Generic filtered deposit list — no account required
  // Use for: "all deposits over $1000 today", "all expired lightning deposits
  //          this week", "who deposited $100+ in lightning today"
  // -------------------------------------------------------------------------
  server.registerTool(
    'get_deposit_list',
    {
      description:
        'List individual deposits matching filters, without needing a specific account. ' +
        'Filter by amount range (min_amount/max_amount), status, deposit_method, target_currency, and date range. ' +
        'Paginated so results are never silently truncated. ' +
        'Use this for questions like "show all deposits over $1000 today", ' +
        '"all expired lightning deposits this week", or "who deposited $100+ in lightning today".',
      inputSchema: DepositListSchema.innerType().shape as AnyShape,
    },
    async (input: unknown) => {
      try {
        const parsed = DepositListSchema.parse(input);
        const result = await getDepositList(parsed);
        return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
      } catch (err) {
        return { content: [{ type: 'text' as const, text: `Error: ${errorText(err)}` }], isError: true };
      }
    },
  );

  // -------------------------------------------------------------------------
  // 10. New vs returning depositors
  // Use for: "how many first-time depositors today vs repeat depositors",
  //          "new depositor revenue vs returning depositor revenue"
  // -------------------------------------------------------------------------
  server.registerTool(
    'get_new_vs_returning_depositors',
    {
      description:
        'Split depositors in a time period into new (first-ever deposit falls in this period) vs returning. ' +
        'Returns depositor counts, deposit counts, and total amounts for each group. ' +
        'Use this for questions about first-time depositors, repeat depositors, ' +
        'new vs returning revenue, and depositor retention.',
      inputSchema: NewVsReturningDepositorsSchema.shape as AnyShape,
    },
    async (input: unknown) => {
      try {
        const parsed = NewVsReturningDepositorsSchema.parse(input);
        const result = await getNewVsReturningDepositors(parsed);
        return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
      } catch (err) {
        return { content: [{ type: 'text' as const, text: `Error: ${errorText(err)}` }], isError: true };
      }
    },
  );

  // -------------------------------------------------------------------------
  // 11. Depositors by player segment (country / signup cohort)
  // Use for: "deposits from users who signed up this week", "deposit revenue
  //          by country", "deposits from players registered in the last 30 days"
  // -------------------------------------------------------------------------
  server.registerTool(
    'get_deposits_by_segment',
    {
      description:
        'Break down deposit revenue by player segment: country or signup cohort (week/month). ' +
        'Joins deposits to player account data. Optionally restrict to players who signed up ' +
        'within a specific date range via signup_from_date/signup_to_date. ' +
        'Use this for questions like "deposits from users who signed up this week", ' +
        '"deposit revenue by country", or "deposits from players registered in the last 30 days".',
      inputSchema: DepositsBySegmentSchema.shape as AnyShape,
    },
    async (input: unknown) => {
      try {
        const parsed = DepositsBySegmentSchema.parse(input);
        const result = await getDepositsBySegment(parsed);
        return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
      } catch (err) {
        return { content: [{ type: 'text' as const, text: `Error: ${errorText(err)}` }], isError: true };
      }
    },
  );
}
