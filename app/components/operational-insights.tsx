"use client";

import { useMemo, useState } from "react";
import { Bar } from "react-chartjs-2";
import type { ChartOptions } from "chart.js";
import {
  type UnmatchedQueryRow,
  type ChannelFriendSummaryRow,
  type ReportRow,
} from "@/lib/report";
import {
  calculateBrandHealth,
  MIN_BRAND_HEALTH_SAMPLE,
  type BrandHealthStatus,
} from "@/lib/brand-health";

import { percent, type Activity } from "@/lib/period-report";

interface OperationalInsightsProps {
  activity: Activity;
  unmatchedQueries: UnmatchedQueryRow[];
  channelFriendSummary: ChannelFriendSummaryRow[];
  daily: ReportRow[];
  brands: Array<{ brand: string; brand_name: string }>;
  totalCount: number;
}

const numberFormat = new Intl.NumberFormat("ko-KR");

function brandHealthTone(status: BrandHealthStatus): "success" | "warning" | "danger" | "info" | "neutral" {
  if (status === "healthy") return "success";
  if (status === "watch") return "warning";
  if (status === "improve") return "danger";
  if (status === "insufficient") return "info";
  return "neutral";
}

export function OperationalInsights({
  activity,
  unmatchedQueries,
  channelFriendSummary,
  daily,
  brands,
  totalCount,
}: OperationalInsightsProps) {
  const [activeInsightTab, setActiveInsightTab] = useState<"deflection" | "temporal" | "category" | "risk" | "brands">("deflection");

  const peakCount = Math.max(...activity.hours);
  const peakHour = activity.hours.indexOf(peakCount);
  const weekendCount = activity.weekdays[0] + activity.weekdays[6];
  const nightCount = activity.hours.reduce((sum, count, hour) => sum + (hour < 9 || hour >= 18 ? count : 0), 0);
  const categoryHits = daily.reduce((sum, row) => sum + row.matched_count, 0);
  const friendCount = channelFriendSummary.filter(row => row.channel_friend_status === "friend").reduce((sum, row) => sum + row.total_requests, 0);

  // 5. 실제 등록 브랜드와 선택 기간의 일별 집계를 이용한 응답 건강도
  const brandBenchmark = useMemo(() => {
    return calculateBrandHealth(daily, brands);
  }, [daily, brands]);

  const evaluatedBrands = useMemo(
    () => brandBenchmark.filter((brand) => brand.isEvaluated),
    [brandBenchmark],
  );
  const topVolumeBrand = brandBenchmark.find((brand) => brand.total > 0);
  const reviewPriorityBrand = [...evaluatedBrands].sort((left, right) => left.rate - right.rate)[0];

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
    labels: activity.hours.map((_, hour) => hour + "시"),
    datasets: [
      {
        data: activity.hours,
        backgroundColor: activity.hours.map((_, i) =>
          i === peakHour ? "#17634f" : i >= 9 && i < 18 ? "#64a58a" : "#cbd5d1"
        ),
        borderRadius: 4,
        borderSkipped: false,
      },
    ],
  };

  return (
    <section className="operational-insights-container">
      <div className="insight-tabs-bar" role="group" aria-label="운영 진단 주제">
        {([["deflection", "고객 문의 행동"], ["temporal", "요일·시간대"], ["category", "질문 유형"], ["risk", "불만 징후"], ["brands", "브랜드 비교"]] as const).map(([id, label]) => (
          <button type="button" key={id} className={`insight-tab-btn ${activeInsightTab === id ? "active" : ""}`}
            aria-pressed={activeInsightTab === id} onClick={() => setActiveInsightTab(id)}>{label}</button>
        ))}
      </div>

      {activeInsightTab === "deflection" && (
        <div className="operational-grid">
          <div className="insight-card">
            <h3>상담원을 언급한 문의</h3>
            <strong className="big-value">{percent(activity.agentCount, totalCount)}</strong>
            <p>전체 {numberFormat.format(totalCount)}건 중 상담원·상담사·전화 상담 등의 표현이 포함된 질문 {numberFormat.format(activity.agentCount)}건</p>
          </div>
          <div className="insight-card">
            <h3>한 번만 문의한 식별 고객</h3>
            <strong className="big-value">{percent(activity.singleUsers, activity.users)}</strong>
            <p>조회 기간에 고객 ID가 있는 {numberFormat.format(activity.users)}명 중 한 번 문의한 고객 {numberFormat.format(activity.singleUsers)}명</p>
            <p>식별 고객의 문의 {numberFormat.format(activity.identifiedRequests)}건 · 고객 ID가 없는 문의 {numberFormat.format(totalCount - activity.identifiedRequests)}건</p>
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
                  <strong>{peakHour}:00 ~ {peakHour + 1}:00</strong>
                  <span className="peak-count-tag">인입 {numberFormat.format(peakCount)}건</span>
                </div>
              </div>

              <div className="insight-chart-wrapper" style={{ height: "140px", marginTop: "8px" }}>
                <Bar data={hourlyChartData} options={hourlyChartOptions} />
              </div>

              <div className="hourly-legend-info">
                <div className="legend-chip"><span className="chip-color peak" /> 피크 시간</div>
                <div className="legend-chip"><span className="chip-color day" /> 근무시간 (09~18시)</div>
                <div className="legend-chip"><span className="chip-color night" /> 근무시간 외</div>
              </div>

              <div className="insight-callout-box" style={{ marginTop: "12px" }}>
                <div className="callout-icon">🌙</div>
                <div className="callout-content">
                  <strong>09~18시 외 문의 비중 {percent(nightCount, totalCount)}</strong>
                  <p>한국 시간 기준 18시부터 다음 날 09시 전까지 접수된 문의는 {numberFormat.format(nightCount)}건입니다.</p>
                </div>
              </div>
            </div>

            <div className="insight-card">
              <div className="insight-card-header">
                <div className="insight-card-icon theme-purple">📅</div>
                <div className="insight-card-title-group">
                  <h3>요일별 인입 추이 & 주말 문의량</h3>
                  <p>조회 기간의 요일별 문의 건수</p>
                </div>
              </div>

              <div className="day-of-week-bars">
                {["일", "월", "화", "수", "목", "금", "토"].map((name, idx) => {
                  const count = activity.weekdays[idx];
                  const maxDayCount = Math.max(...activity.weekdays) || 1;
                  const pct = (count / maxDayCount) * 100;
                  const isMonday = idx === 1;
                  const isWeekend = idx === 0 || idx === 6;

                  return (
                    <div className="dow-bar-col" key={name}>
                      <div className="dow-bar-val">{count}</div>
                      <div className="dow-bar-track">
                        <div
                          className={`dow-bar-fill ${isMonday ? "monday" : isWeekend ? "weekend" : "weekday"}`}
                          style={{ height: `${pct}%` }}
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
                    {numberFormat.format(activity.weekdays[1])}건 ({percent(activity.weekdays[1], totalCount)})
                  </span>
                </div>
                <div className="stat-sub-item">
                  <span className="stat-sub-label">주말(토·일) 문의:</span>
                  <span className="stat-sub-value" style={{ color: "#7c3aed" }}>
                    {numberFormat.format(weekendCount)}건 ({percent(weekendCount, totalCount)})
                  </span>
                </div>
              </div>

              <div className="insight-callout-box" style={{ marginTop: "12px" }}>
                <div className="callout-icon">💼</div>
                <div className="callout-content">
                  <strong>상담 인력 스케줄링 가이드</strong>
                  <p>요일별 합계는 조회 기간에 각 요일이 포함된 횟수의 영향을 받습니다.</p>
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
                {activity.categories.length > 0 ? (
                  activity.categories.map((cat, idx) => {
                    const pct = (cat.count / categoryHits) * 100;
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

                      </div>
                    );
                  })
                ) : (
                  <div className="empty-insight-note">매칭된 FAQ가 없습니다.</div>
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
                  <div className="shape-title">단답형 키워드 (10자 이하)</div>
                  <div className="shape-desc">예: &quot;필터&quot;, &quot;as접수&quot;, &quot;헤드&quot;</div>
                  <div className="shape-stats">
                    <span>인입: <strong>{numberFormat.format(activity.shortCount)}건</strong></span>
                    <span className="shape-rate-tag" style={{ color: "#059669" }}>매칭률 {percent(activity.shortMatched, activity.shortCount)}</span>
                  </div>
                </div>

                <div className="query-shape-box" style={{ marginTop: "8px" }}>
                  <div className="shape-title">서술형 장문 (25자 이상)</div>
                  <div className="shape-desc">예: &quot;어제 받아서 써봤는데 전원이 자꾸 꺼져서 교환하고 싶어요&quot;</div>
                  <div className="shape-stats">
                    <span>인입: <strong>{numberFormat.format(activity.longCount)}건</strong></span>
                    <span className="shape-rate-tag" style={{ color: activity.longCount > 0 && activity.longMatched / activity.longCount < 0.7 ? "#e11d48" : "#059669" }}>
                      매칭률 {percent(activity.longMatched, activity.longCount)}
                    </span>
                  </div>
                </div>
              </div>

              <div className="insight-callout-box" style={{ marginTop: "12px" }}>
                <div className="callout-icon">✍️</div>
                <div className="callout-content">
                  <strong>오타 및 구어체 질문 보강 제안</strong>
                  <p>
                    질문 길이별 인입 건수와 FAQ 매칭률을 함께 확인하세요.
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
                  <h3>불만 관련 키워드가 포함된 질문</h3>
                  <p>고장·파손·환불 등의 표현을 기준으로 집계합니다.</p>
                </div>
              </div>

              <div className="insight-stat-big-row">
                <div className="insight-stat-big">
                  <span className="big-value" style={{ color: "#e11d48" }}>
                    {numberFormat.format(activity.riskCount)}건
                  </span>
                  <span className="big-label">위험 키워드 감지 (전체의 {percent(activity.riskCount, totalCount)})</span>
                </div>
              </div>

              <div className="dropoff-list" style={{ marginTop: "8px" }}>
                {activity.risks.length > 0 ? (
                  activity.risks.map((rq, idx) => (
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
                  <h3>반복 미매칭 문의 (미매칭 Top 3) & 채널 친구 특성</h3>
                  <p>표준 FAQ와 매칭되지 않은 주요 질문</p>
                </div>
              </div>

              <div className="dropoff-list">
                {unmatchedQueries.slice(0, 3).length > 0 ? (
                  unmatchedQueries.slice(0, 3).map((item, idx) => (
                    <div className="dropoff-item" key={`${item.sample_query}-${idx}`}>
                      <span className="dropoff-badge">{idx + 1}위</span>
                      <div className="dropoff-query-text">{item.sample_query}</div>
                      <span className="dropoff-count">{item.query_count}회 미매칭</span>
                    </div>
                  ))
                ) : (
                  <div className="empty-insight-note">현재 감지된 미매칭 질문이 없습니다.</div>
                )}
              </div>

              <div className="segment-info-block" style={{ marginTop: "12px" }}>
                <div className="segment-header">
                  <span className="segment-icon">👥</span>
                  <strong>카카오 채널 친구 고객 비중</strong>
                </div>
                <div className="segment-content-text">
                  <p>현재 채널 친구 고객 인입률은 <strong>{percent(friendCount, totalCount)}</strong> ({numberFormat.format(friendCount)}건)입니다.</p>
                  <div className="kakao-sync-notice">
                    ℹ️ <strong>인구통계 안내:</strong> 카카오 기본 웹훅 정책에 따라 연령/성별은 기본 비식별 처리됩니다. 카카오 싱크(Kakao Sync) 간편가입 연동 시 상세 연령대/성별 수집이 가능합니다.
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tab Content 5: 실제 브랜드별 응답 건강도 */}
      {activeInsightTab === "brands" && (
        <div className="insight-panel-content">
          <div className="brand-benchmark-card">
            <div className="benchmark-header-row">
              <div>
                <h3 className="benchmark-title">브랜드별 챗봇 응답 건강도</h3>
                <p className="benchmark-subtitle">
                  선택 기간의 실제 대화량과 응답 성공률을 사용합니다. {MIN_BRAND_HEALTH_SAMPLE}건 미만은 표본 부족, 0건은 데이터 없음으로 표시합니다.
                </p>
              </div>
            </div>

            <div className="benchmark-table-wrapper">
              <table className="benchmark-table">
                <thead>
                  <tr>
                    <th>평가 상태</th>
                    <th>브랜드명</th>
                    <th>총 대화량</th>
                    <th>자동 응답 성공</th>
                    <th>미매칭 건수</th>
                    <th>응답 성공률</th>
                    <th>확인할 내용</th>
                  </tr>
                </thead>
                <tbody>
                  {brandBenchmark.map((b) => (
                    <tr key={b.key}>
                      <td>
                        <span className={`status-pill ${brandHealthTone(b.status)}`}>{b.statusLabel}</span>
                      </td>
                      <td><strong>{b.name}</strong></td>
                      <td>{numberFormat.format(b.total)}건</td>
                      <td><span style={{ color: "#2563eb", fontWeight: 700 }}>{numberFormat.format(b.matched)}건</span></td>
                      <td><span style={{ color: "#e11d48", fontWeight: 700 }}>{numberFormat.format(b.unmatched)}건</span></td>
                      <td>
                        <span className={`status-pill ${b.isEvaluated ? (b.rate >= 80 ? "success" : b.rate >= 60 ? "warning" : "danger") : "neutral"}`}>
                          {b.rate.toFixed(1)}%
                        </span>
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
                <strong>{topVolumeBrand ? `${topVolumeBrand.name} (${numberFormat.format(topVolumeBrand.total)}건)` : "데이터 없음"}</strong>
              </div>
              <div className="bench-stat-chip">
                <span>점검 우선 브랜드:</span>
                <strong>{reviewPriorityBrand ? `${reviewPriorityBrand.name} (${reviewPriorityBrand.rate.toFixed(1)}%)` : "평가 가능한 표본 없음"}</strong>
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
