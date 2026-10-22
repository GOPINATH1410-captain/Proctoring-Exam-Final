/**
 * auth.tsx — session + role based access control.
 *
 * Mirrors the JWT flow in backend/app/api/auth.py: the FastAPI reference issues
 * an access token and the SPA stores the decoded principal. Here the principal
 * is resolved directly from the local database for a self-contained demo.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { loadDB, updateDB, uid, type Role, type User } from "./proctor-store";

const SESSION_KEY = "nextgen-proctor-session";

interface AuthValue {
  user: User | null;
  ready: boolean;
  login: (email: string, password: string) => { ok: boolean; error?: string; user?: User };
  register: (input: {
    name: string;
    email: string;
    password: string;
    role: Role;
    department?: string | undefined;
    photoUrl?: string | undefined;
    faceEmbedding?: number[] | undefined;
  }) => {
    ok: boolean;
    error?: string;
  };
  logout: () => void;
  enrollFace: (photoUrl?: string, embedding?: Float32Array | number[]) => void;
  updatePhoto: (photoUrl: string, embedding?: Float32Array | number[]) => void;
  hasRole: (...roles: Role[]) => boolean;
  refresh: () => void;
}

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);

  const resolve = useCallback(() => {
    const id = window.localStorage.getItem(SESSION_KEY);
    if (!id) return setUser(null);
    setUser(loadDB().users.find((u) => u.id === id) ?? null);
  }, []);

  useEffect(() => {
    resolve();
    setReady(true);
    const handler = () => resolve();
    window.addEventListener("proctor-db-change", handler);
    return () => window.removeEventListener("proctor-db-change", handler);
  }, [resolve]);

  const value = useMemo<AuthValue>(
    () => ({
      user,
      ready,
      refresh: resolve,
      hasRole: (...roles: Role[]) => !!user && roles.includes(user.role),
      login: (email, password) => {
        const found = loadDB().users.find(
          (u) => u.email.toLowerCase() === email.trim().toLowerCase() && u.password === password,
        );
        if (!found) return { ok: false, error: "Invalid email or password" };
        window.localStorage.setItem(SESSION_KEY, found.id);
        setUser(found);
        return { ok: true, user: found };
      },
      register: ({ name, email, password, role, department, photoUrl, faceEmbedding }) => {
        const db = loadDB();
        if (db.users.some((u) => u.email.toLowerCase() === email.trim().toLowerCase())) {
          return { ok: false, error: "An account with this email already exists" };
        }
        const created: User = {
          id: uid(),
          name,
          email: email.trim(),
          password,
          role,
          ...(department ? { department } : {}),
          ...(photoUrl ? { photoUrl } : {}),
          ...(faceEmbedding ? { faceEmbedding } : {}),
          faceEnrolled: Boolean(photoUrl || (faceEmbedding && faceEmbedding.length > 0)),
          createdAt: new Date().toISOString(),
        };
        updateDB((d) => void d.users.push(created));
        window.localStorage.setItem(SESSION_KEY, created.id);
        setUser(created);
        return { ok: true };
      },
      logout: () => {
        window.localStorage.removeItem(SESSION_KEY);
        setUser(null);
      },
      enrollFace: (photoUrl?: string, embedding?: Float32Array | number[]) => {
        if (!user) return;
        updateDB((d) => {
          const u = d.users.find((x) => x.id === user.id);
          if (u) {
            u.faceEnrolled = true;
            if (photoUrl) u.photoUrl = photoUrl;
            if (embedding) {
              u.faceEmbedding = Array.isArray(embedding) ? embedding : Array.from(embedding);
            }
          }
        });
        resolve();
      },
      updatePhoto: (photoUrl: string, embedding?: Float32Array | number[]) => {
        if (!user) return;
        updateDB((d) => {
          const u = d.users.find((x) => x.id === user.id);
          if (u) {
            u.photoUrl = photoUrl;
            u.faceEnrolled = true;
            if (embedding) {
              u.faceEmbedding = Array.isArray(embedding) ? embedding : Array.from(embedding);
            }
          }
        });
        resolve();
      },
    }),
    [user, ready, resolve],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
