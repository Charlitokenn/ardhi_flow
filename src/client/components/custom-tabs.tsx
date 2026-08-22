"use client";

import {type ReactNode, useState} from "react";
import {AnimatePresence, motion} from "motion/react";
import {cn} from "@/lib/utils";
import {CheckCircle2, Circle, Cpu, Layers, type LucideIcon, Sparkles, Terminal} from "lucide-react";
import {Tabs, TabsList, TabsTrigger} from "@/components/ui/tabs";

/* ------------------------------------------------------------------ */
/*  Types                                                              */

/* ------------------------------------------------------------------ */

export interface TabItem {
    id: string;
    label: string;
    /** Icon shown in the sidebar trigger (and optionally the panel header). */
    icon: LucideIcon;
    /** Small badge shown next to the panel header, e.g. "Beta", "v2.4". */
    status?: string;
    /**
     * The panel body. Pass any React node — an element, a component
     * instance, or a render function if you need access to whether the
     * tab is currently active.
     *
     *   content: <MyDashboard />
     *   content: () => <MyDashboard />
     *   content: (isActive) => <MyDashboard live={isActive} />
     */
    content: ReactNode | ((isActive: boolean) => ReactNode);
}

export interface TabsScrollSwitchProps {
    /** The tabs to render. Falls back to a small demo set if omitted. */
    tabs?: TabItem[];
    /** Uncontrolled initial tab id. Defaults to the first tab's id. */
    defaultTab?: string;
    /** Controlled active tab id (pair with onTabChange). */
    activeTab?: string;
    /** Called whenever the active tab changes. */
    onTabChange?: (id: string) => void;
    /** Extra classes on the outer wrapper. */
    className?: string;
    /** Extra classes on the sidebar tab list container. */
    sidebarClassName?: string;
    /** Extra classes on the content panel's outer container. */
    contentClassName?: string;
    /** Extra classes on each panel card (the bordered box around content). */
    panelClassName?: string;
    /** Fixed height of the content panel. Defaults to 590px. Pass `undefined`/0 to let content size itself. */
    contentHeight?: number;
    /** Hide the built-in icon/label/status header row above each panel's content. */
    hideHeader?: boolean;
    /** Strip the panel's card chrome (border, background, padding) so `content` renders completely bare. Implies no header regardless of `hideHeader`. */
    unstyled?: boolean;
    /** Spring transition config for the panel swap animation. */
    transition?: { stiffness?: number; damping?: number };
    /** When true, renders the skeleton instead of tabs/content — use while data is loading. */
    loading?: boolean;
    /** Number of sidebar rows to show in the skeleton. Defaults to 4, or `tabs.length` if provided. */
    skeletonTabCount?: number;
    /** Optional max-width cap (e.g. "56rem", "1024px"). Omit to fill the available width of the parent. */
    maxWidth?: string;
}

/* ------------------------------------------------------------------ */
/*  Default demo data (used only if no `tabs` prop is passed)          */

/* ------------------------------------------------------------------ */

function DemoStatsAndFeatures({
                                  stats,
                                  features,
                              }: {
    stats: { label: string; value: string }[];
    features: { label: string; done: boolean }[];
}) {
    return (
        <div className="flex flex-col gap-5">
            <div className="grid grid-cols-3 gap-4">
                {stats.map((s) => (
                    <div key={s.label}>
                        <div className="text-2xl font-bold tracking-tight text-foreground tabular-nums">
                            {s.value}
                        </div>
                        <div className="text-[11px] uppercase tracking-wide text-muted-foreground mt-1 font-medium">
                            {s.label}
                        </div>
                    </div>
                ))}
            </div>

            <div className="h-px bg-border"/>

            <ul className="flex flex-col gap-2.5">
                {features.map((f) => (
                    <li key={f.label} className="flex items-center gap-3 text-sm">
                        {f.done ? (
                            <CheckCircle2 className="w-4 h-4 text-foreground shrink-0"/>
                        ) : (
                            <Circle className="w-4 h-4 text-muted-foreground/30 shrink-0"/>
                        )}
                        <span className={cn("font-medium", f.done ? "text-foreground" : "text-muted-foreground")}>
              {f.label}
            </span>
                    </li>
                ))}
            </ul>
        </div>
    );
}

