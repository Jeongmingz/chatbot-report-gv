import type { ReportRow } from "@/lib/report";

export const MIN_BRAND_HEALTH_SAMPLE = 10;

export type BrandOptionLike = {
  brand: string;
  brand_name: string;
};

export type BrandHealthStatus = "healthy" | "watch" | "improve" | "insufficient" | "no_data";

export type BrandHealthStat = {
  key: string;
  name: string;
  total: number;
  matched: number;
  unmatched: number;
  rate: number;
  status: BrandHealthStatus;
  statusLabel: string;
  comment: string;
  isEvaluated: boolean;
};

type MutableBrandStat = {
  key: string;
  name: string;
  total: number;
  matched: number;
  unmatched: number;
};

export function calculateBrandHealth(
  daily: ReportRow[],
  brands: BrandOptionLike[] = [],
): BrandHealthStat[] {
  const stats = new Map<string, MutableBrandStat>();

  brands.forEach((brand) => {
    const key = normalizeBrandKey(brand.brand);
    if (!key) return;
    stats.set(key, {
      key: brand.brand,
      name: brand.brand_name || brand.brand,
      total: 0,
      matched: 0,
      unmatched: 0,
    });
  });

  daily.forEach((row) => {
    const rawKey = row.brand || row.brand_name || "unknown";
    const normalizedKey = normalizeBrandKey(rawKey);
    const current = stats.get(normalizedKey) || {
      key: row.brand || rawKey,
      name: row.brand_name || row.brand || "브랜드 미지정",
      total: 0,
      matched: 0,
      unmatched: 0,
    };

    current.name = row.brand_name || current.name;
    current.total += Number(row.total_count || 0);
    current.matched += Number(row.matched_count || 0);
    current.unmatched += Number(row.unmatched_count || 0);
    stats.set(normalizedKey, current);
  });

  return Array.from(stats.values())
    .map(finalizeBrandStat)
    .sort((left, right) => {
      if (left.total !== right.total) return right.total - left.total;
      return left.name.localeCompare(right.name, "ko");
    });
}

function finalizeBrandStat(stat: MutableBrandStat): BrandHealthStat {
  const rate = stat.total > 0 ? (stat.matched / stat.total) * 100 : 0;

  if (stat.total === 0) {
    return {
      ...stat,
      rate,
      status: "no_data",
      statusLabel: "데이터 없음",
      comment: "조회기간에 대화가 없어 평가하지 않습니다.",
      isEvaluated: false,
    };
  }

  if (stat.total < MIN_BRAND_HEALTH_SAMPLE) {
    return {
      ...stat,
      rate,
      status: "insufficient",
      statusLabel: "표본 부족",
      comment: `${MIN_BRAND_HEALTH_SAMPLE}건 이상 쌓인 뒤 추세를 판단합니다.`,
      isEvaluated: false,
    };
  }

  if (rate >= 80) {
    return {
      ...stat,
      rate,
      status: "healthy",
      statusLabel: "양호",
      comment: stat.unmatched > 0 ? `미매칭 ${stat.unmatched}건의 원문을 확인합니다.` : "현재 응답 범위를 유지합니다.",
      isEvaluated: true,
    };
  }

  if (rate >= 60) {
    return {
      ...stat,
      rate,
      status: "watch",
      statusLabel: "점검",
      comment: `미매칭 ${stat.unmatched}건에서 반복 질문을 확인합니다.`,
      isEvaluated: true,
    };
  }

  return {
    ...stat,
    rate,
    status: "improve",
    statusLabel: "개선 필요",
    comment: `미매칭 ${stat.unmatched}건의 FAQ 보강 우선순위를 정합니다.`,
    isEvaluated: true,
  };
}

function normalizeBrandKey(value: string): string {
  return value.trim().toLowerCase();
}
