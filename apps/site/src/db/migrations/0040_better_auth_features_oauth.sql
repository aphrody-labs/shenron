-- Unified email/social accounts, MFA, passkeys, and Shenron OAuth 2.1/OIDC.
ALTER TABLE public.ba_user
  ADD COLUMN "twoFactorEnabled" boolean DEFAULT false;
--> statement-breakpoint

CREATE TABLE public.two_factor (
  id text PRIMARY KEY,
  secret text NOT NULL,
  "backupCodes" text NOT NULL,
  "userId" text NOT NULL UNIQUE REFERENCES public.ba_user(id) ON DELETE CASCADE,
  verified boolean DEFAULT true,
  "failedVerificationCount" integer DEFAULT 0,
  "lockedUntil" timestamptz
);
--> statement-breakpoint
CREATE TABLE public.passkey (
  id text PRIMARY KEY,
  name text,
  "publicKey" text NOT NULL,
  "userId" text NOT NULL REFERENCES public.ba_user(id) ON DELETE CASCADE,
  "credentialID" text NOT NULL UNIQUE,
  counter integer NOT NULL,
  "deviceType" text NOT NULL,
  "backedUp" boolean NOT NULL,
  transports text,
  "createdAt" timestamptz,
  aaguid text
);
--> statement-breakpoint
CREATE INDEX passkey_user_id_idx ON public.passkey("userId");
--> statement-breakpoint

CREATE TABLE public.jwks (
  id text PRIMARY KEY,
  "publicKey" text NOT NULL,
  "privateKey" text NOT NULL,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "expiresAt" timestamptz,
  alg text,
  crv text
);
--> statement-breakpoint
CREATE TABLE public.oauth_client (
  id text PRIMARY KEY,
  "clientId" text NOT NULL UNIQUE,
  "clientSecret" text,
  "clientDiscoveryId" text,
  disabled boolean,
  "skipConsent" boolean,
  "enableEndSession" boolean,
  "subjectType" text,
  scopes jsonb,
  "clientCredentialsScopes" jsonb,
  "userId" text REFERENCES public.ba_user(id) ON DELETE CASCADE,
  "createdAt" timestamptz,
  "updatedAt" timestamptz,
  name text,
  uri text,
  icon text,
  contacts jsonb,
  tos text,
  policy text,
  "softwareId" text,
  "softwareVersion" text,
  "softwareStatement" text,
  "redirectUris" jsonb NOT NULL,
  "postLogoutRedirectUris" jsonb,
  "backchannelLogoutUri" text,
  "backchannelLogoutSessionRequired" boolean,
  "tokenEndpointAuthMethod" text,
  "applicationType" text,
  jwks text,
  "jwksUri" text,
  "grantTypes" jsonb,
  "responseTypes" jsonb,
  "requirePKCE" boolean,
  "dpopBoundAccessTokens" boolean,
  "referenceId" text,
  metadata jsonb
);
--> statement-breakpoint
CREATE INDEX oauth_client_user_id_idx ON public.oauth_client("userId");
--> statement-breakpoint

CREATE TABLE public.oauth_resource (
  id text PRIMARY KEY,
  identifier text NOT NULL UNIQUE,
  name text NOT NULL,
  "accessTokenTtl" integer,
  "refreshTokenTtl" integer,
  "signingAlgorithm" text,
  "signingKeyId" text,
  "allowedScopes" jsonb,
  "customClaims" jsonb,
  "dpopBoundAccessTokensRequired" boolean,
  disabled boolean,
  "createdAt" timestamptz,
  "updatedAt" timestamptz,
  "policyVersion" integer,
  metadata jsonb
);
--> statement-breakpoint
CREATE TABLE public.oauth_client_resource (
  id text PRIMARY KEY,
  "clientId" text NOT NULL REFERENCES public.oauth_client("clientId") ON DELETE CASCADE,
  "resourceId" text NOT NULL REFERENCES public.oauth_resource(identifier) ON DELETE CASCADE,
  metadata jsonb,
  "createdAt" timestamptz,
  CONSTRAINT oauth_client_resource_pair_unique UNIQUE("clientId", "resourceId")
);
--> statement-breakpoint
CREATE INDEX oauth_client_resource_resource_id_idx ON public.oauth_client_resource("resourceId");
--> statement-breakpoint

