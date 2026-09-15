import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase-server";

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
    const supabase = createSupabaseServerClient();
    const { data, error } = await supabase
      .from(HISTORY_TABLE)
      .select("brand, brand_name")
      .not("brand", "is", null)
      .order("brand", { ascending: true })
      .limit(1000);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const brandMap = new Map<string, { brand: string; brand_name: string }>();

    // Register known brands first to ensure standard ordering
    Object.entries(KNOWN_BRANDS).forEach(([key, name]) => {
      brandMap.set(key, { brand: key, brand_name: name });
    });

    (data || []).forEach((row) => {
      const existing = brandMap.get(row.brand);
      brandMap.set(row.brand, {
        brand: row.brand,
        brand_name: row.brand_name || existing?.brand_name || row.brand,
      });
    });

    const brands = Array.from(brandMap.values());

    return NextResponse.json({ brands });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "브랜드 목록을 불러오는 중 오류가 발생했습니다." },
      { status: 500 },
    );
  }
}
