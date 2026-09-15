import type { jsPDF as JsPdfDocument } from "jspdf";
import {
  supportMenuLabel,
  channelFriendStatusLabel,
  resultTypeLabel,
  type ReportRow,
  type ImprovementQueueRow,
  type ChannelFriendSummaryRow,
} from "@/lib/report";

const PDF_WIDTH_PX = 1040;
const PDF_LANDSCAPE_WIDTH_PX = 1370;
const PDF_PAGE_CONTENT_HEIGHT_PX = 1370;
const PDF_LANDSCAPE_CONTENT_HEIGHT_PX = 900;
const OVERVIEW_RENDER_SCALE = 1.5;
const TABLE_RENDER_SCALE = 1.2;

export type PdfExportOptions = {
  filename: string;
  report?: PdfReportInput;
};

export type PdfReportInput = {
  filters: {
    from: string;
    to: string;
    brandLabel: string;
    limit: string;
  };
  daily: ReportRow[];
  faqSummary: PdfFaqSummaryRow[];
  unmatchedQueries: PdfUnmatchedQueryRow[];
  improvementQueue?: ImprovementQueueRow[];
  channelFriendSummary?: ChannelFriendSummaryRow[];
  history: PdfHistoryRow[];
};

export type PdfFaqSummaryRow = {
  brand_name: string;
  category_name: string | null;
  faq_question: string | null;
  hit_count: number;
  unique_user_count: number;
  avg_score: number | null;
  last_occurred_at: string | null;
};

export type PdfUnmatchedQueryRow = {
  brand_name: string;
  menu_id?: string | null;
  sample_query: string;
  query_count: number;
  query_count_7d?: number;
  query_count_30d?: number;
  unique_user_count: number;
  last_occurred_at: string | null;
};

export type PdfHistoryRow = {
  occurred_at: string;
  brand_name: string;
  query: string;
  matched: boolean;
  score: number;
  faq_question: string | null;
  category_name: string | null;
  metadata?: Record<string, unknown>;
};

export async function exportDashboardPdf(source: HTMLElement, options: PdfExportOptions) {
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([import("html2canvas"), import("jspdf")]);
  const previousScroll = { x: window.scrollX, y: window.scrollY };
  const previousSourceDisplay = source.style.display;
  const activeElement = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const stage = document.createElement("div");
  stage.className = "pdf-stage";

  try {
    document.body.classList.add("pdf-exporting");
    window.scrollTo(0, 0);
    document.body.appendChild(stage);
    activeElement?.blur();
    await waitForDocumentFonts();
    await nextPaint();

    const pages = options.report ? buildReportPdfPages(options.report, stage) : buildPdfPages(source, stage);
    if (pages.length === 0) throw new Error("PDF로 내보낼 내용이 없습니다.");

    if (!options.report) copyChartCanvases(source, pages[0]);
    await nextPaint();
    source.style.display = "none";

    const pdf = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait", compress: true });

    for (let index = 0; index < pages.length; index += 1) {
      pages.forEach((page, pageIndex) => {
        page.style.display = pageIndex === index ? "block" : "none";
      });

      const canvas = await html2canvas(pages[index], {
        scale: pages[index].classList.contains("pdf-page--table") ? TABLE_RENDER_SCALE : OVERVIEW_RENDER_SCALE,
        useCORS: true,
        logging: false,
        backgroundColor: "#ffffff",
        windowWidth: pages[index].offsetWidth,
        windowHeight: pages[index].scrollHeight,
        height: pages[index].scrollHeight,
        scrollX: 0,
        scrollY: 0,
      });

      if (index > 0) {
        pdf.addPage("a4", pages[index].classList.contains("pdf-page--landscape") ? "landscape" : "portrait");
      }
      addCanvasPage(pdf, canvas, index + 1, pages.length);
    }

    pdf.save(options.filename);
  } finally {
    source.style.display = previousSourceDisplay;
    stage.remove();
    document.body.classList.remove("pdf-exporting");
    window.scrollTo(previousScroll.x, previousScroll.y);
  }
}

