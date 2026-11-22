import { percent, type Activity } from "./period-report";
import { seoulDate } from "./report-period";
import type { jsPDF as JsPdfDocument } from "jspdf";
import {
  supportMenuLabel,
  channelFriendStatusLabel,
  resultTypeLabel,
  type ReportRow,
  type ImprovementQueueRow,
  type ChannelFriendSummaryRow,
} from "@/lib/report";
import {
  calculateBrandHealth,
  MIN_BRAND_HEALTH_SAMPLE,
  type BrandHealthStat,
  type BrandOptionLike,
} from "@/lib/brand-health";

export const PDF_WIDTH_PX = 1040;
export const PDF_PAGE_HEIGHT_PX = 1470;
const PDF_RENDER_SCALE = 2.0;

export type PdfExportOptions = {
  filename: string;
  report: PdfReportInput;
};

export type PdfReportInput = {
  activity: Activity;
  filters: {
    from: string;
    to: string;
    brandLabel: string;
    limit: string;
  };
  brands?: BrandOptionLike[];
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

// -------------------------------------------------------------
// EXPORT PDF VIA HTML2CANVAS & JSPDF (DIRECT DOWNLOAD)
// -------------------------------------------------------------
export async function exportDashboardPdf(_source: HTMLElement, options: PdfExportOptions) {
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([import("html2canvas"), import("jspdf")]);
  const previousScroll = { x: window.scrollX, y: window.scrollY };
  const stage = document.createElement("div");
  stage.className = "pdf-stage";

  try {
    document.body.classList.add("pdf-exporting");
    window.scrollTo(0, 0);
    document.body.appendChild(stage);
    await waitForDocumentFonts();
    await nextPaint();

    const pages = buildReportPdfPages(options.report, stage);
    if (pages.length === 0) throw new Error("PDF로 내보낼 페이지가 생성되지 않았습니다.");
    await nextPaint();

    const pdf = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait", compress: true });

    for (let index = 0; index < pages.length; index += 1) {
      pages.forEach((page, pageIndex) => {
        page.style.display = pageIndex === index ? "flex" : "none";
      });

      const canvas = await html2canvas(pages[index], {
        scale: PDF_RENDER_SCALE,
        useCORS: true,
        logging: false,
        backgroundColor: "#ffffff",
        windowWidth: PDF_WIDTH_PX,
        windowHeight: PDF_PAGE_HEIGHT_PX,
        height: PDF_PAGE_HEIGHT_PX,
        scrollX: 0,
        scrollY: 0,
      });

      if (index > 0) {
        pdf.addPage("a4", "portrait");
      }
      addCanvasPage(pdf, canvas);
    }

    pdf.save(options.filename);
  } finally {
    stage.remove();
    document.body.classList.remove("pdf-exporting");
    window.scrollTo(previousScroll.x, previousScroll.y);
  }
}

// -------------------------------------------------------------
// BUILD ALL 6 PDF DOM PAGES
// -------------------------------------------------------------
export function buildReportPdfPages(report: PdfReportInput, stage?: HTMLElement) {
  const metrics = summarizeReport(report);
  const insights = buildReportInsights(report, metrics);
  const totalPages = 6;

  const pages = [
    // Page 1: 종합 운영 성과 요약 (Executive Summary & Operational Impact)
    createReportPage("01. 종합 운영 성과 요약 (Executive Summary)", 1, totalPages, report, (page) =>
      renderExecutiveSummary(page, report, metrics, insights),
    ),
    // Page 2: 실제 브랜드별 응답 건강도
    createReportPage("02. 브랜드별 응답 건강도 (Brand Response Health)", 2, totalPages, report, (page) =>
      renderBrandBenchmark(page, report, metrics),
    ),
    // Page 3: 고객 인입 행동 및 시간대/요일별 심층 분석 (Temporal & Behavioral Insights)
    createReportPage("03. 고객 인입 행동 및 시간대/요일별 심층 분석 (Behavioral Insights)", 3, totalPages, report, (page) =>
      renderTemporalInsights(page, report, metrics),
    ),
    // Page 4: 주요 문의 카테고리 및 상위 FAQ 성과 (Category & FAQ Performance)
    createReportPage("04. 주요 문의 카테고리 및 상위 FAQ 응답 성과 (FAQ Performance)", 4, totalPages, report, (page) =>
      renderCategoryAndFaq(page, report, metrics),
    ),
    // Page 5: 품질 리스크 레이더 & 우선 개선 과제 (CS Risk Radar & Quality Improvement)
    createReportPage("05. 품질 리스크 레이더 및 FAQ 개선 대기열 (CS Risk & Quality)", 5, totalPages, report, (page) =>
      renderRiskAndImprovement(page, report, metrics),
    ),
    // Page 6: 카카오 채널 친구 분석 및 운영 총괄 결재 (Channel Engagement & Appendix)
    createReportPage("06. 카카오 채널 친구 분석 및 운영 총괄 결재 (Channel & Appendix)", 6, totalPages, report, (page) =>
      renderChannelAndAppendix(page, report, metrics),
    ),
  ];

  if (stage) {
    pages.forEach((page) => stage.appendChild(page));
  }
  return pages;
}

function createReportPage(
  title: string,
  pageNumber: number,
  totalPages: number,
  report: PdfReportInput,
  render: (page: HTMLElement) => void,
) {
  const page = document.createElement("section");
  page.className = "pdf-sheet";
  page.setAttribute("data-page", String(pageNumber));

  // Header
  const header = el("header", "pdf-sheet-header", [
    el("div", "pdf-sheet-brand-group", [
      el("span", "pdf-kicker-tag", ["Gatevision Kakao Chatbot Intelligence"]),
      el("h2", "", [title]),
    ]),
    el("div", "pdf-meta-box", [
      el("span", "pdf-meta-brand", [report.filters.brandLabel || "전체 브랜드"]),
      el("span", "pdf-meta-period", [`조회기간: ${report.filters.from || "전체"} ~ ${report.filters.to || "전체"}`]),
    ]),
  ]);
  page.appendChild(header);

  // Body container
  const body = el("div", "pdf-sheet-body", []);
  render(body);
  page.appendChild(body);

  // Footer
  const footer = el("footer", "pdf-sheet-footer", [
    el("span", "", ["게이트비전(Gatevision) AI 챗봇 운영 센터"]),
    el("span", "", [`Page ${pageNumber} of ${totalPages}`]),
    el("span", "", ["Confidential • 내부 검토용"]),
  ]);
  page.appendChild(footer);

  return page;
}

// -------------------------------------------------------------
// PAGE 1: EXECUTIVE SUMMARY & OPERATIONAL IMPACT
// -------------------------------------------------------------
function renderExecutiveSummary(container: HTMLElement, report: PdfReportInput, metrics: ReportMetrics, insights: string[]) {
  // 4-Tile Row
  container.appendChild(
    el("section", "pdf-kpi-row", [
      kpiTile("총 대화 건수", `${formatNumber(metrics.totalCount)} 건`, undefined, "누적 고객 문의량"),
      kpiTile(
        "평균 매칭률",
        `${metrics.matchRate.toFixed(1)}%`,
        {
          text: metrics.matchRate >= 80 ? "목표 달성" : "보강 권장",
          color: metrics.matchRate >= 80 ? "#059669" : "#d97706",
        },
        "FAQ 자동 응답 성공률",
      ),
      kpiTile("상담원 언급 문의", formatNumber(report.activity.agentCount) + "건", undefined, "고객 질문의 키워드 기준"),
      kpiTile("식별 고객 수", formatNumber(report.activity.users) + "명", undefined, "기간 내 중복 제외"),
    ]),
  );

  // Two Column Panel: Insights & Canvas Doughnut
  const twoCol = el("div", "", []);
  twoCol.style.display = "grid";
  twoCol.style.gridTemplateColumns = "1.2fr 0.8fr";
  twoCol.style.gap = "20px";
  twoCol.style.marginBottom = "20px";

  // Left: Key Insights
  const leftPanel = el("div", "pdf-card-panel", [
    el("h3", "", ["운영 핵심 인사이트 (Key Operational Highlights)"]),
    el("p", "section-desc", ["조회기간의 실제 브랜드 상담 기록과 고객 행동 데이터를 요약했습니다."]),
    bulletList(insights.slice(0, 4)),
  ]);

  // Right: Canvas Donut
  const rightPanel = el("div", "pdf-card-panel", [
    el("h3", "", ["전체 응답 매칭 현황"]),
    createDonutCanvas(metrics.matchedCount, metrics.unmatchedCount, metrics.matchRate),
    legendRow([
      { label: "자동 응답 성공", color: "#4f46e5", value: `${formatNumber(metrics.matchedCount)}건` },
      { label: "미매칭(답변 불가)", color: "#f43f5e", value: `${formatNumber(metrics.unmatchedCount)}건` },
    ]),
  ]);

  twoCol.appendChild(leftPanel);
  twoCol.appendChild(rightPanel);
  container.appendChild(twoCol);

  container.appendChild(el("div", "pdf-highlight-box", [
    el("h4", "", ["개선 대상 문의"]),
    bulletList([
      `미매칭 또는 저신뢰도 문의는 ${formatNumber(report.activity.improvementCount)}건, ${formatNumber(report.activity.improvementTypes)}개 항목입니다.`,
      `카카오 채널 친구로 기록된 문의는 ${formatNumber(metrics.friendCount)}건입니다.`,
    ]),
  ]));
}

// -------------------------------------------------------------
// PAGE 2: BRAND BENCHMARK & HEALTH SCORE
// -------------------------------------------------------------
function renderBrandBenchmark(container: HTMLElement, report: PdfReportInput, metrics: ReportMetrics) {
  const brandStats = metrics.brandBenchmark;

  container.appendChild(
    el("div", "pdf-card-panel", [
      el("h3", "", ["브랜드별 실제 응답 성과와 평가 가능 여부"]),
      el("p", "section-desc", [`선택 기간의 실제 대화량과 응답 성공률을 사용합니다. ${MIN_BRAND_HEALTH_SAMPLE}건 미만은 표본 부족, 0건은 데이터 없음으로 표시합니다.`]),
    ]),
  );

  // Benchmark Table
  const tableRows = brandStats.map((b) => [
    b.statusLabel,
    b.name,
    formatNumber(b.total),
    formatNumber(b.matched),
    formatNumber(b.unmatched),
    `${b.rate.toFixed(1)}%`,
    b.comment,
  ]);

  container.appendChild(
    renderPdfTable(
      ["평가 상태", "브랜드명", "총 문의량", "자동 응답", "미매칭", "응답 성공률", "확인할 내용"],
      tableRows,
      ["12%", "21%", "11%", "12%", "10%", "13%", "21%"],
    ),
  );

  // Brand Volume SVG Bar
  container.appendChild(
    el("div", "pdf-card-panel", [
      el("h3", "", ["브랜드별 대화량 점유율 및 응답 성공률 비교"]),
      horizontalSvg(
        brandStats.filter((b) => b.total > 0).map((b) => ({
          label: `${b.name} (${b.rate.toFixed(1)}%)`,
          value: b.total,
        })),
        "#4f46e5",
      ),
    ]),
  );

  // Strategic Commentary Panel
  container.appendChild(
    el("div", "pdf-highlight-box", [
      el("h4", "", ["🏆 브랜드별 원포인트 운영 전략 진단"]),
      bulletList([
        brandStats.find((brand) => brand.total > 0)
          ? `최다 인입 브랜드 [${brandStats.find((brand) => brand.total > 0)?.name}]은 총 ${formatNumber(brandStats.find((brand) => brand.total > 0)?.total || 0)}건입니다. 대화량이 많은 브랜드부터 미매칭 원문을 확인합니다.`
          : "조회기간에 브랜드 상담 기록이 없습니다.",
        getBrandReviewPriorityText(brandStats),
        `총 대화량이 ${MIN_BRAND_HEALTH_SAMPLE}건 미만인 브랜드는 점수나 순위로 판단하지 않고 원문 사례를 확인합니다.`,
      ]),
    ]),
  );

  container.appendChild(
    el("div", "pdf-card-panel", [
      el("h3", "", ["브랜드 매니저 가이드라인"]),
      bulletList([
        "각 브랜드 담당자는 주 1회 대시보드의 '미매칭 고객 문의' 엑셀을 다운로드하여 신규 모델 및 소모품 질문을 FAQ에 즉시 반영하십시오.",
        "프로모션이나 기획전 진행 시 행사 시작 2일 전 챗봇 웰컴 블록에 이벤트 안내 링크를 선제 탑재하여 CS 인입을 사전 예방합니다.",
      ]),
    ]),
  );
}

// -------------------------------------------------------------
// PAGE 3: TEMPORAL & BEHAVIORAL INSIGHTS
// -------------------------------------------------------------
function renderTemporalInsights(container: HTMLElement, report: PdfReportInput, metrics: ReportMetrics) {
  const { activity } = report;

  container.appendChild(
    el("div", "pdf-card-panel", [
      el("h3", "", ["24시간대별 고객 문의 인입 패턴 및 피크타임"]),
      el("p", "section-desc", [
        metrics.peakHour < 0 ? "조회 기간의 문의가 없습니다." : `가장 많은 문의가 들어온 시간은 한국 시간 ${metrics.peakHour}시이며, 09~18시 외 문의 비중은 ${percent(metrics.nightCount, metrics.totalCount)}입니다.`,
      ]),
      hourlyDistributionSvg(activity.hours, metrics.peakHour),
    ]),
  );

  const twoCol = el("div", "", []);
  twoCol.style.display = "grid";
  twoCol.style.gridTemplateColumns = "1fr 1fr";
  twoCol.style.gap = "20px";
  twoCol.style.marginBottom = "20px";

  const leftPanel = el("div", "pdf-card-panel", [
    el("h3", "", ["요일별 문의량"]),
    bulletList([
      `월요일 인입 비중: 전체의 ${percent(activity.weekdays[1], metrics.totalCount)} (${formatNumber(activity.weekdays[1])}건)`,
      `주말(토·일) 문의: ${formatNumber(metrics.weekendCount)}건 (${percent(metrics.weekendCount, metrics.totalCount)})`,
    ]),
  ]);

  const rightPanel = el("div", "pdf-card-panel", [
    el("h3", "", ["식별 고객의 문의 빈도"]),
    bulletList([
      `한 번만 문의한 고객 비중: ${percent(activity.singleUsers, activity.users)}`,
      `식별 고객 ${formatNumber(activity.users)}명, 문의 ${formatNumber(activity.identifiedRequests)}건`,
    ]),
  ]);

  twoCol.appendChild(leftPanel);
  twoCol.appendChild(rightPanel);
  container.appendChild(twoCol);

  // Daily Trend Table
  const sorted = [...report.daily].sort((a, b) => (a.report_date || "").localeCompare(b.report_date || "")).slice(-8);
  const rows = sorted.map((row) => [
    row.report_date || "-",
    row.brand_name || row.brand || "-",
    formatNumber(row.total_count),
    formatNumber(row.matched_count),
    formatNumber(row.unmatched_count),
    `${getMatchRate(row).toFixed(1)}%`,
    formatNumber(row.unique_user_count || 0),
  ]);

  container.appendChild(
    renderPdfTable(
      ["운영 일자", "브랜드명", "총 문의량", "자동 응답 성공", "미매칭", "응답 성공률", "고객 방문자수"],
      rows,
      ["16%", "18%", "14%", "14%", "12%", "13%", "13%"],
    ),
  );


}

// -------------------------------------------------------------
// PAGE 4: CATEGORY & FAQ PERFORMANCE
// -------------------------------------------------------------
function renderCategoryAndFaq(container: HTMLElement, report: PdfReportInput, metrics: ReportMetrics) {
  // Category Breakdown Horizontal Bar
  container.appendChild(
    el("div", "pdf-card-panel", [
      el("h3", "", ["주요 고객 문의 카테고리(인텐트) 분포"]),
      el("p", "section-desc", ["고객의 질문이 주로 어떤 주제로 이루어져 있는지 분석한 비중입니다."]),
      horizontalSvg(
        report.activity.categories.map((c) => ({
          label: c.name,
          value: c.count,
        })),
        "#2563eb",
      ),
    ]),
  );

  const topFaqs = report.faqSummary.slice(0, 8);
  const rows = topFaqs.map((row) => [
    row.brand_name || "-",
    row.category_name || "-",
    truncate(row.faq_question || "-", 36),
    formatNumber(row.hit_count),
    formatNumber(row.unique_user_count),
    formatScore(row.avg_score),
    row.last_occurred_at ? row.last_occurred_at.slice(0, 10) : "-",
  ]);

  container.appendChild(
    renderPdfTable(
      ["브랜드명", "문의 카테고리", "매칭된 표준 FAQ 답변", "응답 안내수", "문의 고객수", "AI 적합도", "최근 응답"],
      rows,
      ["14%", "16%", "34%", "10%", "9%", "9%", "8%"],
    ),
  );

  container.appendChild(
    el("div", "pdf-highlight-box", [
      el("h4", "", ["💡 FAQ 답변 최적화 권고 및 고객 여정 점검"]),
      bulletList([
        `가장 비중이 높은 '${report.activity.categories[0]?.name || "주요 문의"}' 카테고리의 답변 최신성과 링크 유효성을 상시 점검하십시오.`,
        "AI 답변 적합도가 80점 이상으로 안정적인 질문은 표준 모범 응답으로 지정하여 품질 표준으로 활용합니다.",
        "조회수가 높은 질문은 텍스트 안내뿐 아니라 공식 서비스센터 지도 및 카카오 채팅 바로가기 버튼을 탑재하여 완결성을 극대화합니다.",
      ]),
    ]),
  );

  container.appendChild(
    el("div", "pdf-card-panel", [
      el("h3", "", ["웰컴 블록 퀵버튼 배치 전략"]),
      bulletList([
        "조회 기간의 상위 FAQ를 카카오 챗봇 시작 화면에 고정 버튼으로 제공하여 고객 클릭 경로를 단축합니다.",
        "게이트비전 공식몰 정품 등록 페이지 및 카카오 채널 1:1 상담원 채팅 바로가기 버튼을 답변 하단에 상시 탑재하십시오.",
      ]),
    ]),
  );
}

// -------------------------------------------------------------
// PAGE 5: CS RISK RADAR & QUALITY IMPROVEMENT
// -------------------------------------------------------------
function renderRiskAndImprovement(container: HTMLElement, report: PdfReportInput, metrics: ReportMetrics) {
  // Two Column Panel: Risk Radar & Query Shape
  const twoCol = el("div", "", []);
  twoCol.style.display = "grid";
  twoCol.style.gridTemplateColumns = "1fr 1fr";
  twoCol.style.gap = "20px";
  twoCol.style.marginBottom = "20px";

  const riskPanel = el("div", "pdf-card-panel", [
    el("h3", "", ["고객 불만 & 클레임 위험 징후 레이더 (Risk Radar)"]),
    bulletList([
      `위험 키워드 감지: 총 ${formatNumber(report.activity.riskCount)}건 (전체의 ${percent(report.activity.riskCount, metrics.totalCount)})`,
      "고장, 환불, 파손, 폭발, 누수, 소비자원 등 즉각적 조치가 필요한 질문을 사전 필터링합니다.",
      "불만성 질문은 고객 이탈 및 브랜드 신뢰도 하락으로 직결되므로 전담 상담원의 최우선 확인이 필요합니다.",
    ]),
  ]);

  const shapePanel = el("div", "pdf-card-panel", [
    el("h3", "", ["질문 형태 분석 (단답형 vs 장문형)"]),
    bulletList([
      `단답형 키워드(10자 이하): 매칭률 ${percent(report.activity.shortMatched, report.activity.shortCount)}`,
      `서술형 장문(25자 이상): 매칭률 ${percent(report.activity.longMatched, report.activity.longCount)}`,
      "장문 질문의 매칭률 보완을 위해 고객이 자주 쓰는 일상 구어체(예: '충전안됨', '불안들어옴')를 동의어로 보강하십시오.",
    ]),
  ]);

  twoCol.appendChild(riskPanel);
  twoCol.appendChild(shapePanel);
  container.appendChild(twoCol);

  // Improvement Queue Table
  const queue = (report.improvementQueue || []).slice(0, 8);
  const rows = queue.map((row) => [
    row.brand_name || "-",
    resultTypeLabel(row.result_type),
    supportMenuLabel(row.menu_id),
    truncate(cleanQuery(row.sample_query), 34),
    formatNumber(row.query_count),
    formatNumber(row.unique_user_count),
    formatScore(row.avg_score),
    row.last_occurred_at ? row.last_occurred_at.slice(0, 10) : "-",
  ]);

  container.appendChild(
    renderPdfTable(
      ["브랜드명", "개선 분류", "고객 선택 메뉴", "고객 대표 질문", "누적 인입수", "문의 고객수", "평균 점수", "최근 인입"],
      rows,
      ["12%", "10%", "14%", "34%", "10%", "8%", "6%", "6%"],
    ),
  );

  container.appendChild(
    el("div", "pdf-highlight-box", [
      el("h4", "", ["🛠️ CS팀 우선 조치 액션 플랜 체크리스트"]),
      bulletList([
        "위 목록의 상위 질문은 FAQ 마스터 테이블에 신규 등록하거나 기존 유사 FAQ의 대표 유사어로 즉시 추가 등록합니다.",
        "문의 메뉴(AS/소모품/보증 등)가 명확한 질문의 경우 해당 메뉴의 상세 가이드 블록에 직접 매핑하여 응답 정확도를 제고합니다.",
        "대시보드 상단의 [CS팀용 엑셀 다운로드]를 실행하여 실무 담당자를 지정하고 3영업일 이내 답변 작성을 완료하도록 조치합니다.",
      ]),
    ]),
  );

  container.appendChild(
    el("div", "pdf-card-panel", [
      el("h3", "", ["미매칭 인입 패턴 심층 분석 및 프로세스"]),
      bulletList([
        "단문 키워드의 경우 고객이 문제 상황을 구체화할 수 있도록 챗봇에서 선택형 추가 질문 버튼을 제공해야 합니다.",
        "일상 대화는 친근한 챗봇 멘트와 함께 브랜드 공식 제품 문의 메뉴로 복귀할 수 있는 안전 장치를 적용합니다.",
      ]),
    ]),
  );
}

// -------------------------------------------------------------
// PAGE 6: CHANNEL ENGAGEMENT & OPERATIONS APPENDIX
// -------------------------------------------------------------
function renderChannelAndAppendix(container: HTMLElement, report: PdfReportInput, metrics: ReportMetrics) {
  const friends = report.channelFriendSummary || [];

  const twoCol = el("div", "", []);
  twoCol.style.display = "grid";
  twoCol.style.gridTemplateColumns = "1fr 1fr";
  twoCol.style.gap = "20px";
  twoCol.style.marginBottom = "20px";

  const friendDoughnutPanel = el("div", "pdf-card-panel", [
    el("h3", "", ["카카오 채널 친구 참여 비중"]),
    createFriendDonutCanvas(metrics.friendCount, Math.max(0, metrics.totalCount - metrics.friendCount), metrics.friendRate),
    legendRow([
      { label: "채널 친구", color: "#7c3aed", value: `${formatNumber(metrics.friendCount)}건` },
      { label: "비친구 / 미확인", color: "#cbd5e1", value: `${formatNumber(Math.max(0, metrics.totalCount - metrics.friendCount))}건` },
    ]),
  ]);

  const friendInsightPanel = el("div", "pdf-card-panel", [
    el("h3", "", ["고객 참여 분석 및 로열티"]),
    el("p", "section-desc", ["카카오톡 채널 친구 여부에 따른 고객 세그먼트별 활동 특성입니다."]),
    bulletList([
      `채널 친구 상태가 집계된 요청 중 친구 이용 비중은 ${metrics.friendRate.toFixed(1)}%입니다.`,
      "카카오 싱크(Kakao Sync) 간편가입 연동 시 상세 연령대 및 성별 인구통계 분석이 가능합니다.",
    ]),
  ]);

  twoCol.appendChild(friendDoughnutPanel);
  twoCol.appendChild(friendInsightPanel);
  container.appendChild(twoCol);

  const rows = friends.map((row) => [
    row.brand_name || "-",
    channelFriendStatusLabel(row.channel_friend_status),
    formatNumber(row.total_requests),
    formatNumber(row.unique_users),
    formatNumber(row.matched_requests),
    formatNumber(row.unmatched_requests),
    `${row.match_rate_pct.toFixed(1)}%`,
    formatScore(row.avg_score),
  ]);

  container.appendChild(
    renderPdfTable(
      ["브랜드명", "친구 상태", "총 문의량", "방문 고객수", "자동 응답 성공", "미매칭", "응답 성공률", "평균 점수"],
      rows,
      ["14%", "14%", "12%", "12%", "12%", "12%", "12%", "12%"],
    ),
  );

  // Metadata & Signature Block
  const metaSign = el("div", "", []);
  metaSign.style.display = "grid";
  metaSign.style.gridTemplateColumns = "1.3fr 0.7fr";
  metaSign.style.gap = "20px";
  metaSign.style.marginTop = "20px";

  const dataSpec = el("div", "pdf-card-panel", [
    el("h3", "", ["데이터 출처 및 운영 환경 명세"]),
    bulletList([
      "데이터 원천: Supabase PostgreSQL",
      "집계 데이터 소스: 일별 챗봇 운영 현황, FAQ 성과, 미매칭 질문, 우선 개선 대기열, 카카오 채널 친구 분석",
      `보고서 생성 일시: ${new Date().toLocaleString("ko-KR")}`,
      "보안 등급: Confidential • 내부 검토용 (외부 유출 엄금)",
    ]),
  ]);

  const signature = el("div", "pdf-card-panel", []);
  signature.style.display = "flex";
  signature.style.flexDirection = "column";
  signature.style.justifyContent = "space-between";
  signature.innerHTML = `
    <h3 style="font-size: 15px; font-weight: 800; color: #0f172a; margin-bottom: 12px;">운영 총괄 결재</h3>
    <div style="border-top: 1px dashed #cbd5e1; padding-top: 14px; margin-top: 30px; font-size: 12px; color: #64748b;">
      <div style="display: flex; justify-content: space-between; margin-bottom: 6px;">
        <span>검토자 :</span>
        <span style="border-bottom: 1px solid #94a3b8; width: 100px;"></span>
      </div>
      <div style="display: flex; justify-content: space-between;">
        <span>승인일자 :</span>
        <span>${seoulDate()}</span>
      </div>
    </div>
  `;

  metaSign.appendChild(dataSpec);
  metaSign.appendChild(signature);
  container.appendChild(metaSign);

  container.appendChild(
    el("div", "pdf-highlight-box", [
      el("h4", "", ["🔒 데이터 무결성 및 개인정보 보호 고지"]),
      bulletList([
        "고객 질문에서 이메일·전화번호·주민등록번호 형식을 가렸습니다. 이름·주소 등 자유 입력 내용은 공유 전 확인해 주세요.",
        "게이트비전 경영진 및 인가된 CS 운영 담당자 외 열람 및 복제를 금지합니다.",
      ]),
    ]),
  );
}

// -------------------------------------------------------------
// CANVAS DONUT RENDERING HELPERS
// -------------------------------------------------------------
export function createDonutCanvas(matched: number, unmatched: number, matchRate: number): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  const size = 180;
  const dpr = 2;
  canvas.width = size * dpr;
  canvas.height = size * dpr;
  canvas.style.width = `${size}px`;
  canvas.style.height = `${size}px`;
  canvas.style.display = "block";
  canvas.style.margin = "0 auto 12px";

  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;
  ctx.scale(dpr, dpr);

  const cx = size / 2;
  const cy = size / 2;
  const radius = 64;
  const lineWidth = 24;

  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.strokeStyle = "#f1f5f9";
  ctx.lineWidth = lineWidth;
  ctx.stroke();

  const total = matched + unmatched;
  const rate = total ? matched / total : 0;
  if (rate > 0) {
    ctx.beginPath();
    ctx.arc(cx, cy, radius, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * rate);
    ctx.strokeStyle = "#4f46e5";
    ctx.lineWidth = lineWidth;
    ctx.lineCap = "round";
    ctx.stroke();
  }

  ctx.font = "900 24px -apple-system, BlinkMacSystemFont, 'Pretendard', sans-serif";
  ctx.fillStyle = "#0f172a";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(`${matchRate.toFixed(1)}%`, cx, cy - 8);

  ctx.font = "600 11px -apple-system, BlinkMacSystemFont, 'Pretendard', sans-serif";
  ctx.fillStyle = "#64748b";
  ctx.fillText("응답 성공률", cx, cy + 14);

  return canvas;
}

