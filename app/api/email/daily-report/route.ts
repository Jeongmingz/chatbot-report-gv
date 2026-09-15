import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { sendDailyReportEmail, type EmailReportData } from "@/lib/email-service";
import type {
  ReportRow,
  FaqSummaryRow,
  UnmatchedQueryRow,
  ImprovementQueueRow,
  ChannelFriendSummaryRow,
} from "@/lib/report";

export const dynamic = "force-dynamic";

/**
 * Handle Vercel Cron GET request or manual trigger
 */
export async function GET(request: Request) {
  return handleReportEmail(request);
}

/**
 * Handle Dashboard UI POST request for immediate email dispatch
 */
export async function POST(request: Request) {
  return handleReportEmail(request);
}

async function handleReportEmail(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const client = createSupabaseServerClient();

    // Check optional overrides
    const recipientOverride = searchParams.get("to") || undefined;
    const brand = searchParams.get("brand") || undefined;

    // 1. Fetch Daily Summary
    let dailyQuery = client.from("faq_history_daily_summary").select("*").order("report_date", { ascending: false }).limit(14);
    if (brand) dailyQuery = dailyQuery.eq("brand", brand);
    const { data: dailyData, error: dailyError } = await dailyQuery;
    if (dailyError) throw new Error(`Daily query error: ${dailyError.message}`);

    // 2. Fetch FAQ Summary (TOP 10)
    let faqQuery = client.from("faq_history_faq_summary").select("*").order("hit_count", { ascending: false }).limit(10);
    if (brand) faqQuery = faqQuery.eq("brand", brand);
    const { data: faqData, error: faqError } = await faqQuery;
    if (faqError) throw new Error(`FAQ query error: ${faqError.message}`);

    // 3. Fetch Unmatched Queries (TOP 10)
    let unmatchedQuery = client.from("faq_history_unmatched_queries").select("*").order("query_count", { ascending: false }).limit(10);
    if (brand) unmatchedQuery = unmatchedQuery.eq("brand", brand);
    const { data: unmatchedData, error: unmatchedError } = await unmatchedQuery;
    if (unmatchedError) throw new Error(`Unmatched query error: ${unmatchedError.message}`);

    // 4. Fetch Improvement Queue
    let improvementQuery = client.from("faq_history_improvement_queue").select("*").order("query_count", { ascending: false }).limit(10);
    if (brand) improvementQuery = improvementQuery.eq("brand", brand);
    const { data: improvementData } = await improvementQuery;

    // 5. Fetch Channel Friend Summary
    let channelQuery = client.from("faq_history_channel_friend_summary").select("*");
    if (brand) channelQuery = channelQuery.eq("brand", brand);
    const { data: channelData } = await channelQuery;

    const reportData: EmailReportData = {
      daily: (dailyData || []) as ReportRow[],
      faqSummary: (faqData || []) as FaqSummaryRow[],
      unmatchedQueries: (unmatchedData || []) as UnmatchedQueryRow[],
      improvementQueue: (improvementData || []) as ImprovementQueueRow[],
      channelFriendSummary: (channelData || []) as ChannelFriendSummaryRow[],
      filters: {
        brandLabel: brand || "전체 브랜드 (통합)",
      },
    };

    const result = await sendDailyReportEmail(reportData, recipientOverride);

    return NextResponse.json({
      success: true,
      message: `이메일 리포트가 성공적으로 발송되었습니다. (${result.recipient})`,
      messageId: result.messageId,
      recipient: result.recipient,
    });
  } catch (error) {
    console.error("Email report dispatch error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "이메일 발송 중 알 수 없는 오류가 발생했습니다.",
      },
      { status: 500 },
    );
  }
}
