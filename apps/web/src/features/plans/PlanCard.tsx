import type { PlanSummary } from '@floorplandesigner/shared'
import { Link } from '@tanstack/react-router'
import { Copy, Ellipsis, FolderOpen, PencilLine, SquareDashed, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { formatExactTime, formatRelativeTime } from './relative-time'

interface PlanCardProps {
  plan: PlanSummary
  onRename: () => void
  onDuplicate: () => void
  onDelete: () => void
}

/** One plan in the list: its picture, name and age. Clicking it opens the plan. */
export function PlanCard({ plan, onRename, onDuplicate, onDelete }: PlanCardProps) {
  const open = { to: '/plans/$planId', params: { planId: plan.id } } as const
  return (
    <li className="relative overflow-hidden rounded-xl border bg-card transition-shadow focus-within:ring-3 focus-within:ring-ring/50 hover:shadow-md">
      <Link {...open} className="block outline-none">
        <div className="flex aspect-[8/5] items-center justify-center border-b bg-muted/40">
          {plan.thumbnail ? (
            <img src={plan.thumbnail} alt="" className="size-full object-contain" />
          ) : (
            <SquareDashed aria-hidden="true" className="size-10 text-muted-foreground/40" />
          )}
        </div>
        <div className="p-3 pr-11">
          <h2 className="truncate text-sm font-medium">{plan.name}</h2>
          <p className="text-xs text-muted-foreground">
            Changed{' '}
            <time dateTime={plan.updatedAt} title={formatExactTime(plan.updatedAt)}>
              {formatRelativeTime(plan.updatedAt)}
            </time>
          </p>
        </div>
      </Link>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={`Actions for ${plan.name}`}
            className="absolute right-2 bottom-3"
          >
            <Ellipsis />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem asChild>
            <Link {...open}>
              <FolderOpen />
              Open
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={onRename}>
            <PencilLine />
            Rename
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={onDuplicate}>
            <Copy />
            Duplicate
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onSelect={onDelete}>
            <Trash2 />
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </li>
  )
}
