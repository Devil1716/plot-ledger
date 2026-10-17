"use client";

import { plotBands } from "@/lib/ledger-math";
import { formatSqftHundredths, LAND_DEPTH_FT, LAND_WIDTH_FT } from "@/lib/ledger-math";
import type { PersonRecord } from "@/lib/records";
import type { ShareRow } from "@/lib/ledger-math";

export function LandPlot({ people, shares }: { people: PersonRecord[]; shares: ShareRow[] }) {
  const bands = plotBands(
    shares.map((share) => {
      const person = people.find((item) => item.id === share.personId);
      return {
        ...share,
        name: person?.name ?? share.personId,
        color: person?.color ?? "#8a8175",
      };
    }),
  );
  const label = bands.map((band) => `${band.name} ${formatSqftHundredths(band.sqftHundredths)} sq ft`).join(", ");

  return (
    <div className="grid gap-4 sm:grid-cols-[minmax(0,180px)_1fr] sm:items-center">
      <div>
        <p className="text-muted-foreground mb-1 text-center text-[11px] tracking-[0.14em] uppercase">Rear · 54 ft</p>
        <svg
          viewBox={`0 0 ${LAND_WIDTH_FT} ${LAND_DEPTH_FT}`}
          className="mx-auto aspect-[54/105] w-full max-w-[180px] rounded-md shadow-sm"
          role="img"
          aria-label={`Plot split: ${label}`}
        >
          {bands.map((band) => (
            <rect key={band.id} x="0" y={band.y} width={LAND_WIDTH_FT} height={band.height} fill={band.color} />
          ))}
          <rect
            x="0.4"
            y="0.4"
            width={LAND_WIDTH_FT - 0.8}
            height={LAND_DEPTH_FT - 0.8}
            fill="none"
            stroke="#1c1915"
            strokeWidth="0.8"
          />
        </svg>
        <p className="text-muted-foreground mt-1 text-center text-[11px] tracking-[0.14em] uppercase">
          Road · {LAND_DEPTH_FT} ft deep
        </p>
      </div>
      <ul className="space-y-2">
        {bands.map((band) => (
          <li key={band.id} className="flex items-center gap-2 text-sm">
            <span className="size-3 shrink-0 rounded-sm" style={{ background: band.color }} />
            <span className="min-w-0 flex-1 truncate">{band.name}</span>
            <span className="tabular-nums">{formatSqftHundredths(band.sqftHundredths)} sq ft</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
