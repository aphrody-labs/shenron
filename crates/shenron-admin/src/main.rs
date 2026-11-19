use std::net::SocketAddr;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    rustls::crypto::ring::default_provider().install_default().ok();
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| tracing_subscriber::EnvFilter::new("info")),
        )
        .init();
    let bind: SocketAddr =
        std::env::var("SHENRON_ADMIN_BIND").unwrap_or_else(|_| "127.0.0.1:5020".into()).parse()?;
    let state = shenron_admin::build_state(shenron_admin::Config::from_env())?;
    let listener = tokio::net::TcpListener::bind(bind).await?;
    tracing::info!(%bind, "shenron-admin listening");
    axum::serve(listener, shenron_admin::router(state))
        .with_graceful_shutdown(shutdown_signal())
        .await?;
    Ok(())
}

async fn shutdown_signal() {
    #[cfg(unix)]
    {
        use tokio::signal::unix::{SignalKind, signal};
        let mut term = signal(SignalKind::terminate()).expect("SIGTERM handler");
        tokio::select! {
            _ = tokio::signal::ctrl_c() => {}
            _ = term.recv() => {}
        }
    }
    #[cfg(not(unix))]
    let _ = tokio::signal::ctrl_c().await;
}
