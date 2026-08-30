import {type ReactNode} from 'react'
import {Stat, StatIndicator, StatLabel, StatTrend, StatValue} from "@/components/ui/stat.tsx";

interface StatsProps {
    label: string;
    indicatorIcon?: ReactNode;
    indicatorColor?: "default" | "success" | "info" | "warning" | "error" | undefined
    value: string;
    trendDirection?: "up" | "down" | "neutral";
    trendIcon?: ReactNode;
    trendDescription?: string;
    variant?: "default" | "icon" | "badge" | "action" | undefined
}

const ReusableStats = ({label,value,indicatorIcon,indicatorColor,trendDirection,trendIcon,trendDescription,variant} : StatsProps) => {
    return (
        <Stat className="shadow-none">
            <StatLabel>{label}</StatLabel>
            <StatIndicator variant={variant} color={indicatorColor}>
                {indicatorIcon}
            </StatIndicator>
            <StatValue>{value}</StatValue>
            <StatTrend trend={trendDirection}>
                {trendIcon}
                {trendDescription}
            </StatTrend>
        </Stat>
    )
}
export default ReusableStats
