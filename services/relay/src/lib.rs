//! LyncZ Relay Service
//!
//! Backend service for LyncZ P2P fiat-crypto escrow:
//! - Event listener syncs blockchain → database
//! - Read-only APIs for orders and trades
//! - PDF upload and Axiom ZK proof generation
//! - Relayer submits proofs to blockchain
//! - Email notifications to accounts (wallet addresses)

pub mod config;
pub mod crypto;
pub mod db;
pub mod api;
pub mod auth;
pub mod blockchain;
pub mod axiom_prover;
pub mod email;

pub use config::Config;
pub use db::{Database, DbError, DbResult};
pub use api::{AppState, create_router};
pub use email::{EmailService, EmailEvent, EmailInfo};
// Build trigger: Sun Dec 28 13:40:12 PST 2025
