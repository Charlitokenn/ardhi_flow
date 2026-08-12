import * as React from "react";
import {
    Banner,
    BannerActions,
    BannerClose,
    BannerContent,
    BannerDescription,
    BannerIcon,
    BannerTitle,
} from "@/components/ui/banner";
import { Button } from "@/components/ui/button";
import {Link} from "@tanstack/react-router";
import type {ReactNode} from "react";

interface AnnouncementBannerProp {
    title: string;
    description: string;
    showActionButton?: boolean;
    actionButtonText?: string;
    icon: ReactNode;
}

export function AnnouncementsBanner({title,description,showActionButton,actionButtonText,icon}: AnnouncementBannerProp) {
    const [open, setOpen] = React.useState(true);

    return (
        <>
            <Banner open={open} onOpenChange={setOpen}>
                <BannerIcon>{icon}</BannerIcon>
                <BannerContent>
                    <BannerTitle>{title}</BannerTitle>
                    <BannerDescription>{description}</BannerDescription>
                </BannerContent>
                <BannerActions>
                    {showActionButton && <Button className="text-xs"><Link to={"/finance/reminder"} >{actionButtonText}</Link></Button>}
                    <BannerClose />
                </BannerActions>
            </Banner>
            {!open && <Button onClick={() => setOpen(true)}>Show banner</Button>}
        </>
    );
}