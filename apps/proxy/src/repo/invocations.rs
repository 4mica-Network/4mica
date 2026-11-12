use chrono::Utc;
use entities::invocation::{self, InvocationStatus};
use sea_orm::ActiveValue::{Set, Unchanged};
use sea_orm::sea_query::OnConflict;
use sea_orm::{ActiveModelTrait, ConnectionTrait, DbErr, EntityTrait};

pub struct NewInvocation<'a> {
    pub id: &'a str,
    pub seller_id: i64,
    pub provider: &'a str,
    pub payer: &'a str,
    pub method: &'a str,
    pub path: &'a str,
}

pub struct Outcome {
    pub status: InvocationStatus,
    pub credential_id: Option<i64>,
    pub upstream_status: Option<i32>,
    pub cost: Option<i64>,
    pub latency_ms: Option<i32>,
}

/// Returns false when the id was already used.
pub async fn start<C: ConnectionTrait>(conn: &C, new: NewInvocation<'_>) -> Result<bool, DbErr> {
    let model = invocation::ActiveModel {
        id: Set(new.id.to_owned()),
        seller_id: Set(new.seller_id),
        provider: Set(new.provider.to_owned()),
        payer: Set(new.payer.to_owned()),
        method: Set(new.method.to_owned()),
        path: Set(new.path.to_owned()),
        status: Set(InvocationStatus::Received),
        ..Default::default()
    };
    let inserted = invocation::Entity::insert(model)
        .on_conflict(
            OnConflict::column(invocation::Column::Id)
                .do_nothing()
                .to_owned(),
        )
        .exec_without_returning(conn)
        .await?;
    Ok(inserted == 1)
}

pub async fn finish<C: ConnectionTrait>(conn: &C, id: &str, outcome: Outcome) -> Result<(), DbErr> {
    invocation::ActiveModel {
        id: Unchanged(id.to_owned()),
        status: Set(outcome.status),
        credential_id: Set(outcome.credential_id),
        upstream_status: Set(outcome.upstream_status),
        cost: Set(outcome.cost),
        latency_ms: Set(outcome.latency_ms),
        finished_at: Set(Some(Utc::now().into())),
        ..Default::default()
    }
    .update(conn)
    .await?;
    Ok(())
}
