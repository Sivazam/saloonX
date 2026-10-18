import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Zod-compatible regex for a base64-encoded RASTER image data URL.
 * Strictly allows only png / jpeg / webp — never svg (which can carry
 * arbitrary <script> and would be persisted XSS when re-rendered).
 * Use as: z.string().regex(DATA_URL_IMAGE).max(N).optional().nullable()
 */
export const DATA_URL_IMAGE_REGEX =
  /^data:image\/(png|jpe?g|webp);base64,[A-Za-z0-9+/]+={0,2}$/

