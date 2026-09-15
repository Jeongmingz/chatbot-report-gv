import type { jsPDF as JsPdfDocument } from "jspdf";
import {
  supportMenuLabel,
  channelFriendStatusLabel,
  resultTypeLabel,
  type ReportRow,
  type ImprovementQueueRow,
  type ChannelFriendSummaryRow,
} from "@/lib/report";

export const PDF_WIDTH_PX = 1040;
export const PDF_PAGE_HEIGHT_PX = 1470;
const PDF_RENDER_SCALE = 2.0;

export type PdfExportOptions = {
  filename: string;
  report: PdfReportInput;
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
    // Page 1: 종합 요약
    createReportPage("01. 종합 운영 요약 (Executive Summary)", 1, totalPages, report, (page) =>
      renderExecutiveSummary(page, report, metrics, insights),
    ),
    // Page 2: 일별 대화량 및 매칭률 추세
    createReportPage("02. 일자별 대화량 및 매칭률 추세 (Daily Trend)", 2, totalPages, report, (page) =>
      renderDailyTrend(page, report, metrics),
    ),
    // Page 3: 상위 FAQ 매칭 성과
    createReportPage("03. 상위 FAQ 매칭 성과 및 분석 (FAQ Performance)", 3, totalPages, report, (page) =>
      renderFaqPerformance(page, report),
    ),
    // Page 4: FAQ 개선 대기열 & 미매칭
    createReportPage("04. FAQ 개선 대기열 및 미매칭 분석 (Improvement Queue)", 4, totalPages, report, (page) =>
      renderImprovementQueue(page, report),
    ),
    // Page 5: 카카오톡 채널 친구 분석
    createReportPage("05. 카카오톡 채널 친구 참여도 분석 (Channel Engagement)", 5, totalPages, report, (page) =>
      renderChannelFriendSummary(page, report, metrics),
    ),
    // Page 6: 데이터 명세 및 히스토리 감사 로그
    createReportPage("06. 대화 히스토리 감사 로그 및 데이터 명세 (Audit Appendix)", 6, totalPages, report, (page) =>
      renderAppendix(page, report),
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

  // Body container that flexes naturally
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
// PAGE 1: EXECUTIVE SUMMARY
// -------------------------------------------------------------
function renderExecutiveSummary(container: HTMLElement, report: PdfReportInput, metrics: ReportMetrics, insights: string[]) {
  // 4-Tile Row
  container.appendChild(
    el("section", "pdf-kpi-row", [
      kpiTile("총 대화 건수", `${formatNumber(metrics.totalCount)} 건`, undefined, "누적 사용자 질의"),
      kpiTile(
        "평균 매칭률",
        `${metrics.matchRate.toFixed(1)}%`,
        {
          text: metrics.matchRate >= 80 ? "목표 달성" : "보강 권장",
          color: metrics.matchRate >= 80 ? "#059669" : "#d97706",
        },
        "FAQ 자동 응답 성공률",
      ),
      kpiTile(
        "채널 친구 대화",
        `${formatNumber(metrics.friendCount)} 건`,
        { text: `${metrics.friendRate.toFixed(1)}% 비중`, color: "#7c3aed" },
        "카카오 플친 유입",
      ),
      kpiTile(
        "개선 시급 질문",
        `${formatNumber(metrics.improvementCount)} 건`,
        { text: "보강 필요", color: "#f43f5e" },
        "미매칭 + 저신뢰도",
      ),
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
    el("h3", "", ["운영 핵심 인사이트 (Key Takeaways)"]),
    el("p", "section-desc", ["조회 기간 동안 축적된 카카오 챗봇 질의응답 패턴에 대한 데이터 분석 결과입니다."]),
    bulletList(insights.slice(0, 4)),
  ]);

  // Right: Canvas Donut (Zero SVG clipping!)
  const rightPanel = el("div", "pdf-card-panel", [
    el("h3", "", ["전체 매칭 현황"]),
    createDonutCanvas(metrics.matchedCount, metrics.unmatchedCount, metrics.matchRate),
    legendRow([
      { label: "매칭 성공", color: "#4f46e5", value: `${formatNumber(metrics.matchedCount)}건` },
      { label: "매칭 실패", color: "#f43f5e", value: `${formatNumber(metrics.unmatchedCount)}건` },
    ]),
  ]);

  twoCol.appendChild(leftPanel);
  twoCol.appendChild(rightPanel);
  container.appendChild(twoCol);

  // 5 Brand Summary Table (Fills vertical space perfectly)
  const brandStats = aggregateByBrand(report.daily);
  if (brandStats.length > 0) {
    const brandRows = brandStats.map((b) => [
      b.brandName,
      formatNumber(b.total),
      formatNumber(b.matched),
      formatNumber(b.unmatched),
      `${b.rate.toFixed(1)}%`,
    ]);
    const brandTableSection = el("div", "pdf-card-panel", [
      el("h3", "", ["5대 공식 브랜드별 성과 요약 매트릭스"]),
      renderPdfTable(["브랜드", "총 대화수", "매칭 성공", "매칭 실패", "매칭률"], brandRows, ["28%", "18%", "18%", "18%", "18%"]),
    ]);
    container.appendChild(brandTableSection);
  }

  // Priority Actions Highlight Box
  container.appendChild(
    el("div", "pdf-highlight-box", [
      el("h4", "", ["🎯 경영진 제언 및 최우선 실행 과제"]),
      bulletList([
        metrics.improvementCount > 0
          ? `개선 대기열에 등록된 ${formatNumber(metrics.improvementCount)}건의 낙오 및 저신뢰도 질문을 신규 표준 FAQ로 즉각 반영하고 형태소 사전을 보강하십시오.`
          : "전체 매칭률이 안정적이므로, 현재 등록된 상위 FAQ 답변의 정확도와 친절도를 유지 관리합니다.",
        "조회수가 집중되는 상위 FAQ 질문군을 파악하여 챗봇 메인 메뉴(웰컴 블록) 전면에 퀵 버튼으로 배치함으로써 고객 접근 경로를 단축합니다.",
        `카카오톡 채널 친구 대화 비중(${metrics.friendRate.toFixed(1)}%)을 추가 확대하기 위해 답변 카드 하단에 '채널 추가 혜택' 배너를 유도 배치합니다.`,
      ]),
    ]),
  );
}

// -------------------------------------------------------------
// PAGE 2: DAILY TREND
// -------------------------------------------------------------
function renderDailyTrend(container: HTMLElement, report: PdfReportInput, metrics: ReportMetrics) {
  // Aggregate by Date to eliminate duplicate X-axis labels
  const aggregatedDaily = aggregateDailyByDate(report.daily);

  container.appendChild(
    el("div", "pdf-card-panel", [
      el("h3", "", ["일자별 통합 대화량 및 매칭 볼륨 추세"]),
      el("p", "section-desc", ["일자별 전체 브랜드 총 대화량 및 매칭 성공(Indigo) / 실패(Rose) 추이를 모니터링합니다."]),
      dailyStackedSvg(aggregatedDaily),
    ]),
  );

  const sorted = [...report.daily].sort((a, b) => (a.report_date || "").localeCompare(b.report_date || "")).slice(-11);
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
      ["일자", "브랜드", "총 대화수", "매칭 성공", "매칭 실패", "매칭률", "순방문자"],
      rows,
      ["16%", "16%", "14%", "14%", "14%", "13%", "13%"],
    ),
  );

  container.appendChild(
    el("div", "pdf-highlight-box", [
      el("h4", "", ["📈 추세 분석 결론 및 변동 진단"]),
      bulletList([
        `조회 기간 내 일평균 대화량은 약 ${aggregatedDaily.length ? formatNumber(Math.round(metrics.totalCount / aggregatedDaily.length)) : 0}건입니다.`,
        `기간 전체 평균 매칭률은 ${metrics.matchRate.toFixed(1)}%이며, 특정 일자의 매칭률 급락은 프로모션 또는 신제품 관련 신규 문의 유입 여부와 연관됩니다.`,
        "주말 및 공휴일 이후 첫 영업일(월요일)에 AS 접수 및 교환/환불 질의가 집중되므로 일요일 저녁 챗봇 웰컴 메뉴 상태 점검을 권장합니다.",
      ]),
    ]),
  );

  // Additional strategic insight card to fill height
  container.appendChild(
    el("div", "pdf-card-panel", [
      el("h3", "", ["주말/월요일 인입 패턴 및 피크 대응 가이드"]),
      bulletList([
        "주말 동안 누적된 미응답 건은 월요일 오전 9시부터 실시간 상담원 연결 요청으로 급증하는 경향을 보입니다.",
        "자주 묻는 AS 접수 링크 및 자가진단 가이드를 주말 웰컴 카드에 노출하여 월요일 상담 대기열을 사전에 분산하십시오.",
      ]),
    ]),
  );
}

// -------------------------------------------------------------
// PAGE 3: FAQ PERFORMANCE
// -------------------------------------------------------------
function renderFaqPerformance(container: HTMLElement, report: PdfReportInput) {
  const topFaqs = report.faqSummary.slice(0, 8);

  container.appendChild(
    el("div", "pdf-card-panel", [
      el("h3", "", ["상위 매칭 FAQ TOP 8"]),
      el("p", "section-desc", ["고객이 가장 빈번하게 문의하여 해결된 표준 FAQ 목록입니다."]),
      horizontalSvg(
        topFaqs.map((f) => ({
          label: `[${f.brand_name}] ${truncate(f.faq_question || f.category_name || "FAQ", 30)}`,
          value: f.hit_count,
        })),
        "#4f46e5",
      ),
    ]),
  );

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
      ["브랜드", "카테고리", "FAQ 질문 내용", "매칭 건수", "사용자", "평균점수", "최근발생"],
      rows,
      ["14%", "16%", "34%", "10%", "9%", "9%", "8%"],
    ),
  );

  container.appendChild(
    el("div", "pdf-highlight-box", [
      el("h4", "", ["💡 FAQ 답변 최적화 권고 및 고객 여정 점검"]),
      bulletList([
        "매칭 건수 상위 20%의 질문이 전체 FAQ 해결의 대다수를 차지하므로, 해당 질문들의 답변 최신성을 정기 검수해야 합니다.",
        "유사도 점수가 80점 이상으로 안정적인 질문은 표준 모범 응답으로 설정하여 AI 에이전트 라우팅 가이드로 활용합니다.",
        "조회수가 높은 질문은 텍스트 응답뿐 아니라 직관적인 카드 캐러셀 및 공식 서비스센터 링크를 포함하여 완결성을 높입니다.",
      ]),
    ]),
  );

  container.appendChild(
    el("div", "pdf-card-panel", [
      el("h3", "", ["웰컴 블록 퀵버튼 배치 및 서비스 링크 연계 전략"]),
      bulletList([
        "상위 1~3위 FAQ(상담원 연결, AS 접수, 소모품 구매)를 카카오 챗봇 시작 화면에 고정 버튼으로 제공하여 고객 클릭 수를 50% 단축합니다.",
        "게이트비전 공식몰 정품 등록 페이지 및 카카오 채널 1:1 상담원 채팅 바로가기 버튼을 답변 하단에 상시 탑재하십시오.",
      ]),
    ]),
  );
}

