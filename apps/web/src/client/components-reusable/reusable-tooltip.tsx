import {Tooltip, TooltipContent, TooltipTrigger} from '@/components/ui/tooltip'
import React from "react";

interface Props {
    trigger: React.ReactNode
    tooltip: string | React.ReactNode;
    orientation?: "top" | "bottom" | "left" | "right";
}

const ReusableTooltip = ({trigger, tooltip, orientation}: Props) => (
    <Tooltip>
        <TooltipTrigger asChild>
            {trigger}
        </TooltipTrigger>
        <TooltipContent className="px-2 py-1.5 text-xs" side={orientation}>
            <p>{tooltip}</p>
        </TooltipContent>
    </Tooltip>
)


export default ReusableTooltip