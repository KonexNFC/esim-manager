import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Globe } from "lucide-react";

export default function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] px-4">
      <Globe className="w-16 h-16 text-muted-foreground mb-6" />
      <h1 className="text-3xl font-bold mb-2" data-testid="text-404-title">
        Page Not Found
      </h1>
      <p className="text-muted-foreground mb-6 text-center max-w-sm">
        The page you're looking for doesn't exist or has been moved.
      </p>
      <Link href="/">
        <Button data-testid="button-go-home">Back to Home</Button>
      </Link>
    </div>
  );
}
