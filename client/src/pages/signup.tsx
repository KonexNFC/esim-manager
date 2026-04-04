import { useState } from "react";
import { Link, useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { ArrowRight, Eye, EyeOff, ShieldCheck, Globe, Zap, CheckCircle } from "lucide-react";
import { KonexLogo } from "@/components/konex-logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";

const schema = z.object({
  name: z.string().min(1, "Name is required"),
  email: z.string().email("Enter a valid email"),
  password: z.string().min(8, "At least 8 characters"),
  confirm: z.string(),
}).refine(d => d.password === d.confirm, { message: "Passwords don't match", path: ["confirm"] });
type FormData = z.infer<typeof schema>;

function parseApiError(err: any, fallback: string): string {
  const raw = err?.message ?? "";
  try {
    const m = raw.match(/^\d+:\s*(\{.+\})/);
    if (m) { const p = JSON.parse(m[1]); if (p.message) return p.message; }
  } catch {}
  return fallback;
}

export default function Signup() {
  const [, navigate] = useLocation();
  const { signup } = useAuth();
  const { toast } = useToast();
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);

  const form = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { name: "", email: "", password: "", confirm: "" },
  });

  async function onSubmit(data: FormData) {
    setLoading(true);
    try {
      await signup(data.name, data.email, data.password);
      navigate("/dashboard");
    } catch (err: any) {
      toast({ title: "Account creation failed", description: parseApiError(err, "Something went wrong. Please try again."), variant: "destructive" });
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
            <KonexLogo size="md" className="mb-10 w-fit cursor-pointer" />
          </Link>

          <div className="mb-8">
            <h1 className="text-2xl font-bold tracking-tight mb-1.5" data-testid="text-signup-title">Create your account</h1>
            <p className="text-muted-foreground text-sm">Manage all your eSIMs in one place, for free.</p>
          </div>

          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField control={form.control} name="name" render={({ field }) => (
                <FormItem>
                  <FormLabel>Full name</FormLabel>
                  <FormControl>
                    <Input {...field} placeholder="Jane Smith" autoComplete="name" data-testid="input-name" className="h-11" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />

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
                  <FormLabel>Password</FormLabel>
                  <FormControl>
                    <div className="relative">
                      <Input {...field} type={showPass ? "text" : "password"} placeholder="Min. 8 characters" autoComplete="new-password" data-testid="input-password" className="h-11 pr-10" />
                      <button type="button" className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" onClick={() => setShowPass(v => !v)} data-testid="button-toggle-password">
                        {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />

              <FormField control={form.control} name="confirm" render={({ field }) => (
                <FormItem>
                  <FormLabel>Confirm password</FormLabel>
                  <FormControl>
                    <Input {...field} type="password" placeholder="••••••••" autoComplete="new-password" data-testid="input-confirm-password" className="h-11" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />

              <Button type="submit" className="w-full h-11 font-semibold" disabled={loading} data-testid="button-signup">
                {loading ? (
                  <span className="flex items-center gap-2">
                    <span className="w-4 h-4 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin" />
                    Creating account…
                  </span>
                ) : (
                  <span className="flex items-center gap-2">Create account <ArrowRight className="w-4 h-4" /></span>
                )}
              </Button>
            </form>
          </Form>

          <div className="mt-6 text-center text-sm text-muted-foreground">
            Already have an account?{" "}
            <Link href="/login">
              <span className="text-primary font-medium hover:underline cursor-pointer" data-testid="link-login">Sign in</span>
            </Link>
          </div>

          {/* Trust */}
          <div className="mt-8 pt-6 border-t space-y-2">
            {[
              { icon: CheckCircle, color: "text-emerald-500", text: "Free to create — no credit card required" },
              { icon: ShieldCheck, color: "text-primary",     text: "Your data is encrypted and never shared"  },
              { icon: Zap,         color: "text-amber-500",   text: "Instant access to your eSIM dashboard"    },
            ].map(t => (
              <div key={t.text} className="flex items-center gap-2 text-xs text-muted-foreground">
                <t.icon className={`w-3.5 h-3.5 flex-shrink-0 ${t.color}`} />
                {t.text}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Right panel */}
      <div className="hidden lg:flex flex-col justify-center px-16 py-12 w-[480px] bg-gradient-to-br from-primary/90 via-primary to-blue-700 text-white">
        <div className="space-y-8">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-white/60 mb-3">Join 5,000+ travellers</p>
            <h2 className="text-3xl font-bold leading-tight">Global data.<br />Zero hassle.</h2>
            <p className="text-white/70 mt-3 leading-relaxed">Create your free account and get instant access to eSIM plans for 190+ countries.</p>
          </div>
          <div className="space-y-4">
            {[
              { icon: Globe,       title: "190+ countries",        sub: "One account for all your destinations" },
              { icon: Wifi,        title: "Instant eSIM delivery", sub: "QR code in your inbox in seconds"      },
              { icon: ShieldCheck, title: "Manage everything",     sub: "Top up, track usage, view history"     },
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