CREATE TABLE public.oauth_refresh_token (
  id text PRIMARY KEY,
  token text NOT NULL UNIQUE,
  "clientId" text NOT NULL REFERENCES public.oauth_client("clientId") ON DELETE CASCADE,
  "sessionId" text REFERENCES public.ba_session(id) ON DELETE SET NULL,
  "userId" text NOT NULL REFERENCES public.ba_user(id) ON DELETE CASCADE,
  "referenceId" text,
  "authorizationCodeId" text,
  resources jsonb,
  "requestedUserInfoClaims" jsonb,
  "expiresAt" timestamptz NOT NULL,
  "createdAt" timestamptz NOT NULL,
  revoked timestamptz,
  "rotatedAt" timestamptz,
  "rotationReplayResponse" text,
  "rotationReplayExpiresAt" timestamptz,
  "authTime" timestamptz,
  confirmation jsonb,
  scopes jsonb NOT NULL
);
--> statement-breakpoint
CREATE INDEX oauth_refresh_token_client_id_idx ON public.oauth_refresh_token("clientId");
--> statement-breakpoint
CREATE INDEX oauth_refresh_token_session_id_idx ON public.oauth_refresh_token("sessionId");
--> statement-breakpoint
CREATE INDEX oauth_refresh_token_user_id_idx ON public.oauth_refresh_token("userId");
--> statement-breakpoint
CREATE INDEX oauth_refresh_token_authorization_code_id_idx ON public.oauth_refresh_token("authorizationCodeId");
--> statement-breakpoint

CREATE TABLE public.oauth_access_token (
  id text PRIMARY KEY,
  token text NOT NULL UNIQUE,
  "clientId" text NOT NULL REFERENCES public.oauth_client("clientId") ON DELETE CASCADE,
  "sessionId" text REFERENCES public.ba_session(id) ON DELETE SET NULL,
  "userId" text REFERENCES public.ba_user(id) ON DELETE CASCADE,
  "referenceId" text,
  "authorizationCodeId" text,
  resources jsonb,
  "requestedUserInfoClaims" jsonb,
  "refreshId" text REFERENCES public.oauth_refresh_token(id) ON DELETE CASCADE,
  "expiresAt" timestamptz NOT NULL,
  "createdAt" timestamptz NOT NULL,
  revoked timestamptz,
  confirmation jsonb,
  scopes jsonb NOT NULL
);
--> statement-breakpoint
CREATE INDEX oauth_access_token_client_id_idx ON public.oauth_access_token("clientId");
--> statement-breakpoint
CREATE INDEX oauth_access_token_session_id_idx ON public.oauth_access_token("sessionId");
--> statement-breakpoint
CREATE INDEX oauth_access_token_user_id_idx ON public.oauth_access_token("userId");
--> statement-breakpoint
CREATE INDEX oauth_access_token_authorization_code_id_idx ON public.oauth_access_token("authorizationCodeId");
--> statement-breakpoint
CREATE INDEX oauth_access_token_refresh_id_idx ON public.oauth_access_token("refreshId");
--> statement-breakpoint

CREATE TABLE public.oauth_consent (
  id text PRIMARY KEY,
  "clientId" text NOT NULL REFERENCES public.oauth_client("clientId") ON DELETE CASCADE,
  "userId" text REFERENCES public.ba_user(id) ON DELETE CASCADE,
  "referenceId" text,
  resources jsonb,
  "requestedUserInfoClaims" jsonb,
  scopes jsonb NOT NULL,
  "createdAt" timestamptz NOT NULL,
  "updatedAt" timestamptz NOT NULL
);
--> statement-breakpoint
CREATE INDEX oauth_consent_client_id_idx ON public.oauth_consent("clientId");
--> statement-breakpoint
CREATE INDEX oauth_consent_user_id_idx ON public.oauth_consent("userId");
--> statement-breakpoint

CREATE TABLE public.oauth_client_assertion (
  id text PRIMARY KEY,
  "expiresAt" timestamptz NOT NULL
);
--> statement-breakpoint

GRANT ALL PRIVILEGES ON TABLE public.two_factor TO shenron;
--> statement-breakpoint
GRANT ALL PRIVILEGES ON TABLE public.passkey TO shenron;
--> statement-breakpoint
GRANT ALL PRIVILEGES ON TABLE public.jwks TO shenron;
--> statement-breakpoint
GRANT ALL PRIVILEGES ON TABLE public.oauth_client TO shenron;
--> statement-breakpoint
GRANT ALL PRIVILEGES ON TABLE public.oauth_resource TO shenron;
--> statement-breakpoint
GRANT ALL PRIVILEGES ON TABLE public.oauth_client_resource TO shenron;
--> statement-breakpoint
GRANT ALL PRIVILEGES ON TABLE public.oauth_refresh_token TO shenron;
--> statement-breakpoint
GRANT ALL PRIVILEGES ON TABLE public.oauth_access_token TO shenron;
--> statement-breakpoint
GRANT ALL PRIVILEGES ON TABLE public.oauth_consent TO shenron;
--> statement-breakpoint
GRANT ALL PRIVILEGES ON TABLE public.oauth_client_assertion TO shenron;
