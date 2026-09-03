import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { SESSION_MINUTES, SESSION_START_KEY, clearSessionStart, markSessionStart } from "@/lib/session";

/**
 * 30-minute INACTIVITY limit for regular users (admins are exempt).
 * Any user activity refreshes the timer, so an active user is never logged out.
 */
export function useSessionTimeout(enabled: boolean) {
  const { signOut } = useAuth();
  const nav = useNavigate();

  useEffect(() => {
    if (!enabled) return;
    if (!localStorage.getItem(SESSION_START_KEY)) markSessionStart();

    const limitMs = SESSION_MINUTES * 60 * 1000;
    let lastTouch = 0;

    const touch = () => {
      const now = Date.now();
      if (now - lastTouch < 30_000) return; // throttle writes
      lastTouch = now;
      markSessionStart();
    };

    const check = async () => {
      const raw = localStorage.getItem(SESSION_START_KEY);
      const start = Number(raw);
      if (!raw || !Number.isFinite(start)) { markSessionStart(); return; }
      if (Date.now() - start < limitMs) return;
      clearSessionStart();
      await signOut();
      toast.info(`Сессия истекла (${SESSION_MINUTES} минут без активности). Войдите снова.`);
      nav("/auth", { replace: true });
    };

    const events: (keyof WindowEventMap)[] = ["mousemove", "mousedown", "keydown", "scroll", "touchstart", "click", "focus"];
    events.forEach((e) => window.addEventListener(e, touch, { passive: true }));

    const id = window.setInterval(check, 30_000);
    return () => {
      window.clearInterval(id);
      events.forEach((e) => window.removeEventListener(e, touch));
    };
  }, [enabled, signOut, nav]);
}
