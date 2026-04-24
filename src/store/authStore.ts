import { create } from "zustand";
import { api } from "../lib/api";

export type AppUser = {
  id: string;
  email: string;
  name: string;
  phone: string;
  role: "client" | "admin" | "staff";
  status: "active" | "suspended";
  photoUrl: string | null;
};

interface AuthState {
  user: AppUser | null;
  role: "client" | "admin" | "staff" | null;
  photoURL: string | null;
  loading: boolean;
  hydrate: () => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  signup: (payload: { email: string; password: string; name: string; phone: string }) => Promise<void>;
  logout: () => Promise<void>;
  updatePhotoURL: (url: string | null) => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  role: null,
  photoURL: null,
  loading: true,
  hydrate: async () => {
    try {
      const data = await api<{ user: AppUser | null }>("/api/auth/me");
      set({
        user: data.user,
        role: data.user?.role ?? null,
        photoURL: data.user?.photoUrl ?? null,
        loading: false,
      });
    } catch {
      set({ user: null, role: null, photoURL: null, loading: false });
    }
  },
  login: async (email, password) => {
    const data = await api<{ user: AppUser }>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
    set({
      user: data.user,
      role: data.user.role,
      photoURL: data.user.photoUrl ?? null,
      loading: false,
    });
  },
  signup: async (payload) => {
    const data = await api<{ user: AppUser }>("/api/auth/signup", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    set({
      user: data.user,
      role: data.user.role,
      photoURL: data.user.photoUrl ?? null,
      loading: false,
    });
  },
  logout: async () => {
    try {
      await api<{ ok: true }>("/api/auth/logout", { method: "POST", body: JSON.stringify({}) });
    } finally {
      set({ user: null, role: null, photoURL: null, loading: false });
    }
  },
  updatePhotoURL: (url) =>
    set((state) => ({
      photoURL: url,
      user: state.user ? { ...state.user, photoUrl: url } : null,
    })),
}));
