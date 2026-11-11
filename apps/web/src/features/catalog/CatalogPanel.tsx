import type { OpeningKind } from '@floorplandesigner/engine'
import { catalogByCategory } from './catalog'
import { openingPresets, type OpeningPreset } from './openings'

interface CatalogPanelProps {
  /** Called with an item's key when it is clicked. */
  onAdd: (key: string) => void
  /** Called with a door or window preset when it is clicked. */
  onAddOpening: (preset: OpeningPreset) => void
  /** False until the engine is ready to take items. */
  enabled: boolean
}

const tileClass =
  'flex w-full flex-col items-center gap-1 rounded-lg border bg-card p-1.5 text-center text-xs outline-none hover:bg-accent focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50'

/**
 * The catalogue as a side panel: doors and windows first, then furniture by category.
 * Clicking an entry adds it to the plan.
 */
export function CatalogPanel({ onAdd, onAddOpening, enabled }: CatalogPanelProps) {
  return (
    <aside
      aria-label="Furniture catalogue"
      className="flex w-60 shrink-0 flex-col overflow-y-auto border-r bg-background"
    >
      <p className="px-3 pt-3 text-xs text-muted-foreground">
        Click an item to add it to the plan, then drag it into place.
      </p>
      <Section title="Doors and windows">
        {openingPresets.map((preset) => (
          <li key={preset.key}>
            <button
              type="button"
              disabled={!enabled}
              onClick={() => onAddOpening(preset)}
              className={tileClass}
            >
              <OpeningSymbol kind={preset.kind} wide={preset.width > 1.4} />
              <span className="leading-tight">{preset.name}</span>
            </button>
          </li>
        ))}
      </Section>
      {catalogByCategory.map(({ category, items }) => (
        <Section key={category} title={category}>
          {items.map((item) => (
            <li key={item.key}>
              <button
                type="button"
                disabled={!enabled}
                onClick={() => onAdd(item.key)}
                className={tileClass}
              >
                <img
                  src={item.thumbnail}
                  alt=""
                  width={141}
                  height={141}
                  loading="lazy"
                  className="aspect-square w-full object-contain"
                />
                <span className="leading-tight">{item.name}</span>
              </button>
            </li>
          ))}
        </Section>
      ))}
    </aside>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="px-3 pt-4 last:pb-4">
      <h2 className="mb-2 text-xs font-semibold text-muted-foreground uppercase">{title}</h2>
      <ul className="grid grid-cols-2 gap-2">{children}</ul>
    </section>
  )
}

/** A door or window as it is drawn on a plan: a gap in a wall with a swing arc or glazing lines. */
function OpeningSymbol({ kind, wide }: { kind: OpeningKind; wide: boolean }) {
  // The gap runs from `from` to `to` in a wall drawn across a 48 × 32 box.
  const from = wide ? 6 : 12
  const to = wide ? 42 : 36
  const wall = 'fill-foreground/70'
  return (
    <svg viewBox="0 0 48 32" aria-hidden="true" className="h-14 w-full text-foreground/70">
      <rect x="0" y="22" width={from} height="6" className={wall} />
      <rect x={to} y="22" width={48 - to} height="6" className={wall} />
      <g fill="none" stroke="currentColor" strokeWidth="1.2">
        {kind === 'window' ? (
          <>
            <rect x={from} y="22" width={to - from} height="6" />
            <line x1={from} y1="25" x2={to} y2="25" />
          </>
        ) : wide ? (
          <>
            <line x1={from} y1="22" x2={from} y2="4" strokeWidth="2" />
            <path d={`M ${from} 4 A 18 18 0 0 1 24 22`} />
            <line x1={to} y1="22" x2={to} y2="4" strokeWidth="2" />
            <path d={`M ${to} 4 A 18 18 0 0 0 24 22`} />
          </>
        ) : (
          <>
            <line x1={from} y1="22" x2={from} y2="0" strokeWidth="2" />
            <path d={`M ${from} 0 A 22 22 0 0 1 ${to} 22`} />
          </>
        )}
      </g>
    </svg>
  )
}
