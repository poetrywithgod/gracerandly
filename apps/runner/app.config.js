// Wraps app.json so the Firebase config (needed for push notifications on
// Android) is picked up when it's present and the build still works when it
// isn't — the app then simply has no push.
//
// Looked up in this order:
//   1. the GOOGLE_SERVICES_JSON env var (an EAS file variable), or
//   2. ./google-services.json next to this file.
const fs = require("fs");
const path = require("path");

module.exports = ({ config }) => {
  const localFile = path.join(__dirname, "google-services.json");
  const googleServicesFile = process.env.GOOGLE_SERVICES_JSON || (fs.existsSync(localFile) ? "./google-services.json" : undefined);
  if (!googleServicesFile) return config;
  return { ...config, android: { ...config.android, googleServicesFile } };
};
