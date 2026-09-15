import nodemailer from "nodemailer";
import { supportMenuLabel, type ReportRow, type FaqSummaryRow, type UnmatchedQueryRow, type ImprovementQueueRow, type ChannelFriendSummaryRow } from "@/lib/report";

export type EmailReportData = {
  daily: ReportRow[];
  faqSummary: FaqSummaryRow[];
  unmatchedQueries: UnmatchedQueryRow[];
  improvementQueue?: ImprovementQueueRow[];
  channelFriendSummary?: ChannelFriendSummaryRow[];
  filters?: {
    brandLabel?: string;
    from?: string;
    to?: string;
  };
};

export type SendEmailResult = {
  success: boolean;
  messageId?: string;
  recipient: string;
  error?: string;
  previewUrl?: string | false;
};

/**
 * Send the Daily Operations & CS Insights email report.
 * Supports SMTP (via nodemailer) or Resend API fallback.
 */
export async function sendDailyReportEmail(
  data: EmailReportData,
  recipientOverride?: string,
): Promise<SendEmailResult> {
  const recipient = recipientOverride || process.env.REPORT_RECIPIENT_EMAIL || "on_gv@gatevision.co.kr";
  const today = new Date().toISOString().slice(0, 10);
  const brandName = data.filters?.brandLabel || "전체 브랜드";
  const subject = `[게이트비전 챗봇 리포트] ${today} 일일 운영 현황 및 CS 미매칭 질문 브리핑 (${brandName})`;

  const html = generateDailyEmailHtml(data, today, brandName, recipient);

  // 1. Try Resend API if API Key is configured
  if (process.env.RESEND_API_KEY) {
    try {
      const fromEmail = process.env.EMAIL_FROM || "Gatevision AI <onboarding@resend.dev>";
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: fromEmail,
          to: [recipient],
          subject,
          html,
        }),
      });
      const resData = (await res.json()) as { id?: string; message?: string };
      if (!res.ok) {
        throw new Error(resData.message || "Resend API 이메일 발송에 실패했습니다.");
      }
      return { success: true, messageId: resData.id, recipient };
    } catch (err) {
      console.error("Resend send error:", err);
      // Fallback to SMTP if configured
    }
  }

  // 2. Try SMTP via Nodemailer
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT) || 587;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (host && user && pass) {
    const transporter = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: { user, pass },
    });

    const info = await transporter.sendMail({
      from: process.env.EMAIL_FROM || `"게이트비전 AI 챗봇 센터" <${user}>`,
      to: recipient,
      subject,
      html,
    });

    return { success: true, messageId: info.messageId, recipient };
  }

  // 3. Neither SMTP nor Resend configured
  throw new Error(
    "이메일 발송 환경변수가 설정되지 않았습니다. .env.local에 SMTP 정보 (SMTP_HOST, SMTP_USER, SMTP_PASS) 또는 RESEND_API_KEY를 등록해주세요.",
  );
}

/**
 * Generate responsive and modern HTML email body
 */
