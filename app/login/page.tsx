"use client";

import { Suspense, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const urlError = searchParams.get("error");

  const [email, setEmail] = useState("");
  const [visible, setVisible] = useState(false);
  const [password, setPassword] = useState("");
  const [errorMessage, setErrorMessage] = useState(() => {
    if (urlError === "unauthorized_service") {
      return "해당 계정은 챗봇 리포트 대시보드 접근 권한이 없습니다. 영업 4팀 이정민에게 권한을 요청하세요.";
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
          body: JSON.stringify({ email: email.trim(), password }),
        });

        const data = await res.json();

        if (!res.ok) {
          setErrorMessage(data.error || "로그인에 실패했습니다.");
          return;
        }

        // 로그인 성공 시 대시보드로 이동
        router.replace("/");
        router.refresh();
      } catch {
        setErrorMessage("서버 통신 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.");
      }
    });
  }

  return (
    <div className="login-card">
      <header className="login-header">
        <h2 className="login-title">사내 계정 로그인</h2>
        <p className="login-subtitle">등록된 이메일과 비밀번호를 입력하세요.</p>
      </header>
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
          <div className="password-field"><input
            id="password"
            type={visible ? "text" : "password"}
            autoComplete="current-password"
            placeholder="••••••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={isPending}
            required
          /><button type="button" aria-controls="password" aria-label="비밀번호 표시" aria-pressed={visible} onClick={() => setVisible(value => !value)}>{visible ? "숨기기" : "표시"}</button></div>
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
          <p className="info-title">접근 권한 문의</p>
          <p className="info-desc">
            계정 발급과 권한 변경은 <strong>영업 4팀 이정민</strong>에게 요청하세요.
          </p>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <main className="login-container">
      <div className="login-layout">
      <section className="login-identity">
        <span className="workspace-wordmark">GATEVISION</span>
        <h1>챗봇 문의 분석</h1>
        <p>브랜드별 고객 질문과 FAQ 응답 현황을 확인하는 사내 운영 대시보드입니다.</p>
        <div className="login-art" aria-hidden="true"><i /><i /><i /></div>
      </section>
      <Suspense fallback={<div className="login-card" style={{ minHeight: "420px" }} />}>
        <LoginForm />
      </Suspense>
      </div>
    </main>
  );
}
