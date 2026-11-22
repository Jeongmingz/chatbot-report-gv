"use client";

import { useEffect, useEffectEvent, useRef } from "react";

export function useDialogFocus(open: boolean, close: () => void) {
  const dialog = useRef<HTMLDivElement>(null);
  const dismiss = useEffectEvent(close);

  useEffect(() => {
    const root = dialog.current;
    if (!open || !root) return;

    const previous = document.activeElement;
    const siblings = Array.from(root.parentElement?.children ?? [])
      .filter((item): item is HTMLElement => item instanceof HTMLElement && item !== root && !item.inert);
    for (const item of siblings) item.inert = true;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    (root.querySelector<HTMLElement>("[data-dialog-initial]") ?? root).focus();

    function onKey(event: KeyboardEvent) {
      if (!root) return;
      if (event.key === "Escape") {
        event.preventDefault();
        dismiss();
        return;
      }
      if (event.key !== "Tab") return;
      const controls = Array.from(root.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), select:not([disabled]), a[href], [tabindex="0"]'
      )).filter(element => !element.closest("[hidden], [inert]"));
      const first = controls[0] ?? root;
      const last = controls.at(-1) ?? root;
      const current = document.activeElement;
      if (event.shiftKey && (current === first || !controls.includes(current as HTMLElement))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (current === last || !controls.includes(current as HTMLElement))) {
        event.preventDefault();
        first.focus();
      }
    }
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
      for (const item of siblings) item.inert = false;
      if (previous instanceof HTMLElement && previous.isConnected) previous.focus({ preventScroll: true });
    };
  }, [open]);
  return dialog;
}
