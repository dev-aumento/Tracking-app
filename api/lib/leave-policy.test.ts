import { describe, expect, it } from "vitest";
import {
  isWfhRequestBlocked,
  leaveRequestMatchesSearch,
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

describe("leave request search", () => {
  const request = {
    leaveType: "paid",
    isHalfDay: false,
    startDate: "2026-03-10",
    endDate: "2026-03-12",
    days: 3,
    reason: "Family function",
    status: "approved",
    reviewNote: null,
  };

  it("matches employee name, reason, and status", () => {
    const employee = { name: "Priya Shah", email: "priya@example.com", department: "Design" };
    expect(leaveRequestMatchesSearch(request, "priya", employee)).toBe(true);
    expect(leaveRequestMatchesSearch(request, "family", employee)).toBe(true);
    expect(leaveRequestMatchesSearch(request, "approved", employee)).toBe(true);
    expect(leaveRequestMatchesSearch(request, "rahul", employee)).toBe(false);
  });

  it("matches a date inside the leave range", () => {
    expect(leaveRequestMatchesSearch(request, "2026-03-11")).toBe(true);
    expect(leaveRequestMatchesSearch(request, "11-03-2026")).toBe(true);
    expect(leaveRequestMatchesSearch(request, "2026-03-15")).toBe(false);
  });

  it("treats canceled and cancelled as the same status", () => {
    expect(
      leaveRequestMatchesSearch(
        { ...request, status: "cancelled" },
        "canceled",
      ),
    ).toBe(true);
  });
});
