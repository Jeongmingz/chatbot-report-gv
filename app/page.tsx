"use client";

import {
  ArcElement,
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  Filler,
  Legend,
  LinearScale,
  LineElement,
  PointElement,
  Tooltip,
} from "chart.js";
import type { ChartOptions } from "chart.js";
import { useEffect, useMemo, useState } from "react";
import { Bar, Doughnut, Line } from "react-chartjs-2";
import {
  brandLabel,
  matchRate,
  shortDate,
  sortByDate,
  supportMenuLabel,
  channelFriendStatusLabel,
  channelFriendTone,
  confidenceTone,
  resultTypeLabel,
  type ReportRow,
  type FaqSummaryRow,
  type UnmatchedQueryRow,
  type ImprovementQueueRow,
  type ChannelFriendSummaryRow,
  type HistoryRow,
} from "@/lib/report";
import { exportDashboardPdf } from "@/lib/pdf-export";
import { ReportPreviewModal } from "@/app/components/report-preview-modal";
import { downloadUnmatchedCsv, copyUnmatchedSummaryText, copySingleQueryText } from "@/lib/export-utils";

ChartJS.register(ArcElement, BarElement, CategoryScale, Filler, Legend, LinearScale, LineElement, PointElement, Tooltip);

// Custom Chart.js Center Text Plugin for Doughnut Charts
const centerTextPlugin = {
  id: "centerText",
  beforeDraw(chart: ChartJS) {
    const plugins = chart.config.options?.plugins as Record<string, unknown> | undefined;
    const centerConfig = plugins?.centerText as { text?: string; subtext?: string; color?: string; subcolor?: string } | undefined;
    if (!centerConfig || !centerConfig.text) return;

    const { ctx, chartArea } = chart;
    if (!chartArea) return;

    ctx.save();
    const centerX = (chartArea.left + chartArea.right) / 2;
    const centerY = (chartArea.top + chartArea.bottom) / 2;

    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    ctx.font = "800 24px -apple-system, BlinkMacSystemFont, sans-serif";
    ctx.fillStyle = centerConfig.color || "#0f172a";
    ctx.fillText(centerConfig.text, centerX, centerConfig.subtext ? centerY - 9 : centerY);

    if (centerConfig.subtext) {
      ctx.font = "600 11px -apple-system, BlinkMacSystemFont, sans-serif";
      ctx.fillStyle = centerConfig.subcolor || "#64748b";
      ctx.fillText(centerConfig.subtext, centerX, centerY + 14);
    }
    ctx.restore();
  },
};

ChartJS.register(centerTextPlugin);

type DashboardData = {
  daily: ReportRow[];
  faqSummary: FaqSummaryRow[];
  unmatchedQueries: UnmatchedQueryRow[];
  improvementQueue: ImprovementQueueRow[];
  channelFriendSummary: ChannelFriendSummaryRow[];
  history: HistoryRow[];
};

type ActiveTab = "daily" | "faq" | "unmatched" | "improvement" | "channelFriend" | "history";
type PresetPeriod = "today" | "7d" | "30d" | "month" | "custom";

type BrandOption = {
  brand: string;
  brand_name: string;
};

const numberFormat = new Intl.NumberFormat("ko-KR");

