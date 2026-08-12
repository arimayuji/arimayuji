import { notFound } from "next/navigation";
import { getPlace, RUNNING_PLACES } from "@/lib/places";
import { PlaceDetail } from "../place-detail";

/** Static export needs every possible `id` known at build time — there's no runtime SSR to fall back on. */
export function generateStaticParams() {
  return RUNNING_PLACES.map((place) => ({ id: place.id }));
}

export default async function LugarPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const place = getPlace(id);
  if (!place) notFound();
  return <PlaceDetail place={place} />;
}
