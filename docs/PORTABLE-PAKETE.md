# Portable packages and separate sources

User policy, 1 November 2026: always distribute source archives separately from
the portable Windows application ZIP.

The application ZIP contains the executable, required runtimes, licences,
runtime documentation and start instructions. Keep application development
sources, development tools, project tests and third-party source archives out
of this download. Keep required runtime licence notices and build provenance.
Files belonging to bundled runtimes are not development material merely
because a vendor directory is named `Layouts` or `tests`.

Provide the matching Formnaro, CAD-kernel and FreeCAD sources as separate
release assets. Link those assets from the application instructions and release
notes. Preserve matching upstream versions and source-offer requirements.
English is the default README language; provide a German alternative.

Before upload, verify package membership, exclude personal models, profiles and
credentials, and bind the EXE, ASAR, separate source archives and reports by
SHA-256. Read every ZIP entry and check its CRC and SHA-256, then test a fresh
extraction in a Unicode directory with a foreign working directory. Repacking
unchanged executable files is a packaging change; report the existing code
tests accurately and identify the fresh package checks separately.

Publish only to the GitHub destination authorized in the current task. Do not
replace unrelated working-tree changes or assume a targeted verification is a
new full regression or clean-Windows-VM acceptance.
