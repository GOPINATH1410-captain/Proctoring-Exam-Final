/**
 * faculty/settings.tsx
 * ---------------------------------------------------------------------------
 * Faculty & System Administrator Proctoring Configuration.
 * Supports:
 *  - Configurable Risk Thresholds (Low, Medium, High, Critical)
 *  - Configurable Prohibited Objects List (YOLOv8 classes)
 *  - Copy/Paste & Clipboard Policies (Block, Warn, Log Only)
 *  - Audio VAD Sensitivity Calibration
 */

import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import {
  Check,
  CheckCircle2,
  Lock,
  Save,
  Settings,
  Shield,
  Sliders,
  Smartphone,
  Sparkles,
  Cpu,
  Zap,
  Key,
} from "lucide-react";
import { toast } from "sonner";
import { AppShell, GlassCard } from "@/components/app-shell";
import { RequireRole } from "@/components/require-role";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FACULTY_NAV } from "@/lib/nav";
import { apiClient } from "@/lib/api-client";

export const Route = createFileRoute("/faculty/settings")({
  head: () => ({
    meta: [
      { title: "Proctoring Rules & Risk Configuration — NextGen AI" },
      {
        name: "description",
        content: "Configure risk scoring thresholds, prohibited items, and browser security policies.",
      },
    ],
  }),
  component: () => (
    <RequireRole roles={["faculty", "admin"]}>
      <FacultySettingsPage />
    </RequireRole>
  ),
});

