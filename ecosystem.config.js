module.exports = {
  apps: [{
    name: 'pg-manager-api',
    script: './backend/src/index.js',
    instances: 'max',
    exec_mode: 'cluster',
    watch: false,
    max_memory_restart: '512M',
    env_production: { NODE_ENV: 'production', PORT: 5000 },
    error_file: './logs/error.log',
    out_file: './logs/out.log',
    time: true,
  }]
};