function buildReportPdfPages(report: PdfReportInput, stage: HTMLElement) {
  const metrics = summarizeReport(report);
  const insights = buildReportInsights(report, metrics);
  const pages = [
    createReportPage("요약", report, (page) => renderExecutiveSummary(page, report, metrics, insights)),
    createReportPage("일별 추세", report, (page) => renderDailyTrend(page, report, metrics)),
    createReportPage("FAQ 성과", report, (page) => renderFaqPerformance(page, report)),
    createReportPage("개선 대기열", report, (page) => renderImprovementQueue(page, report, insights)),
    createReportPage("채널 친구 분석", report, (page) => renderChannelFriendSummary(page, report, metrics)),
    createReportPage("근거 데이터", report, (page) => renderAppendix(page, report)),
  ];

  pages.forEach((page) => stage.appendChild(page));
  return pages;
}

function createReportPage(title: string, report: PdfReportInput, render: (page: HTMLElement) => void) {
  const page = document.createElement("section");
  page.className = "pdf-page pdf-report-page";
  page.appendChild(
    el("header", "pdf-report-page__header", [
      el("div", "", [el("p", "pdf-report-kicker", ["Kakao Chatbot Operations Report"]), el("h1", "", [title])]),
      el("div", "pdf-report-filter", [
        el("strong", "", [report.filters.brandLabel || "전체 브랜드"]),
        el("span", "", [`${report.filters.from || "전체"} ~ ${report.filters.to || "전체"}`]),
      ]),
    ]),
  );
  render(page);
  return page;
}

function renderExecutiveSummary(page: HTMLElement, report: PdfReportInput, metrics: ReportMetrics, insights: string[]) {
  page.appendChild(
    el("section", "pdf-hero-grid", [
      metricTile("총 대화", formatNumber(metrics.totalCount), "건"),
      metricTile("매칭률", `${formatDecimal(metrics.matchRate)}%`, metrics.matchRate >= 80 ? "양호" : metrics.matchRate >= 60 ? "점검" : "주의"),
      metricTile("채널 친구 대화", formatNumber(metrics.friendCount), `건 (${formatDecimal(metrics.friendRate)}%)`),
      metricTile("개선 시급 질문", formatNumber(metrics.improvementCount), "건"),
    ]),
  );

  page.appendChild(
    el("section", "pdf-two-col", [
      el("div", "pdf-panel pdf-panel--accent", [
        el("h2", "", ["핵심 인사이트"]),
        bulletList(insights.slice(0, 4)),
      ]),
      el("div", "pdf-panel", [
        el("h2", "", ["매칭 구성"]),
        donutSvg(metrics.matchedCount, metrics.unmatchedCount),
        el("div", "pdf-legend", [
          legendItem("매칭 성공", "#378ADD", formatNumber(metrics.matchedCount)),
          legendItem("매칭 실패", "#E24B4A", formatNumber(metrics.unmatchedCount)),
        ]),
      ]),
    ]),
  );

  page.appendChild(
    el("section", "pdf-panel pdf-action-box", [
      el("h2", "", ["우선순위"]),
      bulletList([
        metrics.improvementCount > 0
          ? "개선 대기열의 미매칭 및 저신뢰도 TOP 질문을 FAQ 후보로 전환하고 유사어 사전을 보강합니다."
          : "현재 조회 범위에는 개선 시급 데이터가 적어 기존 FAQ 품질 유지가 우선입니다.",
        "조회수가 높은 FAQ는 답변 문구와 선택 모델을 기준으로 재사용 가능한 표준 답변으로 관리합니다.",
        "채널 친구 비중 확대를 위해 FAQ 응답 하단에 카카오 채널 추가 혜택 버튼을 적극 배치합니다.",
      ]),
    ]),
  );
}

