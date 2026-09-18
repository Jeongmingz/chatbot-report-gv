"use client";

import { useMemo, useState } from "react";
import { Bar } from "react-chartjs-2";
import type { ChartOptions } from "chart.js";
import {
  type HistoryRow,
  type FaqSummaryRow,
  type UnmatchedQueryRow,
  type ChannelFriendSummaryRow,
  type ReportRow,
} from "@/lib/report";

interface OperationalInsightsProps {
  history: HistoryRow[];
  faqSummary: FaqSummaryRow[];
  unmatchedQueries: UnmatchedQueryRow[];
  channelFriendSummary: ChannelFriendSummaryRow[];
  daily: ReportRow[];
  brands: Array<{ brand: string; brand_name: string }>;
  totalCount: number;
}

const numberFormat = new Intl.NumberFormat("ko-KR");

export function OperationalInsights({
  history,
  faqSummary,
  unmatchedQueries,
  channelFriendSummary,
  daily,
  brands,
  totalCount,
}: OperationalInsightsProps) {
  const [activeInsightTab, setActiveInsightTab] = useState<"deflection" | "temporal" | "category" | "risk" | "brands">("deflection");

  // 1. 상담원 연결 vs 챗봇 자체 완결률 & 1회 완결률(FCR) 계산
  const deflectionData = useMemo(() => {
    if (!totalCount) {
      return {
        agentCount: 0,
        selfCount: 0,
        deflectionRate: 100,
        escalationRate: 0,
        savedHours: 0,
        nightCount: 0,
        nightRate: 0,
        fcrRate: 85,
        avgQueriesPerUser: 1.2,
        multiQueryUsers: 0,
      };
    }

    const agentKeywords = ["상담원", "상담사", "직원 연결", "사람 연결", "유선 상담", "전화 상담", "전문 상담"];
    let agentCount = 0;
    let nightCount = 0;

    // FCR 계산용 유저 세션 맵
    const userMap: Record<string, { count: number; hasMatched: boolean }> = {};

    history.forEach((h) => {
      const q = (h.query || "").toLowerCase();
      const faq = (h.faq_question || "").toLowerCase();
      const cat = (h.category_name || "").toLowerCase();

      const isAgent = agentKeywords.some(
        (kw) => q.includes(kw) || faq.includes(kw) || cat.includes(kw)
      );

      if (isAgent) {
        agentCount++;
      }

      // 시간대 계산
      if (h.occurred_at) {
        let hour = -1;
        try {
          if (h.occurred_at.includes("T")) {
            const timePart = h.occurred_at.split("T")[1];
            hour = parseInt(timePart.slice(0, 2), 10);
          } else if (h.occurred_at.includes(" ")) {
            const timePart = h.occurred_at.split(" ")[1];
            hour = parseInt(timePart.slice(0, 2), 10);
          }
        } catch {
          // ignore
        }

        if (hour >= 0 && (hour < 9 || hour >= 18)) {
          nightCount++;
        }
      }

      // 유저 세션 분석
      const uid = h.user_id || `anon_${h.id}`;
      if (!userMap[uid]) {
        userMap[uid] = { count: 0, hasMatched: false };
      }
      userMap[uid].count++;
      if (h.matched) userMap[uid].hasMatched = true;
    });

    const faqAgentHits = faqSummary
      .filter((f) =>
        agentKeywords.some(
          (kw) =>
            (f.faq_question || "").includes(kw) ||
            (f.category_name || "").includes(kw)
        )
      )
      .reduce((sum, f) => sum + f.hit_count, 0);

    const effectiveAgentCount = Math.max(agentCount, faqAgentHits);
    const selfCount = Math.max(0, totalCount - effectiveAgentCount);
    const deflectionRate = totalCount ? (selfCount / totalCount) * 100 : 100;
    const escalationRate = totalCount ? (effectiveAgentCount / totalCount) * 100 : 0;
    const savedHours = Math.round(selfCount * 0.083);
    const nightRate = history.length ? (nightCount / history.length) * 100 : 0;

    // FCR 산출
    const uniqueUsers = Object.keys(userMap).length || 1;
    const singleQueryUsers = Object.values(userMap).filter((u) => u.count === 1).length;
    const multiQueryUsers = Object.values(userMap).filter((u) => u.count >= 3).length;
    const fcrRate = (singleQueryUsers / uniqueUsers) * 100;
    const avgQueriesPerUser = Number((history.length / uniqueUsers).toFixed(1)) || 1.2;

    return {
      agentCount: effectiveAgentCount,
      selfCount,
      deflectionRate,
      escalationRate,
      savedHours,
      nightCount,
      nightRate,
      fcrRate,
      avgQueriesPerUser,
      multiQueryUsers,
    };
  }, [history, faqSummary, totalCount]);

  // 2. 24시간대별 및 요일별 인입 패턴 분석
  const temporalData = useMemo(() => {
    const hours = Array.from({ length: 24 }, () => 0);
    const dayOfWeekCounts = [0, 0, 0, 0, 0, 0, 0]; // 0: 일, 1: 월, ..., 6: 토
    const dayNames = ["일", "월", "화", "수", "목", "금", "토"];

    history.forEach((h) => {
      if (!h.occurred_at) return;
      try {
        let hour = -1;
        if (h.occurred_at.includes("T")) {
          const timePart = h.occurred_at.split("T")[1];
          hour = parseInt(timePart.slice(0, 2), 10);
        } else if (h.occurred_at.includes(" ")) {
          const timePart = h.occurred_at.split(" ")[1];
          hour = parseInt(timePart.slice(0, 2), 10);
        }
        if (hour >= 0 && hour < 24) {
          hours[hour]++;
        }

        const dateObj = new Date(h.occurred_at);
        if (!isNaN(dateObj.getTime())) {
          const dayIdx = dateObj.getDay();
          dayOfWeekCounts[dayIdx]++;
        }
      } catch {
        // ignore
      }
    });

    let peakHour = 14;
    let maxCount = 0;
    hours.forEach((count, h) => {
      if (count > maxCount) {
        maxCount = count;
        peakHour = h;
      }
    });

    const totalDays = dayOfWeekCounts.reduce((a, b) => a + b, 0) || 1;
    const mondayCount = dayOfWeekCounts[1];
    const mondayRate = (mondayCount / totalDays) * 100;
    const weekendCount = dayOfWeekCounts[0] + dayOfWeekCounts[6];
    const weekendRate = (weekendCount / totalDays) * 100;

    return {
      hours,
      peakHour,
      peakCount: maxCount,
      hourlyLabels: Array.from({ length: 24 }, (_, i) => `${i}시`),
      dayOfWeekCounts,
      dayNames,
      mondayRate,
      mondayCount,
      weekendRate,
      weekendCount,
    };
  }, [history]);

  // 3. 고객 주요 질문 유형 (카테고리) 및 질문 형태(단답 vs 장문) 분석
  const categoryData = useMemo(() => {
    const catMap: Record<string, { count: number; sampleFaq: string }> = {};

    faqSummary.forEach((f) => {
      let name = f.category_name?.trim() || "기타/일반 안내";
      if (name.includes("AS") || name.includes("수리") || name.includes("서비스")) name = "A/S 및 수리 접수";
      else if (name.includes("소모품") || name.includes("부품") || name.includes("필터") || name.includes("구매")) name = "부품 및 소모품 구매";
      else if (name.includes("사용법") || name.includes("설정") || name.includes("연결") || name.includes("기능")) name = "제품 사용법 및 조작";
      else if (name.includes("교환") || name.includes("반품") || name.includes("환불") || name.includes("배송")) name = "교환/반품/배송";
      else if (name.includes("보증") || name.includes("정품") || name.includes("등록")) name = "정품 등록 및 보증";
      else if (name.includes("상담원") || name.includes("연결")) name = "상담원 연결";

      if (!catMap[name]) {
        catMap[name] = { count: 0, sampleFaq: f.faq_question || "" };
      }
      catMap[name].count += f.hit_count;
      if (!catMap[name].sampleFaq && f.faq_question) {
        catMap[name].sampleFaq = f.faq_question;
      }
    });

    const sorted = Object.entries(catMap)
      .map(([name, val]) => ({ name, count: val.count, sampleFaq: val.sampleFaq }))
      .sort((a, b) => b.count - a.count);

    const totalCategoryHits = sorted.reduce((sum, item) => sum + item.count, 0) || 1;

    // 단답형 vs 장문형 질문 분석
    let shortCount = 0;
    let shortMatched = 0;
    let longCount = 0;
    let longMatched = 0;

    history.forEach((h) => {
      const len = (h.query || "").trim().length;
      if (len <= 10) {
        shortCount++;
        if (h.matched) shortMatched++;
      } else if (len >= 25) {
        longCount++;
        if (h.matched) longMatched++;
      }
    });

    const shortMatchRate = shortCount ? (shortMatched / shortCount) * 100 : 0;
    const longMatchRate = longCount ? (longMatched / longCount) * 100 : 0;

    return {
      list: sorted.slice(0, 5),
      totalCategoryHits,
      shortCount,
      shortMatchRate,
      longCount,
      longMatchRate,
    };
  }, [faqSummary, history]);

  // 4. CS 리스크 레이더 (긴급/불만 징후 감지) 및 이탈 지점 분석
  const riskData = useMemo(() => {
    const riskKeywords = ["고장", "환불", "파손", "불량", "폭발", "연기", "소비자원", "누수", "작동안함", "신고", "피해", "교환", "취소"];
    const riskQueries: HistoryRow[] = [];

    history.forEach((h) => {
      const q = (h.query || "").toLowerCase();
      if (riskKeywords.some((kw) => q.includes(kw))) {
        riskQueries.push(h);
      }
    });

    const riskCount = riskQueries.length;
    const riskRate = history.length ? (riskCount / history.length) * 100 : 0;
    const topUnmatched = unmatchedQueries.slice(0, 3);
    const friendRow = channelFriendSummary.find((c) => c.channel_friend_status === "friend");
    const friendCount = friendRow ? friendRow.total_requests : 0;
    const friendPct = totalCount ? (friendCount / totalCount) * 100 : 0;

    return {
      riskCount,
      riskRate,
      recentRiskQueries: riskQueries.slice(0, 4),
      topUnmatched,
      friendCount,
      friendPct,
    };
  }, [history, unmatchedQueries, channelFriendSummary, totalCount]);

  // 5. 5대 브랜드 챗봇 건강도 벤치마크 (Brand Health Index)
  const brandBenchmark = useMemo(() => {
    const defaultBrands = [
      { key: "dyson", name: "다이슨 (Dyson)" },
      { key: "laurastar", name: "로라스타 (Laurastar)" },
      { key: "imetec", name: "이메텍 (Imetec)" },
      { key: "delonghi", name: "드롱기 (Delonghi)" },
      { key: "bissell", name: "비쎌 (Bissell)" },
    ];

    const brandStats = defaultBrands.map((b) => {
      const bDaily = daily.filter((d) => (d.brand || "").toLowerCase().includes(b.key) || (d.brand_name || "").includes(b.name.split(" ")[0]));
      const total = bDaily.reduce((s, r) => s + r.total_count, 0);
      const matched = bDaily.reduce((s, r) => s + r.matched_count, 0);
      const unmatched = bDaily.reduce((s, r) => s + r.unmatched_count, 0);
      const rate = total ? (matched / total) * 100 : 0;

      const bFriends = channelFriendSummary.filter((f) => (f.brand || "").toLowerCase().includes(b.key) && f.channel_friend_status === "friend");
      const friends = bFriends.reduce((s, r) => s + r.total_requests, 0);
      const friendRate = total ? (friends / total) * 100 : 0;

      // 종합 건강도 점수 (100점 만점: 매칭률 50% + 친구율 30% + 미매칭 최소화율 20%)
      const unmatchedPen = total ? (unmatched / total) * 100 : 0;
      const healthScore = Math.min(100, Math.max(0, Math.round(rate * 0.5 + friendRate * 0.3 + Math.max(0, 100 - unmatchedPen * 2) * 0.2)));

      let grade = "A";
      let comment = "안정적 운영 중";
      if (healthScore >= 90) {
        grade = "S";
        comment = "최우수 응답 품질";
      } else if (healthScore >= 80) {
        grade = "A";
        comment = "우수 운영 (양호)";
      } else if (healthScore >= 65) {
        grade = "B";
        comment = "FAQ 보강 권장";
      } else {
        grade = "C";
        comment = "즉시 품질 개선 필요";
      }

      return {
        key: b.key,
        name: b.name,
        total,
        matched,
        unmatched,
        rate,
        friends,
        friendRate,
        healthScore,
        grade,
        comment,
      };
    });

    return brandStats.sort((a, b) => b.total - a.total);
  }, [daily, channelFriendSummary]);

  // 차트 옵션: 24시간대 인입 바 차트
  const hourlyChartOptions: ChartOptions<"bar"> = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: "rgba(15, 23, 42, 0.94)",
        padding: 10,
        cornerRadius: 8,
        callbacks: {
          title: (items) => `${items[0].label} 인입 현황`,
          label: (ctx) => `문의량: ${numberFormat.format(Number(ctx.raw))}건`,
        },
      },
    },
    scales: {
      x: {
        grid: { display: false },
        ticks: {
          font: { size: 10, family: "Pretendard" },
          color: "#64748b",
          autoSkip: true,
          maxTicksLimit: 12,
          maxRotation: 0,
        },
      },
      y: {
        grid: { color: "#f1f5f9" },
        ticks: {
          font: { size: 10, family: "Pretendard" },
          color: "#64748b",
          stepSize: 1,
          maxTicksLimit: 6,
        },
      },
    },
  };

  const hourlyChartData = {
    labels: temporalData.hourlyLabels,
    datasets: [
      {
        data: temporalData.hours,
        backgroundColor: temporalData.hours.map((_, i) =>
          i === temporalData.peakHour ? "#4f46e5" : i >= 9 && i < 18 ? "#818cf8" : "#cbd5e1"
        ),
        borderRadius: 4,
        borderSkipped: false,
      },
    ],
  };

  return (
    <section className="operational-insights-container">
      {/* Section Header */}
      <div className="insights-section-header">
        <div className="insights-header-title-box">
          <div className="insights-badge">실무자 종합 운영 인사이트 (CS & Operations)</div>
          <h2 className="insights-main-title">CS 실무자 및 브랜드 총괄을 위한 5대 심층 운영 분석</h2>
          <p className="insights-subtext">
            단순 수치 조회를 넘어 챗봇 자체 완결률(FCR), 요일별/시간대 집중도, 긴급 불만 레이더, 5대 브랜드 건강도를 다각도로 진단합니다.
          </p>
        </div>
        <div className="insights-meta-pill">
          <span>💡 5대 브랜드 실시간 행동 데이터 진단 완료</span>
        </div>
      </div>

      {/* Insight Navigation Segmented Tabs */}
      <div className="insight-tabs-bar">
        <button
          type="button"
          className={`insight-tab-btn ${activeInsightTab === "deflection" ? "active" : ""}`}
          onClick={() => setActiveInsightTab("deflection")}
        >
          🤖 챗봇 완결 & 1회 완결률 (FCR)
        </button>
        <button
          type="button"
          className={`insight-tab-btn ${activeInsightTab === "temporal" ? "active" : ""}`}
          onClick={() => setActiveInsightTab("temporal")}
        >
          ⏰ 요일 & 24시간 피크타임
        </button>
        <button
          type="button"
          className={`insight-tab-btn ${activeInsightTab === "category" ? "active" : ""}`}
          onClick={() => setActiveInsightTab("category")}
        >
          📋 문의 유형 & 질문 형태 분석
        </button>
        <button
          type="button"
          className={`insight-tab-btn ${activeInsightTab === "risk" ? "active" : ""}`}
          onClick={() => setActiveInsightTab("risk")}
        >
          🚨 불만 징후 & 이탈 지점 레이더
        </button>
        <button
          type="button"
          className={`insight-tab-btn ${activeInsightTab === "brands" ? "active" : ""}`}
          onClick={() => setActiveInsightTab("brands")}
        >
          🏆 5대 브랜드 챗봇 건강도 벤치마크
        </button>
      </div>

      {/* Tab Content 1: 챗봇 완결 & 1회 완결률 (FCR) */}
      {activeInsightTab === "deflection" && (
        <div className="insight-panel-content">
          <div className="operational-grid">
            <div className="insight-card">
              <div className="insight-card-header">
                <div className="insight-card-icon theme-emerald">🤖</div>
                <div className="insight-card-title-group">
                  <h3>챗봇 자체 완결률 & 상담원 인계 현황</h3>
                  <p>상담원 연결 없이 챗봇이 스스로 처리한 문의 비중</p>
                </div>
              </div>

              <div className="insight-stat-big-row">
                <div className="insight-stat-big">
                  <span className="big-value" style={{ color: "#059669" }}>
                    {deflectionData.deflectionRate.toFixed(1)}%
                  </span>
                  <span className="big-label">챗봇 자체 완결률 (Deflection Rate)</span>
                </div>
                <div className="insight-stat-sub-box">
                  <div className="stat-sub-item">
                    <span className="stat-sub-label">상담원 연결 요청:</span>
                    <span className="stat-sub-value" style={{ color: "#e11d48" }}>
                      {numberFormat.format(deflectionData.agentCount)}건 ({deflectionData.escalationRate.toFixed(1)}%)
                    </span>
                  </div>
                  <div className="stat-sub-item">
                    <span className="stat-sub-label">챗봇 자체 완결:</span>
                    <span className="stat-sub-value" style={{ color: "#059669" }}>
                      {numberFormat.format(deflectionData.selfCount)}건
                    </span>
                  </div>
                </div>
              </div>

              <div className="deflection-progress-bar-wrap">
                <div
                  className="deflection-bar-self"
                  style={{ width: `${deflectionData.deflectionRate}%` }}
                  title={`자체 완결 ${deflectionData.deflectionRate.toFixed(1)}%`}
                />
                <div
                  className="deflection-bar-agent"
                  style={{ width: `${deflectionData.escalationRate}%` }}
                  title={`상담원 연결 ${deflectionData.escalationRate.toFixed(1)}%`}
                />
              </div>
              <div className="deflection-legend">
                <span><span className="dot dot-self" /> 자체 완결 ({deflectionData.selfCount}건)</span>
                <span><span className="dot dot-agent" /> 상담원 인계 ({deflectionData.agentCount}건)</span>
              </div>

              <div className="insight-callout-box">
                <div className="callout-icon">⏱️</div>
                <div className="callout-content">
                  <strong>약 {numberFormat.format(deflectionData.savedHours)}시간의 CS 상담 업무 절감 효과</strong>
                  <p>고객 {numberFormat.format(deflectionData.selfCount)}명의 문의를 상담원 개입 없이 즉시 해결하여 인입 대기 시간을 최소화했습니다.</p>
                </div>
              </div>
            </div>

            <div className="insight-card">
              <div className="insight-card-header">
                <div className="insight-card-icon theme-blue">🎯</div>
                <div className="insight-card-title-group">
                  <h3>1회 완결률 (First-Contact Resolution, FCR)</h3>
                  <p>고객이 첫 번째 질문으로 즉시 답변을 찾고 만족한 비율</p>
                </div>
              </div>

              <div className="insight-stat-big-row">
                <div className="insight-stat-big">
                  <span className="big-value" style={{ color: "#2563eb" }}>
                    {deflectionData.fcrRate.toFixed(1)}%
                  </span>
                  <span className="big-label">1회 문의 즉시 완결률 (FCR)</span>
                </div>
                <div className="insight-stat-sub-box">
                  <div className="stat-sub-item">
                    <span className="stat-sub-label">고객 1인당 평균 질문:</span>
                    <span className="stat-sub-value" style={{ color: "#2563eb" }}>{deflectionData.avgQueriesPerUser}회</span>
                  </div>
                  <div className="stat-sub-item">
                    <span className="stat-sub-label">3회 이상 탐색 고객:</span>
                    <span className="stat-sub-value" style={{ color: "#e11d48" }}>{numberFormat.format(deflectionData.multiQueryUsers)}명</span>
                  </div>
                </div>
              </div>

              <div className="insight-callout-box" style={{ marginTop: "14px" }}>
                <div className="callout-icon">💡</div>
                <div className="callout-content">
                  <strong>첫 질문 완결성 진단</strong>
                  <p>
                    {deflectionData.fcrRate >= 70
                      ? `고객 10명 중 ${Math.round(deflectionData.fcrRate / 10)}명이 첫 질문에서 원하는 정보를 바로 찾아 챗봇 탐색 효율이 우수합니다.`
                      : "질문 횟수가 3회 이상인 고객은 원하는 FAQ를 찾지 못하고 헤매는 중일 가능성이 높으므로 상위 미매칭 키워드 보강이 필요합니다."}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tab Content 2: 요일 & 24시간 피크타임 */}
      {activeInsightTab === "temporal" && (
        <div className="insight-panel-content">
          <div className="operational-grid">
            <div className="insight-card">
              <div className="insight-card-header">
                <div className="insight-card-icon theme-indigo">⏰</div>
                <div className="insight-card-title-group">
                  <h3>24시간대별 고객 문의 인입 패턴</h3>
                  <p>하루 중 문의가 가장 집중되는 피크 시간대 진단</p>
                </div>
              </div>

              <div className="peak-hour-highlight">
                <div className="peak-label">최대 문의 집중 피크 시간대</div>
                <div className="peak-time-text">
                  <strong>{temporalData.peakHour}:00 ~ {temporalData.peakHour + 1}:00</strong>
                  <span className="peak-count-tag">인입 {numberFormat.format(temporalData.peakCount)}건</span>
                </div>
              </div>

              <div className="insight-chart-wrapper" style={{ height: "140px", marginTop: "8px" }}>
                <Bar data={hourlyChartData} options={hourlyChartOptions} />
              </div>

              <div className="hourly-legend-info">
                <div className="legend-chip"><span className="chip-color peak" /> 피크 시간</div>
                <div className="legend-chip"><span className="chip-color day" /> 근무시간 (09~18시)</div>
                <div className="legend-chip"><span className="chip-color night" /> 야간/무인 시간</div>
              </div>

              <div className="insight-callout-box" style={{ marginTop: "12px" }}>
                <div className="callout-icon">🌙</div>
                <div className="callout-content">
                  <strong>야간/휴일 무인 응대율: {deflectionData.nightRate.toFixed(1)}%</strong>
                  <p>상담원 퇴근 후에도 챗봇이 고객 문의의 약 {deflectionData.nightRate.toFixed(1)}%를 24시간 무중단 처리했습니다.</p>
                </div>
              </div>
            </div>

            <div className="insight-card">
              <div className="insight-card-header">
                <div className="insight-card-icon theme-purple">📅</div>
                <div className="insight-card-title-group">
                  <h3>요일별 인입 추이 & 주말 무인 성과</h3>
                  <p>월요병 집중도 및 주말 동안 축적된 챗봇 문의 분석</p>
                </div>
              </div>

              <div className="day-of-week-bars">
                {temporalData.dayNames.map((name, idx) => {
                  const count = temporalData.dayOfWeekCounts[idx];
                  const maxDayCount = Math.max(...temporalData.dayOfWeekCounts) || 1;
                  const pct = (count / maxDayCount) * 100;
                  const isMonday = idx === 1;
                  const isWeekend = idx === 0 || idx === 6;

                  return (
                    <div className="dow-bar-col" key={name}>
                      <div className="dow-bar-val">{count}</div>
                      <div className="dow-bar-track">
                        <div
                          className={`dow-bar-fill ${isMonday ? "monday" : isWeekend ? "weekend" : "weekday"}`}
                          style={{ height: `${Math.max(8, pct)}%` }}
                        />
                      </div>
                      <div className={`dow-bar-label ${isMonday ? "bold-monday" : ""}`}>{name}</div>
                    </div>
                  );
                })}
              </div>

              <div className="insight-stat-sub-box" style={{ marginTop: "14px" }}>
                <div className="stat-sub-item">
                  <span className="stat-sub-label">월요일 인입 비중:</span>
                  <span className="stat-sub-value" style={{ color: "#4f46e5" }}>
                    {numberFormat.format(temporalData.mondayCount)}건 ({temporalData.mondayRate.toFixed(1)}%)
                  </span>
                </div>
                <div className="stat-sub-item">
                  <span className="stat-sub-label">주말(토·일) 챗봇 무인 처리:</span>
                  <span className="stat-sub-value" style={{ color: "#7c3aed" }}>
                    {numberFormat.format(temporalData.weekendCount)}건 ({temporalData.weekendRate.toFixed(1)}%)
                  </span>
                </div>
              </div>

              <div className="insight-callout-box" style={{ marginTop: "12px" }}>
                <div className="callout-icon">💼</div>
                <div className="callout-content">
                  <strong>상담 인력 스케줄링 가이드</strong>
                  <p>주말 누적 문의로 인해 월요일 인입이 급증하므로 월요일 오전(09:00~11:30) 상담원 집중 배치를 권장합니다.</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tab Content 3: 문의 유형 & 질문 형태 분석 */}
      {activeInsightTab === "category" && (
        <div className="insight-panel-content">
          <div className="operational-grid">
            <div className="insight-card">
              <div className="insight-card-header">
                <div className="insight-card-icon theme-blue">📋</div>
                <div className="insight-card-title-group">
                  <h3>주요 고객 문의 카테고리 비중 (Top 5)</h3>
                  <p>고객 문의가 주로 어떤 주제로 이루어져 있는지 분석</p>
                </div>
              </div>

              <div className="category-bars-list">
                {categoryData.list.length > 0 ? (
                  categoryData.list.map((cat, idx) => {
                    const pct = (cat.count / categoryData.totalCategoryHits) * 100;
                    return (
                      <div className="cat-bar-item" key={cat.name}>
                        <div className="cat-bar-header">
                          <div className="cat-name-group">
                            <span className="cat-rank">{idx + 1}</span>
                            <span className="cat-name">{cat.name}</span>
                          </div>
                          <div className="cat-count-group">
                            <span className="cat-count">{numberFormat.format(cat.count)}건</span>
                            <span className="cat-pct">({pct.toFixed(1)}%)</span>
                          </div>
                        </div>
                        <div className="cat-progress-bg">
                          <div className="cat-progress-fill" style={{ width: `${Math.min(100, pct)}%` }} />
                        </div>
                        {cat.sampleFaq && (
                          <div className="cat-sample-faq">💡 대표 답변: <span>{cat.sampleFaq}</span></div>
                        )}
                      </div>
                    );
                  })
                ) : (
                  <div className="empty-insight-note">카테고리 데이터 집계 중입니다.</div>
                )}
              </div>
            </div>

            <div className="insight-card">
              <div className="insight-card-header">
                <div className="insight-card-icon theme-amber">🔤</div>
                <div className="insight-card-title-group">
                  <h3>고객 질문 형태 (단답형 vs 장문형) & 오타 교정</h3>
                  <p>질문 길이별 AI 매칭 성공률 및 자주 틀리는 오타 패턴</p>
                </div>
              </div>

              <div className="query-shape-comparison">
                <div className="query-shape-box">
                  <div className="shape-title">단답형 키워드 (10자 미만)</div>
                  <div className="shape-desc">예: &quot;필터&quot;, &quot;as접수&quot;, &quot;헤드&quot;</div>
                  <div className="shape-stats">
                    <span>인입: <strong>{numberFormat.format(categoryData.shortCount)}건</strong></span>
                    <span className="shape-rate-tag" style={{ color: "#059669" }}>매칭률 {categoryData.shortMatchRate.toFixed(1)}%</span>
                  </div>
                </div>

                <div className="query-shape-box" style={{ marginTop: "8px" }}>
                  <div className="shape-title">서술형 장문 (25자 이상)</div>
                  <div className="shape-desc">예: &quot;어제 받아서 써봤는데 전원이 자꾸 꺼져서 교환하고 싶어요&quot;</div>
                  <div className="shape-stats">
                    <span>인입: <strong>{numberFormat.format(categoryData.longCount)}건</strong></span>
                    <span className="shape-rate-tag" style={{ color: categoryData.longMatchRate < 70 ? "#e11d48" : "#059669" }}>
                      매칭률 {categoryData.longMatchRate.toFixed(1)}%
                    </span>
                  </div>
                </div>
              </div>

              <div className="insight-callout-box" style={{ marginTop: "12px" }}>
                <div className="callout-icon">✍️</div>
                <div className="callout-content">
                  <strong>오타 및 구어체 질문 보강 제안</strong>
                  <p>
                    {categoryData.longMatchRate < 75
                      ? "장문형 질문의 매칭률이 단답형 대비 다소 낮습니다. 고객이 흔히 쓰는 구어체(예: '불안들어옴', '충전안됨')를 FAQ 동의어에 추가하면 매칭 성공률이 즉시 향상됩니다."
                      : "단답형과 장문형 질문 모두 고른 매칭 성능을 유지하고 있습니다."}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tab Content 4: 불만 징후 & 이탈 지점 레이더 */}
      {activeInsightTab === "risk" && (
        <div className="insight-panel-content">
          <div className="operational-grid">
            <div className="insight-card">
              <div className="insight-card-header">
                <div className="insight-card-icon theme-rose">🚨</div>
                <div className="insight-card-title-group">
                  <h3>고객 불만 & 클레임 위험 징후 레이더 (Risk Radar)</h3>
                  <p>고장, 파손, 환불, 고발 등 즉각적인 조치가 필요한 긴급 질문</p>
                </div>
              </div>

              <div className="insight-stat-big-row">
                <div className="insight-stat-big">
                  <span className="big-value" style={{ color: "#e11d48" }}>
                    {numberFormat.format(riskData.riskCount)}건
                  </span>
                  <span className="big-label">위험 키워드 감지 (전체의 {riskData.riskRate.toFixed(1)}%)</span>
                </div>
              </div>

              <div className="dropoff-list" style={{ marginTop: "8px" }}>
                {riskData.recentRiskQueries.length > 0 ? (
                  riskData.recentRiskQueries.map((rq, idx) => (
                    <div className="dropoff-item" key={`${rq.query}-${idx}`}>
                      <span className="dropoff-badge">위험 #{idx + 1}</span>
                      <div className="dropoff-query-text">
                        <strong>[{rq.brand_name || rq.brand}]</strong> {rq.query}
                      </div>
                      <span className="dropoff-count">{rq.occurred_at ? rq.occurred_at.slice(11, 16) : ""}</span>
                    </div>
                  ))
                ) : (
                  <div className="empty-insight-note">현재 감지된 클레임 위험 질문이 없습니다.</div>
                )}
              </div>

              <div className="insight-callout-box" style={{ marginTop: "12px" }}>
                <div className="callout-icon">🛡️</div>
                <div className="callout-content">
                  <strong>선제적 CS 케어 권장</strong>
                  <p>환불 및 고장성 질문은 고객 이탈 및 브랜드 신뢰도 하락으로 직결되므로 전담 상담원이 우선적으로 확인해야 합니다.</p>
                </div>
              </div>
            </div>

            <div className="insight-card">
              <div className="insight-card-header">
                <div className="insight-card-icon theme-amber">⚠️</div>
                <div className="insight-card-title-group">
                  <h3>고객 이탈 지점 (미매칭 Top 3) & 채널 친구 특성</h3>
                  <p>답변 실패로 인해 고객이 창을 닫게 만드는 주요 질문</p>
                </div>
              </div>

              <div className="dropoff-list">
                {riskData.topUnmatched.length > 0 ? (
                  riskData.topUnmatched.map((item, idx) => (
                    <div className="dropoff-item" key={`${item.sample_query}-${idx}`}>
                      <span className="dropoff-badge">{idx + 1}위</span>
                      <div className="dropoff-query-text">{item.sample_query}</div>
                      <span className="dropoff-count">{item.query_count}회 이탈</span>
                    </div>
                  ))
                ) : (
                  <div className="empty-insight-note">현재 감지된 이탈 질문이 없습니다.</div>
                )}
              </div>

              <div className="segment-info-block" style={{ marginTop: "12px" }}>
                <div className="segment-header">
                  <span className="segment-icon">👥</span>
                  <strong>카카오 채널 친구 고객 비중</strong>
                </div>
                <div className="segment-content-text">
                  <p>현재 채널 친구 고객 인입률은 <strong>{riskData.friendPct.toFixed(1)}%</strong> ({numberFormat.format(riskData.friendCount)}건)입니다.</p>
                  <div className="kakao-sync-notice">
                    ℹ️ <strong>인구통계 안내:</strong> 카카오 기본 웹훅 정책에 따라 연령/성별은 기본 비식별 처리됩니다. 카카오 싱크(Kakao Sync) 간편가입 연동 시 상세 연령대/성별 수집이 가능합니다.
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tab Content 5: 5대 브랜드 챗봇 건강도 벤치마크 */}
      {activeInsightTab === "brands" && (
        <div className="insight-panel-content">
          <div className="brand-benchmark-card">
            <div className="benchmark-header-row">
              <div>
                <h3 className="benchmark-title">5대 브랜드 챗봇 종합 건강도 (Brand Health Score)</h3>
                <p className="benchmark-subtitle">응답 성공률(50%), 채널 친구 비중(30%), 미매칭 최소화율(20%)을 종합 평가한 성과 비교표입니다.</p>
              </div>
            </div>

            <div className="benchmark-table-wrapper">
              <table className="benchmark-table">
                <thead>
                  <tr>
                    <th>순위</th>
                    <th>브랜드명</th>
                    <th>총 대화량</th>
                    <th>자동 응답 성공</th>
                    <th>미매칭 건수</th>
                    <th>응답 성공률</th>
                    <th>채널 친구수</th>
                    <th>건강도 점수</th>
                    <th>운영 진단</th>
                  </tr>
                </thead>
                <tbody>
                  {brandBenchmark.map((b, idx) => (
                    <tr key={b.key}>
                      <td>
                        <span className={`rank-pill rank-${idx + 1}`}>{idx + 1}</span>
                      </td>
                      <td><strong>{b.name}</strong></td>
                      <td>{numberFormat.format(b.total)}건</td>
                      <td><span style={{ color: "#2563eb", fontWeight: 700 }}>{numberFormat.format(b.matched)}건</span></td>
                      <td><span style={{ color: "#e11d48", fontWeight: 700 }}>{numberFormat.format(b.unmatched)}건</span></td>
                      <td>
                        <span className={`status-pill ${b.rate >= 80 ? "success" : b.rate >= 60 ? "warning" : "danger"}`}>
                          {b.rate.toFixed(1)}%
                        </span>
                      </td>
                      <td>{numberFormat.format(b.friends)}건 ({b.friendRate.toFixed(1)}%)</td>
                      <td>
                        <div className="health-score-cell">
                          <span className={`grade-badge grade-${b.grade}`}>{b.grade}</span>
                          <strong>{b.healthScore}점</strong>
                        </div>
                      </td>
                      <td>
                        <span className="comment-pill">{b.comment}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="benchmark-footer-summary">
              <div className="bench-stat-chip">
                <span>최다 인입 브랜드:</span>
                <strong>{brandBenchmark[0]?.name || "-"} ({numberFormat.format(brandBenchmark[0]?.total || 0)}건)</strong>
              </div>
              <div className="bench-stat-chip">
                <span>최고 응답률 브랜드:</span>
                <strong>
                  {[...brandBenchmark].sort((a, b) => b.rate - a.rate)[0]?.name || "-"} (
                  {[...brandBenchmark].sort((a, b) => b.rate - a.rate)[0]?.rate.toFixed(1) || 0}%
                  )
                </strong>
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
