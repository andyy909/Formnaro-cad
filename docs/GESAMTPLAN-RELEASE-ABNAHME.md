# Formnaro 0.125.0-r36 release verification

The portable release adds native modelling improvements, improved error and memory handling, revision-bound saves, tool information, screw and tilt couplings, and saved inspection records. The modelling workflow retains original sources and a single Undo step for the applied change.

The published verification records **2,906 Node tests and 71 desktop check groups**, supplemented by **20 Python tests and eight native CNC regression cases**. The package report lists the initial findings and follow-up checks. A separate DeepSeek harness run exercised error correction, explicit Apply, and detection of a stale inspection record. Packaged executable checks covered an isolated profile, native FreeCAD, saving, and regular process exit. The ZIP was also tested after fresh extraction into a directory with accented characters and launched from a different working directory.

Motion and clearance results cover the sampled positions and pairs. Continuous contact, load, manufacturing validation and testing in a fresh Windows VM were outside the scope. Saved inspection records require project format 32, and older projects remain readable.

The published package report identifies the executable and ASAR by SHA-256. Native sources are available in separate archives. The release excludes private models, profiles, credentials and provider conversation logs.

- [Versioned source tree](https://github.com/andyy909/Formnaro-cad/tree/v0.125.0-r36)
- [Application source ZIP](https://github.com/andyy909/Formnaro-cad/releases/download/v0.125.0-r36/Formnaro-Quellcode-v0.125.0-r36.zip)
- [Package verification report](https://github.com/andyy909/Formnaro-cad/releases/download/v0.125.0-r36/Paket-Pruefstand.json)
- [Current public release](AKTUELLER-STAND.md)
