"use client";

import { useEffect, useRef, useState } from "react";
import {
  buildReportPdfPages,
  exportDashboardPdf,
  type PdfReportInput,
} from "@/lib/pdf-export";

interface ReportPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  report: PdfReportInput;
}

export function ReportPreviewModal({ isOpen, onClose, report }: ReportPreviewModalProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isExportingDirect, setIsExportingDirect] = useState(false);
  const [activePage, setActivePage] = useState(1);

  // Render the 6 pages into the container DOM when opened
  useEffect(() => {
    if (!isOpen || !containerRef.current) return;

    const container = containerRef.current;
    container.innerHTML = "";

    try {
      buildReportPdfPages(report, container);
    } catch (err) {
      console.error("Failed to build report pages:", err);
    }
  }, [isOpen, report]);

  if (!isOpen) return null;

  const handlePrint = () => {
    window.print();
  };

  const handleDirectDownload = async () => {
    if (!containerRef.current) return;
    setIsExportingDirect(true);
    try {
      const today = new Date().toISOString().slice(0, 10);
      await exportDashboardPdf(containerRef.current, {
        filename: `게이트비전_챗봇운영리포트_${today}.pdf`,
        report,
      });
    } catch (err) {
      alert(`PDF 다운로드 중 오류가 발생했습니다: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setIsExportingDirect(false);
    }
  };

  return (
    <div className="pdf-preview-modal-root" role="dialog" aria-modal="true">
      {/* Floating Control Toolbar (Hidden in Print) */}
      <header className="pdf-preview-header">
        <div className="pdf-preview-header-left">
          <div className="pdf-preview-icon">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
              <line x1="16" y1="13" x2="8" y2="13" />
              <line x1="16" y1="17" x2="8" y2="17" />
              <polyline points="10 9 9 9 8 9" />
            </svg>
          </div>
          <div>
            <h1 className="pdf-preview-title">게이트비전 챗봇 운영 종합 보고서</h1>
            <p className="pdf-preview-sub">
              {report.filters.brandLabel} • 조회기간: {report.filters.from} ~ {report.filters.to} (총 6페이지)
            </p>
          </div>
        </div>

        <div className="pdf-preview-tip-box">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#4f46e5" strokeWidth="2.5">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="16" x2="12" y2="12" />
            <line x1="12" y1="8" x2="12.01" y2="8" />
          </svg>
          <span>인쇄 창에서 <strong>&apos;대상: PDF로 저장&apos;</strong>을 선택하시면 초고화질 벡터 PDF로 다운로드됩니다.</span>
        </div>

        <div className="pdf-preview-actions">
          <button
            type="button"
            className="btn-preview-print"
            onClick={handlePrint}
            title="브라우저 네이티브 고화질 벡터 PDF 저장 및 인쇄"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <polyline points="6 9 6 2 18 2 18 9" />
              <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
              <rect x="6" y="14" width="12" height="8" />
            </svg>
            <span>🖨️ PDF로 저장 / 인쇄</span>
          </button>

          <button
            type="button"
            className="btn-preview-direct"
            onClick={handleDirectDownload}
            disabled={isExportingDirect}
            title="클라이언트 1클릭 PDF 파일 즉시 다운로드"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            <span>{isExportingDirect ? "PDF 생성 중..." : "📥 1클릭 파일 다운로드"}</span>
          </button>

          <button
            type="button"
            className="btn-preview-close"
            onClick={onClose}
            aria-label="닫기"
          >
            ✕ 닫기
          </button>
        </div>
      </header>

      {/* Main Scroll Area Containing the 6 A4 Sheets */}
      <main className="pdf-preview-scroll-area">
        <div className="pdf-preview-pages-wrapper" ref={containerRef} id="printReportContainer" />
      </main>
    </div>
  );
}
