import { randomUUID } from "crypto";
import { invoiceTotal, nextInvoiceNumber } from "@/lib/invoice-store";
import { normalizeCurrency } from "@/lib/currency-fx";
import { Collections } from "@db/mongo/collections";
import type { EstimateDoc, InvoiceDoc, InvoiceLineItemDoc, PaymentDoc } from "@db/mongo/types";
import { isAuthDisabled } from "./dev-mode";
import { getCollection, hasMongoConfigured, insertDoc } from "../queries/connection";
import { mockInvoices, nextMockInvoiceId } from "../invoice-router";
import { mockPayments, nextMockPaymentId } from "./record-invoice-payment";

function useMock() {
  return isAuthDisabled() || !hasMongoConfigured();
}

function lineItemsFromEstimate(estimate: EstimateDoc): InvoiceLineItemDoc[] {
  const items = (estimate.items ?? []).filter(
    (item) => item.itemDetails.trim() || item.rate > 0 || item.quantity > 0,
  );
  if (items.length > 0) return items;
  return [
    {
      id: randomUUID(),
      itemDetails: "Services",
      quantity: 1,
      rate: 0,
      discountPercent: 0,
      taxPercent: 0,
    },
  ];
}

async function existingInvoiceNumbers(organizationId: number) {
  if (useMock()) {
    return mockInvoices
      .filter((invoice) => invoice.organizationId === organizationId)
      .map((invoice) => ({ invoiceNumber: invoice.invoiceNumber }));
  }
  const col = await getCollection<InvoiceDoc>(Collections.invoices);
  const docs = await col.find({ organizationId }).project({ invoiceNumber: 1 }).toArray();
  return docs.map((invoice) => ({ invoiceNumber: String(invoice.invoiceNumber ?? "") }));
}

/**
 * Creates an invoice (and a pending payment) from a converted estimate.
 * Skips if the estimate was already converted.
 */
export async function convertEstimateToInvoice(
  estimate: EstimateDoc,
  userId: number,
  now = new Date(),
): Promise<{ invoice: InvoiceDoc | null; payment: PaymentDoc | null }> {
  if (estimate.status !== "converted" || estimate.convertedInvoiceId != null) {
    return { invoice: null, payment: null };
  }

  const invoiceFields: Omit<InvoiceDoc, "id"> = {
    organizationId: estimate.organizationId,
    invoiceNumber: nextInvoiceNumber(await existingInvoiceNumbers(estimate.organizationId)),
    orderNumber: estimate.estimateNumber,
    customerId: estimate.customerId ?? 0,
    customerName: estimate.customerName,
    invoiceDate: estimate.estimateDate,
    terms: "",
    dueDate: estimate.validUntil || estimate.estimateDate,
    salesperson: "",
    items: lineItemsFromEstimate(estimate),
    customerNotes: estimate.notes
      ? `Converted from estimate ${estimate.estimateNumber}.\n${estimate.notes}`
      : `Converted from estimate ${estimate.estimateNumber}.`,
    shippingCharges: 0,
    taxMode: "none",
    taxPercent: estimate.taxPercent || 0,
    adjustment: estimate.adjustment || 0,
    roundOff: false,
    currency: normalizeCurrency(estimate.currency),
    status: "sent",
    createdBy: userId,
    createdAt: now,
    updatedAt: now,
  };

  const invoice = useMock()
    ? (() => {
        const doc: InvoiceDoc = { id: nextMockInvoiceId(), ...invoiceFields };
        mockInvoices.unshift(doc);
        return doc;
      })()
    : await insertDoc<InvoiceDoc>(Collections.invoices, invoiceFields);

  const amount = invoiceTotal(invoice);
  if (amount <= 0) return { invoice, payment: null };

  const paymentFields: Omit<PaymentDoc, "id"> = {
    organizationId: estimate.organizationId,
    invoiceId: invoice.id,
    customerId: estimate.customerId,
    customerName: estimate.customerName,
    amount,
    paymentDate: estimate.estimateDate,
    method: "other",
    bankAccountId: null,
    reference: estimate.estimateNumber,
    notes: `Pending payment from estimate ${estimate.estimateNumber}`,
    remittanceType: null,
    taxAmount: 0,
    status: "pending",
    createdBy: userId,
    createdAt: now,
    updatedAt: now,
  };

  const payment = useMock()
    ? (() => {
        const doc: PaymentDoc = { id: nextMockPaymentId(), ...paymentFields };
        mockPayments.unshift(doc);
        return doc;
      })()
    : await insertDoc<PaymentDoc>(Collections.payments, paymentFields);

  return { invoice, payment };
}
