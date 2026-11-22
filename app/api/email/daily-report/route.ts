import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { sendDailyReportEmail } from "@/lib/email-service";
import { reportAccess } from "@/lib/report-access";
import { loadPeriodReport } from "@/lib/report-server";
import { seoulDate, shiftDate } from "@/lib/report-period";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const received = Buffer.from(request.headers.get("authorization") || "");
  const expected = Buffer.from(`Bearer ${secret}`);
  if (!secret || received.length !== expected.length || !timingSafeEqual(received, expected)) {
    return NextResponse.json({ error: "예약 발송 인증이 필요합니다." }, { status: 401 });
  }
  return dispatch(request);
}

export async function POST(request: Request) {
  try {
    const access = await reportAccess(true);
    if (access.denied) return access.denied;
    return dispatch(request);
  } catch {
    return NextResponse.json({ error: "발송 권한을 확인할 수 없습니다." }, { status: 503 });
  }
}

async function dispatch(request: Request) {
  const params = new URL(request.url).searchParams;
  if (params.has("to")) return NextResponse.json({ error: "수신자는 서버 설정에서 관리합니다." }, { status: 400 });
  const day = shiftDate(seoulDate(), -1);
  const brand = params.get("brand")?.trim() || null;
  try {
    const report = await loadPeriodReport(day, day, brand, 10);
    const result = await sendDailyReportEmail({
      ...report, improvementCount: report.activity.improvementCount,
      filters: { from: day, to: day, brandLabel: brand || "전체 브랜드" },
    });
    return NextResponse.json({ success: true, recipient: result.recipient, messageId: result.messageId, reportDate: day });
  } catch (error) {
    console.error("Daily report dispatch failed", error);
    return NextResponse.json({ success: false, error: "일일 리포트 발송에 실패했습니다." }, { status: 500 });
  }
}
