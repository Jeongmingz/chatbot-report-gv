import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { cleanServices, SESSION_COOKIE_NAME, verifySessionToken } from "./auth";
import { createSupabaseServerClient } from "./supabase-server";

export async function reportAccess(adminOnly = false) {
  const session = await verifySessionToken((await cookies()).get(SESSION_COOKIE_NAME)?.value);
  if (!session) return { denied: NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 }) };
  const { data, error } = await createSupabaseServerClient().auth.admin.getUserById(session.id);
  if (error && error.status !== 404) throw error;
  const account = data?.user;
  const meta = account?.app_metadata;
  const role = String(meta?.psi_role || "");
  if (!account || meta?.psi_active !== true || !role || !cleanServices(meta.psi_services, role).includes("report") ||
      (account.banned_until && Date.parse(account.banned_until) > Date.now()) || (adminOnly && role !== "admin")) {
    return { denied: NextResponse.json({ error: "리포트 접근 권한이 없습니다." }, { status: 403 }) };
  }
  return { user: { ...session, email: account.email || session.email, role } };
}