export function createFriendDonutCanvas(friendCount: number, otherCount: number, friendRate: number): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  const size = 180;
  const dpr = 2;
  canvas.width = size * dpr;
  canvas.height = size * dpr;
  canvas.style.width = `${size}px`;
  canvas.style.height = `${size}px`;
  canvas.style.display = "block";
  canvas.style.margin = "0 auto 12px";

  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;
  ctx.scale(dpr, dpr);

  const cx = size / 2;
  const cy = size / 2;
  const radius = 64;
  const lineWidth = 24;

  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.strokeStyle = "#f1f5f9";
  ctx.lineWidth = lineWidth;
  ctx.stroke();

  const total = friendCount + otherCount;
  const rate = total ? friendCount / total : 0;
  if (rate > 0) {
    ctx.beginPath();
    ctx.arc(cx, cy, radius, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * rate);
    ctx.strokeStyle = "#7c3aed";
    ctx.lineWidth = lineWidth;
    ctx.lineCap = "round";
    ctx.stroke();
  }

  ctx.font = "900 24px -apple-system, BlinkMacSystemFont, 'Pretendard', sans-serif";
  ctx.fillStyle = "#7c3aed";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(`${friendRate.toFixed(1)}%`, cx, cy - 8);

  ctx.font = "600 11px -apple-system, BlinkMacSystemFont, 'Pretendard', sans-serif";
  ctx.fillStyle = "#64748b";
  ctx.fillText("채널 친구", cx, cy + 14);

  return canvas;
}

