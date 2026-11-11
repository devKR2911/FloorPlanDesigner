import { catalogByCategory } from './catalog'

interface CatalogPanelProps {
  /** Called with an item's key when it is clicked. */
  onAdd: (key: string) => void
  /** False until the engine is ready to take items. */
  enabled: boolean
}

/** The furniture catalogue as a side panel, grouped by category. Clicking an item adds it. */
export function CatalogPanel({ onAdd, enabled }: CatalogPanelProps) {
  return (
    <aside
      aria-label="Furniture catalogue"
      className="flex w-60 shrink-0 flex-col overflow-y-auto border-r bg-background"
    >
      <p className="px-3 pt-3 text-xs text-muted-foreground">
        Click an item to add it to the plan, then drag it into place.
      </p>
      {catalogByCategory.map(({ category, items }) => (
        <section key={category} className="px-3 pt-4 last:pb-4">
          <h2 className="mb-2 text-xs font-semibold text-muted-foreground uppercase">{category}</h2>
          <ul className="grid grid-cols-2 gap-2">
            {items.map((item) => (
              <li key={item.key}>
                <button
                  type="button"
                  disabled={!enabled}
                  onClick={() => onAdd(item.key)}
                  className="flex w-full flex-col items-center gap-1 rounded-lg border bg-card p-1.5 text-center text-xs outline-none hover:bg-accent focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50"
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
          </ul>
        </section>
      ))}
    </aside>
  )
}
