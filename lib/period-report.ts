import type { HistoryRow, ReportRow, FaqSummaryRow, UnmatchedQueryRow, ImprovementQueueRow, ChannelFriendSummaryRow } from "./report";
import { maskContact } from "./report-output";
import { shiftDate } from "./report-period";

export type SourceRow = HistoryRow & { category_id: string | null; query_normalized: string | null };
type Group<T> = { row: T; count: number; score: number; users: Set<string> };

function add<T>(map: Map<string, Group<T>>, key: unknown[], input: SourceRow, initial: () => T) {
  const id = JSON.stringify(key);
  let group = map.get(id);
  if (!group) {
    group = { row: initial(), users: new Set(), count: 0, score: 0 };
    map.set(id, group);
  }
  group.count++;
  group.score += input.score;
  if (input.user_id) group.users.add(input.user_id);
  return group.row;
}

function averages<T>(map: Map<string, Group<T>>) {
  return [...map.values()].map(({ row, users, score, count }) => ({
    ...row, unique_user_count: users.size, avg_score: Number((score / count).toFixed(2)),
  }));
}

function categoryLabel(value: string | null) {
  const name = value?.trim() || "기타/일반 안내";
  if (/상담원|상담사/.test(name)) return "상담원 연결";
  if (/배송|교환|반품|환불/.test(name)) return "교환/반품/배송";
  if (/보증|정품|등록/.test(name)) return "정품 등록 및 보증";
  if (/A\/?S|수리|서비스/i.test(name)) return "A/S 및 수리 접수";
  if (/소모품|부품|필터|구매/.test(name)) return "부품 및 소모품 구매";
  if (/사용법|설정|연결|기능/.test(name)) return "제품 사용법 및 조작";
  return name;
}

