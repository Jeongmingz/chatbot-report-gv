"use client";

import { useMemo, useRef, useState } from "react";
import { BarElement, CategoryScale, Chart as ChartJS, LinearScale, Tooltip } from "chart.js";
import { Bar } from "react-chartjs-2";
import { aggregateDailyByDate, type ReportRow, type UnmatchedQueryRow } from "@/lib/report";
import type { Activity } from "@/lib/period-report";
import type { KpiDrilldownType } from "./kpi-drilldown-modal";

ChartJS.register(BarElement, CategoryScale, LinearScale, Tooltip);

const number = new Intl.NumberFormat("ko-KR");
const weekdays = ["월", "화", "수", "목", "금", "토", "일"];
const colors = ["#2b4143", "#345751", "#377764", "#469879", "#66bd95", "#a6edb4"];
type Summary = {
  totalCount: number; matchedCount: number; unmatchedCount: number; matchRate: number;
  friendRequests: number; improvementCount: number;
};

function TrafficMap({ matrix }: { matrix: number[][] }) {
  const cells = useMemo(() => weekdays.flatMap((_, day) => matrix[(day + 1) % 7]), [matrix]);
  const peak = Math.max(...cells);
  const [selection, setSelection] = useState(cells.indexOf(peak));
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const day = Math.floor(selection / 24);
  const hour = selection % 24;
  return (
    <section className="ax-card ax-traffic">
      <header><h2>문의 집중 시간</h2><span>한국시간</span></header>
      <div className="ax-heat-viewport">
        <div className="ax-heat" role="group" aria-label="요일과 시간대별 문의 수. 방향키로 이동">
          <div className="ax-hour-labels" aria-hidden="true"><i />{[0, 4, 8, 12, 16, 20].map(h => <span key={h}>{h}시</span>)}</div>
          {weekdays.map((label, d) => (
            <div className="ax-heat-row" key={label}>
              <span aria-hidden="true">{label}</span>
              {cells.slice(d * 24, (d + 1) * 24).map((count, h) => {
                const i = d * 24 + h;
                const description = label + "요일 " + h + "시, 문의 " + number.format(count) + "건";
                return <button type="button" key={h} ref={node => { refs.current[i] = node; }}
                  aria-label={description} title={description} aria-pressed={i === selection}
                  tabIndex={i === selection ? 0 : -1}
                  style={{ backgroundColor: colors[count > 0 ? Math.ceil(count / peak * 5) : 0] }}
                  onFocus={() => setSelection(i)} onClick={() => setSelection(i)}
                  onKeyDown={event => {
                    const steps: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -24, ArrowDown: 24 };
                    if (!(event.key in steps)) return;
                    event.preventDefault();
                    refs.current[Math.max(0, Math.min(167, i + steps[event.key]))]?.focus();
                  }}
                />;
              })}
            </div>
          ))}
        </div>
      </div>
      <footer><div aria-live="polite"><strong>{weekdays[day]}요일 {hour}시대</strong><span>{number.format(cells[selection])}건</span></div><small>적음 {colors.map(c => <i key={c} style={{ backgroundColor: c }} />)} 많음</small></footer>
    </section>
  );
}