export default function Home() {
  const [activePreset, setActivePreset] = useState<PresetPeriod>("7d");
  const [from, setFrom] = useState(() => getPresetDates("7d").from);
  const [to, setTo] = useState(() => getPresetDates("7d").to);
  const [brand, setBrand] = useState("");
  const [limit, setLimit] = useState("100");
  const [activeTab, setActiveTab] = useState<ActiveTab>("daily");
  const [searchQuery, setSearchQuery] = useState("");

  const [brands, setBrands] = useState<BrandOption[]>([]);
  const [isLoadingBrands, setIsLoadingBrands] = useState(false);
  const [data, setData] = useState<DashboardData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [isSendingEmail, setIsSendingEmail] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(""), 3600);
    return () => window.clearTimeout(timer);
  }, [notice]);

  // Load available brands
  useEffect(() => {
    async function loadBrands() {
      setIsLoadingBrands(true);
      try {
        const response = await fetch("/api/brands", { cache: "no-store" });
        const payload = (await response.json()) as { brands?: BrandOption[]; error?: string };
        if (!response.ok) throw new Error(payload.error || "브랜드 목록을 불러오지 못했습니다.");
        setBrands(payload.brands || []);
      } catch (err) {
        setError(err instanceof Error ? err.message : "브랜드 목록을 불러오는 중 오류가 발생했습니다.");
      } finally {
        setIsLoadingBrands(false);
      }
    }
    void loadBrands();
  }, []);

  // Handle Preset selection
  function handlePresetChange(preset: PresetPeriod) {
    setActivePreset(preset);
    if (preset !== "custom") {
      const dates = getPresetDates(preset);
      setFrom(dates.from);
      setTo(dates.to);
    }
  }

  // Load Dashboard data from Supabase API
  async function loadDashboard() {
    setError("");
    setNotice("");
    setIsLoading(true);

    try {
      const params = new URLSearchParams({ limit });
      if (from) params.set("from", from);
      if (to) params.set("to", to);
      if (brand.trim()) params.set("brand", brand.trim());

      const response = await fetch(`/api/reports?${params.toString()}`, { cache: "no-store" });
      const payload = (await response.json()) as Partial<DashboardData> & { error?: string };

      if (!response.ok) {
        throw new Error(payload.error || "DB 데이터를 불러오지 못했습니다.");
      }

      const nextData = {
        daily: payload.daily || [],
        faqSummary: payload.faqSummary || [],
        unmatchedQueries: payload.unmatchedQueries || [],
        improvementQueue: payload.improvementQueue || [],
        channelFriendSummary: payload.channelFriendSummary || [],
        history: payload.history || [],
      };

      setData(nextData);
      setNotice(
        `데이터 로드 완료: 일일 ${numberFormat.format(nextData.daily.length)}건 / FAQ ${numberFormat.format(nextData.faqSummary.length)}건 / 미매칭 ${numberFormat.format(nextData.unmatchedQueries.length)}건 / 개선대기열 ${numberFormat.format(nextData.improvementQueue.length)}건 / 채널친구 ${numberFormat.format(nextData.channelFriendSummary.length)}건`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "DB 데이터를 불러오는 중 오류가 발생했습니다.");
    } finally {
      setIsLoading(false);
    }
  }

  // Auto load on initial mount
  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadDashboard();
    }, 0);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Open High-Resolution C-Level Report Preview & Vector Print Modal
  function exportPdf() {
    if (!data) return;
    setError("");
    setIsPreviewOpen(true);
  }

  // Send Daily Briefing Email to on_gv@gatevision.co.kr
  async function triggerEmailReport() {
    setError("");
    setNotice("");
    setIsSendingEmail(true);

    try {
      const params = new URLSearchParams();
      if (brand.trim()) params.set("brand", brand.trim());

      const response = await fetch(`/api/email/daily-report?${params.toString()}`, {
        method: "POST",
      });
      const payload = (await response.json()) as { success: boolean; message?: string; error?: string };

      if (!response.ok || !payload.success) {
        throw new Error(payload.error || "이메일 발송에 실패했습니다.");
      }

      setNotice(payload.message || "on_gv@gatevision.co.kr로 이메일 브리핑이 발송되었습니다!");
    } catch (err) {
      setError(err instanceof Error ? err.message : "이메일 발송 중 오류가 발생했습니다.");
    } finally {
      setIsSendingEmail(false);
    }
  }

  const summary = useMemo(() => summarize(data), [data]);

  return (
    <main className="app-shell">
      {/* PDF Export Spinner Overlay */}
      <div className={`pdf-loading-overlay ${isExporting ? "active" : ""}`} aria-hidden={!isExporting}>
        <div className="pdf-spinner" />
        <div className="pdf-spinner-text">고화질 6페이지 C-Level 리포트 렌더링 중...</div>
      </div>

      {/* Top Bar */}
      <TopBar />

      {/* Filter Control Panel */}
      <FilterPanel
        from={from}
        to={to}
        brand={brand}
        brands={brands}
        limit={limit}
        activePreset={activePreset}
        isLoading={isLoading}
        isLoadingBrands={isLoadingBrands}
        onPresetChange={handlePresetChange}
        onFromChange={(val) => {
          setFrom(val);
          setActivePreset("custom");
        }}
        onToChange={(val) => {
          setTo(val);
          setActivePreset("custom");
        }}
        onBrandChange={setBrand}
        onLimitChange={setLimit}
        onLoad={loadDashboard}
        onExport={exportPdf}
        canExport={Boolean(data)}
        onSendEmail={triggerEmailReport}
        isSendingEmail={isSendingEmail}
      />

      {/* Error & Toast Banners */}
      {error && (
        <div className="alert-box alert-error">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          <span>{error}</span>
        </div>
      )}

      {notice && (
        <div className="toast-notice">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2.5">
            <polyline points="20 6 9 17 4 12" />
          </svg>
          <span>{notice}</span>
        </div>
      )}

      {/* Dashboard Section */}
      {data ? (
        <section id="pdfContent">
          {/* KPI Cards Grid */}
          <div className="kpi-grid">
            <KpiCard
              title="총 대화량"
              value={numberFormat.format(summary.totalCount)}
              unit="건"
              subtext="누적 대화 건수"
              theme="indigo"
              percent={100}
              icon="💬"
            />
            <KpiCard
              title="매칭 성공"
              value={numberFormat.format(summary.matchedCount)}
              unit="건"
              subtext="FAQ 자동 응답 성공"
              theme="blue"
              percent={summary.matchRate}
              icon="🎯"
            />
            <KpiCard
              title="매칭 실패"
              value={numberFormat.format(summary.unmatchedCount)}
              unit="건"
              subtext="미매칭 낙오 질문"
              theme="rose"
              percent={summary.totalCount ? (summary.unmatchedCount / summary.totalCount) * 100 : 0}
              icon="⚠️"
            />
            <KpiCard
              title="평균 매칭률"
              value={summary.matchRate.toFixed(1)}
              unit="%"
              subtext={summary.matchRate >= 80 ? "목표치 양호 (80%+)" : "FAQ 보강 권장"}
              theme={summary.matchRate >= 80 ? "emerald" : summary.matchRate >= 60 ? "amber" : "rose"}
              percent={summary.matchRate}
              icon="📈"
            />
            <KpiCard
              title="채널 친구 대화"
              value={numberFormat.format(summary.friendRequests)}
              unit="건"
              subtext={`전체의 ${summary.friendRate.toFixed(1)}%`}
              theme="purple"
              percent={summary.friendRate}
              icon="👥"
            />
            <KpiCard
              title="개선 시급 질문"
              value={numberFormat.format(summary.improvementCount)}
              unit="건"
              subtext={`${summary.improvementTypes}종 항목`}
              theme={summary.improvementCount > 0 ? "amber" : "emerald"}
              percent={summary.improvementCount > 0 ? Math.min(100, summary.improvementCount * 5) : 0}
              icon="⚡"
            />
          </div>

          {/* Charts Row 1: 대화량 추세 & 매칭 현황 도넛 */}
          <div className="charts-grid">
            <div className="chart-card">
              <div className="chart-header">
                <div className="chart-title-group">
                  <h3>일자별 대화량 추이</h3>
                  <p>일별 매칭 성공(Indigo) 및 미매칭(Rose) 볼륨 비교</p>
                </div>
              </div>
              <div className="chart-canvas-box">
                <Bar data={dailyVolumeChart(data.daily)} options={stackedBarOptions} />
              </div>
            </div>

            <div className="chart-card">
              <div className="chart-header">
                <div className="chart-title-group">
                  <h3>전체 매칭 현황</h3>
                  <p>전체 대화 중 성공과 실패 비중</p>
                </div>
              </div>
              <div className="chart-canvas-box">
                <Doughnut
                  data={matchDoughnutChart(summary.matchedCount, summary.unmatchedCount)}
                  options={doughnutOptions(summary.matchRate, summary.totalCount)}
                />
              </div>
            </div>
          </div>

          {/* Charts Row 2: 매칭률 곡선 & 카카오 친구 도넛 */}
          <div className="charts-grid">
            <div className="chart-card">
              <div className="chart-header">
                <div className="chart-title-group">
                  <h3>일자별 매칭률 추이 (%)</h3>
                  <p>스무스 베지에 곡선과 80% 목표선</p>
                </div>
              </div>
              <div className="chart-canvas-box">
                <Line data={dailyRateChart(data.daily)} options={smoothLineOptions} />
              </div>
            </div>

            <div className="chart-card">
              <div className="chart-header">
                <div className="chart-title-group">
                  <h3>카카오톡 채널 친구 구성</h3>
                  <p>채널 친구 vs 비친구 유입 비중</p>
                </div>
              </div>
              <div className="chart-canvas-box">
                <Doughnut
                  data={channelFriendDoughnutChart(data.channelFriendSummary)}
                  options={channelFriendDoughnutOptions(summary.friendRate, summary.totalCount)}
                />
              </div>
            </div>
          </div>

          {/* Charts Row 3: 개선 대기열 TOP 5 & 미매칭 TOP 5 */}
          <div className="charts-grid">
            <div className="chart-card">
              <div className="chart-header">
                <div className="chart-title-group">
                  <h3>FAQ 개선 대기열 TOP 5</h3>
                  <p>미매칭 및 저신뢰도(60점 미만) 최우선 보강 질문</p>
                </div>
              </div>
              <ImprovementRankList rows={data.improvementQueue.slice(0, 5)} />
            </div>

            <div className="chart-card">
              <div className="chart-header">
                <div className="chart-title-group">
                  <h3>상위 미매칭 질문 TOP 5</h3>
                  <p>빈도수가 높은 낙오 질문 목록</p>
                </div>
              </div>
              <UnmatchedRankList rows={data.unmatchedQueries.slice(0, 5)} />
            </div>
          </div>

          {/* Table Controls: Segmented Tabs + Instant Search */}
          <div className="tabs-control-bar">
            <div className="segmented-tabs" role="tablist">
              <button
                type="button"
                className={`segmented-tab ${activeTab === "daily" ? "active" : ""}`}
                onClick={() => setActiveTab("daily")}
              >
                일일 요약
                <span className="tab-badge">{data.daily.length}</span>
              </button>
              <button
                type="button"
                className={`segmented-tab ${activeTab === "faq" ? "active" : ""}`}
                onClick={() => setActiveTab("faq")}
              >
                FAQ 매칭 성과
                <span className="tab-badge">{data.faqSummary.length}</span>
              </button>
              <button
                type="button"
                className={`segmented-tab ${activeTab === "unmatched" ? "active" : ""}`}
                onClick={() => setActiveTab("unmatched")}
              >
                미매칭 질문
                <span className="tab-badge">{data.unmatchedQueries.length}</span>
              </button>
              <button
                type="button"
                className={`segmented-tab ${activeTab === "improvement" ? "active" : ""}`}
                onClick={() => setActiveTab("improvement")}
              >
                개선 대기열
                <span className="tab-badge">{data.improvementQueue.length}</span>
              </button>
              <button
                type="button"
                className={`segmented-tab ${activeTab === "channelFriend" ? "active" : ""}`}
                onClick={() => setActiveTab("channelFriend")}
              >
                채널 친구 분석
                <span className="tab-badge">{data.channelFriendSummary.length}</span>
              </button>
              <button
                type="button"
                className={`segmented-tab ${activeTab === "history" ? "active" : ""}`}
                onClick={() => setActiveTab("history")}
              >
                원본 히스토리
                <span className="tab-badge">{data.history.length}</span>
              </button>
            </div>

            {/* Instant Search Bar */}
            <div className="table-search-box">
              <svg className="search-icon-left" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              <input
                type="text"
                className="table-search-input"
                placeholder="현재 탭 데이터 검색..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
              {searchQuery && (
                <span className="search-clear-right" onClick={() => setSearchQuery("")}>
                  ✕
                </span>
              )}
            </div>
          </div>

          {/* Active Data Table */}
          {activeTab === "daily" && (
            <DataTable
              title="일일 대화 및 매칭 요약 (faq_history_daily_summary)"
              rows={filterRows(data.daily, searchQuery, ["report_date", "brand_name", "brand"])}
              columns={dailyColumns}
            />
          )}
          {activeTab === "faq" && (
            <DataTable
              title="FAQ별 매칭 성과 (faq_history_faq_summary)"
              rows={filterRows(data.faqSummary, searchQuery, ["brand_name", "category_name", "faq_question"])}
              columns={faqColumns}
            />
          )}
          {activeTab === "unmatched" && (
            <DataTable
              title="미매칭 질문 분석 (faq_history_unmatched_queries)"
              rows={filterRows(data.unmatchedQueries, searchQuery, ["brand_name", "sample_query", "menu_id"])}
              columns={unmatchedColumns}
              headerActions={
                <>
                  <button
                    type="button"
                    className="btn btn-csv"
                    onClick={() => {
                      try {
                        downloadUnmatchedCsv(data.unmatchedQueries, {
                          brandLabel: brand ? brands.find((b) => b.brand === brand)?.brand_name : "전체 브랜드",
                          from,
                          to,
                        });
                        setNotice("CS팀용 엑셀(CSV) 다운로드가 완료되었습니다.");
                      } catch (err) {
                        setError(err instanceof Error ? err.message : "다운로드 실패");
                      }
                    }}
                  >
                    📥 CS팀용 엑셀 다운로드
                  </button>
                  <button
                    type="button"
                    className="btn btn-copy"
                    onClick={async () => {
                      try {
                        await copyUnmatchedSummaryText(data.unmatchedQueries, {
                          brandLabel: brand ? brands.find((b) => b.brand === brand)?.brand_name : "전체 브랜드",
                          from,
                          to,
                        });
                        setNotice("메신저 공유용 요약 텍스트가 클립보드에 복사되었습니다. (Ctrl+V로 붙여넣기)");
                      } catch (err) {
                        setError(err instanceof Error ? err.message : "복사 실패");
                      }
                    }}
                  >
                    📋 메신저 요약 복사
                  </button>
                </>
              }
            />
          )}
          {activeTab === "improvement" && (
            <DataTable
              title="FAQ 개선 대기열 (faq_history_improvement_queue)"
              rows={filterRows(data.improvementQueue, searchQuery, ["brand_name", "sample_query", "menu_id", "result_type"])}
              columns={improvementColumns}
              headerActions={
                <>
                  <button
                    type="button"
                    className="btn btn-csv"
                    onClick={() => {
                      try {
                        downloadUnmatchedCsv(data.improvementQueue, {
                          brandLabel: brand ? brands.find((b) => b.brand === brand)?.brand_name : "전체 브랜드",
                          from,
                          to,
                        });
                        setNotice("개선 대기열 엑셀(CSV) 다운로드가 완료되었습니다.");
                      } catch (err) {
                        setError(err instanceof Error ? err.message : "다운로드 실패");
                      }
                    }}
                  >
                    📥 CS팀용 엑셀 다운로드
                  </button>
                  <button
                    type="button"
                    className="btn btn-copy"
                    onClick={async () => {
                      try {
                        await copyUnmatchedSummaryText(data.improvementQueue, {
                          brandLabel: brand ? brands.find((b) => b.brand === brand)?.brand_name : "전체 브랜드",
                          from,
                          to,
                        });
                        setNotice("개선 대기열 요약 텍스트가 클립보드에 복사되었습니다. (Ctrl+V로 붙여넣기)");
                      } catch (err) {
                        setError(err instanceof Error ? err.message : "복사 실패");
                      }
                    }}
                  >
                    📋 메신저 요약 복사
                  </button>
                </>
              }
            />
          )}
          {activeTab === "channelFriend" && (
            <DataTable
              title="카카오톡 채널 친구 요약 (faq_history_channel_friend_summary)"
              rows={filterRows(data.channelFriendSummary, searchQuery, ["brand_name", "channel_friend_status"])}
              columns={channelFriendColumns}
            />
          )}
          {activeTab === "history" && (
            <DataTable
              title="대화 원본 히스토리 로그 (faq_history)"
              rows={filterRows(data.history, searchQuery, ["brand_name", "query", "faq_question", "category_name"])}
              columns={historyColumns}
            />
          )}
        </section>
      ) : (
        <section className="dashboard-empty">
          <div className="dashboard-empty-icon">📊</div>
          <h2>조회된 히스토리 데이터가 없습니다.</h2>
          <p>상단의 기간 및 브랜드 필터를 설정한 후 [DB 데이터 조회] 버튼을 눌러주세요.</p>
        </section>
      )}

      {/* C-Level Report Preview & Vector Print Modal */}
      {data && (
        <ReportPreviewModal
          isOpen={isPreviewOpen}
          onClose={() => setIsPreviewOpen(false)}
          report={{
            filters: {
              from,
              to,
              brandLabel: brand ? brands.find((item) => item.brand === brand)?.brand_name || brand : "전체 브랜드 (5대 브랜드 통합)",
              limit,
            },
            daily: data.daily,
            faqSummary: data.faqSummary,
            unmatchedQueries: data.unmatchedQueries,
            improvementQueue: data.improvementQueue,
            channelFriendSummary: data.channelFriendSummary,
            history: data.history,
          }}
        />
      )}
    </main>
  );
}

