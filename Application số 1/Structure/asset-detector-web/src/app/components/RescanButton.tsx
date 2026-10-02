"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function RescanButton({ gameId }: { gameId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function rescan() {
    setLoading(true);
    try {
      await fetch(`/api/detect?game=${gameId}&refresh=1`, { cache: "no-store" });
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <button className="rescan-btn" onClick={rescan} disabled={loading}>
      {loading ? "Scanning…" : "Re-scan"}
    </button>
  );
}
