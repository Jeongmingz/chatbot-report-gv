"use client";

import { useMemo } from "react";
import { Bar } from "react-chartjs-2";
import type { ChartOptions } from "chart.js";
import {
  type HistoryRow,
  type FaqSummaryRow,
  type UnmatchedQueryRow,
  type ChannelFriendSummaryRow,
} from "@/lib/report";

interface OperationalInsightsProps {
  history: HistoryRow[];
  faqSummary: FaqSummaryRow[];
  unmatchedQueries: UnmatchedQueryRow[];
  channelFriendSummary: ChannelFriendSummaryRow[];
  totalCount: number;
}

const numberFormat = new Intl.NumberFormat("ko-KR");

export function OperationalInsights({
  history,
  faqSummary,
  unmatchedQueries,
  channelFriendSummary,
  totalCount,
}: OperationalInsightsProps) {
  // 1. 상담원 연결 vs 챗봇 자체 해결(Deflection Rate) 계산
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
      };
    }

    // 상담원 연결 관련 키워드 검출 (FAQ 질문 또는 고객 질문 또는 카테고리)
    const agentKeywords = ["상담원", "상담사", "직원 연결", "사람 연결", "유선 상담", "전화 상담", "전문 상담"];

    let agentCount = 0;
    let nightCount = 0; // 업무 외 시간(18시~익일 09시) 인입 건수

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
          // ignore parsing error
        }

        // 09시 이전 또는 18시 이후는 업무 외 시간
        if (hour >= 0 && (hour < 9 || hour >= 18)) {
          nightCount++;
        }
      }
    });

    // faqSummary에서도 보완 체크
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
    
    // 상담원 1건당 평균 5분(0.083시간) 소요 가정 시 절감된 상담 시간
    const savedHours = Math.round(selfCount * 0.083);
    const nightRate = totalCount ? (nightCount / (history.length || 1)) * 100 : 0;

    return {
      agentCount: effectiveAgentCount,
      selfCount,
      deflectionRate,
      escalationRate,
      savedHours,
      nightCount,
      nightRate,
    };
  }, [history, faqSummary, totalCount]);

  // 2. 24시간대별 고객 문의 인입 패턴 분석
  const hourlyData = useMemo(() => {
    const hours = Array.from({ length: 24 }, () => 0);

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

    return {
      hours,
      peakHour,
      peakCount: maxCount,
      labels: Array.from({ length: 24 }, (_, i) => `${i}시`),
    };
  }, [history]);

  // 3. 고객 주요 질문 유형 (카테고리/인텐트) 비중 분석
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

    return {
      list: sorted.slice(0, 5),
      totalCategoryHits,
    };
  }, [faqSummary]);

  // 4. 이탈 지점 및 미매칭 요약
  const dropoffData = useMemo(() => {
    const topUnmatched = unmatchedQueries.slice(0, 3);
    const friendRow = channelFriendSummary.find((c) => c.channel_friend_status === "friend");
    const friendCount = friendRow ? friendRow.total_requests : 0;
    const friendPct = totalCount ? (friendCount / totalCount) * 100 : 0;

    return {
      topUnmatched,
      friendCount,
      friendPct,
    };
  }, [unmatchedQueries, channelFriendSummary, totalCount]);

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
        ticks: { font: { size: 10, family: "Pretendard" }, color: "#64748b" },
      },
      y: {
        grid: { color: "#f1f5f9" },
        ticks: { font: { size: 10, family: "Pretendard" }, color: "#64748b", stepSize: 1 },
      },
    },
  };

  const hourlyChartData = {
    labels: hourlyData.labels,
    datasets: [
      {
        data: hourlyData.hours,
        backgroundColor: hourlyData.hours.map((_, i) =>
          i === hourlyData.peakHour ? "#4f46e5" : i >= 9 && i < 18 ? "#818cf8" : "#cbd5e1"
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
          <div className="insights-badge">실무자 운영 인사이트</div>
          <h2 className="insights-main-title">CS 실무자를 위한 핵심 운영 지표 & 고객 행동 분석</h2>
          <p className="insights-subtext">
            단순 수치 조회를 넘어 상담원 인계율, 문의 피크 시간대, 주요 문의 유형 및 고객 이탈 지점을 즉시 진단합니다.
          </p>
        </div>
        <div className="insights-meta-pill">
          <span>💡 실시간 행동 데이터 진단 완료</span>
        </div>
      </div>

      {/* Insights 4-Card Grid */}
      <div className="operational-grid">
        {/* Card 1: 답장 완결 & 상담원 연결 분석 */}
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
              <span className="big-label">챗봇 자체 완결률 (Deflection)</span>
            </div>
            <div className="insight-stat-sub-box">
              <div className="stat-sub-item">
                <span className="stat-sub-label">상담원 연결 요청</span>
                <span className="stat-sub-value" style={{ color: "#e11d48" }}>
                  {numberFormat.format(deflectionData.agentCount)}건 ({deflectionData.escalationRate.toFixed(1)}%)
                </span>
              </div>
              <div className="stat-sub-item">
                <span className="stat-sub-label">챗봇 자체 완결</span>
                <span className="stat-sub-value" style={{ color: "#059669" }}>
                  {numberFormat.format(deflectionData.selfCount)}건
                </span>
              </div>
            </div>
          </div>

          {/* Progress Comparison */}
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
            <span>
              <span className="dot dot-self" /> 자체 완결 ({deflectionData.selfCount}건)
            </span>
            <span>
              <span className="dot dot-agent" /> 상담원 인계 ({deflectionData.agentCount}건)
            </span>
          </div>

          {/* Operational Impact Note */}
          <div className="insight-callout-box">
            <div className="callout-icon">⏱️</div>
            <div className="callout-content">
              <strong>약 {numberFormat.format(deflectionData.savedHours)}시간의 CS 업무 절감 효과</strong>
              <p>
                고객 {numberFormat.format(deflectionData.selfCount)}명의 문의를 상담원 개입 없이 즉시 해결하여 인입 대기 시간을 최소화했습니다.
              </p>
            </div>
          </div>
        </div>

        {/* Card 2: 24시간대별 인입 패턴 & 피크타임 */}
        <div className="insight-card">
          <div className="insight-card-header">
            <div className="insight-card-icon theme-indigo">⏰</div>
            <div className="insight-card-title-group">
              <h3>24시간대별 고객 문의 인입 패턴</h3>
              <p>고객 문의가 가장 집중되는 피크 시간대 분석</p>
            </div>
          </div>

          {/* Peak Time Badge */}
          <div className="peak-hour-highlight">
            <div className="peak-label">최대 문의 집중 시간대</div>
            <div className="peak-time-text">
              <strong>{hourlyData.peakHour}:00 ~ {hourlyData.peakHour + 1}:00</strong>
              <span className="peak-count-tag">
                피크 인입 {numberFormat.format(hourlyData.peakCount)}건
              </span>
            </div>
          </div>

          {/* 24H Bar Chart */}
          <div className="insight-chart-wrapper" style={{ height: "140px", marginTop: "10px" }}>
            <Bar data={hourlyChartData} options={hourlyChartOptions} />
          </div>

          <div className="hourly-legend-info">
            <div className="legend-chip">
              <span className="chip-color peak" /> 피크 시간
            </div>
            <div className="legend-chip">
              <span className="chip-color day" /> 근무시간 (09~18시)
            </div>
            <div className="legend-chip">
              <span className="chip-color night" /> 야간/무인 시간
            </div>
          </div>

          <div className="insight-callout-box" style={{ marginTop: "12px" }}>
            <div className="callout-icon">🌙</div>
            <div className="callout-content">
              <strong>업무 외 시간(야간/휴일) 자동 응대</strong>
              <p>
                전체 대화 중 약 {deflectionData.nightRate.toFixed(1)}%가 상담원 부재 시간대에 발생하여 챗봇이 무중단 안내를 전담했습니다.
              </p>
            </div>
          </div>
        </div>

        {/* Card 3: 고객 주요 질문 유형 (카테고리/인텐트) */}
        <div className="insight-card">
          <div className="insight-card-header">
            <div className="insight-card-icon theme-blue">📋</div>
            <div className="insight-card-title-group">
              <h3>주요 고객 문의 카테고리 분석</h3>
              <p>고객의 질문이 주로 어떤 유형으로 이루어져 있는지 진단</p>
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
                      <div className="cat-sample-faq">
                        💡 대표 답변: <span>{cat.sampleFaq}</span>
                      </div>
                    )}
                  </div>
                );
              })
            ) : (
              <div className="empty-insight-note">카테고리 데이터 집계 중입니다.</div>
            )}
          </div>

          <div className="insight-callout-box" style={{ marginTop: "12px" }}>
            <div className="callout-icon">🎯</div>
            <div className="callout-content">
              <strong>CS 운영 팁</strong>
              <p>
                {categoryData.list[0]
                  ? `가장 비중이 높은 '${categoryData.list[0].name}' 메뉴의 FAQ 답변을 최신 정보로 유지하면 매칭률이 극대화됩니다.`
                  : "FAQ 답변을 체계적으로 분류하여 고객 문의를 분산할 수 있습니다."}
              </p>
            </div>
          </div>
        </div>

        {/* Card 4: 고객 이탈 지점 및 고객 세그먼트 진단 */}
        <div className="insight-card">
          <div className="insight-card-header">
            <div className="insight-card-icon theme-rose">🚨</div>
            <div className="insight-card-title-group">
              <h3>고객 이탈 지점 및 세그먼트 진단</h3>
              <p>답변 실패로 인한 이탈 위험 구간과 채널 고객 특성</p>
            </div>
          </div>

          {/* Drop-off Warning Section */}
          <div className="dropoff-section">
            <div className="dropoff-title">
              <span>⚠️ 주요 이탈 유발 질문 (미매칭 Top 3)</span>
              <span className="dropoff-guide">즉시 FAQ 등록 권장</span>
            </div>
            <div className="dropoff-list">
              {dropoffData.topUnmatched.length > 0 ? (
                dropoffData.topUnmatched.map((item, idx) => (
                  <div className="dropoff-item" key={`${item.sample_query}-${idx}`}>
                    <span className="dropoff-badge">{idx + 1}위</span>
                    <div className="dropoff-query-text">{item.sample_query}</div>
                    <span className="dropoff-count">{item.query_count}회 이탈</span>
                  </div>
                ))
              ) : (
                <div className="empty-insight-note">현재 감지된 이탈 유발 질문이 없습니다.</div>
              )}
            </div>
          </div>

          {/* Demographic & Kakao Profile Segment Note */}
          <div className="segment-info-block">
            <div className="segment-header">
              <span className="segment-icon">👥</span>
              <strong>고객 프로필 및 인구통계 특성</strong>
            </div>
            <div className="segment-content-text">
              <p>
                현재 카카오 채널 친구 고객의 인입 비중은 <strong>{dropoffData.friendPct.toFixed(1)}%</strong> ({numberFormat.format(dropoffData.friendCount)}건)입니다.
              </p>
              <div className="kakao-sync-notice">
                ℹ️ <strong>연령대 및 성별 안내:</strong> 카카오 기본 웹훅 정책에 따라 개인정보(연령/성별)는 기본 비식별 처리됩니다. 카카오 싱크(Kakao Sync) 간편가입 연동 시 상세 연령대/성별 인구통계 수집이 가능합니다.
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
