# web-font-codecs-cli

Convert fonts between TTF/OTF, WOFF and WOFF2 from the command line.

- One command for every direction: TTF/OTF to WOFF or WOFF2, back again, and WOFF to WOFF2.
- Picks the format from the output file name.
- Mozilla's WOFF and Google's WOFF2 codecs, compiled to WebAssembly. Nothing to compile on install.
- Optional Zopfli for smaller WOFF files.
- Runs locally. Fonts are never uploaded.

Requires Node 24 or later.

```sh
npx web-font-codecs-cli font.ttf -o font.woff2
```

Or install globally:

```sh
npm install -g web-font-codecs-cli
web-font-codecs-cli font.ttf -o font.woff2
```

## Examples

```sh
web-font-codecs-cli font.ttf -o font.woff
web-font-codecs-cli font.ttf -o font.woff --woff1-compression zopfli --zopfli-iterations 15
web-font-codecs-cli font.otf -o font.woff2 --quality 8
web-font-codecs-cli font.woff2 -o font.otf
web-font-codecs-cli font.woff --to woff2 -o - > font.woff2
cat font.ttf | web-font-codecs-cli - -o font.woff2
```

The output extension sets the format: `.woff` is WOFF, `.woff2` is WOFF2, `.ttf` and `.otf` decode to TTF/OTF. Use `--to` when writing to stdout (`-o -`) or to another extension.

Decoding keeps the font's outlines, so the extension must match them: TrueType fonts need `.ttf` and CFF fonts need `.otf`. The CLI tells you which to use.

## Options

| Option | Default | Meaning |
| --- | --- | --- |
| `-o`, `--output PATH` | required | Output file, or `-` for stdout |
| `--to sfnt\|woff1\|woff2` | from extension | Output format. Must agree with the extension if both are given. |
| `--woff1-compression zlib\|zopfli` | `zlib` | WOFF encoder. Zopfli is slower and smaller. |
| `--zopfli-iterations N` | `15` | 1 to 100. Needs `--woff1-compression zopfli`. |
| `--quality N` | `11` | WOFF2 Brotli quality, 0 to 11 |
| `--max-output-mib N` | `512` | Output size limit, up to 512 |
| `--force` | off | Overwrite an existing output file |
| `-h`, `--help` | | Print help |

WOFF2 glyph transforms are always on. WOFF metadata, private data and container version are available through the [`web-font-codecs`](../web-font-codecs/README.md) API, not the CLI.

## Behavior

- Input is a file or `-` for stdin, limited to 512 MiB.
- WOFF and WOFF2 output is always re-encoded, even from the same format.
- Warnings go to stderr: when the WOFF codec repairs the font, and when WOFF metadata or private data is dropped. They do not change the exit code.
- Exit code 0 on success, 1 on any error. Errors print to stderr, prefixed with the error code when there is one.
- TTC/OTC collections are not supported.

## Use from Node

The package also exports `main(args?: string[]): Promise<void>`, which runs the command, and `reportError(error: unknown): void`, which prints an error and sets `process.exitCode` to 1. `usage` holds the help text. For converting bytes in your own code, use [`web-font-codecs`](../web-font-codecs/README.md).

## License

MIT. The WOFF codec it depends on is MPL 1.1 and ships its own source. See [LICENSING.md](LICENSING.md) and [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md).
