import {createFileRoute} from "@tanstack/react-router";
import {PageHero} from "@/components/pageHero.tsx";
import {ProjectsDataGrid} from "@/components/data-grids/projects-datagrid.tsx";
import {Button} from "@/components/ui/button.tsx";
import {
    type CsvFieldConfig,
    type CsvImportSummary,
    ReusableCSVUploader,
} from "@/components-reusable/reusable-csv-uploader.tsx";
import type {NewProject,} from "../../../../../../drizzle/tenant/schema.ts";
import {FilesIcon} from "lucide-react"
import {ReusableSheet} from "@/components-reusable/reusable-sheet.tsx"
import {apiClient} from "@/lib/api.ts";
import {useAuth} from "@clerk/react"
import {useQueryClient} from "@tanstack/react-query"

export const Route = createFileRoute("/_authed/_org/projects/")({
    staticData: {
        breadcrumb: "Projects",
    },
    component: RouteComponent,
});

const projectFields: CsvFieldConfig<NewProject>[] = [
    {key: "projectName", label: "Project Name", type: "string", required: true},
    {
        key: "numberOfPlots",
        label: "Number of Plots",
        type: "number",
        required: true,
    },
];

function RouteComponent() {
    const {getToken} = useAuth();
    const queryClient = useQueryClient();
    const api = apiClient(getToken);

    const handleBulkImport = async (
        rows: NewProject[],
    ): Promise<CsvImportSummary> => {
        const res = await api.api.projects.bulk.$post({json: {rows}});
        if (!res.ok) {
            throw new Error(`Failed to import projects (${res.status})`);
        }
        const summary = await res.json();
        if (summary.created > 0) {
            await queryClient.invalidateQueries({queryKey: ["projects"]});
        }
        return summary;
    };

    return (
        <section className="-mt-4 -ml-1">
            <div className="flex justify-between items-center">
                <PageHero type="hero" title="Projects" subtitle="Manage all project"/>
                <div className="flex gap-2 items-center">
                    <ReusableSheet
                        title="Projects Bulk Upload"
                        trigger={
                            <Button variant="outline" size="icon">
                                <FilesIcon className="size-5"/>
                            </Button>
                        }
                        widthClassName="sm:max-w-full"
                        children={
                            <ReusableCSVUploader
                                entityName="projects"
                                fields={projectFields}
                                onSubmit={handleBulkImport}
                            />
                        }
                    />
                </div>
            </div>
            <ProjectsDataGrid/>
        </section>
    );
}
