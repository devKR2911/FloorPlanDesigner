import { formatArea, type Room } from '@floorplandesigner/engine'
import { Input } from '@/components/ui/input'

interface RoomInspectorProps {
  room: Room
  /** Sets the room's name; an empty name removes it. */
  onName: (name: string) => void
}

/** Shows the selected room and edits its name. A room has no delete: only its walls can go. */
export function RoomInspector({ room, onName }: RoomInspectorProps) {
  return (
    <div className="flex flex-col gap-3">
      <h2 className="text-sm font-semibold">{room.name ?? 'Room'}</h2>
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-muted-foreground">Name</span>
        <Input
          type="text"
          aria-label="Room name"
          // Uncontrolled, so the model's trimmed copy does not fight typing; reset on blur.
          defaultValue={room.name ?? ''}
          maxLength={60}
          placeholder="Kitchen"
          className="h-8"
          onChange={(event) => onName(event.target.value)}
          onBlur={(event) => {
            event.target.value = room.name ?? ''
          }}
        />
      </label>
      <div className="flex flex-col gap-1 text-sm">
        <span className="text-muted-foreground">Area</span>
        <span>{formatArea(room.area)}</span>
      </div>
    </div>
  )
}
