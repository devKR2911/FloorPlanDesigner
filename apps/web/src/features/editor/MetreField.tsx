import { Input } from '@/components/ui/input'

interface MetreFieldProps {
  label: string
  value: number
  /** The smallest value accepted. */
  min?: number
  step?: number
  /** Applies the value. Returning false means it was refused and nothing changed. */
  onCommit: (value: number) => boolean | void
}

/** A length in metres, with its label above it. A refused value is marked, and put right on blur. */
export function MetreField({ label, value, min = 0.01, step = 0.05, onCommit }: MetreFieldProps) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="flex items-center gap-1.5">
        <Input
          type="number"
          aria-label={`${label} in metres`}
          // Uncontrolled, so typing is not fought by the model's value; the caller's `key` resets it.
          defaultValue={value}
          min={min}
          step={step}
          className="h-8"
          onChange={(event) => {
            const next = event.target.valueAsNumber
            const valid = Number.isFinite(next) && next >= min && onCommit(next) !== false
            event.target.setAttribute('aria-invalid', String(!valid))
          }}
          onBlur={(event) => {
            // A value that was refused is replaced by the one the element really has.
            event.target.value = String(value)
            event.target.setAttribute('aria-invalid', 'false')
          }}
        />
        <span className="text-muted-foreground">m</span>
      </span>
    </label>
  )
}