// Top Bar Component
function TopBar() {
  return (
    <header className="top-bar">
      <div className="logo-area">
        <div className="logo-icon-box">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
        </div>
        <div className="logo-title-group">
          <h1>
            게이트비전 챗봇 운영 센터
            <span className="system-badge">
              <span className="pulse-dot" />
              Supabase Live
            </span>
          </h1>
          <div className="logo-subtitle">5대 브랜드 카카오 챗봇 실시간 분석 및 품질 고도화 플랫폼</div>
        </div>
      </div>
      <div className="top-bar-meta">
        <span className="system-tag">Enterprise Analytics v2.0</span>
      </div>
    </header>
  );
}

// Filter Control Panel
function FilterPanel({
  from,
  to,
  brand,
  brands,
  limit,
  activePreset,
  isLoading,
  isLoadingBrands,
  onPresetChange,
  onFromChange,
  onToChange,
  onBrandChange,
  onLimitChange,
  onLoad,
  onExport,
  canExport,
  onSendEmail,
  isSendingEmail,
}: {
  from: string;
  to: string;
  brand: string;
  brands: BrandOption[];
  limit: string;
  activePreset: PresetPeriod;
  isLoading: boolean;
  isLoadingBrands: boolean;
  onPresetChange: (preset: PresetPeriod) => void;
  onFromChange: (val: string) => void;
  onToChange: (val: string) => void;
  onBrandChange: (val: string) => void;
  onLimitChange: (val: string) => void;
  onLoad: () => void;
  onExport: () => void;
  canExport: boolean;
  onSendEmail: () => void;
  isSendingEmail: boolean;
}) {
  return (
    <section className="filter-card">
      <div className="filter-header-row">
        {/* Quick Presets */}
        <div className="preset-group">
          <span className="preset-title">기간 프리셋:</span>
          <button
            type="button"
            className={`preset-btn ${activePreset === "today" ? "active" : ""}`}
            onClick={() => onPresetChange("today")}
          >
            오늘
          </button>
          <button
            type="button"
            className={`preset-btn ${activePreset === "7d" ? "active" : ""}`}
            onClick={() => onPresetChange("7d")}
          >
            최근 7일
          </button>
          <button
            type="button"
            className={`preset-btn ${activePreset === "30d" ? "active" : ""}`}
            onClick={() => onPresetChange("30d")}
          >
            최근 30일
          </button>
          <button
            type="button"
            className={`preset-btn ${activePreset === "month" ? "active" : ""}`}
            onClick={() => onPresetChange("month")}
          >
            이번 달
          </button>
          {activePreset === "custom" && <span className="preset-btn active">사용자 지정</span>}
        </div>

        {/* Action Buttons */}
        <div className="action-buttons">
          <button className="btn btn-primary" type="button" onClick={onLoad} disabled={isLoading}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <ellipse cx="12" cy="5" rx="9" ry="3" />
              <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3" />
              <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" />
            </svg>
            {isLoading ? "데이터 조회 중..." : "DB 데이터 조회"}
          </button>
          <button className="btn btn-email" type="button" onClick={onSendEmail} disabled={isSendingEmail}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
              <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
              <polyline points="22,6 12,13 2,6" />
            </svg>
            {isSendingEmail ? "이메일 발송 중..." : "이메일 브리핑 전송"}
          </button>
          <button className="btn btn-pdf" type="button" onClick={onExport} disabled={!canExport}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
              <line x1="16" y1="13" x2="8" y2="13" />
              <line x1="16" y1="17" x2="8" y2="17" />
              <polyline points="10 9 9 9 8 9" />
            </svg>
            C-Level PDF 리포트
          </button>
        </div>
      </div>

      {/* Input Filters Grid */}
      <div className="filter-inputs-grid">
        <div className="input-field">
          <label>조회 시작일</label>
          <input type="date" value={from} onChange={(e) => onFromChange(e.target.value)} />
        </div>
        <div className="input-field">
          <label>조회 종료일</label>
          <input type="date" value={to} onChange={(e) => onToChange(e.target.value)} />
        </div>
        <div className="input-field">
          <label>브랜드 선택</label>
          <select value={brand} onChange={(e) => onBrandChange(e.target.value)} disabled={isLoadingBrands}>
            <option value="">전체 브랜드 (5대 브랜드 통합)</option>
            {brands.map((b) => (
              <option value={b.brand} key={b.brand}>
                {b.brand_name} ({b.brand})
              </option>
            ))}
          </select>
        </div>
        <div className="input-field">
          <label>표시 제한 건수</label>
          <select value={limit} onChange={(e) => onLimitChange(e.target.value)}>
            <option value="50">50건</option>
            <option value="100">100건 (권장)</option>
            <option value="200">200건</option>
            <option value="500">500건</option>
          </select>
        </div>
      </div>
    </section>
  );
}

