import { describe, it, expect } from "vitest";
import { formatDocumentNo } from "../documentNumber";

describe("§06.5 Document numbering", () => {
  it.each([
    ["QT", 2026, 1, "QT-2026-00001"],
    ["SO", 2026, 25, "SO-2026-00025"],
    ["DO", 2026, 1, "DO-2026-00001"],
    ["INV", 2026, 125, "INV-2026-00125"],
    ["PAY", 2026, 1, "PAY-2026-00001"],
    ["IMP", 2026, 1, "IMP-2026-0001"],
  ] as const)("%s / %i / %i -> %s", (prefix, year, seq, expected) => {
    expect(formatDocumentNo(prefix, year, seq)).toBe(expected);
  });
});
