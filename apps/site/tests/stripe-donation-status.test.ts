import { describe, expect, test } from "bun:test";
import {
  closedDisputeDonationState,
  closedDisputeStatus,
  refundedDonationState,
} from "../src/lib/stripe-donation-status";

describe("Stripe donation reconciliation", () => {
  test("distinguishes partial and full refunds and bounds provider amounts", () => {
    expect(refundedDonationState(1000, 250)).toEqual({
      refundedAmount: 250,
      status: "partially_refunded",
    });
    expect(refundedDonationState(1000, 1000)).toEqual({ refundedAmount: 1000, status: "refunded" });
    expect(refundedDonationState(1000, 2000)).toEqual({ refundedAmount: 1000, status: "refunded" });
    expect(refundedDonationState(1000, -50)).toEqual({ refundedAmount: 0, status: "succeeded" });
  });

  test("records dispute outcomes without converting an open warning into a loss", () => {
    expect(closedDisputeStatus("won")).toBe("succeeded");
    expect(closedDisputeStatus("lost")).toBe("disputed_lost");
    expect(closedDisputeStatus("warning_closed")).toBe("disputed");
    expect(closedDisputeDonationState("won", 1000, 250)).toEqual({
      refundedAmount: 250,
      status: "partially_refunded",
    });
  });
});
