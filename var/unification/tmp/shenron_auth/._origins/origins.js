// src/origins.ts
var VERCEL_PRODUCTION_ALIAS = "dbfr.vercel.app";
var SITE_PRODUCTION_HOSTS = [
  "dragonballfr.com",
  "www.dragonballfr.com",
  VERCEL_PRODUCTION_ALIAS
];
var SITE_DEVELOPMENT_HOSTS = ["localhost:3000"];
var SITE_PRODUCTION_ORIGINS = [
  "https://dragonballfr.com",
  "https://www.dragonballfr.com",
  `https://${VERCEL_PRODUCTION_ALIAS}`
];
var SITE_DEVELOPMENT_ORIGINS = ["http://localhost:3000"];
var BOT_PRODUCTION_ORIGINS = [
  "https://dragonballfr.com",
  "https://www.dragonballfr.com",
  "https://bot.dragonballfr.com",
  `https://${VERCEL_PRODUCTION_ALIAS}`
];
var BOT_DEVELOPMENT_ORIGINS = ["http://localhost:3000", "http://localhost:5006"];
function compose(production, development, input) {
  return input.production ? [...production] : [...production, ...development];
}
function siteAllowedHosts(input) {
  return compose(SITE_PRODUCTION_HOSTS, SITE_DEVELOPMENT_HOSTS, input);
}
function siteTrustedOrigins(input) {
  return compose(SITE_PRODUCTION_ORIGINS, SITE_DEVELOPMENT_ORIGINS, input);
}
function botTrustedOrigins(input) {
  return compose(BOT_PRODUCTION_ORIGINS, BOT_DEVELOPMENT_ORIGINS, input);
}
export {
  VERCEL_PRODUCTION_ALIAS,
  botTrustedOrigins,
  siteAllowedHosts,
  siteTrustedOrigins
};
