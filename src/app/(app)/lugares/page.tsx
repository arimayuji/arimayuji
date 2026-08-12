"use client";

import { useState } from "react";
import { CITIES_WITH_PLACES, getPlacesByCity } from "@/lib/places";
import { delay, NoticeBadge, Screen, ScreenHeader } from "../ui";
import { PlaceCard } from "./place-card";

/** Shown in the city picker so someone outside São Paulo sees the feature exists, not that it's broken. */
const CITIES_COMING_SOON = ["Rio de Janeiro", "Belo Horizonte", "Curitiba", "Porto Alegre"];

export default function LugaresPage() {
  const [city, setCity] = useState<string>(CITIES_WITH_PLACES[0]);
  const places = getPlacesByCity(city);

  return (
    <>
      <ScreenHeader
        title="Lugares pra correr"
        badge={<NoticeBadge>curadoria + comunidade</NoticeBadge>}
        subtitle="Uma lista inicial pesquisada a dedo, nota real por 5 critérios — segurança, percurso, estrutura, iluminação e fluxo. Quem corre lá também avalia; dá pra ver de onde cada nota vem."
      />

      <Screen>
        <div className="pr-enter -mx-1 flex gap-2 overflow-x-auto px-1 pb-1" style={delay(20)}>
          {CITIES_WITH_PLACES.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setCity(c)}
              className={`shrink-0 rounded-full px-4 py-2 text-xs font-semibold transition-colors ${
                city === c ? "bg-accent text-accent-foreground" : "bg-surface text-muted"
              }`}
            >
              {c}
            </button>
          ))}
          {CITIES_COMING_SOON.map((c) => (
            <span
              key={c}
              className="shrink-0 rounded-full bg-surface px-4 py-2 text-xs text-muted/50"
              title="Em breve"
            >
              {c}
            </span>
          ))}
        </div>

        {places.map((place, index) => (
          <div key={place.id} className="pr-enter" style={delay(60 + index * 25)}>
            <PlaceCard place={place} />
          </div>
        ))}

        <p className="pr-enter text-center text-xs leading-relaxed text-muted text-pretty" style={delay(60 + places.length * 25)}>
          Curadoria inicial: cada lugar acima foi pesquisado com fonte oficial ou reportagem — sem fonte
          confiável, o critério fica com nota intermediária em vez de nota inventada.
        </p>
      </Screen>
    </>
  );
}
