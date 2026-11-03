# Local .fnpack container format, version 1

The container is independent of the original STEP path and needs no external library. All integers in the fixed header use little-endian byte order.

| Byte range | Contents |
| --- | --- |
| 0–7 | ASCII magic `FNPACK\r\n` |
| 8–11 | Container version, uint32, currently 1 |
| 12–15 | UTF-8 index length, uint32, at most 16 MiB |
| 16–47 | SHA-256 of the exact index bytes |
| 48–63 | Reserved, all zero bytes |
| From 64 | Index followed immediately by geometry blocks |

The index contains exactly `format: "FormnaroPackage"`, `version: 1`, `project` and `blocks`. Formnaro 0.125.0-r36 accepts embedded project versions 17 through 32. The writer selects at least version 17 based on the model's features. [Project validation](../src/cad-project.js), [Package serialization](../src/cad-fnpack-data.js)

Stored BRep and mesh buffers are represented by strict `Formnaro-GeometryRef` records. A reference contains the block kind, SHA-256 and byte count. Mesh references include catalogue bounds, vertex and triangle counts, and an explicitly unverified display class. Native bodies retain their local statistics and source metadata.

Each block record contains `sha256`, `kind`, `bytes` and `offset`. The offset is relative to the start of the geometry blocks. Blocks are contiguous and non-overlapping, hashes are unique, and the file ends exactly at the last block. Each block must be referenced and each reference must resolve. The container limit is 2 GiB.

BRep blocks contain the exact UTF-8 BRep text and preserve its topology. Mesh blocks contain UTF-8 JSON with the original `verts` and `triangles`. Hashes cover the exact bytes. Instances with different IDs or affine transforms can share a block.

The `geometryIdentity` property preserves correspondence signatures and metadata keys for unchanged unloaded sources. These fields describe the catalogue. After hydration, Formnaro computes geometry signatures from the actual bytes. Changed placements and sources receive updated signatures. Scene responses identify catalogue-only geometry with `geometryLoaded: false` and `geometryEvidence: "package-catalogue-only"`.

The native file service reads the header and index when opening the package and loads required blocks with bounded range reads. Saving copies unloaded blocks in chunks and checks their hashes again. File access handles and caches remain local to the session.

[User workflow](FNPACK.md) · [Native file validation](../backend/fnpack.cjs)