export function createPeriodReport(endDay: string, limit: number) {
  const daily = new Map<string, Group<ReportRow>>();
  const faq = new Map<string, Group<FaqSummaryRow>>();
  const unmatched = new Map<string, Group<UnmatchedQueryRow>>();
  const improvement = new Map<string, Group<ImprovementQueueRow>>();
  const channel = new Map<string, Group<ChannelFriendSummaryRow>>();
  const hourlyByWeekday = Array.from({ length: 7 }, () => Array<number>(24).fill(0));
  const users = new Map<string, number>();
  const categories = new Map<string, number>();
  const hours: number[] = Array(24).fill(0);
  const weekdays: number[] = Array(7).fill(0);
  const history: HistoryRow[] = [];
  const risks: HistoryRow[] = [];
  const week = shiftDate(endDay, -6);
  const month = shiftDate(endDay, -29);
  let agentCount = 0;
  let riskCount = 0;
  let identifiedRequests = 0;
  let improvementCount = 0;
  let shortCount = 0;
  let shortMatched = 0;
  let longCount = 0;
  let longMatched = 0;

  function consume(h: SourceRow) {
    const day = h.occurred_at.slice(0, 10);
    const brand = { brand: h.brand, brand_name: h.brand_name };
    const matched = Number(h.matched);
    const meta = h.metadata || {};
    const menu = String(meta.menuId ?? "product");
    const family = meta.productFamilyId == null ? null : String(meta.productFamilyId);
    const key = h.query_normalized || h.query;
    const publicQuery = maskContact(h.query);
    const safeHistory: HistoryRow = {
      id: h.id, occurred_at: h.occurred_at, ...brand, source: h.source,
      user_id: null, query: publicQuery, matched: h.matched, score: h.score, faq_id: h.faq_id,
      faq_question: h.faq_question, category_name: h.category_name, answer_type: h.answer_type, selected_model: h.selected_model,
    };
    if (history.length < limit) history.push(safeHistory);
    const d = add(daily, [day, h.brand, h.brand_name], h, () => ({
      ...brand, report_date: day, total_count: 0, matched_count: 0, unmatched_count: 0,
    }));
    d.total_count++;
    d.matched_count += matched;
    d.unmatched_count += 1 - matched;
    const friend = String(meta.isFriend);
    const status = friend === "true" ? "friend" : friend === "false" ? "not_friend" : "unknown";
    const c = add(channel, [h.brand, h.brand_name, status], h, () => ({
      ...brand, channel_friend_status: status, total_requests: 0, matched_requests: 0, unmatched_requests: 0,
      first_occurred_at: h.occurred_at, last_occurred_at: h.occurred_at, unique_users: 0, match_rate_pct: 0, avg_score: null,
    }));
    c.total_requests++;
    c.matched_requests += matched;
    c.unmatched_requests += 1 - matched;
    c.first_occurred_at = h.occurred_at;
    if (h.matched) {
      const f = add(faq, [h.brand, h.brand_name, h.category_id, h.category_name, h.faq_id, h.faq_question, h.answer_type, h.selected_model], h, () => ({
        ...brand, category_id: h.category_id, category_name: h.category_name, faq_id: h.faq_id,
        faq_question: h.faq_question, answer_type: h.answer_type, selected_model: h.selected_model, hit_count: 0,
        unique_user_count: 0, avg_score: null, first_occurred_at: h.occurred_at, last_occurred_at: h.occurred_at,
      }));
      f.hit_count++;
      f.first_occurred_at = h.occurred_at;
      const category = categoryLabel(h.category_name);
      categories.set(category, (categories.get(category) || 0) + 1);
    } else {
      const u = add(unmatched, [h.brand, h.brand_name, menu, family, key], h, () => ({
        ...brand, menu_id: menu, product_family_id: family, query_key: maskContact(key), sample_query: publicQuery,
        query_count: 0, query_count_7d: 0, query_count_30d: 0, unique_user_count: 0,
        first_occurred_at: h.occurred_at, last_occurred_at: h.occurred_at,
      }));
      u.query_count++;
      u.query_count_7d = (u.query_count_7d || 0) + Number(day >= week && day <= endDay);
      u.query_count_30d = (u.query_count_30d || 0) + Number(day >= month && day <= endDay);
      u.first_occurred_at = h.occurred_at;
    }
    if (!h.matched || h.score < 60) {
      improvementCount++;
      const type = h.matched ? "low_confidence" : "unmatched";
      const i = add(improvement, [h.brand, h.brand_name, menu, type, key], h, () => ({
        ...brand, menu_id: menu, result_type: type, query_key: maskContact(key), sample_query: publicQuery,
        query_count: 0, unique_user_count: 0, avg_score: null, last_occurred_at: h.occurred_at,
      }));
      i.query_count++;
    }
    if (h.user_id) {
      identifiedRequests++;
      users.set(h.user_id, (users.get(h.user_id) || 0) + 1);
    }
    if (/상담원|상담사|직원 연결|사람 연결|유선 상담|전화 상담|전문 상담/.test(h.query)) agentCount++;
    if (/고장|환불|파손|불량|폭발|연기|소비자원|누수|작동안함|신고|피해|교환|취소/.test(h.query)) {
      riskCount++;
      if (risks.length < 4) risks.push(safeHistory);
    }
    const length = [...h.query.trim()].length;
    if (length <= 10) {
      shortCount++;
      shortMatched += matched;
    }
    if (length >= 25) {
      longCount++;
      longMatched += matched;
    }
    const hour = Number(h.occurred_at.slice(11, 13));
    const weekday = new Date(day + "T00:00:00Z").getUTCDay();
    hours[hour]++;
    weekdays[weekday]++;
    hourlyByWeekday[weekday][hour]++;
  }

  function finish() {
    const byRequests = (a: { query_count: number }, b: { query_count: number }) => b.query_count - a.query_count;
    return {
      daily: averages(daily).map(d => ({ ...d, match_rate: 100 * d.matched_count / d.total_count })),
      faqSummary: averages(faq).sort((a, b) => b.hit_count - a.hit_count).slice(0, limit),
      unmatchedQueries: averages(unmatched).sort(byRequests).slice(0, limit),
      improvementQueue: averages(improvement).sort(byRequests).slice(0, limit),
      channelFriendSummary: averages(channel).map(({ unique_user_count, ...c }) => ({
        ...c, unique_users: unique_user_count, match_rate_pct: 100 * c.matched_requests / c.total_requests,
      })).sort((a, b) => b.total_requests - a.total_requests),
      history,
      activity: {
        hours, weekdays, hourlyByWeekday, agentCount, riskCount, risks, identifiedRequests, users: users.size,
        singleUsers: [...users.values()].filter(n => n === 1).length,
        improvementCount, improvementTypes: improvement.size, shortCount, shortMatched, longCount, longMatched,
        categories: [...categories].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count).slice(0, 5),
      },
    };
  }

  return { consume, finish };
}

export type PeriodReport = ReturnType<ReturnType<typeof createPeriodReport>["finish"]>;
export type Activity = PeriodReport["activity"];

export function percent(count: number, total: number) {
  return total ? (100 * count / total).toFixed(1) + "%" : "산출 불가";
}
