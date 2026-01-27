/**
 * PM2 Ecosystem Configuration
 * Run: npm run arb:start
 */

module.exports = {
  apps: [
    {
      name: 'polymarket-arbitrage',
      script: 'src/arbitrageRunner.ts',
      interpreter: './node_modules/.bin/ts-node',
      cwd: __dirname,

      // Environment
      env: {
        NODE_ENV: 'development',
        ARB_EXECUTION_MODE: 'simulation',
      },
      env_production: {
        NODE_ENV: 'production',
        ARB_EXECUTION_MODE: 'simulation', // Change to 'live' when ready
      },

      // Process management
      instances: 1,
      exec_mode: 'fork',  // Use fork mode for ts-node compatibility
      autorestart: true,
      watch: false,
      max_memory_restart: '500M',

      // Restart policy
      exp_backoff_restart_delay: 1000, // Exponential backoff on crashes
      max_restarts: 50,
      min_uptime: '10s',

      // Logging
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      error_file: './logs/arbitrage-error.log',
      out_file: './logs/arbitrage-out.log',
      merge_logs: true,

      // Graceful shutdown
      kill_timeout: 5000,
      wait_ready: false,
      listen_timeout: 10000,
    },
  ],
};
