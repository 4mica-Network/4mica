module.exports = {
  apps: [
    {
      name: "4mica-web",
      script: "/usr/local/bin/serve",
      args: "out -l tcp://0.0.0.0:3000",
      env: {
        NODE_ENV: "production",
      },
      max_memory_restart: "256M",
    },
  ],
};
