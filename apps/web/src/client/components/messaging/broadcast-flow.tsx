"use client";

import {motion} from "motion/react";
import {useEffect, useState} from "react";
import {
    CheckCheckIcon,
    ChevronLeft,
    ChevronRight,
    FileTextIcon,
    LockKeyholeIcon,
    type LucideIcon,
    SendIcon,
    UsersIcon
} from "lucide-react";
import {MobileMockup} from "./mobile-mockup";
import ContentStep from "./steps/content-step";
import AudienceStep from "./steps/audience-step";
import SendStep from "./steps/send-step";
import {SmsNotConfiguredNotice} from "./sms-not-configured-notice";
import {
    campaignFromDraft,
    type ComposeCampaign,
    type DraftRow,
    emptyCampaign,
    normaliseCampaign,
    SMS_TYPE_LABELS,
} from "./compose-campaign";
import {useAuth, useOrganization} from "@clerk/react";
import {formatInternationalWithSpaces, getNameInitials} from "@/lib/utils.ts";
import {useMutation, useQuery, useQueryClient} from "@tanstack/react-query";
import {usePostHog} from "posthog-js/react";
import {toast} from "sonner";
import {apiClient} from "@/lib/api.ts";
import {useAudiencePreview} from "@/lib/use-audience-preview.ts";
import {useSmsSettings} from "@/lib/use-sms-settings.ts";

type Step = "content" | "audience" | "send";

interface BroadcastFlowProps {
    onBack: () => void;
    // A DRAFT reopened from the dashboard; omitted for a new campaign.
    draft?: DraftRow | null;
}

const time = new Date().toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
});

const chatDate = new Date().toLocaleDateString("en-US", {
    month: "long",
    day: "2-digit",
    year: "numeric"
});

async function errorMessageFrom(res: { json(): Promise<unknown> }, fallback: string): Promise<string> {
    const body: unknown = await res.json().catch(() => null)
    if (body && typeof body === "object") {
        const record = body as Record<string, unknown>
        if (typeof record.message === "string") return record.message
        if (typeof record.error === "string") return record.error
    }
    return fallback
}

