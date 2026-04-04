import { useState } from "react";
import { Link } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Wifi, CheckCircle, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";

const schema = z.object({ email: z.string().email("Enter a valid email") });
type FormData = z.infer<typeof schema>;

export default function ForgotPassword() {
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);

  const form = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { email: "" },
  });

  async function onSubmit() {
    setLoading(true);
    await new Promise(r => setTimeout(r, 800));
    setSent(true);
    setLoading(false);
  }

  return (
    <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center px-4 py-16">
      <div className="w-full max-w-md">
        <div className="flex items-center gap-2 mb-10">
          <div className="flex items-center justify-center w-9 h-9 rounded-md bg-primary">
            <Wifi className="w-5 h-5 text-primary-foreground" />
          </div>
          <span className="font-semibold text-lg tracking-tight">Konex</span>
        </div>

        {sent ? (
          <div className="text-center" data-testid="reset-success">
            <div className="flex justify-center mb-5">
              <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center">
                <CheckCircle className="w-7 h-7 text-primary" />
              </div>
            </div>
            <h1 className="text-2xl font-bold mb-3">Check your email</h1>
            <p className="text-muted-foreground mb-8">
              If an account exists for that email, we've sent a password reset link. It may take a minute to arrive.
            </p>
            <Link href="/login">
              <Button variant="outline" className="w-full" data-testid="button-back-login">
                <ArrowLeft className="w-4 h-4 mr-2" /> Back to sign in
              </Button>
            </Link>
          </div>
        ) : (
          <>
            <div className="mb-8">
              <h1 className="text-3xl font-bold tracking-tight mb-2">Reset password</h1>
              <p className="text-muted-foreground">Enter your email and we'll send a reset link.</p>
            </div>

            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email address</FormLabel>
                      <FormControl>
                        <Input {...field} type="email" placeholder="you@example.com" data-testid="input-email" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <Button type="submit" className="w-full" disabled={loading} data-testid="button-reset">
                  {loading ? "Sending…" : "Send reset link"}
                </Button>
              </form>
            </Form>

            <p className="mt-6 text-sm text-center text-muted-foreground">
              <Link href="/login">
                <span className="text-primary hover:underline cursor-pointer font-medium" data-testid="link-back-login">
                  <ArrowLeft className="w-3 h-3 inline mr-1" />Back to sign in
                </span>
              </Link>
            </p>
          </>
        )}
      </div>
    </div>
  );
}