export function AnalysisOverview({ daily, activity, unmatched, summary, onDay, onRecords, onMetric }: {
  daily: ReportRow[]; activity: Activity; unmatched: UnmatchedQueryRow[]; summary: Summary;
  onDay: (day: string) => void; onRecords: (query: string) => void; onMetric: (type: KpiDrilldownType) => void;
}) {
  const days = useMemo(() => aggregateDailyByDate(daily), [daily]);
  const [selected, setSelected] = useState(days[days.length - 1].date);
  const [metric, setMetric] = useState<"volume" | "rate">("volume");
  const current = days.find(day => day.date === selected) || days[days.length - 1];
  const rateMode = metric === "rate";
  const metrics: [KpiDrilldownType, string, string, string][] = [
    ["total", "전체 문의", number.format(summary.totalCount), "건"],
    ["rate", "FAQ 매칭률", summary.matchRate.toFixed(1), "%"],
    ["unmatched", "미매칭 문의", number.format(summary.unmatchedCount), "건"],
    ["improvement", "FAQ 개선 대상", number.format(summary.improvementCount), "건"],
  ];
  return (
    <div className="ax-overview">
      <div className="ax-metrics">
        {metrics.map(([id, label, value, unit]) => <button key={id} type="button" onClick={() => onMetric(id)}>
          <span>{label}<b aria-hidden="true">↗</b></span><strong>{value}<small>{unit}</small></strong>
        </button>)}
      </div>
      <div className="ax-grid">
        <section className="ax-card ax-trend">
          <header><h2>일별 문의 추이</h2><div className="ax-switch" aria-label="차트 지표">
            {([["volume", "건수"], ["rate", "매칭률"]] as const).map(([id, label]) => <button type="button" key={id} aria-pressed={metric === id} onClick={() => setMetric(id)}>{label}</button>)}
          </div></header>
          <div className="ax-legend">
            <span><i />{rateMode ? "FAQ 매칭률" : "FAQ 매칭"}</span>
            {!rateMode && <span><i />미매칭</span>}<small>문의가 있는 날짜 기준</small>
          </div>
          <div className="ax-chart">
            <Bar aria-label={rateMode ? "일별 FAQ 매칭률" : "일별 FAQ 매칭과 미매칭 건수"} role="img"
              data={{ labels: days.map(d => d.date), datasets: rateMode ? [
                { label: "매칭률 (%)", data: days.map(d => Number((d.matched / d.total * 100).toFixed(1))), backgroundColor: "#27806b", borderRadius: 3 },
              ] : [
                { label: "FAQ 매칭", data: days.map(d => d.matched), backgroundColor: "#27806b" },
                { label: "미매칭", data: days.map(d => d.unmatched), backgroundColor: "#efa064", borderRadius: 3 },
              ] }}
              options={{ responsive: true, maintainAspectRatio: false, animation: false,
                interaction: { mode: "index", intersect: false },
                onClick: (_, items) => { if (items.length) setSelected(days[items[0].index].date); },
                plugins: { legend: { display: false } },
                scales: {
                  x: { stacked: true, grid: { display: false }, ticks: { maxRotation: 0, maxTicksLimit: 8, callback: (_, i) => days[i]?.date.slice(5) } },
                  y: { stacked: true, beginAtZero: true, max: rateMode ? 100 : undefined, border: { display: false }, grid: { color: "#e6ece9" }, ticks: { precision: 0, maxTicksLimit: 5 } },
                },
              }}
            />
          </div>
          <div className="ax-day"><label>날짜 선택<select value={current.date} onChange={e => setSelected(e.target.value)}>
            {days.map(d => <option key={d.date}>{d.date}</option>)}
          </select></label><div aria-live="polite">매칭 {number.format(current.matched)}건 · 미매칭 {number.format(current.unmatched)}건</div>
          <button type="button" onClick={() => onDay(current.date)}>이날 미매칭 보기 →</button></div>
        </section>
        <TrafficMap matrix={activity.hourlyByWeekday} />
      </div>
      <section className="ax-card ax-queue">
        <header><h2>자주 들어온 미매칭 질문</h2><button type="button" onClick={() => onRecords("")}>전체 보기 →</button></header>
        {unmatched.length ? <ol>{unmatched.slice(0, 5).map((q, i) => <li key={i}>
          <button type="button" onClick={() => onRecords(q.sample_query)}>
            <span>{String(i + 1).padStart(2, "0")}</span><strong>{q.sample_query || "내용 없음"}</strong>
            <small>{q.brand_name || q.brand}</small><b>{number.format(q.query_count)}건</b>
          </button>
        </li>)}</ol> : <p>선택 기간에는 미매칭 질문이 없습니다.</p>}
      </section>
      <div className="ax-related">
        <button type="button" onClick={() => onMetric("matched")}>FAQ 매칭 문의 <strong>{number.format(summary.matchedCount)}건 ↗</strong></button>
        <button type="button" onClick={() => onMetric("friend")}>채널 친구 문의 <strong>{number.format(summary.friendRequests)}건 ↗</strong></button>
      </div>
    </div>
  );
}
