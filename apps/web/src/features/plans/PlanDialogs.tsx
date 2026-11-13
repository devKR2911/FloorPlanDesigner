import type { UnitSystem } from '@floorplandesigner/engine/schema'
import type { PlanSummary } from '@floorplandesigner/shared'
import { useState, type FormEvent } from 'react'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'

/** The longest plan name the backend accepts. */
export const MAX_PLAN_NAME_LENGTH = 200

interface PlanNameDialogProps {
  title: string
  description: string
  initialName: string
  /** The label of the button that confirms, such as "Create". */
  submitLabel: string
  /** True while the request is on its way. */
  pending: boolean
  /** What went wrong with the last attempt, if it failed. */
  error: string | null
  /**
   * Also asks for the plan's unit, metres or feet, starting on metres. For a new plan only: an
   * existing plan's unit is changed in the editor.
   */
  chooseUnits?: boolean
  /** `units` is the unit chosen, or metres when the dialog does not ask. */
  onSubmit: (name: string, units: UnitSystem) => void
  onClose: () => void
}

/** Asks for a plan's name, to create or rename it. Mount it to open it. */
export function PlanNameDialog({
  title,
  description,
  initialName,
  submitLabel,
  pending,
  error,
  chooseUnits = false,
  onSubmit,
  onClose,
}: PlanNameDialogProps) {
  const [name, setName] = useState(initialName)
  const [units, setUnits] = useState<UnitSystem>('metric')
  const trimmed = name.trim()

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (trimmed !== '' && !pending) onSubmit(trimmed, units)
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <form onSubmit={handleSubmit} className="grid gap-4">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>{description}</DialogDescription>
          </DialogHeader>
          <Input
            aria-label="Plan name"
            value={name}
            maxLength={MAX_PLAN_NAME_LENGTH}
            autoFocus
            onFocus={(event) => event.target.select()}
            onChange={(event) => setName(event.target.value)}
          />
          {chooseUnits && (
            <div className="flex flex-col gap-1.5 text-sm">
              <span id="plan-units-label" className="text-muted-foreground">
                Units
              </span>
              <ToggleGroup
                type="single"
                variant="outline"
                size="sm"
                aria-labelledby="plan-units-label"
                value={units}
                onValueChange={(value) => value && setUnits(value as UnitSystem)}
              >
                <ToggleGroupItem value="metric" className="px-3">
                  Metres
                </ToggleGroupItem>
                <ToggleGroupItem value="imperial" className="px-3">
                  Feet
                </ToggleGroupItem>
              </ToggleGroup>
            </div>
          )}
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={trimmed === '' || pending}>
              {submitLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

interface DeletePlanDialogProps {
  plan: PlanSummary
  onConfirm: () => void
  onClose: () => void
}

/** Asks before a plan is deleted. Mount it to open it. */
export function DeletePlanDialog({ plan, onConfirm, onClose }: DeletePlanDialogProps) {
  return (
    <AlertDialog open onOpenChange={(open) => !open && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete “{plan.name}”?</AlertDialogTitle>
          <AlertDialogDescription>
            The plan and everything drawn in it will be removed. This cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction variant="destructive" onClick={onConfirm}>
            Delete plan
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
