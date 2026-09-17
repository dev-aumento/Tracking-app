import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { Check, Loader2, Plus } from "lucide-react";
import { cn } from "@/lib/utils";

type VendorSearchSelectProps = {
  vendors: Array<{ name: string }>;
  value: string;
  onChange: (name: string) => void;
  onCreate: (name: string) => Promise<string>;
  placeholder?: string;
  className?: string;
  inputClassName?: string;
  disabled?: boolean;
  creating?: boolean;
};

export function VendorSearchSelect({
  vendors,
  value,
  onChange,
  onCreate,
  placeholder = "Type to search or add a vendor",
  className,
  inputClassName,
  disabled = false,
  creating = false,
}: VendorSearchSelectProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState(value);
  const [highlight, setHighlight] = useState(0);
  const [createError, setCreateError] = useState<string | null>(null);

  const trimmedQuery = query.trim();
  const matches = useMemo(() => {
    if (!trimmedQuery) return vendors;
    const needle = trimmedQuery.toLowerCase();
    return vendors.filter((vendor) => vendor.name.toLowerCase().includes(needle));
  }, [vendors, trimmedQuery]);

  const exactMatch = useMemo(
    () => vendors.some((vendor) => vendor.name.trim().toLowerCase() === trimmedQuery.toLowerCase()),
    [vendors, trimmedQuery],
  );

  const showCreate = Boolean(trimmedQuery) && !exactMatch;
  const optionCount = matches.length + (showCreate ? 1 : 0);

  useEffect(() => {
    if (open) return;
    setQuery(value);
    setCreateError(null);
  }, [open, value]);

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

  function selectVendor(name: string) {
    onChange(name);
    setQuery(name);
    setCreateError(null);
    setOpen(false);
  }

  async function createVendor() {
    if (!showCreate || creating) return;
    setCreateError(null);
    try {
      const created = await onCreate(trimmedQuery);
      selectVendor(created);
    } catch (error) {
      setCreateError(error instanceof Error ? error.message : "Could not create vendor.");
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
        void createVendor();
        return;
      }
      const vendor = matches[highlight] ?? matches[0];
      if (vendor) selectVendor(vendor.name);
    }
  }

  return (
    <div ref={rootRef} className={cn("relative", className)}>
      <input
        value={query}
        onChange={(event) => {
          const next = event.target.value;
          setQuery(next);
          onChange(next);
          setCreateError(null);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        disabled={disabled || creating}
        autoComplete="off"
        role="combobox"
        aria-expanded={open}
        aria-autocomplete="list"
        className={inputClassName}
      />

      {open ? (
        <div className="absolute left-0 right-0 top-full z-[80] mt-1 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-lg">
          <ul
            ref={listRef}
            role="listbox"
            className="max-h-56 overflow-y-auto overscroll-contain py-1"
            onWheel={(event) => event.stopPropagation()}
          >
            {matches.map((vendor, index) => {
              const isActive = highlight === index;
              const isSelected = value.trim().toLowerCase() === vendor.name.trim().toLowerCase();
              return (
                <li key={vendor.name}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    className={cn(
                      "flex w-full items-center gap-2 px-3 py-2 text-left text-sm",
                      isActive ? "bg-grey-50 text-[#babbbf]" : "text-gray-800 hover:bg-gray-50",
                    )}
                    onMouseEnter={() => setHighlight(index)}
                    onPointerDown={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      selectVendor(vendor.name);
                    }}
                  >
                    <Check
                      size={14}
                      className={cn("shrink-0 text-[#2563EB]", isSelected ? "opacity-100" : "opacity-0")}
                    />
                    <span className="min-w-0 truncate">{vendor.name}</span>
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
                    void createVendor();
                  }}
                  disabled={creating}
                >
                  {creating ? (
                    <Loader2 size={16} className="shrink-0 animate-spin" />
                  ) : (
                    <Plus size={16} className="shrink-0" />
                  )}
                  <span className="min-w-0 truncate">Add “{trimmedQuery}”</span>
                </button>
              </li>
            ) : null}

            {!showCreate && matches.length === 0 ? (
              <li className="px-3 py-6 text-center text-sm text-gray-500">
                {trimmedQuery ? "No vendors found." : "Type a name to search or add a vendor."}
              </li>
            ) : null}
          </ul>
        </div>
      ) : null}

      {createError ? <p className="mt-1 text-xs text-red-500">{createError}</p> : null}
    </div>
  );
}
