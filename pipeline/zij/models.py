"""Calibration models: weekly VIIRS fire days predicted from weekly MODIS fire days.

    raw  V = M                                 no calibration, the baseline
    M0   V = k M                               k = sum V / sum M
    M1   V = c + a M^b
    M2   V = c[month] + a M^b                  c by calendar month, ridge-pulled to the overall c
    M3   V = c[month] + a M^b + d M^b z        z = log of MODIS mean FRP per detection, centred
    M4   V = c[month] r^g + a M^b + d M^b z    r = the year's MODIS season total / the typical one

b and g come from grid searches. For a fixed b and g everything is linear least
squares with at most 14 unknowns, solved through the normal equations, so the
same steps port to TypeScript. A fit is a plain dict, ready for JSON.

Inputs are arrays over weeks: M, V, month (1 to 12), year, frp (MODIS mean FRP
per detection, NaN when MODIS saw nothing).
"""

from __future__ import annotations

import numpy as np

from . import areas as p


def _normal_solve(A: np.ndarray, y: np.ndarray, ridge: np.ndarray | None = None,
                  target: np.ndarray | None = None) -> np.ndarray:
    """Minimise |A x - y|^2 + sum ridge_j (x_j - target_j)^2."""
    G = A.T @ A
    rhs = A.T @ y
    if ridge is not None:
        G = G + np.diag(ridge)
        rhs = rhs + ridge * target
    G = G + 1e-9 * np.eye(len(rhs))  # keeps an empty column solvable
    return np.linalg.solve(G, rhs)


def _power(M: np.ndarray, b: float) -> np.ndarray:
    out = np.zeros(len(M))
    pos = M > 0
    out[pos] = M[pos] ** b
    return out


def _z(frp: np.ndarray, z_ref: float) -> np.ndarray:
    z = np.zeros(len(frp))
    ok = np.isfinite(frp) & (frp > 0)
    z[ok] = np.log(frp[ok]) - z_ref
    return np.clip(z, -p.Z_CLIP, p.Z_CLIP)


def season_months(V: np.ndarray, month: np.ndarray) -> list[int]:
    """The 3 consecutive calendar months with the highest mean weekly VIIRS."""
    mean = np.array([V[month == m].mean() if (month == m).any() else 0.0 for m in range(1, 13)])
    start = max(range(12), key=lambda i: sum(mean[(i + j) % 12] for j in range(p.SEASON_LENGTH)))
    return [(start + j) % 12 + 1 for j in range(p.SEASON_LENGTH)]


def _season_totals(M: np.ndarray, month: np.ndarray, year: np.ndarray, season: list[int]) -> dict[int, float]:
    ins = np.isin(month, season)
    return {int(y): float(M[ins & (year == y)].sum()) for y in np.unique(year[ins])}


def activity_ratio(M: np.ndarray, month: np.ndarray, year: np.ndarray, season: list[int], s_typ: float) -> np.ndarray:
    """r per week: that year's MODIS season total over the typical one. 1 when unknown."""
    if s_typ <= 0:
        return np.ones(len(M))
    totals = _season_totals(M, month, year, season)
    r = np.array([totals.get(int(y), s_typ) / s_typ for y in year])
    return np.clip(r, *p.R_CLIP)


