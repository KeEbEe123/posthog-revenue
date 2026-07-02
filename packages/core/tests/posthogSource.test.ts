import { describe, expect, it } from "vitest";
import { addInterval } from "@revenue-recipes/core";

// Regression test for a real bug found by testing PostHogSource against a
// live PostHog project (not just the demo dataset): `getSubscriptions()`
// originally set periodEnd = the last charge's own timestamp, which made
// every subscription look churned the instant there was no fresh event in
// the current month, even for customers still paying on schedule. The fix:
// a charge's coverage extends one billing interval past when it fired.
describe("addInterval — fixes the 'looks churned right after its last charge' bug", () => {
  it("extends a monthly charge's coverage by one month", () => {
    expect(addInterval("2026-05-03T12:00:00.000Z", "month")).toBe("2026-06-03T12:00:00.000Z");
  });

  it("extends an annual charge's coverage by twelve months", () => {
    expect(addInterval("2026-01-15T00:00:00.000Z", "year")).toBe("2027-01-15T00:00:00.000Z");
  });

  it("rolls over year and month boundaries correctly", () => {
    expect(addInterval("2025-12-20T00:00:00.000Z", "month")).toBe("2026-01-20T00:00:00.000Z");
  });

  it("passes through a malformed date unchanged rather than throwing", () => {
    expect(addInterval("not-a-date", "month")).toBe("not-a-date");
  });
});
