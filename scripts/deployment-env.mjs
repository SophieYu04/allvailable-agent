const credentialName = /(?:^|_)(?:API_?KEY|KEY|TOKEN|SECRET|PASSWORD|CREDENTIALS?|PRIVATE_?KEY|COOKIE|AUTH)(?:_|$)/i;
const publicBuildNames = ['NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'NEXT_PUBLIC_SUPABASE_ANON_KEY'];

/** Keep normal CLI settings while preventing credentials from entering Wrangler's process env. */
export function deploymentEnvironment(environment) {
  return Object.fromEntries(Object.entries(environment).filter(([key]) => !credentialName.test(key)));
}

/** Build-time browser config is public; all server/provider credentials stay out of the build process. */
export function buildEnvironment(environment) {
  const result = deploymentEnvironment(environment);
  for (const key of publicBuildNames) if (environment[key]) result[key] = environment[key];
  return result;
}
