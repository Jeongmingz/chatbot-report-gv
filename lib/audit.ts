export interface DownloadAuditParams {
  report_name: string;
  export_filename: string;
  conditions?: string[];
  page_path?: string;
}

/**
 * PDF 및 CSV 등 리포트 파일 반출 시 게이트비전 영구 감사 로그(gatevision.download_audit_logs)에 기록합니다.
 * 다운로드 장애를 유발하지 않도록 백그라운드로 안전하게 전송합니다.
 */
export async function recordDownloadAudit(params: DownloadAuditParams): Promise<boolean> {
  try {
    const payload = {
      report_name: params.report_name,
      export_filename: params.export_filename,
      conditions: params.conditions || [],
      page_path: params.page_path || "/report",
    };

    const res = await fetch("/api/audit/download", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
      keepalive: true,
    });

    return res.ok;
  } catch (error) {
    console.warn("[download-audit] 감사 로그 전송 실패 (다운로드는 계속 진행):", error);
    return false;
  }
}
