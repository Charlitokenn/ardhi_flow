import {Card, CardContent} from "@/components/ui/card";
import {MobileIcon, SMSTrackingIcon, WhatsappIcon} from "@/assets/icons";

const messageChannels = [
    {
        icon: WhatsappIcon,
        label: "WhatsApp",
        messageCount: 24,
    },
    {
        icon: SMSTrackingIcon,
        label: "Internet",
        messageCount: 45,
    },
    {
        icon: MobileIcon,
        label: "Mobile",
        messageCount: 67,
    },
];

export function SMSUsageTracker() {
    return (
        <Card className="rounded-lg px-2 pb-2 pt-2">
            <h2 className="px-px text-xs font-semibold leading-tight sms-accent-text">
                Message Balances
            </h2>

            <CardContent className="-mx-2 -mb-2 -mt-2 rounded-lg border border-border bg-card px-2 pb-2 pt-1.5">
                <div className="space-y-1.5">
                    {messageChannels.map((channel) => (
                        <div
                            key={channel.label}
                            className="flex items-center gap-2"
                        >
                            <channel.icon className="size-4 shrink-0"/>
                            <p className="text-xs leading-normal text-muted-foreground">
                                {channel.label} Channel: {channel.messageCount} SMS
                            </p>
                        </div>
                    ))}
                </div>
            </CardContent>
        </Card>
    );
}