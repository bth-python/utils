module.exports = {
  apps : [{
    name   : "invite-to-canvas",
    script : "./invite.mjs",
    watch: true,
    cron_restart: "*/3 * * * *",
    autorestart: false,
    exec_mode: 'fork',
    instances: 1,
  }]
}