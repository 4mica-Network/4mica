use entities::{account, credential};
use sea_orm::sea_query::Expr;
use sea_orm::{ColumnTrait, ConnectionTrait, DbErr, EntityTrait, Order, QueryFilter, QueryOrder};

/// Enabled credentials of enabled accounts for `provider`, in random order to spread load.
pub async fn candidates<C: ConnectionTrait>(
    conn: &C,
    provider: &str,
) -> Result<Vec<(credential::Model, account::Model)>, DbErr> {
    let rows = credential::Entity::find()
        .find_also_related(account::Entity)
        .filter(credential::Column::Enabled.eq(true))
        .filter(account::Column::Provider.eq(provider))
        .filter(account::Column::Enabled.eq(true))
        .order_by(Expr::cust("random()"), Order::Asc)
        .all(conn)
        .await?;
    Ok(rows
        .into_iter()
        .filter_map(|(credential, account)| Some((credential, account?)))
        .collect())
}
