import { describe, expect, it } from "vitest";
import { formatBytes, formatVersion } from "./format";

describe("formatBytes", () => {
  it("returns a friendly string for zero bytes", () => {
    expect(formatBytes(0)).toBe("0 B");
  });

  it("formats values using the largest matching unit", () => {
    expect(formatBytes(1024)).toBe("1.0 KB");
    expect(formatBytes(1048576)).toBe("1.0 MB");
  });
});

describe("formatVersion", () => {
  it("indicates when the version is not set", () => {
    expect(formatVersion(null)).toBe("Not set");
  });

  it("increments the provided version before rendering", () => {
    expect(formatVersion(1)).toBe("2");
  });
});
