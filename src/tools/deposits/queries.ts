import { Prisma } from "@prisma/client";
import { prismaClient } from "../../db/prisma";
import { DateRange } from "./schemas";
import type {
  DepositSummaryInput,
  DepositTimeseriesInput,
  DepositComparisonInput,
  DepositUserLookupInput,
  DepositFunnelInput,
  TopDepositorsInput,
  DepositMethodBreakdownInput,
  DepositDetailInput,
} from "./schemas";

const ORG_ID = process.env.ORGANIZATION_ID!;

// ---------------------------------------------------------------------------
// Date resolution — converts any period keyword or from/to strings into a
// { from: Date, to: Date } pair. All times are UTC.
// to_date is end-of-day inclusive (23:59:59.999).
// ---------------------------------------------------------------------------
export function resolveDateRange(range: DateRange): { from: Date | null; to: Date | null } {
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  const d = now.getUTCDate();

  const dayStart = (year: number, month: number, day: number) =>
    new Date(Date.UTC(year, month, day, 0, 0, 0, 0));
  const dayEnd = (year: number, month: number, day: number) =>
    new Date(Date.UTC(year, month, day, 23, 59, 59, 999));

  // Quarter helpers
  const quarterStart = (year: number, q: number) => dayStart(year, q * 3, 1);
  const quarterEnd = (year: number, q: number) =>
    dayEnd(year, q * 3 + 2, new Date(Date.UTC(year, q * 3 + 3, 0)).getUTCDate());

  const currentQuarter = Math.floor(m / 3);

  if (range.period) {
    switch (range.period) {
      case "today":
        return { from: dayStart(y, m, d), to: now };

      case "yesterday":
        return { from: dayStart(y, m, d - 1), to: dayEnd(y, m, d - 1) };

      case "this_week": {
        const dayOfWeek = now.getUTCDay();
        const monday = d - (dayOfWeek === 0 ? 6 : dayOfWeek - 1);
        return { from: dayStart(y, m, monday), to: now };
      }

      case "last_week": {
        const dayOfWeek = now.getUTCDay();
        const thisMonday = d - (dayOfWeek === 0 ? 6 : dayOfWeek - 1);
        const lastMonday = thisMonday - 7;
        const lastSunday = thisMonday - 1;
        return {
          from: dayStart(y, m, lastMonday),
          to: dayEnd(y, m, lastSunday),
        };
      }

      case "this_month":
        return { from: dayStart(y, m, 1), to: now };

      case "last_month": {
        const lastMonth = m === 0 ? 11 : m - 1;
        const lastMonthYear = m === 0 ? y - 1 : y;
        const lastDayOfLastMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
        return {
          from: dayStart(lastMonthYear, lastMonth, 1),
          to: dayEnd(lastMonthYear, lastMonth, lastDayOfLastMonth),
        };
      }

      case "last_7_days":
        return { from: dayStart(y, m, d - 7), to: now };

      case "last_30_days":
        return { from: dayStart(y, m, d - 30), to: now };

      case "last_60_days":
        return { from: dayStart(y, m, d - 60), to: now };

      case "last_90_days":
        return { from: dayStart(y, m, d - 90), to: now };

      case "last_two_month":
        return { from: dayStart(y, m - 2, 1), to: now };

      case "last_three_month":
        return { from: dayStart(y, m - 3, 1), to: now };

      case "this_quarter":
        return { from: quarterStart(y, currentQuarter), to: now };

      case "last_quarter": {
        const lq = currentQuarter === 0 ? 3 : currentQuarter - 1;
        const lqYear = currentQuarter === 0 ? y - 1 : y;
        return { from: quarterStart(lqYear, lq), to: quarterEnd(lqYear, lq) };
      }

      case "this_year":
        return { from: dayStart(y, 0, 1), to: now };

      case "last_year":
        return {
          from: dayStart(y - 1, 0, 1),
          to: dayEnd(y - 1, 11, 31),
        };
    }
  }

  // Explicit from_date / to_date
  if (range.from_date || range.to_date) {
    const from = range.from_date
      ? new Date(`${range.from_date}T00:00:00.000Z`)
      : null;
    // to_date is end-of-day inclusive
    const to = range.to_date
      ? new Date(`${range.to_date}T23:59:59.999Z`)
      : now;
    return { from, to };
  }

  // No range specified — all-time
  return { from: null, to: null };
}

