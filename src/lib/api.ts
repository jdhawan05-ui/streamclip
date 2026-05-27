const API = process.env.NEXT_PUBLIC_API_URL || "";

function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("sc_token");
}

export async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const token = getToken();
  const res = await fetch(`${API}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options?.headers,
    },
    ...options,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || "API error");
  }
  return res.json();
}

// ── Types ──────────────────────────────────────────────────────────────────

export type AuthUser = {
  access_token: string;
  user_id: string;
  username: string;
  email: string;
};

export type Stream = {
  id: string;
  platform: "twitch" | "youtube";
  channel_name: string;
  display_name: string | null;
  avatar_url: string | null;
  active: boolean;
  is_live: boolean;
  stream_title: string | null;
  viewer_count: number | null;
  hype_score: number;
  last_checked_at: string | null;
  created_at: string;
};

export type Clip = {
  id: string;
  stream_id: string;
  platform: string;
  channel_name: string;
  stream_title: string | null;
  hype_score: number | null;
  chat_velocity: number | null;
  audio_energy: number | null;
  trigger_reason: string | null;
  duration: number | null;
  status: string;
  error_message: string | null;
  created_at: string;
};

export type SocialAccount = {
  id: string;
  platform: string;
  username: string | null;
  platform_user_id: string;
  active: boolean;
  created_at: string;
};

export type Stats = {
  streams: number;
  live_streams: number;
  total_clips: number;
  posted_clips: number;
  failed_clips: number;
  processing_clips: number;
  total_posts: number;
  connected_socials: number;
};

export type WSEvent = {
  event: "hype_detected" | "clip_ready" | "clip_posted" | "clip_failed" | "stream_status" | "pong";
  data: Record<string, unknown>;
};

// ── API ────────────────────────────────────────────────────────────────────

export const api = {
  auth: {
    register: (email: string, username: string, password: string) =>
      apiFetch<AuthUser>("/api/auth/register", { method: "POST", body: JSON.stringify({ email, username, password }) }),
    login: (email: string, password: string) =>
      apiFetch<AuthUser>("/api/auth/login", { method: "POST", body: JSON.stringify({ email, password }) }),
  },
  stats: () => apiFetch<Stats>("/api/stats"),
  streams: {
    list: () => apiFetch<Stream[]>("/api/streams"),
    add: (platform: string, channel: string) =>
      apiFetch<Stream>("/api/streams", { method: "POST", body: JSON.stringify({ platform, channel }) }),
    remove: (id: string) => apiFetch<{ ok: boolean }>(`/api/streams/${id}`, { method: "DELETE" }),
    toggle: (id: string) => apiFetch<{ ok: boolean; active: boolean }>(`/api/streams/${id}/toggle`, { method: "POST" }),
  },
  clips: {
    list: (stream_id?: string) => apiFetch<Clip[]>(`/api/clips${stream_id ? `?stream_id=${stream_id}` : ""}`),
    downloadUrl: (id: string) => `${API}/api/clips/${id}/download`,
    repost: (id: string) => apiFetch<{ ok: boolean }>(`/api/clips/${id}/repost`, { method: "POST" }),
    delete: (id: string) => apiFetch<{ ok: boolean }>(`/api/clips/${id}`, { method: "DELETE" }),
  },
  socials: {
    list: () => apiFetch<SocialAccount[]>("/api/socials"),
    tiktokUrl: () => apiFetch<{ url: string }>("/api/socials/tiktok/authorize"),
    instagramUrl: () => apiFetch<{ url: string }>("/api/socials/instagram/authorize"),
    disconnect: (id: string) => apiFetch<{ ok: boolean }>(`/api/socials/${id}`, { method: "DELETE" }),
  },
};

// ── WebSocket ──────────────────────────────────────────────────────────────

export function createWebSocket(onMessage: (e: WSEvent) => void): WebSocket | null {
  const token = getToken();
  if (!token || typeof window === "undefined") return null;
  const wsBase = API.replace("http://", "ws://").replace("https://", "wss://");
  const ws = new WebSocket(`${wsBase}/ws?token=${token}`);
  ws.onmessage = (e) => {
    try {
      onMessage(JSON.parse(e.data));
    } catch {}
  };
  // Keep alive
  const ping = setInterval(() => {
    if (ws.readyState === WebSocket.OPEN) ws.send("ping");
  }, 25_000);
  ws.onclose = () => clearInterval(ping);
  return ws;
}
