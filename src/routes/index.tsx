import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Activity,
  BarChart3,
  BookOpenCheck,
  Brain,
  Camera,
  Eye,
  FileText,
  Github,
  Lock,
  Mail,
  MapPin,
  Mic,
  ScanFace,
  ShieldCheck,
  Sparkles,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";
import { GlassCard } from "@/components/app-shell";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "NextGen AI Online Exam Cheating Detection System" },
      {
        name: "description",
        content:
          "AI-powered online exam proctoring with YOLOv8 object detection, MediaPipe gaze tracking, explainable risk scoring and live faculty dashboards.",
      },
      { property: "og:title", content: "NextGen AI Online Exam Cheating Detection System" },
      {
        property: "og:description",
        content:
          "Real-time AI proctoring: phone and person detection, gaze and head-pose analysis, voice monitoring, explainable risk scores and PDF evidence reports.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Landing,
});

const FEATURES = [
  {
    icon: ScanFace,
    title: "Continuous face verification",
    body: "Identity is re-verified every second against the enrolled face embedding, flagging impersonation instantly.",
  },
  {
    icon: Eye,
    title: "Gaze & head pose tracking",
    body: "MediaPipe FaceMesh landmarks drive eye-contact and head-pose estimation to catch off-screen glances.",
  },
  {
    icon: Camera,
    title: "YOLOv8 object detection",
    body: "Phones, books, printed notes and additional persons are detected in frame with bounding-box evidence.",
  },
  {
    icon: Mic,
    title: "Voice activity detection",
    body: "Live microphone RMS analysis detects whispering, dictation and third-party assistance.",
  },
  {
    icon: Brain,
    title: "Explainable AI risk score",
    body: "Every score ships with ranked human-readable reasons — never an unexplained black-box verdict.",
  },
  {
    icon: FileText,
    title: "Evidence-backed reports",
    body: "Timeline, screenshots, charts and risk summary exported to PDF and CSV for academic review boards.",
  },
];

const PIPELINE = [
  {
    icon: ShieldCheck,
    label: "Room scan",
    text: "Phone, book and person sweep before the exam unlocks.",
  },
  {
    icon: Activity,
    label: "Live monitoring",
    text: "1 Hz inference loop across vision and audio channels.",
  },
  { icon: BarChart3, label: "Behaviour engine", text: "Weighted fusion into a 0-100 risk score." },
  {
    icon: BookOpenCheck,
    label: "Review",
    text: "Faculty verdict with evidence and downloadable report.",
  },
];