function buildDateWhere(from: Date | null, to: Date | null): Record<string, unknown> {
  if (!from && !to) return {};
  const filter: Record<string, Date> = {};
  if (from) filter.gte = from;
  if (to)   filter.lte = to;
  return { created_at: filter };
}

function decimalToString(val: unknown): string {
  if (val === null || val === undefined) return "0";
  return String(val);
}

// ---------------------------------------------------------------------------
// Query 1: Aggregated summary (no row limit — pure DB aggregation)
// ---------------------------------------------------------------------------
export async function getDepositSummary(input: DepositSummaryInput) {
  const { from, to } = resolveDateRange(input);
  const dateWhere = buildDateWhere(from, to);

  const baseWhere: Record<string, unknown> = {
    organization_id: ORG_ID,
    ...dateWhere,
  };
  if (input.currency) baseWhere.currency = input.currency;
  if (input.status)   baseWhere.status   = input.status;

  const groupBy =
    input.group_by === "deposit_method" ? ["deposit_method"] :
    input.group_by === "source"         ? ["source"] :
    input.group_by === "status"         ? ["status"] :
    input.group_by === "currency"       ? ["currency"] :
    ["status", "currency"];

  const [rows, totalCount] = await Promise.all([
    prismaClient.deposit.groupBy({
      by: groupBy as any,
      where: baseWhere,
      _count: { id: true },
      _sum: { amount: true, amount_paid: true },
      orderBy: { _sum: { amount: "desc" } },
    }),
    prismaClient.deposit.count({ where: baseWhere }),
  ]);

  const totalAmount = rows.reduce(
    (acc, r) => acc + parseFloat(decimalToString(r._sum.amount)),
    0,
  );

  return {
    period_from: from?.toISOString() ?? "all-time",
    period_to:   to?.toISOString()   ?? "all-time",
    total_count:  totalCount,
    total_amount: totalAmount.toFixed(4),
    breakdown: rows.map((r: any) => ({
      ...Object.fromEntries(
        groupBy.map((k) => [k, r[k] ?? "null"]),
      ),
      count:        r._count.id,
      amount:       decimalToString(r._sum.amount),
      amount_paid:  decimalToString(r._sum.amount_paid),
    })),
  };
}

// ---------------------------------------------------------------------------
// Query 2: Time-series (no row limit — one aggregated row per time bucket)
// ---------------------------------------------------------------------------
export async function getDepositTimeseries(input: DepositTimeseriesInput) {
  const { from, to } = resolveDateRange(input);
  const dateWhere = buildDateWhere(from, to);

  const where: Record<string, unknown> = {
    organization_id: ORG_ID,
    ...dateWhere,
  };
  if (input.currency) where.currency = input.currency;
  if (input.status)   where.status   = input.status;

  // Use raw SQL for time bucketing — Prisma groupBy does not support date_trunc.
  // Prisma.raw() injects the granularity as a SQL literal (required by date_trunc).
  // Prisma.sql`` fragments compose safely without nested $queryRaw calls.
  const gran = input.granularity ?? "day";
  const truncFn =
    gran === "hour"  ? "hour"  :
    gran === "week"  ? "week"  :
    gran === "month" ? "month" : "day";

  const dateFilter =
    from && to ? Prisma.sql`AND created_at >= ${from} AND created_at <= ${to}` :
    from       ? Prisma.sql`AND created_at >= ${from}` :
    to         ? Prisma.sql`AND created_at <= ${to}` :
                 Prisma.sql``;
  const currencyFilter = input.currency ? Prisma.sql`AND currency = ${input.currency}` : Prisma.sql``;
  const statusFilter   = input.status   ? Prisma.sql`AND status   = ${input.status}`   : Prisma.sql``;

  const rows = await prismaClient.$queryRaw<Array<{ bucket: Date; count: bigint; total: string }>>`
    SELECT
      date_trunc(${Prisma.raw(truncFn)}, created_at AT TIME ZONE 'UTC') AS bucket,
      COUNT(id)::bigint                                                   AS count,
      COALESCE(SUM(amount), 0)::text                                      AS total
    FROM tbl_deposits
    WHERE organization_id = ${ORG_ID}
    ${dateFilter}
    ${currencyFilter}
    ${statusFilter}
    GROUP BY bucket
    ORDER BY bucket ASC
  `;

  return {
    granularity: gran,
    period_from: from?.toISOString() ?? "all-time",
    period_to:   to?.toISOString()   ?? "all-time",
    data_points: rows.length,
    series: rows.map((r) => ({
      bucket: r.bucket.toISOString(),
      count:  Number(r.count),
      total:  r.total,
    })),
  };
}

