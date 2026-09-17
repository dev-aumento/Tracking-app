import { describe, expect, it } from "vitest";
import {
  isWfhRequestBlocked,
  wfhRequestBlockedMessage,
} from "@/lib/leave-policy";

describe("WFH notice and probation lock", () => {
  it("blocks WFH while on notice period", () => {
    const params = {
      onNoticePeriod: true,
      dateOfJoining: "2024-01-10",
      employmentType: "full_time" as const,
    };
    expect(isWfhRequestBlocked(params, "2026-08-24")).toBe(true);
    expect(wfhRequestBlockedMessage(params, "2026-08-24")).toBe(
      "Work from home cannot be applied during notice period",
    );
    expect(wfhRequestBlockedMessage(params, "2026-08-24", { forEmployee: true })).toBe(
      "Work from home cannot be applied during notice period for this employee",
    );
  });

  it("blocks WFH during full-time probation", () => {
    const params = {
      onNoticePeriod: false,
      dateOfJoining: "2026-06-10",
      employmentType: "full_time" as const,
    };
    expect(isWfhRequestBlocked(params, "2026-08-24")).toBe(true);
    expect(wfhRequestBlockedMessage(params, "2026-08-24")).toBe(
      "Work from home cannot be applied during first 3 months of probation",
    );
  });

  it("blocks WFH during intern internship + probation window", () => {
    const params = {
      onNoticePeriod: false,
      dateOfJoining: "2026-04-10",
      employmentType: "intern" as const,
    };
    expect(isWfhRequestBlocked(params, "2026-08-24")).toBe(true);
    expect(wfhRequestBlockedMessage(params, "2026-08-24")).toBe(
      "Work from home cannot be applied during first 6 months (3 internship + 3 probation)",
    );
  });

  it("allows WFH after the probation window", () => {
    const params = {
      onNoticePeriod: false,
      dateOfJoining: "2026-01-10",
      employmentType: "full_time" as const,
    };
    expect(isWfhRequestBlocked(params, "2026-08-24")).toBe(false);
    expect(wfhRequestBlockedMessage(params, "2026-08-24")).toBeNull();
  });
});
