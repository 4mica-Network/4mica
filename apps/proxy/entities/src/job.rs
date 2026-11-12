use sea_orm::entity::prelude::*;

/// An async provider job (e.g. a crawl), held to the credential that started it until it settles.
#[derive(Clone, Debug, PartialEq, DeriveEntityModel)]
#[sea_orm(table_name = "jobs")]
pub struct Model {
    #[sea_orm(primary_key, auto_increment = false, column_type = "Text")]
    pub provider: String,
    /// The provider's id for the job.
    #[sea_orm(primary_key, auto_increment = false, column_type = "Text")]
    pub job_id: String,
    /// The call that started the job; its cost becomes the job's final cost on settlement.
    #[sea_orm(column_type = "Text")]
    pub invocation_id: String,
    pub seller_id: i64,
    pub credential_id: i64,
    /// What the starting call charged, held until the job settles.
    pub reserved: i64,
    pub cost: Option<i64>,
    pub created_at: DateTimeWithTimeZone,
    pub settled_at: Option<DateTimeWithTimeZone>,
}

#[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
pub enum Relation {}

impl ActiveModelBehavior for ActiveModel {}
