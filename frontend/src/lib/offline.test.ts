import { describe, expect, it } from "vitest";
import { flushQueue, isNetworkFailure, queueRollCall, readQueue, recall, remember, type KeyValueStore } from "./offline";

function memoryStore(): KeyValueStore & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return { data, getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v), removeItem: (k) => void data.delete(k) };
}

const roll = (classId: string, date: string, status = "ABSENT") => ({ classId, className: `Classe ${classId}`, date, records: [{ studentId: "s1", status }] });

describe("offline roll call queue", () => {
  it("keeps one roll call per class and day, the latest wins", () => {
    const store = memoryStore();
    queueRollCall(roll("c1", "2026-10-05"), store);
    queueRollCall(roll("c2", "2026-10-05"), store);
    const queue = queueRollCall(roll("c1", "2026-10-05", "RETARD"), store);
    expect(queue).toHaveLength(2);
    expect(queue.find((q) => q.classId === "c1")?.records[0].status).toBe("RETARD");
    expect(readQueue(store)).toHaveLength(2);
  });

  it("sends everything when the network is back and empties the queue", async () => {
    const store = memoryStore();
    queueRollCall(roll("c1", "2026-10-05"), store);
    queueRollCall(roll("c2", "2026-10-06"), store);
    const sentKeys: string[] = [];
    const result = await flushQueue(async (e) => void sentKeys.push(e.key), store);
    expect(sentKeys).toEqual(["c1|2026-10-05", "c2|2026-10-06"]);
    expect(result).toMatchObject({ remaining: 0 });
    expect(result.sent).toHaveLength(2);
    expect(store.data.size).toBe(0);
  });

  it("stops at the first network failure and keeps the rest for later", async () => {
    const store = memoryStore();
    queueRollCall(roll("c1", "2026-10-05"), store);
    queueRollCall(roll("c2", "2026-10-05"), store);
    let calls = 0;
    const result = await flushQueue(async () => {
      calls++;
      if (calls === 2) throw new TypeError("Failed to fetch");
    }, store);
    expect(result.sent).toHaveLength(1);
    expect(result.remaining).toBe(1);
    expect(readQueue(store)[0].classId).toBe("c2");
  });

  it("drops a roll call the server refuses, without blocking the others", async () => {
    const store = memoryStore();
    queueRollCall(roll("deleted", "2026-10-05"), store);
    queueRollCall(roll("c2", "2026-10-05"), store);
    const result = await flushQueue(async (e) => {
      if (e.classId === "deleted") throw Object.assign(new Error("Classe introuvable"), { status: 404 });
    }, store);
    expect(result.rejected).toEqual([{ entry: expect.objectContaining({ classId: "deleted" }), reason: "Classe introuvable" }]);
    expect(result.sent).toHaveLength(1);
    expect(result.remaining).toBe(0);
  });

  it("tells network failures from refusals", () => {
    expect(isNetworkFailure(new TypeError("Failed to fetch"))).toBe(true);
    expect(isNetworkFailure({ status: 503 })).toBe(true);
    expect(isNetworkFailure({ status: 400 })).toBe(false);
    expect(isNetworkFailure(new Error("Classe introuvable"))).toBe(false);
  });

  it("survives a damaged or missing storage", () => {
    const store = memoryStore();
    store.setItem("schoolerp_offline_rollcalls", "{not json");
    expect(readQueue(store)).toEqual([]);
    expect(readQueue(null)).toEqual([]);
    expect(queueRollCall(roll("c1", "2026-10-05"), null)).toHaveLength(1);
  });
});

describe("last known answers", () => {
  it("remembers and recalls a list for offline use", () => {
    const store = memoryStore();
    remember("classes", [{ id: "c1", name: "6ème A" }], store);
    expect(recall<{ id: string }[]>("classes", store)?.value).toEqual([{ id: "c1", name: "6ème A" }]);
    expect(recall("unknown", store)).toBeNull();
    expect(recall("classes", null)).toBeNull();
  });
});