const defaultTabs: TabItem[] = [
    {
        id: "product",
        label: "Product Suite",
        icon: Sparkles,
        status: "Stable",
        content: (
            <DemoStatsAndFeatures
                stats={[
                    {label: "Models deployed", value: "14"},
                    {label: "Avg. response", value: "38 ms"},
                    {label: "Monthly runs", value: "2.4 M"},
                ]}
                features={[
                    {label: "Text generation", done: true},
                    {label: "Image synthesis", done: true},
                    {label: "Fine-tuning UI", done: false},
                ]}
            />
        ),
    },
    {
        id: "services",
        label: "Core Services",
        icon: Cpu,
        status: "Active",
        content: (
            <DemoStatsAndFeatures
                stats={[
                    {label: "Uptime (30 d)", value: "99.97%"},
                    {label: "Edge nodes", value: "42"},
                    {label: "P95 latency", value: "12 ms"},
                ]}
                features={[
                    {label: "Auto-scaling", done: true},
                    {label: "Global CDN", done: true},
                    {label: "Zero-downtime deploys", done: true},
                ]}
            />
        ),
    },
    {
        id: "playground",
        label: "Playground",
        icon: Terminal,
        status: "Beta",
        content: (
            <DemoStatsAndFeatures
                stats={[
                    {label: "Languages", value: "9"},
                    {label: "Saved snippets", value: "183"},
                    {label: "Avg. exec time", value: "220 ms"},
                ]}
                features={[
                    {label: "Live output stream", done: true},
                    {label: "Memory profiler", done: true},
                    {label: "Collaborative mode", done: false},
                ]}
            />
        ),
    },
    {
        id: "content",
        label: "Asset Hub",
        icon: Layers,
        status: "v2.4",
        content: (
            <DemoStatsAndFeatures
                stats={[
                    {label: "Components", value: "312"},
                    {label: "Design tokens", value: "68"},
                    {label: "Last updated", value: "2 d ago"},
                ]}
                features={[
                    {label: "Figma export", done: true},
                    {label: "Dark mode variants", done: true},
                    {label: "RTL support", done: false},
                ]}
            />
        ),
    },
];

/* ------------------------------------------------------------------ */
/*  Skeleton                                                           */

/* ------------------------------------------------------------------ */

export interface TabsScrollSwitchSkeletonProps {
    /** Number of sidebar rows to render. Defaults to 4. */
    tabCount?: number;
    /** Fixed height of the content panel — should match the real component's `contentHeight`. */
    contentHeight?: number;
    className?: string;
    sidebarClassName?: string;
    contentClassName?: string;
    panelClassName?: string;
    /** Optional max-width cap (e.g. "56rem", "1024px"). Omit to fill the available width of the parent. */
    maxWidth?: string;
    /** Strip the panel's card chrome (border, background) to match an unstyled real panel. */
    unstyled?: boolean;
}

function Pulse({className}: { className?: string }) {
    return <div className={cn("animate-pulse rounded-md bg-muted", className)}/>;
}

/**
 * Loading placeholder for TabsScrollSwitch. Mirrors the real component's
 * outer wrapper spacing (so there's no layout shift on the loading →
 * loaded transition) and sidebar row count/width, but simplifies the
 * content panel itself down to a single pulsing block rather than
 * reproducing the panel's internal header/stat-grid/checklist structure.
 *
 * `contentHeight` defaults to match `CustomTabs`' default (590px); when
 * `CustomTabs` renders this internally it always passes its own
 * `contentHeight` explicitly, so this default only matters if you render
 * `TabsScrollSwitchSkeleton` standalone (e.g. as a Suspense fallback)
 * without specifying one — keep it in sync with `CustomTabs`' default if
 * that ever changes.
 */
