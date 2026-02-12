"use client";

import { useEffect, useState } from "react";
import Vehicles from "./vehicles/Vehicles";
import { supabase } from "@/lib/supabase";

export default function Home() {
  const [session, setSession] = useState<any>(null);
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [msg, setMsg] = useState("");

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  async function signIn() {
    setMsg("");
    const { error } = await supabase.auth.signInWithPassword({ email, password: pw });
    if (error) setMsg(error.message);
  }

  async function signUp() {
    setMsg("");
    const { error } = await supabase.auth.signUp({ email, password: pw });
    if (error) setMsg(error.message);
    else setMsg("가입 완료. 이제 로그인하세요.");
  }

  async function signOut() {
    await supabase.auth.signOut();
  }

  if (session) {
    return (
      <main style={{ padding: 16, maxWidth: 720, margin: "0 auto" }}>
        <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h1 style={{ fontSize: 22, fontWeight: 700 }}>차량수첩</h1>
          <button onClick={signOut}>로그아웃</button>
        </header>
        <Vehicles userId={session.user.id} />
      </main>
    );
  }

  return (
    <main style={{ padding: 16, maxWidth: 420, margin: "0 auto" }}>
      <h1 style={{ fontSize: 22, fontWeight: 700 }}>차량수첩</h1>
      <p style={{ opacity: 0.7 }}>주유 · 정비 · 영수증 기록</p>

      <div style={{ display: "grid", gap: 8, marginTop: 12 }}>
        <input placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
        <input
          placeholder="Password"
          type="password"
          value={pw}
          onChange={(e) => setPw(e.target.value)}
        />

        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={signIn}>로그인</button>
          <button onClick={signUp}>가입</button>
        </div>

        {msg && <div style={{ color: "crimson" }}>{msg}</div>}
      </div>
    </main>
  );
}
