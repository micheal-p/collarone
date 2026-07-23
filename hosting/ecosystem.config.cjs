// pm2 process file — `pm2 start ecosystem.config.cjs`, then `pm2 save` +
// `pm2 startup` once so it survives reboots. `pm2 reload collarone` gives a
// zero-downtime restart on deploys.
module.exports = {
  apps: [
    {
      name: 'collarone',
      script: 'server.mjs',
      cwd: __dirname,
      instances: 1,
      autorestart: true,
      max_memory_restart: '512M',
      env: { NODE_ENV: 'production' },
      out_file: '/var/log/collarone/out.log',
      error_file: '/var/log/collarone/err.log',
      merge_logs: true,
      time: true,
    },
  ],
};