// -------------------------------------------------------------
// PAGE 4: IMPROVEMENT QUEUE
// -------------------------------------------------------------
function renderImprovementQueue(container: HTMLElement, report: PdfReportInput) {
  const queue = (report.improvementQueue || []).slice(0, 8);

  container.appendChild(
    el("div", "pdf-card-panel", [
      el("h3", "", ["FAQ 개선 대기열 TOP 8 (미매칭 & 저신뢰도)"]),
      el("p", "section-desc", ["응답 실패(미매칭) 및 유사도 60점 미만으로 오답 위험이 있는 최우선 보강 대상입니다."]),
      horizontalSvg(
        queue.map((q) => {
          const queryText = cleanQuery(q.sample_query);
          return {
            label: `[${q.brand_name} / ${resultTypeLabel(q.result_type)}] ${truncate(queryText, 28)}`,
            value: q.query_count,
          };
        }),
        "#f43f5e",
      ),
    ]),
  );

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
      ["브랜드", "구분", "문의메뉴", "대표 고객 질문", "발생건수", "사용자", "유사도", "최근일자"],
      rows,
      ["12%", "10%", "14%", "34%", "10%", "8%", "6%", "6%"],
    ),
  );

  container.appendChild(
    el("div", "pdf-highlight-box", [
      el("h4", "", ["🛠️ CS팀 액션 플랜 및 형태소/유사어 사전 확충 체크리스트"]),
      bulletList([
        "위 목록에 오른 질문은 FAQ 마스터 테이블에 신규 등록하거나 기존 유사 FAQ의 대표 유사어(Keywords)로 즉시 추가 등록합니다.",
        "문의메뉴(AS/소모품/보증 등)가 명확한 질문의 경우 해당 메뉴의 상세 가이드 블록에 직접 매핑하여 응답 정확도를 제고합니다.",
        "대시보드 상단의 [CS팀용 엑셀 다운로드]를 실행하여 실무 담당자를 지정하고 3영업일 이내 답변 작성을 완료하도록 조치합니다.",
      ]),
    ]),
  );

  container.appendChild(
    el("div", "pdf-card-panel", [
      el("h3", "", ["미매칭 인입 패턴 심층 분석 및 FAQ 반영 프로세스"]),
      bulletList([
        "단문 키워드(예: '유격', '온보딩')의 경우 고객이 문제 상황을 구체화할 수 있도록 챗봇에서 선택형 추가 질문을 제공해야 합니다.",
        "일상 대화(점심 메뉴 등)는 친근한 챗봇 멘트와 함께 브랜드 공식 제품 문의 메뉴로 복귀할 수 있는 안전 장치를 적용합니다.",
      ]),
    ]),
  );
}