function renderDailyTrend(page: HTMLElement, report: PdfReportInput, metrics: ReportMetrics) {
  page.appendChild(
    el("section", "pdf-panel", [
      el("h2", "", ["대화량 및 매칭률 추세"]),
      el("p", "pdf-section-note", ["조회 기간의 일별 대화량과 매칭 실패 비중을 함께 확인합니다."]),
      dailyTrendSvg(report.daily),
    ]),
  );

  const rows = [...report.daily]
    .sort((a, b) => (a.report_date || "").localeCompare(b.report_date || ""))
    .map((row) => [
      row.report_date || "-",
      row.brand_name || row.brand || "-",
      formatNumber(row.total_count),
      formatNumber(row.matched_count),
      formatNumber(row.unmatched_count),
      `${formatDecimal(getRate(row))}%`,
    ]);

  page.appendChild(renderCompactTable(["일자", "브랜드", "총 대화", "매칭", "미매칭", "매칭률"], rows.slice(-12)));
  page.appendChild(
    el("p", "pdf-footnote", [`기간 평균 매칭률은 ${formatDecimal(metrics.matchRate)}%이며, 일별 변동은 FAQ 신규 질문 유입 여부와 함께 해석해야 합니다.`]),
  );
}

function renderFaqPerformance(page: HTMLElement, report: PdfReportInput) {
  const topFaqs = report.faqSummary.slice(0, 8);
  page.appendChild(
    el("section", "pdf-panel", [
      el("h2", "", ["상위 FAQ 매칭 성과"]),
      el("p", "pdf-section-note", ["조회수가 높은 FAQ는 고객 질문이 반복되는 핵심 의도입니다."]),
      horizontalBarSvg(topFaqs.map((row) => ({ label: truncate(row.faq_question || row.category_name || "FAQ", 34), value: row.hit_count })), "#185FA5"),
    ]),
  );

  const rows = topFaqs.map((row) => [
    row.brand_name || "-",
    row.category_name || "-",
    row.faq_question || "-",
    formatNumber(row.hit_count),
    formatNumber(row.unique_user_count),
    row.avg_score === null ? "-" : formatDecimal(row.avg_score),
  ]);
  page.appendChild(renderCompactTable(["브랜드", "카테고리", "FAQ 질문", "조회", "사용자", "평균점수"], rows));
}

function renderImprovementQueue(page: HTMLElement, report: PdfReportInput, insights: string[]) {
  const queue = (report.improvementQueue || []).slice(0, 8);
  page.appendChild(
    el("section", "pdf-panel pdf-panel--warning", [
      el("h2", "", ["FAQ 개선 대기열 (미매칭 & 저신뢰도)"]),
      el("p", "pdf-section-note", ["미매칭 질문과 유사도 60점 미만의 저신뢰도 질문을 합쳐 최우선 보강이 필요한 항목입니다."]),
      horizontalBarSvg(
        queue.map((row) => ({
          label: `[${resultTypeLabel(row.result_type)}] ${truncate(row.sample_query, 32)}`,
          value: row.query_count,
        })),
        "#E24B4A",
      ),
    ]),
  );

  const rows = queue.map((row) => [
    row.brand_name || "-",
    resultTypeLabel(row.result_type),
    supportMenuLabel(row.menu_id),
    truncate(row.sample_query, 38),
    formatNumber(row.query_count),
    formatNumber(row.unique_user_count),
    row.avg_score !== null && row.avg_score !== undefined ? formatDecimal(row.avg_score) : "-",
  ]);

  page.appendChild(renderCompactTable(["브랜드", "구분", "문의메뉴", "고객 질문", "발생건수", "사용자", "평균점수"], rows));
}

