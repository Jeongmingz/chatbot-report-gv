"use client";

import { useDialogFocus } from "./use-dialog-focus";
import { seoulDate } from "@/lib/report-period";
import { useEffect, useRef, useState } from "react";
import {
  buildReportPdfPages,
  exportDashboardPdf,
  PDF_WIDTH_PX,
  type PdfReportInput,
} from "@/lib/pdf-export";
import { recordDownloadAudit } from "@/lib/audit";

interface ReportPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  report: PdfReportInput;
}

export function ReportPreviewModal({ isOpen, onClose, report }: ReportPreviewModalProps) {
  const dialog = useDialogFocus(isOpen, onClose);
  const [downloadError, setDownloadError] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const [isExportingDirect, setIsExportingDirect] = useState(false);

  const viewportRef = useRef<HTMLDivElement>(null);
  const [fit, setFit] = useState(true);
  const [scale, setScale] = useState(1);
  useEffect(() => {
    const viewport = viewportRef.current;
    if (!isOpen || !viewport) return;
    const observer = new ResizeObserver(([entry]) => {
      setScale(Math.min(1, entry.contentRect.width / PDF_WIDTH_PX));
    });
    observer.observe(viewport);
    return () => observer.disconnect();
  }, [isOpen]);

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

  const getAuditConditions = () => [
    `브랜드: ${report.filters.brandLabel || "전체"}`,
    `기간: ${report.filters.from || "전체"} ~ ${report.filters.to || "전체"}`,
  ];

  const handlePrint = () => {
    const today = seoulDate();
    recordDownloadAudit({
      report_name: "챗봇 운영 종합 리포트 (인쇄 요청)",
      export_filename: `게이트비전_챗봇운영리포트_${today}_인쇄저장.pdf`,
      conditions: getAuditConditions(),
      page_path: "/report",
    });
    window.print();
  };

  const handleDirectDownload = async () => {
    if (!containerRef.current) return;
    setDownloadError("");
    setIsExportingDirect(true);
    try {
      const today = seoulDate();
      const filename = `게이트비전_챗봇운영리포트_${today}.pdf`;

      await exportDashboardPdf(containerRef.current, {
        filename,
        report,
      });
      recordDownloadAudit({
        report_name: "챗봇 운영 종합 리포트 (PDF 생성 완료)",
        export_filename: filename,
        conditions: getAuditConditions(),
        page_path: "/report",
      });
    } catch (err) {
      setDownloadError(`PDF 다운로드 중 오류가 발생했습니다: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setIsExportingDirect(false);
    }
  };

  return (
    <div className="pdf-preview-modal-root" role="dialog" aria-modal="true" ref={dialog} tabIndex={-1} aria-labelledby="pdf-preview-title">
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
            <h2 className="pdf-preview-title" id="pdf-preview-title">운영 보고서 미리보기</h2>
            <p className="pdf-preview-sub">
              {report.filters.brandLabel} • 조회기간: {report.filters.from || "처음"} ~ {report.filters.to || "현재"} (총 6페이지)
            </p>
          </div>
        </div>

        <div className="pdf-preview-actions">
          <button className="preview-fit" type="button" aria-pressed={fit} onClick={() => setFit(!fit)}>폭 맞춤</button>
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
            <span>인쇄</span>
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
            <span>{isExportingDirect ? "PDF 생성 중..." : "PDF 저장"}</span>
          </button>

          <button
            type="button"
            className="btn-preview-close"
            onClick={onClose}
            data-dialog-initial aria-label="미리보기 닫기"
          >
            ✕ 닫기
          </button>
        </div>
      </header>

      {/* Main Scroll Area Containing the 6 A4 Sheets */}
      {downloadError && <div className="export-error" role="alert">{downloadError}</div>}
      <div ref={viewportRef} className="pdf-preview-scroll-area" role="region" aria-label="보고서 본문" tabIndex={0}>
        <div className="pdf-preview-pages-wrapper" ref={containerRef} style={{ zoom: fit ? scale : 1 }} id="printReportContainer" />
      </div>
    </div>
  );
}