// -------------------------------------------------------------
// SVG RENDERING HELPERS
// -------------------------------------------------------------
type AggregatedDateRow = {
  date: string;
  total: number;
  matched: number;
  unmatched: number;
};

function hourlyDistributionSvg(hours: number[], peakHour: number) {
  const width = 912;
  const height = 180;
  const chartTop = 18;
  const chartBottom = 150;
  const maxVal = Math.max(1, ...hours);
  const slotWidth = width / 24;
  const barWidth = Math.max(12, slotWidth * 0.6);

  const svg = createSvg(width, height, "pdf-chart-svg");
  svg.appendChild(svgEl("line", { x1: 0, y1: chartBottom, x2: width, y2: chartBottom, stroke: "#e2e8f0", "stroke-width": 1 }));

  hours.forEach((count, h) => {
    const x = h * slotWidth + (slotWidth - barWidth) / 2;
    const barH = (count / maxVal) * (chartBottom - chartTop);
    const isPeak = h === peakHour;
    const isDay = h >= 9 && h < 18;
    const fill = isPeak ? "#4f46e5" : isDay ? "#818cf8" : "#cbd5e1";

    svg.appendChild(svgEl("rect", { x, y: chartBottom - barH, width: barWidth, height: barH, rx: 3, fill }));
    if (h % 2 === 0) {
      svg.appendChild(svgEl("text", { x: x + barWidth / 2, y: chartBottom + 16, "text-anchor": "middle", "font-size": 10, fill: "#64748b", "font-weight": 600 }, [`${h}시`]));
    }
  });

  return svg;
}