function renderChannelFriendSummary(page: HTMLElement, report: PdfReportInput, metrics: ReportMetrics) {
  const friends = report.channelFriendSummary || [];
  page.appendChild(
    el("section", "pdf-panel", [
      el("h2", "", ["카카오톡 채널 친구 참여 및 매칭 현황"]),
      el("p", "pdf-section-note", ["카카오 채널 친구 여부에 따른 고객 참여도 및 매칭 품질을 비교 분석합니다."]),
    ]),
  );

  page.appendChild(
    el("section", "pdf-two-col", [
      el("div", "pdf-panel", [
        el("h2", "", ["채널 친구 구성"]),
        channelFriendDonutSvg(friends),
        el("div", "pdf-legend", [
          legendItem("채널 친구", "#3B6D11", formatNumber(metrics.friendCount)),
          legendItem("비친구/미확인", "#B4B2A9", formatNumber(Math.max(0, metrics.totalCount - metrics.friendCount))),
        ]),
      ]),
      el("div", "pdf-panel pdf-panel--accent", [
        el("h2", "", ["고객 참여 분석"]),
        bulletList([
          `조회 기간 내 채널 친구의 대화는 ${formatNumber(metrics.friendCount)}건으로 전체의 ${formatDecimal(metrics.friendRate)}%입니다.`,
          "채널 친구 사용자는 브랜드 충성도가 높고 재방문율이 우수하므로 핵심 공지 및 이벤트 우선 타겟으로 적합합니다.",
          "비친구 사용자의 유입 질문 패턴을 분석하여 첫 답변 하단에 채널 추가 유도 버튼을 배치하는 것을 권장합니다.",
        ]),
      ]),
    ]),
  );

  const rows = friends.map((row) => [
    row.brand_name || "-",
    channelFriendStatusLabel(row.channel_friend_status),
    formatNumber(row.total_requests),
    formatNumber(row.unique_users),
    formatNumber(row.matched_requests),
    formatNumber(row.unmatched_requests),
    `${formatDecimal(row.match_rate_pct)}%`,
    row.avg_score !== null && row.avg_score !== undefined ? formatDecimal(row.avg_score) : "-",
  ]);

  page.appendChild(renderCompactTable(["브랜드", "친구 상태", "총 요청", "사용자", "매칭", "미매칭", "매칭률", "평균점수"], rows));
}

function renderAppendix(page: HTMLElement, report: PdfReportInput) {
  page.appendChild(
    el("section", "pdf-panel", [
      el("h2", "", ["원본 히스토리 샘플"]),
      el("p", "pdf-section-note", ["보고서 판단의 근거가 되는 최신 대화 기록 일부입니다."]),
    ]),
  );

  page.appendChild(
    renderCompactTable(
      ["발생시각", "브랜드", "질문", "결과", "점수", "매칭 FAQ"],
      report.history.slice(0, 12).map((row) => [
        formatDateTime(row.occurred_at),
        row.brand_name || "-",
        row.query || "-",
        row.matched ? "성공" : "실패",
        formatDecimal(row.score),
        row.faq_question || row.category_name || "-",
      ]),
    ),
  );
}

type ReportMetrics = {
  totalCount: number;
  matchedCount: number;
  unmatchedCount: number;
  matchRate: number;
  uniqueUsers: number;
  friendCount: number;
  friendRate: number;
  improvementCount: number;
};

function summarizeReport(report: PdfReportInput): ReportMetrics {
  const totalCount = report.daily.reduce((sum, row) => sum + row.total_count, 0);
  const matchedCount = report.daily.reduce((sum, row) => sum + row.matched_count, 0);
  const unmatchedCount = report.daily.reduce((sum, row) => sum + row.unmatched_count, 0);
  const uniqueUsers = report.daily.reduce((sum, row) => sum + (row.unique_user_count || 0), 0);

  const friends = report.channelFriendSummary || [];
  const friendCount = friends.filter((f) => f.channel_friend_status === "friend").reduce((s, f) => s + f.total_requests, 0);
  const friendRate = totalCount ? (friendCount / totalCount) * 100 : 0;

  const improvements = report.improvementQueue || [];
  const improvementCount = improvements.reduce((s, i) => s + i.query_count, 0);

  return {
    totalCount,
    matchedCount,
    unmatchedCount,
    matchRate: totalCount ? (matchedCount / totalCount) * 100 : 0,
    uniqueUsers,
    friendCount,
    friendRate,
    improvementCount,
  };
}

