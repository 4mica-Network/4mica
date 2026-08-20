//! Throttling knobs for sponsored actions, read from the environment.
//!
//! Each action gets its own set under its own prefix (`X402_DEPOSIT_*`, `X402_WITHDRAW_*`,
//! `X402_CLAIM_*`), so a
//! burst of one cannot exhaust the budget the other needs — they cost different amounts of gas and
//! deserve different ceilings. Every value defaults to [`SponsorLimits::default`], so a deployment
//! that predates gas sponsorship picks up protection without a config change.
//!
//! Overrides are validated here rather than at the point of use: a limit that is wrong is only
//! discovered under load, which is exactly when it is most expensive to find out.

use std::str::FromStr;
use std::time::Duration;

use alloy::primitives::U256;
use anyhow::{Context, Result, bail};

use super::trimmed_env;
use crate::limits::SponsorLimits;

pub(super) const DEPOSIT_PREFIX: &str = "X402_DEPOSIT";
pub(super) const WITHDRAW_PREFIX: &str = "X402_WITHDRAW";
pub(super) const CLAIM_PREFIX: &str = "X402_CLAIM";
pub(super) const PAY_PREFIX: &str = "X402_PAY";

/// Env var names for one action's knobs. Built from a prefix so a new sponsored action needs a
/// constant rather than six.
struct EnvKeys {
    max_in_flight: String,
    per_address_limit: String,
    global_limit: String,
    window_secs: String,
    min_relayer_balance_wei: String,
    max_gas: String,
}

impl EnvKeys {
    fn new(prefix: &str) -> Self {
        Self {
            max_in_flight: format!("{prefix}_MAX_IN_FLIGHT"),
            per_address_limit: format!("{prefix}_PER_ADDRESS_LIMIT"),
            global_limit: format!("{prefix}_GLOBAL_LIMIT"),
            window_secs: format!("{prefix}_WINDOW_SECS"),
            min_relayer_balance_wei: format!("{prefix}_MIN_RELAYER_BALANCE_WEI"),
            max_gas: format!("{prefix}_MAX_GAS"),
        }
    }
}

/// Throttling for one sponsored action, defaulting to [`SponsorLimits::default`] so an existing
/// deployment picks up protection without a config change.
pub(super) fn sponsor_limits_from_env(prefix: &str) -> Result<SponsorLimits> {
    let keys = EnvKeys::new(prefix);
    let defaults = SponsorLimits::default();

    let max_in_flight = parse_env(&keys.max_in_flight, defaults.max_in_flight)?;
    let per_address_limit = parse_env(&keys.per_address_limit, defaults.per_address_limit)?;
    let global_limit = parse_env(&keys.global_limit, defaults.global_limit)?;
    let window_secs = parse_env(&keys.window_secs, defaults.window.as_secs())?;
    let max_gas = parse_env(&keys.max_gas, defaults.max_gas)?;

    // Zero would disable the limit entirely, which is never what someone setting it explicitly
    // means — they would unset the variable instead.
    for (key, value) in [
        (&keys.max_in_flight, max_in_flight as u64),
        (&keys.per_address_limit, per_address_limit as u64),
        (&keys.global_limit, global_limit as u64),
        (&keys.window_secs, window_secs),
        (&keys.max_gas, max_gas),
    ] {
        if value == 0 {
            bail!("{key} must be greater than zero; unset it to use the default");
        }
    }

    let min_relayer_balance_wei = match trimmed_env(&keys.min_relayer_balance_wei) {
        Some(raw) => U256::from_str(&raw)
            .with_context(|| format!("{} must be a uint256", keys.min_relayer_balance_wei))?,
        None => defaults.min_relayer_balance_wei,
    };

    Ok(SponsorLimits {
        max_in_flight,
        per_address_limit,
        global_limit,
        window: Duration::from_secs(window_secs),
        min_relayer_balance_wei,
        max_gas,
        ..defaults
    })
}

