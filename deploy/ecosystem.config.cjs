module.exports = {
  apps: [
    {
      name: 'po123-api',
      cwd: '/home/it/po123/api',
      script: 'src/server.mjs',
      interpreter: 'node',
      env: {
        NODE_ENV: 'production',
        PORT: '2405',
        API_HOST: '127.0.0.1',
        PHOTO_DIR: '/var/lib/po123/photos',
      },
      autorestart: true,
      restart_delay: 5000,
      kill_timeout: 5000,
      time: true,
      merge_logs: true,
    },
  ],
};
