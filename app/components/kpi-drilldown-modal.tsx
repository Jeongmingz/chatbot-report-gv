"use client";

import { useEffect, useMemo, useState } from "react";
import {
  supportMenuLabel,
  channelFriendStatusLabel,
  resultTypeLabel,
  matchRate as calcMatchRate,
  type ReportRow,
  type FaqSummaryRow,
  type UnmatchedQueryRow,
  type ImprovementQueueRow,
  type ChannelFriendSummaryRow,
  type HistoryRow,
} from "@/lib/report";
import { downloadGenericCsv, copySingleQueryText } from "@/lib/export-utils";

export type KpiDrilldownType = "total" | "matched" | "unmatched" | "rate" | "friend" | "improvement";

interface KpiDrilldownModalProps {
  isOpen: boolean;
  onClose: () => void;
  type: KpiDrilldownType | null;
  brandLabel: string;
  from: string;
  to: string;
  data: {
    daily: ReportRow[];
    faqSummary: FaqSummaryRow[];
    unmatchedQueries: UnmatchedQueryRow[];
    improvementQueue: ImprovementQueueRow[];
    channelFriendSummary: ChannelFriendSummaryRow[];
    history: HistoryRow[];
  };
}

const numberFormat = new Intl.NumberFormat("ko-KR");

