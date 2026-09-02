#!/usr/bin/env python3
"""Prints "<device type id> <runtime id>" for the newest available iOS
simulator runtime and the newest iPhone that runtime SUPPORTS.

Hard-coding either has broken twice: this runner's Xcode moved from 15.4 to
26, and `simctl list devicetypes` cheerfully offers an iPhone 6s Plus that
iOS 26 refuses to run ("Incompatible device").
"""

import json
import re
import subprocess
import sys


def main() -> int:
    listing = subprocess.run(
        ["xcrun", "simctl", "list", "-j", "runtimes"],
        capture_output=True,
        text=True,
        check=True,
    )
    runtimes = [
        runtime
        for runtime in json.loads(listing.stdout)["runtimes"]
        if runtime.get("platform") == "iOS" and runtime.get("isAvailable")
    ]
    if not runtimes:
        print("no available iOS runtime", file=sys.stderr)
        return 1

    newest = max(runtimes, key=lambda r: [int(part) for part in r["version"].split(".")])
    iphones = [
        device
        for device in newest.get("supportedDeviceTypes", [])
        if "iPhone" in device["name"]
    ]
    if not iphones:
        print(f"{newest['identifier']} supports no iPhone", file=sys.stderr)
        return 1

    def generation(device: dict) -> int:
        match = re.search(r"iPhone (\d+)", device["name"])
        return int(match.group(1)) if match else 0

    print(max(iphones, key=generation)["identifier"], newest["identifier"])
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
