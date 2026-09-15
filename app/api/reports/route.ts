import { NextRequest, NextResponse } from "next/server";
import { parseReportRows } from "@/lib/report";
import { createSupabaseServerClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

const TABLES = {
  history: process.env.SUPABASE_HISTORY_TABLE || "faq_history",
  daily: process.env.SUPABASE_DAILY_SUMMARY_VIEW || "faq_history_daily_summary",
  faq: process.env.SUPABASE_FAQ_SUMMARY_VIEW || "faq_history_faq_summary",
  unmatched: process.env.SUPABASE_UNMATCHED_QUERIES_VIEW || "faq_history_unmatched_queries",
  improvement: process.env.SUPABASE_IMPROVEMENT_QUEUE_VIEW || "faq_history_improvement_queue",
  channelFriend: process.env.SUPABASE_CHANNEL_FRIEND_VIEW || "faq_history_channel_friend_summary",
};

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const from = searchParams.get("from");
    const to = searchParams.get("to");
    const brand = searchParams.get("brand")?.trim();
    const limit = clampLimit(searchParams.get("limit"));
    const supabase = createSupabaseServerClient();

    const [dailyResult, faqResult, unmatchedResult, improvementResult, channelFriendResult, historyResult] =
      await Promise.all([
        queryDaily(supabase, { from, to, brand, limit }),
        queryFaqSummary(supabase, { from, to, brand, limit }),
        queryUnmatched(supabase, { from, to, brand, limit }),
        queryImprovementQueue(supabase, { from, to, brand, limit }),
        queryChannelFriendSummary(supabase, { from, to, brand, limit }),
        queryHistory(supabase, { from, to, brand, limit }),
      ]);

    // Daily and history are core tables; fail if they error
    const coreError = [dailyResult.error, historyResult.error].find(Boolean);
    if (coreError) {
      return NextResponse.json({ error: coreError.message }, { status: 500 });
    }

    return NextResponse.json({
      daily: dailyResult.data?.length ? parseReportRows(dailyResult.data) : [],
      faqSummary: faqResult.data || [],
      unmatchedQueries: unmatchedResult.data || [],
      improvementQueue: improvementResult.data || [],
      channelFriendSummary: channelFriendResult.data || [],
      history: historyResult.data || [],
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "히스토리 데이터를 불러오는 중 오류가 발생했습니다." },
      { status: 500 },
    );
  }
}

type QueryOptions = {
  from: string | null;
  to: string | null;
  brand?: string;
  limit: number;
};

type SupabaseClient = ReturnType<typeof createSupabaseServerClient>;

function queryDaily(supabase: SupabaseClient, options: QueryOptions) {
  let query = supabase
    .from(TABLES.daily)
    .select("report_date, brand, brand_name, total_count, matched_count, unmatched_count, match_rate, unique_user_count, avg_score")
    .order("report_date", { ascending: false })
    .order("brand", { ascending: true })
    .limit(options.limit);

  if (options.from) query = query.gte("report_date", options.from);
  if (options.to) query = query.lte("report_date", options.to);
  if (options.brand) query = query.eq("brand", options.brand);
  return query;
}

function queryFaqSummary(supabase: SupabaseClient, options: QueryOptions) {
  let query = supabase
    .from(TABLES.faq)
    .select("brand, brand_name, category_id, category_name, faq_id, faq_question, answer_type, selected_model, hit_count, unique_user_count, avg_score, first_occurred_at, last_occurred_at")
    .order("hit_count", { ascending: false })
    .order("last_occurred_at", { ascending: false })
    .limit(options.limit);

  if (options.from) query = query.gte("last_occurred_at", `${options.from}T00:00:00`);
  if (options.to) query = query.lte("last_occurred_at", `${options.to}T23:59:59`);
  if (options.brand) query = query.eq("brand", options.brand);
  return query;
}

function queryUnmatched(supabase: SupabaseClient, options: QueryOptions) {
  let query = supabase
    .from(TABLES.unmatched)
    .select("brand, brand_name, menu_id, product_family_id, query_key, sample_query, query_count, query_count_7d, query_count_30d, unique_user_count, avg_score, first_occurred_at, last_occurred_at")
    .order("query_count", { ascending: false })
    .order("last_occurred_at", { ascending: false })
    .limit(options.limit);

  if (options.from) query = query.gte("last_occurred_at", `${options.from}T00:00:00`);
  if (options.to) query = query.lte("last_occurred_at", `${options.to}T23:59:59`);
  if (options.brand) query = query.eq("brand", options.brand);
  return query;
}

function queryImprovementQueue(supabase: SupabaseClient, options: QueryOptions) {
  let query = supabase
    .from(TABLES.improvement)
    .select("brand, brand_name, menu_id, result_type, query_key, sample_query, query_count, unique_user_count, avg_score, last_occurred_at")
    .order("query_count", { ascending: false })
    .order("last_occurred_at", { ascending: false })
    .limit(options.limit);

  if (options.from) query = query.gte("last_occurred_at", `${options.from}T00:00:00`);
  if (options.to) query = query.lte("last_occurred_at", `${options.to}T23:59:59`);
  if (options.brand) query = query.eq("brand", options.brand);
  return query;
}

function queryChannelFriendSummary(supabase: SupabaseClient, options: QueryOptions) {
  let query = supabase
    .from(TABLES.channelFriend)
    .select("brand, brand_name, channel_friend_status, total_requests, unique_users, matched_requests, unmatched_requests, match_rate_pct, avg_score, first_occurred_at, last_occurred_at")
    .order("total_requests", { ascending: false });

  if (options.brand) query = query.eq("brand", options.brand);
  return query;
}

function queryHistory(supabase: SupabaseClient, options: QueryOptions) {
  let query = supabase
    .from(TABLES.history)
    .select("id, occurred_at, brand, brand_name, source, user_id, query, matched, score, faq_id, faq_question, category_name, answer_type, selected_model, metadata")
    .order("occurred_at", { ascending: false })
    .limit(options.limit);

  if (options.from) query = query.gte("occurred_at", `${options.from}T00:00:00`);
  if (options.to) query = query.lte("occurred_at", `${options.to}T23:59:59`);
  if (options.brand) query = query.eq("brand", options.brand);
  return query;
}

function clampLimit(value: string | null) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 100;
  return Math.max(1, Math.min(Math.floor(parsed), 500));
}

