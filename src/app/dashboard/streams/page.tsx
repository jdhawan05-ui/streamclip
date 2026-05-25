"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import { Radio, Plus, Pause, Play, Trash2, Eye, Users, Loader2 } from "lucide-react";
import { api, createWebSocket, type Stream, type WSEvent } from "@/lib/api";
import { cn, timeAgo, formatViewers, PLATFORM_ICONS } from "@/lib/utils";
import HypeMeter from "@/components/HypeMeter";

const PLATFORMS = [
  { value: "twitch", label: "Twitch", color: "text-purple-400", bg: "bg-purple-500/10 border-purple-500/20" },
  { value: "youtube", label: "YouTube Live", color: "text-red-400", bg: "bg-red-500/10 border-red-500/20" },
];

export default function StreamsPage() {
  const [streams, setStreams] = useState<Stream[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [platform, setPlatform] = useState("twitch");
  const [channel, setChannel] = useState("");
  const [liveScores, setLiveScores] = useState<Record<string, number>>({});

  async function load() {
    try {
      const data = await api.streams.list();
      setStreams(data);
    } catch (e: unknown) {
      toast.error((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    const ws = createWebSocket((ev: WSEvent) => {
      if (ev.event === "hype_detected") {
        const streamId = ev.data.stream_id as string;
        const score = ev.data.hype_score as number;
        setLiveScores((prev) => ({ ...prev, [streamId]: score }));
      }
      if (ev.event === "stream_status" || ev.event === "clip_ready") {
        load();
      }
    });
    return () => ws?.close();
  }, []);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!channel.trim()) return;
    setAdding(true);
    try {
      const s = await api.streams.add(platform, channel.trim());
      setStreams((prev) => [s, ...prev]);
      setChannel("");
      setShowForm(false);
      toast.success(`Now monitoring ${s.display_name || s.channel_name}`);
    } catch (e: unknown) {
      toast.error((e as Error).message);
    } finally {
      setAdding(false);
    }
  }

  async function handleToggle(id: string) {
    try {
      const r = await api.streams.toggle(id);
      setStreams((prev) => prev.map((s) => s.id === id ? { ...s, active: r.active } : s));
      toast.success(r.active ? "Stream monitoring resumed" : "Stream monitoring paused");
    } catch (e: unknown) {
      toast.error((e as Error).message);
    }
  }

  async function handleRemove(id: string, name: string) {
    try {
      await api.streams.remove(id);
      setStreams((prev) => prev.filter((s) => s.id !== id));
      toast.success(`Removed ${name}`);
    } catch (e: unknown) {
      toast.error((e as Error).message);
    }
  }

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">Live Streams</h1>
          <p className="text-sm text-white/30 mt-0.5">Monitor Twitch and YouTube channels in real time</p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-500 text-white text-sm font-semibold rounded-lg transition-colors"
        >
          <Plus className="w-4 h-4" /> Add Stream
        </button>
      </div>

      {/* Add form */}
      <AnimatePresence>
        {showForm && (
          <motion.form
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            onSubmit={handleAdd}
            className="bg-[#0a0a0a] border border-white/8 rounded-xl p-5 space-y-4 overflow-hidden"
          >
            <h2 className="text-sm font-semibold text-white">Add a stream to monitor</h2>
            <div className="flex gap-2">
              {PLATFORMS.map((p) => (
                <button
                  key={p.value}
                  type="button"
                  onClick={() => setPlatform(p.value)}
                  className={cn(
                    "flex-1 py-2 px-3 rounded-lg border text-sm font-medium transition-all",
                    platform === p.value ? `${p.bg} ${p.color}` : "border-white/8 text-white/30 hover:border-white/20 hover:text-white/60"
                  )}
                >
                  {PLATFORM_ICONS[p.value as keyof typeof PLATFORM_ICONS]} {p.label}
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              <input
                value={channel}
                onChange={(e) => setChannel(e.target.value)}
                placeholder={platform === "twitch" ? "xqc, shroud, ninja…" : "channel name or @handle"}
                className="flex-1 bg-white/4 border border-white/8 rounded-lg px-3 py-2 text-sm text-white placeholder-white/20 outline-none focus:border-white/20 transition-colors"
                autoFocus
              />
              <button
                type="submit"
                disabled={adding || !channel.trim()}
                className="px-4 py-2 bg-white text-black text-sm font-semibold rounded-lg disabled:opacity-40 hover:bg-white/90 transition-colors flex items-center gap-2"
              >
                {adding ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                {adding ? "Adding…" : "Add"}
              </button>
            </div>
          </motion.form>
        )}
      </AnimatePresence>

      {/* Streams list */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-6 h-6 text-white/20 animate-spin" />
        </div>
      ) : streams.length === 0 ? (
        <div className="border border-dashed border-white/8 rounded-xl p-16 text-center space-y-4">
          <div className="w-14 h-14 rounded-2xl bg-white/4 flex items-center justify-center mx-auto">
            <Radio className="w-7 h-7 text-white/15" />
          </div>
          <div>
            <p className="text-white/50 font-medium">No streams yet</p>
            <p className="text-white/25 text-sm mt-1">Add a Twitch or YouTube channel to start monitoring</p>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <AnimatePresence>
            {streams.map((stream) => {
              const score = liveScores[stream.id] ?? stream.hype_score ?? 0;
              return (
                <motion.div
                  key={stream.id}
                  layout
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  className={cn(
                    "bg-[#0a0a0a] border rounded-xl p-4 space-y-4 transition-all",
                    stream.is_live ? "border-red-500/20" : "border-white/5",
                    !stream.active && "opacity-50"
                  )}
                >
                  <div className="flex items-center gap-3">
                    {/* Avatar */}
                    {stream.avatar_url ? (
                      <img src={stream.avatar_url} alt="" className="w-12 h-12 rounded-full object-cover shrink-0" />
                    ) : (
                      <div className="w-12 h-12 rounded-full bg-white/5 flex items-center justify-center shrink-0 text-xl">
                        {PLATFORM_ICONS[stream.platform] || "📺"}
                      </div>
                    )}

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-white">{stream.display_name || stream.channel_name}</span>
                        {stream.is_live ? (
                          <span className="flex items-center gap-1 px-1.5 py-0.5 bg-red-500/15 border border-red-500/25 rounded text-[10px] font-bold text-red-400 uppercase tracking-wide">
                            <span className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse" />
                            LIVE
                          </span>
                        ) : (
                          <span className="px-1.5 py-0.5 bg-white/5 rounded text-[10px] text-white/25 uppercase tracking-wide">
                            Offline
                          </span>
                        )}
                        {!stream.active && (
                          <span className="px-1.5 py-0.5 bg-yellow-500/10 border border-yellow-500/20 rounded text-[10px] text-yellow-400 uppercase tracking-wide">
                            Paused
                          </span>
                        )}
                      </div>
                      {stream.stream_title && (
                        <p className="text-sm text-white/35 truncate mt-0.5">{stream.stream_title}</p>
                      )}
                      <div className="flex items-center gap-3 mt-1 text-xs text-white/25">
                        <span className="capitalize">{stream.platform}</span>
                        {stream.viewer_count != null && stream.is_live && (
                          <span className="flex items-center gap-1">
                            <Eye className="w-3 h-3" /> {formatViewers(stream.viewer_count)}
                          </span>
                        )}
                        {stream.last_checked_at && (
                          <span>checked {timeAgo(stream.last_checked_at)}</span>
                        )}
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        onClick={() => handleToggle(stream.id)}
                        className="w-8 h-8 rounded-lg bg-white/4 hover:bg-white/8 flex items-center justify-center transition-colors text-white/40 hover:text-white"
                        title={stream.active ? "Pause monitoring" : "Resume monitoring"}
                      >
                        {stream.active ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                      </button>
                      <button
                        onClick={() => handleRemove(stream.id, stream.display_name || stream.channel_name)}
                        className="w-8 h-8 rounded-lg bg-white/4 hover:bg-red-500/15 flex items-center justify-center transition-colors text-white/40 hover:text-red-400"
                        title="Remove stream"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Hype meter — only when live */}
                  {stream.is_live && stream.active && (
                    <div className="pt-2 border-t border-white/4">
                      <HypeMeter score={score} size="sm" />
                    </div>
                  )}
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}
