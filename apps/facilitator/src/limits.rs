//! Rate limiting and concurrency control for sponsored actions.
//!
//! `/deposit` and `/withdraw` spend the relayer's ETH on behalf of an unauthenticated caller. The
//! signature binds who benefits, so nobody can *steal* anything — but nothing in the protocol stops
//! someone submitting a stream of legitimate, worthless requests and burning gas. These are the
//! controls that must live in-process because they depend on state only this service has: which
//! address a signature actually recovered to, how many submissions are in flight, and what the
//! relayer's balance is.
//!
//! One implementation, instantiated once per sponsored action. Separate instances rather than a
//! shared one so a burst of deposits cannot exhaust the budget a withdrawal needs — they cost
//! different amounts of gas and deserve different ceilings.
//!
//! Controls better handled upstream (an API gateway or WAF) are deliberately absent: IP-based
//! limiting, API keys, and TLS termination all belong to a layer that can see the real client.
//!
//! # Ordering
//!
//! The two tiers apply at different points, for different reasons:
//!
//! * **Global** limits run *before* verification. `from` is attacker-controlled at that stage, so
//!   the only meaningful defence is one that ignores claimed identity and just bounds volume.
//! * **Per-address** limits run *after* signature recovery, once `from` is proven. Applying them
//!   earlier would be trivially bypassed by varying `from` on every request.

use std::collections::{HashMap, HashSet, VecDeque};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex, PoisonError};
use std::time::{Duration, Instant};

use alloy::primitives::{Address, B256, U256};
use thiserror::Error;

/// Why the guard refused. Kept separate from the per-action error types so one guard can serve
/// several of them; each converts these into its own variants.
#[derive(Debug, Error)]
pub enum ThrottleError {
    #[error("too many requests; retry shortly")]
    RateLimited,
    #[error("address {address} has exceeded its rate limit; retry shortly")]
    AddressRateLimited { address: Address },
    #[error("too many requests in flight; retry shortly")]
    TooManyInFlight,
    #[error("this authorization is already being submitted")]
    DuplicateInFlight,
    #[error("relayer balance {balance} is at or below the configured floor {floor}")]
    RelayerBalanceTooLow { balance: U256, floor: U256 },
}

/// Tunables, all with defaults chosen to be permissive enough for normal use and tight enough that
/// a single misbehaving client cannot monopolise the relayer.
#[derive(Clone, Debug)]
pub struct SponsorLimits {
    /// Concurrent submissions across all callers. Bounds how much damage a burst can do before the
    /// rate limiter observes it.
    pub max_in_flight: usize,
    /// Submissions per verified address per [`window`](Self::window).
    pub per_address_limit: usize,
    /// Requests per window across all callers, applied pre-verification.
    pub global_limit: usize,
    pub window: Duration,
    /// Refuse to submit when the relayer's native balance is at or below this. Zero disables the
    /// check. Stops the relayer emitting transactions it cannot pay for.
    pub min_relayer_balance_wei: U256,
    /// Ceiling on distinct addresses tracked at once. Without it, spamming fresh `from` values
    /// would grow the rate-limit map unboundedly — a memory attack in place of a gas one.
    pub max_tracked_addresses: usize,
    /// Hard cap on gas for one sponsored transaction, used both as the pre-flight estimate ceiling
    /// and as the explicit limit on the broadcast transaction.
    ///
    /// Without it the asset decides what the action costs us: a hostile or merely expensive
    /// `receiveWithAuthorization` sets the bill. x402 names an unbounded gas limit as the
    /// "trap door" vector for draining a facilitator. Unused gas is refunded, so setting this at
    /// the ceiling costs nothing in the normal case and bounds the worst one.
    pub max_gas: u64,
}

impl Default for SponsorLimits {
    fn default() -> Self {
        Self {
            max_in_flight: 16,
            per_address_limit: 5,
            global_limit: 60,
            window: Duration::from_secs(60),
            min_relayer_balance_wei: U256::ZERO,
            max_tracked_addresses: 10_000,
            // Generous for an EIP-3009 deposit that also supplies into Aave (~250k observed),
            // tight enough that a pathological token is rejected rather than sponsored.
            max_gas: 600_000,
        }
    }
}