function horizontalSvg(items: Array<{ label: string; value: number }>, barColor: string) {
  const width = 912;
  const rowHeight = 36;
  const height = Math.max(120, items.length * rowHeight + 12);
  const maxVal = Math.max(1, ...items.map((i) => i.value));
  const svg = createSvg(width, height, "pdf-chart-svg");

  items.forEach((item, i) => {
    const y = 8 + i * rowHeight;
    const barW = (item.value / maxVal) * 440;

    svg.appendChild(svgEl("text", { x: 0, y: y + 18, "font-size": 12, "font-weight": 700, fill: "#1e293b" }, [item.label]));
    svg.appendChild(svgEl("rect", { x: 400, y: y + 4, width: 440, height: 18, rx: 9, fill: "#f1f5f9" }));
    svg.appendChild(svgEl("rect", { x: 400, y: y + 4, width: Math.max(4, barW), height: 18, rx: 9, fill: barColor }));
    svg.appendChild(svgEl("text", { x: 890, y: y + 18, "font-size": 11.5, "font-weight": 800, fill: "#0f172a", "text-anchor": "end" }, [`${formatNumber(item.value)}건`]));
  });

  return svg;
}

// -------------------------------------------------------------
// DOM & FORMATTING HELPERS
// -------------------------------------------------------------
function kpiTile(label: string, val: string, badge?: { text: string; color: string }, sub?: string) {
  const tile = el("div", "pdf-kpi-tile", [
    el("span", "label", [label]),
    el("strong", "val", [val]),
  ]);
  if (badge) {
    const b = el("span", "pdf-kpi-badge", [badge.text]);
    b.style.color = badge.color;
    b.style.backgroundColor = badge.color === "#059669" ? "#ecfdf5" : badge.color === "#d97706" ? "#fffbeb" : "#fef2f2";
    b.style.borderColor = badge.color === "#059669" ? "#a7f3d0" : badge.color === "#d97706" ? "#fde68a" : "#fecdd3";
    tile.appendChild(b);
  }
  if (sub) {
    tile.appendChild(el("span", "sub", [sub]));
  }
  return tile;
}

