import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { KycStatus } from "@shared/api";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function parseJwt(token: string) {
  try {
    const base64Url = token.split('.')[1];
    if (!base64Url) return null;
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const padding = '='.repeat((4 - base64.length % 4) % 4);
    const jsonPayload = decodeURIComponent(window.atob(base64 + padding).split('').map(function(c) {
        return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
    }).join(''));
    return JSON.parse(jsonPayload);
  } catch (e) {
    console.error("Failed to parse token", e);
    return null;
  }
}

export const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || "/api").trim();

export const FORCE_UPDATE = Date.now();