// The compose flow (docs/specs/0004-sms-send-flow). Everything is saved as a
// DRAFT first (POST, then PATCH), and Send works on what is stored.
export default function BroadcastFlow({onBack, draft}: BroadcastFlowProps) {
    const {getToken} = useAuth();
    const api = apiClient(getToken);
    const queryClient = useQueryClient();
    const posthog = usePostHog();

    const [currentStep, setCurrentStep] = useState<Step>("content");
    const [campaign, setCampaignState] = useState<ComposeCampaign>(() =>
        draft ? campaignFromDraft(draft) : emptyCampaign()
    );
    const setCampaign = (next: ComposeCampaign) => setCampaignState(normaliseCampaign(next));

    const smsSettings = useSmsSettings();
    const preview = useAudiencePreview(campaign, currentStep !== "content");
    const previewResult = preview.data?.ok ? preview.data.data : null;

    const steps: { id: Step; label: string, icon: LucideIcon }[] = [
        {id: "content", label: "Content", icon: FileTextIcon},
        {id: "audience", label: "Audience", icon: UsersIcon},
        {id: "send", label: "Review & Send", icon: SendIcon},
    ];

    const stepIndex = steps.findIndex((s) => s.id === currentStep);

    const handleNext = () => {
        if (stepIndex < steps.length - 1) {
            setCurrentStep(steps[stepIndex + 1].id);
        }
    };

    const handlePrev = () => {
        if (stepIndex > 0) {
            setCurrentStep(steps[stepIndex - 1].id);
        }
    };

    // POST the first time, PATCH after. Returns the saved id.
    const saveDraft = useMutation({
        mutationFn: async (): Promise<string> => {
            const json = {
                name: campaign.name.trim(),
                type: campaign.smsType,
                templateId: campaign.templateId,
                templateBody: campaign.message,
                audience: campaign.audience,
            };
            const res = campaign.id
                ? await api.api.campaigns[":id"].$patch({param: {id: campaign.id}, json})
                : await api.api.campaigns.$post({json});
            if (!res.ok) throw new Error(await errorMessageFrom(res, "Could not save the campaign"));
            const saved = await res.json();
            if (!("id" in saved)) throw new Error("Could not save the campaign");
            return saved.id;
        },
        onSuccess: (id) => {
            setCampaignState((current) => ({...current, id}));
            queryClient.invalidateQueries({queryKey: ["campaigns"]});
        },
        onError: (error) => {
            posthog.capture("sms_campaign_save_failed", {message: error.message});
        },
    });

    const send = useMutation({
        mutationFn: async () => {
            const id = await saveDraft.mutateAsync();
            const res = await api.api.campaigns[":id"].send.$post({param: {id}});
            if (!res.ok) throw new Error(await errorMessageFrom(res, "The campaign could not be sent"));
            return res.json();
        },
        onSuccess: (result) => {
            queryClient.invalidateQueries({queryKey: ["campaigns"]});
            posthog.capture("sms_campaign_sent", {recipientCount: result.recipientCount, type: campaign.smsType});
            toast("Sending", {
                description: `${result.recipientCount.toLocaleString()} messages are on their way`,
                duration: 5000,
                icon: <SendIcon className="size-6"/>,
            });
            onBack();
        },
        onError: (error) => {
            posthog.capture("sms_campaign_send_failed", {message: error.message});
            toast.error(error.message);
        },
    });

    const canSave = campaign.type === "sms" && campaign.name.trim() !== "" && campaign.message.trim() !== "";
    const canSend = canSave
        && smsSettings.data?.configured === true
        && !!previewResult
        && previewResult.recipients.length > 0
        && previewResult.balanceSufficient
        && !preview.isFetching;

    const handleSaveDraft = () => {
        if (!canSave) {
            toast.error("Give the campaign a name and a message first");
            setCurrentStep("content");
            return;
        }
        saveDraft.mutate(undefined, {
            onSuccess: () => toast("Draft saved", {duration: 3000, icon: <FileTextIcon className="size-6"/>}),
            onError: (error) => toast.error(error.message),
        });
    };

    return (
        <div className="min-h-screen bg-background -my-3.5 -mx-5.5">
            {/* Header */}
            <header className="border-b border-border px-4 py-1.5">
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-2xl font-medium text-foreground">
                            {campaign.id ? campaign.name || "Draft campaign" : "New Campaign"}
                        </h1>
                    </div>
                    <button
                        onClick={onBack}
                        aria-label="Close"
                        className="text-muted-foreground hover:text-foreground transition-colors"
                    >
                        ✕
                    </button>
                </div>
            </header>

            {/* Step Indicator */}
            <div className="border-b border-border px-1 py-0">
                <div className="flex items-center gap-2">
                    {steps.map((step, idx) => (
                        <div key={step.id} className="flex items-center gap-2">
                            <button
                                onClick={() => setCurrentStep(step.id)}
                                className={`flex items-center gap-2 px-3 py-2 rounded-lg transition-colors ${
                                    currentStep === step.id
                                        ? "text-primary font-medium"
                                        : idx < stepIndex
                                            ? "text-muted-foreground hover:text-foreground"
                                            : "text-muted-foreground"
                                }`}
                            >
                                {step.label}
                            </button>
                            {idx < steps.length - 1 && (
                                <ChevronRight className="h-4 w-4 text-muted-foreground"/>
                            )}
                        </div>
                    ))}
                </div>
            </div>

            {/* Content */}
            <div className="flex flex-1">
                <div className="flex-1 space-y-4 px-4 py-4">
                    {campaign.type === "sms" && <SmsNotConfiguredNotice/>}
                    {currentStep === "content" && (
                        <ContentStep campaign={campaign} setCampaign={setCampaign}/>
                    )}
                    {currentStep === "audience" && (
                        <AudienceStep campaign={campaign} setCampaign={setCampaign}/>
                    )}
                    {currentStep === "send" && (
                        <SendStep campaign={campaign}/>
                    )}
                </div>

                {/* Right Panel */}
                <div className="w-96 border-l border-border bg-card/50 px-6 py-6">
                    {currentStep === "content" && (
                        <div className="space-y-6">
                            <div>
                                <h3 className="text-sm font-semibold text-foreground">
                                    Preview
                                </h3>
                                <select
                                    aria-label="Preview channel"
                                    value={campaign.type}
                                    onChange={(event) =>
                                        setCampaign({
                                            ...campaign,
                                            type: event.target.value as "sms" | "whatsapp",
                                        })
                                    }
                                    className="mt-2 w-full rounded-md border border-border px-3 py-2 text-xs font-medium text-foreground outline-none focus:ring-2 focus:ring-primary"
                                >
                                    <option value="sms">SMS preview</option>
                                    <option value="whatsapp">WhatsApp preview</option>
                                </select>
                            </div>
                            <PhonePreview campaign={campaign}/>
                        </div>
                    )}

                    {currentStep === "audience" && (
                        <div className="space-y-6">
                            <div>
                                <h3 className="text-sm font-semibold text-foreground">
                                    Selected Recipients
                                </h3>
                            </div>
                            <div className="flex items-center justify-center">
                                <div className="text-center">
                                    <div className="text-5xl font-bold text-primary">
                                        {previewResult ? previewResult.recipients.length.toLocaleString() : "—"}
                                    </div>
                                    <p className="mt-2 text-sm text-muted-foreground">
                                        recipients
                                    </p>
                                    {previewResult && previewResult.skipped.length > 0 && (
                                        <p className="mt-1 text-xs text-muted-foreground">
                                            {previewResult.skipped.length.toLocaleString()} skipped
                                        </p>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}

                    {currentStep === "send" && (
                        <div className="space-y-6">
                            <div>
                                <h3 className="text-sm font-semibold text-foreground">
                                    Summary
                                </h3>
                            </div>
                            <div className="space-y-4 text-sm">
                                <div>
                                    <p className="text-xs text-muted-foreground">Campaign</p>
                                    <p className="font-medium text-foreground">{campaign.name || "Untitled"}</p>
                                </div>
                                <div>
                                    <p className="text-xs text-muted-foreground">Type</p>
                                    <p className="font-medium text-foreground">{SMS_TYPE_LABELS[campaign.smsType]}</p>
                                </div>
                                <div>
                                    <p className="text-xs text-muted-foreground">Recipients</p>
                                    <p className="font-medium text-foreground">
                                        {previewResult ? previewResult.recipients.length.toLocaleString() : "—"}
                                    </p>
                                </div>
                                <div>
                                    <p className="text-xs text-muted-foreground">Estimated cost</p>
                                    <p className="font-medium text-foreground">
                                        {previewResult ? `TZS ${previewResult.estimatedCost.toLocaleString()}` : "—"}
                                    </p>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* Footer */}
            <footer className="border-t border-border bg-card/50 px-8 py-4">
                <div className="flex items-center justify-between">
                    <button
                        onClick={handlePrev}
                        disabled={stepIndex === 0}
                        className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                        <ChevronLeft className="h-4 w-4"/>
                        Previous
                    </button>

                    <div className="flex items-center gap-3">
                        <button
                            onClick={onBack}
                            className="rounded-lg px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
                        >
                            Cancel
                        </button>
                        {campaign.type === "sms" && (
                            <button
                                onClick={handleSaveDraft}
                                disabled={saveDraft.isPending || send.isPending}
                                className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-muted disabled:opacity-50 transition-colors"
                            >
                                {saveDraft.isPending && !send.isPending ? "Saving..." : "Save draft"}
                            </button>
                        )}
                        {stepIndex < steps.length - 1 ? (
                            <button
                                onClick={handleNext}
                                className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 transition-opacity"
                            >
                                Next
                                <ChevronRight className="h-4 w-4"/>
                            </button>
                        ) : (
                            <button
                                onClick={() => send.mutate()}
                                disabled={!canSend || send.isPending}
                                className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity"
                            >
                                {send.isPending ? "Sending..." : "Send Campaign"}
                            </button>
                        )}
                    </div>
                </div>
            </footer>
        </div>
    );
}

function PhonePreview({campaign}: { campaign: ComposeCampaign }) {
    const previewMessage = campaign.message || "Your message will appear here";
    const isSms = campaign.type === "sms";
    const {organization} = useOrganization();
    const {getToken} = useAuth();
    const api = apiClient(getToken);

    const settingsQuery = useQuery({
        queryKey: ["company-settings"],
        queryFn: async () => {
            const res = await api.api["company-settings"].$get();
            if (!res.ok)
                throw new Error(`Failed to load company settings (${res.status})`);
            return res.json();
        },
        enabled: !!organization,
    });

    const mobile = settingsQuery.data?.mobileNumber ?? "";

    // --- typing indicator state ---
    const [isTyping, setIsTyping] = useState(false);

    // A signature of "what should trigger a re-evaluation": channel + message text.
    const trackKey = `${isSms}|${campaign.message}`;
    const [prevTrackKey, setPrevTrackKey] = useState(trackKey);

    // Adjust state during render (not in an effect) when the message/channel changes.
    // This is the pattern React recommends for "resetting state when a prop changes":
    // https://react.dev/learn/you-might-not-need-an-effect#adjusting-some-state-when-a-prop-changes
    if (trackKey !== prevTrackKey) {
        setPrevTrackKey(trackKey);
        setIsTyping(!!campaign.message);
    }

    // The effect's only job is the debounce timer — setState happens inside the
    // setTimeout callback, not synchronously in the effect body, so it's fine.
    useEffect(() => {
        if (!isTyping) return;
        const timeout = setTimeout(() => setIsTyping(false), 900);
        return () => clearTimeout(timeout);
    }, [isTyping, trackKey]);

    return (
        <MobileMockup
            autoPlay={false}
            headerTitle={organization?.name}
            headerSubtitle={isSms ? (formatInternationalWithSpaces(mobile) ?? "") : "online"}
            avatarUrl={organization?.imageUrl}
            avatarFallback={getNameInitials(organization?.name ?? "JD")}
            currentTime={time}
            variant={isSms ? "sms" : "whatsapp"}
            className="max-w-62.5"
            isTyping={isTyping}
        >
            {isSms ? (
                <SmsPreview message={previewMessage} isTyping={isTyping}/>
            ) : (
                <WhatsAppPreview message={previewMessage} isTyping={isTyping}/>
            )}
        </MobileMockup>
    );
}

function SmsPreview({message, isTyping}: { message: string; isTyping: boolean }) {
    return (
        <div className="flex h-full flex-col bg-transparent text-[#172b42] dark:bg-transparent dark:text-slate-100">
            <div className="flex-1 space-y-2 justify-start gap-1.5 overflow-hidden px-2 pb-3">
                <div className="flex flex-col items-end">
                    <div
                        className="w-fit max-w-[85%] rounded-2xl rounded-tr-md bg-[#0879b9] px-3 py-2 text-[11px] text-white dark:bg-[#168ac7]">
                        Habari
                    </div>
                    <span className="mt-0.5 pr-2 text-[8px] text-[#607b92] dark:text-slate-400">
                        Delivered Just now
                    </span>
                </div>

                {isTyping ? (
                    <motion.div
                        initial={{opacity: 0, y: 6}}
                        animate={{opacity: 1, y: 0}}
                        className="flex flex-col items-start"
                    >
                        <div
                            className="flex items-center gap-1.5 rounded-2xl rounded-tl-md bg-[#dcecf8] px-3 py-2 dark:bg-[#2b4962]">
                            <div className="flex items-center gap-1">
                                {[0, 1, 2].map((dotIndex) => (
                                    <motion.span
                                        key={dotIndex}
                                        className="h-1.5 w-1.5 rounded-full bg-[#0879b9] dark:bg-[#168ac7]"
                                        animate={{y: [0, -3, 0], opacity: [0.4, 1, 0.4]}}
                                        transition={{
                                            duration: 0.6,
                                            repeat: Infinity,
                                            delay: dotIndex * 0.15,
                                        }}
                                    />
                                ))}
                            </div>
                        </div>
                    </motion.div>
                ) : (
                    <div className="flex flex-col items-start">
                        <div
                            className="max-w-[75%] rounded-2xl rounded-tl-md bg-[#dcecf8] px-3 py-2 text-[11px] dark:bg-[#2b4962] whitespace-pre-wrap">
                            {message}
                        </div>
                        <span className="mt-0.5 pl-2 text-[8px] text-[#607b92] dark:text-slate-400">
                           {new Date().toLocaleString("en-US", {
                               weekday: "long",
                               month: "long",
                               day: "numeric",
                               hour: "2-digit",
                               minute: "2-digit",
                               hour12: false
                           }).replace(",", " -")}
                        </span>
                    </div>
                )}
            </div>
        </div>
    );
}

function WhatsAppPreview({message, isTyping}: { message: string; isTyping: boolean }) {
    return (
        <div className="flex h-full flex-col bg-[#efeae2] text-neutral-900 dark:bg-[#0b141a] dark:text-neutral-100">
            <div
                className="flex-1 space-y-2 overflow-hidden bg-[radial-gradient(#d8cec2_0.6px,transparent_0.6px)] bg-size-[8px_8px] p-2">
                <div
                    className="mx-auto mb-4 w-fit max-w-[95%] rounded-sm bg-white/80 px-2 py-1 text-center text-[10px] leading-tight text-neutral-500 dark:bg-[#182229]/90 dark:text-neutral-400">
                    {chatDate}
                </div>
                <div
                    className="mx-auto mb-4 w-fit max-w-[95%] rounded-md bg-white/80 px-2 py-1 text-center text-[10px] leading-tight text-neutral-500 dark:bg-[#182229]/90 dark:text-neutral-400">
                    <LockKeyholeIcon className="mr-1 inline-block size-2.5 align-middle"/>
                    Messages and calls are end-to-end encrypted. Only people in this chat can read,
                    listen to, or share them.{" "}
                    <span className="font-semibold text-[9px]">Learn more</span>
                </div>
                <div
                    className="ml-auto w-fit max-w-[85%] rounded-xl rounded-tr-none bg-[#d9fdd3] px-2.5 py-1.5 text-[11px] shadow-sm dark:bg-[#005c4b] dark:text-neutral-100">
                    Habari
                    <div className="flex justify-end">
                        <span className="flex gap-2 ml-1 text-[10px] text-neutral-500 dark:text-emerald-200/60">
                            {time}
                            <CheckCheckIcon className="size-3.5 text-blue-600"/>
                        </span>
                    </div>
                </div>

                {isTyping ? (
                    <motion.div
                        initial={{opacity: 0, y: 6}}
                        animate={{opacity: 1, y: 0}}
                        className="flex items-center justify-start"
                    >
                        <div
                            className="flex items-center gap-1.5 rounded-xl rounded-tl-none bg-white px-3 py-2 dark:bg-[#202c33]">
                            <div className="flex items-center gap-1">
                                {[0, 1, 2].map((dotIndex) => (
                                    <motion.span
                                        key={dotIndex}
                                        className="h-1.5 w-1.5 rounded-full bg-emerald-500 dark:bg-emerald-400"
                                        animate={{y: [0, -3, 0], opacity: [0.4, 1, 0.4]}}
                                        transition={{
                                            duration: 0.6,
                                            repeat: Infinity,
                                            delay: dotIndex * 0.15,
                                        }}
                                    />
                                ))}
                            </div>
                        </div>
                    </motion.div>
                ) : (
                    <div
                        className="max-w-[85%] rounded-xl rounded-tl-none bg-white px-2.5 py-1.5 text-[11px] shadow-sm whitespace-pre-wrap dark:bg-[#202c33] dark:text-neutral-100">
                        {message}
                    </div>
                )}
            </div>
        </div>
    );
}