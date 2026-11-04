import { useState, useEffect, useMemo, useCallback } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Smartphone, Download, Copy, Check, ChevronRight,
  Hand, QrCode,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { qrImageUrl } from "@shared/qrImage";

// ─── Helpers ────────────────────────────────────────────────────────────────

function extractActivationCode(qrCodeUrl: string): string | null {
  try {
    return new URL(qrCodeUrl).searchParams.get("data");
  } catch {
    return null;
  }
}

function detectDevice(): "ios" | "android" | "desktop" {
  if (typeof navigator === "undefined") return "desktop";
  const ua = navigator.userAgent;
  if (/iPad|iPhone|iPod/.test(ua) && !(ua as any).MSStream) return "ios";
  if (/Android/.test(ua)) return "android";
  return "desktop";
}

// ─── Step lists ─────────────────────────────────────────────────────────────

const iosSteps = [
  { bold: "Hold down the QR code", rest: " above — iOS will offer to add your eSIM directly." },
  { bold: "Or: Open Settings", rest: " → Cellular → Add eSIM → Use QR Code." },
  { bold: "Scan the QR code", rest: " shown on screen (no second phone needed)." },
  { bold: "Label your plan", rest: ' e.g. "Travel Data" and tap Done.' },
  { bold: "Turn on Mobile Data", rest: " for the new eSIM when you land." },
];

const androidSteps = [
  { bold: "Hold down the QR code", rest: " above — many Android devices will offer to scan it." },
  { bold: "Or: Open Settings", rest: " → Network & Internet → SIMs → Add eSIM." },
  { bold: "Choose 'Download a SIM instead'", rest: " or 'Scan QR code'." },
  { bold: "Scan the QR code", rest: " displayed on screen." },
  { bold: "Follow the on-screen prompts", rest: " to complete activation." },
];

// ─── Sub-components ──────────────────────────────────────────────────────────

function StepList({ steps }: { steps: { bold: string; rest: string }[] }) {
  return (
    <ol className="space-y-2.5 mt-1">
      {steps.map((s, i) => (
        <li key={i} className="flex gap-3 text-sm">
          <span className="flex-shrink-0 w-5 h-5 rounded-full bg-primary/10 text-primary text-[11px] font-bold flex items-center justify-center mt-0.5">
            {i + 1}
          </span>
          <span className="text-muted-foreground leading-relaxed">
            <strong className="text-foreground font-medium">{s.bold}</strong>
            {s.rest}
          </span>
        </li>
      ))}
    </ol>
  );
}

function CopyButton({
  value,
  label,
  testId,
}: {
  value: string;
  label: string;
  testId?: string;
}) {
  const [copied, setCopied] = useState(false);
  const { toast } = useToast();

  const copy = useCallback(() => {
    navigator.clipboard.writeText(value).then(() => {
      setCopied(true);
      toast({ title: "Copied!", duration: 1800 });
      setTimeout(() => setCopied(false), 2000);
    });
  }, [value, toast]);

  return (
    <button
      onClick={copy}
      className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
      data-testid={testId}
    >
      {copied ? (
        <Check className="w-3.5 h-3.5 text-green-500" />
      ) : (
        <Copy className="w-3.5 h-3.5" />
      )}
      {copied ? "Copied" : label}
    </button>
  );
}

// ─── Main component ──────────────────────────────────────────────────────────

interface EsimQrDisplayProps {
  qrCode: string;
  iccid?: string | null;
  className?: string;
}

