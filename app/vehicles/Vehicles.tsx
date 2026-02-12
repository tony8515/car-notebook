"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import Records from "../records/Records";

type Vehicle = { id: string; name: string };

export default function Vehicles({ userId }: { userId: string }) {
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [name, setName] = useState("");
  const [selectedId, setSelectedId] = useState<string>("");

  async function load() {
    const { data, error } = await supabase
      .from("vehicles")
      .select("id,name")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });

    if (!error) {
      const list = (data ?? []) as Vehicle[];
      setVehicles(list);
      if (!selectedId && list[0]?.id) setSelectedId(list[0].id);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selected = useMemo(
    () => vehicles.find((v) => v.id === selectedId),
    [vehicles, selectedId]
  );

  async function addVehicle() {
    const v = name.trim();
    if (!v) return;
    const { error } = await supabase.from("vehicles").insert({ user_id: userId, name: v });
    if (!error) {
      setName("");
      await load();
    }
  }

  return (
    <section style={{ marginTop: 16 }}>
      <h2 style={{ fontSize: 18, fontWeight: 700 }}>차량</h2>

      <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
        <input
          placeholder="예: Sienna 2014"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <button onClick={addVehicle}>추가</button>
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
        {vehicles.map((v) => (
          <button
            key={v.id}
            onClick={() => setSelectedId(v.id)}
            style={{
              padding: "8px 10px",
              borderRadius: 10,
              border: "1px solid #ddd",
              background: v.id === selectedId ? "#f2f2f2" : "white",
            }}
          >
            {v.name}
          </button>
        ))}
      </div>

      {selectedId && selected && (
        <Records userId={userId} vehicleId={selectedId} vehicleName={selected.name} />
      )}
    </section>
  );
}
