#!/usr/bin/env python3
"""
Repository-local quick validator entrypoint for SkyAgent skills.

The actual validation runs through the repo's Bun toolchain so CI uses a real
YAML parser without requiring a separate Python package installation path.
"""

import subprocess
import sys
from shutil import which
from pathlib import Path


if __name__ == "__main__":
    if len(sys.argv) != 2:
        print("Usage: python quick_validate.py <skill_directory>")
        sys.exit(1)

    script = Path(__file__).with_name("quick_validate_yaml.ts")
    bun = which("bun") or which("bun.exe")
    if not bun:
        print("bun executable not found", file=sys.stderr)
        sys.exit(1)
    result = subprocess.run([bun, str(script), sys.argv[1]], check=False)
    sys.exit(result.returncode)
