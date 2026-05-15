export interface VenueTypeBadge {
  label: string;
  icon: string;
  bg: string;
  fg: string;
}

export const VENUE_TYPE_BADGES: Record<string, VenueTypeBadge> = {
  bar: { label: "Bar", icon: "🍺", bg: "#fef3c7", fg: "#92400e" },
  pub: { label: "Pub", icon: "🍻", bg: "#fed7aa", fg: "#9a3412" },
  cafe: { label: "Café", icon: "☕", bg: "#dcfce7", fg: "#166534" },
  nightclub: { label: "Nightclub", icon: "🎵", bg: "#e9d5ff", fg: "#6b21a8" },
};

export function getVenueTypeBadge(type: string | undefined | null): VenueTypeBadge | null {
  if (!type) return null;
  return VENUE_TYPE_BADGES[type] ?? null;
}
