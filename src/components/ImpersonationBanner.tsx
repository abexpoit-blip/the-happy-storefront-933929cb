import { useEffect, useState } from "react";
import { LogOut } from "lucide-react";
import { setToken, AUTH_CHANGED_EVENT } from "@/lib/api";
import { toast } from "sonner";

const ADMIN_TOKEN_KEY = "zorushop.admin_token";

export function startImpersonation(currentAdminToken: string, newToken: string) {
  localStorage.setItem(ADMIN_TOKEN_KEY, currentAdminToken);
  setToken(newToken);
}

export const ImpersonationBanner = () => {
  const [adminToken, setAdminToken] = useState<string | null>(null);

  useEffect(() => {
    const check = () => setAdminToken(localStorage.getItem(ADMIN_TOKEN_KEY));
    check();
    window.addEventListener(AUTH_CHANGED_EVENT, check);
    window.addEventListener("storage", check);
    return () => {
      window.removeEventListener(AUTH_CHANGED_EVENT, check);
      window.removeEventListener("storage", check);
    };
  }, []);

  if (!adminToken) return null;

  const returnToAdmin = () => {
    setToken(adminToken);
    localStorage.removeItem(ADMIN_TOKEN_KEY);
    toast.success("Returned to admin");
    setTimeout(() => { window.location.href = "/admin"; }, 250);
  };

  return (
    <div className="sticky top-0 z-[60] w-full bg-gradient-to-r from-amber-500 via-yellow-500 to-amber-500 text-black px-4 py-2 flex items-center justify-between text-xs sm:text-sm font-semibold shadow-lg">
      <span>🛡️ Admin impersonation active — you are viewing as another user</span>
      <button
        onClick={returnToAdmin}
        className="flex items-center gap-1 bg-black/80 text-amber-300 hover:bg-black px-3 py-1 rounded-md transition"
      >
        <LogOut className="h-3.5 w-3.5" /> Return to admin
      </button>
    </div>
  );
};
