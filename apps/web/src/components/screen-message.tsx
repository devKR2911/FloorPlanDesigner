/** A short message in the middle of an otherwise empty screen. */
export function ScreenMessage({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-dvh flex-col items-center justify-center gap-3 p-6 text-center text-sm text-muted-foreground">
      {children}
    </div>
  )
}