def fit(model: str, M, V, month, year, frp, season: list[int]) -> dict:
    """Fit one model on the weeks given (training weeks, partial weeks already out)."""
    M, V = np.asarray(M, float), np.asarray(V, float)
    month, year, frp = np.asarray(month), np.asarray(year), np.asarray(frp, float)
    f = {"model": model, "n_fire_weeks": int((M > 0).sum()), "scale": 1.0}
    if model == "raw":
        return f
    if model == "M0":
        f["k"] = float(V.sum() / M.sum()) if M.sum() > 0 else 1.0
        return f

    has_frp = np.isfinite(frp) & (frp > 0)
    z_ref = float(np.median(np.log(frp[has_frp]))) if has_frp.any() else 0.0
    z = _z(frp, z_ref)
    monthly = (month[:, None] == np.arange(1, 13)[None, :]).astype(float)
    ones = np.ones(len(M))

    s_typ, r = 0.0, ones
    if model == "M4":
        totals = list(_season_totals(M, month, year, season).values())
        s_typ = float(np.median(totals)) if totals else 0.0
        r = activity_ratio(M, month, year, season, s_typ)

    best = None
    for g in (p.G_GRID if model == "M4" else (0.0,)):
        background = monthly * (r ** g)[:, None]
        for b in p.B_GRID:
            Mb = _power(M, b)
            if model == "M1":
                A = np.column_stack([ones, Mb])
                x = _normal_solve(A, V)
            else:
                cols = [background, Mb[:, None]]
                if model in ("M3", "M4"):
                    cols.append((Mb * z)[:, None])
                A = np.hstack(cols)
                # The ridge needs a target: the single background of c + a M^b at this b.
                c_all = _normal_solve(np.column_stack([ones, Mb]), V)[0]
                ridge, target = np.zeros(A.shape[1]), np.zeros(A.shape[1])
                ridge[:12], target[:12] = p.MONTH_RIDGE, c_all
                x = _normal_solve(A, V, ridge, target)
            sse = float(((A @ x - V) ** 2).sum())
            if best is None or sse < best[0]:
                best = (sse, b, g, x)

    _, b, g, x = best
    if model == "M1":
        c, a, d = [max(float(x[0]), 0.0)] * 12, max(float(x[1]), 0.0), 0.0
    else:
        c = [max(float(v), 0.0) for v in x[:12]]
        a = max(float(x[12]), 0.0)
        d = float(x[13]) if model in ("M3", "M4") else 0.0
    f.update({"b": float(b), "g": float(g), "a": a, "c": c, "d": d, "z_ref": z_ref,
              "season": [int(m) for m in season], "s_typ": s_typ})
    return f


def predict(f: dict, M, month, year, frp) -> np.ndarray:
    """Weekly VIIRS-equivalent fire days. `scale` is the small-area rule: V = s f(M / s)."""
    s = f["scale"]
    M = np.asarray(M, float) / s
    month, year, frp = np.asarray(month), np.asarray(year), np.asarray(frp, float)
    if f["model"] == "raw":
        return M * s
    if f["model"] == "M0":
        return f["k"] * M * s
    Mb = _power(M, f["b"])
    c = np.asarray(f["c"])[month - 1]
    if f["model"] == "M4":
        c = c * activity_ratio(M, month, year, f["season"], f["s_typ"]) ** f["g"]
    z = _z(frp, f["z_ref"]) if f["model"] in ("M3", "M4") else 0.0
    return np.maximum(c + Mb * (f["a"] + f["d"] * z), 0.0) * s


def fit_area(model: str, area: dict, country: dict | None, season: list[int]) -> dict:
    """The small-area rule (SPEC 5.5c). `area` and `country` hold training arrays.

    100 or more MODIS fire weeks: the area's own fit. 30 to 99: a blend,
    w x own + (1 - w) x the country's fit scaled to the area, w = fire weeks / 100.
    Under 30: no fit.
    """
    own = fit(model, area["M"], area["V"], area["month"], area["year"], area["frp"], season)
    n = own["n_fire_weeks"]
    if model in ("raw", "M0") or n >= p.MIN_FIRE_WEEKS or country is None:
        return {"mode": "own", "n_fire_weeks": n, "parts": [(own, 1.0)]}
    if n < p.MIN_FIRE_WEEKS_ANY:
        return {"mode": "none", "n_fire_weeks": n, "parts": []}
    share = float(np.sum(area["M"]) / np.sum(country["M"])) if np.sum(country["M"]) > 0 else 0.0
    if share <= 0:
        return {"mode": "own", "n_fire_weeks": n, "parts": [(own, 1.0)]}
    scaled = fit(model, country["M"], country["V"], country["month"], country["year"], country["frp"],
                 season_months(country["V"], country["month"]))
    scaled["scale"] = share
    w = n / p.MIN_FIRE_WEEKS
    return {"mode": "blend", "n_fire_weeks": n, "parts": [(own, w), (scaled, 1.0 - w)]}


def predict_area(af: dict, M, month, year, frp) -> np.ndarray:
    return sum(w * predict(f, M, month, year, frp) for f, w in af["parts"])
