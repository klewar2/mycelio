import type { Metadata } from "next";
import { PageHeader } from "@/components/shell/page-header";
import { requirePermission } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Données — Mycélio" };

const SOURCES = [
  { name: "IGN BD Forêt V2", usage: "Essence dominante, lisières, part boisée", licence: "Etalab 2.0" },
  { name: "IGN RGE ALTI 5 m", usage: "Altitude, pente, exposition, TWI, TPI", licence: "Etalab 2.0" },
  { name: "IGN BD TOPO", usage: "Hydrographie, sentiers, routes", licence: "Etalab 2.0" },
  { name: "Fonds de carte IGN", usage: "Plan IGN v2, orthophotos", licence: "Etalab 2.0" },
  { name: "SoilGrids (ISRIC)", usage: "pH, texture, carbone organique", licence: "CC-BY 4.0" },
  { name: "Open-Meteo", usage: "Archive ERA5 et prévision à 7 jours", licence: "CC-BY 4.0" },
  { name: "GBIF", usage: "Occurrences, pour l'entraînement", licence: "CC0 / CC-BY / CC-BY-NC" },
  { name: "OpenStreetMap", usage: "Parkings, sentiers, correction de biais", licence: "ODbL" },
];

export default async function DonneesPage() {
  await requirePermission("admin.datasets.manage");

  return (
    <>
      <PageHeader
        eyebrow="Administration"
        title="Données"
        description="Les sources ouvertes qui alimenteront la grille. Le suivi des versions et des dates de récupération arrive avec le pipeline, en phase 2."
        edition={`${SOURCES.length} sources prévues`}
      />

      <ul className="space-y-2">
        {SOURCES.map((source) => (
          <li
            key={source.name}
            className="surface-float flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 p-4"
          >
            <div className="min-w-0">
              <p className="text-foreground text-sm font-medium">{source.name}</p>
              <p className="text-muted-foreground text-xs">{source.usage}</p>
            </div>
            <p data-numeric className="text-muted-foreground text-xs">
              {source.licence}
            </p>
          </li>
        ))}
      </ul>

      <p className="text-muted-foreground mt-6 text-xs leading-relaxed">
        L&apos;attribution de ces sources est une obligation de licence, pas une décoration :
        elle sera affichée dans le pied de page de l&apos;application dès que la carte affichera
        leurs données.
      </p>
    </>
  );
}
