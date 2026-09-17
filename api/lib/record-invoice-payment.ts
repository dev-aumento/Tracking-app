import { invoiceTotal } from "@/lib/invoice-store";
import { workZoneDateKey } from "@/lib/timezone";
import { Collections } from "@db/mongo/collections";
import type { InvoiceDoc, PaymentDoc } from "@db/mongo/types";
import { isAuthDisabled } from "./dev-mode";
import {
  getCollection,
  hasMongoConfigured,
  insertDoc,
} from "../queries/connection";

export const mockPayments: PaymentDoc[] = [];
let mockPaymentId = 1;

export function nextMockPaymentId() {
  return mockPaymentId++;
}

function useMock() {
  return isAuthDisabled() || !hasMongoConfigured();
}

function remainingAmount(
  invoice: InvoiceDoc,
  payments: Array<Pick<PaymentDoc, "amount" | "status">>,
) {
  const total = invoiceTotal(invoice);
  const received = payments
    .filter((payment) => payment.status !== "pending")
    .reduce((sum, payment) => sum + (payment.amount || 0), 0);
  return Math.round((total - received) * 100) / 100;
}

function buildPaymentDoc(
  invoice: InvoiceDoc,
  amount: number,
  userId: number,
  now: Date,
): Omit<PaymentDoc, "id"> {
  return {
    organizationId: invoice.organizationId,
    invoiceId: invoice.id,
    customerId: invoice.customerId,
    customerName: invoice.customerName,
    amount,
    paymentDate: workZoneDateKey(now),
    method: "other",
    bankAccountId: null,
    reference: invoice.invoiceNumber,
    notes: "Automatically recorded when invoice was marked as paid",
    remittanceType: null,
    taxAmount: 0,
    status: "received" as const,
    createdBy: userId,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * When an invoice becomes paid, record any unpaid remainder as a payment.
 * Skips if a payment already covers the invoice total.
 */
export async function ensurePaymentForPaidInvoice(
  invoice: InvoiceDoc,
  userId: number,
  now = new Date(),
): Promise<PaymentDoc | null> {
  if (invoice.status !== "paid") return null;

  if (useMock()) {
    const existing = mockPayments.filter(
      (payment) =>
        payment.invoiceId === invoice.id &&
        payment.organizationId === invoice.organizationId,
    );
    for (const payment of existing) {
      if (payment.status === "pending") {
        payment.status = "received";
        payment.updatedAt = now;
      }
    }
    const amount = remainingAmount(invoice, existing);
    if (amount <= 0) return existing.find((payment) => payment.status !== "pending") ?? null;
    const doc: PaymentDoc = {
      id: nextMockPaymentId(),
      ...buildPaymentDoc(invoice, amount, userId, now),
    };
    mockPayments.unshift(doc);
    return doc;
  }

  const col = await getCollection<PaymentDoc>(Collections.payments);
  await col.updateMany(
    {
      organizationId: invoice.organizationId,
      invoiceId: invoice.id,
      status: "pending",
    },
    { $set: { status: "received", updatedAt: now } },
  );
  const existing = await col
    .find({
      organizationId: invoice.organizationId,
      invoiceId: invoice.id,
    })
    .toArray();
  const amount = remainingAmount(invoice, existing);
  if (amount <= 0) return existing.find((payment) => payment.status !== "pending") ?? null;

  return insertDoc<PaymentDoc>(
    Collections.payments,
    buildPaymentDoc(invoice, amount, userId, now),
  );
}
