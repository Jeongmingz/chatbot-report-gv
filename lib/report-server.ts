import { createSupabaseServerClient } from "./supabase-server";
import { createPeriodReport, type SourceRow } from "./period-report";
import { seoulDate, shiftDate } from "./report-period";

export async function loadPeriodReport(from: string | null, to: string | null, brand: string | null, limit: number) {
  const client = createSupabaseServerClient();
  const table = process.env.SUPABASE_HISTORY_TABLE || "faq_history";
  const report = createPeriodReport(to || seoulDate(), limit);
  const { data: latest, error: latestError } = await client.from(table).select("id").order("id", { ascending: false }).limit(1);
  if (latestError) throw latestError;
  if (!latest?.length) return report.finish();

  const end = to ? shiftDate(to, 1) + "T00:00:00" : null;
  let cursor: Pick<SourceRow, "id" | "occurred_at"> | undefined;
  for (;;) {
    let query = client.from(table).select(
      "id,occurred_at,brand,brand_name,source,user_id,query,query_normalized,matched,score,faq_id,faq_question,category_id,category_name,answer_type,selected_model,menu_id:metadata->>menuId,product_family:metadata->>productFamilyId,is_friend:metadata->>isFriend",
    ).lte("id", latest[0].id).order("occurred_at", { ascending: false }).order("id", { ascending: false }).limit(500);
    if (from) query = query.gte("occurred_at", from + "T00:00:00");
    if (end) query = query.lt("occurred_at", end);
    if (brand) query = query.eq("brand", brand);
    if (cursor) query = query.or(`occurred_at.lt.${cursor.occurred_at},and(occurred_at.eq.${cursor.occurred_at},id.lt.${cursor.id})`);
    const { data, error } = await query;
    if (error) throw error;
    if (!data?.length) return report.finish();
    for (const { menu_id, product_family, is_friend, ...row } of data) {
      report.consume({ ...row, metadata: { menuId: menu_id, productFamilyId: product_family, isFriend: is_friend } });
    }
    cursor = data[data.length - 1];
  }
}
