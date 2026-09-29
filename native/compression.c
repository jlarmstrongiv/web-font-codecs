/* SPDX-License-Identifier: MPL-1.1
 * Copyright (c) 2026 John L. Armstrong IV.
 * WOFF1 compression hook; Mozilla and Google sources remain unmodified.
 */
#include <stdlib.h>
#include <string.h>
#include "zlib.h"
#include "zopfli.h"
static unsigned engine, iterations = 15;
void codec_compression(unsigned choice, unsigned count) { engine = choice; iterations = count; }
/* Only Mozilla's translation unit renames compress2 to this symbol. */
int codec_compress2(Bytef *dest, uLongf *dest_len, const Bytef *source,
                    uLong source_len, int level) {
  if (!engine) return compress2(dest, dest_len, source, source_len, level);
  ZopfliOptions options;
  ZopfliInitOptions(&options);
  options.numiterations = (int)iterations;
  unsigned char *output = NULL;
  size_t length = 0;
  ZopfliCompress(&options, ZOPFLI_FORMAT_ZLIB, source, source_len, &output, &length);
  if (!output) return Z_MEM_ERROR;
  /* Mozilla allocates zlib's compressBound. In the unlikely event Zopfli
     exceeds it, retain the bounded zlib path (also valid for metadata). */
  if (length > *dest_len) { free(output); return compress2(dest, dest_len, source, source_len, level); }
  memcpy(dest, output, length);
  *dest_len = (uLongf)length;
  free(output);
  return Z_OK;
}
