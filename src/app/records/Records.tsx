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

// ✅ 확정 8개 카테고리
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

CATEGORY_LABEL["etc"] = "기타"; // 과거 데이터 호환
CATEGORY_LABEL["sports"] = "운동"; // 과거 데이터 호환(원하시면 삭제)

const BUCKET = "receipts"; // Supabase Storage bucket 이름

export default function Records({ userId }: { userId: string }) {
  const [records, setRecords] = useState<RecordRow[]>([]);
  const [selectedMonth, setSelectedMonth] = useState(thisMonth());

  // 새 기록
  const [date, setDate] = useState(todayYMD());
  const [category, setCategory] = useState<string>("grocery");
  const [odometer, setOdometer] = useState("");
  const [cost, setCost] = useState("");
  const [vendor, setVendor] = useState("");
  const [notes, setNotes] = useState("");
  const [newFiles, setNewFiles] = useState<FileList | null>(null);

  // 수정 모드
  const [editingId, setEditingId] = useState<string | null>(null);
  const [eDate, setEDate] = useState(todayYMD());
  const [eCategory, setECategory] = useState<string>("grocery");
  const [eOdometer, setEOdometer] = useState("");
  const [eCost, setECost] = useState("");
  const [eVendor, setEVendor] = useState("");
  const [eNotes, setENotes] = useState("");
  const [eFiles, setEFiles] = useState<FileList | null>(null);
  const [eReceiptUrls, setEReceiptUrls] = useState<string[]>([]);

  const [error, setError] = useState<string>("");

  async function loadRecords() {
    setError("");
    const { data, error } = await supabase
      .from("records")
      .select("*")
      .eq("user_id", userId)
      .order("date", { ascending: false });

    if (error) {
      setError(error.message);
      return;
    }
    setRecords((data as RecordRow[]) ?? []);
  }

  useEffect(() => {
    if (userId) loadRecords();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  // ----------- 업로드 유틸 -----------
  async function uploadReceipts(recordId: string, files: FileList) {
    const uploadedUrls: string[] = [];

    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      const ext = f.name.split(".").pop() || "jpg";
      const safeExt = ext.toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
      const filename = `${crypto.randomUUID()}.${safeExt}`;

      // userId/recordId/filename 형태로 저장
      const path = `${userId}/${recordId}/${filename}`;

      const { error: upErr } = await supabase.storage
        .from(BUCKET)
        .upload(path, f, { upsert: false, contentType: f.type });

      if (upErr) throw new Error(upErr.message);

      // bucket을 Public으로 했다는 전제(가장 간단)
      const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
      if (data?.publicUrl) uploadedUrls.push(data.publicUrl);
    }

    return uploadedUrls;
  }

  function resetNewForm() {
    setCost("");
    setVendor("");
    setNotes("");
    setOdometer("");
    setNewFiles(null);
  }

  // ----------- 새 기록 저장 -----------
  async function handleSave() {
    setError("");

    if (!cost) {
      setError("금액을 입력하세요.");
      return;
    }
    if (category === "fuel_oil_tire" && !odometer) {
      setError("차량정비는 주행거리를 입력해야 합니다.");
      return;
    }

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

    // 1) 먼저 레코드 생성해서 id 얻기
    const { data: inserted, error: insErr } = await supabase
      .from("records")
      .insert({
        user_id: userId,
        date,
        category,
        odometer: odoNum,
        cost: costNum,
        vendor: vendor.trim() ? vendor.trim() : null,
        notes: notes.trim() ? notes.trim() : null,
        receipt_urls: [],
      })
      .select("*")
      .single();

    if (insErr || !inserted) {
      setError(insErr?.message ?? "저장 실패");
      return;
    }

    // 2) 파일 있으면 업로드 후 receipt_urls 업데이트
    try {
      if (newFiles && newFiles.length > 0) {
        const urls = await uploadReceipts(inserted.id, newFiles);
        if (urls.length > 0) {
          const { error: upErr } = await supabase
            .from("records")
            .update({ receipt_urls: urls })
            .eq("id", inserted.id)
            .eq("user_id", userId);

          if (upErr) throw new Error(upErr.message);
        }
      }
    } catch (e: any) {
      setError(`사진 업로드 오류: ${e?.message ?? e}`);
      // 레코드는 저장되었으니, 화면만 갱신
    }

    resetNewForm();
    loadRecords();
  }

  // ----------- 수정 시작 -----------
  function startEdit(r: RecordRow) {
    setError("");
    setEditingId(r.id);
    setEDate(r.date);
    setECategory(r.category);
    setEOdometer(r.odometer != null ? String(r.odometer) : "");
    setECost(String(r.cost ?? ""));
    setEVendor(r.vendor ?? "");
    setENotes(r.notes ?? "");
    setEReceiptUrls(r.receipt_urls ?? []);
    setEFiles(null);
  }

  function cancelEdit() {
    setEditingId(null);
    setEFiles(null);
    setEReceiptUrls([]);
  }

  // ----------- 수정 저장 -----------
  async function saveEdit() {
    if (!editingId) return;
    setError("");

    if (!eCost) {
      setError("금액을 입력하세요.");
      return;
    }
    if (eCategory === "fuel_oil_tire" && !eOdometer) {
      setError("차량정비는 주행거리를 입력해야 합니다.");
      return;
    }

    const costNum = Number(eCost);
    if (!Number.isFinite(costNum) || costNum < 0) {
      setError("금액을 올바른 숫자로 입력하세요.");
      return;
    }

    let odoNum: number | null = null;
    if (eCategory === "fuel_oil_tire") {
      const n = Number(eOdometer);
      if (!Number.isFinite(n) || n <= 0) {
        setError("주행거리를 올바른 숫자로 입력하세요.");
        return;
      }
      odoNum = n;
    }

    // 1) 먼저 기본 필드 업데이트
    const { error: upErr1 } = await supabase
      .from("records")
      .update({
        date: eDate,
        category: eCategory,
        odometer: odoNum,
        cost: costNum,
        vendor: eVendor.trim() ? eVendor.trim() : null,
        notes: eNotes.trim() ? eNotes.trim() : null,
        receipt_urls: eReceiptUrls, // 현재 상태(삭제 반영)
      })
      .eq("id", editingId)
      .eq("user_id", userId);

    if (upErr1) {
      setError(upErr1.message);
      return;
    }

    // 2) 새 파일이 있으면 업로드 후 receipt_urls에 추가
    try {
      if (eFiles && eFiles.length > 0) {
        const newUrls = await uploadReceipts(editingId, eFiles);
        if (newUrls.length > 0) {
          const merged = [...eReceiptUrls, ...newUrls];
          const { error: upErr2 } = await supabase
            .from("records")
            .update({ receipt_urls: merged })
            .eq("id", editingId)
            .eq("user_id", userId);

          if (upErr2) throw new Error(upErr2.message);

          setEReceiptUrls(merged);
        }
      }
    } catch (e: any) {
      setError(`사진 업로드 오류: ${e?.message ?? e}`);
    }

    setEditingId(null);
    loadRecords();
  }

  // ----------- 영수증 URL 하나 제거(수정 모드에서만) -----------
  function removeReceiptAt(idx: number) {
    setEReceiptUrls((prev) => prev.filter((_, i) => i !== idx));
  }

  // ----------- 삭제 -----------
  async function deleteRecord(r: RecordRow) {
    const ok = confirm(`${r.date} · ${CATEGORY_LABEL[r.category] ?? r.category} 기록을 삭제할까요?`);
    if (!ok) return;

    setError("");

    // (선택) storage 파일도 지우고 싶으면 여기서 r.receipt_urls를 파싱해서 remove 가능
    // 지금은 레코드 삭제만(간단/안전)

    const { error: delErr } = await supabase
      .from("records")
      .delete()
      .eq("id", r.id)
      .eq("user_id", userId);

    if (delErr) {
      setError(delErr.message);
      return;
    }

    if (editingId === r.id) cancelEdit();
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

      {/* 새 기록 */}
      <div className="space-y-2 border p-3 rounded">
        <h3 className="font-semibold">새 기록</h3>

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

        {/* ✅ 차량정비만 odometer 입력/필수 */}
        {category === "fuel_oil_tire" && (
          <input
            type="number"
            inputMode="numeric"
            placeholder="주행거리(마일) *필수"
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

        {/* 📷 영수증 사진: 모바일 카메라/갤러리 */}
        <div className="space-y-1">
          <div className="text-sm">영수증 사진</div>
          <input
            type="file"
            accept="image/*"
            capture="environment"
            multiple
            onChange={(e) => setNewFiles(e.target.files)}
          />
        </div>

        <button onClick={handleSave} className="w-full bg-black text-white p-2 rounded">
          저장
        </button>
      </div>

      {/* 최근 기록 */}
      <div className="space-y-2">
        <h3 className="font-semibold">최근 기록</h3>

        {filtered.map((r) => {
          const isEditing = editingId === r.id;

          return (
            <div key={r.id} className="border p-2 rounded space-y-2">
              {!isEditing ? (
                <>
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      {r.date} · {CATEGORY_LABEL[r.category] ?? r.category} · ${r.cost}
                      {r.category === "fuel_oil_tire" && r.odometer != null ? ` · ${r.odometer} mi` : ""}
                    </div>
                    <div className="flex gap-2">
                      <button className="border px-2 py-1 rounded" onClick={() => startEdit(r)}>
                        수정
                      </button>
                      <button className="border px-2 py-1 rounded" onClick={() => deleteRecord(r)}>
                        삭제
                      </button>
                    </div>
                  </div>

                  {r.vendor && <div className="text-sm">{r.vendor}</div>}
                  {r.notes && <div className="text-sm whitespace-pre-wrap">{r.notes}</div>}

                  {!!(r.receipt_urls?.length) && (
                    <div className="text-sm">
                      영수증: {r.receipt_urls.length}장{" "}
                      {r.receipt_urls.slice(0, 3).map((u, idx) => (
                        <a
                          key={idx}
                          href={u}
                          target="_blank"
                          rel="noreferrer"
                          className="underline ml-2"
                        >
                          보기{idx + 1}
                        </a>
                      ))}
                      {r.receipt_urls.length > 3 ? <span className="ml-2">...</span> : null}
                    </div>
                  )}
                </>
              ) : (
                <>
                  <div className="font-semibold">수정</div>

                  <input
                    type="date"
                    value={eDate}
                    onChange={(e) => setEDate(e.target.value)}
                    className="w-full border p-2 rounded"
                  />

                  <select
                    value={eCategory}
                    onChange={(e) => {
                      const v = e.target.value;
                      setECategory(v);
                      if (v !== "fuel_oil_tire") setEOdometer("");
                    }}
                    className="w-full border p-2 rounded"
                  >
                    {CATEGORIES.map((c) => (
                      <option key={c.key} value={c.key}>
                        {c.label}
                      </option>
                    ))}
                  </select>

                  {eCategory === "fuel_oil_tire" && (
                    <input
                      type="number"
                      inputMode="numeric"
                      placeholder="주행거리(마일) *필수"
                      value={eOdometer}
                      onChange={(e) => setEOdometer(e.target.value)}
                      className="w-full border p-2 rounded"
                    />
                  )}

                  <input
                    type="number"
                    inputMode="decimal"
                    placeholder="금액($) *필수"
                    value={eCost}
                    onChange={(e) => setECost(e.target.value)}
                    className="w-full border p-2 rounded"
                  />

                  <input
                    placeholder="장소"
                    value={eVendor}
                    onChange={(e) => setEVendor(e.target.value)}
                    className="w-full border p-2 rounded"
                  />

                  <textarea
                    placeholder="메모"
                    value={eNotes}
                    onChange={(e) => setENotes(e.target.value)}
                    className="w-full border p-2 rounded"
                  />

                  {/* 기존 영수증 목록 + 제거 */}
                  <div className="space-y-1">
                    <div className="text-sm">기존 영수증</div>
                    {eReceiptUrls.length === 0 ? (
                      <div className="text-sm text-gray-600">없음</div>
                    ) : (
                      eReceiptUrls.map((u, idx) => (
                        <div key={idx} className="flex items-center justify-between">
                          <a href={u} target="_blank" rel="noreferrer" className="underline text-sm">
                            보기 {idx + 1}
                          </a>
                          <button className="border px-2 py-1 rounded text-sm" onClick={() => removeReceiptAt(idx)}>
                            제거
                          </button>
                        </div>
                      ))
                    )}
                  </div>

                  {/* 새 영수증 추가 업로드 */}
                  <div className="space-y-1">
                    <div className="text-sm">영수증 추가</div>
                    <input
                      type="file"
                      accept="image/*"
                      capture="environment"
                      multiple
                      onChange={(e) => setEFiles(e.target.files)}
                    />
                  </div>

                  <div className="flex gap-2">
                    <button className="flex-1 bg-black text-white p-2 rounded" onClick={saveEdit}>
                      저장
                    </button>
                    <button className="flex-1 border p-2 rounded" onClick={cancelEdit}>
                      취소
                    </button>
                  </div>
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}