#[derive(Default)]
struct GuardState {
    /// Submission times per verified address, pruned to the window on access.
    per_address: HashMap<Address, VecDeque<Instant>>,
    /// Request times across all callers, pre-verification.
    global: VecDeque<Instant>,
    /// Authorizations currently being submitted, so the same one cannot be broadcast twice
    /// concurrently. The on-chain nonce guard catches sequential replays; this catches the race.
    in_flight: HashSet<(Address, B256)>,
    /// When `per_address` was last swept, so a full map does not re-scan on every request.
    last_sweep: Option<Instant>,
}

/// Running totals since process start. Griefing is only actionable if someone can see it, and
/// until now the service emitted no signal at all — a slow drain would have gone unnoticed.
#[derive(Debug, Default, Clone, Copy, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SponsorCounters {
    /// Transactions broadcast and mined successfully.
    pub sponsored: u64,
    /// Requests refused for any reason — bad signature, throttling, gas ceiling.
    pub rejected: u64,
    /// Subset of `rejected` refused by throttling specifically. A rising number here is the
    /// signature of an abuse attempt rather than a misconfigured client.
    pub throttled: u64,
}

pub struct SponsorGuard {
    limits: SponsorLimits,
    state: Mutex<GuardState>,
    sponsored: AtomicU64,
    rejected: AtomicU64,
    throttled: AtomicU64,
}

impl SponsorGuard {
    pub fn new(limits: SponsorLimits) -> Arc<Self> {
        Arc::new(Self {
            limits,
            state: Mutex::new(GuardState::default()),
            sponsored: AtomicU64::new(0),
            rejected: AtomicU64::new(0),
            throttled: AtomicU64::new(0),
        })
    }

    pub fn record_sponsored(&self) {
        self.sponsored.fetch_add(1, Ordering::Relaxed);
    }

    /// `throttled` marks a rejection that came from these limits rather than from the request
    /// itself. Passed in rather than inspected because the caller holds an action-specific error
    /// type, and only it can tell the two apart.
    pub fn record_rejected(&self, throttled: bool) {
        self.rejected.fetch_add(1, Ordering::Relaxed);
        if throttled {
            self.throttled.fetch_add(1, Ordering::Relaxed);
        }
    }

    pub fn counters(&self) -> SponsorCounters {
        SponsorCounters {
            sponsored: self.sponsored.load(Ordering::Relaxed),
            rejected: self.rejected.load(Ordering::Relaxed),
            throttled: self.throttled.load(Ordering::Relaxed),
        }
    }

    pub fn limits(&self) -> &SponsorLimits {
        &self.limits
    }

    /// Pre-verification admission check. Bounds total volume without trusting any field in the
    /// request, since none of them are proven yet.
    pub fn check_global(&self) -> Result<(), ThrottleError> {
        let now = Instant::now();
        let mut state = self.lock();

        prune(&mut state.global, now, self.limits.window);
        if state.global.len() >= self.limits.global_limit {
            return Err(ThrottleError::RateLimited);
        }
        state.global.push_back(now);
        Ok(())
    }

    /// Post-verification reservation, taken once `from` is known to have signed.
    ///
    /// The returned permit releases its in-flight slot on drop, so an early return or a panic in
    /// the submit path cannot leak capacity.
    pub fn reserve(
        self: &Arc<Self>,
        from: Address,
        nonce: B256,
    ) -> Result<SponsorPermit, ThrottleError> {
        let now = Instant::now();
        let mut state = self.lock();

        if state.in_flight.len() >= self.limits.max_in_flight {
            return Err(ThrottleError::TooManyInFlight);
        }
        if state.in_flight.contains(&(from, nonce)) {
            return Err(ThrottleError::DuplicateInFlight);
        }

        // Sweep before tracking a new address so the map holds only genuinely-active callers.
        // Rate-limited so address spam cannot make every request re-scan the whole map under the
        // lock — that would amplify exactly the attack the cap defends against.
        if state.per_address.len() >= self.limits.max_tracked_addresses
            && !state.per_address.contains_key(&from)
        {
            let window = self.limits.window;
            let due = state
                .last_sweep
                .is_none_or(|last| now.duration_since(last) >= window / 4);
            if due {
                state.last_sweep = Some(now);
                state.per_address.retain(|_, seen| {
                    prune(seen, now, window);
                    !seen.is_empty()
                });
            }
            // Still full: fail closed rather than grow without bound.
            if state.per_address.len() >= self.limits.max_tracked_addresses {
                return Err(ThrottleError::RateLimited);
            }
        }

        let seen = state.per_address.entry(from).or_default();
        prune(seen, now, self.limits.window);
        if seen.len() >= self.limits.per_address_limit {
            return Err(ThrottleError::AddressRateLimited { address: from });
        }
        seen.push_back(now);
        // Inserted last: every failure path above returns before reserving, so there is nothing to
        // roll back and no way to leak a slot.
        state.in_flight.insert((from, nonce));

        Ok(SponsorPermit {
            guard: Arc::clone(self),
            from,
            nonce,
        })
    }

