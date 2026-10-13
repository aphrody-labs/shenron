// SPDX-License-Identifier: Apache-2.0
import { CardListSkeleton, IndexSkeleton } from "@/components/wiki/WikiSkeleton";

export default function Loading() {
  return (
    <IndexSkeleton>
      <CardListSkeleton />
    </IndexSkeleton>
  );
}
