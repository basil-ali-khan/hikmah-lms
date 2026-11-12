"use client";

import { Search, SlidersHorizontal } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";

import { Button, Checkbox, Input, Select, cn } from "@/components/ui";
import { Sheet } from "@/components/ui/sheet";

type Category = { name: string; slug: string };

const TYPES = [
  { value: "live", label: "Live" },
  { value: "recorded", label: "Recorded" },
  { value: "hybrid", label: "Hybrid" },
];
const PRICES = [
  { value: "free", label: "Free" },
  { value: "paid", label: "Paid" },
];

function useFilters() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, start] = useTransition();
  const types = (params.get("type") ?? "").split(",").filter(Boolean);
  const price = params.get("price") ?? "";
  const category = params.get("category") ?? "";
  const q = params.get("q") ?? "";

  function update(changes: Record<string, string | null>) {
    const next = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(changes)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    const qs = next.toString();
    start(() => router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false }));
  }

  const toggleType = (t: string) =>
    update({ type: (types.includes(t) ? types.filter((x) => x !== t) : [...types, t]).join(",") || null });

  return { types, price, category, q, update, toggleType, pending };
}

function SearchBox({ id, q, onSearch, className }: { id: string; q: string; onSearch: (q: string) => void; className?: string }) {
  const [value, setValue] = useState(q);
  return (
    <form
      role="search"
      className={cn("relative", className)}
      onSubmit={(e) => {
        e.preventDefault();
        onSearch(value.trim());
      }}
    >
      <label htmlFor={id} className="sr-only">
        Search courses
      </label>
      <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted" aria-hidden />
      <Input
        id={id}
        type="search"
        placeholder="Search courses"
        className="pl-10"
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          if (!e.target.value) onSearch("");
        }}
        enterKeyHint="search"
      />
    </form>
  );
}

function ChipToggle({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "inline-flex min-h-11 shrink-0 items-center rounded-full border px-4 text-sm font-medium transition-colors",
        active ? "border-primary bg-primary text-white" : "border-line bg-white text-heading hover:border-primary",
      )}
    >
      {children}
    </button>
  );
}

function CategorySelect({ categories, value, onChange, id }: { categories: Category[]; value: string; onChange: (v: string) => void; id: string }) {
  return (
    <Select id={id} value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">All categories</option>
      {categories.map((c) => (
        <option key={c.slug} value={c.slug}>
          {c.name}
        </option>
      ))}
    </Select>
  );
}

/** Mobile: search + horizontally scrolling chips + category sheet. Desktop: sidebar with checkboxes. */
export function CatalogFilters({ categories }: { categories: Category[] }) {
  const f = useFilters();
  const [open, setOpen] = useState(false);
  const activeCategory = categories.find((c) => c.slug === f.category);

  return (
    <>
      {/* Mobile */}
      <div className="flex flex-col gap-3 md:hidden" aria-busy={f.pending || undefined}>
        <SearchBox key={`m-${f.q}`} id="course-search-m" q={f.q} onSearch={(q) => f.update({ q: q || null })} />
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1" role="group" aria-label="Filter courses">
          <ChipToggle active={!f.types.length && !f.price} onClick={() => f.update({ type: null, price: null })}>
            All
          </ChipToggle>
          {TYPES.map((t) => (
            <ChipToggle key={t.value} active={f.types.includes(t.value)} onClick={() => f.toggleType(t.value)}>
              {t.label}
            </ChipToggle>
          ))}
          {PRICES.map((p) => (
            <ChipToggle key={p.value} active={f.price === p.value} onClick={() => f.update({ price: f.price === p.value ? null : p.value })}>
              {p.label}
            </ChipToggle>
          ))}
        </div>
        {categories.length > 0 && (
          <div className="flex items-center justify-between gap-2 text-sm text-subtle">
            <span>Category: {activeCategory?.name ?? "All"}</span>
            <Button variant="subtle" size="sm" className="min-h-11" onClick={() => setOpen(true)}>
              <SlidersHorizontal className="size-4" aria-hidden /> Filters
            </Button>
          </div>
        )}
        <Sheet open={open} onOpenChange={setOpen} title="Filter by category">
          <div className="flex flex-col gap-3">
            <label htmlFor="cat-mobile" className="text-[13px] font-medium text-heading">
              Category
            </label>
            <CategorySelect
              id="cat-mobile"
              categories={categories}
              value={f.category}
              onChange={(v) => {
                f.update({ category: v || null });
                setOpen(false);
              }}
            />
          </div>
        </Sheet>
      </div>

      {/* Desktop */}
      <aside className="hidden flex-col gap-6 md:flex" aria-label="Filters" aria-busy={f.pending || undefined}>
        <SearchBox key={`d-${f.q}`} id="course-search-d" q={f.q} onSearch={(q) => f.update({ q: q || null })} />
        <fieldset className="flex flex-col gap-2.5">
          <legend className="mb-2 font-heading text-sm font-bold text-heading">Format</legend>
          {TYPES.map((t) => (
            <Checkbox key={t.value} label={t.label} checked={f.types.includes(t.value)} onChange={() => f.toggleType(t.value)} />
          ))}
        </fieldset>
        <fieldset className="flex flex-col gap-2.5">
          <legend className="mb-2 font-heading text-sm font-bold text-heading">Price</legend>
          {PRICES.map((p) => (
            <Checkbox
              key={p.value}
              label={p.label}
              checked={f.price === p.value}
              onChange={() => f.update({ price: f.price === p.value ? null : p.value })}
            />
          ))}
        </fieldset>
        {categories.length > 0 && (
          <div className="flex flex-col gap-2">
            <label htmlFor="cat-desktop" className="font-heading text-sm font-bold text-heading">
              Category
            </label>
            <CategorySelect id="cat-desktop" categories={categories} value={f.category} onChange={(v) => f.update({ category: v || null })} />
          </div>
        )}
        {(f.types.length > 0 || f.price || f.category || f.q) && (
          <Button variant="ghost" size="sm" className="self-start" onClick={() => f.update({ type: null, price: null, category: null, q: null })}>
            Clear filters
          </Button>
        )}
      </aside>
    </>
  );
}
