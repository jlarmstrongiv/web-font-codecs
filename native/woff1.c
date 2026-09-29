/* SPDX-License-Identifier: MPL-1.1
 * Copyright (c) 2026 John L. Armstrong IV. See LICENSE-MPL-1.1 / package LICENSE.
 * This WOFF1-specific file is subject to Mozilla Public License 1.1.
 */

#include <stdint.h>
#include <stdlib.h>
#include "woff.h"
void codec_compression(unsigned, unsigned);
static const uint8_t *result;
static uint32_t result_len, status;
void codec_release(void) { free((void *)result); result = NULL; result_len = 0; }
uint32_t codec_size(void) { return result_len; }
uint32_t codec_status(void) { return status; }
const uint8_t *codec_run(const uint8_t *input, uint32_t len, uint32_t op,
  uint32_t limit, uint32_t a, uint32_t b, const uint8_t *meta, uint32_t meta_len,
  const uint8_t *priv, uint32_t priv_len, uint32_t engine, uint32_t iterations) {
  codec_release(); status = 0;
  if (op == 1) {
    if (engine > 1 || iterations < 1 || iterations > 100) { status = 6; return NULL; }
    codec_compression(engine, iterations);
    result = woffEncode(input, len, a, b, &result_len, &status);
    if (result && meta_len) {
      const uint8_t *next = woffSetMetadata(result, &result_len, meta, meta_len, &status);
      if (next) result = next;
    }
    if (result && priv_len && !(status & 255)) {
      const uint8_t *next = woffSetPrivateData(result, &result_len, priv, priv_len, &status);
      if (next) result = next;
    }
  } else if (op == 2) {
    uint32_t size = woffGetDecodedSize(input, len, &status);
    if (size > limit) status = 128;
    else if (!(status & 255)) result = woffDecode(input, len, &result_len, &status);
  } else if (op == 3) result = woffGetMetadata(input, len, &result_len, &status);
  else if (op == 4) result = woffGetPrivateData(input, len, &result_len, &status);
  else status = 6;
  if (result_len > limit) status = 128;
  if (status & 255) codec_release();
  return result;
}
