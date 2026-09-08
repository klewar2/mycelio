"""Exécution quotidienne du scoring.

    uv run python -m mycelio.score
    uv run python -m mycelio.score --rattrapage   # seulement si la journée n'a rien produit

Lit `cells` et `species`, interroge Open-Meteo, calcule un score par maille, espèce et jour,
puis remplace intégralement `forecast`.

Le remplacement est volontaire : une prévision périmée n'a aucune valeur, et conserver
l'historique ferait grossir la base sans limite pour rien. Effet de bord bienvenu, cette
écriture quotidienne empêche la mise en veille du projet Supabase gratuit.
"""

from __future__ import annotations

import argparse
import datetime as dt
import io
import sys
import time
import uuid

import numpy as np
import pandas as pd

from . import scoring, weather
from .db import connect, get_setting


def load_inputs():
    with connect() as conn:
        cells = pd.read_sql(
            """
            select h3_index, hosts, forest_share, alt_m, twi, soil_ph,
                   dist_edge_m, northness, slope_pct,
                   extensions.st_y(centroid::extensions.geometry) as lat,
                   extensions.st_x(centroid::extensions.geometry) as lng
            from public.cells
            """,
            conn,
        )
        species = pd.read_sql(
            "select * from public.species where is_enabled order by sort_order", conn
        )
    return cells, species


