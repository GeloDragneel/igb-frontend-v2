// Setup → Import Engagement (sellers used by Importation)
import EngagementList from "./EngagementList";

export default function ImportEngagement() {
  return <EngagementList type="import" label="Seller" title="Import Engagement" usedIn="importation" />;
}
