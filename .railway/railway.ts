import { defineRailway, preserve, project, service, volume } from "railway/iac";

// Railway Infrastructure as Code. Railway does not read this file on deploy:
// preview with `railway config plan`, then `railway config apply`.
// Anything left out of this file is deleted on apply, so the volume, its mount
// and the variables stay declared here. preserve() keeps the values stored in
// Railway without writing them to git.
export default defineRailway(() => {
  // Editions live here (DATA_DIR=/data).
  const webVolume = volume("web-volume", {
    alerts: { usage: { "100": {}, "80": {}, "95": {} } },
    allowOnlineResize: true,
    region: "sfo",
    sizeMB: 5000,
  });

  const web = service("web", {
    start: "node scripts/start.mjs",
    healthcheck: "/healthz",
    healthcheckTimeout: 60,
    // Restart policy: ON_FAILURE, up to 5 retries. ON_FAILURE is Railway's
    // default and is stored as null, so writing restartPolicyType here would
    // show up as a change on every `railway config plan`.
    deploy: {
      restartPolicyMaxRetries: 5,
    },
    replicas: { sfo: 1 },
    volumeMounts: { "/data": webVolume },
    env: {
      ANTHROPIC_API_KEY: preserve(),
      DATA_DIR: preserve(),
    },
  });

  return project("daily-newspaper-ai", {
    resources: [web, webVolume],
  });
});
