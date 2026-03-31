"use client";

import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import ManpowerTable from "@/app/components/ManpowerTable";

function TableContent() {
  const searchParams = useSearchParams();
  const start = searchParams.get("start") || "";
  const end = searchParams.get("end") || "";

  const weekString = start && end ? `start=${start}&end=${end}` : "";

  return (
    <div>
      <h1 className="sr-only">Manpower Planning</h1>
      {weekString ? (
        <ManpowerTable week={weekString} />
      ) : (
        <p className="p-8">No week selected. Please go back and pick a week.</p>
      )}
    </div>
  );
}

export default function TablePage() {
  return (
    <Suspense fallback={<div className="p-8">Loading...</div>}>
      <TableContent />
    </Suspense>
  );
}