// KPI Card
function KpiCard({
  title,
  value,
  unit,
  subtext,
  theme,
  percent,
  icon,
}: {
  title: string;
  value: string;
  unit: string;
  subtext: string;
  theme: "indigo" | "blue" | "emerald" | "amber" | "rose" | "purple";
  percent: number;
  icon: string;
}) {
  return (
    <div className={`kpi-card theme-${theme}`}>
      <div>
        <div className="kpi-header">
          <span className="kpi-title">{title}</span>
          <span className="kpi-icon-pill">{icon}</span>
        </div>
        <div className="kpi-value-row">
          <span className="kpi-number">{value}</span>
          <span className="kpi-unit">{unit}</span>
        </div>
      </div>
      <div>
        <div className="kpi-subtext">{subtext}</div>
        <div className="kpi-progress">
          <div className="kpi-progress-bar" style={{ width: `${Math.min(100, Math.max(0, percent))}%` }} />
        </div>
      </div>
    </div>
  );
}

// Ranked List Components
function ImprovementRankList({ rows }: { rows: ImprovementQueueRow[] }) {
  if (!rows.length) {
    return <div className="empty-state-cell">개선 대기열에 등록된 항목이 없습니다.</div>;
  }
  return (
    <div className="rank-list">
      {rows.map((row, idx) => (
        <div className="rank-item" key={`${row.brand}-${row.query_key}-${idx}`}>
          <span className="rank-number">{idx + 1}</span>
          <div className="rank-content">
            <div className="rank-primary-text">{row.sample_query}</div>
            <div className="rank-meta">
              <span className={`rank-score-pill ${row.result_type === "unmatched" ? "danger" : "warning"}`}>
                {resultTypeLabel(row.result_type)}
              </span>
              <span>{row.brand_name}</span>
              {row.menu_id && <span>• {supportMenuLabel(row.menu_id)}</span>}
              {row.avg_score !== null && <span>• 유사도 {row.avg_score.toFixed(1)}점</span>}
            </div>
          </div>
          <span className="rank-count">{row.query_count}회</span>
        </div>
      ))}
    </div>
  );
}

