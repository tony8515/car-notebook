"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";

type RecordRow = {
  id: string;
  date: string;
  category: string;
  odometer: number;
  cost: number;
  vendor: string | null;
  notes: string | null;
  receipt_urls: string[];
  inserted_at?: string; // 시간순 정렬용(있으면 사용)
};

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

// ✅ "0117428" 같은 앞 0 제거(빈칸/0/정상 입력 모두 처리)
function normalizeIntInput(s: string) {
  const digits = s.replace(/[^\d]/g, "");
  if (digits === "") return "";
  // 모두 0이면 "0"
  if (/^0+$/.test(digits)) return "0";
  // 앞쪽 0 제거
  return digits.replace(/^0+/, "");
}

// ✅ 금액: 숫자와 점(.)만 허용, 소수점 한 번만, 앞 0는 "0." 케이스만 유지
function normalizeMoneyInput(s: string) {
  let v = s.replace(/[^\d.]/g, "");
  if (v === "") return "";

  // 점이 여러 개면 첫 번째만 남김
  const parts = v.split(".");
  if (parts.length > 2) v = `${parts[0]}.${parts.slice(1).join("")}`;

  // 정수부 앞 0 처리
  const [intPartRaw, decPartRaw] = v.split(".");
  let intPart = intPartRaw ?? "";
  let decPart = decPartRaw ?? "";

  intPart = intPart.replace(/[^\d]/g, "");

  if (intPart === "") intPart = "0"; // ".25" 입력하면 "0.25"로
  if (/^0+$/.test(intPart)) intPart = "0";
  else intPart = intPart.replace(/^0+/, ""); // "023" -> "23"

  // 소수부는 숫자만, 길이는 최대 2자리로
  decPart = decPart.replace(/[^\d]/g, "").slice(0, 2);

  // 사용자가 점을 찍었는지 여부
  const hasDot = v.includes(".");

  return hasDot ? `${intPart}.${decPart}` : intPart;
}

