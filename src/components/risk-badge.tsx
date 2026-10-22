import { cn } from "@/lib/utils";
import { riskLabel, type RiskLevel, type RiskCategory } from "@/lib/proctor-store";

const styles: Record<RiskLevel, string> = {
  green: "bg-success/15 text-success border-success/30 shadow-[0_0_12px_rgba(16,185,129,0.15)]",
  yellow: "bg-warning/15 text-warning border-warning/30 shadow-[0_0_12px_rgba(245,158,11,0.15)]",
  red: "bg-destructive/15 text-destructive border-destructive/30 shadow-[0_0_12px_rgba(239,68,68,0.2)]",
};

export function getCategoryFromScore(score: number): { level: RiskLevel; category: RiskCategory } {
  if (score >= 65) return { level: "red", category: "HIGH" };
  if (score >= 30) return { level: "yellow", category: "MEDIUM" };
  return { level: "green", category: "LOW" };
}

export function RiskBadge({
  level,
  score,
  className,
  size = "md",
}: {
  level: RiskLevel;
  score?: number;
  className?: string;
  size?: "sm" | "md" | "lg";
}) {
  const category = level === "red" ? "HIGH" : level === "yellow" ? "MEDIUM" : "LOW";

  const sizeClasses =
    size === "lg"
      ? "px-4 py-1.5 text-sm font-bold gap-2.5"
      : size === "sm"
        ? "px-2.5 py-0.5 text-[11px] font-semibold gap-1.5"
        : "px-3 py-1 text-xs font-semibold gap-2";

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border tracking-wide uppercase",
        sizeClasses,
        styles[level],
        className,
      )}
    >
      <span className="size-2 rounded-full bg-current animate-pulse" />
      <span className="font-extrabold">{category} RISK</span>
      {score !== undefined && <span className="tabular-nums font-mono opacity-90">({score}%)</span>}
    </span>
  );
}

/** Circular risk gauge used across student, faculty and admin dashboards. */
export function RiskGauge({ score, level }: { score: number; level: RiskLevel }) {
  const color =
    level === "red"
      ? "var(--destructive)"
      : level === "yellow"
        ? "var(--warning)"
        : "var(--success)";
  const category = level === "red" ? "HIGH" : level === "yellow" ? "MEDIUM" : "LOW";

  return (
    <div className="relative grid size-36 place-items-center">
      <div
        className="absolute inset-0 rounded-full transition-all duration-500"
        style={{
          background: `conic-gradient(${color} ${score * 3.6}deg, color-mix(in oklab, var(--muted-foreground) 18%, transparent) 0deg)`,
        }}
      />
      <div className="absolute inset-[10px] rounded-full bg-card shadow-inner" />
      <div className="relative text-center">
        <div className="font-display text-3xl font-extrabold tabular-nums tracking-tight">
          {score}%
        </div>
        <div
          className={`mt-0.5 inline-block rounded-full px-2 py-0.5 text-[10px] font-bold tracking-wider uppercase border ${
            level === "red"
              ? "border-destructive/40 bg-destructive/15 text-destructive"
              : level === "yellow"
                ? "border-warning/40 bg-warning/15 text-warning"
                : "border-success/40 bg-success/15 text-success"
          }`}
        >
          {category}
        </div>
      </div>
    </div>
  );
}
