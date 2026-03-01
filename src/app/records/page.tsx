"use client";

import { useEffect, useState } from "react";
import Records from "./Records";
import { supabase } from "@/lib/supabase";

export default function Page() {
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      setUserId(data.user?.id ?? null);
    })();
  }, []);

  if (!userId) return <div className="p-4">Loading...</div>;

  return <Records userId={userId} />;
}