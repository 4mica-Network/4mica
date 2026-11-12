use sea_orm::entity::prelude::*;

#[derive(Clone, Debug, PartialEq, DeriveEntityModel)]
#[sea_orm(table_name = "invocations")]
pub struct Model {
    #[sea_orm(primary_key, auto_increment = false, column_type = "Text")]
    pub id: String,
    pub seller_id: i64,
    #[sea_orm(column_type = "Text")]
    pub provider: String,
    #[sea_orm(column_type = "Text")]
    pub payer: String,
    #[sea_orm(column_type = "Text")]
    pub method: String,
    #[sea_orm(column_type = "Text")]
    pub path: String,
    pub status: InvocationStatus,
    pub credential_id: Option<i64>,
    pub upstream_status: Option<i32>,
    pub cost: Option<i64>,
    pub latency_ms: Option<i32>,
    pub created_at: DateTimeWithTimeZone,
    pub finished_at: Option<DateTimeWithTimeZone>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, EnumIter, DeriveActiveEnum)]
#[sea_orm(rs_type = "String", db_type = "Text")]
pub enum InvocationStatus {
    #[sea_orm(string_value = "received")]
    Received,
    /// Never sent to the provider.
    #[sea_orm(string_value = "rejected")]
    Rejected,
    #[sea_orm(string_value = "succeeded")]
    Succeeded,
    #[sea_orm(string_value = "failed")]
    Failed,
    /// Sent, but the outcome is not known (timeout or a cut-off response).
    #[sea_orm(string_value = "unknown")]
    Unknown,
}

#[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
pub enum Relation {
    #[sea_orm(
        belongs_to = "super::seller::Entity",
        from = "Column::SellerId",
        to = "super::seller::Column::Id",
        on_update = "Cascade",
        on_delete = "Restrict"
    )]
    Seller,
    #[sea_orm(
        belongs_to = "super::credential::Entity",
        from = "Column::CredentialId",
        to = "super::credential::Column::Id",
        on_update = "Cascade",
        on_delete = "Restrict"
    )]
    Credential,
}

impl Related<super::seller::Entity> for Entity {
    fn to() -> RelationDef {
        Relation::Seller.def()
    }
}

impl Related<super::credential::Entity> for Entity {
    fn to() -> RelationDef {
        Relation::Credential.def()
    }
}

impl ActiveModelBehavior for ActiveModel {}
