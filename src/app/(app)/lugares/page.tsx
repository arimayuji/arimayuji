"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { CITIES_WITH_PLACES, getPlacesByCity } from "@/lib/places";
import { useHeaderClose } from "../app-shell";
import { Card, delay, NoticeBadge, Screen, ScreenHeader } from "../ui";
import { PlaceCard } from "./place-card";

/** Shown in the city picker so someone outside São Paulo sees the feature exists, not that it's broken. */
const CITIES_COMING_SOON = ["Rio de Janeiro", "Belo Horizonte", "Curitiba", "Porto Alegre"];

type SortId = "recomendados" | "seguranca" | "iluminacao";

const SORTS: { id: SortId; label: string; icon: (className: string) => React.ReactNode }[] = [
  {
    id: "recomendados",
    label: "Recomendados",
    icon: (className) => (
      <svg viewBox="0 0 24 24" className={className} aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round">
        <path d="M12 3l2.2 5.6L20 10l-4.5 3.8L16.9 20 12 16.8 7.1 20l1.4-6.2L4 10l5.8-1.4L12 3z" />
      </svg>
    ),
  },
  {
    id: "seguranca",
    label: "Mais seguros",
    icon: (className) => (
      <svg viewBox="0 0 24 24" className={className} aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round">
        <path d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6l7-3z" />
      </svg>
    ),
  },
  {
    id: "iluminacao",
    label: "Melhor iluminação",
    icon: (className) => (
      <svg viewBox="0 0 24 24" className={className} aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2.5M12 19.5V22M4.2 4.2l1.8 1.8M18 18l1.8 1.8M2 12h2.5M19.5 12H22M4.2 19.8L6 18M18 6l1.8-1.8" />
      </svg>
    ),
  },
];

export default function LugaresPage() {
  useHeaderClose("/perfil");
  const [city, setCity] = useState<string>(CITIES_WITH_PLACES[0]);
  const [sort, setSort] = useState<SortId>("recomendados");
  const placesForCity = getPlacesByCity(city);
  const places = useMemo(() => {
    if (sort === "recomendados") return placesForCity;
    return [...placesForCity].sort((a, b) => b.criteria[sort].score - a.criteria[sort].score);
  }, [placesForCity, sort]);

  return (
    <>
      <ScreenHeader
        title="Lugares pra correr"
        badge={<NoticeBadge>curadoria + comunidade</NoticeBadge>}
      />

      <Screen>
        <Link href="/corridas" className="pr-enter block" style={delay(10)}>
          <Card className="flex items-center justify-between gap-3 lg:rounded-none lg:border-0 lg:border-b lg:border-border lg:bg-transparent lg:p-0 lg:pb-4 lg:shadow-none">
            <div>
              <p className="text-sm font-semibold">Corridas de rua na sua cidade</p>
              <p className="mt-0.5 text-xs text-muted">Calendário de provas abertas, atualizado toda semana</p>
            </div>
            <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0 text-muted" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 6l6 6-6 6" />
            </svg>
          </Card>
        </Link>

        <Link href="/rotas" className="pr-enter block" style={delay(15)}>
          <Card className="flex items-center justify-between gap-3 lg:rounded-none lg:border-0 lg:border-b lg:border-border lg:bg-transparent lg:p-0 lg:pb-4 lg:shadow-none">
            <div>
              <p className="text-sm font-semibold">Suas rotas desenhadas</p>
              <p className="mt-0.5 text-xs text-muted">Desenhe um trajeto no mapa e compartilhe com amigos</p>
            </div>
            <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0 text-muted" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 6l6 6-6 6" />
            </svg>
          </Card>
        </Link>

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

        <div className="pr-enter -mx-1 flex gap-2 overflow-x-auto px-1 pb-1" style={delay(35)}>
          {SORTS.map((option) => (
            <button
              key={option.id}
              type="button"
              onClick={() => setSort(option.id)}
              className={`flex shrink-0 items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-bold whitespace-nowrap transition-colors ${
                sort === option.id ? "border-accent text-accent" : "border-border text-muted"
              }`}
            >
              {option.icon("h-3.5 w-3.5")}
              {option.label}
            </button>
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