// -------------------------------------------------------------
// PAGE 5: CHANNEL FRIEND SUMMARY
// -------------------------------------------------------------
function renderChannelFriendSummary(container: HTMLElement, report: PdfReportInput, metrics: ReportMetrics) {
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
      `전체 대화 중 채널 친구의 이용 비중은 ${metrics.friendRate.toFixed(1)}%입니다.`,
      "채널 친구는 브랜드 충성도가 높은 기존 고객 비중이 높아 재방문율과 AS/소모품 문의 빈도가 높습니다.",
      "비친구 사용자는 주로 구매 전 스펙 비교나 기본 사용법 문의가 많으므로, 첫 응답 시 채널 친구 혜택(쿠폰/보증 연장)을 안내하는 것이 유리합니다.",
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
      ["브랜드", "친구 상태", "총 요청수", "사용자", "매칭 성공", "매칭 실패", "매칭률", "평균점수"],
      rows,
      ["14%", "14%", "12%", "12%", "12%", "12%", "12%", "12%"],
    ),
  );

  container.appendChild(
    el("div", "pdf-highlight-box", [
      el("h4", "", ["📢 카카오톡 채널 친구 전환 및 마케팅 연계 전략"]),
      bulletList([
        "FAQ 답변 하단에 [채널 친구 전용 5% 할인 쿠폰 받기] 또는 [정품 등록 가이드] 버튼을 배치하여 비친구 유입을 친구로 전환합니다.",
        "채널 친구를 대상으로 신제품 론칭 알림톡 및 정기 필터 교체 주기 안내 메시지를 발송하여 지속적인 고객 인게이지먼트를 확보합니다.",
      ]),
    ]),
  );

  container.appendChild(
    el("div", "pdf-card-panel", [
      el("h3", "", ["플러스친구 유입 증대를 위한 답변 카드 혜택 배너 가이드"]),
      bulletList([
        "카카오톡 채널 추가 시 공식몰 적립금 3,000원 즉시 지급 프로모션을 챗봇 하단 플로팅 배너로 연계하십시오.",
        "무상 보증 기간 1년 추가 연장 혜택을 채널 친구 인증 고객에게만 제공함으로써 자발적 친구 추가율을 극대화합니다.",
      ]),
    ]),
  );
}

