/** Root notices link to tags; packaged notices pin the matching package version. */
export function renderReleaseNotice(text: string, version: string): string {
  const repository = 'https://github.com/jlarmstrongiv/web-font-codecs';
  return text
    .replace(/^\[package-release-source\]: .+$/m, `[package-release-source]: ${repository}/tree/v${version}/`)
    .replace(/^\[package-release-archive\]: .+$/m, `[package-release-archive]: ${repository}/archive/refs/tags/v${version}.tar.gz`);
}
