import { and, eq } from "drizzle-orm";
import { db } from "../storage";
import { orders, type Order } from "@shared/schema";
import { getUncachableStripeClient } from "../stripeClient";
import { sendPaymentRefundedEmail } from "./notifications";
import { refundPayPalCapture } from "./paypalService";

type RejectedPaymentOrder = Pick<
  Order,
  | "id"
  | "email"
  | "status"
  | "totalPrice"
  | "currency"
  | "stripePaymentIntentId"
  | "paypalCaptureId"
>;

export type RejectedPaymentRefundResult = "refunded" | "refund_pending" | "already_refunded";

/**
 * Refund a payment that was captured but must not be fulfilled because it no
 * longer clears the wholesale floor. Provider-side requests are idempotent;
 * only the call that changes the order state sends the customer notification.
 */
export async function refundRejectedPayment(
  order: RejectedPaymentOrder,
): Promise<RejectedPaymentRefundResult> {
  if (order.status === "refunded" || order.status === "refund_pending") return "already_refunded";
  if (order.status !== "rejected_below_floor") {
    throw new Error(`Order ${order.id} is not eligible for a below-floor refund`);
  }

  let refundPending = false;
  if (order.stripePaymentIntentId) {
    const stripe = await getUncachableStripeClient();
    const refund = await stripe.refunds.create(
      { payment_intent: order.stripePaymentIntentId },
      { idempotencyKey: `below-floor-refund-${order.stripePaymentIntentId}` },
    );
    if (refund.status === "pending") {
      refundPending = true;
    } else if (refund.status !== "succeeded") {
      throw new Error(`Stripe refund status: ${refund.status ?? "unknown"}`);
    }
  } else if (order.paypalCaptureId) {
    const refund = await refundPayPalCapture(order.paypalCaptureId);
    refundPending = refund.status === "PENDING";
  } else {
    throw new Error(`Rejected order ${order.id} has no Stripe payment intent or PayPal capture ID`);
  }

  // A webhook/browser retry may have completed the same idempotent refund while
  // this request was in flight. In that case it must not duplicate the email.
  const [updated] = await db
    .update(orders)
    .set({ status: refundPending ? "refund_pending" : "refunded", updatedAt: new Date() })
    .where(and(
      eq(orders.id, order.id),
      eq(orders.status, "rejected_below_floor"),
    ))
    .returning({ id: orders.id });

  if (!updated) return "already_refunded";

  try {
    await sendPaymentRefundedEmail({
      email: order.email,
      orderId: order.id,
      totalPrice: order.totalPrice,
      currency: order.currency,
      refundPending,
    });
  } catch (err: any) {
    // The payment refund and order status are already durable. Email delivery
    // must never cause a refund to be reported as failed or retried.
    console.error(`[Refund] Refunded order ${order.id}, but could not send customer email: ${err.message}`);
  }

  return refundPending ? "refund_pending" : "refunded";
}