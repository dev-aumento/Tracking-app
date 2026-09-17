import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown, Pencil, Receipt, Search, Trash2 } from "lucide-react";
import { trpc } from "@/providers/trpc";
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
  disabledInputClass,
  selectClass,
} from "@/components/finance/FinancePageKit";
import { useFxConvert } from "@/hooks/useFxConvert";
import { cn } from "@/lib/utils";
import { VendorSearchSelect } from "@/components/finance/VendorSearchSelect";

type PaymentMethod = "bank_transfer" | "upi" | "cash" | "cheque" | "card" | "other";
type ExpenseStatus = "draft" | "recorded";

type ExpenseForm = {
  expenseDate: string;
  vendorName: string;
  category: string;
  ledgerAccountId: number | null;
  amount: number;
  taxAmount: number;
  currency: string;
  paymentMethod: PaymentMethod;
  bankAccountId: number | null;
  status: ExpenseStatus;
  notes: string;
};

const METHOD_LABELS: Record<PaymentMethod, string> = {
  bank_transfer: "Bank transfer",
  upi: "UPI",
  cash: "Cash",
  cheque: "Cheque",
  card: "Card",
  other: "Other",
};

const CATEGORIES = [
  "General",
  "Salaries & Wages",
  "Software & Tools",
  "Marketing",
  "Office Expenses",
  "Travel & Meals",
  "Other Expenses",
];

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function formatDate(value: string) {
  if (!value) return "—";
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

type SortKey = "date" | "vendor" | "category" | "account" | "amount" | "status";
type SortDir = "asc" | "desc";

function SortHeader({
  label,
  column,
  sortKey,
  sortDir,
  onSort,
  align = "left",
}: {
  label: string;
  column: SortKey;
  sortKey: SortKey;
  sortDir: SortDir;
  onSort: (key: SortKey) => void;
  align?: "left" | "right";
}) {
  const active = sortKey === column;
  return (
    <th
      className={cn("font-medium px-4 py-3", align === "right" ? "text-right" : "text-left")}
      aria-sort={active ? (sortDir === "asc" ? "ascending" : "descending") : "none"}
    >
      <button
        type="button"
        onClick={() => onSort(column)}
        className={cn(
          "inline-flex items-center gap-1 text-xs font-medium hover:text-gray-800",
          align === "right" && "flex-row-reverse",
          active ? "text-gray-800" : "text-gray-500",
        )}
      >
        {label}
        {active ? (
          sortDir === "asc" ? (
            <ArrowUp size={13} className="shrink-0 text-[#2563EB]" />
          ) : (
            <ArrowDown size={13} className="shrink-0 text-[#2563EB]" />
          )
        ) : (
          <ArrowUpDown size={13} className="shrink-0 opacity-40" />
        )}
      </button>
    </th>
  );
}

const emptyForm = (currency = "INR"): ExpenseForm => ({
  expenseDate: todayIso(),
  vendorName: "",
  category: "General",
  ledgerAccountId: null,
  amount: 0,
  taxAmount: 0,
  currency,
  paymentMethod: "bank_transfer",
  bankAccountId: null,
  status: "recorded",
  notes: "",
});

export default function ExpensesPage() {
  const utils = trpc.useUtils();
  const { data = [], isLoading } = trpc.finance.expenses.list.useQuery();
  const { data: ledgers = [] } = trpc.finance.ledgerAccounts.list.useQuery();
  const { data: vendorOptions = [] } = trpc.finance.vendors.list.useQuery();
  const createMutation = trpc.finance.expenses.create.useMutation();
  const updateMutation = trpc.finance.expenses.update.useMutation();
  const deleteMutation = trpc.finance.expenses.delete.useMutation();
  const createVendorMutation = trpc.finance.vendors.create.useMutation();

  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState<ExpenseForm>(emptyForm());
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("date");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [createdVendors, setCreatedVendors] = useState<Array<{ name: string }>>([]);
  const { toBase, baseCurrency } = useFxConvert();

  const ledgerMap = useMemo(
    () => new Map(ledgers.map((l) => [l.id, `${l.code} — ${l.name}`])),
    [ledgers],
  );

  const vendorChoices = useMemo(() => {
    const seen = new Map<string, string>();
    for (const vendor of [...createdVendors, ...vendorOptions]) {
      const name = vendor.name.trim();
      if (!name) continue;
      const key = name.toLowerCase();
      if (!seen.has(key)) seen.set(key, name);
    }
    return [...seen.values()]
      .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }))
      .map((name) => ({ name }));
  }, [createdVendors, vendorOptions]);

  const expenseAccounts = useMemo(
    () => ledgers.filter((l) => l.type === "expense" && l.isActive),
    [ledgers],
  );

  const totalExpenses = useMemo(
    () =>
      data
        .filter((e) => e.status === "recorded")
        .reduce((sum, e) => sum + toBase(e.amount + e.taxAmount, e.currency), 0),
    [data, toBase],
  );

  const visibleRows = useMemo(() => {
    const needle = search.trim().toLowerCase();
    const filtered = needle
      ? data.filter((row) => {
          const account =
            row.ledgerAccountId != null ? ledgerMap.get(row.ledgerAccountId) ?? "" : "";
          const amount = String(row.amount + row.taxAmount);
          const haystack = [
            row.vendorName,
            row.category,
            account,
            row.status,
            row.notes,
            row.currency,
            amount,
            row.expenseDate,
            formatDate(row.expenseDate),
          ]
            .join(" ")
            .toLowerCase();
          return haystack.includes(needle);
        })
      : data;

    const sorted = [...filtered].sort((a, b) => {
      let result = 0;
      switch (sortKey) {
        case "date":
          result = a.expenseDate.localeCompare(b.expenseDate);
          break;
        case "vendor":
          result = a.vendorName.localeCompare(b.vendorName, undefined, { sensitivity: "base" });
          break;
        case "category":
          result = a.category.localeCompare(b.category, undefined, { sensitivity: "base" });
          break;
        case "account": {
          const accountA =
            a.ledgerAccountId != null ? ledgerMap.get(a.ledgerAccountId) ?? "" : "";
          const accountB =
            b.ledgerAccountId != null ? ledgerMap.get(b.ledgerAccountId) ?? "" : "";
          result = accountA.localeCompare(accountB, undefined, { sensitivity: "base" });
          break;
        }
        case "amount":
          result =
            toBase(a.amount + a.taxAmount, a.currency) -
            toBase(b.amount + b.taxAmount, b.currency);
          break;
        case "status":
          result = a.status.localeCompare(b.status, undefined, { sensitivity: "base" });
          break;
        default:
          result = 0;
      }
      if (result === 0) result = b.id - a.id;
      return sortDir === "asc" ? result : -result;
    });

    return sorted;
  }, [data, ledgerMap, search, sortDir, sortKey, toBase]);

  function toggleSort(column: SortKey) {
    if (sortKey === column) {
      setSortDir((dir) => (dir === "asc" ? "desc" : "asc"));
      return;
    }
    setSortKey(column);
    setSortDir(column === "date" || column === "amount" ? "desc" : "asc");
  }

  function openCreate() {
    setEditId(null);
    setForm(emptyForm(baseCurrency));
    setError(null);
    setOpen(true);
  }

  function openEdit(row: (typeof data)[number]) {
    setEditId(row.id);
    setForm({
      expenseDate: row.expenseDate,
      vendorName: row.vendorName,
      category: row.category,
      ledgerAccountId: row.ledgerAccountId,
      amount: row.amount,
      taxAmount: row.taxAmount,
      currency: baseCurrency,
      paymentMethod: row.paymentMethod,
      bankAccountId: row.bankAccountId,
      status: row.status,
      notes: row.notes,
    });
    setError(null);
    setOpen(true);
  }

  async function handleSave() {
    setError(null);
    if (!form.vendorName.trim()) {
      setError("Vendor name is required.");
      return;
    }
    if (form.amount <= 0) {
      setError("Amount must be greater than zero.");
      return;
    }
    try {
      const payload = {
        expenseDate: form.expenseDate,
        vendorName: form.vendorName,
        category: form.category,
        ledgerAccountId: form.ledgerAccountId,
        amount: form.amount,
        taxAmount: form.taxAmount,
        currency: baseCurrency,
        paymentMethod: form.paymentMethod,
        bankAccountId: form.bankAccountId,
        status: form.status,
        notes: form.notes,
      };
      if (editId != null) {
        await updateMutation.mutateAsync({ id: editId, ...payload });
      } else {
        await createMutation.mutateAsync(payload);
      }
      await utils.finance.expenses.list.invalidate();
      await utils.finance.reports.summary.invalidate();
      setOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save expense.");
    }
  }

  async function handleDelete(id: number) {
    if (!window.confirm("Delete this expense?")) return;
    await deleteMutation.mutateAsync({ id });
    await utils.finance.expenses.list.invalidate();
  }

  if (isLoading) return <FinanceLoading />;

  return (
    <div className="space-y-4">
      <FinancePageHeader
        title="Expenses"
        description="Track business expenses, vendors, and reimbursements."
        icon={Receipt}
        onCreate={openCreate}
        createLabel="Add expense"
        extra={
          <div className="text-sm text-gray-500">
            Recorded total:{" "}
            <span className="font-semibold text-gray-800">
              <FinanceMoney value={totalExpenses} />
            </span>
          </div>
        }
      />

      {data.length === 0 ? (
        <FinanceEmptyState
          icon={Receipt}
          title="No expenses yet"
          description="Log vendor bills and operating costs to keep your books accurate."
          actionLabel="Add expense"
          onAction={openCreate}
        />
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
          <div className="px-4 py-3 border-b border-gray-100">
            <label className="relative block">
              <Search
                size={16}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"
              />
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by vendor, category, account, amount, or status…"
                className="w-full h-10 pl-9 pr-3 rounded-lg border border-gray-200 bg-white text-sm text-gray-800 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#2563EB]/20 focus:border-[#2563EB]"
              />
            </label>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-500 text-xs">
                <tr>
                  <SortHeader label="Date" column="date" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                  <SortHeader label="Vendor" column="vendor" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                  <SortHeader label="Category" column="category" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                  <SortHeader label="Account" column="account" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                  <SortHeader
                    label="Amount"
                    column="amount"
                    sortKey={sortKey}
                    sortDir={sortDir}
                    onSort={toggleSort}
                    align="right"
                  />
                  <SortHeader label="Status" column="status" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                  <th className="text-right font-medium px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {visibleRows.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-10 text-center text-sm text-gray-500">
                      No expenses match your search.
                    </td>
                  </tr>
                ) : (
                  visibleRows.map((row) => (
                    <tr key={row.id} className="border-t border-gray-100">
                      <td className="px-4 py-3 text-gray-500">{formatDate(row.expenseDate)}</td>
                      <td className="px-4 py-3 font-medium text-gray-800">{row.vendorName}</td>
                      <td className="px-4 py-3 text-gray-600">{row.category}</td>
                      <td className="px-4 py-3 text-gray-500 text-xs">
                        {row.ledgerAccountId != null
                          ? ledgerMap.get(row.ledgerAccountId) ?? "—"
                          : "—"}
                      </td>
                      <td className="px-4 py-3 text-right font-semibold">
                        <FinanceMoney
                          value={row.amount + row.taxAmount}
                          currency={row.currency}
                        />
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge
                          label={row.status}
                          tone={row.status === "recorded" ? "success" : "neutral"}
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
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-visible">
          <DialogHeader>
            <DialogTitle>{editId != null ? "Edit expense" : "Add expense"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 pt-1">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Expense date">
                <input type="date" className={inputClass} value={form.expenseDate} onChange={(e) => setForm((f) => ({ ...f, expenseDate: e.target.value }))}/>
              </Field>
              <Field label="Status">
                <select
                  className={selectClass}
                  value={form.status}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, status: e.target.value as ExpenseStatus }))
                  }
                >
                  <option value="draft">Draft</option>
                  <option value="recorded">Recorded</option>
                </select>
              </Field>
            </div>
            <Field label="Vendor name">
              <VendorSearchSelect
                vendors={vendorChoices}
                value={form.vendorName}
                creating={createVendorMutation.isPending}
                inputClassName={inputClass}
                placeholder="Type to search or add a vendor"
                onChange={(name) => setForm((f) => ({ ...f, vendorName: name }))}
                onCreate={async (name) => {
                  const created = await createVendorMutation.mutateAsync({ name });
                  setCreatedVendors((prev) =>
                    prev.some((item) => item.name.toLowerCase() === created.name.toLowerCase())
                      ? prev
                      : [{ name: created.name }, ...prev],
                  );
                  await utils.finance.vendors.list.invalidate();
                  return created.name;
                }}
              />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Category">
                <select
                  className={selectClass}
                  value={form.category}
                  onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
                >
                  {CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Ledger account">
                <select
                  className={selectClass}
                  value={form.ledgerAccountId ?? ""}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      ledgerAccountId: e.target.value ? Number(e.target.value) : null,
                    }))
                  }
                >
                  <option value="">None</option>
                  {expenseAccounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.code} — {a.name}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            <div className="grid grid-cols-3 gap-3">
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
              <Field label="Tax amount">
                <input
                  type="number"
                  className={inputClass}
                  value={form.taxAmount}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, taxAmount: Number(e.target.value) || 0 }))
                  }
                />
              </Field>
              <Field label="Currency">
                <input
                  className={disabledInputClass}
                  value={baseCurrency}
                  readOnly
                  disabled
                  aria-readonly="true"
                  title="Portal currency from Settings → Profile"
                />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Payment method">
                <select
                  className={selectClass}
                  value={form.paymentMethod}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      paymentMethod: e.target.value as PaymentMethod,
                    }))
                  }
                >
                  {(Object.keys(METHOD_LABELS) as PaymentMethod[]).map((m) => (
                    <option key={m} value={m}>
                      {METHOD_LABELS[m]}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
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
                {editId != null ? "Save changes" : "Add expense"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
