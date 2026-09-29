/* MIT: test-only native driver for the shared codec ABI. */
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#ifdef __cplusplus
extern "C" {
#endif
const uint8_t *codec_run(const uint8_t *, uint32_t, uint32_t, uint32_t, uint32_t, uint32_t, const uint8_t *, uint32_t, const uint8_t *, uint32_t, uint32_t, uint32_t);
uint32_t codec_size(void);
uint32_t codec_status(void);
void codec_release(void);
#ifdef __cplusplus
}
#endif
int main(int argc, char **argv) {
  if (argc != 4 && argc != 5) return 2;
  FILE *file = fopen(argv[2], "rb"); if (!file) return 3;
  fseek(file, 0, SEEK_END); long length = ftell(file); rewind(file);
  if (length <= 0 || length > 512 * 1024 * 1024) { fclose(file); return 4; }
  uint8_t *data = (uint8_t *)calloc((size_t)length + 4, 1);
  if (!data || fread(data, 1, length, file) != (size_t)length) { fclose(file); free(data); return 5; }
  fclose(file);
#ifdef WOFF2_REFERENCE
  uint32_t a = 11, b = 1;
#else
  uint32_t a = 1, b = 0;
#endif
  const uint8_t *result = codec_run(data, length, strcmp(argv[1], "encode") == 0 ? 1 : 2, 512 * 1024 * 1024, a, b, NULL, 0, NULL, 0, argc == 5 ? 1 : 0, 15);
  if (codec_status() & 255) { free(data); codec_release(); return 6; }
  file = fopen(argv[3], "wb"); if (!file) { free(data); codec_release(); return 7; }
  size_t size = codec_size(); int ok = fwrite(result, 1, size, file) == size;
  fclose(file); free(data); codec_release(); return ok ? 0 : 8;
}
