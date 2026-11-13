"use client";

import { usePathname } from "next/navigation";

/** The address that was asked for, shown on the 404 page. */
export default function MissingPath() {
  const path = usePathname();
  return <code>{path || "this address"}</code>;
}
