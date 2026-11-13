import { fromFeetAndInches, toFeetAndInches } from '@floorplandesigner/engine'
import { useRef, type FocusEvent } from 'react'
import { Input } from '@/components/ui/input'
import { useUnits } from './units-context'

interface LengthFieldProps {
  label: string
  /** The length, in metres. */
  value: number
  /** The smallest value accepted, in metres. */
  min?: number
  /** The arrow step of the metres field. */
  step?: number
  /** Applies the value, in metres. Returning false means it was refused and nothing changed. */
  onCommit: (value: number) => boolean | void
}

/**
 * A length with its label above it, shown and typed in the plan's unit: one field in metres, or
 * two fields for feet and inches. The value passed on is always metres. A refused value is
 * marked, and put right on blur.
 */
export function LengthField(props: LengthFieldProps) {
  return useUnits() === 'imperial' ? <FeetInchesField {...props} /> : <MetreField {...props} />
}

function MetreField({ label, value, min = 0.01, step = 0.05, onCommit }: LengthFieldProps) {
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

/** What a number box holds: 0 when empty, `null` when it is not a number or is negative. */
function read(input: HTMLInputElement | null): number | null {
  if (!input) return null
  if (input.value.trim() === '') return 0
  const number = input.valueAsNumber
  return Number.isFinite(number) && number >= 0 ? number : null
}

/** Inches to at most three decimals, enough for an eighth, without trailing zeros. */
function inchText(inches: number): string {
  return String(Number(inches.toFixed(3)))
}

function FeetInchesField({ label, value, min = 0.01, onCommit }: LengthFieldProps) {
  const feetBox = useRef<HTMLInputElement>(null)
  const inchBox = useRef<HTMLInputElement>(null)
  const shown = toFeetAndInches(value)

  const mark = (invalid: boolean) => {
    for (const box of [feetBox.current, inchBox.current]) {
      box?.setAttribute('aria-invalid', String(invalid))
    }
  }

  // Either box changing commits the two together, as one length in metres.
  const commit = () => {
    const feet = read(feetBox.current)
    const inches = read(inchBox.current)
    if (feet === null || inches === null) return mark(true)
    const metres = fromFeetAndInches(feet, inches)
    mark(!(metres >= min && onCommit(metres) !== false))
  }

  // Leaving the field (not moving between its two boxes) shows the value the element really
  // has: a refused value is put right, and 14 in becomes 1 ft 2 in.
  const restore = (event: FocusEvent<HTMLElement>) => {
    if (event.currentTarget.contains(event.relatedTarget)) return
    if (feetBox.current) feetBox.current.value = String(shown.feet)
    if (inchBox.current) inchBox.current.value = inchText(shown.inches)
    mark(false)
  }

  return (
    <div role="group" aria-label={label} className="flex flex-col gap-1 text-sm" onBlur={restore}>
      <span className="text-muted-foreground">{label}</span>
      <span className="flex items-center gap-1.5">
        <Input
          ref={feetBox}
          type="number"
          aria-label={`${label}, feet`}
          // Uncontrolled, like the metres field.
          defaultValue={shown.feet}
          min={0}
          step={1}
          className="h-8 min-w-0"
          onChange={commit}
        />
        <span className="text-muted-foreground">ft</span>
        <Input
          ref={inchBox}
          type="number"
          aria-label={`${label}, inches`}
          defaultValue={inchText(shown.inches)}
          min={0}
          step={1}
          className="h-8 min-w-0"
          onChange={commit}
        />
        <span className="text-muted-foreground">in</span>
      </span>
    </div>
  )
}
