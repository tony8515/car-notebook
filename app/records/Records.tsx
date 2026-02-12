"use client";

import { useEffect, useMemo, useState } from "react";
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

function todayISO() {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
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
  const [odometer, setOdometer] = useState<number>(0);
  const [cost, setCost] = useState<number>(0);
  const [vendor, setVendor] = useState("");
  const [notes, setNotes] = useState("");
  const [files, setFiles] = useState<FileList | null>(null);
  const [msg, setMsg] = useState("");

  async function load() {
    const { data, error } = await supabase
      .from("records")
      .select("id,date,category,odometer,cost,vendor,notes,receipt_urls")
      .eq("user_id", userId)
      .eq("vehicle_id", vehicleId)
      .order("date", { ascending: false })
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

      // 비공개 버킷: path만 저장해두고, 화면에서 signed URL로 보여줍니다.
      uploaded.push(path);
    }
    return uploaded;
  }

  async function addRecord() {
    try {
      setMsg("");

      const { data, error } = await supabase
        .from("records")
        .insert({
          user_id: userId,
          vehicle_id: vehicleId,
          date,
          category,
          odometer,
          cost,
          vendor: vendor || null,
          notes: notes || null,
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

      setFiles(null);
      setMsg("저장했습니다.");
      await load();
    } catch (e: any) {
      setMsg(e.message || "오류가 발생했습니다.");
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
              type="number"
              value={odometer}
              onChange={(e) => setOdometer(Number(e.target.value))}
            />
          </label>

          <label>
            금액($){" "}
            <input
              type="number"
              step="0.01"
              value={cost}
              onChange={(e) => setCost(Number(e.target.value))}
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
              type="file"
              accept="image/*"
              multiple
              capture="environment"
              onChange={(e) => setFiles(e.target.files)}
            />
          </label>

          <button onClick={addRecord} style={{ padding: "10px 12px", borderRadius: 12 }}>
            저장
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
                {r.date} · {r.category} · {Number(r.odometer).toLocaleString()} mi
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

  if (!url) {
    return <div style={{ width: 90, height: 90, border: "1px solid #eee", borderRadius: 10 }} />;
  }

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
