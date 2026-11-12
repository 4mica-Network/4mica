use entities::{account, credential};
use sea_orm::sea_query::Expr;
use sea_orm::{ColumnTrait, ConnectionTrait, DbErr, EntityTrait, Order, QueryFilter, QueryOrder};

/// Enabled credentials of enabled accounts for `provider`, in random order to spread load.
/// `only` narrows the result to one credential.
pub async fn candidates<C: ConnectionTrait>(
    conn: &C,
    provider: &str,
    only: Option<i64>,
) -> Result<Vec<(credential::Model, account::Model)>, DbErr> {
    let mut query = credential::Entity::find();
    if let Some(id) = only {
        query = query.filter(credential::Column::Id.eq(id));
    }
    let rows = query
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