fn parse_env<T>(key: &str, default: T) -> Result<T>
where
    T: FromStr,
    T::Err: std::error::Error + Send + Sync + 'static,
{
    match trimmed_env(key) {
        Some(raw) => raw
            .parse::<T>()
            .with_context(|| format!("{key} must be a non-negative integer")),
        None => Ok(default),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serial_test::serial;

    fn all_keys(prefix: &str) -> [String; 6] {
        let keys = EnvKeys::new(prefix);
        [
            keys.max_in_flight,
            keys.per_address_limit,
            keys.global_limit,
            keys.window_secs,
            keys.min_relayer_balance_wei,
            keys.max_gas,
        ]
    }

    fn clear_deposit_env() {
        for prefix in [DEPOSIT_PREFIX, WITHDRAW_PREFIX] {
            for key in all_keys(prefix) {
                unsafe { std::env::remove_var(&key) };
            }
        }
    }

    fn deposit_limits_from_env() -> Result<SponsorLimits> {
        sponsor_limits_from_env(DEPOSIT_PREFIX)
    }

    #[test]
    #[serial]
    fn defaults_apply_when_nothing_is_set() {
        clear_deposit_env();
        let limits = deposit_limits_from_env().expect("defaults are valid");
        assert_eq!(limits.max_in_flight, SponsorLimits::default().max_in_flight);
        assert_eq!(limits.window, SponsorLimits::default().window);
    }

    #[test]
    #[serial]
    fn an_override_replaces_only_that_value() {
        clear_deposit_env();
        unsafe { std::env::set_var(EnvKeys::new(DEPOSIT_PREFIX).window_secs, "90") };
        let limits = deposit_limits_from_env().expect("valid override");
        clear_deposit_env();

        assert_eq!(limits.window, Duration::from_secs(90));
        assert_eq!(
            limits.global_limit,
            SponsorLimits::default().global_limit,
            "an unset knob must keep its default"
        );
    }

    /// Zero disables a limit outright. Nobody sets a throttle to zero meaning "no throttle" — they
    /// unset it — so this is far more likely a typo than an intent, and silently honouring it would
    /// remove a control the operator believes is on.
    #[test]
    #[serial]
    fn zero_is_rejected_rather_than_treated_as_unlimited() {
        let keys = EnvKeys::new(DEPOSIT_PREFIX);
        for key in [
            &keys.max_in_flight,
            &keys.per_address_limit,
            &keys.global_limit,
            &keys.window_secs,
            &keys.max_gas,
        ] {
            clear_deposit_env();
            unsafe { std::env::set_var(key, "0") };
            let err = deposit_limits_from_env().expect_err("zero must be rejected");
            clear_deposit_env();
            assert!(
                err.to_string().contains(key) && err.to_string().contains("greater than zero"),
                "unexpected error for {key}: {err}"
            );
        }
    }

    /// The two actions read different variables, so tuning one must not move the other.
    #[test]
    #[serial]
    fn the_prefixes_are_independent() {
        clear_deposit_env();
        unsafe { std::env::set_var(EnvKeys::new(WITHDRAW_PREFIX).max_gas, "900000") };
        let withdraw = sponsor_limits_from_env(WITHDRAW_PREFIX).expect("valid override");
        let deposit = sponsor_limits_from_env(DEPOSIT_PREFIX).expect("defaults");
        clear_deposit_env();

        assert_eq!(withdraw.max_gas, 900_000);
        assert_eq!(deposit.max_gas, SponsorLimits::default().max_gas);
    }

    /// The balance floor is a `uint256` of wei, well past `u64`, so it is parsed as `U256` rather
    /// than through [`parse_env`].
    #[test]
    #[serial]
    fn min_relayer_balance_accepts_a_value_beyond_u64() {
        clear_deposit_env();
        let huge = "100000000000000000000000";
        unsafe { std::env::set_var(EnvKeys::new(DEPOSIT_PREFIX).min_relayer_balance_wei, huge) };
        let limits = deposit_limits_from_env().expect("valid uint256");
        clear_deposit_env();

        assert_eq!(
            limits.min_relayer_balance_wei,
            U256::from_str(huge).unwrap()
        );
    }

    #[test]
    #[serial]
    fn a_non_numeric_override_names_the_variable_it_came_from() {
        clear_deposit_env();
        let max_gas = EnvKeys::new(DEPOSIT_PREFIX).max_gas;
        unsafe { std::env::set_var(&max_gas, "lots") };
        let err = deposit_limits_from_env().expect_err("non-numeric must be rejected");
        clear_deposit_env();

        assert!(
            err.to_string().contains(&max_gas),
            "the error must name the offending variable: {err}"
        );
    }
}
