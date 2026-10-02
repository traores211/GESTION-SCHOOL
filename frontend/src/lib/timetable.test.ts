import { describe, expect, it } from "vitest";
import { durationLabel, fromMinutes, gridBounds, layoutDay, sessionDetails, snap, subjectColor, toMinutes, visibleDays } from "./timetable";
import { compareValues, searchKey } from "./useTable";

describe("time helpers", () => {
  it("converts and snaps", () => {
    expect(toMinutes("08:30")).toBe(510);
    expect(fromMinutes(510)).toBe("08:30");
    expect(fromMinutes(-5)).toBe("00:00");
    expect(snap(517, 15)).toBe(510);
    expect(snap(523, 15)).toBe(525);
    expect(durationLabel("08:00", "09:30")).toBe("1 h 30");
    expect(durationLabel("08:00", "08:45")).toBe("45 min");
  });
});

describe("layoutDay", () => {
  it("puts overlapping sessions side by side and leaves the others full width", () => {
    const layout = layoutDay([
      { id: "a", startTime: "08:00", endTime: "10:00" },
      { id: "b", startTime: "09:00", endTime: "11:00" },
      { id: "c", startTime: "09:30", endTime: "10:30" },
      { id: "d", startTime: "12:00", endTime: "13:00" },
    ]);
    expect(layout.get("a")).toEqual({ lane: 0, lanes: 3 });
    expect(layout.get("b")).toEqual({ lane: 1, lanes: 3 });
    expect(layout.get("c")).toEqual({ lane: 2, lanes: 3 });
    expect(layout.get("d")).toEqual({ lane: 0, lanes: 1 });
  });

  it("reuses a lane once it is free", () => {
    const layout = layoutDay([
      { id: "a", startTime: "08:00", endTime: "12:00" },
      { id: "b", startTime: "08:00", endTime: "09:00" },
      { id: "c", startTime: "09:00", endTime: "10:00" },
    ]);
    expect(layout.get("c")).toEqual({ lane: 1, lanes: 2 });
  });
});

describe("grid", () => {
  const settings = { days: [1, 2, 3, 4, 5], start: "07:30", end: "17:15", breaks: [], slotMinutes: 30 };

  it("shows open days plus days that still have sessions", () => {
    expect(visibleDays(settings, [{ dayOfWeek: 6 }])).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it("rounds bounds to whole hours and includes sessions outside school hours", () => {
    expect(gridBounds(settings, [])).toEqual({ start: 420, end: 1080 });
    expect(gridBounds(settings, [{ startTime: "18:00", endTime: "19:30" }]).end).toBe(1200);
  });
});

describe("display helpers", () => {
  it("keeps a stable colour per subject and honours the chosen one", () => {
    expect(subjectColor({ name: "Maths" })).toBe(subjectColor({ name: "Maths" }));
    expect(subjectColor({ name: "Maths", color: "#123456" })).toBe("#123456");
  });

  it("describes a session according to the view", () => {
    const s = { class: { id: "c", name: "6e A" }, teacher: { id: "t", name: "Kouassi" }, room: { id: "r", name: "Salle 12" } };
    expect(sessionDetails(s, "class")).toEqual(["Kouassi", "Salle 12"]);
    expect(sessionDetails(s, "teacher")).toEqual(["6e A", "Salle 12"]);
    expect(sessionDetails({ ...s, teacher: null }, "room")).toEqual(["6e A"]);
  });
});

describe("table helpers", () => {
  it("searches without accents or case and sorts in French order with empties last", () => {
    expect(searchKey("Élève KOUAMÉ")).toBe("eleve kouame");
    expect(["b", "É", "a", ""].sort(compareValues)).toEqual(["a", "b", "É", ""]);
    expect([10, 9, 100].sort(compareValues)).toEqual([9, 10, 100]);
  });
});