export function EsimQrDisplay({ qrCode, iccid, className = "" }: EsimQrDisplayProps) {
  const { toast } = useToast();
  const device = useMemo(() => detectDevice(), []);
  const [activeTab, setActiveTab] = useState<string>(
    device === "android" ? "android" : "ios",
  );

  const activationCode = useMemo(() => extractActivationCode(qrCode), [qrCode]);

  const largeQrUrl = useMemo(() => qrImageUrl(qrCode, 512), [qrCode]);
  const [imageStatus, setImageStatus] = useState<"loading" | "loaded" | "error">("loading");
  useEffect(() => { setImageStatus("loading"); }, [largeQrUrl]);

  const isMobile = device !== "desktop";

  return (
    <div className={`space-y-5 ${className}`}>

      {/* ── QR code + hold-to-install tip ─────────────────────────────────── */}
      <div className="flex flex-col items-center gap-4">

        {/* Hold-to-install callout (mobile only) */}
        {isMobile && (
          <div
            className="flex items-center gap-2.5 px-4 py-2.5 rounded-xl bg-primary/8 border border-primary/20 text-sm w-full max-w-xs"
            data-testid="callout-hold-to-install"
          >
            <Hand className="w-4 h-4 text-primary flex-shrink-0" />
            <span className="text-foreground font-medium">
              Hold down the QR code to install directly on this device
            </span>
          </div>
        )}

        {/* QR code image */}
        <div
          className="relative group cursor-pointer select-none"
          title={isMobile ? "Hold down to install eSIM" : "eSIM QR Code"}
          data-testid="container-qr-code"
        >
          {/* Pulsing ring (mobile hint) */}
          {isMobile && (
            <span className="absolute inset-0 rounded-2xl ring-4 ring-primary/20 animate-ping pointer-events-none" />
          )}
          <div className="p-4 bg-white rounded-2xl border-2 border-border shadow-md relative z-10">
            <img
              src={largeQrUrl}
              onLoad={() => setImageStatus("loaded")}
              onError={() => setImageStatus("error")}
              alt="eSIM QR Code — hold down to install"
              className="w-56 h-56 object-contain rounded-lg"
              draggable={false}
              data-testid="img-qr-code"
            />
          </div>
          {/* Desktop overlay hint */}
          {!isMobile && (
            <div className="absolute bottom-3 inset-x-3 bg-black/60 backdrop-blur-sm text-white text-[10px] text-center py-1.5 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity z-20 pointer-events-none">
              Scan with your phone camera or open on your phone to install
            </div>
          )}
        </div>

        {/* Download + badge row */}
        <div className="flex items-center gap-3">
          <Badge variant="outline" aria-live="polite">
            {imageStatus === "loaded" ? "QR code loaded" : imageStatus === "error" ? "QR image unavailable" : "Loading QR code"}
          </Badge>
          <a
            href={largeQrUrl}
            download="konex-esim-qrcode.png"
            className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
            data-testid="link-download-qr"
          >
            <Download className="w-3.5 h-3.5" />
            Save QR image
          </a>
        </div>
        {imageStatus === "error" && (
          <p role="alert" className="text-sm text-destructive text-center max-w-xs">
            The QR image could not load. Try opening “Save QR image” or contact support.
            Do not purchase another eSIM.
          </p>
        )}
      </div>

      {/* ── Installation instructions ─────────────────────────────────────── */}
      <div>
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="w-full rounded-xl h-10 mb-4">
            <TabsTrigger value="ios" className="flex-1 text-xs" data-testid="tab-ios">
              <Smartphone className="w-3.5 h-3.5 mr-1.5" />
              iPhone / iOS
            </TabsTrigger>
            <TabsTrigger value="android" className="flex-1 text-xs" data-testid="tab-android">
              <Smartphone className="w-3.5 h-3.5 mr-1.5" />
              Android
            </TabsTrigger>
            <TabsTrigger value="manual" className="flex-1 text-xs" data-testid="tab-manual">
              <QrCode className="w-3.5 h-3.5 mr-1.5" />
              Manual code
            </TabsTrigger>
          </TabsList>

          <TabsContent value="ios" className="mt-0">
            <StepList steps={iosSteps} />
          </TabsContent>

          <TabsContent value="android" className="mt-0">
            <StepList steps={androidSteps} />
          </TabsContent>

          <TabsContent value="manual" className="mt-0 space-y-4">
            <p className="text-sm text-muted-foreground">
              If the QR code isn't working, you can enter the activation code manually in your device's eSIM settings.
            </p>
            {activationCode && (
              <div className="space-y-1.5">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Activation code (LPA URI)
                </p>
                <div className="flex items-start gap-2 p-3 bg-muted rounded-xl">
                  <code
                    className="text-[11px] font-mono break-all flex-1 text-foreground leading-relaxed select-all"
                    data-testid="text-activation-code"
                  >
                    {activationCode}
                  </code>
                  <CopyButton value={activationCode} label="Copy" testId="button-copy-activation-code" />
                </div>
              </div>
            )}
            {iccid && (
              <div className="space-y-1.5">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  ICCID
                </p>
                <div className="flex items-center gap-2 p-3 bg-muted rounded-xl">
                  <code
                    className="text-[11px] font-mono flex-1 select-all text-foreground"
                    data-testid="text-iccid"
                  >
                    {iccid}
                  </code>
                  <CopyButton value={iccid} label="Copy" testId="button-copy-iccid" />
                </div>
              </div>
            )}
            {!activationCode && !iccid && (
              <p className="text-sm text-muted-foreground italic">
                Manual activation code not available. Please use the QR code above.
              </p>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
