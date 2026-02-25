"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";

type RecordsProps = {
  userId: string;
  vehicleId: string;
  vehicleName: string;
  onChanged?: () => void;
};

type RecordRow = {
  id: string;
  user_id: string;
  vehicle_id: string;
  date: string;
  category: string | null;
  odometer: number | null;
  cost: number;
  vendor: string | null;
  notes: string | null;
  receipt_urls: string[] | null; // ✅ storage path array (null 가능)
  created_at?: string;
  updated_at?: string;
};

const BUCKET = "receipts";

// 카테고리
const categories = [
  { v: "fuel", label: "주유" },
  { v: "oil", label: "오일교환" },
  { v: "tire", label: "타이어" },
  { v: "repair", label: "정비" },
  { v: "inspection", label: "점검" },
  { v: "registration", label: "등록/세금" },
  { v: "other", label: "기타" },
];
const catLabel = (v: string) => categories.find((c) => c.v === v)?.label ?? v;

function todayISO() {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}

function normalizeIntInput(s: string) {
  const digits = (s ?? "").replace(/[^\d]/g, "");
  if (digits === "") return "";
  if (/^0+$/.test(digits)) return "0";
  return digits.replace(/^0+/, "");
}

function normalizeMoneyInput(s: string) {
  let v = (s ?? "").replace(/[^\d.]/g, "");
  if (v === "") return "";

  const parts = v.split(".");
  if (parts.length > 2) v = `${parts[0]}.${parts.slice(1).join("")}`;

  const [intPartRaw, decPartRaw] = v.split(".");
  const intPart = (intPartRaw ?? "").replace(/[^\d]/g, "") || "0";
  const decPart = (decPartRaw ?? "").replace(/[^\d]/g, "").slice(0, 2);

  return v.includes(".") ? `${intPart}.${decPart}` : intPart;
}

function fmtMoney(n: number) {
  if (!Number.isFinite(n)) return "$0.00";
  return `$${n.toFixed(2)}`;
}

