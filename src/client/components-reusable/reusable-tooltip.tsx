import {Tooltip, TooltipContent, TooltipTrigger} from '@/components/ui/tooltip'
import React from "react";

interface Props {
    trigger: React.ReactNode
    tooltip: string | ReactNode;
}

const ReusableTooltip = ({trigger, tooltip}: Props) => (
    <Tooltip>
        <TooltipTrigger asChild>
            {trigger}
        </TooltipTrigger>
        <TooltipContent className="px-2 py-1.5 text-xs">
            <p>{tooltip}</p>
        </TooltipContent>
    </Tooltip>
)


export default ReusableTooltip