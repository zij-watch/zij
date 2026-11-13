"""Run from pipeline/:  uv run python -m zij pull | build | checkpoint | validate | harmonize | appdata | cells | boxes | fixtures | hotspots | all"""

from __future__ import annotations

import sys

from . import build, checkpoint

def _validate() -> None:
    from . import validate

    validate.run()


def _pull() -> None:
    from . import pull

    pull.run()


def _harmonize() -> None:
    from . import harmonize

    harmonize.run()


def _appdata() -> None:
    from . import appdata

    appdata.run()


def _cells() -> None:
    from . import cells

    cells.run()


def _boxes() -> None:
    from . import boxes

    boxes.run()


def _fixtures() -> None:
    from . import fixtures

    fixtures.run()


def _hotspots() -> None:
    from . import hotspots

    hotspots.run()


COMMANDS = {
    "pull": (_pull,),
    "build": (build.run,),
    "checkpoint": (checkpoint.run,),
    "validate": (_validate,),
    "harmonize": (_harmonize,),
    "appdata": (_appdata,),
    "cells": (_cells,),
    "boxes": (_boxes,),
    "fixtures": (_fixtures,),
    "hotspots": (_hotspots,),
    "all": (build.run, checkpoint.run, _validate, _harmonize, _appdata),
}


def main() -> int:
    name = sys.argv[1] if len(sys.argv) > 1 else "all"
    if name not in COMMANDS:
        print(f"Unknown command {name!r}. Use one of: {', '.join(COMMANDS)}")
        return 2
    for step in COMMANDS[name]:
        step()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
