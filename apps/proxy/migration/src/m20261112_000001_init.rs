use sea_orm_migration::prelude::*;

#[derive(DeriveMigrationName)]
pub struct Migration;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .create_table(
                Table::create()
                    .table(Sellers::Table)
                    .col(id(Sellers::Id))
                    .col(ColumnDef::new(Sellers::Name).text().not_null().unique_key())
                    .col(
                        ColumnDef::new(Sellers::TokenHash)
                            .text()
                            .not_null()
                            .unique_key(),
                    )
                    .col(enabled(Sellers::Enabled))
                    .col(created_at(Sellers::CreatedAt))
                    .to_owned(),
            )
            .await?;

        manager
            .create_table(
                Table::create()
                    .table(Accounts::Table)
                    .col(id(Accounts::Id))
                    .col(ColumnDef::new(Accounts::Provider).text().not_null())
                    .col(ColumnDef::new(Accounts::Name).text().not_null())
                    .col(
                        ColumnDef::new(Accounts::Limits)
                            .json_binary()
                            .not_null()
                            .default(Expr::cust("'{}'::jsonb")),
                    )
                    .col(enabled(Accounts::Enabled))
                    .col(created_at(Accounts::CreatedAt))
                    .index(
                        Index::create()
                            .name("accounts_provider_name_key")
                            .col(Accounts::Provider)
                            .col(Accounts::Name)
                            .unique(),
                    )
                    .to_owned(),
            )
            .await?;

        manager
            .create_table(
                Table::create()
                    .table(Credentials::Table)
                    .col(id(Credentials::Id))
                    .col(
                        ColumnDef::new(Credentials::AccountId)
                            .big_integer()
                            .not_null(),
                    )
                    .col(ColumnDef::new(Credentials::KeyEnv).text().not_null())
                    .col(enabled(Credentials::Enabled))
                    .col(created_at(Credentials::CreatedAt))
                    .foreign_key(
                        ForeignKey::create()
                            .from(Credentials::Table, Credentials::AccountId)
                            .to(Accounts::Table, Accounts::Id),
                    )
                    .to_owned(),
            )
            .await?;

        manager
            .create_table(
                Table::create()
                    .table(Invocations::Table)
                    .col(
                        ColumnDef::new(Invocations::Id)
                            .text()
                            .not_null()
                            .primary_key(),
                    )
                    .col(
                        ColumnDef::new(Invocations::SellerId)
                            .big_integer()
                            .not_null(),
                    )
                    .col(ColumnDef::new(Invocations::Provider).text().not_null())
                    .col(ColumnDef::new(Invocations::Payer).text().not_null())
                    .col(ColumnDef::new(Invocations::Method).text().not_null())
                    .col(ColumnDef::new(Invocations::Path).text().not_null())
                    .col(ColumnDef::new(Invocations::Status).text().not_null())
                    .col(
                        ColumnDef::new(Invocations::CredentialId)
                            .big_integer()
                            .null(),
                    )
                    .col(ColumnDef::new(Invocations::UpstreamStatus).integer().null())
                    .col(ColumnDef::new(Invocations::Cost).big_integer().null())
                    .col(ColumnDef::new(Invocations::LatencyMs).integer().null())
                    .col(created_at(Invocations::CreatedAt))
                    .col(
                        ColumnDef::new(Invocations::FinishedAt)
                            .timestamp_with_time_zone()
                            .null(),
                    )
                    .foreign_key(
                        ForeignKey::create()
                            .from(Invocations::Table, Invocations::SellerId)
                            .to(Sellers::Table, Sellers::Id),
                    )
                    .foreign_key(
                        ForeignKey::create()
                            .from(Invocations::Table, Invocations::CredentialId)
                            .to(Credentials::Table, Credentials::Id),
                    )
                    .to_owned(),
            )
            .await?;

        manager
            .create_index(
                Index::create()
                    .name("invocations_payer_created_at_idx")
                    .table(Invocations::Table)
                    .col(Invocations::Payer)
                    .col(Invocations::CreatedAt)
                    .to_owned(),
            )
            .await?;

        manager
            .create_table(
                Table::create()
                    .table(Jobs::Table)
                    .col(ColumnDef::new(Jobs::Provider).text().not_null())
                    .col(ColumnDef::new(Jobs::JobId).text().not_null())
                    .col(ColumnDef::new(Jobs::InvocationId).text().not_null())
                    .col(ColumnDef::new(Jobs::SellerId).big_integer().not_null())
                    .col(ColumnDef::new(Jobs::CredentialId).big_integer().not_null())
                    .col(ColumnDef::new(Jobs::Reserved).big_integer().not_null())
                    .col(ColumnDef::new(Jobs::Cost).big_integer().null())
                    .col(created_at(Jobs::CreatedAt))
                    .col(
                        ColumnDef::new(Jobs::SettledAt)
                            .timestamp_with_time_zone()
                            .null(),
                    )
                    .primary_key(Index::create().col(Jobs::Provider).col(Jobs::JobId))
                    .foreign_key(
                        ForeignKey::create()
                            .from(Jobs::Table, Jobs::InvocationId)
                            .to(Invocations::Table, Invocations::Id),
                    )
                    .foreign_key(
                        ForeignKey::create()
                            .from(Jobs::Table, Jobs::SellerId)
                            .to(Sellers::Table, Sellers::Id),
                    )
                    .foreign_key(
                        ForeignKey::create()
                            .from(Jobs::Table, Jobs::CredentialId)
                            .to(Credentials::Table, Credentials::Id),
                    )
                    .to_owned(),
            )
            .await
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        for table in [
            Jobs::Table.into_iden(),
            Invocations::Table.into_iden(),
            Credentials::Table.into_iden(),
            Accounts::Table.into_iden(),
            Sellers::Table.into_iden(),
        ] {
            manager
                .drop_table(Table::drop().table(table).to_owned())
                .await?;
        }
        Ok(())
    }
}

fn id<T: IntoIden>(col: T) -> ColumnDef {
    ColumnDef::new(col)
        .big_integer()
        .not_null()
        .auto_increment()
        .primary_key()
        .to_owned()
}

fn enabled<T: IntoIden>(col: T) -> ColumnDef {
    ColumnDef::new(col)
        .boolean()
        .not_null()
        .default(true)
        .to_owned()
}

fn created_at<T: IntoIden>(col: T) -> ColumnDef {
    ColumnDef::new(col)
        .timestamp_with_time_zone()
        .not_null()
        .default(Expr::current_timestamp())
        .to_owned()
}

#[derive(DeriveIden)]
enum Sellers {
    Table,
    Id,
    Name,
    TokenHash,
    Enabled,
    CreatedAt,
}

#[derive(DeriveIden)]
enum Accounts {
    Table,
    Id,
    Provider,
    Name,
    Limits,
    Enabled,
    CreatedAt,
}

#[derive(DeriveIden)]
enum Credentials {
    Table,
    Id,
    AccountId,
    KeyEnv,
    Enabled,
    CreatedAt,
}

#[derive(DeriveIden)]
enum Invocations {
    Table,
    Id,
    SellerId,
    Provider,
    Payer,
    Method,
    Path,
    Status,
    CredentialId,
    UpstreamStatus,
    Cost,
    LatencyMs,
    CreatedAt,
    FinishedAt,
}

#[derive(DeriveIden)]
enum Jobs {
    Table,
    Provider,
    JobId,
    InvocationId,
    SellerId,
    CredentialId,
    Reserved,
    Cost,
    CreatedAt,
    SettledAt,
}