export default function Records({ userId, vehicleId, vehicleName, onChanged }: RecordsProps) {
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<RecordRow[]>([]);
  const [msg, setMsg] = useState("");
const [editingId, setEditingId] = useState<string | null>(null);
  // 폼
  const [date, setDate] = useState(todayISO());
  const [category, setCategory] = useState("fuel");
  const [odometer, setOdometer] = useState("");
  const [cost, setCost] = useState("");
  const [vendor, setVendor] = useState("");
  const [notes, setNotes] = useState("");

  const [files, setFiles] = useState<File[]>([]);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // 수정
  const [saving, setSaving] = useState(false);

  // 상세/사진 모달
  const [detail, setDetail] = useState<RecordRow | null>(null);
  const [photoOpen, setPhotoOpen] = useState<string | null>(null); // signed url

  // signed url 캐시
  const signedCacheRef = useRef<Map<string, string>>(new Map());

  async function getSignedUrl(path: string): Promise<string | null> {
    if (!path) return null;
    const cached = signedCacheRef.current.get(path);
    if (cached) return cached;

    const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 60 * 30);
    if (error) return null;

    const url = data.signedUrl;
    signedCacheRef.current.set(path, url);
    return url;
  }

  async function loadRecent() {
    if (!userId || !vehicleId) return;

    setLoading(true);
    setMsg("");

    const { data, error } = await supabase
      .from("records")
      .select("id,user_id,vehicle_id,date,category,odometer,cost,vendor,notes,receipt_urls,created_at,updated_at")
      .eq("user_id", userId)
      .eq("vehicle_id", vehicleId)
      .order("date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(200);

    if (error) {
      setRows([]);
      setMsg("기록 불러오기 오류: " + error.message);
      setLoading(false);
      return;
    }

    setRows(((data as any) ?? []) as RecordRow[]);
    setLoading(false);
  }

  useEffect(() => {
    // 차량 바뀌면 리셋 + 다시 로드
    setEditingId(null);
    setDate(todayISO());
    setCategory("fuel");
    setOdometer("");
    setCost("");
    setVendor("");
    setNotes("");
    setFiles([]);
    if (fileInputRef.current) fileInputRef.current.value = "";
    signedCacheRef.current.clear();
    setDetail(null);
    setPhotoOpen(null);

    loadRecent();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, vehicleId]);

  function startEdit(r: RecordRow) {
    setEditingId(r.id);
    setDate(r.date);
    setCategory(r.category ?? "fuel");
    setOdometer(r.odometer != null ? String(r.odometer) : "");
    setCost(r.cost != null ? String(r.cost) : "");
    setVendor(r.vendor ?? "");
    setNotes(r.notes ?? "");
    setFiles([]);
    if (fileInputRef.current) fileInputRef.current.value = "";
    setMsg("수정 모드입니다. 변경 후 저장을 누르세요.");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function cancelEdit() {
    setEditingId(null);
    setDate(todayISO());
    setCategory("fuel");
    setOdometer("");
    setCost("");
    setVendor("");
    setNotes("");
    setFiles([]);
    if (fileInputRef.current) fileInputRef.current.value = "";
    setMsg("");
  }

  async function uploadReceipts(recordId: string): Promise<string[]> {
    if (!files.length) return [];

    const paths: string[] = [];

    for (const f of files) {
      const ext = (f.name.split(".").pop() || "jpg").toLowerCase();
      const safeExt = ["jpg", "jpeg", "png", "webp", "heic"].includes(ext) ? ext : "jpg";
      const uuid = crypto.randomUUID();
      const path = `${userId}/${vehicleId}/${recordId}/${uuid}.${safeExt}`;

      const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, f, {
        upsert: false,
        contentType: f.type || "image/jpeg",
      });
      if (upErr) throw upErr;

      paths.push(path);
    }

    return paths;
  }

  async function saveRecord() {
    if (!userId) return setMsg("로그인이 필요합니다.");
    if (!vehicleId) return setMsg("차량을 먼저 선택하세요.");
    if (!date) return setMsg("날짜를 입력하세요.");

    const costNorm = normalizeMoneyInput(cost);
    const odoNorm = normalizeIntInput(odometer);

    const costNum = costNorm === "" ? 0 : Number(costNorm);
    if (!Number.isFinite(costNum) || costNum < 0) return setMsg("금액이 올바르지 않습니다.");

    const odoNum = odoNorm === "" ? null : Number(odoNorm);
    if (odoNum != null && (!Number.isFinite(odoNum) || odoNum < 0)) return setMsg("주행거리가 올바르지 않습니다.");

    setSaving(true);
    setMsg("");

    try {
      if (!editingId) {
        // INSERT
        const { data: inserted, error: insErr } = await supabase
          .from("records")
          .insert({
            user_id: userId,
            vehicle_id: vehicleId,
            date,
            category,
            odometer: odoNum,
            cost: costNum,
            vendor: vendor.trim() || null,
            notes: notes.trim() || null,
            receipt_urls: [],
          })
          .select("id,receipt_urls")
          .single();

        if (insErr) throw insErr;

        const recordId = (inserted as any).id as string;

        // 업로드 후 receipt_urls 업데이트
        if (files.length) {
          const newPaths = await uploadReceipts(recordId);
          if (newPaths.length) {
            const { error: upErr } = await supabase
              .from("records")
              .update({ receipt_urls: newPaths })
              .eq("id", recordId)
              .eq("user_id", userId);
            if (upErr) throw upErr;
          }
        }

        setMsg("저장했습니다.");
      } else {
        // UPDATE: 기존 receipt_urls 가져온 뒤 merge
        const { data: before, error: getErr } = await supabase
          .from("records")
          .select("receipt_urls")
          .eq("id", editingId)
          .eq("user_id", userId)
          .single();

        if (getErr) throw getErr;

        const prevPaths = (((before as any)?.receipt_urls ?? []) as string[]) || [];
        let mergedPaths = prevPaths;

        if (files.length) {
          const newPaths = await uploadReceipts(editingId);
          mergedPaths = Array.from(new Set([...prevPaths, ...newPaths]));
        }

        const { error: updErr } = await supabase
          .from("records")
          .update({
            date,
            category,
            odometer: odoNum,
            cost: costNum,
            vendor: vendor.trim() || null,
            notes: notes.trim() || null,
            receipt_urls: mergedPaths,
          })
          .eq("id", editingId)
          .eq("user_id", userId);

        if (updErr) throw updErr;
        }
      // 리셋
// 성공 후 메시지
setMsg(editingId ? "수정 저장했습니다." : "저장했습니다.");

// 모달 닫기
setDetail(null);
setPhotoOpen(null);

// 폼 초기화
cancelEdit();

// 리스트 새로고침
await loadRecent();
onChanged?.();

// 메시지 자동 제거
setTimeout(() => setMsg(""), 1200);

    } catch (e: any) {
      setMsg("저장 오류: " + (e?.message || String(e)));
    } finally {
      setSaving(false);
    }
  }

  return (
    <section style={{ border: "1px solid #eaeaea", borderRadius: 12, padding: 12, background: "#fff" }}>
     
      <h3 style={{ margin: 0, fontSize: 18, fontWeight: 900 }}>{vehicleName} 기록</h3>

      <div style={{ marginTop: 10, marginBottom: 10, fontWeight: 900 }}>{editingId ? "수정" : "새 기록"}</div>

      {msg && <div style={{ marginBottom: 10, fontWeight: 900, opacity: 0.9 }}>{msg}</div>}

      {/* 입력 폼 */}
      <div style={{ display: "grid", gap: 8 }}>
        <label style={{ display: "grid", gridTemplateColumns: "80px 1fr", alignItems: "center", gap: 8 }}>
          <span>날짜</span>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            disabled={saving}
            style={{ padding: "8px 10px", borderRadius: 10, border: "1px solid #e5e5e5" }}
          />
        </label>

        <label style={{ display: "grid", gridTemplateColumns: "80px 1fr", alignItems: "center", gap: 8 }}>
          <span>종류</span>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            disabled={saving}
            style={{ padding: "8px 10px", borderRadius: 10, border: "1px solid #e5e5e5" }}
          >
            {categories.map((c) => (
              <option key={c.v} value={c.v}>
                {c.label}
              </option>
            ))}
          </select>
        </label>

        <label style={{ display: "grid", gridTemplateColumns: "120px 1fr", alignItems: "center", gap: 8 }}>
          <span>주행거리(마일)</span>
          <input
            value={odometer}
            onChange={(e) => setOdometer(normalizeIntInput(e.target.value))}
            inputMode="numeric"
            placeholder="예: 117428"
            disabled={saving}
            style={{ padding: "8px 10px", borderRadius: 10, border: "1px solid #e5e5e5" }}
          />
        </label>

        <label style={{ display: "grid", gridTemplateColumns: "80px 1fr", alignItems: "center", gap: 8 }}>
          <span>금액($)</span>
          <input
            value={cost}
            onChange={(e) => setCost(normalizeMoneyInput(e.target.value))}
            inputMode="decimal"
            placeholder="예: 23.45"
            disabled={saving}
            style={{ padding: "8px 10px", borderRadius: 10, border: "1px solid #e5e5e5" }}
          />
        </label>

        <label style={{ display: "grid", gridTemplateColumns: "140px 1fr", alignItems: "center", gap: 8 }}>
          <span>장소</span>
          <input
            value={vendor}
            onChange={(e) => setVendor(e.target.value)}
            placeholder="예: Costco"
            disabled={saving}
            style={{ padding: "8px 10px", borderRadius: 10, border: "1px solid #e5e5e5" }}
          />
        </label>

        <label style={{ display: "grid", gridTemplateColumns: "80px 1fr", alignItems: "start", gap: 8 }}>
          <span>메모</span>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            disabled={saving}
            style={{ padding: "8px 10px", borderRadius: 10, border: "1px solid #e5e5e5" }}
          />
        </label>

        <label style={{ display: "grid", gridTemplateColumns: "140px 1fr", alignItems: "center", gap: 8 }}>
          <span>영수증 사진</span>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept="image/*"
            disabled={saving}
            onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
          />
        </label>

        <div style={{ display: "flex", gap: 8 }}>
          <button
            type="button"
            onClick={saveRecord}
            disabled={saving}
            style={{
              padding: "12px 12px",
              borderRadius: 12,
              border: "1px solid #e5e5e5",
              fontWeight: 900,
              opacity: saving ? 0.6 : 1,
              background: "#fff",
            }}
          >
            {saving ? "저장중..." : "저장"}
          </button>

          {editingId && (
            <button
              type="button"
              onClick={cancelEdit}
              disabled={saving}
              style={{
                padding: "12px 12px",
                borderRadius: 12,
                border: "1px solid #e5e5e5",
                fontWeight: 900,
                opacity: 0.85,
                background: "transparent",
              }}
            >
              취소
            </button>
          )}
        </div>
      </div>

      {/* 최근 기록 */}
      <div style={{ marginTop: 14, fontWeight: 900 }}>최근 기록</div>

      {loading && <div style={{ opacity: 0.7, marginTop: 8 }}>불러오는 중…</div>}
      {!loading && rows.length === 0 && <div style={{ opacity: 0.7, marginTop: 8 }}>아직 기록이 없습니다.</div>}

      <div style={{ marginTop: 8, display: "grid", gap: 10 }}>
        {rows.map((r) => (
          <RecordCard
            key={r.id}
            row={r}
            onOpenDetail={() => setDetail(r)}
            onEdit={() => startEdit(r)}
            getSignedUrl={getSignedUrl}
            onOpenPhoto={(url) => setPhotoOpen(url)}
          />
        ))}
      </div>

      {/* 상세 모달 */}
      {detail && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.6)",
            zIndex: 9999,
            padding: 16,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
          onClick={() => setDetail(null)}
        >
          <div
            style={{
              width: "100%",
              maxWidth: 520,
              background: "#111",
              color: "#fff",
              borderRadius: 14,
              padding: 14,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }}>
              <div style={{ fontWeight: 900, fontSize: 16 }}>
                {detail.date} · {catLabel(detail.category ?? "other")} ·{" "}
                {detail.odometer != null ? `${Number(detail.odometer).toLocaleString()} mi` : "—"}
              </div>
              <button
                type="button"
                onClick={() => setDetail(null)}
                style={{ padding: "6px 10px", borderRadius: 10, fontWeight: 900 }}
              >
                닫기
              </button>
            </div>

            <div style={{ marginTop: 10, display: "grid", gap: 6, fontSize: 14, opacity: 0.95 }}>
              <div>금액: {fmtMoney(Number(detail.cost ?? 0))}</div>
              <div>장소: {detail.vendor ?? "-"}</div>
              <div>메모: {detail.notes ?? "-"}</div>
            </div>

            <div style={{ marginTop: 12 }}>
              <div style={{ fontWeight: 900, marginBottom: 8 }}>영수증</div>

              {((detail.receipt_urls ?? []) as string[]).length === 0 ? (
                <div style={{ opacity: 0.75 }}>영수증 사진이 없습니다.</div>
              ) : (
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {(detail.receipt_urls ?? []).map((p) => (
                    <ReceiptThumb
                      key={p}
                      path={p}
                      getSignedUrl={getSignedUrl}
                      onOpen={(u) => setPhotoOpen(u)}
                    />
                  ))}
                </div>
              )}
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 14 }}>
              <button
                type="button"
                onClick={() => {
                  startEdit(detail);
                  setDetail(null);
                }}
                style={{ padding: "8px 12px", borderRadius: 12, fontWeight: 900 }}
              >
                수정
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 사진 크게 보기 */}
      {photoOpen && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.85)",
            zIndex: 10000,
            padding: 16,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
          onClick={() => setPhotoOpen(null)}
        >
          <img src={photoOpen} alt="receipt-full" style={{ maxWidth: "100%", maxHeight: "100%", borderRadius: 14 }} />
        </div>
      )}
    </section>
  );
}