def run() -> int:
    started = time.time()
    run_id = uuid.uuid4()

    horizon = int(get_setting("scoring.forecast_horizon_days"))
    weights = scoring.Weights(
        host_match=float(get_setting("scoring.host_match_weight")),
        host_generic=float(get_setting("scoring.host_generic_weight")),
        forest_share=float(get_setting("scoring.forest_share_weight")),
        edge=float(get_setting("scoring.edge_weight")),
        aspect=float(get_setting("scoring.aspect_weight")),
        soil_moisture=float(get_setting("scoring.soil_moisture_weight")),
        temp_shock=float(get_setting("scoring.temp_shock_weight")),
        rain_optimum_mm=float(get_setting("scoring.rain_optimum_mm")),
        rain_window_days=int(get_setting("scoring.rain_window_days")),
        # Les jetons que le pipeline pose quand la BD Forêt ne résout pas l'essence. Ils vivent
        # en base et non ici : la table HOSTS de forest.py peut gagner une entrée générique sans
        # qu'on ait à toucher au moteur.
        generic_host_codes=frozenset(get_setting("scoring.generic_host_codes")),
    )

    with connect() as conn:
        conn.execute(
            "insert into public.forecast_runs (id, status) values (%s, 'running')", (run_id,)
        )
        conn.commit()

    try:
        cells, species = load_inputs()
        if cells.empty or species.empty:
            raise RuntimeError("aucune maille ou aucune espèce active")

        lats = cells["lat"].to_numpy()
        lngs = cells["lng"].to_numpy()

        # On remonte assez loin dans le passé pour couvrir le plus long délai pluie → poussée,
        # plus la fenêtre de cumul : sans cet historique, le facteur météo est aveugle.
        max_lag = int(species["rain_lag_days"].fillna(0).max())
        past_days = min(92, max_lag + weights.rain_window_days + 5)

        grid = weather.fetch(lats, lngs, past_days=past_days, forecast_days=horizon + 1)
        assign = weather.nearest_point(grid, lats, lngs)

        hosts = [list(h or []) for h in cells["hosts"]]
        soil_ph = cells["soil_ph"].to_numpy(dtype="float64")
        altitude = cells["alt_m"].to_numpy(dtype="float64")
        twi = cells["twi"].to_numpy(dtype="float64")
        forest_share = cells["forest_share"].to_numpy(dtype="float64")
        dist_edge = cells["dist_edge_m"].to_numpy(dtype="float64")
        northness = cells["northness"].to_numpy(dtype="float64")
        slope = cells["slope_pct"].to_numpy(dtype="float64")

        today = pd.Timestamp(dt.date.today())
        rows: list[pd.DataFrame] = []

        for _, sp in species.iterrows():
            host_codes = set(sp["host_codes"] or [])
            matched = np.array(
                [bool(host_codes & set(h)) for h in hosts], dtype="float64"
            )

            habitat = scoring.habitat_factor(
                hosts,
                host_codes,
                soil_ph,
                altitude,
                twi,
                forest_share,
                dist_edge,
                northness,
                slope,
                ph_min=sp["ph_min"],
                ph_max=sp["ph_max"],
                alt_min=sp["alt_min_m"],
                alt_max=sp["alt_max_m"],
                # Toutes les préférences de terrain viennent de la fiche d'espèce, éditable
                # depuis /admin/especes. Le moteur ne connaît plus aucun slug.
                twi_optimum=None if pd.isna(sp["twi_optimum"]) else float(sp["twi_optimum"]),
                edge_affinity=float(sp["edge_affinity"] or 0.0),
                thermophilic=bool(sp["thermophilic"]),
                prefers_calcareous=bool(sp["prefers_calcareous"]),
                weights=weights,
            )
            conf = scoring.confidence(soil_ph, matched, forest_share)

            daily: list[np.ndarray] = []
            lag = int(sp["rain_lag_days"] or 14)
            rain_opt = float(sp["rain_optimum_mm"] or weights.rain_optimum_mm)

            for offset in range(horizon + 1):
                target = today + pd.Timedelta(days=offset)
                try:
                    day = grid.index_of(target)
                except KeyError:
                    continue

                # Pluie utile : le cumul sur la fenêtre, décalé du délai propre à l'espèce.
                # C'est la pluie d'il y a deux semaines qui fait le cèpe d'aujourd'hui.
                end = max(day - lag, 0)
                start = max(end - weights.rain_window_days, 0)
                cumulative = grid.rain[:, start : end + 1].sum(axis=1)[assign]

                phenology = scoring.phenology_factor(
                    int(target.dayofyear),
                    altitude,
                    grid.soil_temp[:, day][assign],
                    season_start=sp["season_start_doy"],
                    season_end=sp["season_end_doy"],
                    temp_opt=sp["soil_temp_opt_c"],
                    temp_tol=sp["soil_temp_tol_c"],
                )
                meteo = scoring.weather_factor(
                    cumulative,
                    grid.soil_moisture[:, day][assign],
                    grid.amplitude[:, day][assign],
                    rain_optimum=rain_opt,
                    weights=weights,
                )

                daily.append(np.clip(habitat * phenology * meteo, 0.0, 1.0))

            if not daily:
                continue

            # Un tableau Postgres par maille : {0.05,0.03,...}. Sept fois moins de lignes que
            # le schéma initial, et c'est déjà la forme que consomme la carte.
            stacked = np.round(np.vstack(daily).T, 4)
            rows.append(
                pd.DataFrame(
                    {
                        "h3_index": cells["h3_index"].to_numpy(),
                        "species_id": int(sp["id"]),
                        "scores": ["{" + ",".join(f"{v:g}" for v in row) + "}" for row in stacked],
                        "confidence": np.round(conf, 3),
                        "run_id": str(run_id),
                    }
                )
            )

        frame = pd.concat(rows, ignore_index=True)

        buffer = io.StringIO()
        frame.to_csv(buffer, index=False, header=False)
        buffer.seek(0)

        weather_frame = weather.to_rows(grid, str(run_id), today, horizon)
        # EWKT texte : le type geography l'accepte directement en entrée, sans passer par
        # ST_GeomFromEWKT — plus simple à produire dans un CSV que du binaire.
        weather_frame.insert(
            0,
            "point",
            [f"SRID=4326;POINT({lng} {lat})" for lat, lng in zip(
                weather_frame["lat"], weather_frame["lng"], strict=True
            )],
        )
        weather_frame = weather_frame.drop(columns=["lat", "lng"])
        weather_buffer = io.StringIO()
        weather_frame.to_csv(weather_buffer, index=False, header=False)
        weather_buffer.seek(0)

        with connect() as conn:
            with conn.cursor() as cur:
                cur.execute("truncate public.forecast")
                with cur.copy(
                    "copy public.forecast (h3_index, species_id, scores, confidence, run_id)"
                    " from stdin with (format csv)"
                ) as copy:
                    copy.write(buffer.read())

                cur.execute("truncate public.weather_grid")
                with cur.copy(
                    "copy public.weather_grid"
                    " (point, rain_mm, tmin_c, tmax_c, soil_moisture, weather_code, run_id)"
                    " from stdin with (format csv)"
                ) as copy:
                    copy.write(weather_buffer.read())

                # Rien à faire ici pour `forecast_r7` : un déclencheur d'instruction le
                # reconstruit à la fin du COPY, dans cette transaction (migration 0027). Le
                # rattrapage est en base et non ici parce que le cron tourne le code de `main`
                # et non celui du poste de travail — un appel écrit ici ne protège que celui qui
                # l'a écrit.

                cur.execute(
                    "update public.forecast_runs set status='success', finished_at=now(),"
                    " cells_count=%s where id=%s",
                    (len(cells), run_id),
                )
            conn.commit()

        print(
            f"{len(frame):,} scores — {len(cells):,} mailles × {len(species)} espèces"
            f" × {horizon + 1} jours en {time.time() - started:.0f}s"
        )
        return len(frame)

    except Exception as error:  # noqa: BLE001 — on veut tracer l'échec en base avant de relancer
        with connect() as conn:
            conn.execute(
                "update public.forecast_runs set status='failed', finished_at=now(), error=%s"
                " where id=%s",
                (str(error)[:1000], run_id),
            )
            conn.commit()
        raise


def scored_today() -> bool:
    """La journée a-t-elle déjà son scoring ?

    En jours de Paris et non d'UTC : c'est la journée du cueilleur qui compte, et c'est elle
    que le fuseau de la prévision suit déjà (voir weather.fetch).
    """
    with connect() as conn:
        row = conn.execute(
            """
            select 1 from public.forecast_runs
            where status = 'success'
              and (finished_at at time zone 'Europe/Paris')::date
                  = (now() at time zone 'Europe/Paris')::date
            limit 1
            """
        ).fetchone()
    return row is not None


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Recalcule les scores du jour")
    parser.add_argument(
        "--rattrapage",
        action="store_true",
        help="ne recalcule que si aucune exécution n'a réussi aujourd'hui",
    )
    args = parser.parse_args(argv)

    # Le scoring est idempotent — le relancer ne casserait rien. Ce qu'on évite ici, c'est de
    # consommer le quota Open-Meteo et d'empiler dans `forecast_runs` des lignes qui ne
    # racontent rien, alors que le créneau du matin a fini par passer.
    if args.rattrapage and scored_today():
        print("scores déjà calculés aujourd'hui — rattrapage inutile")
        return 0

    run()
    return 0


if __name__ == "__main__":
    sys.exit(main())