function UnmatchedRankList({ rows }: { rows: UnmatchedQueryRow[] }) {
  if (!rows.length) {
    return <div className="empty-state-cell">미매칭 질문 데이터가 없습니다.</div>;
  }
  return (
    <div className="rank-list">
      {rows.map((row, idx) => (
        <div className="rank-item" key={`${row.brand}-${row.sample_query}-${idx}`}>
          <span className="rank-number">{idx + 1}</span>
          <div className="rank-content">
            <div className="rank-primary-text">{row.sample_query}</div>
            <div className="rank-meta">
              <span>{row.brand_name}</span>
              {row.menu_id && <span>• {supportMenuLabel(row.menu_id)}</span>}
              <span>• 사용자 {row.unique_user_count}명</span>
            </div>
          </div>
          <span className="rank-count">{row.query_count}회</span>
        </div>
      ))}
    </div>
  );
}

// Generic Data Table Component
type Column<T> = {
  key: keyof T | string;
  label: string;
  render?: (row: T) => React.ReactNode;
};

function DataTable<T extends Record<string, unknown>>({
  title,
  rows,
  columns,
  headerActions,
}: {
  title: string;
  rows: T[];
  columns: Array<Column<T>>;
  headerActions?: React.ReactNode;
}) {
  return (
    <div className="data-table-card">
      <div className="data-table-header">
        <h4 className="data-table-title">
          {title}
          <span className="row-count-badge">{numberFormat.format(rows.length)}건</span>
        </h4>
        {headerActions && <div className="table-action-header-tools">{headerActions}</div>}
      </div>
      <div className="data-table-scroll">
        <table className="data-table">
          <thead>
            <tr>
              {columns.map((c) => (
                <th key={String(c.key)}>{c.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length > 0 ? (
              rows.map((row, rIdx) => (
                <tr key={rIdx}>
                  {columns.map((c) => (
                    <td key={String(c.key)}>{c.render ? c.render(row) : formatCell(row[c.key])}</td>
                  ))}
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={columns.length} className="empty-state-cell">
                  조건에 일치하는 데이터가 없습니다.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// Helpers
function formatCell(val: unknown): string {
  if (val === null || val === undefined || val === "") return "-";
  if (typeof val === "number") return numberFormat.format(val);
  if (typeof val === "boolean") return val ? "예" : "아니오";
  return String(val);
}

function filterRows<T extends Record<string, unknown>>(rows: T[], query: string, fields: Array<keyof T>): T[] {
  if (!query.trim()) return rows;
  const q = query.toLowerCase().trim();
  return rows.filter((row) =>
    fields.some((field) => {
      const val = row[field];
      return val !== null && val !== undefined && String(val).toLowerCase().includes(q);
    }),
  );
}

function getPresetDates(preset: PresetPeriod): { from: string; to: string } {
  const now = new Date();
  const to = now.toISOString().slice(0, 10);

  if (preset === "today") {
    return { from: to, to };
  }
  if (preset === "7d") {
    const d = new Date(now);
    d.setDate(d.getDate() - 6);
    return { from: d.toISOString().slice(0, 10), to };
  }
  if (preset === "30d") {
    const d = new Date(now);
    d.setDate(d.getDate() - 29);
    return { from: d.toISOString().slice(0, 10), to };
  }
  if (preset === "month") {
    const d = new Date(now.getFullYear(), now.getMonth(), 1);
    return { from: d.toISOString().slice(0, 10), to };
  }
  return { from: to, to };
}

function summarize(data: DashboardData | null) {
  if (!data) {
    return {
      totalCount: 0,
      matchedCount: 0,
      unmatchedCount: 0,
      matchRate: 0,
      friendRequests: 0,
      friendRate: 0,
      improvementCount: 0,
      improvementTypes: 0,
    };
  }

  const totalCount = data.daily.reduce((sum, row) => sum + row.total_count, 0);
  const matchedCount = data.daily.reduce((sum, row) => sum + row.matched_count, 0);
  const unmatchedCount = data.daily.reduce((sum, row) => sum + row.unmatched_count, 0);
  const rate = totalCount ? (matchedCount / totalCount) * 100 : 0;

  const friends = data.channelFriendSummary.filter((f) => f.channel_friend_status === "friend");
  const friendRequests = friends.reduce((sum, f) => sum + f.total_requests, 0);
  const friendRate = totalCount ? (friendRequests / totalCount) * 100 : 0;

  const improvementCount = data.improvementQueue.reduce((sum, i) => sum + i.query_count, 0);
  const improvementTypes = data.improvementQueue.length;

  return {
    totalCount,
    matchedCount,
    unmatchedCount,
    matchRate: rate,
    friendRequests,
    friendRate,
    improvementCount,
    improvementTypes,
  };
}

// Chart Options & Data Builders
const stackedBarOptions: ChartOptions<"bar"> = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: {
      position: "top",
      labels: { font: { family: "Pretendard", weight: 600, size: 12 }, boxWidth: 12, boxHeight: 12, borderRadius: 3, useBorderRadius: true },
    },
    tooltip: {
      backgroundColor: "rgba(15, 23, 42, 0.94)",
      titleFont: { family: "Pretendard", weight: 700, size: 13 },
      bodyFont: { family: "Pretendard", size: 12 },
      padding: 12,
      cornerRadius: 8,
    },
  },
  scales: {
    x: {
      stacked: true,
      grid: { display: false },
      ticks: { font: { size: 11, family: "Pretendard" }, color: "#64748b" },
    },
    y: {
      stacked: true,
      grid: { color: "#f1f5f9" },
      ticks: { font: { size: 11, family: "Pretendard" }, color: "#64748b" },
    },
  },
};

const smoothLineOptions: ChartOptions<"line"> = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: { display: false },
    tooltip: {
      backgroundColor: "rgba(15, 23, 42, 0.94)",
      titleFont: { family: "Pretendard", weight: 700, size: 13 },
      bodyFont: { family: "Pretendard", size: 12 },
      padding: 12,
      cornerRadius: 8,
      callbacks: {
        label: (ctx) => `매칭률: ${ctx.parsed.y !== null && ctx.parsed.y !== undefined ? ctx.parsed.y.toFixed(1) : 0}%`,
      },
    },
  },
  scales: {
    x: {
      grid: { display: false },
      ticks: { font: { size: 11, family: "Pretendard" }, color: "#64748b" },
    },
    y: {
      min: 0,
      max: 100,
      grid: { color: "#f1f5f9" },
      ticks: {
        font: { size: 11, family: "Pretendard" },
        color: "#64748b",
        callback: (v) => `${v}%`,
      },
    },
  },
};

function doughnutOptions(matchRate: number, total: number): ChartOptions<"doughnut"> {
  return {
    responsive: true,
    maintainAspectRatio: false,
    cutout: "74%",
    plugins: {
      legend: {
        position: "bottom",
        labels: { font: { family: "Pretendard", weight: 600, size: 12 }, boxWidth: 10, boxHeight: 10, borderRadius: 2, useBorderRadius: true },
      },
      tooltip: {
        backgroundColor: "rgba(15, 23, 42, 0.94)",
        padding: 10,
        cornerRadius: 8,
      },
      ...({
        centerText: {
          text: `${matchRate.toFixed(1)}%`,
          subtext: `총 ${numberFormat.format(total)}건`,
          color: "#0f172a",
          subcolor: "#64748b",
        },
      } as Record<string, unknown>),
    },
  };
}

function channelFriendDoughnutOptions(friendRate: number, total: number): ChartOptions<"doughnut"> {
  return {
    responsive: true,
    maintainAspectRatio: false,
    cutout: "74%",
    plugins: {
      legend: {
        position: "bottom",
        labels: { font: { family: "Pretendard", weight: 600, size: 12 }, boxWidth: 10, boxHeight: 10, borderRadius: 2, useBorderRadius: true },
      },
      tooltip: {
        backgroundColor: "rgba(15, 23, 42, 0.94)",
        padding: 10,
        cornerRadius: 8,
      },
      ...({
        centerText: {
          text: `${friendRate.toFixed(1)}%`,
          subtext: "친구 대화 비중",
          color: "#7c3aed",
          subcolor: "#64748b",
        },
      } as Record<string, unknown>),
    },
  };
}

function dailyVolumeChart(rows: ReportRow[]) {
  const sorted = sortByDate(rows).slice(-14);
  return {
    labels: sorted.map((r) => shortDate(r.report_date)),
    datasets: [
      {
        label: "매칭 성공",
        data: sorted.map((r) => r.matched_count),
        backgroundColor: "#4f46e5",
        borderRadius: 6,
      },
      {
        label: "매칭 실패",
        data: sorted.map((r) => r.unmatched_count),
        backgroundColor: "#f43f5e",
        borderRadius: 6,
      },
    ],
  };
}

function matchDoughnutChart(matched: number, unmatched: number) {
  return {
    labels: ["매칭 성공", "매칭 실패"],
    datasets: [
      {
        data: [matched, unmatched],
        backgroundColor: ["#4f46e5", "#f43f5e"],
        borderWidth: 0,
        hoverOffset: 4,
      },
    ],
  };
}

function dailyRateChart(rows: ReportRow[]) {
  const sorted = sortByDate(rows).slice(-14);
  return {
    labels: sorted.map((r) => shortDate(r.report_date)),
    datasets: [
      {
        label: "매칭률 (%)",
        data: sorted.map((r) => Number(matchRate(r).toFixed(1))),
        borderColor: "#059669",
        backgroundColor: "rgba(5, 150, 105, 0.08)",
        borderWidth: 2.5,
        tension: 0.35,
        fill: true,
        pointBackgroundColor: "#059669",
        pointRadius: 4,
        pointHoverRadius: 6,
      },
    ],
  };
}

function channelFriendDoughnutChart(friends: ChannelFriendSummaryRow[]) {
  const friendCount = friends.filter((f) => f.channel_friend_status === "friend").reduce((s, f) => s + f.total_requests, 0);
  const otherCount = friends.filter((f) => f.channel_friend_status !== "friend").reduce((s, f) => s + f.total_requests, 0);

  return {
    labels: ["카카오 채널 친구", "비친구 / 미확인"],
    datasets: [
      {
        data: [friendCount, otherCount],
        backgroundColor: ["#7c3aed", "#cbd5e1"],
        borderWidth: 0,
        hoverOffset: 4,
      },
    ],
  };
}

// Table Column Definitions
const dailyColumns: Array<Column<ReportRow>> = [
  { key: "report_date", label: "일자", render: (r) => <strong>{r.report_date}</strong> },
  { key: "brand_name", label: "브랜드", render: (r) => <span className="menu-badge">{r.brand_name || r.brand}</span> },
  { key: "total_count", label: "총 대화수", render: (r) => numberFormat.format(r.total_count) },
  { key: "matched_count", label: "매칭 성공", render: (r) => <span style={{ color: "#2563eb", fontWeight: 700 }}>{numberFormat.format(r.matched_count)}</span> },
  { key: "unmatched_count", label: "매칭 실패", render: (r) => <span style={{ color: "#e11d48", fontWeight: 700 }}>{numberFormat.format(r.unmatched_count)}</span> },
  {
    key: "match_rate",
    label: "매칭률",
    render: (r) => {
      const rate = matchRate(r);
      const tone = rate >= 80 ? "success" : rate >= 60 ? "warning" : "danger";
      return <span className={`status-pill ${tone}`}>{rate.toFixed(1)}%</span>;
    },
  },
  { key: "unique_user_count", label: "방문자수", render: (r) => numberFormat.format(r.unique_user_count || 0) },
];

const faqColumns: Array<Column<FaqSummaryRow>> = [
  { key: "brand_name", label: "브랜드", render: (r) => <span className="menu-badge">{r.brand_name}</span> },
  { key: "category_name", label: "카테고리", render: (r) => r.category_name || "-" },
  { key: "faq_question", label: "FAQ 질문", render: (r) => <span className="query-cell">{r.faq_question || "-"}</span> },
  { key: "hit_count", label: "매칭 건수", render: (r) => <strong style={{ color: "#4f46e5" }}>{numberFormat.format(r.hit_count)}</strong> },
  { key: "unique_user_count", label: "사용자수", render: (r) => numberFormat.format(r.unique_user_count) },
  {
    key: "avg_score",
    label: "평균 유사도",
    render: (r) => (r.avg_score !== null ? `${r.avg_score.toFixed(1)}점` : "-"),
  },
  { key: "last_occurred_at", label: "최근 매칭 일시", render: (r) => (r.last_occurred_at ? r.last_occurred_at.slice(0, 16).replace("T", " ") : "-") },
];

const unmatchedColumns: Array<Column<UnmatchedQueryRow>> = [
  { key: "brand_name", label: "브랜드", render: (r) => <span className="menu-badge">{r.brand_name}</span> },
  { key: "menu_id", label: "문의 메뉴", render: (r) => (r.menu_id ? <span className="status-pill neutral">{supportMenuLabel(r.menu_id)}</span> : "-") },
  {
    key: "sample_query",
    label: "고객 질문",
    render: (r) => (
      <span className="query-cell">
        {r.sample_query}
        <button
          type="button"
          className="copy-inline-btn"
          title="질문 텍스트 복사"
          onClick={() => void copySingleQueryText(r.sample_query)}
        >
          복사
        </button>
      </span>
    ),
  },
  { key: "query_count", label: "발생 건수", render: (r) => <strong style={{ color: "#e11d48" }}>{numberFormat.format(r.query_count)}</strong> },
  { key: "unique_user_count", label: "사용자수", render: (r) => numberFormat.format(r.unique_user_count) },
  { key: "last_occurred_at", label: "최근 발생 일시", render: (r) => (r.last_occurred_at ? r.last_occurred_at.slice(0, 16).replace("T", " ") : "-") },
];

const improvementColumns: Array<Column<ImprovementQueueRow>> = [
  { key: "brand_name", label: "브랜드", render: (r) => <span className="menu-badge">{r.brand_name}</span> },
  {
    key: "result_type",
    label: "구분",
    render: (r) => (
      <span className={`status-pill ${r.result_type === "unmatched" ? "danger" : "warning"}`}>
        {resultTypeLabel(r.result_type)}
      </span>
    ),
  },
  { key: "menu_id", label: "문의 메뉴", render: (r) => (r.menu_id ? <span className="status-pill neutral">{supportMenuLabel(r.menu_id)}</span> : "-") },
  {
    key: "sample_query",
    label: "대표 질문",
    render: (r) => (
      <span className="query-cell">
        {r.sample_query}
        <button
          type="button"
          className="copy-inline-btn"
          title="질문 텍스트 복사"
          onClick={() => void copySingleQueryText(r.sample_query)}
        >
          복사
        </button>
      </span>
    ),
  },
  { key: "query_count", label: "발생 건수", render: (r) => <strong style={{ color: "#e11d48" }}>{numberFormat.format(r.query_count)}</strong> },
  { key: "unique_user_count", label: "사용자수", render: (r) => numberFormat.format(r.unique_user_count) },
  {
    key: "avg_score",
    label: "평균 점수",
    render: (r) => {
      if (r.avg_score === null || r.avg_score === undefined) return "-";
      const tone = confidenceTone(r.avg_score);
      return <span className={`status-pill ${tone}`}>{r.avg_score.toFixed(1)}점</span>;
    },
  },
  { key: "last_occurred_at", label: "최근 발생 일시", render: (r) => (r.last_occurred_at ? r.last_occurred_at.slice(0, 16).replace("T", " ") : "-") },
];

const channelFriendColumns: Array<Column<ChannelFriendSummaryRow>> = [
  { key: "brand_name", label: "브랜드", render: (r) => <span className="menu-badge">{r.brand_name}</span> },
  {
    key: "channel_friend_status",
    label: "친구 상태",
    render: (r) => {
      const tone = channelFriendTone(r.channel_friend_status);
      return <span className={`status-pill ${tone}`}>{channelFriendStatusLabel(r.channel_friend_status)}</span>;
    },
  },
  { key: "total_requests", label: "총 요청수", render: (r) => numberFormat.format(r.total_requests) },
  { key: "unique_users", label: "사용자수", render: (r) => numberFormat.format(r.unique_users) },
  { key: "matched_requests", label: "매칭 성공", render: (r) => numberFormat.format(r.matched_requests) },
  { key: "unmatched_requests", label: "매칭 실패", render: (r) => numberFormat.format(r.unmatched_requests) },
  {
    key: "match_rate_pct",
    label: "매칭률",
    render: (r) => {
      const tone = r.match_rate_pct >= 80 ? "success" : r.match_rate_pct >= 60 ? "warning" : "danger";
      return <span className={`status-pill ${tone}`}>{r.match_rate_pct.toFixed(1)}%</span>;
    },
  },
  {
    key: "avg_score",
    label: "평균 점수",
    render: (r) => (r.avg_score !== null && r.avg_score !== undefined ? `${r.avg_score.toFixed(1)}점` : "-"),
  },
];

const historyColumns: Array<Column<HistoryRow>> = [
  {
    key: "occurred_at",
    label: "일시",
    render: (r) => <span style={{ color: "#64748b", fontSize: "11px" }}>{r.occurred_at ? r.occurred_at.slice(0, 19).replace("T", " ") : "-"}</span>,
  },
  { key: "brand_name", label: "브랜드", render: (r) => <span className="menu-badge">{r.brand_name}</span> },
  { key: "query", label: "고객 질문", render: (r) => <span className="query-cell">{r.query}</span> },
  {
    key: "matched",
    label: "매칭 결과",
    render: (r) => (
      <span className={`status-pill ${r.matched ? "success" : "danger"}`}>
        {r.matched ? "매칭 성공" : "매칭 실패"}
      </span>
    ),
  },
  {
    key: "score",
    label: "점수",
    render: (r) => {
      const tone = confidenceTone(r.score);
      return <span className={`status-pill ${tone}`}>{r.score.toFixed(1)}</span>;
    },
  },
  { key: "faq_question", label: "매칭 FAQ", render: (r) => r.faq_question || r.category_name || "-" },
];