export function KpiDrilldownModal({
  isOpen,
  onClose,
  type,
  brandLabel,
  from,
  to,
  data,
}: KpiDrilldownModalProps) {
  const [searchQuery, setSearchQuery] = useState("");

  // Close on Escape key
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  // Reset search when modal opens or type changes
  useEffect(() => {
    setSearchQuery("");
  }, [type, isOpen]);

  // Modal configuration based on drill-down type
  const config = useMemo(() => {
    switch (type) {
      case "total":
        return {
          title: "전체 상담 대화 원본 내역 (총 대화량 상세)",
          subtitle: "고객이 카카오 챗봇에 인입한 전체 실시간 대화 내역입니다.",
          icon: "💬",
          colorTheme: "indigo",
          filename: `[게이트비전]_전체상담대화내역_${brandLabel}_${new Date().toISOString().slice(0, 10)}`,
        };
      case "matched":
        return {
          title: "자동 응답 성공 대화 내역 (매칭 성공 상세)",
          subtitle: "챗봇이 표준 FAQ 답변과 정확히 매칭되어 고객 안내를 완료한 대화 목록입니다.",
          icon: "🎯",
          colorTheme: "blue",
          filename: `[게이트비전]_자동응답성공대화_${brandLabel}_${new Date().toISOString().slice(0, 10)}`,
        };
      case "unmatched":
        return {
          title: "미매칭 고객 문의 내역 (답변 보강 필요)",
          subtitle: "기존 FAQ와 매칭되지 않아 상담원 확인 및 FAQ 신규 등록이 필요한 질문 목록입니다.",
          icon: "⚠️",
          colorTheme: "rose",
          filename: `[게이트비전]_미매칭고객문의_${brandLabel}_${new Date().toISOString().slice(0, 10)}`,
        };
      case "rate":
        return {
          title: "일별 챗봇 응답 성과 및 매칭률 추이",
          subtitle: "일자별/브랜드별 자동 응답 성공률과 고객 방문 현황 상세입니다.",
          icon: "📈",
          colorTheme: "emerald",
          filename: `[게이트비전]_일별챗봇응답성과_${brandLabel}_${new Date().toISOString().slice(0, 10)}`,
        };
      case "friend":
        return {
          title: "카카오톡 채널 친구 인입 및 참여도 분석",
          subtitle: "카카오톡 채널 추가 고객(단골 고객)과 비친구 방문자의 상담 이용 비교 내역입니다.",
          icon: "👥",
          colorTheme: "purple",
          filename: `[게이트비전]_카카오채널친구분석_${brandLabel}_${new Date().toISOString().slice(0, 10)}`,
        };
      case "improvement":
        return {
          title: "답변 우선 개선 대기열 (미매칭 & 저신뢰도)",
          subtitle: "응답 실패 및 유사도가 낮아 오답 위험이 있는 최우선 FAQ 보강 대상 질문입니다.",
          icon: "⚡",
          colorTheme: "amber",
          filename: `[게이트비전]_답변우선개선대기열_${brandLabel}_${new Date().toISOString().slice(0, 10)}`,
        };
      default:
        return null;
    }
  }, [type, brandLabel]);

  // Filtered rows and export handler
  const { filteredRows, exportHandler, renderTableContent, totalCount } = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();

    if (type === "total" || type === "matched") {
      const sourceRows = type === "matched" ? data.history.filter((h) => h.matched) : data.history;
      const rows = sourceRows.filter((r) => {
        if (!q) return true;
        return (
          (r.brand_name || "").toLowerCase().includes(q) ||
          (r.query || "").toLowerCase().includes(q) ||
          (r.faq_question || "").toLowerCase().includes(q) ||
          (r.category_name || "").toLowerCase().includes(q)
        );
      });

      const handleExport = () => {
        const headers = ["문의 일시", "브랜드", "고객 문의 내용", "AI 응답 결과", "AI 답변 정확도(점)", "안내된 표준 답변", "문의 분류"];
        const csvData = rows.map((r) => [
          r.occurred_at ? r.occurred_at.slice(0, 19).replace("T", " ") : "-",
          r.brand_name || r.brand || "-",
          r.query || "-",
          r.matched ? "자동 응답 성공" : "미매칭 (상담 필요)",
          r.score !== null && r.score !== undefined ? (r.score > 100 ? (r.score / 10).toFixed(1) : r.score.toFixed(1)) : "-",
          r.faq_question || "-",
          r.category_name || "-",
        ]);
        downloadGenericCsv(config?.filename || "상담대화내역", headers, csvData);
      };

      const table = (
        <table className="data-table">
          <thead>
            <tr>
              <th style={{ width: "16%" }}>문의 일시</th>
              <th style={{ width: "14%" }}>브랜드</th>
              <th style={{ width: "32%" }}>고객 문의 내용</th>
              <th style={{ width: "12%" }}>AI 응답 결과</th>
              <th style={{ width: "10%" }}>정확도</th>
              <th style={{ width: "16%" }}>안내된 표준 답변</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, idx) => (
              <tr key={`${r.id}-${idx}`}>
                <td style={{ color: "#64748b", fontSize: "12px" }}>
                  {r.occurred_at ? r.occurred_at.slice(0, 19).replace("T", " ") : "-"}
                </td>
                <td><span className="menu-badge">{r.brand_name || r.brand}</span></td>
                <td>
                  <span className="query-cell">
                    {r.query || "-"}
                    {r.query && (
                      <button
                        type="button"
                        className="copy-inline-btn"
                        title="문의 내용 복사"
                        onClick={() => void copySingleQueryText(r.query)}
                      >
                        복사
                      </button>
                    )}
                  </span>
                </td>
                <td>
                  <span className={`status-pill ${r.matched ? "success" : "danger"}`}>
                    {r.matched ? "응답 성공" : "미매칭"}
                  </span>
                </td>
                <td>
                  <span className="status-pill neutral">
                    {r.score !== null && r.score !== undefined ? `${(r.score > 100 ? r.score / 10 : r.score).toFixed(1)}점` : "-"}
                  </span>
                </td>
                <td style={{ fontSize: "12.5px" }}>{r.faq_question || r.category_name || "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      );

      return { filteredRows: rows, exportHandler: handleExport, renderTableContent: table, totalCount: sourceRows.length };
    }

    if (type === "unmatched") {
      const sourceRows = data.unmatchedQueries;
      const rows = sourceRows.filter((r) => {
        if (!q) return true;
        return (
          (r.brand_name || "").toLowerCase().includes(q) ||
          (r.sample_query || "").toLowerCase().includes(q) ||
          supportMenuLabel(r.menu_id).toLowerCase().includes(q)
        );
      });

      const handleExport = () => {
        const headers = [
          "우선순위",
          "브랜드",
          "선택 문의 메뉴",
          "고객 문의 내용 (미매칭 원문)",
          "누적 인입 건수",
          "최근 7일 인입",
          "최근 30일 인입",
          "문의 고객 수",
          "최근 문의 일시",
          "CS 분류",
          "처리 담당자",
          "조치 방안",
          "답변 초안",
          "처리 상태",
        ];
        const csvData = rows.map((r, idx) => [
          String(idx + 1),
          r.brand_name || r.brand,
          supportMenuLabel(r.menu_id),
          r.sample_query || "-",
          String(r.query_count || 0),
          String(r.query_count_7d ?? "-"),
          String(r.query_count_30d ?? "-"),
          String(r.unique_user_count || 0),
          r.last_occurred_at ? r.last_occurred_at.slice(0, 19).replace("T", " ") : "-",
          "",
          "",
          "신규 FAQ 등록 필요",
          "",
          "대기",
        ]);
        downloadGenericCsv(config?.filename || "미매칭고객문의", headers, csvData);
      };

      const table = (
        <table className="data-table">
          <thead>
            <tr>
              <th style={{ width: "8%" }}>순위</th>
              <th style={{ width: "14%" }}>브랜드</th>
              <th style={{ width: "14%" }}>선택 문의 메뉴</th>
              <th style={{ width: "36%" }}>고객 문의 내용 (미매칭)</th>
              <th style={{ width: "10%" }}>인입 횟수</th>
              <th style={{ width: "9%" }}>문의 고객</th>
              <th style={{ width: "9%" }}>최근 문의</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, idx) => (
              <tr key={`${r.brand}-${idx}`}>
                <td><strong style={{ color: "#64748b" }}>#{idx + 1}</strong></td>
                <td><span className="menu-badge">{r.brand_name}</span></td>
                <td><span className="status-pill neutral">{supportMenuLabel(r.menu_id)}</span></td>
                <td>
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
                </td>
                <td><strong style={{ color: "#e11d48" }}>{numberFormat.format(r.query_count)}건</strong></td>
                <td>{numberFormat.format(r.unique_user_count)}명</td>
                <td style={{ color: "#64748b", fontSize: "12px" }}>
                  {r.last_occurred_at ? r.last_occurred_at.slice(5, 16).replace("T", " ") : "-"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      );

      return { filteredRows: rows, exportHandler: handleExport, renderTableContent: table, totalCount: sourceRows.length };
    }

    if (type === "rate") {
      const sourceRows = data.daily;
      const rows = sourceRows.filter((r) => {
        if (!q) return true;
        return (r.brand_name || "").toLowerCase().includes(q) || (r.report_date || "").includes(q);
      });

      const handleExport = () => {
        const headers = ["운영 일자", "브랜드", "전체 문의 건수", "자동 응답 성공", "미매칭 (상담 필요)", "자동 응답 성공률", "방문 고객 수"];
        const csvData = rows.map((r) => [
          r.report_date || "-",
          r.brand_name || r.brand || "-",
          String(r.total_count || 0),
          String(r.matched_count || 0),
          String(r.unmatched_count || 0),
          `${calcMatchRate(r).toFixed(1)}%`,
          String(r.unique_user_count || 0),
        ]);
        downloadGenericCsv(config?.filename || "일별챗봇응답성과", headers, csvData);
      };

      const table = (
        <table className="data-table">
          <thead>
            <tr>
              <th style={{ width: "16%" }}>운영 일자</th>
              <th style={{ width: "16%" }}>브랜드</th>
              <th style={{ width: "14%" }}>전체 문의 건수</th>
              <th style={{ width: "14%" }}>자동 응답 성공</th>
              <th style={{ width: "14%" }}>미매칭 (상담 필요)</th>
              <th style={{ width: "13%" }}>자동 응답 성공률</th>
              <th style={{ width: "13%" }}>방문 고객 수</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, idx) => {
              const rate = calcMatchRate(r);
              const tone = rate >= 80 ? "success" : rate >= 60 ? "warning" : "danger";
              return (
                <tr key={`${r.report_date}-${r.brand}-${idx}`}>
                  <td><strong>{r.report_date}</strong></td>
                  <td><span className="menu-badge">{r.brand_name || r.brand}</span></td>
                  <td>{numberFormat.format(r.total_count)}건</td>
                  <td style={{ color: "#2563eb", fontWeight: 700 }}>{numberFormat.format(r.matched_count)}건</td>
                  <td style={{ color: "#e11d48", fontWeight: 700 }}>{numberFormat.format(r.unmatched_count)}건</td>
                  <td><span className={`status-pill ${tone}`}>{rate.toFixed(1)}%</span></td>
                  <td>{numberFormat.format(r.unique_user_count || 0)}명</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      );

      return { filteredRows: rows, exportHandler: handleExport, renderTableContent: table, totalCount: sourceRows.length };
    }

    if (type === "friend") {
      const sourceRows = data.channelFriendSummary;
      const rows = sourceRows.filter((r) => {
        if (!q) return true;
        return (
          (r.brand_name || "").toLowerCase().includes(q) ||
          channelFriendStatusLabel(r.channel_friend_status).toLowerCase().includes(q)
        );
      });

      const handleExport = () => {
        const headers = ["브랜드", "카카오 채널 친구 여부", "전체 문의 건수", "방문 고객 수", "자동 응답 성공", "미매칭 건수", "자동 응답 성공률", "평균 정확도(점)"];
        const csvData = rows.map((r) => [
          r.brand_name || r.brand,
          channelFriendStatusLabel(r.channel_friend_status),
          String(r.total_requests || 0),
          String(r.unique_users || 0),
          String(r.matched_requests || 0),
          String(r.unmatched_requests || 0),
          `${r.match_rate_pct.toFixed(1)}%`,
          r.avg_score !== null && r.avg_score !== undefined ? (r.avg_score > 100 ? (r.avg_score / 10).toFixed(1) : r.avg_score.toFixed(1)) : "-",
        ]);
        downloadGenericCsv(config?.filename || "카카오채널친구분석", headers, csvData);
      };

      const table = (
        <table className="data-table">
          <thead>
            <tr>
              <th style={{ width: "16%" }}>브랜드</th>
              <th style={{ width: "16%" }}>카카오 채널 친구 여부</th>
              <th style={{ width: "14%" }}>전체 문의 건수</th>
              <th style={{ width: "14%" }}>방문 고객 수</th>
              <th style={{ width: "14%" }}>자동 응답 성공</th>
              <th style={{ width: "13%" }}>미매칭 건수</th>
              <th style={{ width: "13%" }}>자동 응답 성공률</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, idx) => (
              <tr key={`${r.brand}-${r.channel_friend_status}-${idx}`}>
                <td><span className="menu-badge">{r.brand_name}</span></td>
                <td>
                  <span className={`status-pill ${r.channel_friend_status === "friend" ? "purple" : "neutral"}`}>
                    {channelFriendStatusLabel(r.channel_friend_status)}
                  </span>
                </td>
                <td>{numberFormat.format(r.total_requests)}건</td>
                <td>{numberFormat.format(r.unique_users)}명</td>
                <td style={{ color: "#2563eb", fontWeight: 700 }}>{numberFormat.format(r.matched_requests)}건</td>
                <td style={{ color: "#e11d48", fontWeight: 700 }}>{numberFormat.format(r.unmatched_requests)}건</td>
                <td><strong>{r.match_rate_pct.toFixed(1)}%</strong></td>
              </tr>
            ))}
          </tbody>
        </table>
      );

      return { filteredRows: rows, exportHandler: handleExport, renderTableContent: table, totalCount: sourceRows.length };
    }

    if (type === "improvement") {
      const sourceRows = data.improvementQueue;
      const rows = sourceRows.filter((r) => {
        if (!q) return true;
        return (
          (r.brand_name || "").toLowerCase().includes(q) ||
          (r.sample_query || "").toLowerCase().includes(q) ||
          supportMenuLabel(r.menu_id).toLowerCase().includes(q) ||
          resultTypeLabel(r.result_type).toLowerCase().includes(q)
        );
      });

      const handleExport = () => {
        const headers = [
          "우선순위",
          "브랜드",
          "조치 구분",
          "선택 문의 메뉴",
          "대표 고객 문의",
          "누적 인입 건수",
          "문의 고객 수",
          "AI 답변 정확도(점)",
          "최근 문의 일시",
          "조치 상태",
        ];
        const csvData = rows.map((r, idx) => [
          String(idx + 1),
          r.brand_name || r.brand,
          resultTypeLabel(r.result_type),
          supportMenuLabel(r.menu_id),
          r.sample_query || "-",
          String(r.query_count || 0),
          String(r.unique_user_count || 0),
          r.avg_score !== null && r.avg_score !== undefined ? (r.avg_score > 100 ? (r.avg_score / 10).toFixed(1) : r.avg_score.toFixed(1)) : "-",
          r.last_occurred_at ? r.last_occurred_at.slice(0, 19).replace("T", " ") : "-",
          "조치 대기",
        ]);
        downloadGenericCsv(config?.filename || "답변우선개선대기열", headers, csvData);
      };

      const table = (
        <table className="data-table">
          <thead>
            <tr>
              <th style={{ width: "8%" }}>순위</th>
              <th style={{ width: "12%" }}>브랜드</th>
              <th style={{ width: "12%" }}>조치 구분</th>
              <th style={{ width: "14%" }}>선택 문의 메뉴</th>
              <th style={{ width: "32%" }}>대표 고객 문의</th>
              <th style={{ width: "11%" }}>인입 건수</th>
              <th style={{ width: "11%" }}>문의 고객</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, idx) => (
              <tr key={`${r.brand}-${idx}`}>
                <td><strong style={{ color: "#64748b" }}>#{idx + 1}</strong></td>
                <td><span className="menu-badge">{r.brand_name}</span></td>
                <td>
                  <span className={`status-pill ${r.result_type === "unmatched" ? "danger" : "warning"}`}>
                    {resultTypeLabel(r.result_type)}
                  </span>
                </td>
                <td><span className="status-pill neutral">{supportMenuLabel(r.menu_id)}</span></td>
                <td>
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
                </td>
                <td><strong style={{ color: "#e11d48" }}>{numberFormat.format(r.query_count)}건</strong></td>
                <td>{numberFormat.format(r.unique_user_count)}명</td>
              </tr>
            ))}
          </tbody>
        </table>
      );

      return { filteredRows: rows, exportHandler: handleExport, renderTableContent: table, totalCount: sourceRows.length };
    }

    return { filteredRows: [], exportHandler: () => {}, renderTableContent: null, totalCount: 0 };
  }, [type, data, searchQuery, config]);

  if (!isOpen || !config) return null;

  return (
    <div className="drilldown-modal-backdrop" onClick={onClose} role="dialog" aria-modal="true">
      <div className="drilldown-modal-dialog" onClick={(e) => e.stopPropagation()}>
        {/* Modal Header */}
        <header className="drilldown-modal-header">
          <div className="drilldown-header-left">
            <div className={`drilldown-icon-box theme-${config.colorTheme}`}>
              <span>{config.icon}</span>
            </div>
            <div>
              <h2 className="drilldown-modal-title">{config.title}</h2>
              <p className="drilldown-modal-subtitle">
                {brandLabel} • 조회기간: {from || "전체"} ~ {to || "전체"} (총 {numberFormat.format(totalCount)}건)
              </p>
            </div>
          </div>

          <div className="drilldown-header-actions">
            <button
              type="button"
              className="btn btn-drilldown-excel"
              onClick={exportHandler}
              title="현재 데이터를 엑셀(CSV UTF-8 BOM) 파일로 저장"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
              <span>📥 엑셀 다운로드</span>
            </button>
            <button
              type="button"
              className="btn btn-drilldown-close"
              onClick={onClose}
              aria-label="닫기"
            >
              ✕
            </button>
          </div>
        </header>

        {/* Search Bar & Subtitle */}
        <div className="drilldown-modal-toolbar">
          <p className="drilldown-guide-desc">{config.subtitle}</p>
          <div className="drilldown-search-wrapper">
            <svg className="search-icon-left" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              type="text"
              className="table-search-input"
              placeholder="결과 내 검색 (고객 질문, 브랜드, 메뉴 등)..."
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

        {/* Table Content Scroll Box */}
        <div className="drilldown-table-container">
          {filteredRows.length > 0 ? (
            renderTableContent
          ) : (
            <div className="drilldown-empty-state">
              <span style={{ fontSize: "32px", display: "block", marginBottom: "8px" }}>🔍</span>
              <strong>일치하는 상세 데이터가 없습니다.</strong>
              <p>검색어를 변경하거나 필터를 확인해주세요.</p>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <footer className="drilldown-modal-footer">
          <div className="drilldown-footer-info">
            <span>표시 중인 데이터: <strong>{numberFormat.format(filteredRows.length)}</strong>건 / 전체 <strong>{numberFormat.format(totalCount)}</strong>건</span>
            <span style={{ color: "#94a3b8" }}>• Microsoft Excel 호환 (UTF-8 with BOM 적용)</span>
          </div>
          <button type="button" className="btn btn-primary-close" onClick={onClose}>
            확인 및 닫기
          </button>
        </footer>
      </div>
    </div>
  );
}
