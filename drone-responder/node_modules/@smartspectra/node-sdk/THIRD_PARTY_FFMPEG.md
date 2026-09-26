# FFmpeg (LGPL) — third-party notice

`@smartspectra/node-sdk` redistributes FFmpeg 6.1.1, built from unmodified
upstream source with `--disable-gpl --disable-nonfree`, licensed under the GNU
Lesser General Public License v2.1 or later. See `COPYING.LGPLv2.1` /
`COPYING.LGPLv3`.

- Source: <https://ffmpeg.org/releases/ffmpeg-6.1.1.tar.xz>
- FFmpeg is dynamically linked and shipped as replaceable shared objects; you
  may substitute your own compatible build (LGPL §6).

The FFmpeg shared libraries themselves do not ship in this package. They ride in
the per-platform native runtime packages `@smartspectra/node-sdk-<platform>-<arch>`,
which `@smartspectra/node-sdk` declares as regular dependencies, so `npm install`
places them (and a colocated copy of these same license texts) beside the loaded
`smartspectra_capi` shared library on the host.
