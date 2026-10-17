"use client";

import { motion } from "motion/react";
import { formatSqftHundredths, LAND_DEPTH_FT, LAND_WIDTH_FT, plotBands } from "@/lib/ledger-math";
import type { ShareRow } from "@/lib/ledger-math";
import type { PersonRecord } from "@/lib/records";

/**
 * Plot drawing: a rounded 54 × 105 ft rectangle split into depth bands, one per contributor.
 * `highlightId` dims every other band; `compact` drops labels and dimension marks for the row mini-map.
 */
export function LandPlot({
  people,
  shares,
  highlightId = null,
  compact = false,
  onSelect,
}: {
  people: PersonRecord[];
  shares: ShareRow[];
  highlightId?: string | null;
  compact?: boolean;
  onSelect?: (id: string) => void;
}) {
  const bands = plotBands(
    shares.map((share) => {
      const person = people.find((item) => item.id === share.personId);
      return { ...share, name: person?.name ?? share.personId, color: person?.color ?? "#94A3B8" };
    }),
  );
  const label = bands.map((band) => `${band.name} ${formatSqftHundredths(band.sqftHundredths)} sq ft`).join(", ");
  const pad = compact ? 0 : 9;
  const W = LAND_WIDTH_FT + pad * 2;
  const H = LAND_DEPTH_FT + (compact ? 0 : pad * 2);

  return (
    <svg
      viewBox={`${-pad - (compact ? 0 : 3)} ${-pad} ${W + (compact ? 0 : 3)} ${H}`}
      className={compact ? "h-full w-auto" : "mx-auto block h-auto w-full max-w-[220px]"}
      role="img"
      aria-label={`Plot split, ${LAND_WIDTH_FT} by ${LAND_DEPTH_FT} feet: ${label}`}
    >
      <defs>
        <clipPath id={compact ? "plot-clip-c" : "plot-clip"}>
          <rect x="0" y="0" width={LAND_WIDTH_FT} height={LAND_DEPTH_FT} rx="5" />
        </clipPath>
        <pattern id="plot-grid" width="6" height="6" patternUnits="userSpaceOnUse">
          <path d="M6 0H0V6" fill="none" stroke="#0b0f1a" strokeOpacity="0.07" strokeWidth="0.3" />
        </pattern>
      </defs>
      <g clipPath={`url(#${compact ? "plot-clip-c" : "plot-clip"})`}>
        <rect x="0" y="0" width={LAND_WIDTH_FT} height={LAND_DEPTH_FT} fill="#eef0f4" />
        {bands.map((band, index) => {
          const dim = highlightId !== null && band.id !== highlightId;
          return (
            <motion.g
              key={band.id}
              initial={{ opacity: 0, x: -LAND_WIDTH_FT }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ type: "spring", stiffness: 160, damping: 20, delay: 0.1 + index * 0.12 }}
              onClick={onSelect ? () => onSelect(band.id) : undefined}
              style={{ cursor: onSelect ? "pointer" : undefined }}
            >
              <motion.rect
                x="0"
                y={band.y}
                width={LAND_WIDTH_FT}
                height={band.height}
                fill={band.color}
                animate={{ opacity: dim ? 0.22 : 1 }}
                transition={{ duration: 0.3 }}
              />
              {index > 0 ? <line x1="0" x2={LAND_WIDTH_FT} y1={band.y} y2={band.y} stroke="#f7f8fa" strokeWidth="0.9" /> : null}
              {!compact && band.height >= 9 ? (
                <text
                  x={LAND_WIDTH_FT / 2}
                  y={band.y + band.height / 2}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fill="#0b0f1a"
                  fillOpacity={dim ? 0.35 : 0.85}
                  style={{ fontSize: 3.6, fontWeight: 600 }}
                >
                  {band.name.split(" ")[0]} · {formatSqftHundredths(band.sqftHundredths).replace(/\.00$/, "")}
                </text>
              ) : null}
            </motion.g>
          );
        })}
        <rect x="0" y="0" width={LAND_WIDTH_FT} height={LAND_DEPTH_FT} fill="url(#plot-grid)" pointerEvents="none" />
      </g>
      <rect x="0.3" y="0.3" width={LAND_WIDTH_FT - 0.6} height={LAND_DEPTH_FT - 0.6} rx="5" fill="none" stroke="#0b0f1a" strokeOpacity="0.18" strokeWidth="0.6" />
      {!compact ? (
        <g fill="#5a6478" style={{ fontSize: 3.4 }} stroke="#94a3b8" strokeWidth="0.35">
          <line x1="0" x2={LAND_WIDTH_FT} y1={-4} y2={-4} />
          <line x1="0" x2="0" y1={-5.5} y2={-2.5} />
          <line x1={LAND_WIDTH_FT} x2={LAND_WIDTH_FT} y1={-5.5} y2={-2.5} />
          <text x={LAND_WIDTH_FT / 2} y={-5.6} textAnchor="middle" stroke="none">
            {LAND_WIDTH_FT} ft · rear
          </text>
          <line x1={LAND_WIDTH_FT + 4} x2={LAND_WIDTH_FT + 4} y1="0" y2={LAND_DEPTH_FT} />
          <line x1={LAND_WIDTH_FT + 2.5} x2={LAND_WIDTH_FT + 5.5} y1="0" y2="0" />
          <line x1={LAND_WIDTH_FT + 2.5} x2={LAND_WIDTH_FT + 5.5} y1={LAND_DEPTH_FT} y2={LAND_DEPTH_FT} />
          <text
            x={LAND_WIDTH_FT + 7.5}
            y={LAND_DEPTH_FT / 2}
            textAnchor="middle"
            stroke="none"
            transform={`rotate(90 ${LAND_WIDTH_FT + 7.5} ${LAND_DEPTH_FT / 2})`}
          >
            {LAND_DEPTH_FT} ft deep
          </text>
          <text x={LAND_WIDTH_FT / 2} y={LAND_DEPTH_FT + 6} textAnchor="middle" stroke="none">
            road
          </text>
        </g>
      ) : null}
    </svg>
  );
}
