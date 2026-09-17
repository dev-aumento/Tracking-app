import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { Check, Loader2, Plus } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { CustomerRecord } from "@/components/customers/NewCustomerForm";

type CustomerSearchSelectProps = {
  customers: CustomerRecord[];
  value: number | "";
  onChange: (customer: CustomerRecord | null) => void;
  onCreate: (name: string) => Promise<CustomerRecord>;
  placeholder?: string;
  className?: string;
  inputClassName?: string;
  disabled?: boolean;
  creating?: boolean;
};

function customerSearchText(customer: CustomerRecord) {
  return [customer.displayName, customer.companyName, customer.firstName, customer.lastName, customer.email]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

export function CustomerSearchSelect({
  customers,
  value,
  onChange,
  onCreate,
  placeholder = "Type to search or add a customer",
  className,
  inputClassName,
  disabled = false,
  creating = false,
}: CustomerSearchSelectProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [highlight, setHighlight] = useState(0);
  const [createError, setCreateError] = useState<string | null>(null);

  const selected = useMemo(
    () => (typeof value === "number" ? customers.find((customer) => customer.id === value) ?? null : null),
    [customers, value],
  );

  const trimmedQuery = query.trim();
  const matches = useMemo(() => {
    if (!trimmedQuery) return customers;
    const needle = trimmedQuery.toLowerCase();
    return customers.filter((customer) => customerSearchText(customer).includes(needle));
  }, [customers, trimmedQuery]);

  const exactMatch = useMemo(
    () =>
      customers.some(
        (customer) => customer.displayName.trim().toLowerCase() === trimmedQuery.toLowerCase(),
      ),
    [customers, trimmedQuery],
  );

  const showCreate = Boolean(trimmedQuery) && matches.length === 0 && !exactMatch;
  const optionCount = matches.length + (showCreate ? 1 : 0);

  useEffect(() => {
    if (open) return;
    setQuery(selected?.displayName ?? "");
    setCreateError(null);
  }, [open, selected?.displayName]);

  useEffect(() => {
    setHighlight(0);
  }, [trimmedQuery, open]);

  useEffect(() => {
    if (!open) return;

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (!target || rootRef.current?.contains(target)) return;
      setOpen(false);
    };

    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [open]);

  function selectCustomer(customer: CustomerRecord) {
    onChange(customer);
    setQuery(customer.displayName);
    setCreateError(null);
    setOpen(false);
  }

  async function createCustomer() {
    if (!showCreate || creating) return;
    setCreateError(null);
    try {
      const created = await onCreate(trimmedQuery);
      selectCustomer(created);
    } catch (error) {
      setCreateError(error instanceof Error ? error.message : "Could not create customer.");
    }
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      setOpen(false);
      return;
    }
    if (!open && (event.key === "ArrowDown" || event.key === "Enter")) {
      setOpen(true);
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setHighlight((current) => Math.min(current + 1, Math.max(optionCount - 1, 0)));
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setHighlight((current) => Math.max(current - 1, 0));
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      if (showCreate && (matches.length === 0 || highlight >= matches.length)) {
        void createCustomer();
        return;
      }
      const customer = matches[highlight] ?? matches[0];
      if (customer) selectCustomer(customer);
    }
  }

  return (
    <div ref={rootRef} className={cn("relative", className)}>
      <Input
        value={open || !selected ? query : selected.displayName}
        onChange={(event) => {
          const next = event.target.value;
          setQuery(next);
          setCreateError(null);
          setOpen(true);
          if (selected && next.trim().toLowerCase() !== selected.displayName.trim().toLowerCase()) {
            onChange(null);
          }
        }}
        onFocus={(event) => {
          setOpen(true);
          setQuery(selected?.displayName ?? query);
          event.currentTarget.select();
        }}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        disabled={disabled || creating}
        autoComplete="off"
        role="combobox"
        aria-expanded={open}
        aria-autocomplete="list"
        className={cn(
          "h-10 rounded-lg border-gray-200 bg-white text-sm text-[#1F2937] focus-visible:border-[#2563EB] focus-visible:ring-[#2563EB]/30",
          inputClassName,
        )}
      />

      {open ? (
        <div className="absolute left-0 right-0 top-full z-[80] mt-1 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-lg">
          <ul
            role="listbox"
            className="max-h-56 overflow-y-auto overscroll-contain py-1"
            onWheel={(event) => event.stopPropagation()}
          >
            {matches.map((customer, index) => {
              const isActive = highlight === index;
              const isSelected = selected?.id === customer.id;
              return (
                <li key={customer.id}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    className={cn(
                      "flex w-full items-center gap-2 px-3 py-2 text-left text-sm",
                      isActive ? "bg-blue-50 text-[#1D4ED8]" : "text-gray-800 hover:bg-gray-50",
                    )}
                    onMouseEnter={() => setHighlight(index)}
                    onPointerDown={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      selectCustomer(customer);
                    }}
                  >
                    <Check
                      size={14}
                      className={cn("shrink-0 text-[#2563EB]", isSelected ? "opacity-100" : "opacity-0")}
                    />
                    <span className="min-w-0 truncate">{customer.displayName}</span>
                  </button>
                </li>
              );
            })}

            {showCreate ? (
              <li>
                <button
                  type="button"
                  className={cn(
                    "flex w-full items-center gap-2 px-3 py-2 text-left text-sm font-medium text-[#2563EB]",
                    highlight >= matches.length ? "bg-blue-50" : "hover:bg-blue-50/70",
                  )}
                  onMouseEnter={() => setHighlight(matches.length)}
                  onPointerDown={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    void createCustomer();
                  }}
                  disabled={creating}
                >
                  {creating ? <Loader2 size={16} className="shrink-0 animate-spin" /> : <Plus size={16} className="shrink-0" />}
                  <span className="min-w-0 truncate">
                    Add new customer “{trimmedQuery}”
                  </span>
                </button>
              </li>
            ) : null}

            {!showCreate && matches.length === 0 ? (
              <li className="px-3 py-6 text-center text-sm text-gray-500">
                {trimmedQuery ? "No customers found." : "Type a name to search or add a customer."}
              </li>
            ) : null}
          </ul>
        </div>
      ) : null}

      {createError ? <p className="mt-1 text-xs text-red-500">{createError}</p> : null}
    </div>
  );
}