function buildReportInsights(report: PdfReportInput, metrics: ReportMetrics) {
  const topUnmatched = report.unmatchedQueries[0];
  const topFaq = report.faqSummary[0];
  const worstDay = [...report.daily].sort((a, b) => getRate(a) - getRate(b))[0];
  const unmatchedShare = metrics.totalCount ? (metrics.unmatchedCount / metrics.totalCount) * 100 : 0;

  return [
    `조회 범위의 총 대화는 ${formatNumber(metrics.totalCount)}건이며 평균 매칭률은 ${formatDecimal(metrics.matchRate)}%입니다.`,
    `미매칭은 ${formatNumber(metrics.unmatchedCount)}건으로 전체의 ${formatDecimal(unmatchedShare)}%입니다.`,
    topFaq ? `가장 많이 매칭된 FAQ는 "${truncate(topFaq.faq_question || topFaq.category_name || "FAQ", 42)}"이며 ${formatNumber(topFaq.hit_count)}회 사용됐습니다.` : "조회 범위에서 FAQ 매칭 요약 데이터가 없습니다.",
    worstDay ? `매칭률이 가장 낮은 구간은 ${worstDay.report_date || "-"} ${worstDay.brand_name || worstDay.brand || ""} (${formatDecimal(getRate(worstDay))}%)입니다.` : "일별 추세 데이터가 없습니다.",
    topUnmatched ? `최우선 미매칭 후보는 "${truncate(topUnmatched.sample_query, 44)}"이며 ${formatNumber(topUnmatched.query_count)}회 반복됐습니다.` : "반복 미매칭 질문이 거의 없어 신규 FAQ 후보가 제한적입니다.",
    report.unmatchedQueries.length > 0 ? "미매칭 TOP 항목은 질문 의도별로 묶어 FAQ, 키워드, 모델 라우팅 규칙으로 나눠 처리하는 것이 효과적입니다." : "미매칭 데이터가 적은 경우에는 기존 FAQ 답변 품질 유지와 로그 모니터링이 우선입니다.",
    "보고서는 현재 조회자가 선택한 기간과 브랜드 필터만 반영하므로, 다른 기간/브랜드의 추세와 직접 비교하려면 동일 조건으로 재조회해야 합니다.",
  ];
}

function metricTile(label: string, value: string, unit: string) {
  return el("div", "pdf-metric-tile", [el("span", "", [label]), el("strong", "", [value]), el("em", "", [unit])]);
}

function bulletList(items: string[]) {
  return el(
    "ul",
    "pdf-bullets",
    items.filter(Boolean).map((item) => el("li", "", [item])),
  );
}

function renderCompactTable(headers: string[], rows: string[][]) {
  const table = el("section", "pdf-table-panel", [
    el("table", "pdf-report-table", [
      el("thead", "", [el("tr", "", headers.map((header) => el("th", "", [header])))]),
      el(
        "tbody",
        "",
        rows.length
          ? rows.map((row) => el("tr", "", row.map((cell) => el("td", "", [cell]))))
          : [el("tr", "", [el("td", "pdf-empty-td", ["조회된 데이터가 없습니다."])])],
      ),
    ]),
  ]);
  const emptyCell = table.querySelector<HTMLTableCellElement>(".pdf-empty-td");
  if (emptyCell) emptyCell.colSpan = headers.length;
  return table;
}