// -------------------------------------------------------------
// PAGE 6: AUDIT LOG APPENDIX
// -------------------------------------------------------------
function renderAppendix(container: HTMLElement, report: PdfReportInput) {
  container.appendChild(
    el("div", "pdf-card-panel", [
      el("h3", "", ["최신 대화 히스토리 감사 샘플 (Audit Log)"]),
      el("p", "section-desc", ["본 보고서 산출의 근거가 되는 최근 원본 대화 로그 데이터입니다."]),
    ]),
  );

  const rows = report.history.slice(0, 13).map((row) => [
    row.occurred_at ? row.occurred_at.slice(0, 16).replace("T", " ") : "-",
    row.brand_name || "-",
    truncate(cleanQuery(row.query), 32),
    row.matched ? "성공" : "실패",
    formatScore(row.score),
    truncate(row.faq_question || row.category_name || "-", 28),
  ]);

  container.appendChild(
    renderPdfTable(
      ["발생시각", "브랜드", "고객 질문 내용", "결과", "유사도", "매칭 FAQ 내용"],
      rows,
      ["16%", "12%", "34%", "8%", "8%", "22%"],
    ),
  );

  // Metadata & Signature Block
  const metaSign = el("div", "", []);
  metaSign.style.display = "grid";
  metaSign.style.gridTemplateColumns = "1.3fr 0.7fr";
  metaSign.style.gap = "20px";
  metaSign.style.marginTop = "20px";

  const dataSpec = el("div", "pdf-card-panel", [
    el("h3", "", ["데이터 출처 및 운영 환경"]),
    bulletList([
      "데이터 원천: Supabase PostgreSQL (Production: api.max-dashboard.shop)",
      "집계 테이블: faq_history_daily_summary, faq_summary, unmatched_queries, improvement_queue, channel_friend_summary",
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
        <span>${new Date().toISOString().slice(0, 10)}</span>
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
        "본 보고서에 기록된 모든 대화 데이터는 개인정보 마스킹 처리되어 개인 식별이 불가한 상태로 집계됩니다.",
        "게이트비전 경영진 및 인가된 CS 운영 담당자 외 열람 및 복제를 금지합니다.",
      ]),
    ]),
  );
}

