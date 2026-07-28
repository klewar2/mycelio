"""Construction de la grille hexagonale.

La maille est l'hexagone H3 de résolution 8, soit environ 0,74 km². Ce n'est pas un compromis
d'affichage : c'est à la fois la limite réelle du pouvoir prédictif du modèle et une précaution
vis-à-vis de la propriété forestière privée. L'application ne descendra jamais en dessous.
"""

from __future__ import annotations

import geopandas as gpd
import h3
import pandas as pd
from shapely.geometry import Point, shape
from shapely.ops import unary_union

from .cache import fetch_json
from .config import CRS_WGS84, GEO_API_COMMUNES


def department_boundary(dept: str):
    """Contour d'un département, obtenu en fusionnant ses communes.

    Le point d'entrée départemental de geo.api.gouv.fr ne renvoie pas de géométrie ; celui des
    communes si. Les données viennent d'ADMIN EXPRESS (IGN), sous licence Etalab.
    """
    payload = fetch_json(
        GEO_API_COMMUNES.format(dept=dept),
        f"communes_{dept}.geojson",
        params={"format": "geojson", "geometry": "contour"},
    )
    geometries = [shape(feature["geometry"]) for feature in payload["features"]]
    if not geometries:
        raise ValueError(f"aucune commune renvoyée pour le département {dept}")
    return unary_union(geometries)


def cells_for_department(dept: str, resolution: int) -> list[str]:
    """Index H3 couvrant le département.

    h3.geo_to_cells retient les cellules dont le CENTRE tombe dans le polygone. Les mailles de
    bordure sont donc partiellement hors du département, ce qui est sans conséquence : la
    frontière administrative n'a aucune réalité mycologique, et une maille à cheval reste une
    maille valide.
    """
    boundary = department_boundary(dept)
    return list(h3.geo_to_cells(boundary.__geo_interface__, resolution))


def cells_frame(dept: str, resolution: int) -> gpd.GeoDataFrame:
    """Cellules d'un département, avec leur centroïde, en WGS84."""
    indexes = cells_for_department(dept, resolution)
    centers = [h3.cell_to_latlng(index) for index in indexes]

    frame = pd.DataFrame(
        {
            "h3_index": indexes,
            "dept": dept,
            "lat": [lat for lat, _ in centers],
            "lng": [lng for _, lng in centers],
        }
    )
    geometry = [Point(lng, lat) for lat, lng in centers]
    return gpd.GeoDataFrame(frame, geometry=geometry, crs=CRS_WGS84)


def cells_polygons(indexes: list[str]) -> gpd.GeoDataFrame:
    """Polygones des cellules — utile aux jointures surfaciques (part boisée, lisières)."""
    from shapely.geometry import Polygon

    polygons = [Polygon([(lng, lat) for lat, lng in h3.cell_to_boundary(i)]) for i in indexes]
    return gpd.GeoDataFrame({"h3_index": indexes}, geometry=polygons, crs=CRS_WGS84)
