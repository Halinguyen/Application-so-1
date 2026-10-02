"use client";

import { useRouter, usePathname } from "next/navigation";

export default function GameSwitcher({
  gameId,
  games,
  labels,
}: {
  gameId: string;
  games: string[];
  labels?: Record<string, string>;
}) {
  const router = useRouter();
  const pathname = usePathname();

  return (
    <select
      className="mono"
      value={gameId}
      onChange={(e) => router.push(`${pathname}?game=${e.target.value}`)}
      style={{
        background: "var(--surface)",
        color: "var(--accent)",
        border: "1px solid var(--border)",
        borderRadius: 6,
        padding: "4px 8px",
        fontSize: 12.5,
      }}
    >
      {games.map((g) => (
        <option key={g} value={g}>
          {labels?.[g] ?? g}
        </option>
      ))}
    </select>
  );
}
