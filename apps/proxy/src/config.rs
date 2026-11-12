use envconfig::Envconfig;

#[derive(Debug, Envconfig)]
pub struct Config {
    #[envconfig(from = "HOST", default = "0.0.0.0")]
    pub host: String,
    #[envconfig(from = "PORT", default = "8080")]
    pub port: u16,
    #[envconfig(from = "DATABASE_URL")]
    pub database_url: String,
    #[envconfig(from = "VALKEY_URL")]
    pub valkey_url: String,
    #[envconfig(from = "PAYER_RATE_PER_MINUTE", default = "60")]
    pub payer_rate_per_minute: u32,
}
