"use client";

import { MoonIcon, SunIcon, Check } from "lucide-react";
import { Switch } from "../components/ui/switch";
import React, { useState } from "react";
import { cn } from "../../lib/utils";
import {
  getPrice,
  getCurrencySymbol,
  isTanzania,
  isOneTime,
} from "../../constants/pricing";

interface Props {
  plans: any;
  isLocal: boolean;
  countryCode: string;
}

export const Subscriptions = ({ plans, isLocal, countryCode }: Props) => {
  const [monthly, setMonthly] = useState(false);

  return (
    <>
      {!isLocal && (
        <div
          className="w-full group inline-flex items-center gap-2 pr-5 mb-4"
          data-state={monthly ? "checked" : "unchecked"}
        >
          <span
            className="group-data-[state=checked]:text-muted-foreground/40 cursor-pointer"
            onClick={() => {
              setMonthly(false);
            }}
          >
            Monthly
          </span>
          <Switch
            checked={monthly}
            onCheckedChange={() => {
              setMonthly(!monthly);
            }}
            aria-label="Toggle between dark and light mode"
            className="cursor-pointer"
          />
          <span
            className="group-data-[state=unchecked]:text-muted-foreground/40 cursor-pointer"
            onClick={() => {
              setMonthly(true);
            }}
          >
            Yearly
          </span>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        {plans.map((plan: any) => {
          const price = getPrice(plan, countryCode);
          const symbol = getCurrencySymbol(countryCode);
          const isCustom = price === "Custom";
          const oneTime = !isCustom && isOneTime(plan);

          // Same value that's rendered on screen - reused below so the
          // GTM tracking attributes always match what the user saw.
          const displayPrice = isCustom
            ? price
            : oneTime
              ? isLocal
                ? price
                : (price as string[])[0]
              : isLocal
                ? price
                : monthly
                  ? (price as string[])[1]
                  : (price as string[])[0];

          const billingPeriod = isCustom
            ? "custom"
            : oneTime
              ? "one_time"
              : isLocal
                ? monthly
                  ? "monthly"
                  : "yearly"
                : monthly
                  ? "yearly"
                  : "monthly";

          return (
            <div
              className={`flex flex-col rounded-3xl p-8 ${
                plan.featured
                  ? "border-2 border-brand bg-ink/85 text-white shadow-soft"
                  : "border border-black/5 bg-white text-ink shadow-card"
              }`}
              key={plan.name}
            >
              {plan.featured && (
                <span className="mb-4 inline-flex w-fit rounded-pill bg-brand px-3 py-1 text-xs font-semibold text-white">
                  Most popular
                </span>
              )}
              <h3 className="font-display text-xl font-bold">{plan.name}</h3>
              <div className="mt-4 flex items-end gap-1">
                <span
                  className={cn(
                    "font-display font-extrabold tracking-tight",
                    isLocal ? "text-4xl" : "text-5xl",
                  )}
                >
                  {isCustom
                    ? price
                    : oneTime
                      ? symbol + (isLocal ? price : (price as string[])[0])
                      : monthly
                        ? symbol + (isLocal ? price : price[1])
                        : symbol + (isLocal ? price : price[0])}
                </span>
                {/* No period suffix at all for "Custom" (contact sales) or
                    one-time/fixed-price plans like RareBooks Desktop —
                    just the bare price. */}
                {!isCustom && !oneTime && (
                  <span
                    className={
                      plan.featured
                        ? "mb-1.5 text-white/60"
                        : "mb-1.5 text-muted"
                    }
                  >
                    {isLocal
                      ? !monthly
                        ? "/Year"
                        : "/Month"
                      : !monthly
                        ? "/Month"
                        : "/Year"}
                  </span>
                )}
              </div>
              <p
                className={`mt-3 text-sm leading-relaxed ${plan.featured ? "text-white/70" : "text-muted"}`}
              >
                {plan.blurb}
              </p>
              <ul className="mt-6 flex flex-1 flex-col gap-3">
                {plan.features.map((f: string) => (
                  <li className="flex items-center gap-2.5 text-sm" key={f}>
                    <span
                      className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${
                        plan.featured
                          ? "bg-brand text-white"
                          : "bg-brand-soft text-brand"
                      }`}
                    >
                      <Check size={12} />
                    </span>
                    <span
                      className={plan.featured ? "text-white/90" : "text-ink"}
                    >
                      {f}
                    </span>
                  </li>
                ))}
              </ul>
              <button
                type="button"
                data-open-modal={
                  isCustom
                    ? "contact-us-modal"
                    : oneTime
                      ? "desktop-payment-modal"
                      : "trial-modal"
                }
                data-cta-location="pricing_page"
                data-plan-name={!isCustom ? plan.name : undefined}
                data-plan-price={!isCustom ? displayPrice : undefined}
                data-billing-period={!isCustom ? billingPeriod : undefined}
                data-currency={!isCustom ? (isLocal ? "TZS" : "USD") : undefined}
                className={`mt-8 inline-flex cursor-pointer items-center justify-center rounded-pill px-6 py-3 text-sm font-semibold transition-transform hover:-translate-y-0.5 ${
                  plan.featured ? "bg-white text-ink" : "bg-brand text-white"
                }`}
              >
                {isCustom ? "Contact sales" : oneTime ? "Get Lifetime License" : "Start free trial"}
              </button>
            </div>
          );
        })}
      </div>
    </>
  );
};
