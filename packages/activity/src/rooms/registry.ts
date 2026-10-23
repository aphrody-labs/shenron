// SPDX-License-Identifier: Apache-2.0
import { InstanceIdSchema, type CloseReason } from "../protocol";
import { Room, type Outbound, type RoomOptions } from "./room";

export interface RegistryOptions extends Omit<RoomOptions, "instanceId"> {
  /** Rooms alive at once; a new instance is refused beyond it. */
  readonly maxRooms?: number;
  /** Called once per room when it is dropped. */
  readonly onRoomClosed?: (instanceId: string, reason: CloseReason) => void;
}

export interface RoomOutput {
  readonly instanceId: string;
  readonly out: Outbound[];
}

export const DEFAULT_MAX_ROOMS = 500;

/**
 * The rooms of the Activity server, one per Discord `instance_id`. The registry is the only place
 * that creates rooms, caps their number, and drops the closed ones.
 */
export class RoomRegistry {
  readonly #rooms = new Map<string, Room>();
  readonly #options: RegistryOptions;
  readonly #maxRooms: number;

  constructor(options: RegistryOptions) {
    this.#options = options;
    this.#maxRooms = options.maxRooms ?? DEFAULT_MAX_ROOMS;
  }

  get size(): number {
    return this.#rooms.size;
  }

  /** The room of an instance, if it exists and is still open. */
  get(instanceId: string): Room | undefined {
    const room = this.#rooms.get(instanceId);
    return room && !room.isClosed ? room : undefined;
  }

  /**
   * The room of an instance, created on first use. `null` when the instance id is not acceptable or
   * the server holds too many rooms. A room that closed (expired, emptied) is replaced by a fresh one:
   * the Discord instance is still alive, only our state ended.
   */
  open(instanceId: string): Room | null {
    if (!InstanceIdSchema.safeParse(instanceId).success) return null;
    const current = this.#rooms.get(instanceId);
    if (current && !current.isClosed) return current;
    if (current) this.#drop(instanceId, current);
    if (this.#rooms.size >= this.#maxRooms) {
      this.tick();
      if (this.#rooms.size >= this.#maxRooms) return null;
    }
    const { maxRooms: _maxRooms, onRoomClosed: _onRoomClosed, ...roomOptions } = this.#options;
    const room = new Room({ ...roomOptions, instanceId });
    this.#rooms.set(instanceId, room);
    return room;
  }

  /** Earliest `nextDeadline` of the rooms, for scheduling the next `tick`. */
  nextDeadline(): number | null {
    let earliest: number | null = null;
    for (const room of this.#rooms.values()) {
      const deadline = room.nextDeadline();
      if (deadline !== null && (earliest === null || deadline < earliest)) earliest = deadline;
    }
    return earliest;
  }

  /** Ticks every room, then drops the ones that closed. Returns what each room has to send. */
  tick(): RoomOutput[] {
    const outputs: RoomOutput[] = [];
    for (const [instanceId, room] of this.#rooms) {
      const out = room.tick();
      if (out.length > 0) outputs.push({ instanceId, out });
      if (room.isClosed) this.#drop(instanceId, room);
    }
    return outputs;
  }

  /** Closes every room (server shutdown). */
  closeAll(reason: CloseReason): RoomOutput[] {
    const outputs: RoomOutput[] = [];
    for (const [instanceId, room] of this.#rooms) {
      const out = room.close(reason);
      if (out.length > 0) outputs.push({ instanceId, out });
      this.#drop(instanceId, room);
    }
    return outputs;
  }

  #drop(instanceId: string, room: Room): void {
    this.#rooms.delete(instanceId);
    this.#options.onRoomClosed?.(instanceId, room.closedReason ?? "shutdown");
  }
}
