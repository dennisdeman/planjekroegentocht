"use client";

import { useMemo, useState } from "react";
import type { ConfigV2, Id } from "@core";

export interface PlannerFilterState {
  locationIds: Set<Id>;
  spelIds: Set<Id>;
  timeslotIndices: Set<number>;
  groupSearch: string;
}

export const EMPTY_FILTERS: PlannerFilterState = {
  locationIds: new Set(),
  spelIds: new Set(),
  timeslotIndices: new Set(),
  groupSearch: "",
};

export function hasActiveFilters(f: PlannerFilterState): boolean {
  return f.locationIds.size > 0 || f.spelIds.size > 0 || f.timeslotIndices.size > 0 || f.groupSearch.length > 0;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Whole-word match per zoekterm-token: "groep 1" matcht "Groep 1" maar niet "Groep 11".
export function matchesGroupSearch(name: string, search: string): boolean {
  const query = search.trim();
  if (!query) return false;
  const tokens = query.split(/\s+/).filter(Boolean);
  return tokens.every((token) => new RegExp(`\\b${escapeRegex(token)}\\b`, "i").test(name));
}

interface PlannerFiltersProps {
  config: ConfigV2;
  filters: PlannerFilterState;
  onChange: (filters: PlannerFilterState) => void;
}

function toggleSet<T>(set: Set<T>, value: T): Set<T> {
  const next = new Set(set);
  if (next.has(value)) next.delete(value);
  else next.add(value);
  return next;
}

function countActive(f: PlannerFilterState): number {
  return (
    f.locationIds.size +
    f.spelIds.size +
    f.timeslotIndices.size +
    (f.groupSearch.length > 0 ? 1 : 0)
  );
}

export function PlannerFilters({ config, filters, onChange }: PlannerFiltersProps) {
  const [isOpen, setIsOpen] = useState(false);

  const activeTimeslots = useMemo(
    () => config.timeslots.filter((t) => t.kind === "active").sort((a, b) => a.index - b.index),
    [config.timeslots],
  );

  const spellen = useMemo(
    () => config.activityTypes.filter((a) => a.id !== "activity-pause"),
    [config.activityTypes],
  );

  const active = hasActiveFilters(filters);
  const activeCount = countActive(filters);

  return (
    <div className={isOpen ? "planner-filters open" : "planner-filters"}>
      <button
        type="button"
        className="planner-filters-toggle"
        onClick={() => setIsOpen((v) => !v)}
        aria-expanded={isOpen}
      >
        <span className="planner-filters-toggle-label">
          Filters
          {activeCount > 0 && <span className="planner-filters-badge">{activeCount}</span>}
        </span>
        <span className={isOpen ? "planner-filters-chevron open" : "planner-filters-chevron"} aria-hidden="true">
          ▾
        </span>
      </button>

      {isOpen && (
        <div className="planner-filters-body">
          {/* Locatie */}
          <div className="planner-filter-row">
            <span className="planner-filter-label">Locatie</span>
            <div className="planner-filter-chips">
              {config.locations.map((loc) => (
                <button
                  key={loc.id}
                  type="button"
                  className={filters.locationIds.has(loc.id) ? "filter-chip active" : "filter-chip"}
                  onClick={() => onChange({ ...filters, locationIds: toggleSet(filters.locationIds, loc.id) })}
                >
                  {loc.name}
                </button>
              ))}
            </div>
          </div>

          {/* Spel */}
          <div className="planner-filter-row">
            <span className="planner-filter-label">Spel</span>
            <div className="planner-filter-chips">
              {spellen.map((spel) => (
                <button
                  key={spel.id}
                  type="button"
                  className={filters.spelIds.has(spel.id) ? "filter-chip active" : "filter-chip"}
                  onClick={() => onChange({ ...filters, spelIds: toggleSet(filters.spelIds, spel.id) })}
                >
                  {spel.name}
                </button>
              ))}
            </div>
          </div>

          {/* Ronde */}
          <div className="planner-filter-row">
            <span className="planner-filter-label">Ronde</span>
            <div className="planner-filter-chips">
              {activeTimeslots.map((slot, i) => (
                <button
                  key={slot.id}
                  type="button"
                  className={filters.timeslotIndices.has(slot.index) ? "filter-chip active" : "filter-chip"}
                  onClick={() => onChange({ ...filters, timeslotIndices: toggleSet(filters.timeslotIndices, slot.index) })}
                >
                  {i + 1}
                </button>
              ))}
            </div>
          </div>

          {/* Groep zoeken */}
          <div className="planner-filter-row">
            <span className="planner-filter-label">Groep</span>
            <input
              type="text"
              className="planner-filter-search"
              placeholder="Zoek groep..."
              value={filters.groupSearch}
              onChange={(e) => onChange({ ...filters, groupSearch: e.target.value })}
            />
          </div>

          {active && (
            <button type="button" className="filter-chip filter-reset" onClick={() => onChange(EMPTY_FILTERS)}>
              Reset filters
            </button>
          )}
        </div>
      )}
    </div>
  );
}
