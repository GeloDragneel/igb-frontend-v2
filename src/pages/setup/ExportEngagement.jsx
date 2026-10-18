// Setup → Export Engagement (buyers used by Exportation)
import EngagementList from "./EngagementList";

export default function ExportEngagement() {
  return <EngagementList type="export" label="Buyer" title="Export Engagement" usedIn="exportation" />;
}
