import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { SESSION_COOKIE_NAME, verifySessionToken } from "@/lib/auth";

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // 1. 정적 파일 및 내부 Next.js 리소스는 항상 통과
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/api/auth") ||
    pathname === "/favicon.ico" ||
    pathname.includes(".")
  ) {
    return NextResponse.next();
  }

  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  const user = await verifySessionToken(token);

  // 2. 로그인 페이지 접근 시
  if (pathname === "/login") {
    // 이미 로그인된 상태라면 메인 대시보드로 이동
    if (user) {
      return NextResponse.redirect(new URL("/", request.url));
    }
    return NextResponse.next();
  }

  // 3. 비인증 사용자 처리
  if (!user) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json(
        { error: "authentication_required", message: "로그인이 필요합니다." },
        { status: 401 }
      );
    }
    const loginUrl = new URL("/login", request.url);
    if (pathname !== "/") {
      loginUrl.searchParams.set("next", pathname);
    }
    return NextResponse.redirect(loginUrl);
  }

  // 4. 리포트 서비스 접근 권한 확인
  if (!user.services.includes("report")) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json(
        { error: "forbidden", message: "챗봇 리포트 대시보드 접근 권한이 없습니다." },
        { status: 403 }
      );
    }
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("error", "unauthorized_service");
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
