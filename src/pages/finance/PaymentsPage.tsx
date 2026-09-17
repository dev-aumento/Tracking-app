import { useMemo, useState } from "react";
import { Banknote, Pencil, Trash2 } from "lucide-react";
import { trpc } from "@/providers/trpc";
import { formatMoney, invoiceTotal } from "@/lib/invoice-store";
import { refreshDashboardPage } from "@/lib/dashboard-refresh";
import { useFxConvert } from "@/hooks/useFxConvert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Field,
  FinanceEmptyState,
  FinanceLoading,
  FinanceMoney,
  FinancePageHeader,
  StatusBadge,
  inputClass,
  selectClass,
} from "@/components/finance/FinancePageKit";
import {
  type CustomerRecord,
  quickCustomerCreateValues,
} from "@/components/customers/NewCustomerForm";
import { CustomerSearchSelect } from "@/components/customers/CustomerSearchSelect";

type PaymentMethod = "bank_transfer" | "upi" | "cash" | "cheque" | "card" | "other" | "bank_remittance";
type RemittanceType = "forex" | "domestic";
type PaymentStatus = "pending" | "received";

type PaymentForm = {
  invoiceId: number | null;
  customerId: number | null;
  customerName: string;
  amount: number;
  paymentDate: string;
  method: PaymentMethod;
  bankAccountId: number | null;
  reference: string;
  notes: string;
  remittanceType: RemittanceType | null;
  taxAmount: number;
  status: PaymentStatus;
};

const METHOD_LABELS: Record<PaymentMethod, string> = {
  bank_transfer: "Bank transfer",
  bank_remittance: "Bank remittance",
  upi: "UPI",
  cash: "Cash",
  cheque: "Cheque",
  card: "Card",
  other: "Other",
};

