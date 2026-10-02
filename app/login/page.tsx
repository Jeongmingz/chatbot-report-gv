"use client";

import { Suspense, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextUrl = searchParams.get("next") || "/";
  const urlError = searchParams.get("error");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errorMessage, setErrorMessage] = useState(() => {
    if (urlError === "unauthorized_service") {
      return "해당 계정은 챗봇 리포트 대시보드 접근 권한이 없습니다. 관리자에게 권한을 요청하세요.";
    }
    return "";
  });
  const [isPending, startTransition] = useTransition();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrorMessage("");

    if (!email.trim() || !password) {
      setErrorMessage("이메일과 비밀번호를 모두 입력해 주세요.");
      return;
    }

    startTransition(async () => {
      try {
        const res = await fetch("/api/auth/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, password }),
        });

        const data = await res.json();

        if (!res.ok) {
          setErrorMessage(data.error || "로그인에 실패했습니다.");
          return;
        }

        // 로그인 성공 시 대시보드로 이동
        router.push(nextUrl);
        router.refresh();
      } catch {
        setErrorMessage("서버 통신 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.");
      }
    });
  }

  return (
    <div className="login-card">
      {/* Brand Header */}
      <div className="login-header">
        <div className="login-logo-box">
          <svg
            width="32"
            height="32"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
        </div>
        <h1 className="login-title">게이트비전 챗봇 운영 센터</h1>
        <p className="login-subtitle">
          Enterprise Chatbot Analytics & Quality Operations
        </p>
        <div className="login-badge-wrap">
          <span className="login-badge">
            <span className="login-badge-dot" />
            사내 전용 보안 시스템
          </span>
        </div>
      </div>

      {/* Error Alert */}
      {errorMessage && (
        <div className="login-error-alert" role="alert">
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          <span>{errorMessage}</span>
        </div>
      )}

      {/* Form */}
      <form onSubmit={handleSubmit} className="login-form">
        <div className="form-group">
          <label htmlFor="email">사내 계정 이메일</label>
          <input
            id="email"
            type="email"
            autoComplete="username"
            placeholder="id@gatevision.co.kr"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={isPending}
            required
          />
        </div>

        <div className="form-group">
          <label htmlFor="password">비밀번호</label>
          <input
            id="password"
            type="password"
            autoComplete="current-password"
            placeholder="••••••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={isPending}
            required
          />
        </div>

        <button
          type="submit"
          className="login-submit-btn"
          disabled={isPending}
        >
          {isPending ? (
            <span className="btn-loading">
              <span className="login-spinner" />
              인증 확인 중...
            </span>
          ) : (
            "로그인"
          )}
        </button>
      </form>

      {/* Guidance Footer */}
      <div className="login-footer">
        <div className="login-info-card">
          <p className="info-title">💡 계정 및 접근 권한 안내</p>
          <p className="info-desc">
            * 게이트비전 사내 계정(이메일/비밀번호)으로 로그인해 주세요.
            <br />
            * 신규 계정 발급 및 접근 권한 문의는 시스템 관리자에게 요청하세요.
          </p>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <div className="login-container">
      <Suspense fallback={<div className="login-card" style={{ minHeight: "420px" }} />}>
        <LoginForm />
      </Suspense>
    </div>
  );
}
