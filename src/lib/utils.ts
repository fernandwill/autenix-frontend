import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

// Merge Tailwind class names while gracefully handling conditionals.
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}