    pub fn check_relayer_balance(&self, balance: U256) -> Result<(), ThrottleError> {
        if !self.limits.min_relayer_balance_wei.is_zero()
            && balance <= self.limits.min_relayer_balance_wei
        {
            return Err(ThrottleError::RelayerBalanceTooLow {
                balance,
                floor: self.limits.min_relayer_balance_wei,
            });
        }
        Ok(())
    }

    /// Recovers rather than panicking: the guarded state is only timestamps and an in-flight set,
    /// so a poisoned lock cannot mean a broken invariant — but refusing to take it would strand
    /// in-flight capacity forever and take `/deposit` down permanently.
    fn lock(&self) -> std::sync::MutexGuard<'_, GuardState> {
        self.state.lock().unwrap_or_else(PoisonError::into_inner)
    }

    fn release(&self, from: Address, nonce: B256) {
        self.lock().in_flight.remove(&(from, nonce));
    }

    #[cfg(test)]
    fn in_flight_len(&self) -> usize {
        self.lock().in_flight.len()
    }
}

/// Holds an in-flight slot for one authorization. Releasing on drop rather than at the end of the
/// submit path means a `?` return or a panic cannot strand capacity.
pub struct SponsorPermit {
    guard: Arc<SponsorGuard>,
    from: Address,
    nonce: B256,
}

impl std::fmt::Debug for SponsorPermit {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("SponsorPermit")
            .field("from", &self.from)
            .field("nonce", &self.nonce)
            .finish()
    }
}

impl Drop for SponsorPermit {
    fn drop(&mut self) {
        self.guard.release(self.from, self.nonce);
    }
}

