const { test } = require("node:test");
const assert = require("node:assert/strict");
const { createPeriodReport, percent } = require("../.next/report-tests/period-report.js");
const { seoulDate, presetDates, validReportDate } = require("../.next/report-tests/report-period.js");
const { maskContact, htmlText } = require("../.next/report-tests/report-output.js");
const { loadPeriodReport } = require("../.next/report-tests/report-server.js");

function inquiry(id, fields = {}) {
  return {
    id, occurred_at: "2026-11-20T12:00:00", brand: "a", brand_name: "브랜드 A", source: "chat",
    user_id: "user-" + id, query: "제품 문의", query_normalized: null, matched: false, score: 0,
    faq_id: null, faq_question: null, category_id: null, category_name: null,
    selected_model: null, answer_type: null, metadata: {}, ...fields,
  };
}

function finish(rows, limit) {
  const report = createPeriodReport("2026-11-20", limit);
  for (const row of rows) report.consume(row);
  return report.finish();
}

test("Changing the detail limit preserves full-period KPIs, rankings and behavior", () => {
  const rows = Array.from({ length: 150 }, (_, index) => inquiry(index + 1, {
    occurred_at: new Date(Date.UTC(2026, 10, 20 - Math.floor(index / 5), 18)).toISOString().slice(0, 19),
    brand: String(index % 5), matched: index % 2 === 0, score: index % 2 === 0 ? 90 : 0,
    metadata: { isFriend: true }, category_name: "상담원 연결", user_id: "returning",
  }));
  const small = finish(rows, 50);
  const large = finish(rows, 500);
  assert.equal(small.history.length, 50);
  assert.equal(large.history.length, 150);
  assert.deepEqual(small.daily, large.daily);
  assert.deepEqual(small.activity, large.activity);
  assert.equal(small.daily.length, 150);
  assert.equal(small.daily.reduce((n, row) => n + row.total_count, 0), 150);
  assert.equal(small.activity.users, 1);
  assert.equal(small.activity.singleUsers, 0);
  assert.equal(small.activity.hours[18], 150);
  assert.equal(small.activity.improvementCount, 75);
  assert.deepEqual(small.activity.categories, [{ name: "상담원 연결", count: 75 }]);
  assert.equal(small.channelFriendSummary.reduce((n, row) => n + row.total_requests, 0), 150);
});

test("Unmatched and anonymous inquiries produce observed counts only", () => {
  const rows = Array.from({ length: 12 }, (_, index) => inquiry(index, { user_id: index < 2 ? null : String(index) }));
  const report = finish(rows, 10);
  assert.equal(report.daily[0].matched_count, 0);
  assert.equal(report.activity.improvementCount, 12);
  assert.equal(report.activity.identifiedRequests, 10);
  assert.equal(report.activity.users, 10);
  assert.equal(report.activity.singleUsers, 10);
  assert.equal(report.activity.agentCount, 0);
  assert.equal(report.activity.hours[12], 12);
  assert.equal(percent(0, 0), "산출 불가");
  assert.deepEqual(finish([], 100).daily, []);
});

test("Korean day boundaries and leap dates", () => {
  assert.equal(seoulDate(new Date("2026-11-21T15:00:00Z")), "2026-11-22");
  assert.deepEqual(presetDates("month", "2026-11-22"), { from: "2026-11-01", to: "2026-11-22" });
  assert.equal(presetDates("7d", "2026-01-03").from, "2025-12-28");
  assert.equal(validReportDate("2026-02-29"), false);
  assert.equal(validReportDate("2028-02-29"), true);
});

test("Period-end trailing windows, risk totals and contact masking", () => {
  const query = "환불 010-1234-5678 test@example.org";
  const rows = ["2026-11-20", "2026-11-14", "2026-11-13", "2026-10-21"].map((day, id) =>
    inquiry(id, { occurred_at: day + "T23:59:59.999999", query, metadata: { queryCorrected: query }, user_id: "private-id" }));
  const report = finish(rows, 1);
  const [group] = report.unmatchedQueries;
  assert.equal(group.query_count, 4);
  assert.equal(group.query_count_7d, 2);
  assert.equal(group.query_count_30d, 3);
  assert.equal(report.activity.riskCount, 4);
  assert.equal(maskContact(query), "환불 [전화번호] [이메일]");
  assert.doesNotMatch(JSON.stringify(report), /010-1234|example\.org|private-id|queryCorrected/);
  assert.equal(htmlText("A&B <확인>"), "A&amp;B &lt;확인&gt;");
});

test("The Supabase query filters before grouping and traverses equal timestamps across pages", async (t) => {
  process.env.SUPABASE_URL = "https://report-fixture.invalid";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "fixture";
  const inside = "2026-11-20T23:59:59.999999";
  const rows = [
    inquiry(1, { occurred_at: "2026-11-19T12:00:00", faq_id: "A" }),
    inquiry(2, { occurred_at: inside, faq_id: "A" }),
    inquiry(3, { occurred_at: inside, faq_id: "B" }),
    inquiry(4, { occurred_at: "2026-11-21T00:00:00", faq_id: "B" }),
    inquiry(5, { occurred_at: inside, faq_id: "A", brand: "b" }),
  ].map(row => ({ ...row, matched: true, score: 90 }));
  let pages = 0;
  t.mock.method(globalThis, "fetch", async (url) => {
    const target = new URL(url);
    assert.equal(target.hostname, "report-fixture.invalid");
    const params = target.searchParams;
    if (params.get("select") === "id") return Response.json([{ id: 5 }]);
    assert.deepEqual(params.getAll("occurred_at"), ["gte.2026-11-20T00:00:00", "lt.2026-11-21T00:00:00"]);
    assert.equal(params.get("id"), "lte.5");
    assert.equal(params.get("brand"), "eq.a");
    assert.equal(params.get("order"), "occurred_at.desc,id.desc");
    const eligible = rows.filter(r => r.brand === "a" && r.occurred_at.startsWith("2026-11-20"));
    const cursor = params.get("or");
    const prior = pages++;
    assert.ok(prior < 3);
    if (prior > 0) assert.equal(cursor, "(occurred_at.lt." + inside + ",and(occurred_at.eq." + inside + ",id.lt." + (4 - prior) + "))");
    const page = eligible.sort((a, b) => b.id - a.id).slice(prior, prior + 1);
    return Response.json(page);
  });
  const result = await loadPeriodReport("2026-11-20", "2026-11-20", "a", 10);
  assert.equal(pages, 3);
  assert.equal(result.daily[0].total_count, 2);
  assert.deepEqual(result.faqSummary.map(f => [f.faq_id, f.hit_count]).sort(), [["A", 1], ["B", 1]]);
});
