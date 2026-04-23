import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export const SA_PROVINCES = [
  "Eastern Cape",
  "Free State",
  "Gauteng",
  "KwaZulu-Natal",
  "Limpopo",
  "Mpumalanga",
  "Northern Cape",
  "North West",
  "Western Cape",
] as const

export type AddressParts = {
  line1: string
  line2?: string
  suburb?: string
  city: string
  province: string
  postalCode?: string
}

export function formatAddress(parts: AddressParts) {
  const line1 = String(parts.line1 || "").trim()
  const line2 = String(parts.line2 || "").trim()
  const suburb = String(parts.suburb || "").trim()
  const city = String(parts.city || "").trim()
  const province = String(parts.province || "").trim()
  const postalCode = String(parts.postalCode || "").trim()

  const segments = [line1]
  if (line2) segments.push(line2)
  if (suburb) segments.push(suburb)

  const tail = [city, province, postalCode].filter(Boolean).join(" ")
  if (tail) segments.push(tail)

  return segments.filter(Boolean).join(", ")
}
