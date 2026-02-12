"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";

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
