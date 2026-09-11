import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Mail, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  defaultEmail?: string;
  redirectPath?: string;
}

export const ForgotPasswordDialog = ({ open, onOpenChange, defaultEmail = "", redirectPath = "/reset-password" }: Props) => {
  const [email, setEmail] = useState(defaultEmail);
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      // Accept either a real email or a username; convert username -> synthetic email.
      const clean = email.trim().toLowerCase();
      let target = clean.includes("@") ? clean : `${clean}@zoru.cc`;
      let res = await supabase.auth.resetPasswordForEmail(target, {
        redirectTo: `${window.location.origin}${redirectPath}`,
      });
      if (res.error && !clean.includes("@")) {
        const alt = await supabase.auth.resetPasswordForEmail(`${clean}@cruzercc.shop`, {
          redirectTo: `${window.location.origin}${redirectPath}`,
        });
        if (!alt.error) res = alt;
      }
      if (res.error) throw res.error;
      setSent(true);
      toast.success("Ссылка для сброса пароля отправлена");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to submit reset request");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) setSent(false); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Forgot password</DialogTitle>
          <DialogDescription>
            Enter your email or username. If a matching account exists, we'll send a reset link.
          </DialogDescription>
        </DialogHeader>
        {sent ? (
          <div className="text-sm text-muted-foreground py-2">
            ✅ If <span className="text-foreground font-semibold">{email}</span> is registered, a reset link has been sent. Check your inbox (and spam folder).
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            <div>
              <Label className="text-[10px] uppercase tracking-[0.25em] text-muted-foreground">Email or username</Label>
              <div className="relative mt-2">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input value={email} onChange={(e) => setEmail(e.target.value)} required
                  placeholder="you@example.com or username" className="pl-10 h-11 bg-input/70 border-border/60" />
              </div>
            </div>
            <button type="submit" disabled={loading} className="btn-luxe w-full h-11 disabled:opacity-60">
              {loading ? <Loader2 className="h-4 w-4 mx-auto animate-spin" /> : "Send reset link"}
            </button>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
};
