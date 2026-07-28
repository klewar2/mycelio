"use client";

import { topographicPosition } from "@/lib/terrain/advice";

/**
 * La carotte de terrain — l'élément signature de l'application.
 *
 * Une bande verticale stratifiée qui représente la maille en coupe : couvert forestier,
 * inclinaison de la surface, épaisseur de l'humus, horizon minéral. Chaque trait encode une
 * donnée réelle, aucun n'est décoratif :
 *
 *   — la densité des marques de houppier suit la part boisée,
 *   — la surface s'incline selon la pente,
 *   — l'épaisseur de l'humus suit le carbone organique,
 *   — la teinte de l'horizon minéral va du brun acide au gris calcaire selon le pH,
 *   — le grain de l'horizon suit le taux d'argile.
 *
 * C'est la seule audace visuelle du projet ; tout le reste doit rester sobre.
 */
export function TerrainCore({
  forestShare,
  slopePct,
  soilPh,
  soilSoc,
  soilClay,
  tpi,
}: {
  forestShare: number | null;
  slopePct: number | null;
  soilPh: number | null;
  soilSoc: number | null;
  soilClay: number | null;
  tpi: number | null;
}) {
  const width = 132;
  const height = 168;

  const share = clamp(forestShare ?? 0, 0, 1);
  const slope = clamp(slopePct ?? 0, 0, 60);
  // Le dénivelé de la surface sur la largeur de la carotte, à l'échelle de la pente réelle.
  const drop = (slope / 100) * width * 0.55;

  const surfaceY = 74;
  const humus = 8 + clamp((soilSoc ?? 20) / 12, 0, 12);
  const mineralTop = surfaceY + humus;

  // Brun sombre en sol acide, gris pâle en sol calcaire. Le pH utile va de 4,5 à 8.
  const acidity = clamp(((soilPh ?? 6.5) - 4.5) / 3.5, 0, 1);
  const mineral = mix([74, 55, 34], [156, 150, 132], acidity);

  const clay = clamp((soilClay ?? 25) / 45, 0, 1);
  const trees = Math.round(2 + share * 9);

  return (
    <figure className="m-0">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="h-auto w-full"
        role="img"
        aria-label={`Coupe du terrain : ${Math.round(share * 100)} % de couvert, pente ${Math.round(slope)} %, position ${topographicPosition(tpi)}`}
      >
        <defs>
          <clipPath id="carotte">
            <rect x="0" y="0" width={width} height={height} rx="6" />
          </clipPath>
          <pattern id="argile" width="6" height="6" patternUnits="userSpaceOnUse">
            <circle cx="1.5" cy="1.5" r={0.4 + clay * 0.9} fill="rgb(0 0 0 / 0.28)" />
          </pattern>
        </defs>

        <g clipPath="url(#carotte)">
          {/* Ciel / sous-bois */}
          <rect x="0" y="0" width={width} height={surfaceY + drop} fill="var(--muted)" />

          {/* Houppiers : leur nombre suit la part boisée. */}
          {Array.from({ length: trees }).map((_, i) => {
            const x = ((i + 0.5) / trees) * width;
            const ground = surfaceY + (x / width) * drop;
            const crown = 16 + ((i * 37) % 17);
            return (
              <g key={i}>
                <line
                  x1={x}
                  y1={ground}
                  x2={x}
                  y2={ground - crown}
                  stroke="var(--color-lichen, #9FB08A)"
                  strokeWidth="1.2"
                  opacity="0.75"
                />
                <circle
                  cx={x}
                  cy={ground - crown}
                  r={5 + (i % 3)}
                  fill="var(--color-lichen, #9FB08A)"
                  opacity="0.35"
                />
              </g>
            );
          })}

          {/* Surface du sol, inclinée selon la pente réelle. */}
          <path
            d={`M0 ${surfaceY} L${width} ${surfaceY + drop} L${width} ${height} L0 ${height} Z`}
            fill={`rgb(${mineral.join(" ")})`}
          />
          {/* Grain d'argile */}
          <path
            d={`M0 ${surfaceY} L${width} ${surfaceY + drop} L${width} ${height} L0 ${height} Z`}
            fill="url(#argile)"
          />
          {/* Horizon organique, d'épaisseur proportionnelle au carbone. */}
          <path
            d={`M0 ${surfaceY} L${width} ${surfaceY + drop} L${width} ${surfaceY + drop + humus} L0 ${mineralTop} Z`}
            fill="rgb(48 36 22)"
            opacity="0.85"
          />
          <path
            d={`M0 ${surfaceY} L${width} ${surfaceY + drop}`}
            stroke="var(--color-craie, #E8E6DD)"
            strokeWidth="1.2"
            fill="none"
            opacity="0.65"
          />
        </g>

        <rect
          x="0.5"
          y="0.5"
          width={width - 1}
          height={height - 1}
          rx="6"
          fill="none"
          stroke="var(--border)"
        />
      </svg>

      <figcaption className="text-muted-foreground mt-2 text-[0.6875rem] leading-relaxed">
        Coupe de la maille : couvert, pente, humus et horizon minéral.
      </figcaption>
    </figure>
  );
}

function clamp(value: number, low: number, high: number) {
  return Math.min(high, Math.max(low, value));
}

function mix(a: number[], b: number[], t: number) {
  return a.map((v, i) => Math.round(v + (b[i]! - v) * t));
}
