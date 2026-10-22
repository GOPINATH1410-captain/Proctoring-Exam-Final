import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState, useRef, useEffect } from "react";
import {
  Camera,
  CheckCircle2,
  FileImage,
  Loader2,
  ShieldCheck,
  Upload,
  UserCheck,
  X,
  AlertTriangle,
  RefreshCw,
  Play,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { GlassCard } from "@/components/app-shell";
import { ThemeToggle } from "@/components/theme-toggle";
import { FaceEnrollment } from "@/components/face-enrollment";
import { useAuth } from "@/lib/auth";
import type { Role } from "@/lib/proctor-store";
import { homeFor } from "@/lib/routes";
import { fileToDataUrl, extractFaceFromImage } from "@/lib/face-biometrics";

export const Route = createFileRoute("/register")({
  head: () => ({
    meta: [
      { title: "Create account — NextGen AI Proctor" },
      {
        name: "description",
        content: "Register, upload your student photo and enrol your face for AI-verified online examinations.",
      },
      { property: "og:title", content: "Create account — NextGen AI Proctor" },
      {
        property: "og:description",
        content: "Register with student photo upload and complete face enrolment for proctored exams.",
      },
    ],
  }),
  component: RegisterPage,
});

function RegisterPage() {
  const { register, enrollFace, user } = useAuth();
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [step, setStep] = useState<"form" | "face">("form");
  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    role: "student" as Role,
    department: "Computer Science",
  });

  // Student Photo Upload & Live Camera Capture State
  const [photoMode, setPhotoMode] = useState<"upload" | "camera">("upload");
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [faceEmbedding, setFaceEmbedding] = useState<number[] | null>(null);
  const [photoLoading, setPhotoLoading] = useState(false);
  const [photoStatus, setPhotoStatus] = useState<string | null>(null);
  const [photoError, setPhotoError] = useState<string | null>(null);

  const [cameraActive, setCameraActive] = useState(false);
  const cameraStreamRef = useRef<MediaStream | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  const startCamera = async () => {
    setPhotoError(null);
    setPhotoStatus("Accessing webcam camera...");
    try {
      if (cameraStreamRef.current) {
        cameraStreamRef.current.getTracks().forEach((t) => t.stop());
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 640, height: 480, facingMode: "user" },
        audio: false,
      });
      cameraStreamRef.current = stream;
      setCameraActive(true);
      setPhotoStatus("Webcam active — position your face in the oval guide and click Snap Photo.");
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play().catch(() => {});
      }
    } catch (err: any) {
      setPhotoError("Unable to access camera. Please allow camera permissions or upload a photo file.");
      setCameraActive(false);
      setPhotoStatus(null);
    }
  };

  const stopCamera = () => {
    if (cameraStreamRef.current) {
      cameraStreamRef.current.getTracks().forEach((t) => t.stop());
      cameraStreamRef.current = null;
    }
    setCameraActive(false);
  };

  useEffect(() => {
    return () => {
      if (cameraStreamRef.current) {
        cameraStreamRef.current.getTracks().forEach((t) => t.stop());
      }
    };
  }, []);

  const captureFromCamera = async () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth) {
      toast.error("Camera is not active or stream is not ready.");
      return;
    }

    setPhotoLoading(true);
    setPhotoError(null);
    setPhotoStatus("Analyzing captured image & extracting biometric face geometry...");

    try {
      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth || 640;
      canvas.height = video.videoHeight || 480;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Could not initialize canvas context");

      // Draw horizontal flip for natural mirror capture
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL("image/jpeg", 0.88);

      const res = await extractFaceFromImage(dataUrl);
      if (!res.faceDetected || !res.embedding) {
        setPhotoError(
          res.error || "No clear human face detected. Please ensure your face is inside the guide with good lighting."
        );
        setPhotoStatus(null);
        setPhotoLoading(false);
        return;
      }

      setPhotoUrl(dataUrl);
      setFaceEmbedding(Array.from(res.embedding));
      setPhotoStatus("Camera face captured & biometric baseline extracted successfully!");
      toast.success("Student photo captured and biometric baseline verified!");
      stopCamera();
    } catch (err: any) {
      setPhotoError(err?.message || "Failed to process photo from camera.");
      setPhotoStatus(null);
    } finally {
      setPhotoLoading(false);
    }
  };

  const handlePhotoSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setPhotoLoading(true);
    setPhotoError(null);
    setPhotoStatus("Processing photo & extracting biometric face landmarks...");

    try {
      const dataUrl = await fileToDataUrl(file, 480, 0.88);
      const res = await extractFaceFromImage(dataUrl);

      if (!res.faceDetected || !res.embedding) {
        setPhotoError(
          res.error || "No clear human face found. Please upload a well-lit, front-facing portrait photo."
        );
        setPhotoStatus(null);
        setPhotoLoading(false);
        return;
      }

      setPhotoUrl(dataUrl);
      setFaceEmbedding(Array.from(res.embedding));
      setPhotoStatus("Face detected & biometric baseline extracted successfully!");
      toast.success("Student photo verified and face baseline generated!");
    } catch (err: any) {
      setPhotoError(err?.message || "Failed to process photo.");
      setPhotoStatus(null);
    } finally {
      setPhotoLoading(false);
    }
  };

  const removePhoto = () => {
    setPhotoUrl(null);
    setFaceEmbedding(null);
    setPhotoStatus(null);
    setPhotoError(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (photoMode === "camera") {
      startCamera();
    }
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (form.password.length < 6) {
      toast.error("Password must be at least 6 characters");
      return;
    }

    if (form.role === "student" && !photoUrl) {
      toast.info("Please upload a student photo or continue to live webcam capture.");
    }

    const res = register({
      ...form,
      photoUrl: photoUrl || undefined,
      faceEmbedding: faceEmbedding || undefined,
    });

    if (!res.ok) {
      toast.error(res.error ?? "Registration failed");
      return;
    }

    toast.success("Account created — complete biometric face alignment");
    setStep("face");
  };

  return (
    <div className="grid min-h-screen aurora place-items-center px-4 py-10">
      <div className="absolute right-4 top-4">
        <ThemeToggle />
      </div>
      <GlassCard className="w-full max-w-lg animate-scale-in">
        <Link to="/" className="mb-6 flex items-center gap-2">
          <span className="grid size-9 place-items-center rounded-xl brand-surface">
            <ShieldCheck className="size-5" />
          </span>
          <span className="font-display text-sm font-bold">NextGen AI Proctor</span>
        </Link>

        {step === "form" ? (
          <>
            <h1 className="font-display text-2xl font-bold">Create your account</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Step 1 of 2 — account details &amp; student reference photo.
            </p>

            <form onSubmit={submit} className="mt-6 space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="name">Full name</Label>
                <Input
                  id="name"
                  required
                  placeholder="e.g. Aarav Sharma"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    required
                    placeholder="student@university.edu"
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="password">Password</Label>
                  <Input
                    id="password"
                    type="password"
                    required
                    placeholder="At least 6 characters"
                    value={form.password}
                    onChange={(e) => setForm({ ...form, password: e.target.value })}
                  />
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="role">Role</Label>
                  <select
                    id="role"
                    value={form.role}
                    onChange={(e) => setForm({ ...form, role: e.target.value as Role })}
                    className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
                  >
                    <option value="student">Student</option>
                    <option value="faculty">Faculty</option>
                  </select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="dept">Department</Label>
                  <Input
                    id="dept"
                    value={form.department}
                    onChange={(e) => setForm({ ...form, department: e.target.value })}
                  />
                </div>
              </div>

              {/* Student Identity Photo (Upload OR Take with Camera) */}
              <div className="space-y-3 pt-2 border-t border-glass-border">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-semibold flex items-center gap-1.5">
                    <UserCheck className="size-4 text-primary" /> Student Identity Photo
                  </Label>
                  <span className="text-[11px] text-muted-foreground font-mono">
                    {photoUrl ? "Photo verified ✓" : "Required for exam attendance"}
                  </span>
                </div>

                {/* Photo Option Switcher: Upload File vs Take Camera Image */}
                {!photoUrl && (
                  <div className="grid grid-cols-2 gap-1.5 p-1 rounded-xl bg-secondary/40 border border-glass-border">
                    <button
                      type="button"
                      onClick={() => {
                        setPhotoMode("upload");
                        stopCamera();
                      }}
                      className={`flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                        photoMode === "upload"
                          ? "bg-primary text-primary-foreground shadow-xs"
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      <Upload className="size-3.5" /> Upload Photo File
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setPhotoMode("camera");
                        startCamera();
                      }}
                      className={`flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                        photoMode === "camera"
                          ? "bg-primary text-primary-foreground shadow-xs"
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      <Camera className="size-3.5" /> Take with Camera
                    </button>
                  </div>
                )}

                <input
                  type="file"
                  ref={fileInputRef}
                  accept="image/jpeg,image/png,image/webp"
                  onChange={handlePhotoSelect}
                  className="hidden"
                />

                {photoUrl ? (
                  <div className="flex items-center gap-3 p-3 rounded-2xl border border-primary/30 bg-primary/10">
                    <div className="relative size-16 shrink-0 rounded-xl overflow-hidden border border-primary/40 bg-black">
                      <img
                        src={photoUrl}
                        alt="Uploaded student reference"
                        className="size-full object-cover"
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 text-xs font-bold text-primary">
                        <CheckCircle2 className="size-3.5 text-emerald-400" />
                        <span>Identity Photo Attached</span>
                      </div>
                      <p className="text-[11px] text-muted-foreground truncate mt-0.5">
                        Biometric baseline ready for exam pre-check verification
                      </p>
                      <button
                        type="button"
                        onClick={removePhoto}
                        className="text-[11px] text-destructive hover:underline mt-1 flex items-center gap-1 font-semibold"
                      >
                        <X className="size-3" /> Change Photo / Retake
                      </button>
                    </div>
                  </div>
                ) : photoMode === "camera" ? (
                  /* Live Webcam Capture Mode */
                  <div className="relative overflow-hidden rounded-2xl border-2 border-primary/40 bg-slate-950 p-3 text-center">
                    <div className="relative aspect-video w-full overflow-hidden rounded-xl bg-black flex items-center justify-center">
                      <video
                        ref={videoRef}
                        autoPlay
                        playsInline
                        muted
                        className={`size-full object-cover -scale-x-100 ${cameraActive ? "block" : "hidden"}`}
                      />

                      {/* Face Alignment Oval Guide */}
                      {cameraActive && (
                        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                          <div className="size-36 rounded-full border-2 border-dashed border-primary/70 animate-pulse shadow-[0_0_20px_rgba(6,182,212,0.3)]" />
                        </div>
                      )}

                      {!cameraActive && (
                        <div className="flex flex-col items-center justify-center p-4">
                          <Camera className="size-8 text-muted-foreground mb-2" />
                          <p className="text-xs text-muted-foreground">Camera stream not active</p>
                          <Button
                            type="button"
                            size="sm"
                            variant="secondary"
                            onClick={startCamera}
                            className="mt-3 gap-1.5 text-xs"
                          >
                            <Play className="size-3" /> Start Webcam
                          </Button>
                        </div>
                      )}
                    </div>

                    {cameraActive && (
                      <div className="mt-3 flex items-center justify-center gap-2">
                        <Button
                          type="button"
                          size="sm"
                          onClick={captureFromCamera}
                          disabled={photoLoading}
                          className="gap-1.5 text-xs font-bold brand-surface"
                        >
                          {photoLoading ? (
                            <Loader2 className="size-3.5 animate-spin" />
                          ) : (
                            <Camera className="size-3.5" />
                          )}
                          Snap Photo
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={startCamera}
                          disabled={photoLoading}
                          className="gap-1.5 text-xs"
                        >
                          <RefreshCw className="size-3.5" /> Refresh
                        </Button>
                      </div>
                    )}
                  </div>
                ) : (
                  /* File Upload Dropzone Mode */
                  <div
                    onClick={() => fileInputRef.current?.click()}
                    className={`cursor-pointer rounded-2xl border-2 border-dashed p-4 text-center transition-all ${
                      photoError
                        ? "border-destructive/60 bg-destructive/10"
                        : "border-primary/40 hover:border-primary bg-secondary/30 hover:bg-secondary/50"
                    }`}
                  >
                    {photoLoading ? (
                      <div className="flex flex-col items-center justify-center py-2 text-xs text-muted-foreground">
                        <Loader2 className="size-6 animate-spin text-primary mb-2" />
                        <span>Analyzing face geometry…</span>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center justify-center py-1">
                        <div className="size-10 rounded-full bg-primary/10 text-primary flex items-center justify-center mb-2">
                          <Upload className="size-5" />
                        </div>
                        <p className="text-xs font-semibold text-foreground">
                          Click to upload your Student Photo
                        </p>
                        <p className="text-[11px] text-muted-foreground mt-0.5">
                          Clear passport / front-facing portrait (JPG, PNG). Verified before exam attendance.
                        </p>
                      </div>
                    )}
                  </div>
                )}

                {photoError && (
                  <p className="text-xs text-destructive flex items-center gap-1.5 mt-1 font-medium">
                    <AlertTriangle className="size-3.5 shrink-0" /> {photoError}
                  </p>
                )}
                {photoStatus && !photoError && (
                  <p className="text-xs text-emerald-400 flex items-center gap-1.5 mt-1 font-medium">
                    <CheckCircle2 className="size-3.5 shrink-0" /> {photoStatus}
                  </p>
                )}
              </div>

              <Button type="submit" className="w-full mt-4">
                Continue to face enrolment
              </Button>
            </form>

            <p className="mt-6 text-center text-sm text-muted-foreground">
              Already registered?{" "}
              <Link to="/login" className="text-primary hover:underline">
                Sign in
              </Link>
            </p>
          </>
        ) : (
          <>
            <h1 className="font-display text-2xl font-bold">Face enrolment</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Step 2 of 2 — verify your webcam live stream against your uploaded reference photo.
            </p>

            <div className="mt-6">
              <FaceEnrollment
                initialPhoto={photoUrl}
                onVerified={(frame, emb) => {
                  enrollFace(photoUrl || frame, emb);
                  toast.success("Face enrolled & baseline established successfully!");
                  navigate({ to: homeFor(user?.role ?? "student"), replace: true });
                }}
              />
            </div>
          </>
        )}
      </GlassCard>
    </div>
  );
}