function bulletList(items: string[]) {
  return el(
    "ul",
    "pdf-bullet-list",
    items.filter(Boolean).map((text) => el("li", "", [text])),
  );
}

function legendRow(items: Array<{ label: string; color: string; value: string }>) {
  const row = el("div", "", []);
  row.style.display = "flex";
  row.style.justifyContent = "center";
  row.style.gap = "18px";
  row.style.marginTop = "8px";
  row.style.fontSize = "11.5px";
  row.style.fontWeight = "700";

  items.forEach((item) => {
    const itemBox = el("div", "", []);
    itemBox.style.display = "flex";
    itemBox.style.alignItems = "center";
    itemBox.style.gap = "6px";

    const dot = el("span", "", []);
    dot.style.width = "10px";
    dot.style.height = "10px";
    dot.style.borderRadius = "3px";
    dot.style.background = item.color;

    itemBox.appendChild(dot);
    itemBox.appendChild(document.createTextNode(`${item.label} (${item.value})`));
    row.appendChild(itemBox);
  });

  return row;
}

function renderPdfTable(headers: string[], rows: string[][], colWidths?: string[]) {
  const wrapper = el("div", "pdf-table-wrapper", []);
  const table = el("table", "pdf-print-table", []);

  const thead = el("thead", "", []);
  const headerTr = el("tr", "", []);
  headers.forEach((h, i) => {
    const th = el("th", "", [h]);
    if (colWidths && colWidths[i]) th.style.width = colWidths[i];
    headerTr.appendChild(th);
  });
  thead.appendChild(headerTr);
  table.appendChild(thead);

  const tbody = el("tbody", "", []);
  if (rows.length > 0) {
    rows.forEach((r) => {
      const tr = el("tr", "", []);
      r.forEach((cell) => tr.appendChild(el("td", "", [cell])));
      tbody.appendChild(tr);
    });
  } else {
    const tr = el("tr", "", []);
    const td = document.createElement("td");
    td.className = "pdf-empty-td";
    td.colSpan = headers.length;
    td.style.textAlign = "center";
    td.style.padding = "20px";
    td.textContent = "조회된 데이터가 없습니다.";
    tr.appendChild(td);
    tbody.appendChild(tr);
  }
  table.appendChild(tbody);
  wrapper.appendChild(table);
  return wrapper;
}

