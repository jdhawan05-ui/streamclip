"use client";

import { useEffect, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import {
  Radio,
  Scissors,
  TrendingUp,
  Share2,
  Activity,
  ArrowRight,
  Zap,
  Eye,
  Clock,
} from "lucide-react";
import Link from "next/link";
import { api, createWebSocket, type Stream, type Clip, type Stats, type WSEvent } from "@/lib/api";
import { cn, timeAgo, formatViewers, formatDuration, hypoScoreColor, PLATFORM_ICONS } from "@/lib/utils";
import HypeMeter, { HypeRing } from "@/components/HypeMeter";
import { auth } from "@/lib/utils";

// ── Stat card ──────────────────────────────────────────────────────────────

function StatCard({
  label,
  value,
  icon: Icon,
  accent,
  sub,
}: {
  label: string;
  value: number | string;
  icon: React.ElementType;
  accent: string;
  sub?: string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-[#0a0a0a] border border-white/5 rounded-xl p-5 space-y-3"
    >
      <div className="flex items-center justify-between">
        <span className="text-xs text-white/30 font-medium uppercase tracking-wider">{label}</span>
        <div className={cn("w-7 h-7 rounded-lg flex items-center justify-center", accent)}>
          <Icon className="w-3.5 h-3.5 text-white" />
        </div>
      </div>
      <div>
        <p className="text-3xl font-bold text-white tabular-nums">{value}</p>
        {sub && <p className="text-xs text-white/30 mt-0.5">{sub}</p>}
      </div>
    </motion.div>
  );
}

// ── Live stream card ───────────────────────────────────────────────────────

function LiveStreamCard({ stream, score }: { stream: Stream; score: number }) {
  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.97 }}
      animate={{ opacity: 1, scale: 1 }}
      className="bg-[#0a0a0a] border border-white/5 rounded-xl p-4 space-y-3"
    >
      <div className="flex items-start gap-3">
        {stream.avatar_url ? (
          <img src={stream.avatar_url} alt="" className="w-10 h-10 rounded-full object-cover shrink-0" />
        ) : (
          <div className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center shrink-0">
            <span className="text-lg">{PLATFORM_ICONS[stream.platform] || "📺"}</span>
          </div>
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-white truncate">
              {stream.display_name || stream.channel_name}
            </span>
            {stream.is_live && (
              <span className="flex items-center gap-1 px-1.5 py-0.5 bg-red-500/15 border border-red-500/25 rounded text-[10px] font-bold text-red-400 uppercase tracking-wide shrink-0">
                <span className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse" />
                LIVE
              </span>
            )}
          </div>
          <p className="text-xs text-white/30 truncate mt-0.5">
            {stream.stream_title || `${stream.platform} • ${stream.channel_name}`}
          </p>
        </div>
        <HypeRing score={score} size={48} />
      </div>

      <HypeMeter score={score} size="sm" showLabel={false} />

      <div className="flex items-center justify-between text-xs text-white/25">
        {stream.viewer_count != null && (
          <span className="flex items-center gap-1">
            <Eye className="w-3 h-3" /> {formatViewers(stream.viewer_count)}
          </span>
        )}
        <span className="flex items-center gap-1">
          <Clock className="w-3 h-3" />
          {stream.last_checked_at ? timeAgo(stream.last_checked_at) : "—"}
        </span>
      </div>
    </motion.div>
  );
}

// ── Recent clip row ────────────────────────────────────────────────────────

function ClipRow({ clip }: { clip: Clip }) {
  const statusColors: Record<string, string> = {
    posted: "text-green-400 bg-green-500/10",
    posting: "text-orange-400 bg-orange-500/10",
    ready: "text-teal-400 bg-teal-500/10",
    processing: "text-purple-400 bg-purple-500/10",
    recording: "text-blue-400 bg-blue-500/10",
    failed: "text-red-400 bg-red-500/10",
    pending: "text-white/25 bg-white/5",
  };

  return (
    <div className="flex items-center gap-3 py-3 border-b border-white/4 last:border-0">
      <div className="w-8 h-8 rounded-lg bg-white/4 flex items-center justify-center shrink-0 text-sm">
        {PLATFORM_ICONS[clip.platform as keyof typeof PLATFORM_ICONS] || "📺"}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm text-white/80 truncate">{clip.channel_name}</p>
        <p className="text-xs text-white/25 truncate">{clip.trigger_reason || clip.stream_title || "Hype clip"}</p>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {clip.hype_score != null && (
          <span className={cn("font-mono text-xs font-bold", hypoScoreColor(clip.hype_score))}>
            {clip.hype_score.toFixed(1)}
          </span>
        )}
        {clip.duration != null && (
          <span className="text-xs text-white/20">{formatDuration(clip.duration)}</span>
        )}
        <span className={cn("text-[10px] font-medium px-1.5 py-0.5 rounded-md", statusColors[clip.status] || "text-white/20 bg-white/5")}>
          {clip.status}
        </span>
      </div>
    </div>
  );
}

// ── Activity feed item ─────────────────────────────────────────────────────

interface FeedItem {
  id: string;
  type: "hype" | "clip" | "posted" | "failed" | "live";
  message: string;
  sub?: string;
  time: Date;
}

function FeedRow({ item }: { item: FeedItem }) {
  const icons = {
    hype: <Zap className="w-3.5 h-3.5 text-orange-400" />,
    clip: <Scissors className="w-3.5 h-3.5 text-teal-400" />,
    posted: <TrendingUp className="w-3.5 h-3.5 text-green-400" />,
    failed: <Activity className="w-3.5 h-3.5 text-red-400" />,
    live: <Radio className="w-3.5 h-3.5 text-red-400" />,
  };

  const bgs = {
    hype: "bg-orange-500/10 border-orange-500/15",
    clip: "bg-teal-500/10 border-teal-500/15",
    posted: "bg-green-500/10 border-green-500/15",
    failed: "bg-red-500/10 border-red-500/15",
    live: "bg-red-500/10 border-red-500/15",
  };

  return (
    <motion.div
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      className="flex items-start gap-3 py-2.5 border-b border-white/4 last:border-0"
    >
      <div className={cn("w-6 h-6 rounded-md border flex items-center justify-center shrink-0 mt-0.5", bgs[item.type])}>
        {icons[item.type]}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm text-white/70">{item.message}</p>
        {item.sub && <p className="text-xs text-white/25 truncate">{item.sub}</p>}
      </div>
      <span className="text-[10px] text-white/20 shrink-0 mt-1 tabular-nums">
        {item.time.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
      </span>
    </motion.div>
  );
}

// ── Main dashboard ─────────────────────────────────────────────────────────

export default function DashboardPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [streams, setStreams] = useState<Stream[]>([]);
  const [clips, setClips] = useState<Clip[]>([]);
  const [liveScores, setLiveScores] = useState<Record<string, number>>({});
  const [feed, setFeed] = useState<FeedItem[]>([]);

  const user = typeof window !== "undefined" ? auth.get() : null;

  const pushFeed = useCallback((item: Omit<FeedItem, "id" | "time">) => {
    setFeed((prev) => [{ ...item, id: Math.random().toString(36).slice(2), time: new Date() }, ...prev].slice(0, 30));
  }, []);

  const loadData = useCallback(async () => {
    try {
      const [s, st, cl] = await Promise.all([api.stats(), api.streams.list(), api.clips.list()]);
      setStats(s);
      setStreams(st);
      setClips(cl.slice(0, 10));
    } catch {
      // silent
    }
  }, []);

  useEffect(() => {
    loadData();
    const t = setInterval(loadData, 30_000);

    const ws = createWebSocket((ev: WSEvent) => {
      if (ev.event === "pong") return;

      if (ev.event === "hype_detected") {
        const channel = ev.data.channel_name as string;
        const score = ev.data.hype_score as number;
        const streamId = ev.data.stream_id as string;
        setLiveScores((prev) => ({ ...prev, [streamId]: score }));
        toast.warning(`🔥 Hype detected on ${channel}!`, {
          description: `Score: ${score?.toFixed(1)}/10 — clipping now…`,
          duration: 5000,
        });
        pushFeed({ type: "hype", message: `Hype detected on ${channel}`, sub: `Score ${score?.toFixed(1)}/10` });
      }

      if (ev.event === "clip_ready") {
        const channel = ev.data.channel_name as string;
        toast.success(`✂️ Clip ready from ${channel}`, { duration: 4000 });
        pushFeed({ type: "clip", message: `New clip saved from ${channel}` });
        loadData();
      }

      if (ev.event === "clip_posted") {
        const platform = ev.data.platform as string;
        const channel = ev.data.channel_name as string;
        toast.success(`🚀 Posted to ${platform}!`, {
          description: `${channel}'s clip is now live on ${platform}`,
          duration: 5000,
        });
        pushFeed({ type: "posted", message: `Clip posted to ${platform}`, sub: channel });
        loadData();
      }

      if (ev.event === "clip_failed") {
        const platform = ev.data.platform as string;
        toast.error(`Failed to post to ${platform}`, { duration: 5000 });
        pushFeed({ type: "failed", message: `Failed to post to ${platform}`, sub: ev.data.error as string });
      }

      if (ev.event === "stream_status") {
        const channel = ev.data.channel_name as string;
        const isLive = ev.data.is_live as boolean;
        pushFeed({
          type: "live",
          message: isLive ? `${channel} went live` : `${channel} ended stream`,
        });
        loadData();
      }
    });

    return () => {
      clearInterval(t);
      ws?.close();
    };
  }, [loadData, pushFeed]);

  const liveStreams = streams.filter((s) => s.is_live);
  const pendingStreams = streams.filter((s) => !s.is_live && s.active);

  return (
    <div className="p-6 max-w-[1400px] mx-auto space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">
            {user ? `Good to see you, ${user.username} 👋` : "Overview"}
          </h1>
          <p className="text-sm text-white/30 mt-0.5">Real-time stream monitoring & auto-posting</p>
        </div>
        <Link
          href="/dashboard/streams"
          className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-500 text-white text-sm font-semibold rounded-lg transition-colors"
        >
          <Radio className="w-3.5 h-3.5" /> Add Stream
        </Link>
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <StatCard
            label="Monitored"
            value={stats.streams}
            icon={Radio}
            accent="bg-blue-500/20"
            sub={`${stats.live_streams} live now`}
          />
          <StatCard
            label="Clips"
            value={stats.total_clips}
            icon={Scissors}
            accent="bg-purple-500/20"
            sub={`${stats.processing_clips} processing`}
          />
          <StatCard
            label="Posted"
            value={stats.posted_clips}
            icon={TrendingUp}
            accent="bg-green-500/20"
            sub={`${stats.failed_clips} failed`}
          />
          <StatCard
            label="Socials"
            value={stats.connected_socials}
            icon={Share2}
            accent="bg-orange-500/20"
            sub="connected accounts"
          />
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Live streams column */}
        <div className="xl:col-span-2 space-y-4">
          {/* LIVE */}
          {liveStreams.length > 0 && (
            <section className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                  <h2 className="text-sm font-semibold text-white">Live Now</h2>
                  <span className="text-xs text-white/30">({liveStreams.length})</span>
                </div>
                <Link href="/dashboard/streams" className="text-xs text-white/30 hover:text-white/60 flex items-center gap-1 transition-colors">
                  Manage <ArrowRight className="w-3 h-3" />
                </Link>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <AnimatePresence>
                  {liveStreams.map((s) => (
                    <LiveStreamCard
                      key={s.id}
                      stream={s}
                      score={liveScores[s.id] ?? s.hype_score ?? 0}
                    />
                  ))}
                </AnimatePresence>
              </div>
            </section>
          )}

          {/* Monitoring (not live) */}
          {pendingStreams.length > 0 && (
            <section className="space-y-3">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-white/20" />
                <h2 className="text-sm font-semibold text-white">Monitoring</h2>
                <span className="text-xs text-white/30">({pendingStreams.length} waiting)</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {pendingStreams.map((s) => (
                  <div key={s.id} className="bg-[#0a0a0a] border border-white/5 rounded-xl p-4 flex items-center gap-3 opacity-50">
                    {s.avatar_url ? (
                      <img src={s.avatar_url} alt="" className="w-8 h-8 rounded-full object-cover shrink-0" />
                    ) : (
                      <div className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center shrink-0 text-sm">
                        {PLATFORM_ICONS[s.platform] || "📺"}
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-white/60 truncate">{s.display_name || s.channel_name}</p>
                      <p className="text-xs text-white/25">Waiting for stream…</p>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Empty state */}
          {streams.length === 0 && (
            <div className="border border-dashed border-white/8 rounded-xl p-12 text-center space-y-4">
              <div className="w-12 h-12 rounded-2xl bg-white/4 flex items-center justify-center mx-auto">
                <Radio className="w-6 h-6 text-white/20" />
              </div>
              <div>
                <p className="text-white/50 font-medium">No streams monitored yet</p>
                <p className="text-white/25 text-sm mt-1">Add a Twitch or YouTube Live channel to get started</p>
              </div>
              <Link
                href="/dashboard/streams"
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-red-600 hover:bg-red-500 text-white text-sm font-semibold rounded-lg transition-colors"
              >
                <Radio className="w-3.5 h-3.5" /> Add Your First Stream
              </Link>
            </div>
          )}

          {/* Recent Clips */}
          {clips.length > 0 && (
            <section className="space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-white">Recent Clips</h2>
                <Link href="/dashboard/clips" className="text-xs text-white/30 hover:text-white/60 flex items-center gap-1 transition-colors">
                  View all <ArrowRight className="w-3 h-3" />
                </Link>
              </div>
              <div className="bg-[#0a0a0a] border border-white/5 rounded-xl px-4 divide-y divide-white/4">
                {clips.map((c) => <ClipRow key={c.id} clip={c} />)}
              </div>
            </section>
          )}
        </div>

        {/* Activity feed */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-white">Live Activity</h2>
            <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" title="Real-time" />
          </div>

          <div className="bg-[#0a0a0a] border border-white/5 rounded-xl px-4">
            <AnimatePresence>
              {feed.length > 0 ? (
                feed.slice(0, 15).map((item) => <FeedRow key={item.id} item={item} />)
              ) : (
                <div className="py-12 text-center space-y-2">
                  <Activity className="w-8 h-8 text-white/10 mx-auto" />
                  <p className="text-xs text-white/20">Events will appear here in real time</p>
                </div>
              )}
            </AnimatePresence>
          </div>

          {/* Quick links */}
          <div className="space-y-2">
            <Link
              href="/dashboard/socials"
              className="flex items-center gap-3 p-3 bg-[#0a0a0a] border border-white/5 rounded-xl hover:bg-white/3 transition-colors group"
            >
              <div className="w-8 h-8 rounded-lg bg-orange-500/15 flex items-center justify-center">
                <Share2 className="w-4 h-4 text-orange-400" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium text-white/70 group-hover:text-white transition-colors">Connect Socials</p>
                <p className="text-xs text-white/25">TikTok, Instagram & YouTube</p>
              </div>
              <ArrowRight className="w-3.5 h-3.5 text-white/20 group-hover:text-white/50 transition-colors" />
            </Link>

            <Link
              href="/dashboard/settings"
              className="flex items-center gap-3 p-3 bg-[#0a0a0a] border border-white/5 rounded-xl hover:bg-white/3 transition-colors group"
            >
              <div className="w-8 h-8 rounded-lg bg-purple-500/15 flex items-center justify-center">
                <Zap className="w-4 h-4 text-purple-400" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium text-white/70 group-hover:text-white transition-colors">Hype Settings</p>
                <p className="text-xs text-white/25">Tune detection thresholds</p>
              </div>
              <ArrowRight className="w-3.5 h-3.5 text-white/20 group-hover:text-white/50 transition-colors" />
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
