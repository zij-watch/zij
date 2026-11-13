"use client";

// The control kit: one look for every control in the app.
// Behaviour (keyboard, focus, Escape, screen-reader roles) is Radix UI's and react-day-picker's;
// the look is ours, from the tokens, in app/ui.css. Nothing here uses a native <select>.

import * as RCheckbox from "@radix-ui/react-checkbox";
import * as RDialog from "@radix-ui/react-dialog";
import * as RPopover from "@radix-ui/react-popover";
import * as RSelect from "@radix-ui/react-select";
import * as RTooltip from "@radix-ui/react-tooltip";
import { useEffect, useRef, useState, type ChangeEvent, type ReactNode } from "react";
import { DayPicker, type DateRange, type DropdownProps } from "react-day-picker";

export * as Tabs from "@radix-ui/react-tabs";
export const TooltipProvider = RTooltip.Provider;

const Chevron = () => (
  <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 6l4 4 4-4" /></svg>
);
const Tick = () => (
  <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3.5 8.5l3 3 6-7" /></svg>
);
const Cross = () => (
  <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
);

// ------------------------------------------------------------------ select

export interface Option { value: string; label: string; disabled?: boolean }

export function Select({ value, onChange, options, placeholder, label, small }: {
  value: string | null; onChange: (value: string) => void; options: Option[]; placeholder?: string; label: string; small?: boolean;
}) {
  return (
    <RSelect.Root value={value ?? undefined} onValueChange={onChange}>
      <RSelect.Trigger className={`ui-select${small ? " is-small" : ""}`} aria-label={label}>
        <RSelect.Value placeholder={placeholder} />
        <RSelect.Icon className="ui-select-icon"><Chevron /></RSelect.Icon>
      </RSelect.Trigger>
      <RSelect.Portal>
        <RSelect.Content className="ui-menu" position="popper" sideOffset={4} collisionPadding={8}>
          <RSelect.Viewport className="ui-menu-view">
            {options.map((o) => (
              <RSelect.Item key={o.value} value={o.value} disabled={o.disabled} className="ui-option">
                <RSelect.ItemText>{o.label}</RSelect.ItemText>
                <RSelect.ItemIndicator className="ui-option-tick"><Tick /></RSelect.ItemIndicator>
              </RSelect.Item>
            ))}
          </RSelect.Viewport>
        </RSelect.Content>
      </RSelect.Portal>
    </RSelect.Root>
  );
}

// ------------------------------------------------------------------ checkbox, tooltip

export function Check({ checked, onChange, label, children }: { checked: boolean; onChange: (checked: boolean) => void; label: string; children: ReactNode }) {
  return (
    <label className="ui-check">
      <RCheckbox.Root className="ui-checkbox" aria-label={label} checked={checked} onCheckedChange={(v) => onChange(v === true)}>
        <RCheckbox.Indicator><Tick /></RCheckbox.Indicator>
      </RCheckbox.Root>
      {children}
    </label>
  );
}

/** A tooltip for an icon button. The button keeps its own aria-label; the tip is for sighted users. */
export function Tip({ label, side = "top", children }: { label: string; side?: "top" | "right" | "bottom" | "left"; children: ReactNode }) {
  return (
    <RTooltip.Root>
      <RTooltip.Trigger asChild>{children}</RTooltip.Trigger>
      <RTooltip.Portal>
        <RTooltip.Content className="ui-tip" side={side} sideOffset={6} collisionPadding={8}>{label}</RTooltip.Content>
      </RTooltip.Portal>
    </RTooltip.Root>
  );
}

// ------------------------------------------------------------------ popover, dialog

export function Pop({ open, onOpenChange, trigger, children, side = "bottom", align = "start", label }: {
  open?: boolean; onOpenChange?: (open: boolean) => void; trigger: ReactNode; children: ReactNode;
  side?: "top" | "right" | "bottom" | "left"; align?: "start" | "center" | "end"; label: string;
}) {
  return (
    <RPopover.Root open={open} onOpenChange={onOpenChange}>
      <RPopover.Trigger asChild>{trigger}</RPopover.Trigger>
      <RPopover.Portal>
        <RPopover.Content className="ui-pop" side={side} align={align} sideOffset={8} collisionPadding={8} aria-label={label}>
          {children}
        </RPopover.Content>
      </RPopover.Portal>
    </RPopover.Root>
  );
}

export function Modal({ open, onOpenChange, title, children }: { open: boolean; onOpenChange: (open: boolean) => void; title: string; children: ReactNode }) {
  // The dialog is opened from more than one button and has no trigger of its own, so it keeps
  // track of what had the focus outside it, and gives the focus back there when it closes.
  const outside = useRef<HTMLElement | null>(null);
  useEffect(() => {
    const note = (event: FocusEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && !target.closest(".ui-dialog")) outside.current = target;
    };
    document.addEventListener("focusin", note);
    return () => document.removeEventListener("focusin", note);
  }, []);
  return (
    <RDialog.Root open={open} onOpenChange={onOpenChange}>
      <RDialog.Portal>
        <RDialog.Overlay className="ui-overlay" />
        <RDialog.Content className="ui-dialog" aria-describedby={undefined}
          onCloseAutoFocus={(event) => { event.preventDefault(); outside.current?.focus(); }}>
          <div className="ui-dialog-head">
            <RDialog.Title className="ui-dialog-title">{title}</RDialog.Title>
            <RDialog.Close className="icon-button" aria-label="Close"><Cross /></RDialog.Close>
          </div>
          {children}
        </RDialog.Content>
      </RDialog.Portal>
    </RDialog.Root>
  );
}