function dailyTrendSvg(rows: ReportRow[]) {
  const sorted = [...rows].sort((a, b) => (a.report_date || "").localeCompare(b.report_date || "")).slice(-14);
  const maxTotal = Math.max(1, ...sorted.map((row) => row.total_count));
  const width = 900;
  const height = 330;
  const chartTop = 28;
  const chartBottom = 285;
  const barSlot = width / Math.max(1, sorted.length);
  const barWidth = Math.max(16, Math.min(42, barSlot * 0.52));
  const svg = createSvg(width, height, "pdf-chart-svg");

  sorted.forEach((row, index) => {
    const x = index * barSlot + (barSlot - barWidth) / 2;
    const totalHeight = ((row.total_count / maxTotal) * (chartBottom - chartTop)) || 0;
    const matchedHeight = row.total_count ? totalHeight * (row.matched_count / row.total_count) : 0;
    const unmatchedHeight = Math.max(0, totalHeight - matchedHeight);
    svg.appendChild(svgEl("rect", { x, y: chartBottom - matchedHeight, width: barWidth, height: matchedHeight, rx: 5, fill: "#378ADD" }));
    svg.appendChild(svgEl("rect", { x, y: chartBottom - matchedHeight - unmatchedHeight, width: barWidth, height: unmatchedHeight, rx: 5, fill: "#E24B4A" }));
    svg.appendChild(svgEl("text", { x: x + barWidth / 2, y: chartBottom + 22, "text-anchor": "middle", "font-size": 11, fill: "#6B6B65" }, [shortLabel(row.report_date || row.brand_name || "-")]));
    svg.appendChild(svgEl("text", { x: x + barWidth / 2, y: Math.max(18, chartBottom - totalHeight - 8), "text-anchor": "middle", "font-size": 10, fill: "#1A1A18", "font-weight": 700 }, [formatNumber(row.total_count)]));
  });

  svg.appendChild(svgEl("line", { x1: 0, y1: chartBottom, x2: width, y2: chartBottom, stroke: "#D9D6CF", "stroke-width": 1 }));
  return svg;
}

function horizontalBarSvg(rows: Array<{ label: string; value: number }>, color: string) {
  const width = 900;
  const rowHeight = 36;
  const height = Math.max(120, rows.length * rowHeight + 20);
  const maxValue = Math.max(1, ...rows.map((row) => row.value));
  const svg = createSvg(width, height, "pdf-chart-svg pdf-bar-chart");

  rows.forEach((row, index) => {
    const y = 12 + index * rowHeight;
    const barWidth = (row.value / maxValue) * 420;
    svg.appendChild(svgEl("text", { x: 0, y: y + 18, "font-size": 12, fill: "#1A1A18", "font-weight": 700 }, [row.label]));
    svg.appendChild(svgEl("rect", { x: 420, y: y + 3, width: 430, height: 18, rx: 9, fill: "#F0EDE8" }));
    svg.appendChild(svgEl("rect", { x: 420, y: y + 3, width: Math.max(3, barWidth), height: 18, rx: 9, fill: color }));
    svg.appendChild(svgEl("text", { x: 865, y: y + 18, "font-size": 11, fill: "#6B6B65", "text-anchor": "end" }, [formatNumber(row.value)]));
  });

  return svg;
}

function donutSvg(matched: number, unmatched: number) {
  const total = matched + unmatched;
  const matchedPercent = total ? matched / total : 0;
  const size = 220;
  const radius = 78;
  const circumference = 2 * Math.PI * radius;
  const svg = createSvg(size, size, "pdf-donut-svg");
  svg.appendChild(svgEl("circle", { cx: 110, cy: 110, r: radius, fill: "none", stroke: "#F0EDE8", "stroke-width": 28 }));
  svg.appendChild(
    svgEl("circle", {
      cx: 110,
      cy: 110,
      r: radius,
      fill: "none",
      stroke: "#378ADD",
      "stroke-width": 28,
      "stroke-dasharray": `${matchedPercent * circumference} ${circumference}`,
      "stroke-linecap": "round",
      transform: "rotate(-90 110 110)",
    }),
  );
  svg.appendChild(svgEl("text", { x: 110, y: 104, "text-anchor": "middle", "font-size": 24, "font-weight": 800, fill: "#1A1A18" }, [`${formatDecimal(matchedPercent * 100)}%`]));
  svg.appendChild(svgEl("text", { x: 110, y: 128, "text-anchor": "middle", "font-size": 12, fill: "#6B6B65" }, ["match rate"]));
  return svg;
}

