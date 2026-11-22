import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase-server";

import { reportAccess } from "@/lib/report-access";

export const dynamic = "force-dynamic";

const HISTORY_TABLE = process.env.SUPABASE_HISTORY_TABLE || "faq_history";

const KNOWN_BRANDS: Record<string, string> = {
  laurastar: "로라스타",
  woods: "우즈",
  aarke: "아르케",
  "litter-robot": "리터로봇",
  imetec: "이메텍",
};

export async function GET() {
  try {
    const access = await reportAccess();
    if (access.denied) return access.denied;
    const supabase = createSupabaseServerClient();
    const brandMap = new Map(Object.entries(KNOWN_BRANDS).map(([brand, brand_name]) => [brand, { brand, brand_name }]));
    let after: string | null = null;
    for (;;) {
      let query = supabase.from(HISTORY_TABLE).select("brand,brand_name").not("brand", "is", null)
        .order("brand").order("occurred_at", { ascending: false }).limit(500);
      if (after !== null) query = query.gt("brand", after);
      const { data, error } = await query;
      if (error) throw error;
      if (!data?.length) break;
      const seen = new Set<string>();
      for (const row of data) {
        if (!seen.has(row.brand)) brandMap.set(row.brand, { brand: row.brand, brand_name: row.brand_name || KNOWN_BRANDS[row.brand] || row.brand });
        seen.add(row.brand);
      }
      after = data[data.length - 1].brand;
    }

    const brands = Array.from(brandMap.values());

    return NextResponse.json({ brands });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "브랜드 목록을 불러오는 중 오류가 발생했습니다." },
      { status: 500 },
    );
  }
}
