use entities::{invocation, job};
use sea_orm::ActiveValue::Set;
use sea_orm::sea_query::Expr;
use sea_orm::{
    ColumnTrait, ConnectionTrait, DatabaseConnection, DbErr, EntityTrait, QueryFilter,
    TransactionTrait,
};

pub struct NewJob<'a> {
    pub provider: &'a str,
    pub job_id: &'a str,
    pub invocation_id: &'a str,
    pub seller_id: i64,
    pub credential_id: i64,
    pub reserved: u64,
}

pub async fn create<C: ConnectionTrait>(conn: &C, new: NewJob<'_>) -> Result<(), DbErr> {
    let model = job::ActiveModel {
        provider: Set(new.provider.to_owned()),
        job_id: Set(new.job_id.to_owned()),
        invocation_id: Set(new.invocation_id.to_owned()),
        seller_id: Set(new.seller_id),
        credential_id: Set(new.credential_id),
        reserved: Set(new.reserved as i64),
        ..Default::default()
    };
    job::Entity::insert(model)
        .exec_without_returning(conn)
        .await?;
    Ok(())
}

pub async fn find<C: ConnectionTrait>(
    conn: &C,
    provider: &str,
    job_id: &str,
) -> Result<Option<job::Model>, DbErr> {
    job::Entity::find_by_id((provider.to_owned(), job_id.to_owned()))
        .one(conn)
        .await
}

/// Records the job's final cost on it and on the call that started it. False when it had already settled.
pub async fn settle(conn: &DatabaseConnection, job: &job::Model, cost: u64) -> Result<bool, DbErr> {
    let txn = conn.begin().await?;
    let settled = job::Entity::update_many()
        .col_expr(job::Column::Cost, Expr::value(cost as i64))
        .col_expr(job::Column::SettledAt, Expr::current_timestamp())
        .filter(job::Column::Provider.eq(&job.provider))
        .filter(job::Column::JobId.eq(&job.job_id))
        .filter(job::Column::SettledAt.is_null())
        .exec(&txn)
        .await?
        .rows_affected
        == 1;
    if settled {
        invocation::Entity::update_many()
            .col_expr(invocation::Column::Cost, Expr::value(cost as i64))
            .filter(invocation::Column::Id.eq(&job.invocation_id))
            .exec(&txn)
            .await?;
    }
    txn.commit().await?;
    Ok(settled)
}
