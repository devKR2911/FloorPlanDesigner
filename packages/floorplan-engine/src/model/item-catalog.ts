import { Emitter, type Listener } from '../core/events.js'
import {
  itemDefinitionSchema,
  type ItemDefinition,
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
  private readonly emitter = new Emitter<ItemCatalogEvents>()

  /** Replaces the definitions. Throws a `ZodError` if one is not valid. */
  set(definitions: readonly ItemDefinition[]): void {
    const parsed = definitions.map((definition) => itemDefinitionSchema.parse(definition))
    this.definitions = new Map(parsed.map((definition) => [definition.key, definition]))
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

  on<Name extends keyof ItemCatalogEvents>(
    name: Name,
    listener: Listener<ItemCatalogEvents[Name]>,
  ): () => void {
    return this.emitter.on(name, listener)
  }
}
