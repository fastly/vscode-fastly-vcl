import * as fs from "fs";

export function slugify(str: string): string {
  return str.replace(/\W+/g, "-").toLowerCase();
}

export function ensureFullStop(str: string | undefined): string | undefined {
  if (!str) return str;
  const trimmed = str.trim();
  if (trimmed.endsWith(".") || trimmed.endsWith("!") || trimmed.endsWith("?")) {
    return trimmed;
  }
  return trimmed + ".";
}

export function debounce<F extends (...args: any[]) => void>(
  func: F,
  delay: number,
): (...args: Parameters<F>) => void {
  let timeoutId: ReturnType<typeof setTimeout> | null;

  return function debounced(...args: Parameters<F>): void {
    if (timeoutId !== null) {
      clearTimeout(timeoutId);
    }

    timeoutId = setTimeout(() => {
      func(...args);
    }, delay);
  };
}

export const LANGUAGE_ID = "vcl";
export const DOCS_URL = "https://developer.fastly.com/reference/vcl";
export const HEADER_DOCS_URL =
  "https://developer.fastly.com/reference/http/http-headers";
export const VCL_FLOW_URL =
  "https://developer.fastly.com/learning/vcl/using#the-vcl-request-lifecycle";
export const HEADER_RX = /^(obj|((be)?re(q|sp)))\.http\./;

export * as BOILERPLATE from "../metadata/boilerplate";
