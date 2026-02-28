"""Procedural GLB asset generation using trimesh.

Generates cluster blobs and beacon markers as GLB files
for hot-loading in the 3D frontend.
"""

import hashlib
import logging
import math
from pathlib import Path

import numpy as np
import trimesh

log = logging.getLogger(__name__)

ASSETS_DIR = Path(__file__).resolve().parent.parent.parent / "assets"
ASSETS_DIR.mkdir(exist_ok=True)


def _severity_color(risk_score: float) -> list[int]:
    """Map risk score [0,1] to RGBA color."""
    if risk_score > 0.7:
        return [255, 50, 50, 255]  # red
    elif risk_score > 0.4:
        return [255, 170, 0, 255]  # orange
    else:
        return [80, 140, 255, 255]  # blue


def make_cluster_blob(
    entity_ids: list[str],
    risk_score: float,
    cluster_id: str,
) -> Path:
    """Generate a metaball-like cluster blob as GLB.

    Creates a merged mesh of overlapping spheres positioned
    based on entity ID hashes, with emissive-style coloring
    based on severity.
    """
    cache_key = hashlib.md5(
        f"{cluster_id}:{risk_score:.2f}:{len(entity_ids)}".encode()
    ).hexdigest()[:12]
    out_path = ASSETS_DIR / f"cluster_{cache_key}.glb"

    if out_path.exists():
        log.info(f"Cluster blob cache hit: {out_path.name}")
        return out_path

    n = len(entity_ids)
    color = _severity_color(risk_score)

    # Position spheres in a clustered arrangement
    meshes = []
    for i, eid in enumerate(entity_ids[:20]):  # cap at 20 sub-spheres
        # Deterministic position from entity ID
        h = int(hashlib.md5(eid.encode()).hexdigest()[:8], 16)
        angle = (h % 360) * math.pi / 180
        radius = 0.3 + (h % 100) / 200.0
        x = math.cos(angle) * radius
        z = math.sin(angle) * radius
        y = ((h >> 8) % 100) / 200.0 - 0.25

        # Sphere size scales with cluster size
        sphere_radius = 0.2 + min(n, 20) * 0.02
        sphere = trimesh.creation.icosphere(subdivisions=2, radius=sphere_radius)
        sphere.apply_translation([x, y, z])

        # Apply vertex colors
        sphere.visual.vertex_colors = np.tile(color, (len(sphere.vertices), 1))
        meshes.append(sphere)

    if not meshes:
        # Fallback: single sphere
        sphere = trimesh.creation.icosphere(subdivisions=2, radius=0.5)
        sphere.visual.vertex_colors = np.tile(color, (len(sphere.vertices), 1))
        meshes.append(sphere)

    # Merge all sub-spheres into one mesh
    combined = trimesh.util.concatenate(meshes)

    # Export as GLB
    combined.export(str(out_path), file_type="glb")
    size_kb = out_path.stat().st_size / 1024
    log.info(f"Generated cluster blob: {out_path.name} ({size_kb:.0f} KB, {n} entities)")
    return out_path


def make_beacon(
    entity_id: str,
    risk_score: float,
) -> Path:
    """Generate a beacon marker (cone + cylinder) as GLB.

    Used for highlighting individual high-risk entities.
    """
    cache_key = hashlib.md5(
        f"beacon:{entity_id}:{risk_score:.2f}".encode()
    ).hexdigest()[:12]
    out_path = ASSETS_DIR / f"beacon_{cache_key}.glb"

    if out_path.exists():
        log.info(f"Beacon cache hit: {out_path.name}")
        return out_path

    color = _severity_color(risk_score)

    # Cylinder base
    cylinder = trimesh.creation.cylinder(radius=0.08, height=0.6, sections=8)
    cylinder.apply_translation([0, 0.3, 0])
    cylinder.visual.vertex_colors = np.tile(color, (len(cylinder.vertices), 1))

    # Cone top
    cone = trimesh.creation.cone(radius=0.15, height=0.3, sections=8)
    cone.apply_translation([0, 0.75, 0])
    cone.visual.vertex_colors = np.tile(color, (len(cone.vertices), 1))

    combined = trimesh.util.concatenate([cylinder, cone])
    combined.export(str(out_path), file_type="glb")

    size_kb = out_path.stat().st_size / 1024
    log.info(f"Generated beacon: {out_path.name} ({size_kb:.0f} KB)")
    return out_path