// ------------------------------------------------------------------ dates

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const toDate = (iso: string) => new Date(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10) || "1"));
const toIso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const dayWords = (iso: string) => `${Number(iso.slice(8, 10))} ${MONTHS[Number(iso.slice(5, 7)) - 1]} ${iso.slice(0, 4)}`;
const monthWords = (ym: string) => `${MONTHS[Number(ym.slice(5, 7)) - 1]} ${ym.slice(0, 4)}`;
const lastOfMonth = (ym: string) => new Date(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)), 0);

/** The month and year jumps of the calendar, as our own select. */
function PickerDropdown({ options, value, onChange, "aria-label": ariaLabel }: DropdownProps) {
  return (
    <Select small label={ariaLabel ?? "Choose"} value={String(value)}
      options={(options ?? []).map((o) => ({ value: String(o.value), label: o.label, disabled: o.disabled }))}
      onChange={(next) => onChange?.({ target: { value: next } } as ChangeEvent<HTMLSelectElement>)} />
  );
}

const CalendarIcon = () => (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="3.5" y="5" width="17" height="15" rx="1.5" /><path d="M3.5 10h17M8 3v4M16 3v4" />
  </svg>
);

/** One day. `min` and `max` are YYYY-MM-DD; `max` is the last day with data and is marked as today. */
export function DayField({ value, onChange, min, max, label }: { value: string | null; onChange: (value: string | null) => void; min: string; max: string; label: string }) {
  const [open, setOpen] = useState(false);
  return (
    <Pop open={open} onOpenChange={setOpen} label={label}
      trigger={<button type="button" className="ui-field" aria-label={`${label}: ${value ? dayWords(value) : "none chosen"}`}><CalendarIcon /><span>{value ? dayWords(value) : "Pick a day"}</span></button>}>
      <DayPicker mode="single" selected={value ? toDate(value) : undefined} defaultMonth={toDate(value ?? max)}
        onSelect={(d) => { onChange(d ? toIso(d) : null); setOpen(false); }}
        captionLayout="dropdown" startMonth={toDate(min)} endMonth={toDate(max)} today={toDate(max)}
        disabled={{ before: toDate(min), after: toDate(max) }} weekStartsOn={1} components={{ Dropdown: PickerDropdown }} autoFocus />
      <div className="ui-pop-foot">
        <span>Data from {dayWords(min)} to {dayWords(max)}.</span>
        {value && <button type="button" className="link" onClick={() => { onChange(null); setOpen(false); }}>Clear the day</button>}
      </div>
    </Pop>
  );
}

/** A range of months, picked as two days on a calendar. `min` and `max` are YYYY-MM-DD; values are YYYY-MM. */
export function RangeField({ from, to, onChange, min, max, label }: { from: string; to: string; onChange: (from: string, to: string) => void; min: string; max: string; label: string }) {
  const [open, setOpen] = useState(false);
  const current: DateRange = { from: toDate(`${from}-01`) < toDate(min) ? toDate(min) : toDate(`${from}-01`), to: lastOfMonth(to) > toDate(max) ? toDate(max) : lastOfMonth(to) };
  const [draft, setDraft] = useState<DateRange | undefined>(undefined);
  return (
    <Pop open={open} onOpenChange={(next) => { setOpen(next); setDraft(undefined); }} label={label}
      trigger={<button type="button" className="ui-field" aria-label={`${label}: ${monthWords(from)} to ${monthWords(to)}`}><CalendarIcon /><span>{monthWords(from)} to {monthWords(to)}</span></button>}>
      <DayPicker mode="range" resetOnSelect selected={draft ?? current} defaultMonth={current.to}
        onSelect={(range) => {
          setDraft(range);
          if (range?.from && range.to) {
            onChange(toIso(range.from).slice(0, 7), toIso(range.to).slice(0, 7));
            setOpen(false);
            setDraft(undefined);
          }
        }}
        captionLayout="dropdown" startMonth={toDate(min)} endMonth={toDate(max)} today={toDate(max)}
        disabled={{ before: toDate(min), after: toDate(max) }} weekStartsOn={1} components={{ Dropdown: PickerDropdown }} autoFocus />
      <div className="ui-pop-foot">
        <span>{draft?.from && !draft.to ? "Now pick the last day." : "Pick the first day, then the last."} The calendar and charts work in whole months, so the range is widened to its months.</span>
      </div>
    </Pop>
  );
}
