import type { MonthCount } from "@/lib/dashboard/summary";
import { cn } from "@/lib/utils";

// Three series in a fixed order, validated for colour-vision deficiency in both modes
// (dataviz checks). The table beside the chart carries the same numbers as text.
const SERIES: { key: keyof Pick<MonthCount, "complaint" | "sar" | "other">; label: string; fill: string; swatch: string }[] = [
  { key: "complaint", label: "Complaints", fill: "fill-[#2a78d6] dark:fill-[#3987e5]", swatch: "bg-[#2a78d6] dark:bg-[#3987e5]" },
  { key: "sar", label: "SARs", fill: "fill-[#eb6834] dark:fill-[#d95926]", swatch: "bg-[#eb6834] dark:bg-[#d95926]" },
  { key: "other", label: "Other requests", fill: "fill-[#1baf7a] dark:fill-[#199e70]", swatch: "bg-[#1baf7a] dark:bg-[#199e70]" },
];

/** Cases received per month for the last six months, as grouped bars. */
export function MonthlyChart({ months }: { months: MonthCount[] }) {
  const maxV = Math.max(1, ...months.map((m) => Math.max(m.complaint, m.sar, m.other)));
  const step = maxV <= 4 ? 1 : Math.ceil(maxV / 4);
  const top = Math.ceil(maxV / step) * step;
  const W = 640, H = 220, L = 34, B = 28, T = 10;
  const cw = (W - L - 8) / months.length;
  const bw = Math.min(18, (cw - 16) / 3);
  const y = (v: number) => T + (H - T - B) * (1 - v / top);
  const gridLines: number[] = [];
  for (let v = 0; v <= top; v += step) gridLines.push(v);
  const empty = months.every((m) => m.complaint + m.sar + m.other === 0);

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_16rem]">
      <div>
        <ul className="mb-2 flex flex-wrap gap-4 text-xs text-muted-foreground" aria-label="Series">
          {SERIES.map((s) => (
            <li key={s.key} className="inline-flex items-center gap-1.5">
              <span className={cn("size-2.5 rounded-sm", s.swatch)} aria-hidden="true" />
              {s.label}
            </li>
          ))}
        </ul>
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Cases received per month by type; the same numbers are in the table beside the chart" className="h-auto w-full">
          {gridLines.map((v) => (
            <g key={v}>
              <line x1={L} x2={W - 8} y1={y(v)} y2={y(v)} className="stroke-border" strokeWidth={1} />
              <text x={L - 8} y={y(v) + 4} textAnchor="end" className="fill-muted-foreground text-[11px] tabular-nums">
                {v}
              </text>
            </g>
          ))}
          {months.map((m, i) => {
            const x0 = L + i * cw + (cw - bw * 3 - 4) / 2;
            return (
              <g key={m.month}>
                {SERIES.map((s, j) => {
                  const v = m[s.key];
                  if (v === 0) return null;
                  const h = y(0) - y(v);
                  return (
                    <rect key={s.key} x={x0 + j * (bw + 2)} y={y(v)} width={bw} height={h} rx={Math.min(3, h / 2)} className={s.fill}>
                      <title>{`${m.label}: ${v} ${s.label.toLowerCase()}`}</title>
                    </rect>
                  );
                })}
                <text x={L + i * cw + cw / 2} y={H - 8} textAnchor="middle" className="fill-muted-foreground text-[11px]">
                  {m.label}
                </text>
              </g>
            );
          })}
        </svg>
        {empty && <p className="mt-2 text-sm text-muted-foreground">No cases received in the last six months.</p>}
      </div>
      <table className="w-full self-start text-sm">
        <caption className="sr-only">Cases received per month by type</caption>
        <thead className="text-left text-xs text-muted-foreground">
          <tr>
            <th scope="col" className="py-1 font-medium">Month</th>
            {SERIES.map((s) => (
              <th key={s.key} scope="col" className="py-1 text-right font-medium">{s.label === "Other requests" ? "Other" : s.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {months.map((m) => (
            <tr key={m.month} className="border-t border-border">
              <th scope="row" className="py-1 font-normal">{m.label}</th>
              <td className="py-1 text-right tabular-nums">{m.complaint}</td>
              <td className="py-1 text-right tabular-nums">{m.sar}</td>
              <td className="py-1 text-right tabular-nums">{m.other}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
