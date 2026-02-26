"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";

type RecordRow = {
  id: string;
  user_id: string;
  date: string; // YYYY-MM-DD
  category: string;
  odometer: number | null;
  cost: number;
  vendor: string | null;
  notes: string | null;
  receipt_urls: string[] | null;
  created_at: string;
};

function todayYMD() {
  const d = new Date();
  return d.toISOString().slice(0, 10);
}

function thisMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

// ✅ 확정 8개 카테고리 (저장은 key, 표시는 label)
const CATEGORIES = [
  { key: "fuel_oil_tire", label: "차량정비" },
  { key: "grocery", label: "식료품" },
  { key: "medical", label: "의료비" },
  { key: "utility", label: "개스/전기" },
  { key: "dining", label: "외식" },
  { key: "tax", label: "세금" },
  { key: "exercise", label: "운동" },
  { key: "other", label: "기타" },
] as const;

const CATEGORY_LABEL: Record<string, string> = Object.fromEntries(
  CATEGORIES.map((c) => [c.key, c.label])
);

// 혹시 과거 데이터에 etc 등이 있으면 라벨만 보정(선택)
CATEGORY_LABEL["etc"] = "기타";

export default function Records({ userId }: { userId: string }) {
  const [records, setRecords] = useState<RecordRow[]>([]);
  const [selectedMonth, setSelectedMonth] = useState(thisMonth());

  const [date, setDate] = useState(todayYMD());
  const [category, setCategory] = useState<string>("grocery");
  const [odometer, setOdometer] = useState("");
  const [cost, setCost] = useState("");
  const [vendor, setVendor] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");

  async function loadRecords() {
    const { data, error } = await supabase
      .from("records")
      .select("*")
      .eq("user_id", userId)
      .order("date", { ascending: false });

    if (error) {
      setError(error.message);
      return;
    }
    if (data) setRecords(data);
  }

  useEffect(() => {
    if (userId) loadRecords();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  async function handleSave() {
    setError("");

    // ✅ 금액 필수
    if (!cost) {
      setError("금액을 입력하세요.");
      return;
    }

    // ✅ 차량정비일 때 주행거리 필수
    if (category === "fuel_oil_tire" && !odometer) {
      setError("차량정비는 주행거리를 입력해야 합니다.");
      return;
    }

    // 숫자 변환 안전 처리
    const costNum = Number(cost);
    if (!Number.isFinite(costNum) || costNum < 0) {
      setError("금액을 올바른 숫자로 입력하세요.");
      return;
    }

    let odoNum: number | null = null;
    if (category === "fuel_oil_tire") {
      const n = Number(odometer);
      if (!Number.isFinite(n) || n <= 0) {
        setError("주행거리를 올바른 숫자로 입력하세요.");
        return;
      }
      odoNum = n;
    }

    const { error } = await supabase.from("records").insert({
      user_id: userId,
      date,
      category,
      odometer: odoNum, // ✅ 차량정비만 숫자, 나머지는 null
      cost: costNum,
      vendor: vendor.trim() ? vendor.trim() : null,
      notes: notes.trim() ? notes.trim() : null,
      receipt_urls: [],
    });

    if (error) {
      setError(error.message);
      return;
    }

    // 입력 초기화
    setCost("");
    setVendor("");
    setNotes("");
    setOdometer("");

    loadRecords();
  }

  const filtered = useMemo(() => {
    return records.filter((r) => r.date.startsWith(selectedMonth));
  }, [records, selectedMonth]);

  const monthTotal = useMemo(() => {
    return filtered.reduce((sum, r) => sum + (Number(r.cost) || 0), 0).toFixed(2);
  }, [filtered]);

  return (
    <div className="p-4 max-w-xl mx-auto space-y-4">
      <h2 className="text-xl font-bold">이번달 합계: ${monthTotal}</h2>

      <div>
        <label className="block text-sm mb-1">월 선택</label>
        <input
          type="month"
          value={selectedMonth}
          onChange={(e) => setSelectedMonth(e.target.value)}
          className="border p-2 rounded w-full"
        />
      </div>

      {error && <div className="text-red-600 whitespace-pre-wrap">{error}</div>}

      <div className="space-y-2 border p-3 rounded">
        <h3 className="font-semibold">새 기록</h3>

        <div className="grid grid-cols-1 gap-2">
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="w-full border p-2 rounded"
          />

          <select
            value={category}
            onChange={(e) => {
              const v = e.target.value;
              setCategory(v);
              // 카테고리 바꿀 때 주행거리 값은 정비가 아니면 비우기
              if (v !== "fuel_oil_tire") setOdometer("");
            }}
            className="w-full border p-2 rounded"
          >
            {CATEGORIES.map((c) => (
              <option key={c.key} value={c.key}>
                {c.label}
              </option>
            ))}
          </select>

          {/* ✅ 차량정비일 때만 주행거리 입력 표시 + 필수 */}
          {category === "fuel_oil_tire" && (
            <input
              type="number"
              inputMode="numeric"
              placeholder="주행거리 (마일) *필수"
              value={odometer}
              onChange={(e) => setOdometer(e.target.value)}
              className="w-full border p-2 rounded"
            />
          )}

          <input
            type="number"
            inputMode="decimal"
            placeholder="금액($) *필수"
            value={cost}
            onChange={(e) => setCost(e.target.value)}
            className="w-full border p-2 rounded"
          />

          <input
            placeholder="장소"
            value={vendor}
            onChange={(e) => setVendor(e.target.value)}
            className="w-full border p-2 rounded"
          />

          <textarea
            placeholder="메모"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="w-full border p-2 rounded"
          />

          <button
            onClick={handleSave}
            className="w-full bg-black text-white p-2 rounded"
          >
            저장
          </button>
        </div>
      </div>

      <div className="space-y-2">
        <h3 className="font-semibold">최근 기록</h3>

        {filtered.map((r) => (
          <div key={r.id} className="border p-2 rounded">
            <div>
              {r.date} · {CATEGORY_LABEL[r.category] ?? r.category} · ${r.cost}
              {r.category === "fuel_oil_tire" && r.odometer != null
                ? ` · ${r.odometer} mi`
                : ""}
            </div>
            {r.vendor && <div className="text-sm">{r.vendor}</div>}
            {r.notes && <div className="text-sm whitespace-pre-wrap">{r.notes}</div>}
          </div>
        ))}
      </div>
    </div>
  );
}