// ---------------------------------------------------------------------------
// Query 3: Period vs period comparison
// ---------------------------------------------------------------------------
async function summarizeForComparison(where: Record<string, unknown>) {
  const [rows, agg] = await Promise.all([
    prismaClient.deposit.groupBy({
      by: ["status"],
      where,
      _count: { id: true },
      _sum: { amount: true },
    }),
    // Let the DB sum amounts to avoid float precision loss from accumulating JS numbers
    prismaClient.deposit.aggregate({ where, _count: { id: true }, _sum: { amount: true } }),
  ]);

  const byStatus: Record<string, { count: number; amount: string }> = {};
  for (const r of rows) {
    byStatus[r.status] = {
      count:  r._count.id,
      amount: decimalToString(r._sum.amount),
    };
  }
  return {
    total_count:  agg._count.id,
    total_amount: decimalToString(agg._sum.amount),
    by_status:    byStatus,
  };
}

export async function getDepositComparison(input: DepositComparisonInput) {
  const resolveHalf = (
    period: string | undefined,
    from: string | undefined,
    to: string | undefined,
  ) => {
    if (period) return resolveDateRange({ period: period as any });
    if (from || to) return resolveDateRange({ from_date: from, to_date: to });
    return { from: null, to: null };
  };

  const rangeA = resolveHalf(input.period_a, input.from_a, input.to_a);
  const rangeB = resolveHalf(input.period_b, input.from_b, input.to_b);

  const makeWhere = (range: { from: Date | null; to: Date | null }) => {
    const w: Record<string, unknown> = { organization_id: ORG_ID, ...buildDateWhere(range.from, range.to) };
    if (input.currency) w.currency = input.currency;
    return w;
  };

  const [a, b] = await Promise.all([
    summarizeForComparison(makeWhere(rangeA)),
    summarizeForComparison(makeWhere(rangeB)),
  ]);

  const countChange  = a.total_count > 0 ? (((b.total_count - a.total_count) / a.total_count) * 100).toFixed(1) : null;
  const amountChange = parseFloat(a.total_amount) > 0
    ? (((parseFloat(b.total_amount) - parseFloat(a.total_amount)) / parseFloat(a.total_amount)) * 100).toFixed(1)
    : null;

  return {
    period_a: {
      from: rangeA.from?.toISOString() ?? "all-time",
      to:   rangeA.to?.toISOString()   ?? "all-time",
      ...a,
    },
    period_b: {
      from: rangeB.from?.toISOString() ?? "all-time",
      to:   rangeB.to?.toISOString()   ?? "all-time",
      ...b,
    },
    change: {
      count_diff:   b.total_count - a.total_count,
      count_pct:    countChange  !== null ? `${countChange}%`  : "N/A",
      amount_diff:  (parseFloat(b.total_amount) - parseFloat(a.total_amount)).toFixed(4),
      amount_pct:   amountChange !== null ? `${amountChange}%` : "N/A",
    },
  };
}

