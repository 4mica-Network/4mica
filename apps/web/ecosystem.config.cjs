module.exports = {
  apps: [
    {
      name: "4mica-web",
      script: "/usr/local/bin/serve",
      // -c is what supplies the Content-Type headers `serve` cannot work out on
      // its own: serve-handler pins mime-types@2.1.18 (mime-db 1.33.0, 2018),
      // which predates AVIF, so every .avif — and every extensionless PNG under
      // /og — would otherwise go out with no Content-Type at all. Browsers then
      // sniff AVIF's ISO-BMFF `ftyp` box as video/mp4 and <img> fails to decode
      // it. Absolute path: `serve` resolves --config against the served
      // directory, and throws if it is missing rather than silently dropping
      // the headers.
      args: "out -l tcp://0.0.0.0:3000 -c /app/serve.json",
      env: {
        NODE_ENV: "production",
      },
      max_memory_restart: "256M",
    },
  ],
};
