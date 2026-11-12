import type { Item, Opening, Wall } from '@floorplandesigner/engine'
import { ItemInspector } from './ItemInspector'
import { OpeningInspector } from './OpeningInspector'
import { WallInspector } from './WallInspector'

type OpeningChanges = Parameters<React.ComponentProps<typeof OpeningInspector>['onChange']>[0]

interface PropertiesPanelProps {
  /** At most one of the three is set: whatever is selected. */
  wall: Readonly<Wall> | null
  opening: Readonly<Opening> | null
  item: Readonly<Item> | null
  /** The selected item's name in the catalogue. */
  itemName: string
  onWallChange: (changes: { thickness?: number; height?: number }) => void
  /** Returns false, changing nothing, if the change does not fit the wall. */
  onOpeningChange: (changes: OpeningChanges) => boolean
  /** Sets the selected item's rotation, in radians. */
  onItemRotate: (rotation: number) => void
  /** Deletes whatever is selected. */
  onDelete: () => void
}

/**
 * The panel on the right of the editor that edits whatever is selected, in the 2D and the 3D
 * view alike. It is there with nothing selected too, so the canvas keeps its width.
 */
export function PropertiesPanel({
  wall,
  opening,
  item,
  itemName,
  onWallChange,
  onOpeningChange,
  onItemRotate,
  onDelete,
}: PropertiesPanelProps) {
  return (
    <aside
      aria-label="Properties"
      className="flex w-64 shrink-0 flex-col overflow-y-auto border-l bg-background p-4"
    >
      {wall ? (
        <WallInspector key={wall.id} wall={wall} onChange={onWallChange} onDelete={onDelete} />
      ) : opening ? (
        <OpeningInspector
          key={opening.id}
          opening={opening}
          onChange={onOpeningChange}
          onDelete={onDelete}
        />
      ) : item ? (
        <ItemInspector
          key={item.id}
          item={item}
          name={itemName}
          onRotate={onItemRotate}
          onDelete={onDelete}
        />
      ) : (
        <p className="text-sm text-muted-foreground">
          Select a wall, door, window or item to edit it.
        </p>
      )}
    </aside>
  )
}
