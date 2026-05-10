export function BrandLogo({ className }: { className?: string }) {
  return (
    <div className={`flex items-center gap-3 ${className ?? ""}`} aria-label="B. Gilman & Co">
      <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/20 bg-white text-sm font-bold text-black">
        BG
      </div>
      <span className="text-xl font-semibold tracking-normal text-white">B. Gilman &amp; Co</span>
    </div>
  )
}
