import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function timeAgo(dateStr: string): string {
  const d = new Date(dateStr);
  const s = Math.floor((Date.now() - d.getTime()) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function formatViewers(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toString();
}

export const PLATFORM_COLORS = {
  twitch: "text-purple-400 bg-purple-400/10 border-purple-400/20",
  youtube: "text-red-400 bg-red-400/10 border-red-400/20",
  tiktok: "text-pink-400 bg-pink-400/10 border-pink-400/20",
  instagram: "text-orange-400 bg-orange-400/10 border-orange-400/20",
};

export const PLATFORM_ICONS = {
  twitch: "🟣",
  youtube: "🔴",
  tiktok: "🎵",
  instagram: "📸",
};

export const STATUS_COLORS: Record<string, string> = {
  pending: "bg-gray-500/20 text-gray-400",
  recording: "bg-blue-500/20 text-blue-400",
  processing: "bg-purple-500/20 text-purple-400",
  ready: "bg-teal-500/20 text-teal-400",
  posting: "bg-orange-500/20 text-orange-400",
  posted: "bg-green-500/20 text-green-400",
  failed: "bg-red-500/20 text-red-400",
};

export function hypoScoreColor(score: number): string {
  if (score >= 8) return "text-red-400";
  if (score >= 6) return "text-orange-400";
  if (score >= 4) return "text-yellow-400";
  return "text-gray-400";
}

// Auth helpers
export const auth = {
  save: (token: string, userId: string, username: string, email: string) => {
    localStorage.setItem("sc_token", token);
    localStorage.setItem("sc_user", JSON.stringify({ userId, username, email }));
  },
  get: (): { userId: string; username: string; email: string } | null => {
    const u = localStorage.getItem("sc_user");
    return u ? JSON.parse(u) : null;
  },
  logout: () => {
    localStorage.removeItem("sc_token");
    localStorage.removeItem("sc_user");
  },
  isLoggedIn: (): boolean => !!localStorage.getItem("sc_token"),
};
