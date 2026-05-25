"use client";

import { useEffect, useRef } from "react";
import { motion, useSpring, useTransform } from "framer-motion";
import { cn } from "@/lib/utils";

interface HypeMeterProps {
  score: number; // 0-10
  size?: "sm" | "md" | "lg";
  showLabel?: boolean;
  animated?: boolean;
}

function getHypeColor(score: number) {
  if (score >= 8) return { bar: "from-red-500 to-orange-400", glow: "shadow-red-500/50", text: "text-red-400", label: "INSANE" };
  if (score >= 6) return { bar: "from-orange-500 to-yellow-400", glow: "shadow-orange-500/40", text: "text-orange-400", label: "HIGH" };
  if (score >= 4) return { bar: "from-yellow-500 to-yellow-300", glow: "shadow-yellow-500/30", text: "text-yellow-400", label: "MEDIUM" };
  if (score >= 2) return { bar: "from-teal-500 to-cyan-400", glow: "shadow-teal-500/20", text: "text-teal-400", label: "LOW" };
  return { bar: "from-white/10 to-white/5", glow: "", text: "text-white/20", label: "IDLE" };
}

export default function HypeMeter({ score, size = "md", showLabel = true, animated = true }: HypeMeterProps) {
  const pct = Math.min(100, Math.max(0, (score / 10) * 100));
  const colors = getHypeColor(score);
  const spring = useSpring(pct, { stiffness: 60, damping: 20 });

  useEffect(() => {
    spring.set(pct);
  }, [pct, spring]);

  const width = useTransform(spring, (v) => `${v}%`);

  const heights = { sm: "h-1", md: "h-1.5", lg: "h-2" };
  const textSizes = { sm: "text-xs", md: "text-sm", lg: "text-base" };

  return (
    <div className="w-full space-y-1">
      {showLabel && (
        <div className="flex items-center justify-between">
          <span className={cn("font-mono font-bold tabular-nums", textSizes[size], colors.text)}>
            {score.toFixed(1)}
            <span className="text-white/20 font-normal">/10</span>
          </span>
          <span className={cn("text-[10px] font-bold tracking-widest uppercase", colors.text)}>
            {colors.label}
          </span>
        </div>
      )}
      <div className={cn("w-full bg-white/5 rounded-full overflow-hidden", heights[size])}>
        {animated ? (
          <motion.div
            className={cn("h-full rounded-full bg-gradient-to-r shadow-lg", colors.bar, colors.glow)}
            style={{ width }}
          />
        ) : (
          <div
            className={cn("h-full rounded-full bg-gradient-to-r", colors.bar)}
            style={{ width: `${pct}%` }}
          />
        )}
      </div>
    </div>
  );
}

// Circular variant for the dashboard cards
export function HypeRing({ score, size = 56 }: { score: number; size?: number }) {
  const colors = getHypeColor(score);
  const pct = Math.min(100, Math.max(0, score / 10));
  const r = (size - 6) / 2;
  const circumference = 2 * Math.PI * r;
  const spring = useSpring(pct, { stiffness: 40, damping: 18 });
  const dash = useTransform(spring, (v) => `${v * circumference} ${circumference}`);

  useEffect(() => { spring.set(pct); }, [pct, spring]);

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2} cy={size / 2} r={r}
          fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth={4}
        />
        <motion.circle
          cx={size / 2} cy={size / 2} r={r}
          fill="none" strokeWidth={4}
          strokeLinecap="round"
          className={cn("transition-all")}
          style={{
            stroke: score >= 8 ? "#f87171" : score >= 6 ? "#fb923c" : score >= 4 ? "#facc15" : score >= 2 ? "#2dd4bf" : "rgba(255,255,255,0.1)",
            strokeDasharray: dash as unknown as string,
          }}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className={cn("font-mono font-bold text-[11px]", colors.text)}>
          {score.toFixed(0)}
        </span>
      </div>
    </div>
  );
}