function Landing() {
  return (
    <div className="min-h-screen aurora">
      {/* ---------------- Navigation ---------------- */}
      <header className="sticky top-0 z-40 border-b border-glass-border bg-background/60 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6">
          <Link to="/" className="flex items-center gap-2.5">
            <img
              src="/logo.png"
              alt="ProctoGuard AI Logo"
              className="size-9 rounded-xl object-cover shadow-sm border border-glass-border"
            />
            <span className="font-display text-sm font-bold sm:text-base">NextGen AI Proctor</span>
          </Link>
          <nav className="hidden items-center gap-6 text-sm text-muted-foreground md:flex">
            <a href="#features" className="transition-colors hover:text-foreground">
              Features
            </a>
            <a href="#pipeline" className="transition-colors hover:text-foreground">
              How it works
            </a>
            <a href="#about" className="transition-colors hover:text-foreground">
              About
            </a>
            <a href="#contact" className="transition-colors hover:text-foreground">
              Contact
            </a>
          </nav>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <Button asChild variant="ghost" className="hidden sm:inline-flex">
              <Link to="/register">Register</Link>
            </Button>
            <Button asChild>
              <Link to="/login">Login</Link>
            </Button>
          </div>
        </div>
      </header>

      {/* ---------------- Hero ---------------- */}
      <section className="relative overflow-hidden">
        <div className="pointer-events-none absolute inset-0 grid-lines opacity-40" />
        <div className="relative mx-auto grid max-w-7xl items-center gap-12 px-4 py-20 sm:px-6 lg:grid-cols-2 lg:py-28">
          <div className="animate-fade-in">
            <span className="inline-flex items-center gap-2 rounded-full border border-glass-border bg-glass px-3 py-1 text-xs font-medium text-muted-foreground">
              <Sparkles className="size-3.5 text-primary" />
              YOLOv8 · MediaPipe · Explainable AI
            </span>
            <h1 className="mt-6 font-display text-4xl font-bold leading-[1.05] sm:text-6xl">
              Exam integrity, <span className="brand-text">proven by AI</span> — not guessed.
            </h1>
            <p className="mt-6 max-w-xl text-base leading-relaxed text-muted-foreground sm:text-lg">
              NextGen watches every exam session across six detection channels, fuses them into a
              transparent risk score, and hands faculty the exact evidence behind every flag.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button asChild size="lg">
                <Link to="/login">Start a proctored exam</Link>
              </Button>
              <Button asChild size="lg" variant="outline">
                <a href="#features">Explore the platform</a>
              </Button>
            </div>
            <dl className="mt-10 grid max-w-lg grid-cols-3 gap-4">
              {[
                ["6", "detection channels"],
                ["1 Hz", "inference loop"],
                ["100%", "explainable flags"],
              ].map(([v, l]) => (
                <div key={l}>
                  <dt className="font-display text-2xl font-bold">{v}</dt>
                  <dd className="text-xs text-muted-foreground">{l}</dd>
                </div>
              ))}
            </dl>
          </div>

          {/* Simulated monitoring panel */}
          <GlassCard className="float-slow relative overflow-hidden">
            <div className="flex items-center justify-between">
              <span className="text-xs uppercase tracking-widest text-muted-foreground">
                Live AI monitor
              </span>
              <span className="inline-flex items-center gap-2 rounded-full bg-destructive/15 px-3 py-1 text-xs font-semibold text-destructive">
                <span className="size-2 animate-pulse rounded-full bg-destructive" /> REC
              </span>
            </div>
            <div className="scan-line relative mt-4 aspect-video overflow-hidden rounded-2xl border border-glass-border bg-secondary/50">
              <div className="absolute left-6 top-8 h-28 w-24 rounded-lg border-2 border-primary/70" />
              <span className="absolute left-6 top-4 rounded bg-primary px-2 py-0.5 text-[10px] font-bold text-primary-foreground">
                face 0.98
              </span>
              <div className="absolute bottom-10 right-10 h-14 w-10 rounded-lg border-2 border-destructive/80" />
              <span className="absolute bottom-24 right-10 rounded bg-destructive px-2 py-0.5 text-[10px] font-bold text-destructive-foreground">
                phone 0.91
              </span>
            </div>
            <div className="mt-5 space-y-3">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">AI risk score</span>
                <span className="font-display text-2xl font-bold text-destructive">82%</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-secondary">
                <div className="h-full w-[82%] rounded-full bg-destructive" />
              </div>
              <ul className="space-y-1.5 text-xs text-muted-foreground">
                <li>• Phone detected for 18 seconds</li>
                <li>• Looking away 12 times</li>
                <li>• Voice activity detected</li>
                <li>• Suspicious hand movement</li>
              </ul>
            </div>
          </GlassCard>
        </div>
      </section>

      {/* ---------------- Features ---------------- */}
      <section id="features" className="mx-auto max-w-7xl px-4 py-20 sm:px-6">
        <h2 className="font-display text-3xl font-bold sm:text-4xl">
          Detection built for real classrooms
        </h2>
        <p className="mt-3 max-w-2xl text-muted-foreground">
          Six independent signals, fused by a weighted behaviour engine, each contributing a
          traceable share of the final integrity score.
        </p>
        <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => (
            <GlassCard
              key={f.title}
              className="transition-transform duration-300 hover:-translate-y-1"
            >
              <span className="grid size-11 place-items-center rounded-2xl bg-primary/12 text-primary">
                <f.icon className="size-5" />
              </span>
              <h3 className="mt-4 text-lg font-semibold">{f.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{f.body}</p>
            </GlassCard>
          ))}
        </div>
      </section>

      {/* ---------------- Pipeline ---------------- */}
      <section id="pipeline" className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
        <GlassCard className="p-8">
          <h2 className="font-display text-2xl font-bold sm:text-3xl">From room scan to verdict</h2>
          <div className="mt-8 grid gap-6 md:grid-cols-4">
            {PIPELINE.map((s, i) => (
              <div key={s.label} className="relative">
                <span className="grid size-10 place-items-center rounded-xl brand-surface">
                  <s.icon className="size-5" />
                </span>
                <div className="mt-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Step {i + 1}
                </div>
                <h3 className="mt-1 font-semibold">{s.label}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{s.text}</p>
              </div>
            ))}
          </div>
        </GlassCard>
      </section>

      {/* ---------------- About ---------------- */}
      <section id="about" className="mx-auto max-w-7xl px-4 py-20 sm:px-6">
        <div className="grid gap-10 lg:grid-cols-2">
          <div>
            <h2 className="font-display text-3xl font-bold sm:text-4xl">
              Built for trustworthy assessment
            </h2>
            <p className="mt-4 leading-relaxed text-muted-foreground">
              Traditional proctoring tools output an opaque number. NextGen was designed around
              explainability: every percentage point in a risk score maps to a timestamped event, a
              detection confidence and a captured frame. Faculty stay in control — the AI
              recommends, humans decide.
            </p>
            <p className="mt-4 leading-relaxed text-muted-foreground">
              The reference deployment pairs this React interface with a FastAPI inference service
              running YOLOv8 and MediaPipe, backed by Firebase or MongoDB Atlas, containerised with
              Docker and ready for Render or AWS.
            </p>
            <div className="mt-6 flex flex-wrap gap-2">
              {[
                "React",
                "FastAPI",
                "YOLOv8",
                "MediaPipe",
                "OpenCV",
                "Firebase",
                "MongoDB",
                "Docker",
              ].map((t) => (
                <span
                  key={t}
                  className="rounded-full border border-glass-border bg-glass px-3 py-1 text-xs"
                >
                  {t}
                </span>
              ))}
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {[
              {
                icon: Users,
                k: "Faculty console",
                v: "Live grid of every candidate with instant alerts.",
              },
              {
                icon: Lock,
                k: "Secure by design",
                v: "JWT auth, role-based access, hashed credentials.",
              },
              {
                icon: BarChart3,
                k: "Analytics",
                v: "Cohort-level integrity trends and exam comparisons.",
              },
              {
                icon: FileText,
                k: "Audit trail",
                v: "Immutable timeline with screenshot evidence.",
              },
            ].map((c) => (
              <GlassCard key={c.k} className="p-5">
                <c.icon className="size-5 text-accent" />
                <h3 className="mt-3 font-semibold">{c.k}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{c.v}</p>
              </GlassCard>
            ))}
          </div>
        </div>
      </section>

      {/* ---------------- Contact ---------------- */}
      <section id="contact" className="mx-auto max-w-7xl px-4 pb-20 sm:px-6">
        <GlassCard className="grid gap-8 p-8 md:grid-cols-2">
          <div>
            <h2 className="font-display text-3xl font-bold">Talk to the team</h2>
            <p className="mt-3 text-muted-foreground">
              Request a pilot for your institution or ask about on-premise deployment.
            </p>
            <ul className="mt-6 space-y-3 text-sm">
              <li className="flex items-center gap-3">
                <Mail className="size-4 text-primary" /> proctor@nextgen-ai.edu
              </li>
              <li className="flex items-center gap-3">
                <MapPin className="size-4 text-primary" /> Department of Computer Science
              </li>
              <li className="flex items-center gap-3">
                <Github className="size-4 text-primary" /> github.com/nextgen-ai/proctoring
              </li>
            </ul>
          </div>
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              (e.currentTarget as HTMLFormElement).reset();
            }}
          >
            <input
              required
              placeholder="Full name"
              className="w-full rounded-xl border border-glass-border bg-background/60 px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-ring"
            />
            <input
              required
              type="email"
              placeholder="Institution email"
              className="w-full rounded-xl border border-glass-border bg-background/60 px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-ring"
            />
            <textarea
              required
              rows={4}
              placeholder="How can we help?"
              className="w-full rounded-xl border border-glass-border bg-background/60 px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-ring"
            />
            <Button type="submit" className="w-full">
              Send message
            </Button>
          </form>
        </GlassCard>
      </section>

      <footer className="border-t border-glass-border py-8 text-center text-xs text-muted-foreground">
        © {new Date().getFullYear()} NextGen AI Online Exam Cheating Detection System
      </footer>
    </div>
  );
}