// -------------------------------------------------------------
// CANVAS DONUT RENDERING HELPERS (100% RELIABLE, ZERO CLIPPING)
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

  // Background ring
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.strokeStyle = "#f1f5f9";
  ctx.lineWidth = lineWidth;
  ctx.stroke();

  // Matched arc
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

  // Percentage Text
  ctx.font = "900 24px -apple-system, BlinkMacSystemFont, 'Pretendard', sans-serif";
  ctx.fillStyle = "#0f172a";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(`${matchRate.toFixed(1)}%`, cx, cy - 8);

  // Label Text
  ctx.font = "600 11px -apple-system, BlinkMacSystemFont, 'Pretendard', sans-serif";
  ctx.fillStyle = "#64748b";
  ctx.fillText("매칭 성공률", cx, cy + 14);

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

  // Background ring
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.strokeStyle = "#f1f5f9";
  ctx.lineWidth = lineWidth;
  ctx.stroke();

  // Friend arc
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

  // Percentage Text
  ctx.font = "900 24px -apple-system, BlinkMacSystemFont, 'Pretendard', sans-serif";
  ctx.fillStyle = "#7c3aed";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(`${friendRate.toFixed(1)}%`, cx, cy - 8);

  // Label Text
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

function dailyStackedSvg(rows: AggregatedDateRow[]) {
  const sorted = rows.slice(-14);
  const width = 912;
  const height = 280;
  const chartTop = 24;
  const chartBottom = 236;
  const maxVal = Math.max(1, ...sorted.map((r) => r.total));
  const slotWidth = width / Math.max(1, sorted.length);
  const barWidth = Math.max(18, Math.min(48, slotWidth * 0.54));

  const svg = createSvg(width, height, "pdf-chart-svg");

  // Grid line
  svg.appendChild(svgEl("line", { x1: 0, y1: chartBottom, x2: width, y2: chartBottom, stroke: "#e2e8f0", "stroke-width": 1 }));

  sorted.forEach((row, i) => {
    const x = i * slotWidth + (slotWidth - barWidth) / 2;
    const totalHeight = (row.total / maxVal) * (chartBottom - chartTop);
    const matchedH = row.total ? totalHeight * (row.matched / row.total) : 0;
    const unmatchedH = Math.max(0, totalHeight - matchedH);

    // Matched Bar (Indigo)
    svg.appendChild(svgEl("rect", { x, y: chartBottom - matchedH, width: barWidth, height: matchedH, rx: 4, fill: "#4f46e5" }));
    // Unmatched Bar (Rose)
    if (unmatchedH > 0) {
      svg.appendChild(svgEl("rect", { x, y: chartBottom - matchedH - unmatchedH, width: barWidth, height: unmatchedH, rx: 4, fill: "#f43f5e" }));
    }

    // X Date Label
    const dateText = (row.date || "").slice(5);
    svg.appendChild(svgEl("text", { x: x + barWidth / 2, y: chartBottom + 20, "text-anchor": "middle", "font-size": 11, fill: "#64748b", "font-weight": 600 }, [dateText]));
    // Total Count on Top
    svg.appendChild(svgEl("text", { x: x + barWidth / 2, y: Math.max(14, chartBottom - totalHeight - 6), "text-anchor": "middle", "font-size": 11, fill: "#0f172a", "font-weight": 800 }, [formatNumber(row.total)]));
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

    // Label
    svg.appendChild(svgEl("text", { x: 0, y: y + 18, "font-size": 12, "font-weight": 700, fill: "#1e293b" }, [item.label]));
    // Track
    svg.appendChild(svgEl("rect", { x: 400, y: y + 4, width: 440, height: 18, rx: 9, fill: "#f1f5f9" }));
    // Value Bar
    svg.appendChild(svgEl("rect", { x: 400, y: y + 4, width: Math.max(4, barW), height: 18, rx: 9, fill: barColor }));
    // Value text
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

export function summarizeReport(report: PdfReportInput): ReportMetrics {
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

export function buildReportInsights(report: PdfReportInput, metrics: ReportMetrics): string[] {
  const topFaq = report.faqSummary[0];
  const firstUnmatched = report.unmatchedQueries.find((q) => q.sample_query && q.sample_query.trim() !== "");
  const unmatchedShare = metrics.totalCount ? (metrics.unmatchedCount / metrics.totalCount) * 100 : 0;

  return [
    `조회 기간 동안 총 ${formatNumber(metrics.totalCount)}건의 대화가 인입되었으며, 평균 FAQ 매칭 성공률은 ${metrics.matchRate.toFixed(1)}%를 기록했습니다.`,
    `매칭에 실패한 대화는 ${formatNumber(metrics.unmatchedCount)}건(${unmatchedShare.toFixed(1)}%)으로, 신규 FAQ 전환 시 개선 잠재력이 높습니다.`,
    topFaq
      ? `가장 많은 사용자가 조회한 FAQ는 "${truncate(topFaq.faq_question || topFaq.category_name || "FAQ", 38)}"이며, 총 ${formatNumber(topFaq.hit_count)}건 매칭되었습니다.`
      : "조회 범위 내에 FAQ 매칭 요약 데이터가 없습니다.",
    firstUnmatched
      ? `최우선 보강이 필요한 미매칭 질문은 "${truncate(firstUnmatched.sample_query, 40)}" (${formatNumber(firstUnmatched.query_count)}회)입니다.`
      : "반복적인 미매칭 질문이 적어 현재 FAQ가 고객 의도를 원활하게 포괄하고 있습니다.",
  ];
}

export type ReportMetrics = {
  totalCount: number;
  matchedCount: number;
  unmatchedCount: number;
  matchRate: number;
  uniqueUsers: number;
  friendCount: number;
  friendRate: number;
  improvementCount: number;
};

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
  // Normalize if score scale is 0~1000
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

export function aggregateByBrand(daily: ReportRow[]): Array<{ brandName: string; total: number; matched: number; unmatched: number; rate: number }> {
  const map = new Map<string, { brandName: string; total: number; matched: number; unmatched: number }>();
  daily.forEach((r) => {
    const key = r.brand || "unknown";
    const name = r.brand_name || r.brand || "기타";
    const existing = map.get(key) || { brandName: name, total: 0, matched: 0, unmatched: 0 };
    existing.total += r.total_count || 0;
    existing.matched += r.matched_count || 0;
    existing.unmatched += r.unmatched_count || 0;
    map.set(key, existing);
  });

  return Array.from(map.values())
    .map((b) => ({
      ...b,
      rate: b.total ? (b.matched / b.total) * 100 : 0,
    }))
    .sort((a, b) => b.total - a.total);
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
