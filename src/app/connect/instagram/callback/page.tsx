"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { CheckCircle, XCircle, Loader2 } from "lucide-react";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

function InstagramCallbackInner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [username, setUsername] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    const code = searchParams.get("code");
    const state = searchParams.get("state");
    const errParam = searchParams.get("error");

    if (errParam) {
      setError("Instagram authorization was cancelled or denied.");
      setStatus("error");
      return;
    }

    if (!code || !state) {
      setError("Missing OAuth parameters.");
      setStatus("error");
      return;
    }

    const token = localStorage.getItem("sc_token");
    fetch(`${API}/api/socials/instagram/callback?code=${encodeURIComponent(code)}&state=${encodeURIComponent(state)}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.ok) {
          setUsername(data.username || "instagram_user");
          setStatus("success");
          setTimeout(() => router.push("/dashboard/socials"), 2500);
        } else {
          throw new Error(data.detail || "Connection failed");
        }
      })
      .catch((e: unknown) => {
        setError((e as Error).message || "Failed to connect Instagram");
        setStatus("error");
      });
  }, [searchParams, router]);

  return (
    <div className="bg-[#0a0a0a] border border-white/8 rounded-2xl p-10 max-w-sm w-full text-center space-y-6">
      {status === "loading" && (
        <>
          <Loader2 className="w-12 h-12 text-white/40 mx-auto animate-spin" />
          <div>
            <h2 className="text-white font-semibold text-lg">Connecting Instagram</h2>
            <p className="text-white/40 text-sm mt-1">Verifying your account…</p>
          </div>
        </>
      )}
      {status === "success" && (
        <>
          <CheckCircle className="w-12 h-12 text-green-400 mx-auto" />
          <div>
            <h2 className="text-white font-semibold text-lg">Instagram Connected!</h2>
            <p className="text-white/40 text-sm mt-1">Signed in as <span className="text-white/70 font-medium">@{username}</span></p>
            <p className="text-white/30 text-xs mt-3">Redirecting to dashboard…</p>
          </div>
        </>
      )}
      {status === "error" && (
        <>
          <XCircle className="w-12 h-12 text-red-400 mx-auto" />
          <div>
            <h2 className="text-white font-semibold text-lg">Connection Failed</h2>
            <p className="text-white/40 text-sm mt-1">{error}</p>
          </div>
          <button
            onClick={() => router.push("/dashboard/socials")}
            className="px-6 py-2 bg-white/8 hover:bg-white/12 text-white text-sm rounded-lg transition-colors"
          >
            Back to Dashboard
          </button>
        </>
      )}
    </div>
  );
}

export default function InstagramCallbackPage() {
  return (
    <div className="min-h-screen bg-black flex items-center justify-center p-4">
      <Suspense fallback={
        <div className="bg-[#0a0a0a] border border-white/8 rounded-2xl p-10 max-w-sm w-full text-center">
          <Loader2 className="w-12 h-12 text-white/40 mx-auto animate-spin" />
        </div>
      }>
        <InstagramCallbackInner />
      </Suspense>
    </div>
  );
}
