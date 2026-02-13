"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import Records from "../records/Records";

type VehiclesProps = {
  // 서버에서 내려주는 값이 있어도 좋지만, 클라이언트에서는 auth.uid()를 최종 기준으로 씁니다.
  userId?: string;
};

type Vehicle = {
  id: string;
  user_id: string;
  name: string;
};

type RecordRow = {
  id: string;
  user_id: string;
  vehicle_id: string;
  date: string; // YYYY-MM-DD (date column)
  category: string | null;
  odometer: number | null;
  cost: number;
  vendor: string | null;
  notes: string | null;
  receipt_urls: string[] | null; // DB에 null 가능
  created_at: string;
  updated_at: string;
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

export default function Vehicles({ userId: userIdProp }: VehiclesProps) {
  const [effectiveUserId, setEffectiveUserId] = useState<string>("");

  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [selectedVehicleId, setSelectedVehicleId] = useState<string | null>(null);

  const [newName, setNewName] = useState("");
  const [loadingVehicles, setLoadingVehicles] = useState(false);
  const [msg, setMsg] = useState<string>("");

  // (옵션) 차량 선택 시 이번달 합계를 바로 보여주고 싶다면 records 일부를 불러옵니다.
  // Records 컴포넌트 내부에서도 로드하지만, 여기선 상단 요약용으로만 사용.
  const [monthTotal, setMonthTotal] = useState<number>(0);
  const [loadingTotal, setLoadingTotal] = useState(false);

  const mountedRef = useRef(false);

  // 1) userId 확정: props + supabase auth 둘 다 고려하지만 최종은 auth 기준
  useEffect(() => {
    let unsub: any = null;

    async function initUser() {
      try {
        const { data } = await supabase.auth.getUser();
        const authId = data?.user?.id ?? "";
        setEffectiveUserId(authId || userIdProp || "");
      } catch {
        setEffectiveUserId(userIdProp || "");
      }

      const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
        const authId = session?.user?.id ?? "";
        setEffectiveUserId(authId || userIdProp || "");
      });

      unsub = sub?.subscription;
    }

    initUser();

    return () => {
      try {
        unsub?.unsubscribe?.();
      } catch {}
    };
  }, [userIdProp]);

  // 2) 차량 목록 로드
  async function loadVehicles(uid: string) {
    if (!uid) return;
    setLoadingVehicles(true);
    setMsg("");

    const { data, error } = await supabase
      .from("vehicles")
      .select("id,user_id,name")
      .eq("user_id", uid)
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

    // 선택값 없거나 목록에서 사라졌으면 첫 번째로
    setSelectedVehicleId((prev) => {
      if (prev && list.some((v) => v.id === prev)) return prev;
      return list[0]?.id ?? null;
    });

    setLoadingVehicles(false);
  }

  useEffect(() => {
    if (!effectiveUserId) return;
    loadVehicles(effectiveUserId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveUserId]);

  // 3) 새 차량 추가
  async function addVehicle() {
    const uid = effectiveUserId;
    const name = newName.trim();

    if (!uid) {
      setMsg("로그인이 필요합니다.");
      return;
    }
    if (!name) {
      setMsg("차량 이름을 입력하세요. (예: Sienna 2014)");
      return;
    }

    setMsg("");

    const { data, error } = await supabase
      .from("vehicles")
      .insert({ user_id: uid, name })
      .select("id,user_id,name")
      .single();

    if (error) {
      setMsg("차량 추가 오류: " + error.message);
      return;
    }

    const created = data as any as Vehicle;
    setNewName("");

    // 목록에 즉시 반영 + 선택
    setVehicles((prev) => [...prev, created]);
    setSelectedVehicleId(created.id);
    setMsg("차량을 추가했습니다.");
    setTimeout(() => setMsg(""), 1500);
  }

  // 4) 선택된 차량 이름
  const selectedVehicle = useMemo(() => {
    if (!selectedVehicleId) return null;
    return vehicles.find((v) => v.id === selectedVehicleId) ?? null;
  }, [vehicles, selectedVehicleId]);

  // 5) (옵션) 이번달 합계 로드: records 테이블에서 sum
  // Supabase JS는 서버-side sum aggregation을 직접 제공하지 않아서,
  // 여기서는 이번달 records를 가져와서 클라이언트에서 합계를 냅니다.
  async function loadMonthTotal(uid: string, vid: string) {
    setLoadingTotal(true);
    try {
      const { start, end } = monthRangeLocal(new Date());

      const { data, error } = await supabase
        .from("records")
        .select("id,cost,date,created_at")
        .eq("user_id", uid)
        .eq("vehicle_id", vid)
        .gte("date", start)
        .lte("date", end)
        .order("date", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(500);

      if (error) {
        setMonthTotal(0);
        // totals 에러는 치명적이지 않으므로 msg는 건드리지 않음
        setLoadingTotal(false);
        return;
      }

      const rows = ((data as any) ?? []) as Pick<RecordRow, "cost">[];
      const total = rows.reduce((s, r) => s + Number(r.cost || 0), 0);
      setMonthTotal(total);
    } finally {
      setLoadingTotal(false);
    }
  }

  // 차량 선택 바뀌면 이번달 합계도 갱신
  useEffect(() => {
    if (!effectiveUserId || !selectedVehicleId) return;

    // 첫 렌더에서 과도 호출 방지(그래도 문제는 없음)
    if (!mountedRef.current) mountedRef.current = true;

    loadMonthTotal(effectiveUserId, selectedVehicleId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveUserId, selectedVehicleId]);

  // 6) UI (반드시 return 존재!)
  return (
    <section style={{ marginTop: 18 }}>
      <h2 style={{ fontSize: 20, fontWeight: 800, marginBottom: 10 }}>차량</h2>

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
            fontWeight: 700,
          }}
        >
          추가
        </button>
      </div>

      {/* 상태 메시지 */}
      {msg && <div style={{ marginBottom: 10, opacity: 0.9 }}>{msg}</div>}

      {/* 차량 선택 버튼들 */}
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
                fontWeight: 800,
                opacity: active ? 1 : 0.6,
              }}
            >
              {v.name}
            </button>
          );
        })}
      </div>

      {/* 선택된 차량의 Records */}
      {selectedVehicle && effectiveUserId && (
        <>
          <div style={{ marginBottom: 8, opacity: 0.85 }}>
            이번달 합계:{" "}
            <b>{loadingTotal ? "계산 중…" : `$${monthTotal.toFixed(2)}`}</b>
          </div>

          <Records
            userId={effectiveUserId}
            vehicleId={selectedVehicle.id}
            vehicleName={selectedVehicle.name}
          />
        </>
      )}

      {!effectiveUserId && (
        <div style={{ marginTop: 12, opacity: 0.8 }}>
          로그인 정보를 확인할 수 없습니다. (세션이 만료되었을 수 있어요)
        </div>
      )}
    </section>
  );
}