/** ✅ 최근기록 카드: div role=button (모바일 클릭 안정 + 중첩 버튼 문제 제거) */
function RecordCard({
  row,
  onOpenDetail,
  onEdit,
  getSignedUrl,
  onOpenPhoto,
}: {
  row: RecordRow;
  onOpenDetail: () => void;
  onEdit: () => void;
  getSignedUrl: (p: string) => Promise<string | null>;
  onOpenPhoto: (url: string) => void;
}) {
  const receipts = (row.receipt_urls ?? []) as string[];
  return (
<div
  role="button"
  tabIndex={0}
  onClick={() => {
    alert("카드 클릭");
    onOpenDetail();
  }}
  onKeyDown={(e) => {
    if (e.key === "Enter" || e.key === " ") onOpenDetail();
  }}
  style={{
    border: "1px solid #dedede",
    borderRadius: 12,
    padding: 12,
    background: "white",
    cursor: "pointer",
    userSelect: "none",
  }}
  title="클릭해서 상세보기"
>     
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
        <div style={{ fontWeight: 900 }}>
          {row.date} · {catLabel(row.category ?? "other")} ·{" "}
          {row.odometer != null ? `${Number(row.odometer).toLocaleString()} mi` : "—"}
        </div>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onEdit();
          }}
          style={{
            border: "1px solid #e5e5e5",
            borderRadius: 10,
            padding: "8px 10px",
            fontWeight: 900,
            background: "#fff",
          }}
        >
          수정
        </button>
      </div>

      <div style={{ marginTop: 6, opacity: 0.9 }}>
        <b>{fmtMoney(Number(row.cost ?? 0))}</b>
        {row.vendor ? <span> · {row.vendor}</span> : null}
        {receipts.length > 0 ? <span> · 📷 {receipts.length}장</span> : null}
      </div>

      {row.notes ? <div style={{ marginTop: 6, whiteSpace: "pre-wrap" }}>{row.notes}</div> : null}

      {/* 첫 장 썸네일 */}
      {receipts.length > 0 && (
        <div style={{ marginTop: 10, display: "flex", gap: 10, alignItems: "center" }}>
          <ReceiptThumb path={receipts[0]} getSignedUrl={getSignedUrl} onOpen={onOpenPhoto} />
          <div style={{ fontSize: 12, opacity: 0.7 }}>사진 클릭하면 크게 보입니다</div>
        </div>
      )}
    </div>
  );
}

function ReceiptThumb({
  path,
  getSignedUrl,
  onOpen,
}: {
  path: string;
  getSignedUrl: (p: string) => Promise<string | null>;
  onOpen: (url: string) => void;
}) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      const u = await getSignedUrl(path);
      if (alive) setUrl(u);
    })();
    return () => {
      alive = false;
    };
  }, [path, getSignedUrl]);

  if (!url) {
    return <div style={{ width: 64, height: 64, border: "1px solid #eee", borderRadius: 10 }} />;
  }

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={(e) => {
        e.stopPropagation();
        onOpen(url);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.stopPropagation();
          onOpen(url);
        }
      }}
      style={{
        width: 64,
        height: 64,
        borderRadius: 10,
        overflow: "hidden",
        border: "1px solid #eee",
        cursor: "pointer",
        userSelect: "none",
        background: "#fff",
      }}
      title="클릭해서 크게 보기"
    >
      <img
        src={url}
        alt="receipt"
        style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
      />
    </div>
  );
}
