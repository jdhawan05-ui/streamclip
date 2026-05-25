import Link from "next/link";

export default function Home() {
  return (
    <div className="min-h-screen bg-black text-white overflow-hidden">
      {/* Nav */}
      <nav className="flex items-center justify-between px-8 py-5 border-b border-white/10 relative z-10">
        <span className="text-xl font-bold tracking-tight flex items-center gap-2">
          <span className="text-red-500">●</span> stream<span className="text-red-400">clipper</span>
        </span>
        <div className="flex gap-3">
          <Link href="/login" className="px-4 py-2 text-white/60 hover:text-white text-sm transition-colors">Sign in</Link>
          <Link href="/signup" className="px-4 py-2 bg-red-600 hover:bg-red-500 rounded-lg text-sm font-medium transition-colors">Get started free</Link>
        </div>
      </nav>

      {/* Glow */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-red-600/10 blur-[120px] rounded-full pointer-events-none" />

      {/* Hero */}
      <section className="relative z-10 flex flex-col items-center text-center px-6 pt-24 pb-20">
        <div className="inline-flex items-center gap-2 bg-red-900/30 border border-red-500/30 rounded-full px-4 py-1.5 text-red-300 text-sm mb-8">
          <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
          Real-time — clips post while you&apos;re still live
        </div>
        <h1 className="text-5xl sm:text-7xl font-extrabold tracking-tight leading-tight max-w-4xl">
          Go viral{" "}
          <span className="bg-gradient-to-r from-red-400 to-pink-400 bg-clip-text text-transparent">
            while you&apos;re still streaming
          </span>
        </h1>
        <p className="mt-6 text-lg text-white/60 max-w-2xl leading-relaxed">
          StreamClip monitors Twitch and YouTube Live in real time. When chat goes crazy
          or audio energy spikes, AI clips the moment and posts it to TikTok, Instagram Reels,
          and YouTube Shorts — automatically — before the stream even ends.
        </p>
        <div className="mt-10 flex flex-col sm:flex-row gap-4">
          <Link href="/signup" className="px-8 py-4 bg-red-600 hover:bg-red-500 rounded-xl text-lg font-semibold transition-colors shadow-xl shadow-red-900/40">
            Start clipping for free →
          </Link>
          <Link href="/login" className="px-8 py-4 border border-white/20 hover:border-white/40 rounded-xl text-lg font-semibold text-white/70 hover:text-white transition-colors">
            Sign in
          </Link>
        </div>
      </section>

      {/* Live stats bar */}
      <section className="relative z-10 border-y border-white/10 py-8 bg-white/[0.02]">
        <div className="max-w-5xl mx-auto grid grid-cols-4 gap-6 text-center px-6">
          {[
            { v: "< 90s", l: "From hype spike to posted clip" },
            { v: "Twitch + YT", l: "Platforms monitored" },
            { v: "Chat + Audio", l: "Dual hype detection" },
            { v: "3 socials", l: "TikTok · Instagram · Shorts" },
          ].map((s) => (
            <div key={s.v}>
              <div className="text-xl font-bold text-red-400">{s.v}</div>
              <div className="text-xs text-white/40 mt-1">{s.l}</div>
            </div>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section className="relative z-10 max-w-5xl mx-auto px-6 py-24">
        <h2 className="text-3xl font-bold text-center mb-16">How it works</h2>
        <div className="grid sm:grid-cols-4 gap-6">
          {[
            { n:"01", icon:"📺", t:"Add your stream", d:"Paste a Twitch or YouTube channel. StreamClip starts watching immediately." },
            { n:"02", icon:"🔗", t:"Connect socials", d:"One-click connect TikTok, Instagram, and YouTube. We post on your behalf." },
            { n:"03", icon:"⚡", t:"Hype detected", d:"Chat goes crazy + audio spikes = AI trigger. Both signals combined for accuracy." },
            { n:"04", icon:"🚀", t:"Clip auto-posts", d:"90-second buffer captured, encoded vertical 9:16, posted to all socials instantly." },
          ].map((item) => (
            <div key={item.n} className="relative bg-white/[0.03] border border-white/10 rounded-2xl p-5">
              <div className="text-3xl mb-3">{item.icon}</div>
              <div className="text-xs font-mono text-red-400 mb-1">{item.n}</div>
              <div className="font-semibold text-sm mb-2">{item.t}</div>
              <div className="text-white/40 text-xs leading-relaxed">{item.d}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Feature grid */}
      <section className="relative z-10 max-w-5xl mx-auto px-6 pb-24">
        <div className="grid sm:grid-cols-3 gap-4">
          {[
            { icon:"💬", t:"Chat velocity detection", d:"Tracks messages/second in real time. A spike 3× above baseline = hype trigger." },
            { icon:"🔊", t:"Audio energy analysis", d:"FFmpeg measures dBFS every 5 seconds. Sudden loudness = crowd going wild." },
            { icon:"📼", t:"90-second rolling buffer", d:"Always recording the last 90 seconds. Never miss the moment before the spike." },
            { icon:"📐", t:"9:16 vertical encoding", d:"Every clip is re-encoded to vertical format for TikTok, Reels, and Shorts." },
            { icon:"⏱️", t:"3-minute cooldown", d:"Smart cooldown prevents clip spam — only the best moments get posted." },
            { icon:"📡", t:"Real-time dashboard", d:"Watch hype scores rise live. See clips appear the moment they're captured." },
          ].map((f) => (
            <div key={f.t} className="flex gap-4 bg-white/[0.03] border border-white/10 rounded-xl p-5">
              <div className="text-2xl">{f.icon}</div>
              <div>
                <div className="font-semibold text-sm mb-1">{f.t}</div>
                <div className="text-white/40 text-xs">{f.d}</div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="relative z-10 border-t border-white/10 py-20 text-center px-6">
        <h2 className="text-3xl font-bold mb-4">Your next viral clip is happening right now</h2>
        <p className="text-white/40 mb-8 max-w-md mx-auto">Connect your stream once. StreamClip runs 24/7 and clips every hype moment automatically.</p>
        <Link href="/signup" className="inline-flex px-10 py-4 bg-red-600 hover:bg-red-500 rounded-xl text-lg font-semibold transition-colors shadow-xl shadow-red-900/40">
          Create free account →
        </Link>
      </section>

      <footer className="border-t border-white/10 py-6 text-center text-white/20 text-sm">
        StreamClip © {new Date().getFullYear()}
      </footer>
    </div>
  );
}
