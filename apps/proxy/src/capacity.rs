use std::time::Duration;

use chrono::{DateTime, Utc};
use redis::Script;
use redis::aio::ConnectionManager;

use entities::account;

use crate::providers::Route;

#[derive(Debug, PartialEq)]
pub enum Check {
    Cooldown {
        key: String,
    },
    Rate {
        key: String,
        max: u32,
        window_ms: u64,
    },
    Quota {
        key: String,
        max: u64,
        cost: u64,
    },
    Concurrency {
        key: String,
        max: u32,
        ttl_ms: u64,
    },
}

pub struct Lease {
    id: String,
    concurrency: Vec<String>,
    quota: Option<(String, u64)>,
}

#[derive(Clone)]
pub struct Capacity {
    conn: ConnectionManager,
    acquire: Script,
}

pub fn payer_check(provider: &str, payer: &str, per_minute: u32, now: DateTime<Utc>) -> Check {
    let minute = now.timestamp_millis() / 60_000;
    Check::Rate {
        key: format!("proxy:payer:{provider}:{payer}:{minute}"),
        max: per_minute,
        window_ms: 60_000,
    }
}

pub fn credential_checks(
    credential_id: i64,
    account: &account::Model,
    route: &Route,
    now: DateTime<Utc>,
) -> Vec<Check> {
    let limits = &account.limits;
    let account = account.id;
    let mut checks = vec![Check::Cooldown {
        key: cooldown_key(credential_id),
    }];

    if let Some(rate) = limits.rates.get(route.bucket) {
        let window_ms = rate.per_secs * 1000;
        let window = now.timestamp_millis() as u64 / window_ms;
        checks.push(Check::Rate {
            key: format!("proxy:rate:{account}:{}:{window}", route.bucket),
            max: rate.max,
            window_ms,
        });
    }
    if let Some(&max) = route.class.and_then(|c| limits.concurrency.get(c)) {
        checks.push(Check::Concurrency {
            key: format!("proxy:conc:{account}:{}", route.class.unwrap_or_default()),
            max,
            ttl_ms: (route.timeout + Duration::from_secs(5)).as_millis() as u64,
        });
    }
    if let Some(max) = limits.monthly_quota {
        // shortcut: calendar month in UTC, not the provider's billing cycle; add an anchor day to accounts when they diverge.
        checks.push(Check::Quota {
            key: format!("proxy:quota:{account}:{}", now.format("%Y-%m")),
            max,
            cost: route.cost,
        });
    }
    checks
}

fn cooldown_key(credential_id: i64) -> String {
    format!("proxy:cooldown:{credential_id}")
}

impl Capacity {
    pub async fn connect(url: &str) -> redis::RedisResult<Self> {
        let conn = ConnectionManager::new(redis::Client::open(url)?).await?;
        Ok(Self {
            conn,
            acquire: Script::new(include_str!("capacity.lua")),
        })
    }

    /// Applies every check atomically, or none. `Err(i)` is the index of the first check that failed.
    pub async fn acquire(
        &self,
        checks: &[Check],
        lease_id: &str,
        now: DateTime<Utc>,
    ) -> redis::RedisResult<Result<Lease, usize>> {
        let mut invocation = self.acquire.prepare_invoke();
        invocation.arg(now.timestamp_millis()).arg(lease_id);
        for check in checks {
            let (key, kind, a, b) = match check {
                Check::Cooldown { key } => (key, "cooldown", 0, 0),
                Check::Rate {
                    key,
                    max,
                    window_ms,
                } => (key, "rate", *max as u64, *window_ms),
                Check::Quota { key, max, cost } => (key, "quota", *max, *cost),
                Check::Concurrency { key, max, ttl_ms } => {
                    (key, "concurrency", *max as u64, *ttl_ms)
                }
            };
            invocation.key(key).arg(kind).arg(a).arg(b);
        }

        let failed: usize = invocation.invoke_async(&mut self.conn.clone()).await?;
        if failed > 0 {
            return Ok(Err(failed - 1));
        }
        Ok(Ok(Lease {
            id: lease_id.to_owned(),
            concurrency: checks
                .iter()
                .filter_map(|c| match c {
                    Check::Concurrency { key, .. } => Some(key.clone()),
                    _ => None,
                })
                .collect(),
            quota: checks.iter().find_map(|c| match c {
                Check::Quota { key, cost, .. } => Some((key.clone(), *cost)),
                _ => None,
            }),
        }))
    }

    /// Frees the lease's concurrency slots and corrects the quota from the reserved to the actual cost.
    pub async fn release(&self, lease: Lease, actual_cost: u64) -> redis::RedisResult<()> {
        let mut pipe = redis::pipe();
        for key in &lease.concurrency {
            pipe.zrem(key, &lease.id).ignore();
        }
        if let Some((key, reserved)) = &lease.quota
            && actual_cost != *reserved
        {
            pipe.incr(key, actual_cost as i64 - *reserved as i64)
                .ignore();
        }
        pipe.query_async(&mut self.conn.clone()).await
    }

    pub async fn cool_down(&self, credential_id: i64, for_: Duration) -> redis::RedisResult<()> {
        redis::cmd("SET")
            .arg(cooldown_key(credential_id))
            .arg(1)
            .arg("EX")
            .arg(for_.as_secs().max(1))
            .query_async(&mut self.conn.clone())
            .await
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use entities::account::{Limits, Rate};

    fn route() -> Route {
        Route {
            bucket: "scrape",
            class: Some("browser"),
            cost: 5,
            timeout: Duration::from_secs(30),
        }
    }

    fn account(limits: Limits) -> account::Model {
        account::Model {
            id: 3,
            provider: "p".into(),
            name: "a".into(),
            limits,
            enabled: true,
            created_at: Utc::now().into(),
        }
    }

    #[test]
    fn unconfigured_account_only_checks_cooldown() {
        let now = Utc::now();
        assert_eq!(
            credential_checks(7, &account(Limits::default()), &route(), now),
            vec![Check::Cooldown {
                key: "proxy:cooldown:7".into()
            }]
        );
    }

    #[test]
    fn configured_account_checks_every_limit() {
        let now = DateTime::parse_from_rfc3339("2026-11-12T10:00:30Z")
            .unwrap()
            .to_utc();
        let limits = Limits {
            rates: [(
                "scrape".into(),
                Rate {
                    max: 500,
                    per_secs: 60,
                },
            )]
            .into(),
            concurrency: [("browser".into(), 25)].into(),
            monthly_quota: Some(100_000),
        };
        let window = now.timestamp_millis() / 60_000;
        assert_eq!(
            credential_checks(7, &account(limits), &route(), now),
            vec![
                Check::Cooldown {
                    key: "proxy:cooldown:7".into()
                },
                Check::Rate {
                    key: format!("proxy:rate:3:scrape:{window}"),
                    max: 500,
                    window_ms: 60_000
                },
                Check::Concurrency {
                    key: "proxy:conc:3:browser".into(),
                    max: 25,
                    ttl_ms: 35_000
                },
                Check::Quota {
                    key: "proxy:quota:3:2026-11".into(),
                    max: 100_000,
                    cost: 5
                },
            ]
        );
    }
}