fn prune(times: &mut VecDeque<Instant>, now: Instant, window: Duration) {
    while times
        .front()
        .is_some_and(|oldest| now.duration_since(*oldest) >= window)
    {
        times.pop_front();
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn addr(byte: u8) -> Address {
        Address::from_slice(&[byte; 20])
    }

    /// Deliberately roomy. Each test tightens the single limit it exercises, so a failure names
    /// the constraint that actually bound — the checks run in order, and a too-small unrelated
    /// limit would mask the one under test.
    fn limits() -> SponsorLimits {
        SponsorLimits {
            max_in_flight: 32,
            per_address_limit: 32,
            global_limit: 32,
            window: Duration::from_secs(60),
            min_relayer_balance_wei: U256::ZERO,
            max_tracked_addresses: 32,
            max_gas: 600_000,
        }
    }

    #[test]
    fn global_limit_bounds_requests_before_verification() {
        let guard = SponsorGuard::new(SponsorLimits {
            global_limit: 3,
            ..limits()
        });
        for _ in 0..3 {
            guard.check_global().expect("within limit");
        }
        let err = guard.check_global().expect_err("expected rate limit");
        assert!(matches!(err, ThrottleError::RateLimited));
    }

    #[test]
    fn per_address_limit_applies_to_a_verified_signer() {
        let guard = SponsorGuard::new(SponsorLimits {
            per_address_limit: 2,
            ..limits()
        });
        // Permits must outlive the loop, or dropping them would free the in-flight slots and the
        // per-address counter is what we mean to exercise.
        let _first = guard.reserve(addr(1), B256::repeat_byte(1)).expect("first");
        let _second = guard
            .reserve(addr(1), B256::repeat_byte(2))
            .expect("second");
        let err = guard
            .reserve(addr(1), B256::repeat_byte(3))
            .expect_err("expected per-address limit");
        assert!(matches!(err, ThrottleError::AddressRateLimited { .. }));
    }

    #[test]
    fn in_flight_slots_are_released_on_drop() {
        let guard = SponsorGuard::new(limits());
        {
            let _permit = guard
                .reserve(addr(1), B256::repeat_byte(1))
                .expect("permit");
            assert_eq!(guard.in_flight_len(), 1);
        }
        assert_eq!(guard.in_flight_len(), 0);
    }

    #[test]
    fn max_in_flight_bounds_concurrent_submissions() {
        let guard = SponsorGuard::new(SponsorLimits {
            max_in_flight: 2,
            ..limits()
        });
        let _a = guard.reserve(addr(1), B256::repeat_byte(1)).expect("a");
        let _b = guard.reserve(addr(2), B256::repeat_byte(2)).expect("b");
        let err = guard
            .reserve(addr(3), B256::repeat_byte(3))
            .expect_err("expected in-flight cap");
        assert!(matches!(err, ThrottleError::TooManyInFlight));
    }

    /// The on-chain nonce guard rejects a *sequential* replay; this covers the concurrent case,
    /// where both submissions would otherwise be broadcast and one would revert after paying gas.
    #[test]
    fn the_same_authorization_cannot_be_submitted_twice_concurrently() {
        let guard = SponsorGuard::new(limits());
        let _first = guard.reserve(addr(1), B256::repeat_byte(9)).expect("first");
        let err = guard
            .reserve(addr(1), B256::repeat_byte(9))
            .expect_err("expected duplicate rejection");
        assert!(matches!(err, ThrottleError::DuplicateInFlight));
    }

    /// A rejected reservation must not consume the slot it was denied.
    #[test]
    fn a_denied_reservation_leaves_no_in_flight_slot_behind() {
        let guard = SponsorGuard::new(SponsorLimits {
            per_address_limit: 2,
            ..limits()
        });
        let _a = guard.reserve(addr(1), B256::repeat_byte(1)).expect("a");
        let _b = guard.reserve(addr(1), B256::repeat_byte(2)).expect("b");
        assert_eq!(guard.in_flight_len(), 2);

        guard
            .reserve(addr(1), B256::repeat_byte(3))
            .expect_err("per-address limit");
        assert_eq!(
            guard.in_flight_len(),
            2,
            "a denied reservation must release the slot it speculatively took"
        );
    }

    /// Spamming fresh addresses must not grow the tracking map without bound.
    #[test]
    fn tracked_addresses_are_capped() {
        let guard = SponsorGuard::new(SponsorLimits {
            max_tracked_addresses: 2,
            ..limits()
        });
        let _a = guard.reserve(addr(1), B256::repeat_byte(1)).expect("a");
        let _b = guard.reserve(addr(2), B256::repeat_byte(2)).expect("b");
        // A third distinct address exceeds the cap. The sweep frees nothing because both entries
        // are inside the window, so it fails closed rather than growing the map.
        let err = guard
            .reserve(addr(3), B256::repeat_byte(3))
            .expect_err("expected rejection");
        assert!(matches!(err, ThrottleError::RateLimited));
    }

    #[test]
    fn relayer_balance_floor_is_enforced_when_set() {
        let guard = SponsorGuard::new(SponsorLimits {
            min_relayer_balance_wei: U256::from(1_000u64),
            ..limits()
        });

        guard
            .check_relayer_balance(U256::from(1_001u64))
            .expect("above floor");
        let err = guard
            .check_relayer_balance(U256::from(1_000u64))
            .expect_err("at floor is not above it");
        assert!(matches!(err, ThrottleError::RelayerBalanceTooLow { .. }));
    }

    #[test]
    fn relayer_balance_floor_is_disabled_by_default() {
        let guard = SponsorGuard::new(limits());
        guard
            .check_relayer_balance(U256::ZERO)
            .expect("zero floor disables the check");
    }
}
