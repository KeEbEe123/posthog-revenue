export function currency(n: number, code = "USD"): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: code,
    maximumFractionDigits: 0,
  }).format(n);
}

export function currencyExact(n: number, code = "USD"): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: code,
    maximumFractionDigits: 2,
  }).format(n);
}

export function percent(n: number): string {
  return `${(n * 100).toFixed(1)}%`;
}

export function compactMonth(month: string): string {
  // "2025-06" -> "Jun '25"
  const [y, m] = month.split("-").map(Number);
  const names = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${names[m - 1]} '${String(y).slice(2)}`;
}
