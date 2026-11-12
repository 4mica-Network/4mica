use entities::seller;
use sea_orm::{ColumnTrait, ConnectionTrait, DbErr, EntityTrait, QueryFilter};

pub async fn find_enabled_by_token_hash<C: ConnectionTrait>(
    conn: &C,
    token_hash: &str,
) -> Result<Option<seller::Model>, DbErr> {
    seller::Entity::find()
        .filter(seller::Column::TokenHash.eq(token_hash))
        .filter(seller::Column::Enabled.eq(true))
        .one(conn)
        .await
}
