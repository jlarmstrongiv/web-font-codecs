// MIT licensed adapter over Google's unmodified WOFF2 implementation.
#include <stdint.h>
#include <stdlib.h>
#include <string.h>
#include <algorithm>
#include <string>
#include "woff2/encode.h"
#include "woff2/decode.h"
#include "woff2/output.h"
static uint8_t *result;
static uint32_t result_len, status;
// Keep the decoded bytes in the result allocation instead of duplicating a
// potentially large std::string. Bounds and allocation failures are explicit.
class BoundedOut : public woff2::WOFF2Out {
 public:
  explicit BoundedOut(size_t limit) : limit_(limit), capacity_(0), exceeded(false), allocation_failed(false) {}
  bool Write(const void *data, size_t length) override {
    return Write(data, result_len, length);
  }
  bool Write(const void *data, size_t offset, size_t length) override {
    if (offset > limit_ || length > limit_ - offset) { exceeded = true; return false; }
    const size_t end = offset + length;
    if (end > capacity_) {
      size_t capacity = std::min(limit_, std::max(end, std::max(size_t(65536), capacity_ + capacity_ / 2)));
      uint8_t *next = (uint8_t *)realloc(result, capacity);
      if (!next) { allocation_failed = true; return false; }
      result = next;
      memset(result + capacity_, 0, capacity - capacity_);
      capacity_ = capacity;
    }
    if (length) memcpy(result + offset, data, length);
    result_len = std::max(size_t(result_len), end);
    return true;
  }
  size_t Size() override { return result_len; }
 private:
  size_t limit_, capacity_;
 public:
  bool exceeded, allocation_failed;
};
extern "C" {
void codec_release() { free(result); result = nullptr; result_len = 0; }
uint32_t codec_size() { return result_len; }
uint32_t codec_status() { return status; }
const uint8_t *codec_run(const uint8_t *input, uint32_t len, uint32_t op,
  uint32_t limit, uint32_t quality, uint32_t transforms, const uint8_t *meta,
  uint32_t meta_len, const uint8_t *, uint32_t, uint32_t, uint32_t) {
  codec_release(); status = 0;
  if (op == 1) {
    woff2::WOFF2Params params;
    params.brotli_quality = quality;
    params.allow_transforms = transforms != 0;
    if (meta_len) params.extended_metadata.assign((const char *)meta, meta_len);
    size_t cap = woff2::MaxWOFF2CompressedSize(input, len, params.extended_metadata);
    // The capacity is an upstream bound, not the actual compressed output size.
    // Input plus metadata is bounded to 512 MiB; upstream adds 1024 bytes.
    if (cap > size_t(512) * 1024 * 1024 + 1024) { status = 128; return nullptr; }
    // Google rounds the container length up but leaves alignment padding unwritten.
    // Zero it so output never exposes heap residue and is deterministic.
    result = (uint8_t *)calloc(cap, 1);
    if (!result) { status = 1; return nullptr; }
    if (!woff2::ConvertTTFToWOFF2(input, len, result, &cap, params)) status = 2;
    result_len = cap;
  } else if (op == 2) {
    BoundedOut sink(limit);
    if (!woff2::ConvertWOFF2ToTTF(input, len, &sink)) status = sink.exceeded ? 128 : sink.allocation_failed ? 1 : 2;
  } else status = 6;
  if (result_len > limit) status = 128;
  if (status) codec_release();
  return result;
}
}
