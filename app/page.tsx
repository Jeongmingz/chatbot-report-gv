"use client";

import dynamic from "next/dynamic";
import { useCallback, useDeferredValue, useEffect, useMemo, useState } from "react";
import { AnalysisOverview } from "./components/analysis-overview";
import "./analysis.css";
import {
  matchRate,
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
import { presetDates as getPresetDates } from "@/lib/report-period";
import type { Activity } from "@/lib/period-report";
import type { KpiDrilldownType } from "./components/kpi-drilldown-modal";
import { downloadUnmatchedCsv, copyUnmatchedSummaryText, copySingleQueryText } from "@/lib/export-utils";

const ReportPreviewModal = dynamic(() => import("./components/report-preview-modal").then(m => m.ReportPreviewModal));
const KpiDrilldownModal = dynamic(() => import("./components/kpi-drilldown-modal").then(m => m.KpiDrilldownModal));
const OperationalInsights = dynamic(() => import("./components/operational-insights").then(m => m.OperationalInsights));

type DashboardData = {
  activity: Activity;
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

const screens = [
  { id: "overview", label: "분석 개요", path: "M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z" },
  { id: "operations", label: "운영 진단", path: "M2 12h5l3-7 4 14 3-7h5" },
  { id: "records", label: "상세 데이터", path: "M3 4h18v16H3z M3 10h18 M9 10v10" },
] as const;

const numberFormat = new Intl.NumberFormat("ko-KR");

export default function Home() {
  const [activePreset, setActivePreset] = useState<PresetPeriod>("7d");
  const [from, setFrom] = useState(() => getPresetDates("7d").from);
  const [to, setTo] = useState(() => getPresetDates("7d").to);
  const [brand, setBrand] = useState("");
  const [limit, setLimit] = useState("100");
  const [activeTab, setActiveTab] = useState<ActiveTab>("daily");
  const [searchQuery, setSearchQuery] = useState("");

  const [view, setView] = useState<"overview" | "operations" | "records">("overview");
  const [previousPeriod, setPreviousPeriod] = useState<{ from: string; to: string; preset: PresetPeriod } | null>(null);
  const search = useDeferredValue(searchQuery);

  const [brands, setBrands] = useState<BrandOption[]>([]);
  const [isLoadingBrands, setIsLoadingBrands] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const filterKey = JSON.stringify([from, to, brand, limit, refresh]);
  const [result, setResult] = useState<{ key: string; data: DashboardData } | null>(null);
  const data = result?.key === filterKey ? result.data : null;
  const scopedBrands = brand ? brands.filter(item => item.brand === brand) : brands;
  const [isLoading, setIsLoading] = useState(false);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [drilldownType, setDrilldownType] = useState<KpiDrilldownType | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [currentUser, setCurrentUser] = useState<{
    name: string;
    email: string;
    role: string;
    team: string;
    title: string;
  } | null>(null);

  useEffect(() => {
    async function loadUser() {
      try {
        const res = await fetch("/api/auth/me");
        if (res.ok) {
          const payload = await res.json();
          if (payload.user) {
            setCurrentUser(payload.user);
          }
        }
      } catch {
        // ignore
      }
    }
    void loadUser();
  }, []);

  async function handleLogout() {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } finally {
      window.location.href = "/login";
    }
  }

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
  }, [refresh]);

  // Handle Preset selection
  function handlePresetChange(preset: PresetPeriod) {
    setPreviousPeriod(null);
    setActivePreset(preset);
    if (preset !== "custom") {
      const dates = getPresetDates(preset);
      setFrom(dates.from);
      setTo(dates.to);
    }
  }

  // Load Dashboard data from Supabase API
  const loadDashboard = useCallback(async (signal: AbortSignal) => {
    setError("");
    setIsLoading(true);

    try {
      const params = new URLSearchParams({ limit });
      if (from) params.set("from", from);
      if (to) params.set("to", to);
      if (brand.trim()) params.set("brand", brand.trim());

      const response = await fetch(`/api/reports?${params.toString()}`, { cache: "no-store", signal });
      const payload = (await response.json()) as Partial<DashboardData> & { error?: string };

      if (signal.aborted) return;
      if (response.status === 401) {
        window.location.replace("/login");
        return;
      }
      if (!response.ok) {
        throw new Error(payload.error || "DB 데이터를 불러오지 못했습니다.");
      }

      if (!payload.activity) throw new Error("리포트 집계 정보가 누락되었습니다.");
      const nextData: DashboardData = {
        activity: payload.activity,
        daily: payload.daily || [],
        faqSummary: payload.faqSummary || [],
        unmatchedQueries: payload.unmatchedQueries || [],
        improvementQueue: payload.improvementQueue || [],
        channelFriendSummary: payload.channelFriendSummary || [],
        history: payload.history || [],
      };
      setResult({ key: filterKey, data: nextData });
    } catch (err) {
      if (signal.aborted) return;
      setResult(null);
      setError(err instanceof Error ? err.message : "DB 데이터를 불러오는 중 오류가 발생했습니다.");
    } finally {
      if (!signal.aborted) setIsLoading(false);
    }
  }, [from, to, brand, limit, filterKey]);

  // Auto load whenever filters (from, to, brand, limit) change with slight debounce
  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      void loadDashboard(controller.signal);
    }, 150);
    return () => { controller.abort(); window.clearTimeout(timer); };
  }, [loadDashboard]);

  // Open High-Resolution C-Level Report Preview & Vector Print Modal
  function exportPdf() {
    if (!data?.daily.length) return;
    setError("");
    setIsPreviewOpen(true);
  }

  const summary = useMemo(() => summarize(data), [data]);

  const visibleUnmatched = filterRows(data?.unmatchedQueries || [], search, ["brand_name", "sample_query", "menu_id"]);
  const visibleImprovements = filterRows(data?.improvementQueue || [], search, ["brand_name", "sample_query", "menu_id", "result_type"]);

  return (
    <div className="app-shell analysis-shell workspace">
      <a href="#workspace-content" className="skip-content">본문으로 이동</a>
      <aside className="workspace-rail">
        <div className="workspace-brand"><span className="workspace-mark" aria-hidden="true" /><span className="workspace-wordmark">GATEVISION</span></div>
        <div className="workspace-product">챗봇 문의 분석</div>
        <nav aria-label="분석 화면" className="workspace-nav">
          {screens.map(screen => <button type="button" key={screen.id} aria-current={view === screen.id ? "page" : undefined} onClick={() => setView(screen.id)}>
            <svg aria-hidden="true" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round"><path d={screen.path} /></svg>
            {screen.label}
          </button>)}
        </nav>
      </aside>
      <main className="workspace-body" id="workspace-content" tabIndex={-1}>
      {/* Top Bar */}
      <TopBar title={screens.find(screen => screen.id === view)!.label} user={currentUser} onLogout={handleLogout} />

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
          setPreviousPeriod(null);
          setFrom(val);
          setActivePreset("custom");
        }}
        onToChange={(val) => {
          setPreviousPeriod(null);
          setTo(val);
          setActivePreset("custom");
        }}
        onBrandChange={setBrand}
        onLimitChange={setLimit}
        onExport={exportPdf}
        canExport={Boolean(data?.daily.length)}
      />

      {/* Error & Toast Banners */}
      {error && (
        <div className="alert-box alert-error" role="alert">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          <span>{error}</span>
          <button type="button" className="btn" disabled={isLoading} onClick={() => setRefresh(value => value + 1)}>다시 조회</button>
        </div>
      )}

      {notice && (
        <div className="toast-notice" role="status">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2.5">
            <polyline points="20 6 9 17 4 12" />
          </svg>
          <span>{notice}</span>
        </div>
      )}

      {previousPeriod && (
        <button className="analysis-return" type="button" onClick={() => {
          setFrom(previousPeriod.from);
          setTo(previousPeriod.to);
          setActivePreset(previousPeriod.preset);
          setPreviousPeriod(null);
          setView("overview");
        }}>← 이전 조회 기간으로 돌아가기</button>
      )}
      {data && data.daily.length > 0 ? (
        <section id="pdfContent">
          {view === "overview" && <AnalysisOverview
            daily={data.daily} activity={data.activity} unmatched={data.unmatchedQueries}
            summary={summary} onMetric={setDrilldownType}
            onRecords={(query) => { setActiveTab("unmatched"); setSearchQuery(query); setView("records"); }}
            onDay={day => {
              if (from !== day || to !== day) setPreviousPeriod({ from, to, preset: activePreset });
              setFrom(day); setTo(day); setActivePreset("custom");
              setSearchQuery(""); setActiveTab("unmatched"); setView("records");
            }}
          />}
          {view === "operations" && <OperationalInsights
            activity={data.activity} unmatchedQueries={data.unmatchedQueries} channelFriendSummary={data.channelFriendSummary}
            daily={data.daily} brands={scopedBrands} totalCount={summary.totalCount}
          />}
          {view === "records" && <>
          {/* Table Controls: Segmented Tabs + Instant Search */}
          <div className="tabs-control-bar">
            <div className="segmented-tabs" role="group" aria-label="상세 데이터 종류">
              <button
                type="button"
                className={`segmented-tab ${activeTab === "daily" ? "active" : ""}`}
                aria-pressed={activeTab === "daily"}
                onClick={() => setActiveTab("daily")}
              >
                일별 운영 현황
                <span className="tab-badge">{data.daily.length}</span>
              </button>
              <button
                type="button"
                className={`segmented-tab ${activeTab === "faq" ? "active" : ""}`}
                aria-pressed={activeTab === "faq"}
                onClick={() => setActiveTab("faq")}
              >
                FAQ별 응답 성과
                <span className="tab-badge">{data.faqSummary.length}</span>
              </button>
              <button
                type="button"
                className={`segmented-tab ${activeTab === "unmatched" ? "active" : ""}`}
                aria-pressed={activeTab === "unmatched"}
                onClick={() => setActiveTab("unmatched")}
              >
                미매칭 고객 문의
                <span className="tab-badge">{data.unmatchedQueries.length}</span>
              </button>
              <button
                type="button"
                className={`segmented-tab ${activeTab === "improvement" ? "active" : ""}`}
                aria-pressed={activeTab === "improvement"}
                onClick={() => setActiveTab("improvement")}
              >
                우선 개선 필요 문의
                <span className="tab-badge">{data.improvementQueue.length}</span>
              </button>
              <button
                type="button"
                className={`segmented-tab ${activeTab === "channelFriend" ? "active" : ""}`}
                aria-pressed={activeTab === "channelFriend"}
                onClick={() => setActiveTab("channelFriend")}
              >
                채널 친구 유입 분석
                <span className="tab-badge">{data.channelFriendSummary.length}</span>
              </button>
              <button
                type="button"
                className={`segmented-tab ${activeTab === "history" ? "active" : ""}`}
                aria-pressed={activeTab === "history"}
                onClick={() => setActiveTab("history")}
              >
                상담 대화 원본 로그
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
                aria-label="현재 표 검색"
                placeholder="현재 탭 데이터 검색..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
              {searchQuery && (
                <button type="button" aria-label="검색어 지우기" className="search-clear-right" onClick={() => setSearchQuery("")}>
                  ✕
                </button>
              )}
            </div>
          </div>

          {/* Active Data Table */}
          {activeTab === "daily" && (
            <DataTable key={activeTab + search}
              title="일별 챗봇 운영 성과 내역"
              rows={filterRows(data.daily, search, ["report_date", "brand_name", "brand"])}
              columns={dailyColumns}
            />
          )}
          {activeTab === "faq" && (
            <DataTable key={activeTab + search}
              title="FAQ별 고객 응답 성과 내역"
              rows={filterRows(data.faqSummary, search, ["brand_name", "category_name", "faq_question"])}
              columns={faqColumns}
            />
          )}
          {activeTab === "unmatched" && (
            <DataTable key={activeTab + search}
              title="미매칭 고객 문의 상세 내역"
              rows={visibleUnmatched}
              columns={unmatchedColumns}
              headerActions={
                <>
                  <button
                    type="button"
                    className="btn btn-csv"
                    onClick={() => {
                      try {
                        downloadUnmatchedCsv(visibleUnmatched, {
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
                        await copyUnmatchedSummaryText(visibleUnmatched, {
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
            <DataTable key={activeTab + search}
              title="우선 보강 필요 질문 대기열"
              rows={visibleImprovements}
              columns={improvementColumns}
              headerActions={
                <>
                  <button
                    type="button"
                    className="btn btn-csv"
                    onClick={() => {
                      try {
                        downloadUnmatchedCsv(visibleImprovements, {
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
                        await copyUnmatchedSummaryText(visibleImprovements, {
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
            <DataTable key={activeTab + search}
              title="카카오톡 채널 친구 유입 및 성과 분석"
              rows={filterRows(data.channelFriendSummary, search, ["brand_name", "channel_friend_status"])}
              columns={channelFriendColumns}
            />
          )}
          {activeTab === "history" && (
            <DataTable key={activeTab + search}
              title="상담 대화 기록"
              rows={filterRows(data.history, search, ["brand_name", "query", "faq_question", "category_name"])}
              columns={historyColumns}
            />
          )}
          </>}
        </section>
      ) : (
        <section className="dashboard-empty" role="status">
          <h2>{error ? "조회 상태를 확인해 주세요." : data ? "선택 기간의 상담 기록이 없습니다." : "리포트를 조회하고 있습니다."}</h2>
          {data && !data.daily.length && <p>조회 기간이나 브랜드를 바꿔 다시 확인하세요.</p>}
        </section>
      )}

      </main>

      {/* KPI Drilldown Detail & Excel Export Modal */}
      {data && drilldownType && (
        <KpiDrilldownModal
          key={filterKey + drilldownType}
          isOpen={Boolean(drilldownType)}
          onClose={() => setDrilldownType(null)}
          type={drilldownType}
          brandLabel={brand ? brands.find((item) => item.brand === brand)?.brand_name || brand : "전체 브랜드"}
          from={from}
          to={to}
          data={data}
        />
      )}

      {/* C-Level Report Preview & Vector Print Modal */}
      {data && isPreviewOpen && (
        <ReportPreviewModal
          isOpen={isPreviewOpen}
          onClose={() => setIsPreviewOpen(false)}
          report={{
            filters: {
              from,
              to,
              brandLabel: brand ? brands.find((item) => item.brand === brand)?.brand_name || brand : "전체 브랜드",
              limit,
            },
            brands: scopedBrands,
            activity: data.activity,
            daily: data.daily,
            faqSummary: data.faqSummary,
            unmatchedQueries: data.unmatchedQueries,
            improvementQueue: data.improvementQueue,
            channelFriendSummary: data.channelFriendSummary,
            history: data.history,
          }}
        />
      )}
    </div>
  );
}

// Top Bar Component
function TopBar({
  title,
  user,
  onLogout,
}: {
  title: string;
  user: { name: string; role: string; team: string; title: string; email: string } | null;
  onLogout: () => void;
}) {
  return (
    <header className="top-bar">
      <div className="logo-area">
        <div className="logo-title-group">
          <h1>{title}</h1>
          <div className="logo-subtitle">카카오톡 상담 채널</div>
        </div>
      </div>
      <div className="top-bar-meta">
        <div className="top-bar-right-group">
          {user && (
            <div className="top-bar-user-badge">
              <div className="user-avatar-circle">
                {user.name ? user.name[0] : "U"}
              </div>
              <div className="user-info-text">
                <span className="user-name-strong">{user.name}</span>
                {user.title && <span className="user-meta-sub">{user.title}</span>}
                {user.team && <span className="user-meta-sub">· {user.team}</span>}
                <span className={`user-role-chip ${user.role === "admin" ? "admin" : ""}`}>
                  {user.role === "admin"
                    ? "관리자"
                    : user.role === "operator"
                    ? "운영자"
                    : user.role === "staff"
                    ? "실무자"
                    : "조회자"}
                </span>
              </div>
            </div>
          )}
          <button type="button" onClick={onLogout} className="logout-btn" title="로그아웃">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <polyline points="16 17 21 12 16 7" />
              <line x1="21" y1="12" x2="9" y2="12" />
            </svg>
            로그아웃
          </button>
        </div>
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
  onExport,
  canExport,
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
  onExport: () => void;
  canExport: boolean;
}) {
  return (
    <section className="filter-card">
      <div className="filter-header-row">
        {/* Quick Presets */}
        <div className="preset-group">
          <span className="preset-title">조회 기간</span>
          <button
            type="button"
            className={`preset-btn ${activePreset === "today" ? "active" : ""}`}
            aria-pressed={activePreset === "today"}
            onClick={() => onPresetChange("today")}
          >
            오늘
          </button>
          <button
            type="button"
            className={`preset-btn ${activePreset === "7d" ? "active" : ""}`}
            aria-pressed={activePreset === "7d"}
            onClick={() => onPresetChange("7d")}
          >
            최근 7일
          </button>
          <button
            type="button"
            className={`preset-btn ${activePreset === "30d" ? "active" : ""}`}
            aria-pressed={activePreset === "30d"}
            onClick={() => onPresetChange("30d")}
          >
            최근 30일
          </button>
          <button
            type="button"
            className={`preset-btn ${activePreset === "month" ? "active" : ""}`}
            aria-pressed={activePreset === "month"}
            onClick={() => onPresetChange("month")}
          >
            이번 달
          </button>
          {activePreset === "custom" && <span className="preset-btn active">사용자 지정</span>}
        </div>

        {/* Action Buttons */}
        <div className="action-buttons">
          {isLoading && (
            <div className="filter-sync-indicator" style={{ display: "inline-flex", alignItems: "center", gap: "6px", fontSize: "12px", color: "var(--text-muted)", fontWeight: 600, padding: "0 8px" }}>
              <span className="pulse-dot" style={{ width: "7px", height: "7px", borderRadius: "50%", background: "#4f46e5", display: "inline-block" }} />
              조회 중…
            </div>
          )}
          <button className="btn btn-pdf" type="button" onClick={onExport} disabled={!canExport}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
              <line x1="16" y1="13" x2="8" y2="13" />
              <line x1="16" y1="17" x2="8" y2="17" />
              <polyline points="10 9 9 9 8 9" />
            </svg>
            PDF 리포트
          </button>
        </div>
      </div>

      {/* Input Filters Grid */}
      <details className="workspace-filters">
        <summary><strong>조회 조건</strong><span>{brands.find(item => item.brand === brand)?.brand_name || brand || "전체 브랜드"} · {from || "처음"} ~ {to || "현재"}</span></summary>
        <div className="filter-inputs-grid">
        <div className="input-field">
          <label htmlFor="report-start">조회 시작일</label>
          <input id="report-start" type="date" max={to || undefined} value={from} onChange={(e) => onFromChange(e.target.value)} />
        </div>
        <div className="input-field">
          <label htmlFor="report-end">조회 종료일</label>
          <input id="report-end" type="date" min={from || undefined} value={to} onChange={(e) => onToChange(e.target.value)} />
        </div>
        <div className="input-field">
          <label htmlFor="report-brand">브랜드 선택</label>
          <select id="report-brand" value={brand} onChange={(e) => onBrandChange(e.target.value)} disabled={isLoadingBrands}>
            <option value="">전체 브랜드</option>
            {brands.map((b) => (
              <option value={b.brand} key={b.brand}>
                {b.brand_name} ({b.brand})
              </option>
            ))}
          </select>
        </div>
        <div className="input-field">
          <label htmlFor="report-limit">질문·로그 표시 건수</label>
          <select id="report-limit" value={limit} onChange={(e) => onLimitChange(e.target.value)}>
            <option value="50">50건</option>
            <option value="100">100건 (권장)</option>
            <option value="200">200건</option>
            <option value="500">500건</option>
          </select>
        </div>
        </div>
      </details>
    </section>
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
  const [requestedPage, setRequestedPage] = useState(1);
  const perPage = 20;
  const pages = Math.max(1, Math.ceil(rows.length / perPage));
  const page = Math.min(requestedPage, pages);
  const offset = (page - 1) * perPage;

  return (
    <div className="data-table-card">
      <div className="data-table-header">
        <h4 className="data-table-title">
          {title}
          <span className="row-count-badge">{numberFormat.format(rows.length)}건</span>
        </h4>
        {headerActions && <div className="table-action-header-tools">{headerActions}</div>}
      </div>
      <div className="data-table-scroll" role="region" tabIndex={0} aria-label={title}>
        <table className="data-table" aria-label={title}>
          <thead>
            <tr>
              {columns.map((c) => (
                <th scope="col" key={String(c.key)}>{c.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length > 0 ? (
              rows.slice(offset, offset + perPage).map((row, rIdx) => (
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
      {pages > 1 && <nav className="table-pages" aria-label="표 페이지">
        <span aria-live="polite">{numberFormat.format(offset + 1)}–{numberFormat.format(Math.min(offset + perPage, rows.length))} / {numberFormat.format(rows.length)}건</span>
        <button type="button" disabled={page === 1} onClick={() => setRequestedPage(page - 1)}>이전</button>
        <b>{page} / {pages}</b>
        <button type="button" disabled={page === pages} onClick={() => setRequestedPage(page + 1)}>다음</button>
      </nav>}
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
  const channelRequests = data.channelFriendSummary.reduce((sum, f) => sum + f.total_requests, 0);
  const friendRate = channelRequests ? (friendRequests / channelRequests) * 100 : 0;

  const improvementCount = data.activity.improvementCount;
  const improvementTypes = data.activity.improvementTypes;

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

// Table Column Definitions
const dailyColumns: Array<Column<ReportRow>> = [
  { key: "report_date", label: "운영 일자", render: (r) => <strong>{r.report_date}</strong> },
  { key: "brand_name", label: "브랜드명", render: (r) => <span className="menu-badge">{r.brand_name || r.brand}</span> },
  { key: "total_count", label: "총 문의 인입량", render: (r) => numberFormat.format(r.total_count) },
  { key: "matched_count", label: "자동 응답 성공", render: (r) => <span style={{ color: "#2563eb", fontWeight: 700 }}>{numberFormat.format(r.matched_count)}</span> },
  { key: "unmatched_count", label: "미매칭(답변 불가)", render: (r) => <span style={{ color: "#e11d48", fontWeight: 700 }}>{numberFormat.format(r.unmatched_count)}</span> },
  {
    key: "match_rate",
    label: "응답 성공률",
    render: (r) => {
      const rate = matchRate(r);
      const tone = rate >= 80 ? "success" : rate >= 60 ? "warning" : "danger";
      return <span className={`status-pill ${tone}`}>{rate.toFixed(1)}%</span>;
    },
  },
  { key: "unique_user_count", label: "고객 방문자 수", render: (r) => numberFormat.format(r.unique_user_count || 0) },
];

const faqColumns: Array<Column<FaqSummaryRow>> = [
  { key: "brand_name", label: "브랜드명", render: (r) => <span className="menu-badge">{r.brand_name}</span> },
  { key: "category_name", label: "문의 카테고리", render: (r) => r.category_name || "-" },
  { key: "faq_question", label: "매칭된 표준 FAQ 답변", render: (r) => <span className="query-cell">{r.faq_question || "-"}</span> },
  { key: "hit_count", label: "응답 안내 건수", render: (r) => <strong style={{ color: "#4f46e5" }}>{numberFormat.format(r.hit_count)}</strong> },
  { key: "unique_user_count", label: "문의 고객 수", render: (r) => numberFormat.format(r.unique_user_count) },
  {
    key: "avg_score",
    label: "AI 답변 적합도",
    render: (r) => (r.avg_score !== null ? `${r.avg_score.toFixed(1)}점` : "-"),
  },
  { key: "last_occurred_at", label: "최근 응답 시각", render: (r) => (r.last_occurred_at ? r.last_occurred_at.slice(0, 16).replace("T", " ") : "-") },
];

const unmatchedColumns: Array<Column<UnmatchedQueryRow>> = [
  { key: "brand_name", label: "브랜드명", render: (r) => <span className="menu-badge">{r.brand_name}</span> },
  { key: "menu_id", label: "고객 선택 메뉴", render: (r) => (r.menu_id ? <span className="status-pill neutral">{supportMenuLabel(r.menu_id)}</span> : "-") },
  {
    key: "sample_query",
    label: "고객 문의 내용",
    render: (r) => (
      <span className="query-cell">
        {r.sample_query}
        <button
          type="button"
          className="copy-inline-btn"
          title="문의 내용 복사"
          onClick={() => void copySingleQueryText(r.sample_query)}
        >
          복사
        </button>
      </span>
    ),
  },
  { key: "query_count", label: "누적 인입 건수", render: (r) => <strong style={{ color: "#e11d48" }}>{numberFormat.format(r.query_count)}</strong> },
  { key: "unique_user_count", label: "문의 고객 수", render: (r) => numberFormat.format(r.unique_user_count) },
  { key: "last_occurred_at", label: "최근 인입 시각", render: (r) => (r.last_occurred_at ? r.last_occurred_at.slice(0, 16).replace("T", " ") : "-") },
];

const improvementColumns: Array<Column<ImprovementQueueRow>> = [
  { key: "brand_name", label: "브랜드명", render: (r) => <span className="menu-badge">{r.brand_name}</span> },
  {
    key: "result_type",
    label: "개선 분류",
    render: (r) => (
      <span className={`status-pill ${r.result_type === "unmatched" ? "danger" : "warning"}`}>
        {resultTypeLabel(r.result_type)}
      </span>
    ),
  },
  { key: "menu_id", label: "고객 선택 메뉴", render: (r) => (r.menu_id ? <span className="status-pill neutral">{supportMenuLabel(r.menu_id)}</span> : "-") },
  {
    key: "sample_query",
    label: "고객 대표 질문",
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
  { key: "query_count", label: "누적 인입 건수", render: (r) => <strong style={{ color: "#e11d48" }}>{numberFormat.format(r.query_count)}</strong> },
  { key: "unique_user_count", label: "문의 고객 수", render: (r) => numberFormat.format(r.unique_user_count) },
  {
    key: "avg_score",
    label: "평균 신뢰도 점수",
    render: (r) => {
      if (r.avg_score === null || r.avg_score === undefined) return "-";
      const tone = confidenceTone(r.avg_score);
      return <span className={`status-pill ${tone}`}>{r.avg_score.toFixed(1)}점</span>;
    },
  },
  { key: "last_occurred_at", label: "최근 인입 시각", render: (r) => (r.last_occurred_at ? r.last_occurred_at.slice(0, 16).replace("T", " ") : "-") },
];

const channelFriendColumns: Array<Column<ChannelFriendSummaryRow>> = [
  { key: "brand_name", label: "브랜드명", render: (r) => <span className="menu-badge">{r.brand_name}</span> },
  {
    key: "channel_friend_status",
    label: "카카오 채널 친구 여부",
    render: (r) => {
      const tone = channelFriendTone(r.channel_friend_status);
      return <span className={`status-pill ${tone}`}>{channelFriendStatusLabel(r.channel_friend_status)}</span>;
    },
  },
  { key: "total_requests", label: "총 문의 건수", render: (r) => numberFormat.format(r.total_requests) },
  { key: "unique_users", label: "문의 고객 수", render: (r) => numberFormat.format(r.unique_users) },
  { key: "matched_requests", label: "자동 응답 성공", render: (r) => numberFormat.format(r.matched_requests) },
  { key: "unmatched_requests", label: "미매칭(답변 불가)", render: (r) => numberFormat.format(r.unmatched_requests) },
  {
    key: "match_rate_pct",
    label: "응답 성공률",
    render: (r) => {
      const tone = r.match_rate_pct >= 80 ? "success" : r.match_rate_pct >= 60 ? "warning" : "danger";
      return <span className={`status-pill ${tone}`}>{r.match_rate_pct.toFixed(1)}%</span>;
    },
  },
  {
    key: "avg_score",
    label: "평균 신뢰도 점수",
    render: (r) => (r.avg_score !== null && r.avg_score !== undefined ? `${r.avg_score.toFixed(1)}점` : "-"),
  },
];

const historyColumns: Array<Column<HistoryRow>> = [
  {
    key: "occurred_at",
    label: "문의 시각",
    render: (r) => <span style={{ color: "#64748b", fontSize: "11px" }}>{r.occurred_at ? r.occurred_at.slice(0, 19).replace("T", " ") : "-"}</span>,
  },
  { key: "brand_name", label: "브랜드명", render: (r) => <span className="menu-badge">{r.brand_name}</span> },
  { key: "query", label: "고객 문의 내용", render: (r) => <span className="query-cell">{r.query}</span> },
  {
    key: "matched",
    label: "자동 응답 결과",
    render: (r) => (
      <span className={`status-pill ${r.matched ? "success" : "danger"}`}>
        {r.matched ? "자동 응답 성공" : "미매칭(답변 불가)"}
      </span>
    ),
  },
  {
    key: "score",
    label: "답변 정확도",
    render: (r) => {
      const tone = confidenceTone(r.score);
      return <span className={`status-pill ${tone}`}>{r.score.toFixed(1)}</span>;
    },
  },
  { key: "faq_question", label: "제공된 답변 (FAQ/카테고리)", render: (r) => r.faq_question || r.category_name || "-" },
];
