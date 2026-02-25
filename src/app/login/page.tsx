"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

export default function LoginPage() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState<string>("");

  // 이미 로그인 돼 있으면 홈으로
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session?.user) router.replace("/");
    });
  }, [router]);

  async function signInWithPassword() {
    setMsg("");
    const e = email.trim();

    if (!e) return setMsg("이메일을 입력하세요.");
    if (!password) return setMsg("비밀번호를 입력하세요.");

    const { error } = await supabase.auth.signInWithPassword({
      email: e,
      password,
    });

    if (error) return setMsg("로그인 실패: " + error.message);
    router.replace("/");
  }

  async function sendMagicLink() {
    setMsg("");
    const e = email.trim();
    if (!e) return setMsg("이메일을 입력하세요.");

    const origin =
      typeof window !== "undefined" ? window.location.origin : "";

    const { error } = await supabase.auth.signInWithOtp({
      email: e,
      options: {
        // 로그인 이메일 클릭 후 돌아올 주소
        emailRedirectTo: origin,
      },
    });

    if (error) return setMsg("메일 전송 실패: " + error.message);
    setMsg("메일로 로그인 링크를 보냈습니다. (스팸함도 확인)");
  }

  return (
    <main style={{ maxWidth: 520, margin: "0 auto", padding: 16 }}>
      <h2 style={{ margin: "12px 0" }}>로그인</h2>

      <div style={{ display: "grid", gap: 10 }}>
        <label style={{ display: "grid", gap: 6 }}>
          <span>이메일</span>
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            style={{ padding: "10px", border: "1px solid #aaa", borderRadius: 10 }}
            autoComplete="email"
          />
        </label>

        <label style={{ display: "grid", gap: 6 }}>
          <span>비밀번호</span>
          <input
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="password"
            type="password"
            style={{ padding: "10px", border: "1px solid #aaa", borderRadius: 10 }}
            autoComplete="current-password"
          />
        </label>

        <button
          type="button"
          onClick={signInWithPassword}
          style={{
            padding: "12px",
            borderRadius: 12,
            border: "1px solid #666",
            fontWeight: 900,
          }}
        >
          비밀번호로 로그인
        </button>

        <button
          type="button"
          onClick={sendMagicLink}
          style={{
            padding: "12px",
            borderRadius: 12,
            border: "1px solid #666",
            fontWeight: 900,
          }}
        >
          이메일 링크(매직링크) 보내기
        </button>

        {msg && (
          <div style={{ marginTop: 6, fontWeight: 700 }}>
            {msg}
          </div>
        )}
      </div>
    </main>
  );
}