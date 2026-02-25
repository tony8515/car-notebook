"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import Records from "../records/Records";

type VehiclesProps = {
  userId: string; // ✅ Page에서 확정해서 전달
};

type Vehicle = {
  id: string;
  user_id: string;
  name: string;
};

type RecordLite = {
  cost: number;
};

function ymdLocal(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function monthRangeLocal(d: Date) {
  const start = new Date(d.getFullYear(), d.getMonth(), 1);
  const end = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  return { start: ymdLocal(start), end: ymdLocal(end) };
}

export default function Vehicles({ userId }: VehiclesProps) {
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [selectedVehicleId, setSelectedVehicleId] = useState<string | null>(null);

  const [newName, setNewName] = useState("");
  const [loadingVehicles, setLoadingVehicles] = useState(false);
  const [msg, setMsg] = useState<string>("");

  const [monthTotal, setMonthTotal] = useState<number>(0);
  const [loadingTotal, setLoadingTotal] = useState(false);

  const selectedVehicle = useMemo(() => {
    if (!selectedVehicleId) return null;
    return vehicles.find((v) => v.id === selectedVehicleId) ?? null;
  }, [vehicles, selectedVehicleId]);

  async function loadVehicles() {
    if (!userId) return;

    setLoadingVehicles(true);
    setMsg("");

    const { data, error } = await supabase
      .from("vehicles")
      .select("id,user_id,name")
      .eq("user_id", userId)
      .order("created_at", { ascending: true });

    if (error) {
      setVehicles([]);
      setSelectedVehicleId(null);
      setMsg("차량 불러오기 오류: " + error.message);
      setLoadingVehicles(false);
      return;
    }

    const list = ((data as any) ?? []) as Vehicle[];
    setVehicles(list);

    setSelectedVehicleId((prev) => {
      if (prev && list.some((v) => v.id === prev)) return prev;
      return list[0]?.id ?? null;
    });

    setLoadingVehicles(false);
  }

  async function addVehicle() {
    const name = newName.trim();
    if (!name) {
      setMsg("차량 이름을 입력하세요. (예: Sienna 2014)");
      return;
    }

    setMsg("");

    const { data, error } = await supabase
      .from("vehicles")
      .insert({ user_id: userId, name })
      .select("id,user_id,name")
      .single();

    if (error) {
      setMsg("차량 추가 오류: " + error.message);
      return;
    }

    const created = data as any as Vehicle;
    setNewName("");
    setVehicles((prev) => [...prev, created]);
    setSelectedVehicleId(created.id);

    setMsg("차량을 추가했습니다.");
    setTimeout(() => setMsg(""), 1200);
  }

  async function loadMonthTotal(vid: string) {
    if (!userId || !vid) return;
    setLoadingTotal(true);

    try {
      const { start, end } = monthRangeLocal(new Date());

      const { data, error } = await supabase
        .from("records")
        .select("cost,date")
        .eq("user_id", userId)
        .eq("vehicle_id", vid)
        .gte("date", start)
        .lte("date", end)
        .limit(2000);

      if (error) {
        setMonthTotal(0);
        setLoadingTotal(false);
        return;
      }

      const rows = ((data as any) ?? []) as RecordLite[];
      const total = rows.reduce((s, r) => s + Number(r.cost || 0), 0);
      setMonthTotal(total);
    } finally {
      setLoadingTotal(false);
    }
  }

  useEffect(() => {
    loadVehicles();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  useEffect(() => {
    if (!selectedVehicleId) return;
    loadMonthTotal(selectedVehicleId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedVehicleId]);

  return (
    <section style={{ marginTop: 10 }}>
      
      <h2 style={{ fontSize: 20, fontWeight: 900, margin: 0, marginBottom: 10 }}>차량</h2>

      {/* 차량 추가 */}
      <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 10 }}>
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="예: Sienna 2014"
          style={{
            flex: 1,
            padding: "10px 12px",
            borderRadius: 10,
            border: "1px solid #e5e5e5",
          }}
        />
        <button
          type="button"
          onClick={addVehicle}
          style={{
            padding: "10px 12px",
            borderRadius: 10,
            border: "1px solid #e5e5e5",
            fontWeight: 900,
          }}
        >
          추가
        </button>
      </div>

      {msg && <div style={{ marginBottom: 10, fontWeight: 800, opacity: 0.9 }}>{msg}</div>}

      {/* 차량 탭 */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
        {loadingVehicles && <div style={{ opacity: 0.7 }}>차량 불러오는 중…</div>}

        {!loadingVehicles && vehicles.length === 0 && (
          <div style={{ opacity: 0.7 }}>차량이 없습니다. 위에서 차량을 추가하세요.</div>
        )}

        {vehicles.map((v) => {
          const active = v.id === selectedVehicleId;
          return (
            <button
              key={v.id}
              type="button"
              onClick={() => setSelectedVehicleId(v.id)}
              style={{
                padding: "10px 12px",
                borderRadius: 999,
                border: "1px solid #e5e5e5",
                fontWeight: 900,
                opacity: active ? 1 : 0.55,
                background: active ? "#fff" : "transparent",
              }}
              title="차량 선택"
            >
              {v.name}
            </button>
          );
        })}
      </div>

      {/* 이번달 합계 (여기서만 1번만 표시) */}
      {selectedVehicle && (
        <div style={{ marginBottom: 8, opacity: 0.9, fontWeight: 900 }}>
          이번달 합계: {loadingTotal ? "계산 중…" : `$${monthTotal.toFixed(2)}`}
        </div>
      )}

      {/* Records */}
      {selectedVehicle && (
        <Records
          userId={userId}
          vehicleId={selectedVehicle.id}
          vehicleName={selectedVehicle.name}
          onChanged={() => loadMonthTotal(selectedVehicle.id)}
        />
      )}
    </section>
  );
}