// ---------------------------------------------------------------------------
// Helper: resolve any player identifier → account_id
// Accepts account_id (direct), user_id, email, or username.
// Returns { account_id, resolved_via } or throws if not found.
// ---------------------------------------------------------------------------
async function resolveAccountId(input: {
  account_id?: string;
  user_id?: string;
  email?: string;
  username?: string;
}): Promise<{ account_id: string; resolved_via: string }> {
  // Fastest path — account_id supplied directly
  if (input.account_id) {
    return { account_id: input.account_id, resolved_via: "account_id" };
  }

  // Look up the user record by user_id, email, or username
  const userWhere: Record<string, unknown> = {};
  let resolved_via = "";

  if (input.user_id) {
    userWhere.id = input.user_id;
    resolved_via = "user_id";
  } else if (input.email) {
    userWhere.email = input.email;
    resolved_via = "email";
  } else if (input.username) {
    userWhere.username = input.username;
    resolved_via = "username";
  } else {
    throw new Error(
      "Provide at least one of: account_id, user_id, email, or username.",
    );
  }

  const user = await prismaClient.tbl_user.findFirst({
    where: userWhere,
    select: { id: true },
  });

  if (!user) {
    const value =
      resolved_via === "user_id"  ? input.user_id  :
      resolved_via === "email"    ? input.email    :
      input.username;
    throw new Error(`No user found with ${resolved_via} = "${value}".`);
  }

  // Map user.id → account via tbl_accounts
  const account = await prismaClient.tbl_accounts.findFirst({
    where: { user_id: user.id },
    select: { id: true },
  });

  if (!account) {
    throw new Error(`User found (${resolved_via}) but has no linked account.`);
  }

  return { account_id: account.id, resolved_via };
}

// ---------------------------------------------------------------------------
// Query 4: User deposit lookup (paginated)
// Accepts account_id, user_id, email, or username — resolves automatically
// ---------------------------------------------------------------------------
export async function getDepositsByUser(input: DepositUserLookupInput) {
  const { account_id, resolved_via } = await resolveAccountId(input);

  const where: Record<string, unknown> = {
    organization_id: ORG_ID,
    account_id,
  };
  if (input.status)   where.status   = input.status;
  if (input.currency) where.currency = input.currency;
  if (input.from_date || input.to_date) {
    const from = input.from_date ? new Date(`${input.from_date}T00:00:00.000Z`) : null;
    const to   = input.to_date   ? new Date(`${input.to_date}T23:59:59.999Z`)   : null;
    Object.assign(where, buildDateWhere(from, to));
  }

  const pageSize = input.page_size ?? 50;
  const page     = input.page ?? 1;
  const skip     = (page - 1) * pageSize;

  const [deposits, totalCount] = await Promise.all([
    prismaClient.deposit.findMany({
      where,
      orderBy: { created_at: "desc" },
      skip,
      take: pageSize,
      select: {
        id: true, account_id: true, currency: true, amount: true,
        target_currency: true, target_amount: true, amount_paid: true,
        status: true, deposit_method: true, source: true, source_id: true,
        created_at: true, updated_at: true,
      },
    }),
    prismaClient.deposit.count({ where }),
  ]);

  return {
    resolved_via,
    account_id,
    total_count: totalCount,
    page,
    page_size:   pageSize,
    total_pages: Math.ceil(totalCount / pageSize),
    deposits: deposits.map((d) => ({
      ...d,
      amount:        d.amount.toString(),
      target_amount: d.target_amount.toString(),
      amount_paid:   d.amount_paid?.toString() ?? null,
    })),
  };
}

// ---------------------------------------------------------------------------
// Query 5: Funnel / conversion rates
// ---------------------------------------------------------------------------
export async function getDepositFunnel(input: DepositFunnelInput) {
  const { from, to } = resolveDateRange(input);
  const where: Record<string, unknown> = {
    organization_id: ORG_ID,
    ...buildDateWhere(from, to),
  };
  if (input.currency)       where.currency       = input.currency;
  if (input.deposit_method) where.deposit_method = input.deposit_method;

  const rows = await prismaClient.deposit.groupBy({
    by: ["status"],
    where,
    _count: { id: true },
    _sum:   { amount: true },
  });

  const total = rows.reduce((acc, r) => acc + r._count.id, 0);

  const byStatus = Object.fromEntries(
    rows.map((r) => [
      r.status,
      {
        count:      r._count.id,
        amount:     decimalToString(r._sum.amount),
        percentage: total > 0 ? ((r._count.id / total) * 100).toFixed(1) + "%" : "0%",
      },
    ]),
  );

  const paid    = rows.filter((r) => r.status === "paid" || r.status === "completed")
                      .reduce((acc, r) => acc + r._count.id, 0);
  const failed  = rows.filter((r) => r.status === "failed")
                      .reduce((acc, r) => acc + r._count.id, 0);
  const pending = rows.filter((r) => r.status === "pending")
                      .reduce((acc, r) => acc + r._count.id, 0);

  return {
    period_from:     from?.toISOString() ?? "all-time",
    period_to:       to?.toISOString()   ?? "all-time",
    total_initiated: total,
    success_rate:    total > 0 ? ((paid    / total) * 100).toFixed(1) + "%" : "0%",
    failure_rate:    total > 0 ? ((failed  / total) * 100).toFixed(1) + "%" : "0%",
    pending_rate:    total > 0 ? ((pending / total) * 100).toFixed(1) + "%" : "0%",
    by_status:       byStatus,
  };
}