function channelFriendDonutSvg(friends: ChannelFriendSummaryRow[]) {
  const friend = friends.filter((f) => f.channel_friend_status === "friend").reduce((s, f) => s + f.total_requests, 0);
  const nonFriend = friends.filter((f) => f.channel_friend_status !== "friend").reduce((s, f) => s + f.total_requests, 0);
  const total = friend + nonFriend;
  const friendPercent = total ? friend / total : 0;
  const size = 220;
  const radius = 78;
  const circumference = 2 * Math.PI * radius;
  const svg = createSvg(size, size, "pdf-donut-svg");
  svg.appendChild(svgEl("circle", { cx: 110, cy: 110, r: radius, fill: "none", stroke: "#F0EDE8", "stroke-width": 28 }));
  svg.appendChild(
    svgEl("circle", {
      cx: 110,
      cy: 110,
      r: radius,
      fill: "none",
      stroke: "#3B6D11",
      "stroke-width": 28,
      "stroke-dasharray": `${friendPercent * circumference} ${circumference}`,
      "stroke-linecap": "round",
      transform: "rotate(-90 110 110)",
    }),
  );
  svg.appendChild(
    svgEl("text", { x: 110, y: 104, "text-anchor": "middle", "font-size": 24, "font-weight": 800, fill: "#1A1A18" }, [
      `${formatDecimal(friendPercent * 100)}%`,
    ]),
  );
  svg.appendChild(svgEl("text", { x: 110, y: 128, "text-anchor": "middle", "font-size": 12, fill: "#6B6B65" }, ["channel friend"]));
  return svg;
}

function legendItem(label: string, color: string, value: string) {
  return el("span", "", [el("i", "", [], { style: `background:${color}` }), `${label} ${value}`]);
}

function createSvg(width: number, height: number, className: string) {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  svg.setAttribute("width", String(width));
  svg.setAttribute("height", String(height));
  svg.setAttribute("class", className);
  svg.setAttribute("role", "img");
  return svg;
}

function svgEl(name: string, attrs: Record<string, string | number>, children: string[] = []) {
  const node = document.createElementNS("http://www.w3.org/2000/svg", name);
  Object.entries(attrs).forEach(([key, value]) => node.setAttribute(key, String(value)));
  children.forEach((child) => node.appendChild(document.createTextNode(child)));
  return node;
}

function el(tag: string, className = "", children: Array<Node | string> = [], attrs: Record<string, string> = {}) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  Object.entries(attrs).forEach(([key, value]) => node.setAttribute(key, value));
  children.forEach((child) => node.appendChild(typeof child === "string" ? document.createTextNode(child) : child));
  return node;
}

function getRate(row: ReportRow) {
  return row.match_rate ?? (row.total_count ? (row.matched_count / row.total_count) * 100 : 0);
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("ko-KR").format(value || 0);
}

function formatDecimal(value: number) {
  return Number(value || 0).toFixed(1);
}

function formatDateTime(value?: string | null) {
  if (!value) return "-";
  return value.replace("T", " ").slice(0, 16);
}

function truncate(value: string, length: number) {
  return value.length > length ? `${value.slice(0, length - 1)}...` : value;
}

function shortLabel(value: string) {
  const parts = value.split("-");
  return parts.length === 3 ? `${Number(parts[1])}/${Number(parts[2])}` : truncate(value, 8);
}

