"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";

type RecordRow = {
  id: string;
  user_id: string;
  date: string; // YYYY-MM-DD
  category: string; // record_category enum
  odometer: number | null;
  cost: number;
  vendor: string | null;
  notes: string | null;
  receipt_urls: string[];
  created_at: string;
  updated_at: string;
};

function todayYMD() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// 카테고리 (DB enum record_category 와 100% 동일해야 함)
const categories = [
  { v: "fuel", label: "주유" },
  { v: "oil_tire", label: "오일교환 타이어" },
  { v: "grocery", label: "그로서리" },
  { v: "medical", label: "의료" },
  { v: "utility", label: "전기 개스" },
  { v: "dining", label: "외식" },
  { v: "sports", label: "운동" },
  { v: "other", label: "기타" },
] as const;

type CategoryValue = (typeof categories)[number]["v"];

function money(n: number) {
  if (!Number.isFinite(n)) return "";
  return n.toFixed(2);
}

function numOrNull(v: string) {
  const t = v.trim();
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

function numOrNaN(v: string) {
  const t = v.trim();
  if (!t) return NaN;
  const n = Number(t);
  return Number.isFinite(n) ? n : NaN;
}

function ymdToMonthKey(ymd: string) {
  // "2026-02-25" -> "2026-02"
  return ymd.slice(0, 7);
}

export default function Records({ userId }: { userId: string }) {
  const [records, setRecords] = useState<RecordRow[]>([]);
  const [loading, setLoading] = useState(false);

  // 입력 폼
  const [date, setDate] = useState(todayYMD());
  const [category, setCategory] = useState<CategoryValue>("fuel");
  const [odometer, setOdometer] = useState("");
  const [cost, setCost] = useState("");
  const [vendor, setVendor] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");

  // 월 필터 (현재월)
  const [monthKey, setMonthKey] = useState(() => {
    const now = todayYMD();
    return ymdToMonthKey(now);
  });

  async function loadRecords() {
    if (!userId) return;

    setLoading(true);
    setError("");

    const { data, error } = await supabase
      .from("records")
      .select("*")
      .eq("user_id", userId)
      .order("date", { ascending: false })
      .order("created_at", { ascending: false });

    setLoading(false);

    if (error) {
      setError(error.message);
      return;
    }
    setRecords((data ?? []) as RecordRow[]);
  }

  useEffect(() => {
    loadRecords();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  async function handleSave() {
    setError("");

    const costNum = numOrNaN(cost);
    if (!Number.isFinite(costNum) || costNum <= 0) {
      setError("금액($)을 0보다 큰 숫자로 입력하세요.");
      return;
    }

    const odoNum = numOrNull(odometer);

    const { error } = await supabase.from("records").insert({
      user_id: userId,
      date,
      category, // enum 값 그대로
      odometer: odoNum,
      cost: costNum,
      vendor: vendor.trim() ? vendor.trim() : null,
      notes: notes.trim() ? notes.trim() : null,
      receipt_urls: [],
    });

    if (error) {
      setError(`저장 오류: ${error.message}`);
      return;
    }

    // 입력값 일부 초기화
    setOdometer("");
    setCost("");
    setVendor("");
    setNotes("");

    // 저장한 날짜의 월로 자동 이동 (원하면 이 줄은 지워도 됨)
    setMonthKey(ymdToMonthKey(date));

    loadRecords();
  }

  const months = useMemo(() => {
    // records에서 존재하는 월 목록 생성 + 현재 선택 월 포함
    const set = new Set<string>();
    for (const r of records) set.add(ymdToMonthKey(r.date));
    set.add(monthKey);
    return Array.from(set).sort((a, b) => (a > b ? -1 : 1));
  }, [records, monthKey]);

  const filtered = useMemo(() => {
    return records.filter((r) => ymdToMonthKey(r.date) === monthKey);
  }, [records, monthKey]);

  const monthTotal = useMemo(() => {
    const sum = filtered.reduce((acc, r) => acc + (Number(r.cost) || 0), 0);
    return money(sum);
  }, [filtered]);

  const catLabel = useMemo(() => {
    const map = new Map<string, string>(categories.map((c) => [c.v, c.label]));
    return (v: string) => map.get(v) ?? v;
  }, []);

  return (
    <div className="p-4 max-w-xl mx-auto space-y-4">
      <div className="space-y-1">
        <div className="text-xl font-bold">이번달 합계: ${monthTotal}</div>

        <div className="flex items-center gap-2">
          <div className="text-sm text-gray-600">월 선택</div>
          <select
            value={monthKey}
            onChange={(e) => setMonthKey(e.target.value)}
            className="border p-2 rounded"
          >
            {months.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </div>

        {loading && <div className="text-sm text-gray-500">불러오는 중...</div>}
        {error && <div className="text-red-600 whitespace-pre-wrap">{error}</div>}
      </div>

      {/* 새 기록 */}
      <div className="border rounded-lg p-3 space-y-2">
        <div className="text-lg font-bold">새 기록</div>

        <div className="grid grid-cols-3 gap-2 items-center">
          <div className="text-sm text-gray-700">날짜</div>
          <div className="col-span-2">
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full border p-2 rounded"
            />
          </div>

          <div className="text-sm text-gray-700">종류</div>
          <div className="col-span-2">
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value as CategoryValue)}
              className="w-full border p-2 rounded"
            >
              {categories.map((c) => (
                <option key={c.v} value={c.v}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>

          <div className="text-sm text-gray-700">주행거리(마일)</div>
          <div className="col-span-2">
            <input
              inputMode="numeric"
              placeholder="예: 117428 (선택)"
              value={odometer}
              onChange={(e) => setOdometer(e.target.value)}
              className="w-full border p-2 rounded"
            />
          </div>

          <div className="text-sm text-gray-700">금액($)</div>
          <div className="col-span-2">
            <input
              inputMode="decimal"
              placeholder="예: 23.45"
              value={cost}
              onChange={(e) => setCost(e.target.value)}
              className="w-full border p-2 rounded"
            />
          </div>

          <div className="text-sm text-gray-700">장소</div>
          <div className="col-span-2">
            <input
              placeholder="예: Costco"
              value={vendor}
              onChange={(e) => setVendor(e.target.value)}
              className="w-full border p-2 rounded"
            />
          </div>

          <div className="text-sm text-gray-700">메모</div>
          <div className="col-span-2">
            <textarea
              placeholder="메모"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full border p-2 rounded min-h-[90px]"
            />
          </div>

          <div className="text-sm text-gray-700">영수증 사진</div>
          <div className="col-span-2">
            {/* 사진 업로드는 다음 단계에서 카메라/모바일 대응으로 다듬겠습니다 */}
            <input type="file" multiple className="w-full" />
          </div>
        </div>

        <button
          onClick={handleSave}
          className="w-full bg-black text-white p-3 rounded-lg"
        >
          저장
        </button>
      </div>

      {/* 최근 기록 */}
      <div className="space-y-2">
        <div className="text-lg font-bold">최근 기록</div>

        {filtered.length === 0 ? (
          <div className="text-sm text-gray-600">이 달 기록이 없습니다.</div>
        ) : (
          filtered.map((r) => (
            <div key={r.id} className="border rounded-lg p-3">
              <div className="font-semibold">
                {r.date} · {catLabel(r.category)} · ${money(Number(r.cost) || 0)}
                {r.odometer != null ? ` · ${r.odometer} mi` : ""}
              </div>
              {r.vendor && <div className="text-sm text-gray-700">{r.vendor}</div>}
              {r.notes && (
                <div className="text-sm text-gray-600 whitespace-pre-wrap">{r.notes}</div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}