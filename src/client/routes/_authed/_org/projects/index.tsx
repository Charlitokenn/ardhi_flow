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
import {FilesIcon, MapPlusIcon} from "lucide-react"
import {ReusableSheet} from "@/components-reusable/reusable-sheet.tsx"
import {apiClient} from "@/lib/api.ts";
import {useAuth} from "@clerk/react"
import {useQueryClient} from "@tanstack/react-query"
import {AddEditProjectsForm} from "@/components/forms/projects/add-edit-projects-form.tsx";

export const Route = createFileRoute("/_authed/_org/projects/")({
    staticData: {
        breadcrumb: "Projects",
    },
    component: RouteComponent,
});

// `acquisitionValue`/`sqmBought`/`committmentAmount`/`lgaFee` are Postgres
// `numeric()` columns, which drizzle-zod (and the tenant schema's
// insertProjectSchema) keeps as a plain string, not a JS number — see the
// identical note in add-edit-projects-form.tsx's buildPayload. `type:
// "number"` still gets the uploader's numeric-looking display/validation,
// but `parse` overrides the default coercion so the value reaches the API
// as a trimmed numeric string instead of a `number`.
function numericStringParse(raw: string): string | null {
    const cleaned = raw.trim().replace(/,/g, "");
    if (cleaned === "") return null;
    return Number.isNaN(Number(cleaned)) ? null : cleaned;
}

const projectFields: CsvFieldConfig<NewProject>[] = [
    {key: "projectName", label: "Project Name", type: "string", required: true},
    {key: "projectDetails", label: "Project Details", type: "string"},
    {key: "acquisitionDate", label: "Acquisition Date", type: "date", required: true},
    {key: "acquisitionValue", label: "Acquisition Value", type: "number", required: true, parse: numericStringParse},
    {key: "sqmBought", label: "Sqm Bought", type: "number", parse: numericStringParse},
    {key: "numberOfPlots", label: "Number of Plots", type: "number", required: true},
    {key: "projectOwner", label: "Project Owner", type: "string"},
    {key: "region", label: "Region", type: "string"},
    {key: "district", label: "District", type: "string"},
    {key: "ward", label: "Ward", type: "string"},
    {key: "street", label: "Street", type: "string"},
    {key: "tpNumber", label: "TP Number", type: "string"},
    {key: "tpStatus", label: "TP Status", type: "string"},
    {key: "surveyNumber", label: "Survey Number", type: "string"},
    {key: "surveyStatus", label: "Survey Status", type: "string"},
    {key: "committmentAmount", label: "Committment Amount", type: "number", parse: numericStringParse},
    {key: "lgaFee", label: "LGA Fee", type: "number", parse: numericStringParse},
    {key: "mwenyekitiName", label: "Mwenyekiti Name", type: "string"},
    {key: "mwenyekitiMobile", label: "Mwenyekiti Mobile", type: "string"},
    {key: "mtendajiName", label: "Mtendaji Name", type: "string"},
    {key: "mtendajiMobile", label: "Mtendaji Mobile", type: "string"},
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
                    <AddEditProjectsForm
                        mode="add"
                        trigger={<Button><MapPlusIcon/> New Project</Button>}
                    />

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