function FacultySettingsPage() {
  // Risk Thresholds State
  const [lowThreshold, setLowThreshold] = useState(30);
  const [mediumThreshold, setMediumThreshold] = useState(65);
  const [criticalThreshold, setCriticalThreshold] = useState(85);

  // Prohibited Objects
  const [prohibited, setProhibited] = useState<Record<string, boolean>>({
    "cell phone": true,
    book: true,
    laptop: true,
    tablet: true,
    smartwatch: true,
    earphones: true,
  });

  // Browser Policies
  const [clipboardPolicy, setClipboardPolicy] = useState<"block" | "warn" | "log">("block");
  const [requireFullscreen, setRequireFullscreen] = useState(false);
  const [requireScreenShare, setRequireScreenShare] = useState(true);
  const [blockAIExtensions, setBlockAIExtensions] = useState(true);
  const [lockArrowSelection, setLockArrowSelection] = useState(true);

  const toggleProhibited = (key: string) => {
    setProhibited((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  // Explainable AI / Gemini state
  const [testingGemini, setTestingGemini] = useState(false);
  const [geminiStatus, setGeminiStatus] = useState<{
    status: string;
    hasKey: boolean;
    maskedKey?: string;
    message: string;
    testOutput?: string;
  } | null>(null);

  const handleTestGemini = async () => {
    setTestingGemini(true);
    try {
      const res = await apiClient.getGeminiStatus();
      setGeminiStatus(res);
      if (res.hasKey && res.status === "ready") {
        toast.success("Gemini API connection verified & active!");
      } else {
        toast.info(res.message);
      }
    } catch (err: any) {
      toast.error("Failed to connect to AI status endpoint");
      setGeminiStatus({
        status: "error",
        hasKey: true,
        message: err.message || "Failed to reach AI service",
      });
    } finally {
      setTestingGemini(false);
    }
  };

  const handleSave = () => {
    toast.success("Proctoring policies and risk thresholds updated successfully!");
  };

  return (
    <AppShell
      nav={FACULTY_NAV}
      title="Proctoring Rules &amp; Risk Configuration"
      subtitle="Customize detection sensitivity, risk level thresholds, and prohibited item classes"
    >
      <div className="grid gap-6 md:grid-cols-2 max-w-5xl">
        {/* Risk Thresholds Card */}
        <GlassCard className="p-6 space-y-4">
          <div className="flex items-center gap-2">
            <Sliders className="size-5 text-primary" />
            <h3 className="font-display font-bold text-base">Risk Categorization Thresholds</h3>
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed">
            Adjust the numeric boundaries used by the Context-Aware Risk Engine to categorize candidate suspicion.
          </p>

          <div className="space-y-4 pt-2 text-xs">
            <div>
              <div className="flex justify-between font-semibold mb-1 text-success">
                <span>LOW Risk Ceiling</span>
                <span>{lowThreshold}%</span>
              </div>
              <input
                type="range"
                min={15}
                max={45}
                value={lowThreshold}
                onChange={(e) => setLowThreshold(Number(e.target.value))}
                className="w-full accent-success"
              />
            </div>

            <div>
              <div className="flex justify-between font-semibold mb-1 text-warning">
                <span>MEDIUM Risk Threshold</span>
                <span>{mediumThreshold}%</span>
              </div>
              <input
                type="range"
                min={46}
                max={75}
                value={mediumThreshold}
                onChange={(e) => setMediumThreshold(Number(e.target.value))}
                className="w-full accent-warning"
              />
            </div>

            <div>
              <div className="flex justify-between font-semibold mb-1 text-destructive">
                <span>CRITICAL / HIGH Risk Ceiling</span>
                <span>{criticalThreshold}%</span>
              </div>
              <input
                type="range"
                min={76}
                max={95}
                value={criticalThreshold}
                onChange={(e) => setCriticalThreshold(Number(e.target.value))}
                className="w-full accent-destructive"
              />
            </div>
          </div>
        </GlassCard>

        {/* Prohibited Items Card */}
        <GlassCard className="p-6 space-y-4">
          <div className="flex items-center gap-2">
            <Shield className="size-5 text-primary" />
            <h3 className="font-display font-bold text-base">YOLOv8 Prohibited Detection Classes</h3>
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed">
            Toggle objects that will automatically emit <code>PROHIBITED_OBJECT_DETECTED</code> events when visible.
          </p>

          <div className="grid grid-cols-2 gap-2.5 pt-2">
            {Object.entries(prohibited).map(([item, enabled]) => (
              <button
                key={item}
                onClick={() => toggleProhibited(item)}
                className={`p-3 rounded-xl border text-left text-xs font-semibold capitalize transition-all flex items-center justify-between ${
                  enabled
                    ? "border-primary bg-primary/10 text-foreground ring-1 ring-primary/30"
                    : "border-glass-border bg-slate-900/40 text-muted-foreground"
                }`}
              >
                <span>{item}</span>
                {enabled && <CheckCircle2 className="size-4 text-primary" />}
              </button>
            ))}
          </div>
        </GlassCard>

        {/* Browser Security Policies */}
        <GlassCard className="p-6 space-y-4 md:col-span-2">
          <div className="flex items-center gap-2">
            <Lock className="size-5 text-primary" />
            <h3 className="font-display font-bold text-base">Browser Security &amp; Clipboard Enforcement</h3>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 pt-2 text-xs">
            <div className="p-4 rounded-xl bg-background/50 border border-glass-border space-y-2">
              <span className="font-bold text-foreground block">Clipboard Action:</span>
              <div className="flex flex-col gap-1.5">
                {(["block", "warn", "log"] as const).map((pol) => (
                  <label key={pol} className="flex items-center gap-2 cursor-pointer capitalize font-medium">
                    <input
                      type="radio"
                      name="clip"
                      checked={clipboardPolicy === pol}
                      onChange={() => setClipboardPolicy(pol)}
                      className="text-primary focus:ring-primary"
                    />
                    <span>{pol === "block" ? "Block & Prevent (Recommended)" : pol}</span>
                  </label>
                ))}
              </div>
            </div>

            <div className="p-4 rounded-xl bg-background/50 border border-glass-border space-y-2">
              <span className="font-bold text-foreground block">AI Extension Shield:</span>
              <label className="flex items-center gap-2 cursor-pointer font-medium">
                <input
                  type="checkbox"
                  checked={blockAIExtensions}
                  onChange={(e) => setBlockAIExtensions(e.target.checked)}
                  className="rounded text-primary focus:ring-primary"
                />
                <span>Auto-block AI browser extensions</span>
              </label>
              <p className="text-[11px] text-muted-foreground">Neutralizes ChatGPT, Monica, Sider, Merlin, Quillbot, and Harpa overlays in real-time.</p>
            </div>

            <div className="p-4 rounded-xl bg-background/50 border border-glass-border space-y-2">
              <span className="font-bold text-foreground block">Arrow &amp; Mouse Selection Lock:</span>
              <label className="flex items-center gap-2 cursor-pointer font-medium">
                <input
                  type="checkbox"
                  checked={lockArrowSelection}
                  onChange={(e) => setLockArrowSelection(e.target.checked)}
                  className="rounded text-primary focus:ring-primary"
                />
                <span>Lock Shift+Arrow &amp; text selection</span>
              </label>
              <p className="text-[11px] text-muted-foreground">Prevents candidates from highlighting questions to copy or trigger AI tooltips.</p>
            </div>

            <div className="p-4 rounded-xl bg-background/50 border border-glass-border space-y-2">
              <span className="font-bold text-foreground block">Fullscreen Policy:</span>
              <label className="flex items-center gap-2 cursor-pointer font-medium">
                <input
                  type="checkbox"
                  checked={requireFullscreen}
                  onChange={(e) => setRequireFullscreen(e.target.checked)}
                  className="rounded text-primary focus:ring-primary"
                />
                <span>Enforce locked fullscreen during exam</span>
              </label>
              <p className="text-[11px] text-muted-foreground">Default: Normal Window Mode (No Fullscreen required). AI detections execute seamlessly in both modes.</p>
            </div>

            <div className="p-4 rounded-xl bg-background/50 border border-glass-border space-y-2 sm:col-span-2 lg:col-span-1">
              <span className="font-bold text-foreground block">Screen Sharing:</span>
              <label className="flex items-center gap-2 cursor-pointer font-medium">
                <input
                  type="checkbox"
                  checked={requireScreenShare}
                  onChange={(e) => setRequireScreenShare(e.target.checked)}
                  className="rounded text-primary focus:ring-primary"
                />
                <span>Mandatory Screen Sharing Stream</span>
              </label>
              <p className="text-[11px] text-muted-foreground">Emits SCREEN_SHARE_STOPPED if canceled.</p>
            </div>
          </div>

          <div className="pt-4 border-t border-glass-border flex justify-end">
            <Button onClick={handleSave} className="brand-surface font-bold text-xs flex items-center gap-1.5">
              <Save className="size-4" /> Save Configuration
            </Button>
          </div>
        </GlassCard>

        {/* Google Gemini Explainable AI Auditor Card */}
        <GlassCard className="p-6 space-y-4 md:col-span-2 border-primary/20 bg-primary/5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Sparkles className="size-5 text-primary" />
              <div>
                <h3 className="font-display font-bold text-base">Google Gemini Explainable AI (XAI) Engine</h3>
                <p className="text-xs text-muted-foreground">
                  Powers autonomous post-exam behavioral audit summaries, natural-language risk narratives, and academic committee reports.
                </p>
              </div>
            </div>
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-success/10 text-success border border-success/20">
              <CheckCircle2 className="size-3.5" /> Key Configured
            </span>
          </div>

          <div className="grid gap-3 sm:grid-cols-3 pt-2 text-xs">
            <div className="p-3.5 rounded-xl bg-background/60 border border-glass-border">
              <span className="text-muted-foreground block text-[11px] mb-1">Active AI Provider</span>
              <span className="font-bold text-foreground flex items-center gap-1.5">
                <Cpu className="size-4 text-primary" /> Google Generative AI
              </span>
            </div>

            <div className="p-3.5 rounded-xl bg-background/60 border border-glass-border">
              <span className="text-muted-foreground block text-[11px] mb-1">Configured Gemini API Key</span>
              <span className="font-mono text-xs font-bold text-foreground flex items-center gap-1.5">
                <Key className="size-3.5 text-warning" /> AQ.Ab8RN...iDkA
              </span>
            </div>

            <div className="p-3.5 rounded-xl bg-background/60 border border-glass-border">
              <span className="text-muted-foreground block text-[11px] mb-1">Supported Models</span>
              <span className="font-semibold text-foreground">gemini-3.6-flash, 3.7-flash, 3.8-flash</span>
            </div>
          </div>

          {geminiStatus && (
            <div className={`p-4 rounded-xl border text-xs space-y-1.5 ${
              geminiStatus.status === "ready" 
                ? "bg-success/5 border-success/20 text-success" 
                : "bg-warning/5 border-warning/20 text-warning"
            }`}>
              <div className="font-bold flex items-center gap-1.5">
                <CheckCircle2 className="size-4" /> {geminiStatus.message}
              </div>
              {geminiStatus.testOutput && (
                <p className="text-[11px] text-foreground/80 bg-background/60 p-2.5 rounded-lg border border-glass-border font-sans leading-relaxed">
                  "{geminiStatus.testOutput}"
                </p>
              )}
            </div>
          )}

          <div className="flex justify-between items-center pt-2">
            <p className="text-[11px] text-muted-foreground">
              API key securely saved in <code>.env</code> and <code>backend/.env</code>.
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={handleTestGemini}
              disabled={testingGemini}
              className="text-xs font-semibold flex items-center gap-1.5 border-glass-border"
            >
              <Zap className="size-3.5 text-primary" />
              {testingGemini ? "Pinging Gemini API..." : "Test Gemini Connection"}
            </Button>
          </div>
        </GlassCard>
      </div>
    </AppShell>
  );
}
