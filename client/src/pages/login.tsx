import { useState } from "react";
import { Link, useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Wifi, ArrowRight, Eye, EyeOff, ShieldCheck, Globe, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";

const schema = z.object({
  email: z.string().email("Enter a valid email"),
  password: z.string().min(1, "Password is required"),
});
type FormData = z.infer<typeof schema>;

function parseApiError(err: any, fallback: string): string {
  const raw = err?.message ?? "";
  try {
    const m = raw.match(/^\d+:\s*(\{.+\})/);
    if (m) { const p = JSON.parse(m[1]); if (p.message) return p.message; }
  } catch {}
  return fallback;
}

export default function Login() {
  const [, navigate] = useLocation();
  const { login } = useAuth();
  const { toast } = useToast();
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);

  const form = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { email: "", password: "" },
  });

  async function onSubmit(data: FormData) {
    setLoading(true);
    try {
      await login(data.email, data.password);
      navigate("/dashboard");
    } catch (err: any) {
      toast({ title: "Login failed", description: parseApiError(err, "Invalid email or password"), variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-[calc(100vh-4rem)] flex">

      {/* Left — Form */}
      <div className="flex-1 flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-sm">

          {/* Brand */}
          <Link href="/">
            <div className="flex items-center gap-2 mb-10 w-fit cursor-pointer">
              <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-primary">
                <Wifi className="w-4 h-4 text-primary-foreground" />
              </div>
              <span className="font-semibold text-base tracking-tight">GlobeSIM</span>
            </div>
          </Link>

          <div className="mb-8">
            <h1 className="text-2xl font-bold tracking-tight mb-1.5" data-testid="text-login-title">Welcome back</h1>
            <p className="text-muted-foreground text-sm">Sign in to manage your eSIMs and orders.</p>
          </div>

          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField control={form.control} name="email" render={({ field }) => (
                <FormItem>
                  <FormLabel>Email address</FormLabel>
                  <FormControl>
                    <Input {...field} type="email" placeholder="you@example.com" autoComplete="email" data-testid="input-email" className="h-11" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />

              <FormField control={form.control} name="password" render={({ field }) => (
                <FormItem>
                  <div className="flex items-center justify-between">
                    <FormLabel>Password</FormLabel>
                    <Link href="/forgot-password">
                      <span className="text-xs text-primary hover:underline cursor-pointer">Forgot password?</span>
                    </Link>
                  </div>
                  <FormControl>
                    <div className="relative">
                      <Input {...field} type={showPass ? "text" : "password"} placeholder="••••••••" autoComplete="current-password" data-testid="input-password" className="h-11 pr-10" />
                      <button type="button" className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" onClick={() => setShowPass(v => !v)} data-testid="button-toggle-password">
                        {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />

              <Button type="submit" className="w-full h-11 font-semibold" disabled={loading} data-testid="button-login">
                {loading ? (
                  <span className="flex items-center gap-2">
                    <span className="w-4 h-4 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin" />
                    Signing in…
                  </span>
                ) : (
                  <span className="flex items-center gap-2">Sign in <ArrowRight className="w-4 h-4" /></span>
                )}
              </Button>
            </form>
          </Form>

          <div className="mt-6 text-center text-sm text-muted-foreground">
            Don't have an account?{" "}
            <Link href="/signup">
              <span className="text-primary font-medium hover:underline cursor-pointer" data-testid="link-signup">Create one</span>
            </Link>
          </div>

          {/* Trust badges */}
          <div className="mt-8 pt-6 border-t flex items-center justify-center gap-5 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5"><ShieldCheck className="w-3.5 h-3.5 text-emerald-500" /> SSL secured</span>
            <span className="flex items-center gap-1.5"><Globe className="w-3.5 h-3.5 text-primary" /> 190+ countries</span>
            <span className="flex items-center gap-1.5"><Zap className="w-3.5 h-3.5 text-amber-500" /> Instant delivery</span>
          </div>
        </div>
      </div>

      {/* Right panel — desktop only */}
      <div className="hidden lg:flex flex-col justify-center px-16 py-12 w-[480px] bg-gradient-to-br from-primary/90 via-primary to-blue-700 text-white">
        <div className="space-y-8">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-white/60 mb-3">Your eSIM dashboard</p>
            <h2 className="text-3xl font-bold leading-tight">Stay connected.<br />Anywhere in the world.</h2>
            <p className="text-white/70 mt-3 leading-relaxed">Manage all your eSIMs, top up data, and track your trips — all from one place.</p>
          </div>
          <div className="space-y-4">
            {[
              { icon: Wifi,        title: "Instant activation",    sub: "QR code delivered the moment you pay" },
              { icon: Globe,       title: "190+ countries",        sub: "One account, global coverage"         },
              { icon: ShieldCheck, title: "Secure & private",      sub: "Your data is always encrypted"        },
            ].map(f => (
              <div key={f.title} className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-lg bg-white/15 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <f.icon className="w-4 h-4" />
                </div>
                <div>
                  <p className="font-semibold text-sm">{f.title}</p>
                  <p className="text-xs text-white/60 mt-0.5">{f.sub}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
