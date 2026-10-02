import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { AuthUser, cleanServices, createSessionToken, SESSION_COOKIE_NAME } from "@/lib/auth";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const email = String(body.email || "").trim().toLowerCase();
    const password = String(body.password || "");

    if (!email || !password) {
      return NextResponse.json(
        { error: "이메일과 비밀번호를 모두 입력해 주세요." },
        { status: 400 }
      );
    }

    const supabase = createSupabaseServerClient();
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error || !data.user) {
      return NextResponse.json(
        { error: "이메일 또는 비밀번호가 올바르지 않습니다." },
        { status: 401 }
      );
    }

    const user = data.user;
    const appMetadata = (user.app_metadata || {}) as Record<string, unknown>;
    const userMetadata = (user.user_metadata || {}) as Record<string, unknown>;

    // 1. 활성화 여부 확인
    const isActive = appMetadata.psi_active === true;
    if (!isActive) {
      return NextResponse.json(
        { error: "비활성화된 계정입니다. 관리자에게 문의하세요." },
        { status: 403 }
      );
    }

    // 2. 권한(Role) 확인
    const role = String(appMetadata.psi_role || "");
    if (!role) {
      return NextResponse.json(
        { error: "게이트비전 임직원 권한이 등록되지 않은 계정입니다." },
        { status: 403 }
      );
    }

    // 3. 접속 사이트(Services) 분리 권한 확인
    const services = cleanServices(appMetadata.psi_services, role);
    if (!services.includes("report")) {
      return NextResponse.json(
        {
          error: "챗봇 리포트 대시보드 접근 권한이 없습니다. 시스템 관리자에게 접근 권한을 요청하세요.",
        },
        { status: 403 }
      );
    }

    const authUser: AuthUser = {
      id: user.id,
      email: user.email || email,
      name: String(userMetadata.full_name || user.email?.split("@")[0] || "사용자"),
      role,
      team: String(appMetadata.psi_team || ""),
      title: String(userMetadata.job_title || ""),
      services,
    };

    const token = await createSessionToken(authUser);
    const cookieStore = await cookies();

    cookieStore.set({
      name: SESSION_COOKIE_NAME,
      value: token,
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 24 * 60 * 60,
    });

    return NextResponse.json({ ok: true, user: authUser });
  } catch (err) {
    console.error("Login API error:", err);
    return NextResponse.json(
      { error: "로그인 처리 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요." },
      { status: 500 }
    );
  }
}
