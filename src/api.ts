import type { PodiumCounts } from "./types";

export interface CountryResponse {
  [name: string]: {
    name: string;
    rating_points: number;
    ovr?: number;
    podiums?: PodiumCounts;
  };
}

const API_BASE = import.meta.env.VITE_API_BASE ?? "http://localhost:8000";

export async function fetchCountries(): Promise<CountryResponse> {
  const res = await fetch(`${API_BASE}/countries`);
  if (!res.ok) {
    throw new Error(`Ошибка при загрузке стран: ${res.status}`);
  }
  return res.json();
}
