# Validation — Perlin Atelier 1.1.1

Checked on 30 October 2026.

- 20 JavaScript tests passed: geometry, five-stage repeatability, text/glyphs, bounds, metadata escaping, original styles, isolated interface wiring and native/browser export routing.
- 4 Python tests passed: fixed Applications destination, version/identity checks, architecture/OS requirements and installation without scripts.
- The universal executable contains arm64 and x86_64 slices with a macOS 12 deployment target. Only the arm64 slice was executed locally.
- The native executable's self-test passed both before packaging and from the expanded installer payload. It checks the bundled standalone HTML and export request validation/decoding.
- Ad-hoc code signature verification passed. This is not Developer ID signing or Apple notarisation.
- The ICNS icon decoded successfully as a 1024 × 1024 image.
- A live native app window displayed the artwork and controls correctly. Text entry was changed to `Hello Dan! 123`, Break and Decorate were selected, and construction guides were enabled.
- Native SVG and PNG Save dialogues were exercised. The saved SVG parsed successfully, retained the 148 × 105 mm dimensions, contained 438 paths and excluded the construction guides. The PNG was 592 × 420 pixels and visually inspected.
- Ten sample SVGs were generated. The six lettering stage/sample images were visually inspected in the preceding release.
- The expanded PKG contained only `Perlin Atelier.app` under `/Applications`. Its file hashes matched the built app, it had no installation scripts, and the executable retained its permissions and valid ad-hoc signature.
- The installer ZIP passed CRC checks and contains the matching PKG, installation instructions and a payload validation report.

The installer was not run against Applications. No physical plotting, Intel execution, or separate Safari/Chrome compatibility run was performed. The Mac shell does not persist unsaved artwork between launches; export drawings before quitting.
