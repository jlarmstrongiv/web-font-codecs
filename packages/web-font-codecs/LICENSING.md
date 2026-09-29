# License split

- **MPL 1.1:** our WOFF1-specific code in `packages/woff1-codec/`,
  `native/woff1.c`, and `native/build-woff1.ts`. The WOFF1 package declares
  `MPL-1.1` and ships the full license.
- **MIT:** all other code we author: shared runtime, unified converter, WOFF2
  wrapper, CLI, demo, and general scripts/tests. The root `LICENSE` provides
  these terms, with the WOFF1 exception stated explicitly.
- **Original upstream terms:** Mozilla's C files retain their existing
  MPL 1.1 / GPL 2.0-or-later / LGPL 2.1-or-later notices. We select their MPL
  1.1 option for this distribution. Google WOFF2 and Brotli remain MIT, zlib
  remains zlib-licensed, and compiler runtime components retain their licenses.
  See `THIRD-PARTY-NOTICES.md`.

MPL 1.1 is file-level copyleft: distributing this library does not by itself
require an entire larger application to be MPL-licensed. Distribution of the
covered executable does require preserving applicable notices and making its
corresponding covered source, modifications, interface definitions and build
scripts available under the MPL terms, including for unmodified codec binaries.
Read the license for the exact requirements.

The public repository is designated as https://github.com/jlarmstrongiv/web-font-codecs.
The matching source is the package's `v<version>` tag in the
[source repository][package-release-source].
Package builds set this tagged source link from the package version. Before
publishing, verify that the matching source is publicly accessible and keep it
available for the applicable MPL 1.1 period. The npm tarball additionally includes
a complete WOFF1 source/build bundle as a practical convenience.
It is not an additional licensing condition imposed on consumers.

`native/CHANGES.md` identifies changes and dates. Original Mozilla C sources and
headers are unmodified. Distributors that extract the WASM from the package should
carry forward a compliant source-availability arrangement and notices.

[package-release-source]: https://github.com/jlarmstrongiv/web-font-codecs/tree/v0.1.0/
