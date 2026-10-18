import { TabsCard } from "../../../components/PageTabs";
import { SALES_TABS } from "../../../components/routesMeta";
import ComingSoon from "../../ComingSoon";

// POS, Scanned Receipts and Invalid / Cancel tabs until they are built
export default function SalesComingSoon() {
    return (
        <>
            <TabsCard tabs={SALES_TABS} />
            <ComingSoon />
        </>
    );
}