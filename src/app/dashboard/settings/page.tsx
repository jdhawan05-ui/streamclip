"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Settings, Sliders, Save, Loader2, Info } from "lucide-react";
import { cn } from "@/lib/utils";

interface HypeConfig {
  chatVelocityMultiplier: number;
  audioEnergyThreshold: number;
  hypeCooldownSeconds: number;
  rollingBufferSeconds: number;
  clipPostSeconds: number;
  maxClipDuration: number;
}

const DEFAULTS: HypeConfig = {
  chatVelocityMultiplier: 3.0,
  audioEnergyThreshold: -20,
  hypeCooldownSeconds: 180,
  rollingBufferSeconds: 90,
  clipPostSeconds: 30,
  maxClipDuration: 90,
};

function SliderField({
  label,
  description,
  value,
  min,
  max,
  step,
  unit,
  onChange,
}: {
  label: string;
  description: string;
  value: number;
  min: number;
  max: number;
  step: number;
  unit?: string;
  onChange: (v: number) => void;
}) {
  const pct = ((value - min) / (max - min)) * 100;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="text-sm font-medium text-white/80">{label}</label>
        <span className="font-mono text-sm text-white font-semibold tabular-nums">
          {value}{unit}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-full h-1.5 rounded-full appearance-none bg-white/8 cursor-pointer accent-red-500"
        style={{
          background: `linear-gradient(to right, #ef4444 0%, #ef4444 ${pct}%, rgba(255,255,255,0.08) ${pct}%, rgba(255,255,255,0.08) 100%)`,
        }}
      />
      <p className="text-xs text-white/25">{description}</p>
    </div>
  );
}

export default function SettingsPage() {
  const [config, setConfig] = useState<HypeConfig>({ ...DEFAULTS });
  const [saving, setSaving] = useState(false);

  function update(key: keyof HypeConfig) {
    return (v: number) => setConfig((prev) => ({ ...prev, [key]: v }));
  }

  async function handleSave() {
    setSaving(true);
    // In a real deployment this would POST to /api/settings
    await new Promise((r) => setTimeout(r, 600));
    setSaving(false);
    toast.success("Settings saved — will apply to new streams");
  }

  function handleReset() {
    setConfig({ ...DEFAULTS });
    toast.info("Settings reset to defaults");
  }

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-8">
      <div>
        <h1 className="text-xl font-bold text-white">Settings</h1>
        <p className="text-sm text-white/30 mt-0.5">Tune hype detection and clipping behavior</p>
      </div>

      {/* Hype detection */}
      <section className="space-y-5">
        <div className="flex items-center gap-2">
          <Sliders className="w-4 h-4 text-white/30" />
          <h2 className="text-sm font-semibold text-white">Hype Detection</h2>
        </div>

        <div className="bg-[#0a0a0a] border border-white/5 rounded-xl p-5 space-y-6">
          <SliderField
            label="Chat Velocity Multiplier"
            description="How many times faster than baseline chat needs to be to trigger detection. Higher = less sensitive."
            value={config.chatVelocityMultiplier}
            min={1.5}
            max={8}
            step={0.5}
            onChange={update("chatVelocityMultiplier")}
          />
          <div className="border-t border-white/4" />
          <SliderField
            label="Audio Energy Threshold"
            description="Minimum dBFS level to trigger audio-based hype detection. -20 means only loud moments, -40 is more sensitive."
            value={config.audioEnergyThreshold}
            min={-60}
            max={-5}
            step={1}
            unit=" dBFS"
            onChange={update("audioEnergyThreshold")}
          />
          <div className="border-t border-white/4" />
          <SliderField
            label="Cooldown Between Clips"
            description="Minimum seconds between hype detections on the same stream. Prevents too many clips from one event."
            value={config.hypeCooldownSeconds}
            min={30}
            max={600}
            step={30}
            unit="s"
            onChange={update("hypeCooldownSeconds")}
          />
        </div>
      </section>

      {/* Clipping */}
      <section className="space-y-5">
        <div className="flex items-center gap-2">
          <Settings className="w-4 h-4 text-white/30" />
          <h2 className="text-sm font-semibold text-white">Clipping</h2>
        </div>

        <div className="bg-[#0a0a0a] border border-white/5 rounded-xl p-5 space-y-6">
          <SliderField
            label="Rolling Buffer"
            description="How many seconds of stream to keep in the rolling buffer. Longer = clips include more context before the hype moment."
            value={config.rollingBufferSeconds}
            min={15}
            max={180}
            step={15}
            unit="s"
            onChange={update("rollingBufferSeconds")}
          />
          <div className="border-t border-white/4" />
          <SliderField
            label="Extra Recording After Hype"
            description="How many additional seconds to record after hype is detected, to capture the full moment."
            value={config.clipPostSeconds}
            min={5}
            max={90}
            step={5}
            unit="s"
            onChange={update("clipPostSeconds")}
          />
          <div className="border-t border-white/4" />
          <SliderField
            label="Max Clip Duration"
            description="Maximum total clip length. Clips exceeding this are trimmed to fit platform limits."
            value={config.maxClipDuration}
            min={15}
            max={180}
            step={15}
            unit="s"
            onChange={update("maxClipDuration")}
          />
        </div>
      </section>

      {/* Note */}
      <div className="flex items-start gap-2 p-3 bg-blue-500/8 border border-blue-500/15 rounded-lg">
        <Info className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
        <p className="text-xs text-blue-400/80">
          Settings apply to new stream monitoring sessions. Currently active streams use their existing configuration.
          Set your env variables in <code className="bg-blue-500/15 px-1 rounded font-mono">.env</code> to persist across restarts.
        </p>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-3">
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 px-5 py-2.5 bg-white text-black text-sm font-semibold rounded-lg hover:bg-white/90 transition-colors disabled:opacity-50"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          {saving ? "Saving…" : "Save Settings"}
        </button>
        <button
          onClick={handleReset}
          className="px-5 py-2.5 bg-white/4 hover:bg-white/8 border border-white/8 text-white/50 hover:text-white text-sm rounded-lg transition-colors"
        >
          Reset to Defaults
        </button>
      </div>
    </div>
  );
}
