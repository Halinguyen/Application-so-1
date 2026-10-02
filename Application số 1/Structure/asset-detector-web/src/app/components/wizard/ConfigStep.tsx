"use client";

import type { CloneParam } from "./types";

export default function ConfigStep({
  params,
  values,
  onChange,
}: {
  params: CloneParam[];
  values: Record<string, string>;
  onChange: (envKey: string, value: string) => void;
}) {
  const byBlock = params.reduce<Record<string, CloneParam[]>>((acc, p) => {
    (acc[p.blockLabel] ??= []).push(p);
    return acc;
  }, {});

  if (params.length === 0) {
    return (
      <div className="hint">Game này không có bảng xếp hạng hay nút bấm cần cấu hình thêm — bấm Tiếp tục.</div>
    );
  }

  return (
    <div className="cards">
      {Object.entries(byBlock).map(([blockLabel, blockParams]) => (
        <div className="card" key={blockLabel}>
          <h3>{blockLabel}</h3>
          <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 10 }}>
            {blockParams.map((p) => (
              <label key={p.envKey} style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12.5 }}>
                <span>
                  {p.name}
                  {p.required ? " *" : ""}
                </span>
                {p.options ? (
                  <select value={values[p.envKey] ?? ""} onChange={(e) => onChange(p.envKey, e.target.value)}>
                    <option value="">—</option>
                    {p.options.map((o) => (
                      <option key={o} value={o}>
                        {o}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    type="text"
                    value={values[p.envKey] ?? ""}
                    onChange={(e) => onChange(p.envKey, e.target.value)}
                    placeholder={p.defaultValue || p.name}
                  />
                )}
              </label>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