export function summarizeReport(report: PdfReportInput) {
  const totalCount = report.daily.reduce((sum, row) => sum + row.total_count, 0);
  const matchedCount = report.daily.reduce((sum, row) => sum + row.matched_count, 0);
  const unmatchedCount = report.daily.reduce((sum, row) => sum + row.unmatched_count, 0);
  const friendCount = (report.channelFriendSummary || []).reduce((sum, row) => sum + (row.channel_friend_status === "friend" ? row.total_requests : 0), 0);
  const { hours, weekdays } = report.activity;
  return {
    totalCount, matchedCount, unmatchedCount, friendCount,
    matchRate: totalCount ? 100 * matchedCount / totalCount : 0,
    friendRate: totalCount ? 100 * friendCount / totalCount : 0,
    peakHour: totalCount ? hours.indexOf(Math.max(...hours)) : -1,
    nightCount: hours.reduce((sum, count, hour) => sum + (hour < 9 || hour >= 18 ? count : 0), 0),
    weekendCount: weekdays[0] + weekdays[6],
    brandBenchmark: calculateBrandHealth(report.daily, report.brands || []),
  };
}

export type ReportMetrics = ReturnType<typeof summarizeReport>;

export function buildReportInsights(report: PdfReportInput, metrics: ReportMetrics): string[] {
  if (!metrics.totalCount) return ["조회 기간의 문의가 없습니다."];
  const { activity } = report;
  const faq = report.faqSummary[0];
  const brand = metrics.brandBenchmark[0];
  return [
    `전체 문의 ${formatNumber(metrics.totalCount)}건 중 ${formatNumber(metrics.matchedCount)}건이 FAQ에 매칭되었습니다.`,
    `고객 ID가 있는 ${formatNumber(activity.users)}명 중 한 번만 문의한 고객은 ${formatNumber(activity.singleUsers)}명입니다.`,
    brand ? `문의가 가장 많은 브랜드는 ${brand.name}이며 총 ${formatNumber(brand.total)}건입니다.` : "브랜드 기록이 없습니다.",
    faq ? `가장 많이 매칭된 FAQ는 “${truncate(faq.faq_question || faq.category_name || "FAQ", 36)}”이며 ${formatNumber(faq.hit_count)}회입니다.` : "매칭된 FAQ가 없습니다.",
  ];
}

