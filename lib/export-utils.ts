import { supportMenuLabel, type UnmatchedQueryRow, type ImprovementQueueRow } from "@/lib/report";

export type CsvFilterMeta = {
  brandLabel?: string;
  from?: string;
  to?: string;
};

/**
 * Download unmatched queries as Excel-compatible CSV with UTF-8 BOM.
 * Includes dedicated CS ticketing workflow columns for the support team.
 */
export function downloadUnmatchedCsv(
  rows: UnmatchedQueryRow[] | ImprovementQueueRow[],
  meta: CsvFilterMeta = {},
) {
  if (!rows || rows.length === 0) {
    throw new Error("다운로드할 미매칭 질문 데이터가 없습니다.");
  }

  const today = new Date().toISOString().slice(0, 10);
  const brandClean = (meta.brandLabel || "전체브랜드").replace(/[^a-zA-Z0-9가-힣]/g, "_");
  const filename = `[게이트비전CS팀]_챗봇_미매칭질문_${brandClean}_${today}.csv`;

  const headers = [
    "브랜드",
    "문의메뉴",
    "고객 질문 (원문)",
    "발생 횟수",
    "최근 7일 발생건수",
    "최근 30일 발생건수",
    "인입 사용자수",
    "최근 발생일시",
    "CS 분류 (제품/배송/AS/단순문의)",
    "처리 담당자",
    "조치 방안 (신규FAQ등록/상담원안내/오탈자/시스템오류)",
    "답변 초안",
    "처리 상태 (대기/작성중/완료)",
  ];

  const csvRows: string[][] = [headers];

  rows.forEach((row) => {
    const isImprovement = "result_type" in row;
    const queryCount = row.query_count || 0;
    const q7d = "query_count_7d" in row ? (row as UnmatchedQueryRow).query_count_7d ?? "-" : "-";
    const q30d = "query_count_30d" in row ? (row as UnmatchedQueryRow).query_count_30d ?? "-" : "-";
    const users = row.unique_user_count || 0;
    const occurredAt = row.last_occurred_at ? row.last_occurred_at.slice(0, 19).replace("T", " ") : "-";
    const menu = supportMenuLabel(row.menu_id);

    csvRows.push([
      escapeCsv(row.brand_name || "-"),
      escapeCsv(menu),
      escapeCsv(row.sample_query || "-"),
      String(queryCount),
      String(q7d),
      String(q30d),
      String(users),
      escapeCsv(occurredAt),
      "", // CS 분류 (CS팀 실무 입력용 빈칸)
      "", // 처리 담당자
      isImprovement && (row as ImprovementQueueRow).result_type === "low_confidence" ? "저신뢰도-유사어보강" : "", // 조치 방안
      "", // 답변 초안
      "대기", // 처리 상태
    ]);
  });

  // Prepend UTF-8 BOM (\uFEFF) so Microsoft Excel opens Korean characters correctly
  const csvContent = "\uFEFF" + csvRows.map((r) => r.join(",")).join("\r\n");
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);

  const link = document.createElement("a");
  link.setAttribute("href", url);
  link.setAttribute("download", filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Copy formatted TOP unmatched queries text for messenger (Teams, Slack, Kakao, Jandi)
 */
export async function copyUnmatchedSummaryText(
  rows: UnmatchedQueryRow[] | ImprovementQueueRow[],
  meta: CsvFilterMeta = {},
): Promise<string> {
  if (!rows || rows.length === 0) {
    throw new Error("공유할 미매칭 질문 데이터가 없습니다.");
  }

  const today = new Date().toISOString().slice(0, 10);
  const brandName = meta.brandLabel || "전체 브랜드";
  const period = meta.from && meta.to ? `${meta.from} ~ ${meta.to}` : "최근 조회 기준";
  const topRows = rows.slice(0, 8);

  const lines = [
    `📢 [게이트비전 CS팀 공유] 챗봇 미매칭 & 주요 낙오 질문 리포트 (${today})`,
    `• 대상 브랜드: ${brandName}`,
    `• 분석 기간: ${period}`,
    `• 총 미매칭 질문: ${rows.length}종 / 누적 ${rows.reduce((sum, r) => sum + (r.query_count || 0), 0)}건`,
    "",
    "⚠️ CS팀 주목! 우선 보강이 필요한 미매칭 질문 TOP 8:",
  ];

  topRows.forEach((r, idx) => {
    const menu = supportMenuLabel(r.menu_id);
    lines.push(
      `${idx + 1}. [${r.brand_name} / ${menu}] "${r.sample_query}" (${r.query_count}회 발생, 사용자 ${r.unique_user_count}명)`,
    );
  });

  lines.push("");
  lines.push("💡 조치 권고:");
  lines.push("- 위 질문들은 고객이 반복 문의하였으나 챗봇이 대응하지 못한 항목입니다.");
  lines.push("- 신규 FAQ 등록 또는 기존 답변 키워드(유사어) 보강을 권장합니다.");
  lines.push("👉 대시보드 상세 보기: https://chatbot-report-gv.vercel.app");

  const fullText = lines.join("\n");
  await navigator.clipboard.writeText(fullText);
  return fullText;
}

/**
 * Copy a single query text to clipboard
 */
export async function copySingleQueryText(query: string): Promise<void> {
  if (!query) return;
  await navigator.clipboard.writeText(query);
}

function escapeCsv(str: string): string {
  if (!str) return '""';
  if (str.includes(",") || str.includes('"') || str.includes("\n") || str.includes("\r")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}
