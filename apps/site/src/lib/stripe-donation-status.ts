export type StripeDonationStatus =
  | "succeeded"
  | "partially_refunded"
  | "refunded"
  | "disputed"
  | "disputed_lost";

export function refundedDonationState(amount: number, refundedAmount: number) {
  const boundedRefund = Math.max(0, Math.min(amount, refundedAmount));
  return {
    refundedAmount: boundedRefund,
    status:
      boundedRefund >= amount
        ? ("refunded" as const)
        : boundedRefund > 0
          ? ("partially_refunded" as const)
          : ("succeeded" as const),
  };
}

export function closedDisputeStatus(status: string) {
  return status === "won" ? "succeeded" : status === "lost" ? "disputed_lost" : "disputed";
}

export function closedDisputeDonationState(
  disputeStatus: string,
  amount: number,
  refundedAmount: number,
) {
  if (disputeStatus !== "won") return { status: closedDisputeStatus(disputeStatus) };
  return refundedDonationState(amount, refundedAmount);
}
