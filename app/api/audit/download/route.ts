import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { SESSION_COOKIE_NAME, verifySessionToken } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase-server";

export async function POST(request: Request) {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
    const user = await verifySessionToken(token);

    const body = await request.json().catch(() => ({}));
    const {
      report_name,
      export_filename,
      conditions = [],
      page_path = "/report",
    } = body;

    const actor = user?.email || user?.name || "anonymous";
    const actor_id = user?.id || null;
    const actor_role = user?.role || "viewer";

    const safeConditions = Array.isArray(conditions)
      ? conditions.map((c) => String(c).slice(0, 200)).slice(0, 12)
      : [];

    const supabase = createSupabaseServerClient();
    const { error } = await supabase
      .schema("gatevision")
      .from("download_audit_logs")
      .insert({
        actor: String(actor).slice(0, 200),
        actor_id: actor_id ? String(actor_id).slice(0, 200) : null,
        actor_role: actor_role ? String(actor_role).slice(0, 40) : null,
        page_path: String(page_path || "/report").slice(0, 200),
        report_name: String(report_name || "챗봇 리포트 다운로드").slice(0, 200),
        export_filename: String(export_filename || "-").slice(0, 300),
        conditions: safeConditions,
      });

    if (error) {
      console.error("[download-audit] DB insert error:", error);
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("[download-audit] API handler error:", msg);
    return NextResponse.json(
      { success: false, error: msg },
      { status: 500 }
    );
  }
}
