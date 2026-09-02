"use client";

import { useId, useMemo, useState } from "react";
import { messages } from "@/i18n";

const content = messages.pricing.calculator;

const REQUEST_STEPS = [
  10_000, 50_000, 100_000, 500_000, 1_000_000, 5_000_000, 10_000_000,
  50_000_000, 100_000_000,
];
const PRICE_STEPS = [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1];
const COLLATERAL_STEPS = [
  1_000, 5_000, 10_000, 50_000, 100_000, 500_000, 1_000_000,
];
const CADENCE_STEPS = [
  { perMonth: 1, label: content.cadenceOptions.monthly },
  { perMonth: 4, label: content.cadenceOptions.weekly },
  { perMonth: 30, label: content.cadenceOptions.daily },
  { perMonth: 720, label: content.cadenceOptions.hourly },
];

const usd = (value: number, digits = 0) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);

const compactUsd = (value: number) =>
  Math.abs(value) >= 1000 ? usd(value) : usd(value, 2);

const count = (value: number) =>
  new Intl.NumberFormat("en-US", { notation: "compact" }).format(value);

const percent = (value: number) =>
  new Intl.NumberFormat("en-US", {
    style: "percent",
    maximumFractionDigits: 1,
  }).format(value);

function Slider({
  label,
  value,
  display,
  min,
  max,
  step = 1,
  onChange,
}: {
  label: string;
  value: number;
  display: string;
  min: number;
  max: number;
  step?: number;
  onChange: (value: number) => void;
}) {
  const id = useId();

  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <label htmlFor={id} className="text-ink-muted text-md">
          {label}
        </label>
        <span className="font-medium text-ink-strong text-md tabular-nums">
          {display}
        </span>
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="mt-1 h-11 w-full cursor-pointer appearance-none bg-transparent accent-ink-strong [&::-moz-range-track]:h-1 [&::-moz-range-track]:rounded-full [&::-moz-range-track]:bg-overlay/15 [&::-webkit-slider-runnable-track]:h-1 [&::-webkit-slider-runnable-track]:rounded-full [&::-webkit-slider-runnable-track]:bg-overlay/15"
      />
    </div>
  );
}

function Row({
  label,
  value,
  emphasis = false,
}: {
  label: string;
  value: string;
  emphasis?: boolean;
}) {
  return (
    <div
      className={`flex items-baseline justify-between gap-4 py-2.5 ${
        emphasis ? "border-overlay/10 border-t pt-3 font-medium" : ""
      }`}
    >
      <span
        className={
          emphasis ? "text-ink-strong text-md" : "text-ink-muted text-md"
        }
      >
        {label}
      </span>
      <span
        className={`tabular-nums ${
          emphasis ? "text-ink-strong text-lg" : "text-ink-body text-md"
        }`}
      >
        {value}
      </span>
    </div>
  );
}