const STATUS_LABELS: Record<PaymentStatus, string> = {
  pending: "Pending",
  received: "Received",
};

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function formatDate(value: string) {
  if (!value) return "—";
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

const emptyForm = (): PaymentForm => ({
  invoiceId: null,
  customerId: null,
  customerName: "",
  amount: 0,
  paymentDate: todayIso(),
  method: "bank_transfer",
  bankAccountId: null,
  reference: "",
  notes: "",
  remittanceType: null,
  taxAmount: 0,
  status: "received",
});

export default function PaymentsPage() {
  const utils = trpc.useUtils();
  const { data = [], isLoading } = trpc.finance.payments.list.useQuery();
  const { data: invoices = [] } = trpc.invoice.list.useQuery();
  const { data: customers = [] } = trpc.customer.list.useQuery();
  const createMutation = trpc.finance.payments.create.useMutation();
  const updateMutation = trpc.finance.payments.update.useMutation();
  const deleteMutation = trpc.finance.payments.delete.useMutation();
  const createCustomerMutation = trpc.customer.create.useMutation();

  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState<PaymentForm>(emptyForm());
  const [error, setError] = useState<string | null>(null);
  const [createdCustomers, setCreatedCustomers] = useState<CustomerRecord[]>([]);

  const invoiceMap = useMemo(
    () => new Map(invoices.map((i) => [i.id, i])),
    [invoices],
  );
  const allCustomers = useMemo(() => {
    const byId = new Map<number, CustomerRecord>();
    for (const customer of [...createdCustomers, ...(customers as CustomerRecord[])]) {
      byId.set(customer.id, customer);
    }
    return [...byId.values()];
  }, [customers, createdCustomers]);
  const { toBase } = useFxConvert();

  const totalReceived = useMemo(
    () =>
      data.reduce((sum, payment) => {
        if (payment.status === "pending") return sum;
        const invoice =
          payment.invoiceId != null ? invoiceMap.get(payment.invoiceId) : undefined;
        return sum + toBase(payment.amount, invoice?.currency);
      }, 0),
    [data, invoiceMap, toBase],
  );

  function openCreate() {
    setEditId(null);
    setForm(emptyForm());
    setError(null);
    setOpen(true);
  }

  function openEdit(row: (typeof data)[number]) {
    setEditId(row.id);
    setForm({
      invoiceId: row.invoiceId,
      customerId: row.customerId,
      customerName: row.customerName,
      amount: row.amount,
      paymentDate: row.paymentDate,
      method: row.method,
      bankAccountId: row.bankAccountId,
      reference: row.reference,
      notes: row.notes,
      remittanceType: row.method === "bank_remittance" ? row.remittanceType ?? null : null,
      taxAmount: row.method === "bank_remittance" && row.remittanceType === "domestic" ? row.taxAmount ?? 0 : 0,
      status: row.status === "pending" ? "pending" : "received",
    });
    setError(null);
    setOpen(true);
  }

  function handleInvoiceChange(invoiceId: number | null) {
    const invoice = invoiceId != null ? invoiceMap.get(invoiceId) : undefined;
    setForm((f) => ({
      ...f,
      invoiceId,
      customerId: invoice?.customerId ?? f.customerId,
      customerName: invoice?.customerName ?? f.customerName,
      amount: invoice ? invoiceTotal(invoice) : f.amount,
    }));
  }

  async function handleSave() {
    setError(null);
    if (form.amount <= 0) {
      setError("Amount must be greater than zero.");
      return;
    }
    if (!form.paymentDate) {
      setError("Payment date is required.");
      return;
    }
    if (form.method === "bank_remittance" && !form.remittanceType) {
      setError("Select whether this bank remittance is a forex or domestic transfer.");
      return;
    }
    try {
      const isRemittance = form.method === "bank_remittance";
      const isDomestic = isRemittance && form.remittanceType === "domestic";
      const payload = {
        invoiceId: form.invoiceId,
        customerId: form.customerId,
        customerName: form.customerName,
        amount: form.amount,
        paymentDate: form.paymentDate,
        method: form.method,
        bankAccountId: form.bankAccountId,
        reference: form.reference,
        notes: form.notes,
        remittanceType: isRemittance ? form.remittanceType : null,
        taxAmount: isDomestic ? form.taxAmount : 0,
        status: form.status,
      };
      if (editId != null) {
        await updateMutation.mutateAsync({ id: editId, ...payload });
      } else {
        await createMutation.mutateAsync(payload);
      }
      await utils.finance.payments.list.invalidate();
      await utils.invoice.list.invalidate();
      await utils.finance.reports.summary.invalidate();
      await refreshDashboardPage(utils);
      setOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save payment.");
    }
  }

  async function handleDelete(id: number) {
    if (!window.confirm("Delete this payment?")) return;
    await deleteMutation.mutateAsync({ id });
    await utils.finance.payments.list.invalidate();
  }

  if (isLoading) return <FinanceLoading />;

  return (
    <div className="space-y-4">
      <FinancePageHeader
        title="Payments"
        description="Record and track incoming payments against invoices."
        icon={Banknote}
        onCreate={openCreate}
        createLabel="Record payment"
        extra={
          <div className="text-sm text-gray-500">
            Total received:{" "}
            <span className="font-semibold text-gray-800">
              <FinanceMoney value={totalReceived} />
            </span>
          </div>
        }
      />

      {data.length === 0 ? (
        <FinanceEmptyState
          icon={Banknote}
          title="No payments recorded"
          description="Record customer payments to update invoice status."
          actionLabel="Record payment"
          onAction={openCreate}
        />
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-500 text-xs">
              <tr>
                <th className="text-left font-medium px-4 py-3">Date</th>
                <th className="text-left font-medium px-4 py-3">Customer</th>
                <th className="text-left font-medium px-4 py-3">Invoice</th>
                <th className="text-left font-medium px-4 py-3">Method</th>
                <th className="text-left font-medium px-4 py-3">Status</th>
                <th className="text-right font-medium px-4 py-3">Amount</th>
                <th className="text-right font-medium px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {data.map((row) => (
                <tr key={row.id} className="border-t border-gray-100">
                  <td className="px-4 py-3 text-gray-500">{formatDate(row.paymentDate)}</td>
                  <td className="px-4 py-3 font-medium text-gray-800">
                    {row.customerName || "—"}
                  </td>
                  <td className="px-4 py-3 text-gray-600">
                    {row.invoiceId != null
                      ? invoiceMap.get(row.invoiceId)?.invoiceNumber ?? `#${row.invoiceId}`
                      : "—"}
                  </td>
                  <td className="px-4 py-3 text-gray-600">
                    {METHOD_LABELS[row.method] ?? row.method}
                    {row.method === "bank_remittance" && row.remittanceType
                      ? ` · ${row.remittanceType === "forex" ? "Forex" : "Domestic"}`
                      : ""}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge
                      label={STATUS_LABELS[row.status === "pending" ? "pending" : "received"]}
                      tone={row.status === "pending" ? "warning" : "success"}
                    />
                  </td>
                  <td className="px-4 py-3 text-right font-semibold">
                    <FinanceMoney
                      value={row.amount}
                      currency={
                        row.invoiceId != null
                          ? invoiceMap.get(row.invoiceId)?.currency
                          : undefined
                      }
                    />
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-1">
                      <button
                        type="button"
                        onClick={() => openEdit(row)}
                        className="p-2 rounded-lg hover:bg-gray-50 text-gray-500"
                        aria-label="Edit"
                      >
                        <Pencil size={15} />
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleDelete(row.id)}
                        className="p-2 rounded-lg hover:bg-red-50 text-red-500"
                        aria-label="Delete"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-visible">
          <DialogHeader>
            <DialogTitle>{editId != null ? "Edit payment" : "Record payment"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 pt-1">
            <Field label="Invoice (optional)">
              <select
                className={selectClass}
                value={form.invoiceId ?? ""}
                onChange={(e) =>
                  handleInvoiceChange(e.target.value ? Number(e.target.value) : null)
                }
              >
                <option value="">No invoice linked</option>
                {invoices.map((inv) => (
                  <option key={inv.id} value={inv.id}>
                    {inv.invoiceNumber} — {inv.customerName} ({formatMoney(invoiceTotal(inv), inv.currency)})
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Customer">
              <CustomerSearchSelect
                customers={allCustomers}
                value={form.customerId ?? ""}
                creating={createCustomerMutation.isPending}
                inputClassName={inputClass}
                placeholder="Type to search or add a customer"
                onChange={(customer) => {
                  setForm((f) => ({
                    ...f,
                    customerId: customer?.id ?? null,
                    customerName: customer?.displayName ?? "",
                  }));
                }}
                onCreate={async (name) => {
                  const created = await createCustomerMutation.mutateAsync(
                    quickCustomerCreateValues(name),
                  );
                  const record = created as CustomerRecord;
                  setCreatedCustomers((prev) =>
                    prev.some((item) => item.id === record.id) ? prev : [record, ...prev],
                  );
                  await utils.customer.list.invalidate();
                  return record;
                }}
              />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Amount">
                <input
                  type="number"
                  className={inputClass}
                  value={form.amount}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, amount: Number(e.target.value) || 0 }))
                  }
                />
              </Field>
              <Field label="Payment date">
                <input
                  type="date"
                  className={inputClass}
                  value={form.paymentDate}
                  onChange={(e) => setForm((f) => ({ ...f, paymentDate: e.target.value }))}
                />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Method">
                <select
                  className={selectClass}
                  value={form.method}
                  onChange={(e) => {
                    const method = e.target.value as PaymentMethod;
                    setForm((f) => ({
                      ...f,
                      method,
                      remittanceType: method === "bank_remittance" ? f.remittanceType : null,
                      taxAmount: method === "bank_remittance" ? f.taxAmount : 0,
                    }));
                  }}
                >
                  {(Object.keys(METHOD_LABELS) as PaymentMethod[]).map((m) => (
                    <option key={m} value={m}>
                      {METHOD_LABELS[m]}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Status">
                <select
                  className={selectClass}
                  value={form.status}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, status: e.target.value as PaymentStatus }))
                  }
                >
                  <option value="received">Received</option>
                  <option value="pending">Pending</option>
                </select>
              </Field>
            </div>
            <Field label="Reference">
              <input
                className={inputClass}
                value={form.reference}
                onChange={(e) => setForm((f) => ({ ...f, reference: e.target.value }))}
                placeholder="Txn ID / cheque no."
              />
            </Field>
            {form.method === "bank_remittance" ? (
              <div className="rounded-lg border border-gray-200 bg-gray-50/70 dark:bg-[#1f2937] px-3 py-3 space-y-3">
                <p className="text-xs font-medium text-gray-600">Is this a forex or domestic transfer?</p>
                <div className="flex flex-wrap gap-4">
                  <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={form.remittanceType === "forex"}
                      onChange={() =>
                        setForm((f) => ({
                          ...f,
                          remittanceType: f.remittanceType === "forex" ? null : "forex",
                          taxAmount: 0,
                        }))
                      }
                      className="accent-[#2563EB]"
                    />
                    Forex transfer
                  </label>
                  <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={form.remittanceType === "domestic"}
                      onChange={() =>
                        setForm((f) => ({
                          ...f,
                          remittanceType: f.remittanceType === "domestic" ? null : "domestic",
                        }))
                      }
                      className="accent-[#2563EB]"
                    />
                    Domestic transfer
                  </label>
                </div>
                {form.remittanceType === "domestic" ? (
                  <Field label="Tax">
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      className={inputClass}
                      value={form.taxAmount}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, taxAmount: Number(e.target.value) || 0 }))
                      }
                      placeholder="Tax amount"
                    />
                  </Field>
                ) : null}
              </div>
            ) : null}
            <Field label="Notes">
              <textarea
                className={`${inputClass} h-20 py-2`}
                value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              />
            </Field>
            {error ? <p className="text-sm text-red-500">{error}</p> : null}
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button
                type="button"
                onClick={() => void handleSave()}
                disabled={createMutation.isPending || updateMutation.isPending}
                className="bg-[#2563EB] hover:bg-[#1D4ED8]"
              >
                {editId != null ? "Save changes" : "Record payment"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
