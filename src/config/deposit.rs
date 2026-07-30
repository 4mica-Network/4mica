//! Deposit throttling knobs, read from the environment.
//!
//! Every value defaults to [`DepositLimits::default`], so a deployment that predates gas
//! sponsorship picks up protection without a config change. Overrides are validated here rather
//! than at the point of use: a limit that is wrong is only discovered under load, which is exactly
//! when it is most expensive to find out.

use std::str::FromStr;
use std::time::Duration;

use alloy::primitives::U256;
use anyhow::{Context, Result, bail};

use super::trimmed_env;
use crate::limits::DepositLimits;

pub(super) const ENV_DEPOSIT_MAX_IN_FLIGHT: &str = "X402_DEPOSIT_MAX_IN_FLIGHT";
pub(super) const ENV_DEPOSIT_PER_ADDRESS_LIMIT: &str = "X402_DEPOSIT_PER_ADDRESS_LIMIT";
pub(super) const ENV_DEPOSIT_GLOBAL_LIMIT: &str = "X402_DEPOSIT_GLOBAL_LIMIT";
pub(super) const ENV_DEPOSIT_WINDOW_SECS: &str = "X402_DEPOSIT_WINDOW_SECS";
pub(super) const ENV_DEPOSIT_MIN_RELAYER_BALANCE_WEI: &str = "X402_DEPOSIT_MIN_RELAYER_BALANCE_WEI";
pub(super) const ENV_DEPOSIT_MAX_GAS: &str = "X402_DEPOSIT_MAX_GAS";

/// Deposit throttling, defaulting to [`DepositLimits::default`] so an existing deployment picks up
/// protection without a config change.
pub(super) fn deposit_limits_from_env() -> Result<DepositLimits> {
    let defaults = DepositLimits::default();

    let max_in_flight = parse_env(ENV_DEPOSIT_MAX_IN_FLIGHT, defaults.max_in_flight)?;
    let per_address_limit = parse_env(ENV_DEPOSIT_PER_ADDRESS_LIMIT, defaults.per_address_limit)?;
    let global_limit = parse_env(ENV_DEPOSIT_GLOBAL_LIMIT, defaults.global_limit)?;
    let window_secs = parse_env(ENV_DEPOSIT_WINDOW_SECS, defaults.window.as_secs())?;
    let max_gas = parse_env(ENV_DEPOSIT_MAX_GAS, defaults.max_gas)?;

    // Zero would disable the limit entirely, which is never what someone setting it explicitly
    // means — they would unset the variable instead.
    for (key, value) in [
        (ENV_DEPOSIT_MAX_IN_FLIGHT, max_in_flight as u64),
        (ENV_DEPOSIT_PER_ADDRESS_LIMIT, per_address_limit as u64),
        (ENV_DEPOSIT_GLOBAL_LIMIT, global_limit as u64),
        (ENV_DEPOSIT_WINDOW_SECS, window_secs),
        (ENV_DEPOSIT_MAX_GAS, max_gas),
    ] {
        if value == 0 {
            bail!("{key} must be greater than zero; unset it to use the default");
        }
    }

    let min_relayer_balance_wei = match trimmed_env(ENV_DEPOSIT_MIN_RELAYER_BALANCE_WEI) {
        Some(raw) => U256::from_str(&raw)
            .with_context(|| format!("{ENV_DEPOSIT_MIN_RELAYER_BALANCE_WEI} must be a uint256"))?,
        None => defaults.min_relayer_balance_wei,
    };

    Ok(DepositLimits {
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

    const ALL: [&str; 6] = [
        ENV_DEPOSIT_MAX_IN_FLIGHT,
        ENV_DEPOSIT_PER_ADDRESS_LIMIT,
        ENV_DEPOSIT_GLOBAL_LIMIT,
        ENV_DEPOSIT_WINDOW_SECS,
        ENV_DEPOSIT_MIN_RELAYER_BALANCE_WEI,
        ENV_DEPOSIT_MAX_GAS,
    ];

    fn clear_deposit_env() {
        for key in ALL {
            unsafe { std::env::remove_var(key) };
        }
    }

    #[test]
    #[serial]
    fn defaults_apply_when_nothing_is_set() {
        clear_deposit_env();
        let limits = deposit_limits_from_env().expect("defaults are valid");
        assert_eq!(limits.max_in_flight, DepositLimits::default().max_in_flight);
        assert_eq!(limits.window, DepositLimits::default().window);
    }

    #[test]
    #[serial]
    fn an_override_replaces_only_that_value() {
        clear_deposit_env();
        unsafe { std::env::set_var(ENV_DEPOSIT_WINDOW_SECS, "90") };
        let limits = deposit_limits_from_env().expect("valid override");
        clear_deposit_env();

        assert_eq!(limits.window, Duration::from_secs(90));
        assert_eq!(
            limits.global_limit,
            DepositLimits::default().global_limit,
            "an unset knob must keep its default"
        );
    }

    /// Zero disables a limit outright. Nobody sets a throttle to zero meaning "no throttle" — they
    /// unset it — so this is far more likely a typo than an intent, and silently honouring it would
    /// remove a control the operator believes is on.
    #[test]
    #[serial]
    fn zero_is_rejected_rather_than_treated_as_unlimited() {
        for key in [
            ENV_DEPOSIT_MAX_IN_FLIGHT,
            ENV_DEPOSIT_PER_ADDRESS_LIMIT,
            ENV_DEPOSIT_GLOBAL_LIMIT,
            ENV_DEPOSIT_WINDOW_SECS,
            ENV_DEPOSIT_MAX_GAS,
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

    /// The balance floor is a `uint256` of wei, well past `u64`, so it is parsed as `U256` rather
    /// than through [`parse_env`].
    #[test]
    #[serial]
    fn min_relayer_balance_accepts_a_value_beyond_u64() {
        clear_deposit_env();
        let huge = "100000000000000000000000";
        unsafe { std::env::set_var(ENV_DEPOSIT_MIN_RELAYER_BALANCE_WEI, huge) };
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
        unsafe { std::env::set_var(ENV_DEPOSIT_MAX_GAS, "lots") };
        let err = deposit_limits_from_env().expect_err("non-numeric must be rejected");
        clear_deposit_env();

        assert!(
            err.to_string().contains(ENV_DEPOSIT_MAX_GAS),
            "the error must name the offending variable: {err}"
        );
    }
}
