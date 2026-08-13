import { Suspense } from "react";
import CloseOutPanel from "@/components/CloseOutPanel";
import { Loading } from "@/components/ui";

export default function CloseOutPage() {
  // CloseOutPanel reads ?regn= via useSearchParams — wrap for prerendering.
  return (
    <Suspense fallback={<Loading label="Loading close-out…" />}>
      <CloseOutPanel />
    </Suspense>
  );
}