export default function Records({
  userId,
  vehicleId,
  vehicleName,
}: {
  userId: string;
  vehicleId: string;
  vehicleName: string;
}) {
  const [rows, setRows] = useState<RecordRow[]>([]);
  const [date, setDate] = useState(todayISO());
  const [category, setCategory] = useState("fuel");

  // ✅ 초기값을 "0"이 아닌 빈칸으로 (0이 남아붙는 문제 해결)
  const [odometer, setOdometer] = useState<string>("");
  const [cost, setCost] = useState<string>("");

  const [vendor, setVendor] = useState("");
  const [notes, setNotes] = useState("");
  const [files, setFiles] = useState<FileList | null>(null);

  const [msg, setMsg] = useState("");
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false); // 중복 클릭 방지
  const [fileKey, setFileKey] = useState(0);

  async function load() {
    const { data, error } = await supabase
      .from("records")
      .select("id,date,category,odometer,cost,vendor,notes,receipt_urls,inserted_at")
      .eq("user_id", userId)
      .eq("vehicle_id", vehicleId)
      .order("date", { ascending: false })
      .order("inserted_at", { ascending: false }) // 같은 날짜는 저장시간으로
      .limit(200);

    if (!error) setRows((data as any) ?? []);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vehicleId]);

  const monthTotal = useMemo(() => {
    const ym = date.slice(0, 7);
    return rows
      .filter((r) => r.date.startsWith(ym))
      .reduce((sum, r) => sum + Number(r.cost || 0), 0);
  }, [rows, date]);

  async function uploadReceipts(recordId: string): Promise<string[]> {
    if (!files || files.length === 0) return [];
    const uploaded: string[] = [];

    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      const ext = (f.name.split(".").pop() || "jpg").toLowerCase();
      const safeExt = ["jpg", "jpeg", "png", "webp", "heic"].includes(ext) ? ext : "jpg";
      const path = `${userId}/${vehicleId}/${date}/${recordId}-${i}.${safeExt}`;

      const { error } = await supabase.storage.from("receipts").upload(path, f, {
        upsert: true,
        contentType: f.type || "image/jpeg",
      });
      if (error) throw error;

      uploaded.push(path);
    }
    return uploaded;
  }

  async function addRecord() {
    if (savingRef.current) return;
    savingRef.current = true;

    setSaving(true);
    setMsg("저장 중...");

    try {
      const odoNum = Number(odometer || 0);
      const costNum = Number(cost || 0);

      const { data, error } = await supabase
        .from("records")
        .insert({
          user_id: userId,
          vehicle_id: vehicleId,
          date,
          category,
          odometer: odoNum,
          cost: costNum,
          vendor: vendor.trim() ? vendor.trim() : null,
          notes: notes.trim() ? notes.trim() : null,
          receipt_urls: [],
        })
        .select("id")
        .single();

      if (error) throw error;

      const recordId = data.id as string;
      const receiptPaths = await uploadReceipts(recordId);

      if (receiptPaths.length > 0) {
        const { error: upErr } = await supabase
          .from("records")
          .update({ receipt_urls: receiptPaths })
          .eq("id", recordId)
          .eq("user_id", userId);

        if (upErr) throw upErr;
      }

      // ✅ 저장 후 폼 완전 초기화(빈칸)
      setCategory("fuel");
      setOdometer("");
      setCost("");
      setVendor("");
      setNotes("");
      setFiles(null);
      setFileKey((k) => k + 1);

      await load();
      setMsg("저장했습니다.");
      setTimeout(() => setMsg(""), 2000);
    } catch (e: any) {
      setMsg(e?.message || "오류가 발생했습니다.");
    } finally {
      setSaving(false);
      savingRef.current = false;
    }
  }

  async function signedUrl(path: string) {
    const { data, error } = await supabase.storage.from("receipts").createSignedUrl(path, 60 * 10);
    if (error) return null;
    return data.signedUrl;
  }

  return (
    <section style={{ marginTop: 18 }}>
      <h3 style={{ fontSize: 18, fontWeight: 700 }}>
        {vehicleName} 기록 (이번달 합계: ${monthTotal.toFixed(2)})
      </h3>

      <div style={{ marginTop: 10, padding: 12, border: "1px solid #e5e5e5", borderRadius: 12 }}>
        <div style={{ display: "grid", gap: 8 }}>
          <label>
            날짜{" "}
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </label>

          <label>
            종류{" "}
            <select value={category} onChange={(e) => setCategory(e.target.value)}>
              {categories.map((c) => (
                <option key={c.v} value={c.v}>
                  {c.label}
                </option>
              ))}
            </select>
          </label>

          <label>
            주행거리(마일){" "}
            <input
              type="text"
              inputMode="numeric"
              placeholder="예: 117428"
              value={odometer}
              onChange={(e) => setOdometer(normalizeIntInput(e.target.value))}
            />
          </label>

          <label>
            금액($){" "}
            <input
              type="text"
              inputMode="decimal"
              placeholder="예: 23.45"
              value={cost}
              onChange={(e) => setCost(normalizeMoneyInput(e.target.value))}
            />
          </label>

          <label>
            장소(주유소/정비소) <input value={vendor} onChange={(e) => setVendor(e.target.value)} />
          </label>

          <label>
            메모 <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
          </label>

          <label>
            영수증 사진(여러 장){" "}
            <input
              key={fileKey}
              type="file"
              accept="image/*"
              multiple
              capture="environment"
              onChange={(e) => setFiles(e.target.files)}
              disabled={saving}
            />
          </label>

          <button
            type="button"
            onClick={addRecord}
            disabled={saving}
            style={{
              padding: "10px 12px",
              borderRadius: 12,
              opacity: saving ? 0.6 : 1,
              cursor: saving ? "not-allowed" : "pointer",
            }}
          >
            {saving ? "저장 중..." : "저장"}
          </button>

          {msg && <div style={{ opacity: 0.85 }}>{msg}</div>}
        </div>
      </div>

      <div style={{ marginTop: 14 }}>
        <h4 style={{ fontWeight: 700 }}>최근 기록</h4>
        <div style={{ display: "grid", gap: 10, marginTop: 8 }}>
          {rows.map((r) => (
            <div key={r.id} style={{ border: "1px solid #eee", borderRadius: 12, padding: 12 }}>
              <div style={{ fontWeight: 700 }}>
                {r.date} · {catLabel(r.category)} · {Number(r.odometer).toLocaleString()} mi
              </div>
              <div style={{ opacity: 0.8 }}>
                ${Number(r.cost).toFixed(2)} {r.vendor ? `· ${r.vendor}` : ""}
              </div>

              {r.notes && <div style={{ marginTop: 6 }}>{r.notes}</div>}

              {r.receipt_urls?.length > 0 && (
                <div style={{ marginTop: 10, display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {r.receipt_urls.map((p) => (
                    <ReceiptThumb key={p} path={p} getSignedUrl={signedUrl} />
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function ReceiptThumb({
  path,
  getSignedUrl,
}: {
  path: string;
  getSignedUrl: (p: string) => Promise<string | null>;
}) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const u = await getSignedUrl(path);
      setUrl(u);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path]);

  if (!url)
    return <div style={{ width: 90, height: 90, border: "1px solid #eee", borderRadius: 10 }} />;

  return (
    <a href={url} target="_blank" rel="noreferrer">
      <img
        src={url}
        alt="receipt"
        style={{
          width: 90,
          height: 90,
          objectFit: "cover",
          borderRadius: 10,
          border: "1px solid #eee",
        }}
      />
    </a>
  );
}
