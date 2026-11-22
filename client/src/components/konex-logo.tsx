interface KonexLogoProps {
  size?: "sm" | "md" | "lg";
  showWordmark?: boolean;
  className?: string;
}

const sizes = {
  sm: { mark: "w-7 h-7", text: "text-sm",  radius: "rounded-lg" },
  md: { mark: "w-8 h-8", text: "text-base", radius: "rounded-lg" },
  lg: { mark: "w-10 h-10", text: "text-xl", radius: "rounded-xl" },
};

export function KonexLogo({ size = "md", showWordmark = true, className = "" }: KonexLogoProps) {
  const s = sizes[size];

  return (
    <div className={`flex items-center gap-2.5 ${className}`}>
      {/* Icon mark */}
      <div
        className={`${s.mark} ${s.radius} flex-shrink-0 flex items-center justify-center`}
        style={{ background: "hsl(var(--primary))", color: "hsl(var(--primary-foreground))" }}
        aria-hidden="true"
      >
        {/* Signal arc connectivity mark */}
        <svg
          viewBox="0 0 20 20"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="w-[62%] h-[62%]"
        >
          {/* Transmit dot */}
          <circle cx="4" cy="16" r="2.2" fill="currentColor" />

          {/* Inner arc */}
          <path
            d="M4 11 A5 5 0 0 1 9 16"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            fill="none"
          />

          {/* Middle arc */}
          <path
            d="M4 7 A9 9 0 0 1 13 16"
            stroke="currentColor"
            strokeWidth="1.9"
            strokeLinecap="round"
            fill="none"
            opacity="0.7"
          />

          {/* Outer arc */}
          <path
            d="M4 3 A13 13 0 0 1 17 16"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            fill="none"
            opacity="0.4"
          />
        </svg>
      </div>

      {/* Wordmark */}
      {showWordmark && (
        <span
          className={`font-display font-bold tracking-tight leading-none ${s.text}`}
          style={{ fontFamily: "var(--font-display)" }}
        >
          Konex
        </span>
      )}
    </div>
  );
}
