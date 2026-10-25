"use client";

/**
 * Substitutos dos controles nativos <select>, <input type="date"> e <input type="time">.
 * Mesma API do elemento nativo (name, value/defaultValue, onChange com e.target.value,
 * <option> como filhos), então trocar a tag basta. O valor vai para o formulário num
 * <input type="hidden"> com o mesmo name, como o nativo faria.
 */
import * as React from "react";
import { CalendarDays, Check, Clock, X } from "lucide-react";
import { ptBR } from "date-fns/locale";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

type ChangeLike = React.ChangeEvent<HTMLSelectElement & HTMLInputElement>;
function changeEvent(value: string, name?: string) {
  const target = { value, name: name ?? "" };
  return { target, currentTarget: target } as unknown as ChangeLike;
}

/** Caixa com cara de campo (mesma altura, borda e foco dos inputs). */
const fieldBox =
  "flex h-9 w-full min-w-0 items-center gap-2 rounded-md border border-input bg-transparent px-3 text-left text-sm text-silver shadow-xs outline-none transition-[color,box-shadow] focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 data-[state=open]:border-ring data-[state=open]:ring-[3px] data-[state=open]:ring-ring/30 dark:bg-input/30";

/* ───────────────────────────── Select ───────────────────────────── */

type Opt = { value: string; label: React.ReactNode; text: string; disabled?: boolean };
type Group = { label: string | null; options: Opt[] };

const EMPTY = "__vazio__"; // o Radix não aceita value="" num item

function textOf(node: React.ReactNode): string {
  if (node == null || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textOf).join("");
  if (React.isValidElement<{ children?: React.ReactNode }>(node)) return textOf(node.props.children);
  return "";
}

function parseOptions(children: React.ReactNode): Group[] {
  const groups: Group[] = [{ label: null, options: [] }];
  const walk = (nodes: React.ReactNode, group: Group) => {
    React.Children.forEach(nodes, (child) => {
      if (!React.isValidElement<{ value?: string | number; children?: React.ReactNode; disabled?: boolean; label?: string }>(child)) return;
      if (child.type === React.Fragment) return walk(child.props.children, group);
      if (child.type === "optgroup") {
        const g: Group = { label: child.props.label ?? null, options: [] };
        groups.push(g);
        return walk(child.props.children, g);
      }
      if (child.type === "option") {
        const text = textOf(child.props.children);
        group.options.push({
          value: child.props.value != null ? String(child.props.value) : text,
          label: child.props.children,
          text,
          disabled: child.props.disabled,
        });
      }
    });
  };
  walk(children, groups[0]);
  return groups.filter((g) => g.options.length);
}

type SelectFieldProps = Omit<React.SelectHTMLAttributes<HTMLSelectElement>, "onChange" | "value" | "defaultValue"> & {
  value?: string | number;
  defaultValue?: string | number;
  onChange?: (e: ChangeLike) => void;
  placeholder?: string;
};

export function SelectField({
  children,
  value,
  defaultValue,
  onChange,
  name,
  id,
  disabled,
  required,
  className,
  placeholder,
  form,
  ...rest
}: SelectFieldProps) {
  const groups = React.useMemo(() => parseOptions(children), [children]);
  const all = groups.flatMap((g) => g.options);
  // como o nativo: sem valor inicial, vale a primeira opção habilitada
  const first = all.find((o) => !o.disabled)?.value ?? "";
  const [inner, setInner] = React.useState(defaultValue != null ? String(defaultValue) : first);
  const current = value != null ? String(value) : inner;
  const selected = all.find((o) => o.value === current);

  return (
    <>
      <Select
        value={current === "" ? EMPTY : current}
        onValueChange={(v) => {
          const next = v === EMPTY ? "" : v;
          if (value == null) setInner(next);
          onChange?.(changeEvent(next, name));
        }}
        disabled={disabled}
      >
        <SelectTrigger
          size="auto"
          id={id}
          aria-invalid={rest["aria-invalid"]}
          aria-label={rest["aria-label"]}
          aria-describedby={rest["aria-describedby"]}
          title={rest.title}
          className={cn(fieldBox, "justify-between pr-2.5 [&>span]:min-w-0 [&>span]:truncate", className)}
        >
          <SelectValue placeholder={placeholder ?? "Escolha uma opção"}>
            {selected ? <span className={cn("truncate", selected.value === "" && "text-steel")}>{selected.text}</span> : undefined}
          </SelectValue>
        </SelectTrigger>
        <SelectContent position="popper" sideOffset={6} className="max-h-80 min-w-(--radix-select-trigger-width)">
          {groups.map((g, i) => (
            <SelectGroup key={i}>
              {g.label && <SelectLabel className="text-xs text-steel">{g.label}</SelectLabel>}
              {g.options.map((o) => (
                <SelectItem
                  key={o.value || EMPTY}
                  value={o.value === "" ? EMPTY : o.value}
                  disabled={o.disabled}
                  className={cn("py-2 pr-8 text-sm", o.value === "" && "text-steel")}
                >
                  {o.label}
                </SelectItem>
              ))}
            </SelectGroup>
          ))}
        </SelectContent>
      </Select>
      {name && <input type="hidden" name={name} value={current} form={form} required={required} disabled={disabled} />}
    </>
  );
}