// ---------------------------------------------------------------------------
// Query 6: Top depositors
// ---------------------------------------------------------------------------
export async function getTopDepositors(input: TopDepositorsInput) {
  const { from, to } = resolveDateRange(input);
  const where: Record<string, unknown> = {
    organization_id: ORG_ID,
    ...buildDateWhere(from, to),
  };
  if (input.currency) where.currency = input.currency;
  if (input.status)   where.status   = input.status;

  const rows = await prismaClient.deposit.groupBy({
    by: ["account_id"],
    where,
    _count: { id: true },
    _sum:   { amount: true },
    orderBy: { _sum: { amount: "desc" } },
    take: input.limit ?? 10,
  });

  return {
    period_from: from?.toISOString() ?? "all-time",
    period_to:   to?.toISOString()   ?? "all-time",
    top_depositors: rows.map((r, i) => ({
      rank:       i + 1,
      account_id: r.account_id,
      count:      r._count.id,
      total:      decimalToString(r._sum.amount),
    })),
  };
}

// ---------------------------------------------------------------------------
// Query 7: Payment method breakdown
// ---------------------------------------------------------------------------
export async function getDepositMethodBreakdown(input: DepositMethodBreakdownInput) {
  const { from, to } = resolveDateRange(input);
  const where: Record<string, unknown> = {
    organization_id: ORG_ID,
    ...buildDateWhere(from, to),
  };
  if (input.currency) where.currency = input.currency;
  if (input.status)   where.status   = input.status;

  const [rows, total] = await Promise.all([
    prismaClient.deposit.groupBy({
      by: ["deposit_method"],
      where,
      _count: { id: true },
      _sum:   { amount: true },
      orderBy: { _sum: { amount: "desc" } },
    }),
    prismaClient.deposit.count({ where }),
  ]);

  return {
    period_from: from?.toISOString() ?? "all-time",
    period_to:   to?.toISOString()   ?? "all-time",
    total_count: total,
    methods: rows.map((r) => ({
      method:     r.deposit_method ?? "unknown",
      count:      r._count.id,
      amount:     decimalToString(r._sum.amount),
      share:      total > 0 ? ((r._count.id / total) * 100).toFixed(1) + "%" : "0%",
    })),
  };
}

// ---------------------------------------------------------------------------
// Query 8: Single deposit detail
// ---------------------------------------------------------------------------
export async function getDepositDetail(input: DepositDetailInput) {
  if (!input.deposit_id && !input.source_id) {
    return { error: "Provide either deposit_id or source_id." };
  }

  const where: Record<string, unknown> = { organization_id: ORG_ID };
  if (input.deposit_id) where.id        = input.deposit_id;
  if (input.source_id)  where.source_id = input.source_id;

  const deposit = await prismaClient.deposit.findFirst({ where });
  if (!deposit) return { error: "Deposit not found." };

  return {
    ...deposit,
    amount:             deposit.amount.toString(),
    target_amount:      deposit.target_amount.toString(),
    amount_paid:        deposit.amount_paid?.toString()        ?? null,
    target_amount_paid: deposit.target_amount_paid?.toString() ?? null,
    exchange_rate:      deposit.exchange_rate.toString(),
  };
}
