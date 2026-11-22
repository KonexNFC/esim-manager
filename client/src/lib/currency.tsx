import { createContext, useContext, useState } from "react";

export interface CurrencyDef {
  code: string;
  symbol: string;
  name: string;
  rate: number; // vs USD
  decimals: number;
}

// Approximate rates — display only. Checkout processes in USD via Stripe.
export const CURRENCIES: CurrencyDef[] = [
  { code: "USD", symbol: "$",    name: "US Dollar",         rate: 1,      decimals: 2 },
  { code: "GBP", symbol: "£",    name: "British Pound",     rate: 0.79,   decimals: 2 },
  { code: "EUR", symbol: "€",    name: "Euro",              rate: 0.93,   decimals: 2 },
  { code: "NGN", symbol: "₦",    name: "Nigerian Naira",    rate: 1620,   decimals: 0 },
  { code: "AED", symbol: "AED ", name: "UAE Dirham",        rate: 3.67,   decimals: 2 },
  { code: "GHS", symbol: "GH₵",  name: "Ghanaian Cedi",    rate: 15.8,   decimals: 2 },
  { code: "CAD", symbol: "C$",   name: "Canadian Dollar",   rate: 1.38,   decimals: 2 },
  { code: "AUD", symbol: "A$",   name: "Australian Dollar", rate: 1.56,   decimals: 2 },
  { code: "INR", symbol: "₹",    name: "Indian Rupee",      rate: 83.9,   decimals: 0 },
  { code: "ZAR", symbol: "R",    name: "South African Rand",rate: 18.6,   decimals: 2 },
  { code: "JPY", symbol: "¥",    name: "Japanese Yen",      rate: 152,    decimals: 0 },
  { code: "KES", symbol: "KSh",  name: "Kenyan Shilling",   rate: 129,    decimals: 0 },
];

const STORAGE_KEY = "konex_currency";

export function resolveCurrency(code: string | null | undefined): CurrencyDef {
  return CURRENCIES.find(c => c.code === code) ?? CURRENCIES.find(c => c.code === "GBP")!;
}

export function readDisplayCurrency(read: () => string | null): string {
  try { return resolveCurrency(read()).code; } catch { return "GBP"; }
}

export function formatCharge(amount: number, code = "USD"): string {
  return new Intl.NumberFormat("en-GB", {
    style: "currency", currency: code, currencyDisplay: "code",
  }).format(amount);
}

/** Conversion is presentation only; never use this result to create a charge. */
export function formatDisplay(amount: number, targetCode: string, sourceCode = "USD"): string {
  const source = CURRENCIES.find(c => c.code === sourceCode.toUpperCase());
  const target = resolveCurrency(targetCode);
  if (!source) return formatCharge(amount, sourceCode); // Never invent an exchange rate.
  const converted = amount / source.rate * target.rate;
  const fixed = converted.toFixed(target.decimals);
  const [whole, fraction] = fixed.split(".");
  return `${source.code === target.code ? "" : "≈ "}${target.symbol}${whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}${fraction === undefined ? "" : `.${fraction}`}`;
}

export function Price({ amount, source = "USD" }: { amount: number; source?: string }) {
  const { currency } = useCurrency();
  return <>{formatDisplay(amount, currency.code, source)}</>;
}

interface CurrencyContextValue {
  currency: CurrencyDef;
  setCurrencyCode: (code: string) => void;
  /** Format a USD amount into the selected currency string, e.g. "£12.50" */
  fmt: (usd: number) => string;
  /**
   * Whether the displayed currency is approximate (show a "≈" prefix when true).
   * USD-source amounts converted to any other currency are estimates.
   */
  isApprox: boolean;
}

const CurrencyContext = createContext<CurrencyContextValue | null>(null);

export function CurrencyProvider({ children }: { children: React.ReactNode }) {
  const [currencyCode, setCurrencyCodeState] = useState<string>(() => {
    return readDisplayCurrency(() => localStorage.getItem(STORAGE_KEY));
  });

  const currency = resolveCurrency(currencyCode);

  const setCurrencyCode = (code: string) => {
    const validCode = resolveCurrency(code).code;
    setCurrencyCodeState(validCode);
    try { localStorage.setItem(STORAGE_KEY, validCode); } catch {}
  };

  const fmt = (usd: number): string => {
    const converted = usd * currency.rate;
    const fixed = converted.toFixed(currency.decimals);
    // Add thousands separator for large amounts
    const parts = fixed.split(".");
    parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    return `${currency.symbol}${parts.join(".")}`;
  };

  const isApprox = currency.code !== "USD";

  return (
    <CurrencyContext.Provider value={{ currency, setCurrencyCode, fmt, isApprox }}>
      {children}
    </CurrencyContext.Provider>
  );
}

export function useCurrency(): CurrencyContextValue {
  const ctx = useContext(CurrencyContext);
  if (!ctx) throw new Error("useCurrency must be used within CurrencyProvider");
  return ctx;
}