/* ───────────────────────────── Data ───────────────────────────── */

function parseISO(v?: string | null) {
  if (!v || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return undefined;
  const [y, m, d] = v.split("-").map(Number);
  return new Date(y, m - 1, d);
}
function toISO(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
const longDate = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short", year: "numeric" });
const weekday = new Intl.DateTimeFormat("pt-BR", { weekday: "short" });

type DateFieldProps = Omit<React.InputHTMLAttributes<HTMLInputElement>, "onChange" | "value" | "defaultValue" | "type" | "min" | "max"> & {
  value?: string;
  defaultValue?: string;
  onChange?: (e: ChangeLike) => void;
  min?: string;
  max?: string;
};

export function DateField({
  value,
  defaultValue,
  onChange,
  name,
  id,
  min,
  max,
  required,
  disabled,
  className,
  placeholder,
  form,
  ...rest
}: DateFieldProps) {
  const [open, setOpen] = React.useState(false);
  const [inner, setInner] = React.useState(defaultValue ?? "");
  const current = value != null ? value : inner;
  const date = parseISO(current);
  const minDate = parseISO(min);
  const maxDate = parseISO(max);

  const commit = (next: string) => {
    if (value == null) setInner(next);
    onChange?.(changeEvent(next, name));
  };
  const today = new Date();
  const todayOk = (!minDate || toISO(today) >= toISO(minDate)) && (!maxDate || toISO(today) <= toISO(maxDate));

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          id={id}
          type="button"
          disabled={disabled}
          aria-invalid={rest["aria-invalid"]}
          aria-label={rest["aria-label"]}
          aria-describedby={rest["aria-describedby"]}
          title={rest.title}
          className={cn(fieldBox, className)}
        >
          <CalendarDays className="size-4 shrink-0 text-steel" aria-hidden />
          {date ? (
            <span className="min-w-0 truncate">
              {longDate.format(date).replace(/ de /g, " ").replace(".", "")}
              <span className="ml-1.5 text-steel">{weekday.format(date).replace(".", "")}</span>
            </span>
          ) : (
            <span className="truncate text-steel">{placeholder ?? "Escolher data"}</span>
          )}
        </PopoverTrigger>
        <PopoverContent align="start" sideOffset={6} className="w-auto p-0">
          <Calendar
            mode="single"
            locale={ptBR}
            selected={date}
            defaultMonth={date ?? minDate ?? today}
            onSelect={(d) => {
              if (!d) return;
              commit(toISO(d));
              setOpen(false);
            }}
            disabled={[...(minDate ? [{ before: minDate }] : []), ...(maxDate ? [{ after: maxDate }] : [])]}
            captionLayout="dropdown"
            startMonth={minDate ?? new Date(today.getFullYear() - 10, 0)}
            endMonth={maxDate ?? new Date(today.getFullYear() + 10, 11)}
            className="p-3"
          />
          <div className="flex items-center justify-between gap-2 border-t border-rime px-3 py-2">
            <button
              type="button"
              disabled={!todayOk}
              onClick={() => {
                commit(toISO(today));
                setOpen(false);
              }}
              className="rounded-md px-2 py-1 text-sm font-medium text-ice hover:bg-ice/10 disabled:opacity-40"
            >
              Hoje
            </button>
            {!required && current && (
              <button
                type="button"
                onClick={() => {
                  commit("");
                  setOpen(false);
                }}
                className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-sm text-steel hover:bg-glacier hover:text-silver"
              >
                <X className="size-3.5" aria-hidden />
                Limpar
              </button>
            )}
          </div>
        </PopoverContent>
      </Popover>
      {name && <input type="hidden" name={name} value={current} form={form} disabled={disabled} />}
    </>
  );
}

/* ───────────────────────────── Horário ───────────────────────────── */

const SLOTS = Array.from({ length: 24 * 4 }, (_, i) => `${String(Math.floor(i / 4)).padStart(2, "0")}:${String((i % 4) * 15).padStart(2, "0")}`);

function normalizeTime(raw: string) {
  const digits = raw.replace(/\D/g, "").slice(0, 4);
  if (!digits) return "";
  const h = Number(digits.length <= 2 ? digits : digits.slice(0, digits.length - 2));
  const m = digits.length <= 2 ? 0 : Number(digits.slice(-2));
  if (h > 23 || m > 59) return null;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

type TimeFieldProps = Omit<React.InputHTMLAttributes<HTMLInputElement>, "onChange" | "value" | "defaultValue" | "type"> & {
  value?: string;
  defaultValue?: string;
  onChange?: (e: ChangeLike) => void;
};

export function TimeField({ value, defaultValue, onChange, name, id, required, disabled, className, placeholder, form, ...rest }: TimeFieldProps) {
  const [open, setOpen] = React.useState(false);
  const [inner, setInner] = React.useState(defaultValue ?? "");
  const current = value != null ? value : inner;
  const [typed, setTyped] = React.useState("");
  const listRef = React.useRef<HTMLDivElement>(null);

  const commit = (next: string) => {
    if (value == null) setInner(next);
    onChange?.(changeEvent(next, name));
  };

  React.useEffect(() => {
    if (!open) return;
    // abre já no horário escolhido (ou às 08:00)
    const target = current ? `${current.slice(0, 3)}${String(Math.floor(Number(current.slice(3, 5)) / 15) * 15).padStart(2, "0")}` : "08:00";
    const t = window.setTimeout(() => listRef.current?.querySelector(`[data-slot-time="${target}"]`)?.scrollIntoView({ block: "center" }), 0);
    return () => window.clearTimeout(t);
  }, [open, current]);

  return (
    <>
      <Popover
        open={open}
        onOpenChange={(o) => {
          setOpen(o);
          setTyped("");
        }}
      >
        <PopoverTrigger
          id={id}
          type="button"
          disabled={disabled}
          aria-invalid={rest["aria-invalid"]}
          aria-label={rest["aria-label"]}
          aria-describedby={rest["aria-describedby"]}
          title={rest.title}
          className={cn(fieldBox, className)}
        >
          <Clock className="size-4 shrink-0 text-steel" aria-hidden />
          {current ? <span className="tabular-nums">{current}</span> : <span className="text-steel">{placeholder ?? "Horário"}</span>}
        </PopoverTrigger>
        <PopoverContent align="start" sideOffset={6} className="w-48 p-0">
          <div className="border-b border-rime p-2">
            <input
              autoFocus
              inputMode="numeric"
              placeholder="Digite, ex.: 14:30"
              value={typed}
              onChange={(e) => setTyped(e.target.value.replace(/[^\d:]/g, "").slice(0, 5))}
              onKeyDown={(e) => {
                if (e.key !== "Enter") return;
                e.preventDefault();
                const t = normalizeTime(typed);
                if (t != null) {
                  commit(t);
                  setOpen(false);
                }
              }}
              className="h-8 w-full rounded-md border border-input bg-transparent px-2 text-sm text-silver outline-none placeholder:text-steel focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40"
            />
          </div>
          <div ref={listRef} className="max-h-60 overflow-y-auto p-1" role="listbox" aria-label="Horários">
            {SLOTS.map((s) => {
              const active = s === current;
              return (
                <button
                  key={s}
                  type="button"
                  role="option"
                  aria-selected={active}
                  data-slot-time={s}
                  onClick={() => {
                    commit(s);
                    setOpen(false);
                  }}
                  className={cn(
                    "flex w-full items-center justify-between rounded-md px-2.5 py-1.5 text-sm tabular-nums transition-colors",
                    active ? "bg-ice/12 font-medium text-silver" : "text-silver hover:bg-glacier",
                  )}
                >
                  {s}
                  {active && <Check className="size-4 text-ice" aria-hidden />}
                </button>
              );
            })}
          </div>
          {!required && current && (
            <div className="border-t border-rime p-1">
              <button
                type="button"
                onClick={() => {
                  commit("");
                  setOpen(false);
                }}
                className="inline-flex w-full items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm text-steel hover:bg-glacier hover:text-silver"
              >
                <X className="size-3.5" aria-hidden />
                Sem horário
              </button>
            </div>
          )}
        </PopoverContent>
      </Popover>
      {name && <input type="hidden" name={name} value={current} form={form} disabled={disabled} />}
    </>
  );
}

