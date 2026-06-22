// Referral program config ("Give $X, Get $X"). Pure + client-safe (the settings
// panel imports REFERRAL_REWARD_USD for display). See SPEC_AUDRIC_REFERRALS.md.

/** Credit (USD) granted to BOTH referrer and referee on a qualifying conversion. */
export const REFERRAL_REWARD_USD = 10;

/** A top-up of at least this much (USD) qualifies as a paid conversion. A Pro/Max
 *  subscription also qualifies regardless of amount. */
export const REFERRAL_TOPUP_FLOOR_USD = 5;

/** Max rewarded referrals per referrer per rolling 30 days (anti-abuse cap). */
export const REFERRER_CAP_30D = 50;

/** Cookie that carries a `?ref=<code>` from the landing link to signup. */
export const REFERRAL_COOKIE = "audric_ref";
