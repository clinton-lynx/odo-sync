import { Suspense } from "react";
import ActivityLog from "@/components/ActivityLog";
import { Loading } from "@/components/ui";

export default function ActivityPage() {
  // ActivityLog reads ?regn= via useSearchParams — wrap for prerendering.
  return (
    <Suspense fallback={<Loading label="Loading activity…" />}>
      <ActivityLog />
    </Suspense>
  );
}