export function generateDailyEmailHtml(
  data: EmailReportData,
  today: string,
  brandName: string,
  recipient: string = "on_gv@gatevision.co.kr",
): string {
  const totalCount = data.daily.reduce((s, r) => s + r.total_count, 0);
  const matchedCount = data.daily.reduce((s, r) => s + r.matched_count, 0);
  const unmatchedCount = data.daily.reduce((s, r) => s + r.unmatched_count, 0);
  const matchRate = totalCount ? (matchedCount / totalCount) * 100 : 0;

  const friends = data.channelFriendSummary || [];
  const friendCount = friends.filter((f) => f.channel_friend_status === "friend").reduce((s, f) => s + f.total_requests, 0);
  const friendRate = totalCount ? (friendCount / totalCount) * 100 : 0;

  const topFaqs = data.faqSummary.slice(0, 5);
  const topUnmatched = data.unmatchedQueries.slice(0, 5);
  const improvements = data.improvementQueue || [];
  const improvementCount = improvements.reduce((s, i) => s + i.query_count, 0);

  const formatNum = (n: number) => new Intl.NumberFormat("ko-KR").format(n);

  return `
<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>게이트비전 챗봇 일일 운영 리포트</title>
  <style>
    body { margin: 0; padding: 0; background-color: #f8fafc; font-family: -apple-system, BlinkMacSystemFont, 'Pretendard', 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #0f172a; -webkit-font-smoothing: antialiased; }
    .wrapper { max-width: 680px; margin: 24px auto; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05); }
    .header { background: linear-gradient(135deg, #0f172a 0%, #1e1b4b 100%); padding: 32px 32px 28px; color: #ffffff; }
    .header-badge { display: inline-block; background: rgba(79, 70, 229, 0.4); border: 1px solid rgba(129, 140, 248, 0.4); color: #c7d2fe; font-size: 11px; font-weight: 700; padding: 3px 10px; border-radius: 9999px; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 12px; }
    .header h1 { margin: 0; font-size: 22px; font-weight: 800; line-height: 1.3; }
    .header p { margin: 6px 0 0; color: #94a3b8; font-size: 13px; }
    
    .content { padding: 32px; }
    .section-title { font-size: 15px; font-weight: 800; color: #0f172a; margin: 24px 0 12px; display: flex; align-items: center; gap: 6px; }
    .section-title:first-child { margin-top: 0; }
    
    /* KPI Grid */
    .kpi-grid { display: table; width: 100%; table-layout: fixed; margin-bottom: 24px; border-collapse: separate; border-spacing: 8px; }
    .kpi-cell { display: table-cell; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 14px 12px; vertical-align: top; text-align: center; }
    .kpi-label { font-size: 11px; font-weight: 700; color: #64748b; text-transform: uppercase; display: block; margin-bottom: 6px; }
    .kpi-value { font-size: 20px; font-weight: 800; color: #0f172a; display: block; line-height: 1; }
    .kpi-sub { font-size: 10.5px; color: #94a3b8; font-weight: 600; margin-top: 4px; display: block; }
    
    /* List Table */
    .data-table { width: 100%; border-collapse: collapse; font-size: 12.5px; margin-bottom: 20px; }
    .data-table th { background: #f1f5f9; color: #475569; font-weight: 700; padding: 8px 10px; text-align: left; border-bottom: 1px solid #cbd5e1; font-size: 11px; }
    .data-table td { padding: 10px; border-bottom: 1px solid #f1f5f9; color: #1e293b; vertical-align: middle; }
    .data-table tr:last-child td { border-bottom: none; }
    
    .badge { display: inline-block; padding: 2px 7px; border-radius: 4px; font-size: 11px; font-weight: 700; }
    .badge-brand { background: #f1f5f9; color: #334155; }
    .badge-menu { background: #e0e7ff; color: #4338ca; }
    .badge-danger { background: #ffe4e6; color: #e11d48; }
    
    .notice-card { background: #eff6ff; border-left: 4px solid #3b82f6; padding: 16px; border-radius: 0 8px 8px 0; margin: 24px 0; font-size: 13px; line-height: 1.5; color: #1e3a8a; }
    .notice-card strong { color: #1e40af; }
    
    .action-btn { display: inline-block; background: #4f46e5; color: #ffffff !important; text-decoration: none; font-size: 14px; font-weight: 700; padding: 12px 24px; border-radius: 8px; margin-top: 12px; }
    
    .footer { background: #f8fafc; border-top: 1px solid #e2e8f0; padding: 20px 32px; font-size: 11px; color: #94a3b8; line-height: 1.5; }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="header">
      <span class="header-badge">Gatevision Chatbot Daily Briefing</span>
      <h1>게이트비전 챗봇 일일 운영 인사이트</h1>
      <p>조회 기준: ${today} | 분석 대상: ${brandName}</p>
    </div>
    
    <div class="content">
      <!-- 4 Core KPIs -->
      <div class="kpi-grid">
        <div class="kpi-cell">
          <span class="kpi-label">총 대화 건수</span>
          <span class="kpi-value">${formatNum(totalCount)}<span style="font-size: 12px; font-weight: 500;">건</span></span>
          <span class="kpi-sub">누적 인입</span>
        </div>
        <div class="kpi-cell">
          <span class="kpi-label">평균 매칭률</span>
          <span class="kpi-value" style="color: ${matchRate >= 80 ? "#059669" : matchRate >= 60 ? "#d97706" : "#e11d48"};">${matchRate.toFixed(1)}%</span>
          <span class="kpi-sub">${matchRate >= 80 ? "목표 달성" : "FAQ 점검 필요"}</span>
        </div>
        <div class="kpi-cell">
          <span class="kpi-label">플친 대화 비중</span>
          <span class="kpi-value" style="color: #7c3aed;">${friendRate.toFixed(1)}%</span>
          <span class="kpi-sub">${formatNum(friendCount)}건</span>
        </div>
        <div class="kpi-cell">
          <span class="kpi-label">개선 시급 질문</span>
          <span class="kpi-value" style="color: ${improvementCount > 0 ? "#e11d48" : "#059669"};">${formatNum(improvementCount)}<span style="font-size: 12px; font-weight: 500;">건</span></span>
          <span class="kpi-sub">미매칭/저신뢰도</span>
        </div>
      </div>
      
      <!-- FAQ TOP 5 -->
      <div class="section-title">🏆 고객이 가장 많이 질문한 FAQ TOP 5</div>
      <table class="data-table">
        <thead>
          <tr>
            <th style="width: 20%;">브랜드</th>
            <th style="width: 60%;">FAQ 질문 내용</th>
            <th style="width: 20%; text-align: right;">조회수</th>
          </tr>
        </thead>
        <tbody>
          ${
            topFaqs.length > 0
              ? topFaqs
                  .map(
                    (f) => `
            <tr>
              <td><span class="badge badge-brand">${f.brand_name}</span></td>
              <td><strong>${f.faq_question || f.category_name || "-"}</strong></td>
              <td style="text-align: right; font-weight: 700; color: #4f46e5;">${formatNum(f.hit_count)}회</td>
            </tr>
          `,
                  )
                  .join("")
              : `<tr><td colspan="3" style="text-align: center; color: #94a3b8; padding: 20px;">FAQ 매칭 데이터가 없습니다.</td></tr>`
          }
        </tbody>
      </table>

      <!-- Unmatched TOP 5 for CS Team -->
      <div class="section-title" style="color: #e11d48;">⚠️ [CS팀 필독] 주요 미매칭 낙오 질문 TOP 5</div>
      <p style="font-size: 12px; color: #64748b; margin-top: -6px; margin-bottom: 12px;">챗봇이 대응하지 못한 질문들로, 신규 FAQ 등록 및 상담원 대응 사전 공유가 필요합니다.</p>
      <table class="data-table">
        <thead>
          <tr>
            <th style="width: 18%;">브랜드</th>
            <th style="width: 22%;">문의메뉴</th>
            <th style="width: 45%;">고객 실제 질문 원문</th>
            <th style="width: 15%; text-align: right;">발생건수</th>
          </tr>
        </thead>
        <tbody>
          ${
            topUnmatched.length > 0
              ? topUnmatched
                  .map(
                    (u) => `
            <tr>
              <td><span class="badge badge-brand">${u.brand_name}</span></td>
              <td><span class="badge badge-menu">${supportMenuLabel(u.menu_id)}</span></td>
              <td><strong style="color: #0f172a;">${u.sample_query}</strong></td>
              <td style="text-align: right; font-weight: 700; color: #e11d48;">${formatNum(u.query_count)}회</td>
            </tr>
          `,
                  )
                  .join("")
              : `<tr><td colspan="4" style="text-align: center; color: #94a3b8; padding: 20px;">미매칭 질문 데이터가 없습니다.</td></tr>`
          }
        </tbody>
      </table>

      <!-- Action Card -->
      <div class="notice-card">
        <strong>💡 운영 권고사항:</strong><br>
        상위 미매칭 질문을 대시보드에서 <strong>[CS팀용 엑셀(CSV)]</strong>로 다운로드하여 티켓팅에 반영하시거나, 사내 메신저에 바로 공유할 수 있습니다.
        <div style="margin-top: 14px;">
          <a href="https://chatbot-report-gv.vercel.app" class="action-btn" target="_blank">🌐 웹 대시보드 바로가기</a>
        </div>
      </div>
    </div>

    <div class="footer">
      본 메일은 게이트비전 AI 챗봇 운영 센터에서 매일 아침 자동 발송되는 운영 현황 브리핑입니다.<br>
      수신자: ${recipient} | 데이터 원천: Supabase Production
    </div>
  </div>
</body>
</html>
  `;
}