export function TabsScrollSwitchSkeleton({
                                             tabCount = 4,
                                             contentHeight = 545,
                                             className,
                                             sidebarClassName,
                                             contentClassName,
                                             panelClassName,
                                             maxWidth,
                                             unstyled = false,
                                         }: TabsScrollSwitchSkeletonProps) {
    return (
        <div
            className={cn("w-full", unstyled ? "w-full" : "py-8", !maxWidth && "mx-auto", className)}
            style={maxWidth ? {maxWidth} : undefined}
            role="status"
            aria-busy="true"
            aria-label="Loading"
        >
            <div className="flex flex-col md:flex-row gap-8 md:gap-12 items-start">
                {/* Sidebar skeleton */}
                <div className={cn("w-full md:w-56 shrink-0", sidebarClassName)}>
                    <div className="flex flex-col gap-1.5 w-full">
                        {Array.from({length: tabCount}).map((_, i) => (
                            <div
                                key={i}
                                className={cn(
                                    "flex items-center gap-3 px-3.5 py-3 rounded-lg w-full",
                                    i === 0 ? "bg-muted" : "border border-border/50"
                                )}
                            >
                                <Pulse className="w-4 h-4 shrink-0 rounded"/>
                                <Pulse className="h-3.5 rounded flex-1 max-w-28"/>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Content panel skeleton — a single loading block, no internal placeholders */}
                <div
                    className={cn("flex-1 w-full min-w-0 relative overflow-hidden", contentClassName)}
                    style={contentHeight ? {minHeight: contentHeight + 20} : undefined}
                >
                    <div
                        className={cn(
                            "w-full h-full animate-pulse",
                            unstyled ? "rounded-md bg-muted" : "rounded-xl border border-border bg-card",
                            panelClassName
                        )}
                        style={contentHeight ? {height: contentHeight} : undefined}
                    />
                </div>
            </div>
        </div>
    );
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */

/* ------------------------------------------------------------------ */

export function CustomTabs({
                               tabs = defaultTabs,
                               defaultTab,
                               activeTab: controlledActiveTab,
                               onTabChange,
                               className,
                               sidebarClassName,
                               contentClassName,
                               panelClassName,
                               contentHeight = 590,
                               hideHeader = false,
                               unstyled = false,
                               transition: transitionProp,
                               loading = false,
                               skeletonTabCount,
                               maxWidth,
                           }: TabsScrollSwitchProps) {
    const [uncontrolledActiveTab, setUncontrolledActiveTab] = useState(
        defaultTab ?? tabs[0]?.id
    );
    const [direction, setDirection] = useState(1);

    if (loading) {
        return (
            <TabsScrollSwitchSkeleton
                tabCount={skeletonTabCount ?? tabs.length}
                contentHeight={contentHeight}
                className={className}
                sidebarClassName={sidebarClassName}
                contentClassName={contentClassName}
                panelClassName={panelClassName}
                maxWidth={maxWidth}
                unstyled={unstyled}
            />
        );
    }

    const isControlled = controlledActiveTab !== undefined;
    const activeTab = isControlled ? controlledActiveTab : uncontrolledActiveTab;

    const handleTabChange = (newId: string) => {
        const prevIdx = tabs.findIndex((t) => t.id === activeTab);
        const nextIdx = tabs.findIndex((t) => t.id === newId);
        setDirection(nextIdx > prevIdx ? 1 : -1);

        if (!isControlled) {
            setUncontrolledActiveTab(newId);
        }
        onTabChange?.(newId);
    };

    if (!tabs.find((t) => t.id === activeTab)) return null;

    const variants = {
        enter: (dir: number) => ({y: dir > 0 ? -48 : 48, opacity: 0}),
        center: {y: 0, opacity: 1},
        exit: (dir: number) => ({y: dir > 0 ? 48 : -48, opacity: 0}),
    };

    const springTransition = {
        type: "spring" as const,
        stiffness: transitionProp?.stiffness ?? 320,
        damping: transitionProp?.damping ?? 30,
    };

    return (
        <div
            className={cn("w-full", unstyled ? "w-full" : "py-8", !maxWidth && "mx-auto", className)}
            style={maxWidth ? {maxWidth} : undefined}
        >
            <Tabs
                value={activeTab}
                onValueChange={handleTabChange}
                orientation="vertical"
                className={cn(
                    "flex flex-col md:flex-row",
                    unstyled ? "gap-0 h-full items-stretch" : "gap-8 md:gap-12 items-start"
                )}
            >
                {/* Sidebar */}
                <div className={cn("w-full md:w-56 shrink-0", unstyled && "self-start", sidebarClassName)}>
                    <TabsList
                        className="flex flex-col gap-1.5 bg-transparent w-full h-auto p-0 rounded-none justify-start border-none">
                        {tabs.map((tab) => {
                            const Icon = tab.icon;
                            const isActive = activeTab === tab.id;
                            return (
                                <TabsTrigger
                                    key={tab.id}
                                    value={tab.id}
                                    className={cn(
                                        "relative flex items-center cursor-pointer gap-3 px-3.5 py-3 rounded-lg font-medium transition-all outline-none w-full justify-start select-none whitespace-nowrap",
                                        "hover:bg-muted/60 hover:text-foreground",
                                        isActive ? "border-none" : "border border-border/50",
                                        "data-[state=active]:bg-transparent data-[state=active]:text-foreground",
                                        "shadow-none ring-0 after:hidden",
                                        isActive ? "text-foreground" : "text-muted-foreground"
                                    )}
                                >
                                    <Icon className="w-4 h-4 z-10 shrink-0"/>
                                    <span className="z-10 text-left">{tab.label}</span>
                                    {isActive && (
                                        <motion.div
                                            layoutId="tabs-scroll-switch-active-indicator"
                                            className="absolute inset-0 bg-muted rounded-lg pointer-events-none"
                                            initial={false}
                                            transition={{type: "spring", stiffness: 300, damping: 25}}
                                        />
                                    )}
                                </TabsTrigger>
                            );
                        })}
                    </TabsList>
                </div>

                {/* Content panel */}
                <div
                    className={cn("flex-1 w-full min-w-0 relative overflow-hidden", contentClassName)}
                    style={contentHeight ? {minHeight: contentHeight + 20} : undefined}
                >
                    <div
                        className="relative w-full"
                        style={contentHeight ? {height: contentHeight} : undefined}
                    >
                        <AnimatePresence mode="wait" custom={direction}>
                            {tabs.map((tab) => {
                                if (tab.id !== activeTab) return null;
                                const Icon = tab.icon;
                                const isActive = tab.id === activeTab;
                                const resolvedContent =
                                    typeof tab.content === "function" ? tab.content(isActive) : tab.content;

                                return (
                                    <motion.div
                                        key={tab.id}
                                        custom={direction}
                                        variants={variants}
                                        initial="enter"
                                        animate="center"
                                        exit="exit"
                                        transition={springTransition}
                                        className={cn(
                                            "absolute inset-0 w-full h-full flex flex-col overflow-auto",
                                            unstyled
                                                ? "gap-0"
                                                : "rounded-xl border border-border bg-card p-5 sm:p-7 gap-5",
                                            panelClassName
                                        )}
                                    >
                                        {!hideHeader && (
                                            <div className="ml-8 mr-4">
                                                <div className="flex items-start justify-between shrink-0">
                                                    <div className="flex items-center gap-3">
                                                        <Icon className="w-6 h-6 text-foreground shrink-0"/>
                                                        <div>
                                                            <h3 className="text-lg font-bold tracking-tight text-foreground leading-none">
                                                                {tab.label}
                                                            </h3>
                                                        </div>
                                                    </div>
                                                    {tab.status && (
                                                        <span
                                                            className="text-sm text-muted-foreground font-mono border border-border rounded px-2 py-0.5 mt-0.5 shrink-0">
                              {tab.status}
                            </span>
                                                    )}
                                                </div>

                                                <div className="h-px my-2 bg-border shrink-0"/>
                                            </div>
                                        )}

                                        {/* Custom content passed via the `content` prop on the tab */}
                                        <div className="flex-1 min-h-0">{resolvedContent}</div>
                                    </motion.div>
                                );
                            })}
                        </AnimatePresence>
                    </div>
                </div>
            </Tabs>
        </div>
    );
}

export default CustomTabs;