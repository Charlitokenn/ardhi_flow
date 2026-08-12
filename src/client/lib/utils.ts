import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function getGreeting(): string {
  const hour = new Date().getHours()

  if (hour < 12) {
    return "Morning "
  }

  if (hour < 18) {
    return "Afternoon "
  }

  return "Evening "
}