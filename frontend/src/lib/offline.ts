/**
 * Offline roll call. When the network is down, the roll call is kept on the device and sent when
 * the connection is back. Marking attendance is idempotent on the server (one record per pupil,
 * class and day), so sending the same roll call twice is harmless.
 */

export interface QueuedRollCall {
  /** One entry per class and day: a later roll call replaces the earlier one. */
  key: string;
  classId: string;
  className: string;
  date: string;
  records: { studentId: string; status: string }[];
  queuedAt: string;
}

export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

const QUEUE_KEY = "schoolerp_offline_rollcalls";
const CACHE_PREFIX = "schoolerp_cache:";

function storage(): KeyValueStore | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

export function readQueue(store: KeyValueStore | null = storage()): QueuedRollCall[] {
  try {
    const parsed = JSON.parse(store?.getItem(QUEUE_KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeQueue(queue: QueuedRollCall[], store: KeyValueStore | null) {
  if (!store) return;
  if (queue.length) store.setItem(QUEUE_KEY, JSON.stringify(queue));
  else store.removeItem(QUEUE_KEY);
}

/** Adds a roll call to the queue (replacing an earlier one for the same class and day). */
export function queueRollCall(entry: Omit<QueuedRollCall, "key" | "queuedAt">, store: KeyValueStore | null = storage(), now = new Date()): QueuedRollCall[] {
  const key = `${entry.classId}|${entry.date}`;
  const queue = [...readQueue(store).filter((q) => q.key !== key), { ...entry, key, queuedAt: now.toISOString() }];
  writeQueue(queue, store);
  return queue;
}

/** True for failures worth retrying later: no network, or the server did not answer. */
export function isNetworkFailure(err: unknown): boolean {
  if (err instanceof TypeError) return true;
  const status = (err as { status?: number } | null)?.status;
  return status === 502 || status === 503 || status === 504;
}

/**
 * Sends the queued roll calls, oldest first. Stops at the first network failure (still offline);
 * a roll call the server refuses for another reason (class deleted, access removed) is dropped
 * and reported, so it never blocks the queue.
 */
export async function flushQueue(
  send: (entry: QueuedRollCall) => Promise<unknown>,
  store: KeyValueStore | null = storage(),
): Promise<{ sent: QueuedRollCall[]; rejected: { entry: QueuedRollCall; reason: string }[]; remaining: number }> {
  const sent: QueuedRollCall[] = [];
  const rejected: { entry: QueuedRollCall; reason: string }[] = [];
  let queue = readQueue(store);
  for (const entry of [...queue]) {
    try {
      await send(entry);
      sent.push(entry);
    } catch (err) {
      if (isNetworkFailure(err)) break;
      rejected.push({ entry, reason: err instanceof Error ? err.message : "Refusé par le serveur" });
    }
    // Re-read: another tab may have added a roll call meanwhile.
    queue = readQueue(store).filter((q) => q.key !== entry.key || q.queuedAt !== entry.queuedAt);
    writeQueue(queue, store);
  }
  return { sent, rejected, remaining: readQueue(store).length };
}

/** Keeps the last successful answer of a read request, to show it when the network is down. */
export function remember<T>(key: string, value: T, store: KeyValueStore | null = storage()) {
  try {
    store?.setItem(CACHE_PREFIX + key, JSON.stringify({ at: Date.now(), value }));
  } catch {
    // storage full or unavailable: the cache is only a convenience
  }
}

export function recall<T>(key: string, store: KeyValueStore | null = storage()): { value: T; at: number } | null {
  try {
    const raw = store?.getItem(CACHE_PREFIX + key);
    return raw ? (JSON.parse(raw) as { value: T; at: number }) : null;
  } catch {
    return null;
  }
}
