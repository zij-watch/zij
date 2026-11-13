"""Run from pipeline/:  uv run python -m zij build | checkpoint | all"""

from __future__ import annotations

import sys

from . import build, checkpoint

def _validate() -> None:
    from . import validate

    validate.run()


COMMANDS = {
    "build": (build.run,),
    "checkpoint": (checkpoint.run,),
    "validate": (_validate,),
    "all": (build.run, checkpoint.run, _validate),
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
