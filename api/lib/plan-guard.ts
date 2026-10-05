import { TRPCError } from "@trpc/server";
import { hasPlanFeature, type PlanFeatureUser } from "@/lib/plan-features";

/**
 * Block a procedure when the workspace plan does not include `feature`.
 * A missing plan (`planFeatures == null`) still allows access — the dashboard
 * and core home routes do not require a subscription.
 */
export async function assertPlanFeature(
  user: PlanFeatureUser | null | undefined,
  feature: string,
) {
  if (hasPlanFeature(user, feature)) return;
  throw new TRPCError({
    code: "FORBIDDEN",
    message: "This feature is not included in your current plan",
  });
}
