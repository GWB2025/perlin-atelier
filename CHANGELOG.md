# Release notes

## 1.1.1 — 30 October 2026

- Added a self-contained native Mac app using AppKit and WebKit.
- Added native SVG/PNG Save dialogues with cancellation and write-error reporting.
- Added a universal Apple silicon/Intel build for macOS 12 or later.
- Added a standard installer for Applications, with bundle identity and version checks.
- Added a custom icon, reproducible packaging and four additional JavaScript export tests plus four Python installer tests.
- Verified native launch, text editing, Break/Decorate selection, guide preview and successful SVG/PNG saving on an Apple silicon Mac.

The app is ad-hoc signed; the installer is unsigned and not Apple-notarised.

## 1.1.0 — 30 October 2026

- Added Letter garden with five coherent, seeded stages: Foundation, Grow, Break, Write and Decorate.
- Added editable text, random character modes, a monoline English upper/lower-case alphabet and slanted lettering.
- Added row count, growth rounds, cut-out count/size, letter height/spacing and cable controls.
- Added construction guides that never appear in exported files, per-stage descriptions, and counts.
- Added real cut-out geometry, branch collision checks and page-bound checks.
- Added Inkscape-compatible pen layers and full lettering settings in SVG metadata.
- Preserved the original four abstract styles and existing presets.
- Corrected preview stroke scaling and guarded exports against stale slider changes.
- Supplied five stage samples, a mixed-case postcard and four abstract samples.

Validation: 16 automated tests passed, including isolated DOM interaction checks for stage selection, text changes, guide exclusion, SVG downloading, random-source controls, blank text, reset and About. The six lettering SVG samples were rasterised and visually inspected. All ten sample SVGs parsed successfully and stayed within their physical page bounds. The standalone build was checked for script syntax and missing external dependencies.

At the 1.1.0 release, browser layout and downloads were not interactively verified. Version 1.1.1 adds live native WebKit checks. No hardware plotting was performed.
