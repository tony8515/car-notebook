"use client";

import Records from "./records/Records";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

export default function Page() {
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    async function getUser() {
      const { data } = await supabase.auth.getUser();
      if (data.user) setUserId(data.user.id);
    }
    getUser();
  }, []);

  if (!userId) return <div className="p-4">Loading...</div>;

  return (
    <div>
      <Records userId={userId} />
    </div>
  );
}