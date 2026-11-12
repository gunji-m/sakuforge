"use client";

import { Fragment, useState } from "react";
import type { Aggregation, SectorComposition } from "./api-response";
import { barRows, formatPercent, OTHER_COLOR, summarizeDonut } from "./sectors";

type Axis = "sector17" | "sector33";

const AXES: readonly { readonly axis: Axis; readonly label: string }[] = [
  { axis: "sector17", label: "17 業種" },
  { axis: "sector33", label: "33 業種" },
];

const RADIUS = 112;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

// Colours and lengths are SVG attributes, not inline styles, so a strict style policy can apply.
function Swatch({ color }: { readonly color: string }) {
  return (
    <svg className="swatch" viewBox="0 0 10 10" aria-hidden="true">
      <rect width="10" height="10" fill={color} />
    </svg>
  );
}

function Donut({ composition }: { readonly composition: SectorComposition }) {
  const summary = summarizeDonut(composition);
  let offset = 0;
  const arcs = summary.segments.map((segment) => {
    const length = (segment.hundredths / 10000) * CIRCUMFERENCE;
    const arc = { ...segment, length, offset };
    offset += length;
    return arc;
  });
  const legend = [
    ...summary.segments,
    ...(summary.otherHundredths > 0
      ? [
          {
            key: "other",
            label: "その他",
            hundredths: summary.otherHundredths,
            color: OTHER_COLOR,
          },
        ]
      : []),
  ];
  const description = legend
    .map(({ label, hundredths }) => `${label} ${formatPercent(hundredths)}%`)
    .join("、");
  return (
    <div className="card donut">
      <h2>業種構成</h2>
      <svg className="donut-figure" viewBox="0 0 320 320" role="img" aria-label={description}>
        <circle cx="160" cy="160" r={RADIUS} fill="none" stroke={OTHER_COLOR} strokeWidth="44" />
        {arcs.map(({ key, color, length, offset: start }) => (
          <circle
            key={key}
            cx="160"
            cy="160"
            r={RADIUS}
            fill="none"
            stroke={color}
            strokeWidth="44"
            strokeDasharray={`${length} ${CIRCUMFERENCE}`}
            strokeDashoffset={-start}
            transform="rotate(-90 160 160)"
          />
        ))}
        <text x="160" y="150" textAnchor="middle" className="donut-count">
          {summary.heldCount}
        </text>
        <text x="160" y="178" textAnchor="middle" className="donut-total">
          業種 / {summary.totalCount}
        </text>
        <text x="160" y="202" textAnchor="middle" className="donut-top">
          上位 3 で {formatPercent(summary.topThreeHundredths)}%
        </text>
      </svg>
      <ul className="legend">
        {legend.map(({ key, label, hundredths, color }) => (
          <li key={key}>
            <span className="legend-label">
              <Swatch color={color} />
              {label}
            </span>
            <span>{formatPercent(hundredths)}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Bars({
  composition,
  twoColumns,
}: {
  readonly composition: SectorComposition;
  readonly twoColumns: boolean;
}) {
  const rows = barRows(composition);
  const firstUnheld = rows.findIndex((row) => !row.held);
  const [open, setOpen] = useState(false);
  return (
    <ul className={`bars${twoColumns ? " bars-two" : ""}${open ? " bars-open" : ""}`}>
      {rows.map(({ key, label, held, percent, width }, index) => (
        <Fragment key={key}>
          {!held && index === firstUnheld && (
            // Shown on narrow screens only, where the rows below are folded into a list of names.
            <li className="bar-unheld-head">
              <button
                type="button"
                className="bar-unheld-toggle"
                aria-expanded={open}
                onClick={() => setOpen(!open)}
              >
                保有の無い業種（{rows.length - firstUnheld} 件）
              </button>
            </li>
          )}
          <li className={held ? "bar-row" : "bar-row bar-row-unheld"}>
            <span className="bar-label">{label}</span>
            <svg
              className="bar-track"
              viewBox="0 0 100 10"
              preserveAspectRatio="none"
              aria-hidden="true"
            >
              {held ? (
                <>
                  <rect width="100" height="10" className="bar-ground" />
                  <rect width={width} height="10" className="bar-fill" />
                </>
              ) : (
                <line x1="0" y1="5" x2="100" y2="5" className="bar-unheld" />
              )}
            </svg>
            <span className="bar-value">{held ? percent : "—"}</span>
          </li>
        </Fragment>
      ))}
    </ul>
  );
}

export function SectorCharts({ aggregation }: { readonly aggregation: Aggregation }) {
  const [axis, setAxis] = useState<Axis>("sector17");
  const composition = aggregation[axis];
  return (
    <section className="charts" aria-label="業種の構成">
      {composition.status === "computed" ? (
        <Donut composition={composition} />
      ) : (
        <div className="card donut">
          <h2>業種構成</h2>
          <p className="figure-note">評価額の合計が 0 のため、構成を計算できません。</p>
        </div>
      )}
      <div className="card-outline bars-card">
        <div className="bars-head">
          <h2>業種別の構成比、%</h2>
          <div className="bars-tools">
            <span className="figure-note bars-note">持っていない業種は点線</span>
            <div className="toggle">
              {AXES.map((option) => (
                <button
                  key={option.axis}
                  type="button"
                  className="toggle-option"
                  aria-pressed={axis === option.axis}
                  onClick={() => setAxis(option.axis)}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
        </div>
        {composition.status === "computed" && (
          <Bars composition={composition} twoColumns={axis === "sector33"} />
        )}
      </div>
    </section>
  );
}
