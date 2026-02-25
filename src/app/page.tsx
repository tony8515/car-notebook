"use client";

import { useEffect, useState } from "react";
import Vehicles from "./vehicles/Vehicles";
import { supabase } from "@/lib/supabase";

export default function Page() {
  const [userId, setUserId] = useState<string>("");
  const [loading, setLoading] = useState(true);

useEffect(() => {
  let alive = true;

  // 1) 처음 로딩 시: 현재 세션을 즉시 읽어서 userId 세팅
  (async () => {
    const { data, error } = await supabase.auth.getSession();
    if (!alive) return;

    const id = data.session?.user?.id ?? "";
    setUserId(id);
    setLoading(false);
  })();

  // 2) 이후 로그인/로그아웃/토큰갱신 등 변화 감지
  const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
    if (!alive) return;
    setUserId(session?.user?.id ?? "");
    setLoading(false);
  });

  // cleanup
  return () => {
    alive = false;
    authListener.subscription.unsubscribe();
  };
}, []);

  if (loading) {
    return (
      <main style={{ maxWidth: 520, margin: "0 auto", padding: 16 }}>
                로딩중...
      </main>
    );
  }

  if (!userId) {
    return (
      <main style={{ maxWidth: 520, margin: "0 auto", padding: 16 }}>
                로그인 후 사용하세요.
      </main>
    );
  }

  return (
    <>  
    <main style={{ maxWidth: 520, margin: "0 auto", padding: 16 }}>
            <Vehicles userId={userId} />
    </main>
    </>
  );
}
