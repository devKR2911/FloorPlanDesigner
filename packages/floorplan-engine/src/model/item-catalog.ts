import { Emitter, type Listener } from '../core/events.js'
import {
  itemDefinitionSchema,
  type ItemDefinition,
  type ItemShape,
  type ItemSize,
} from '../schema/item-definition.js'

/** The size used for an item whose key is not in the catalogue, so it still shows. */
export const FALLBACK_ITEM_SIZE: ItemSize = { width: 0.5, height: 0.5, depth: 0.5 }

export type ItemCatalogEvents = {
  change: undefined
}

/** The item definitions the app passed in, looked up by key. */
export class ItemCatalog {
  private definitions = new Map<string, ItemDefinition>()
  private shapes = new Map<string, ItemShape>()
  private readonly emitter = new Emitter<ItemCatalogEvents>()

  /** Replaces the definitions. Throws a `ZodError` if one is not valid. */
  set(definitions: readonly ItemDefinition[]): void {
    const parsed = definitions.map((definition) => itemDefinitionSchema.parse(definition))
    this.definitions = new Map(parsed.map((definition) => [definition.key, definition]))
    this.shapes = new Map(
      parsed.map(({ key, size, footprint }) => [key, footprint ? { ...size, footprint } : size]),
    )
    this.emitter.emit('change', undefined)
  }

  get(key: string): ItemDefinition | undefined {
    return this.definitions.get(key)
  }

  get all(): readonly ItemDefinition[] {
    return [...this.definitions.values()]
  }

  /** An item's size, or `FALLBACK_ITEM_SIZE` when its key is unknown. */
  readonly sizeOf = (key: string): ItemSize => this.definitions.get(key)?.size ?? FALLBACK_ITEM_SIZE

  /**
   * An item's size with its outline on the floor, for overlap checks, hit-testing and drawing.
   * An unknown key gets `FALLBACK_ITEM_SIZE`, which is a plain rectangle.
   */
  readonly shapeOf = (key: string): ItemShape => this.shapes.get(key) ?? FALLBACK_ITEM_SIZE

  on<Name extends keyof ItemCatalogEvents>(
    name: Name,
    listener: Listener<ItemCatalogEvents[Name]>,
  ): () => void {
    return this.emitter.on(name, listener)
  }
}
