"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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

// 과거 데이터 호환(원치 않으면 삭제 가능)
CATEGORY_LABEL["etc"] = "기타";
CATEGORY_LABEL["sports"] = "운동";

const BUCKET = "receipts"; // ✅ 반드시 소문자 receipts

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
  const [eReceiptUrlsOriginal, setEReceiptUrlsOriginal] = useState<string[]>([]);

  const [error, setError] = useState<string>("");

  // ✅ 숨김 카메라 input ref (새 기록 / 수정)
  const newCamRef = useRef<HTMLInputElement | null>(null);
  const editCamRef = useRef<HTMLInputElement | null>(null);

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

  // ---------------- Storage helpers ----------------

  async function uploadReceipts(recordId: string, files: FileList) {
    const uploadedUrls: string[] = [];

    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      const ext = f.name.split(".").pop() || "jpg";
      const safeExt = ext.toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
      const filename = `${crypto.randomUUID()}.${safeExt}`;

      // userId/recordId/filename 형태
      const path = `${userId}/${recordId}/${filename}`;

      const { error: upErr } = await supabase.storage
        .from(BUCKET)
        .upload(path, f, { upsert: false, contentType: f.type });

      if (upErr) throw new Error(upErr.message);

      // bucket이 Public일 때 (현재 방식)
      const publicUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${path}`;
      uploadedUrls.push(publicUrl);
    }

    return uploadedUrls;
  }

  function extractStoragePathFromPublicUrl(url: string) {
    try {
      const u = new URL(url);
      const p = u.pathname;

      const marker1 = "/storage/v1/object/public/";
      const marker2 = "/storage/v1/object/sign/";
      let idx = p.indexOf(marker1);
      let marker = marker1;
      if (idx === -1) {
        idx = p.indexOf(marker2);
        marker = marker2;
      }
      if (idx === -1) return null;

      const after = p.slice(idx + marker.length); // receipts/userId/recordId/file.jpg
      const prefix = `${BUCKET}/`;
      if (!after.startsWith(prefix)) return null;

      return after.slice(prefix.length); // userId/recordId/file.jpg
    } catch {
      return null;
    }
  }

  async function removeReceiptFilesByUrls(urls: string[]) {
    const paths = urls
      .map(extractStoragePathFromPublicUrl)
      .filter((x): x is string => !!x);

    if (paths.length === 0) return;

    const { error } = await supabase.storage.from(BUCKET).remove(paths);
    if (error) throw new Error(error.message);
  }

  // ---------------- UI helpers ----------------

  function resetNewForm() {
    setCost("");
    setVendor("");
    setNotes("");
    setOdometer("");
    setNewFiles(null);
    // ✅ 같은 파일 다시 찍어도 onChange가 뜨도록 value 비우기
    if (newCamRef.current) newCamRef.current.value = "";
  }

  function openNewCamera() {
    if (!newCamRef.current) return;
    newCamRef.current.value = ""; // 같은 파일/사진도 다시 선택되게
    newCamRef.current.click();
  }

  function openEditCamera() {
    if (!editCamRef.current) return;
    editCamRef.current.value = "";
    editCamRef.current.click();
  }

  // ---------------- Create ----------------

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

    // 1) 레코드 생성
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

    // 2) 파일 업로드 후 receipt_urls 업데이트
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
    }

    resetNewForm();
    loadRecords();
  }

  // ---------------- Edit ----------------

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
    setEReceiptUrlsOriginal(r.receipt_urls ?? []);
    setEFiles(null);
    if (editCamRef.current) editCamRef.current.value = "";
  }

  function cancelEdit() {
    setEditingId(null);
    setEFiles(null);
    setEReceiptUrls([]);
    setEReceiptUrlsOriginal([]);
    if (editCamRef.current) editCamRef.current.value = "";
  }

  function removeReceiptAt(idx: number) {
    setEReceiptUrls((prev) => prev.filter((_, i) => i !== idx));
  }

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

    // 1) 기본 필드 업데이트
    const { error: upErr1 } = await supabase
      .from("records")
      .update({
        date: eDate,
        category: eCategory,
        odometer: odoNum,
        cost: costNum,
        vendor: eVendor.trim() ? eVendor.trim() : null,
        notes: eNotes.trim() ? eNotes.trim() : null,
        receipt_urls: eReceiptUrls,
      })
      .eq("id", editingId)
      .eq("user_id", userId);

    if (upErr1) {
      setError(upErr1.message);
      return;
    }

    // 2) 새 파일 업로드 → receipt_urls에 추가
    let finalUrls = [...eReceiptUrls];

    try {
      if (eFiles && eFiles.length > 0) {
        const newUrls = await uploadReceipts(editingId, eFiles);
        if (newUrls.length > 0) {
          finalUrls = [...finalUrls, ...newUrls];
          const { error: upErr2 } = await supabase
            .from("records")
            .update({ receipt_urls: finalUrls })
            .eq("id", editingId)
            .eq("user_id", userId);

          if (upErr2) throw new Error(upErr2.message);

          setEReceiptUrls(finalUrls);
        }
      }
    } catch (e: any) {
      setError(`사진 업로드 오류: ${e?.message ?? e}`);
    }

    // 3) 제거된 파일 Storage에서도 삭제
    try {
      const removed = eReceiptUrlsOriginal.filter((u) => !finalUrls.includes(u));
      if (removed.length > 0) {
        await removeReceiptFilesByUrls(removed);
      }
    } catch (e: any) {
      setError(`영수증 파일 삭제 오류: ${e?.message ?? e}`);
    }

    setEditingId(null);
    setEFiles(null);
    setEReceiptUrlsOriginal([]);
    if (editCamRef.current) editCamRef.current.value = "";
    loadRecords();
  }

  // ---------------- Delete ----------------

  async function deleteRecord(r: RecordRow) {
    const ok = confirm(
      `${r.date} · ${CATEGORY_LABEL[r.category] ?? r.category} 기록을 삭제할까요?`
    );
    if (!ok) return;

    setError("");

    try {
      if (r.receipt_urls && r.receipt_urls.length > 0) {
        await removeReceiptFilesByUrls(r.receipt_urls);
      }
    } catch (e: any) {
      setError(`영수증 파일 삭제 오류: ${e?.message ?? e}`);
      return;
    }

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

  // ---------------- Derived ----------------

  const filtered = useMemo(() => {
    return records.filter((r) => r.date.startsWith(selectedMonth));
  }, [records, selectedMonth]);

  const monthTotal = useMemo(() => {
    return filtered.reduce((sum, r) => sum + (Number(r.cost) || 0), 0).toFixed(2);
  }, [filtered]);

  // ---------------- Render ----------------

  return (
    <div className="p-4 max-w-xl mx-auto space-y-4">
      <div className="flex items-end justify-between">
        <h1 className="text-2xl font-extrabold">가계부</h1>
        <div className="text-sm text-gray-600">월별 지출 기록</div>
      </div>

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

        {/* ✅ 방법1: 숨겨진 input + 버튼 */}
        <div className="space-y-2">
          <div className="text-sm font-medium">영수증 사진</div>

          <input
            ref={newCamRef}
            type="file"
            accept="image/*"
            capture="environment"
            multiple
            style={{ display: "none" }}
            onChange={(e) => setNewFiles(e.target.files)}
          />

          <div className="flex gap-2">
            <button
              type="button"
              onClick={openNewCamera}
              className="flex-1 bg-blue-600 text-white p-2 rounded"
            >
              📸 사진 찍기
            </button>

            <button
              type="button"
              onClick={() => {
                setNewFiles(null);
                if (newCamRef.current) newCamRef.current.value = "";
              }}
              className="border p-2 rounded"
            >
              선택 취소
            </button>
          </div>

          <div className="text-sm text-gray-600">
            {newFiles?.length ? `선택됨: ${newFiles.length}장` : "선택된 사진 없음"}
          </div>
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
                        <a key={idx} href={u} target="_blank" rel="noreferrer" className="underline ml-2">
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

                  {/* ✅ 방법1: 숨겨진 input + 버튼 (수정에서 영수증 추가) */}
                  <div className="space-y-2">
                    <div className="text-sm font-medium">영수증 추가</div>

                    <input
                      ref={editCamRef}
                      type="file"
                      accept="image/*"
                      capture="environment"
                      multiple
                      style={{ display: "none" }}
                      onChange={(e) => setEFiles(e.target.files)}
                    />

                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={openEditCamera}
                        className="flex-1 bg-blue-600 text-white p-2 rounded"
                      >
                        📸 사진 찍기
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setEFiles(null);
                          if (editCamRef.current) editCamRef.current.value = "";
                        }}
                        className="border p-2 rounded"
                      >
                        선택 취소
                      </button>
                    </div>

                    <div className="text-sm text-gray-600">
                      {eFiles?.length ? `선택됨: ${eFiles.length}장` : "선택된 사진 없음"}
                    </div>
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