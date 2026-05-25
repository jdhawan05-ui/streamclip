"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import { Share2, Link2, Link2Off, Loader2, CheckCircle, ExternalLink } from "lucide-react";
import { api, type SocialAccount } from "@/lib/api";
import { cn, timeAgo } from "@/lib/utils";

const SOCIAL_META: Record<string, { label: string; icon: string; color: string; bg: string; border: string }> = {
  tiktok: { label: "TikTok", icon: "🎵", color: "text-pink-400", bg: "bg-pink-500/8", border: "border-pink-500/15" },
  instagram: { label: "Instagram", icon: "📸", color: "text-orange-400", bg: "bg-orange-500/8", border: "border-orange-500/15" },
  youtube: { label: "YouTube Shorts", icon: "🔴", color: "text-red-400", bg: "bg-red-500/8", border: "border-red-500/15" },
};

const AVAILABLE_PLATFORMS = ["tiktok", "instagram", "youtube"];

export default function SocialsPage() {
  const [accounts, setAccounts] = useState<SocialAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState<string | null>(null);
  const [disconnecting, setDisconnecting] = useState<string | null>(null);

  async function load() {
    try {
      const data = await api.socials.list();
      setAccounts(data);
    } catch (e: unknown) {
      toast.error((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function handleConnect(platform: string) {
    setConnecting(platform);
    try {
      if (platform === "tiktok") {
        const { url } = await api.socials.tiktokUrl();
        window.location.href = url;
      } else if (platform === "instagram") {
        const { url } = await api.socials.instagramUrl();
        window.location.href = url;
      } else {
        toast.info("YouTube OAuth coming soon! Use manual connect for now.");
      }
    } catch (e: unknown) {
      toast.error((e as Error).message);
      setConnecting(null);
    }
  }

  async function handleDisconnect(id: string, platform: string) {
    setDisconnecting(id);
    try {
      await api.socials.disconnect(id);
      setAccounts((prev) => prev.filter((a) => a.id !== id));
      toast.success(`${SOCIAL_META[platform]?.label || platform} disconnected`);
    } catch (e: unknown) {
      toast.error((e as Error).message);
    } finally {
      setDisconnecting(null);
    }
  }

  const connectedPlatforms = new Set(accounts.map((a) => a.platform));

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-8">
      <div>
        <h1 className="text-xl font-bold text-white">Social Accounts</h1>
        <p className="text-sm text-white/30 mt-0.5">
          Connect your socials — clips post automatically when hype is detected
        </p>
      </div>

      {loading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="w-6 h-6 text-white/20 animate-spin" />
        </div>
      ) : (
        <div className="space-y-3">
          {AVAILABLE_PLATFORMS.map((platform) => {
            const meta = SOCIAL_META[platform];
            const account = accounts.find((a) => a.platform === platform);
            const isConnected = !!account;
            const isConnecting = connecting === platform;
            const isDisconnecting = disconnecting === account?.id;

            return (
              <motion.div
                key={platform}
                layout
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className={cn(
                  "border rounded-xl p-5 flex items-center gap-4 transition-all",
                  isConnected
                    ? `${meta.bg} ${meta.border}`
                    : "bg-[#0a0a0a] border-white/5"
                )}
              >
                {/* Icon */}
                <div className={cn("w-12 h-12 rounded-xl flex items-center justify-center text-2xl shrink-0", isConnected ? meta.bg : "bg-white/4")}>
                  {meta.icon}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className={cn("font-semibold", isConnected ? meta.color : "text-white/70")}>
                      {meta.label}
                    </span>
                    {isConnected && (
                      <span className="flex items-center gap-1 text-xs text-green-400">
                        <CheckCircle className="w-3 h-3" /> Connected
                      </span>
                    )}
                  </div>
                  {account ? (
                    <div className="space-y-0.5 mt-0.5">
                      <p className="text-sm text-white/50">
                        @{account.username || account.platform_user_id}
                      </p>
                      <p className="text-xs text-white/20">
                        Connected {timeAgo(account.created_at)}
                      </p>
                    </div>
                  ) : (
                    <p className="text-sm text-white/25 mt-0.5">
                      Not connected · clips won&apos;t post here
                    </p>
                  )}
                </div>

                {/* Action */}
                {isConnected ? (
                  <button
                    onClick={() => handleDisconnect(account.id, platform)}
                    disabled={isDisconnecting}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-white/4 hover:bg-red-500/12 border border-white/8 hover:border-red-500/20 text-white/40 hover:text-red-400 text-xs rounded-lg transition-all disabled:opacity-40"
                  >
                    {isDisconnecting
                      ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      : <Link2Off className="w-3.5 h-3.5" />
                    }
                    Disconnect
                  </button>
                ) : (
                  <button
                    onClick={() => handleConnect(platform)}
                    disabled={isConnecting}
                    className={cn(
                      "flex items-center gap-1.5 px-4 py-1.5 text-sm font-medium rounded-lg transition-all disabled:opacity-40",
                      platform === "youtube"
                        ? "bg-white/4 border border-white/8 text-white/40 hover:text-white/60 hover:bg-white/6"
                        : `bg-white text-black hover:bg-white/90`
                    )}
                  >
                    {isConnecting
                      ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      : <Link2 className="w-3.5 h-3.5" />
                    }
                    {isConnecting ? "Redirecting…" : "Connect"}
                    {!isConnecting && <ExternalLink className="w-3 h-3 opacity-50" />}
                  </button>
                )}
              </motion.div>
            );
          })}
        </div>
      )}

      {/* How it works */}
      <div className="bg-[#0a0a0a] border border-white/5 rounded-xl p-5 space-y-3">
        <h2 className="text-sm font-semibold text-white">How auto-posting works</h2>
        <div className="space-y-2 text-sm text-white/40">
          <div className="flex items-start gap-2">
            <span className="text-white/20 shrink-0">1.</span>
            StreamClip monitors your live streams for hype moments
          </div>
          <div className="flex items-start gap-2">
            <span className="text-white/20 shrink-0">2.</span>
            When chat velocity or audio energy spikes, a clip is captured
          </div>
          <div className="flex items-start gap-2">
            <span className="text-white/20 shrink-0">3.</span>
            The clip is reformatted to 9:16 vertical video
          </div>
          <div className="flex items-start gap-2">
            <span className="text-white/20 shrink-0">4.</span>
            It&apos;s automatically posted to all your connected accounts — while you&apos;re still live
          </div>
        </div>
      </div>
    </div>
  );
}