function buildPdfPages(source: HTMLElement, stage: HTMLElement) {
  const pages: HTMLElement[] = [];
  const overview = document.createElement("section");
  overview.className = "pdf-page pdf-page--overview";

  Array.from(source.children).forEach((child) => {
    if (child.matches(".tabs, .table-card")) return;
    overview.appendChild(child.cloneNode(true));
  });

  stage.appendChild(overview);
  pages.push(overview);

  const sourceTableCard = source.querySelector<HTMLElement>(".table-card");
  if (!sourceTableCard) return pages;

  const sourceRows = Array.from(sourceTableCard.querySelectorAll<HTMLTableRowElement>("tbody > tr"));
  let page = createTablePage(sourceTableCard, stage, pages.length > 1);
  pages.push(page.root);

  sourceRows.forEach((sourceRow) => {
    const row = sourceRow.cloneNode(true) as HTMLTableRowElement;
    page.body.appendChild(row);

    if (page.root.scrollHeight <= page.maxHeight || page.body.rows.length === 1) return;

    row.remove();
    page = createTablePage(sourceTableCard, stage, true);
    page.body.appendChild(row);
    pages.push(page.root);
  });

  return pages;
}

function createTablePage(sourceTableCard: HTMLElement, stage: HTMLElement, continued: boolean) {
  const root = document.createElement("section");
  const isLandscape = sourceTableCard.querySelectorAll("thead th").length > 8;
  root.className = `pdf-page pdf-page--table${isLandscape ? " pdf-page--landscape" : ""}`;
  root.style.width = `${isLandscape ? PDF_LANDSCAPE_WIDTH_PX : PDF_WIDTH_PX}px`;

  const card = sourceTableCard.cloneNode(true) as HTMLElement;
  const body = card.querySelector<HTMLTableSectionElement>("tbody");
  if (!body) throw new Error("PDF 표 본문을 찾을 수 없습니다.");
  body.replaceChildren();

  if (continued) {
    const subtitle = card.querySelector<HTMLElement>(".table-card__sub");
    if (subtitle) subtitle.textContent = `${subtitle.textContent || ""} · 계속`;
  }

  root.appendChild(card);
  stage.appendChild(root);
  return {
    root,
    body,
    maxHeight: isLandscape ? PDF_LANDSCAPE_CONTENT_HEIGHT_PX : PDF_PAGE_CONTENT_HEIGHT_PX,
  };
}

function copyChartCanvases(source: HTMLElement, target: HTMLElement) {
  const sourceCanvases = Array.from(source.querySelectorAll("canvas"));
  const targetCanvases = Array.from(target.querySelectorAll("canvas"));

  targetCanvases.forEach((targetCanvas, index) => {
    const sourceCanvas = sourceCanvases[index];
    if (!sourceCanvas) return;

    targetCanvas.width = sourceCanvas.width;
    targetCanvas.height = sourceCanvas.height;
    targetCanvas.getContext("2d")?.drawImage(sourceCanvas, 0, 0);
  });
}

function addCanvasPage(pdf: JsPdfDocument, canvas: HTMLCanvasElement, pageNumber: number, pageCount: number) {
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const margin = 8;
  const footerHeight = 5;
  const maxWidth = pageWidth - margin * 2;
  const maxHeight = pageHeight - margin * 2 - footerHeight;
  const ratio = Math.min(maxWidth / canvas.width, maxHeight / canvas.height);
  const width = canvas.width * ratio;
  const height = canvas.height * ratio;
  const x = (pageWidth - width) / 2;

  pdf.addImage(canvas.toDataURL("image/jpeg", 0.94), "JPEG", x, margin, width, height, undefined, "FAST");
  pdf.setFontSize(8);
  pdf.setTextColor(120);
  pdf.text(`${pageNumber} / ${pageCount}`, pageWidth / 2, pageHeight - 4, { align: "center" });
}

async function waitForDocumentFonts() {
  if ("fonts" in document) await document.fonts.ready;
}

function nextPaint() {
  return new Promise<void>((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  });
}