export default function SavingsCalculator() {
  const [requestIndex, setRequestIndex] = useState(4);
  const [priceIndex, setPriceIndex] = useState(2);
  const [cadenceIndex, setCadenceIndex] = useState(2);
  const [collateralIndex, setCollateralIndex] = useState(2);
  const [ratePercent, setRatePercent] = useState(0.5);
  const [gasPerSettlement, setGasPerSettlement] = useState(0.01);
  const [apyPercent, setApyPercent] = useState(5);

  const model = useMemo(() => {
    const requests = REQUEST_STEPS[requestIndex];
    const price = PRICE_STEPS[priceIndex];
    const collateral = COLLATERAL_STEPS[collateralIndex];
    const settlements = CADENCE_STEPS[cadenceIndex].perMonth;

    const volume = requests * price;

    const baselineGas = requests * gasPerSettlement;

    const micaGas = settlements * gasPerSettlement;
    const clearingFee = volume * (ratePercent / 100);
    const monthlyYield = (collateral * (apyPercent / 100)) / 12;

    const baselineCost = baselineGas;
    const micaCost = micaGas + clearingFee - monthlyYield;
    const saving = baselineCost - micaCost;

    const perRequestCost = gasPerSettlement;
    const marginalMicaCost = price * (ratePercent / 100);
    const fixed = micaGas - monthlyYield;
    const breakEven =
      perRequestCost > marginalMicaCost
        ? Math.max(0, fixed / (perRequestCost - marginalMicaCost))
        : null;

    return {
      requests,
      price,
      collateral,
      settlements,
      volume,
      baselineGas,
      micaGas,
      clearingFee,
      monthlyYield,
      baselineCost,
      micaCost,
      saving,
      reduction: baselineCost > 0 ? saving / baselineCost : 0,
      txAvoided: requests - settlements,
      breakEven,
    };
  }, [
    requestIndex,
    priceIndex,
    cadenceIndex,
    collateralIndex,
    ratePercent,
    gasPerSettlement,
    apyPercent,
  ]);

  const positive = model.saving > 0;

  return (
    <div className="overflow-hidden rounded-md border border-overlay/10 bg-surface-deep/25">
      <div className="grid lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:divide-x lg:divide-overlay/10">
        <div className="space-y-4 p-5 sm:space-y-6 sm:p-8">
          <Slider
            label={content.inputs.requests}
            value={requestIndex}
            display={count(model.requests)}
            min={0}
            max={REQUEST_STEPS.length - 1}
            onChange={setRequestIndex}
          />
          <Slider
            label={content.inputs.price}
            value={priceIndex}
            display={usd(model.price, model.price < 0.01 ? 3 : 2)}
            min={0}
            max={PRICE_STEPS.length - 1}
            onChange={setPriceIndex}
          />
          <Slider
            label={content.inputs.cadence}
            value={cadenceIndex}
            display={CADENCE_STEPS[cadenceIndex].label}
            min={0}
            max={CADENCE_STEPS.length - 1}
            onChange={setCadenceIndex}
          />
          <Slider
            label={content.inputs.rate}
            value={ratePercent}
            display={`${ratePercent.toFixed(2)}%`}
            min={0}
            max={2}
            step={0.05}
            onChange={setRatePercent}
          />
          <Slider
            label={content.inputs.gas}
            value={gasPerSettlement}
            display={usd(gasPerSettlement, 3)}
            min={0.005}
            max={0.5}
            step={0.005}
            onChange={setGasPerSettlement}
          />
          <Slider
            label={content.inputs.collateral}
            value={collateralIndex}
            display={usd(model.collateral)}
            min={0}
            max={COLLATERAL_STEPS.length - 1}
            onChange={setCollateralIndex}
          />
          <Slider
            label={content.inputs.apy}
            value={apyPercent}
            display={`${apyPercent.toFixed(1)}%`}
            min={0}
            max={12}
            step={0.5}
            onChange={setApyPercent}
          />
        </div>

        <div className="p-5 sm:p-8">
          <div className="grid gap-6 sm:grid-cols-2 sm:gap-8">
            <div>
              <p className="mb-2 text-ink-subtle text-md uppercase tracking-wider">
                {content.baselineLabel}
              </p>
              <Row
                label={content.rows.volume}
                value={compactUsd(model.volume)}
              />
              <Row label={content.rows.onchain} value={count(model.requests)} />
              <Row
                label={content.rows.gas}
                value={compactUsd(model.baselineGas)}
              />
              <Row
                label={content.rows.total}
                value={compactUsd(model.baselineCost)}
                emphasis
              />
            </div>

            <div>
              <p className="mb-2 text-ink-strong text-md uppercase tracking-wider">
                {content.micaLabel}
              </p>
              <Row
                label={content.rows.volume}
                value={compactUsd(model.volume)}
              />
              <Row
                label={content.rows.onchain}
                value={count(model.settlements)}
              />
              <Row label={content.rows.gas} value={compactUsd(model.micaGas)} />
              <Row
                label={content.rows.fee}
                value={compactUsd(model.clearingFee)}
              />
              <Row
                label={content.rows.yield}
                value={`− ${compactUsd(model.monthlyYield)}`}
              />
              <Row
                label={content.rows.total}
                value={compactUsd(model.micaCost)}
                emphasis
              />
            </div>
          </div>

          <div className="mt-8 rounded-md border border-overlay/10 bg-overlay/3 p-4 sm:p-6">
            <p className="text-ink-muted text-md">
              {positive
                ? content.results.savingTitle
                : content.results.savingNegative}
            </p>
            <p className="mt-1 font-semibold text-4xl text-ink-strong tabular-nums">
              {positive ? compactUsd(model.saving) : compactUsd(-model.saving)}
            </p>

            {positive ? (
              <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <p className="text-ink-subtle text-md">
                    {content.results.txAvoided}
                  </p>
                  <p className="font-medium text-ink-strong text-xl tabular-nums">
                    {count(model.txAvoided)}
                  </p>
                </div>
                <div>
                  <p className="text-ink-subtle text-md">
                    {content.results.reduction}
                  </p>
                  <p className="font-medium text-ink-strong text-xl tabular-nums">
                    {percent(Math.min(model.reduction, 1))}
                  </p>
                </div>
              </div>
            ) : (
              <p className="mt-3 text-ink-muted text-md leading-relaxed">
                {content.results.savingNegativeHint}
                {model.breakEven
                  ? ` ${content.results.breakeven}: ${count(model.breakEven)}.`
                  : ""}
              </p>
            )}
          </div>

          <p className="mt-6 text-ink-subtle text-md leading-relaxed">
            {content.disclaimer}
          </p>
        </div>
      </div>
    </div>
  );
}
