import { describe, expect, it } from "vitest";
import { ageBand, classOf } from "../src/classes";

const run2026 = new Date(Date.UTC(2026, 6, 11));

describe("ageBand — calendar-year boundaries (P7-D13-A)", () => {
  it("age 13 => U14, age 14 => U18 boundary", () => {
    expect(ageBand(2013, run2026)).toBe("U14"); // 13
    expect(ageBand(2012, run2026)).toBe("U18"); // 14
  });

  it("age 17 => U18, age 18 => open boundary", () => {
    expect(ageBand(2009, run2026)).toBe("U18"); // 17
    expect(ageBand(2008, run2026)).toBe("open"); // 18
  });

  it("age 39 => open, age 40 => O40 boundary", () => {
    expect(ageBand(1987, run2026)).toBe("open"); // 39
    expect(ageBand(1986, run2026)).toBe("O40"); // 40
  });

  it("age 59 => O40, age 60 => O60 boundary", () => {
    expect(ageBand(1967, run2026)).toBe("O40"); // 59
    expect(ageBand(1966, run2026)).toBe("O60"); // 60
  });
});

describe("classOf", () => {
  it("combines gender and band", () => {
    expect(classOf(1990, "M", run2026)).toBe("M-open");
    expect(classOf(2010, "W", run2026)).toBe("W-U18");
    expect(classOf(1960, "W", run2026)).toBe("W-O60");
  });
});