function getBrandReviewPriorityText(brandStats: BrandHealthStat[]): string {
  const priority = brandStats
    .filter((brand) => brand.isEvaluated)
    .sort((left, right) => left.rate - right.rate)[0];

  if (!priority) {
    return `평가 가능한 브랜드가 없습니다. 브랜드별 대화가 ${MIN_BRAND_HEALTH_SAMPLE}건 이상 쌓인 뒤 비교합니다.`;
  }

  return `[${priority.name}]의 응답 성공률은 ${priority.rate.toFixed(1)}%입니다. 미매칭 ${formatNumber(priority.unmatched)}건의 원문을 먼저 확인합니다.`;
}

function getMatchRate(row: ReportRow): number {
  return row.total_count ? (row.matched_count / row.total_count) * 100 : 0;
}

export function formatNumber(val: number): string {
  return new Intl.NumberFormat("ko-KR").format(val);
}

export function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1)}…`;
}

export function cleanQuery(query?: string | null): string {
  if (!query || query.trim() === "") {
    return "(질문 내용 없음 / 메뉴 선택)";
  }
  return query.trim();
}

export function formatScore(score?: number | null): string {
  if (score === null || score === undefined) return "-";
  const normalized = score > 100 ? score / 10 : score;
  return `${normalized.toFixed(1)}점`;
}

export function aggregateDailyByDate(daily: ReportRow[]): AggregatedDateRow[] {
  const map = new Map<string, { total: number; matched: number; unmatched: number }>();
  daily.forEach((r) => {
    const d = r.report_date || "Unknown";
    const existing = map.get(d) || { total: 0, matched: 0, unmatched: 0 };
    existing.total += r.total_count || 0;
    existing.matched += r.matched_count || 0;
    existing.unmatched += r.unmatched_count || 0;
    map.set(d, existing);
  });

  return Array.from(map.entries())
    .map(([date, counts]) => ({ date, ...counts }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

function el(tag: string, className = "", children: Array<Element | string> = []): HTMLElement {
  const element = document.createElement(tag);
  if (className) element.className = className;
  children.forEach((child) => {
    if (typeof child === "string") {
      element.appendChild(document.createTextNode(child));
    } else if (child) {
      element.appendChild(child);
    }
  });
  return element;
}

function createSvg(width: number, height: number, className = ""): SVGSVGElement {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  svg.setAttribute("width", String(width));
  svg.setAttribute("height", String(height));
  if (className) svg.setAttribute("class", className);
  return svg;
}

function svgEl(tag: string, attrs: Record<string, string | number> = {}, children: string[] = []): SVGElement {
  const element = document.createElementNS("http://www.w3.org/2000/svg", tag);
  Object.entries(attrs).forEach(([key, val]) => element.setAttribute(key, String(val)));
  children.forEach((child) => element.appendChild(document.createTextNode(child)));
  return element;
}

function addCanvasPage(pdf: JsPdfDocument, canvas: HTMLCanvasElement) {
  const pdfWidth = pdf.internal.pageSize.getWidth();
  const pdfHeight = pdf.internal.pageSize.getHeight();
  const imgData = canvas.toDataURL("image/jpeg", 0.95);
  pdf.addImage(imgData, "JPEG", 0, 0, pdfWidth, pdfHeight, undefined, "FAST");
}

async function waitForDocumentFonts() {
  if ("fonts" in document && document.fonts.ready) {
    await document.fonts.ready;
  }
}

async function nextPaint() {
  return new Promise<void>((resolve) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => resolve());
    });
  });
}
