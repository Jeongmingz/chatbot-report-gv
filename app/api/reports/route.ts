import { NextRequest, NextResponse } from "next/server";
import { loadPeriodReport } from "@/lib/report-server";
import { validReportDate } from "@/lib/report-period";
import { reportAccess } from "@/lib/report-access";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const access = await reportAccess();
    if (access.denied) return access.denied;
    const params = request.nextUrl.searchParams;
    const from = params.get("from") || null;
    const to = params.get("to") || null;
    if (!validReportDate(from) || !validReportDate(to) || (from && to && from > to)) {
      return NextResponse.json({ error: "조회 시작일과 종료일을 확인해 주세요." }, { status: 400 });
    }
    const value = Number(params.get("limit") || 100);
    const limit = Number.isFinite(value) ? Math.max(1, Math.min(500, Math.floor(value))) : 100;
    const report = await loadPeriodReport(from, to, params.get("brand")?.trim() || null, limit);
    return NextResponse.json(report, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error("Report lookup failed", error);
    return NextResponse.json({ error: "리포트를 조회할 수 없습니다." }, { status: 500 });
  }
}
