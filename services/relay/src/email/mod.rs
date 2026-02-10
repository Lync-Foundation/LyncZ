//! Email notification service using Resend API
//! 
//! Sends notifications to accounts (wallet addresses) in their preferred language.
//! Account-based, not role-based - any wallet can be both buyer and seller.

use reqwest::Client;
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tracing::{info, error};

mod templates;
pub use templates::*;

/// Email event types - covers all notification scenarios
#[derive(Debug, Clone, Copy)]
pub enum EmailEvent {
    /// Seller created a new sell order (includes private code if private)
    OrderCreated,
    /// Seller withdrew tokens from their order
    OrderWithdrawn,
    /// Seller updated order info (exchange rate or payment info)
    OrderUpdated,
    /// Someone bought from seller's order (email to seller)
    TradeCreatedSeller,
    /// Buyer initiated a purchase (email to buyer)
    TradeCreatedBuyer,
    /// Trade settled - payment verified (email to seller)
    TradeSettledSeller,
    /// Trade settled - purchase complete (email to buyer)
    TradeSettledBuyer,
    /// Trade expired (email to seller)
    TradeExpiredSeller,
    /// Trade expired (email to buyer)
    TradeExpiredBuyer,
}

/// Email info variants for different event types
#[derive(Debug, Clone)]
pub enum EmailInfo {
    /// Seller created an order (with optional private code if private order)
    OrderCreated {
        order_id: String,
        token_amount: String,
        token_symbol: String,
        exchange_rate: String,
        account_id: String,
        account_name: String,
        rail: i32,  // 0 = Alipay, 1 = WeChat (localized in template)
        is_private: bool,
        private_code: Option<String>,
    },
    /// Seller withdrew tokens from their order
    OrderWithdrawn {
        order_id: String,
        withdrawn_amount: String,
        remaining_amount: String,
        token_symbol: String,
    },
    /// Seller updated exchange rate
    ExchangeRateUpdated {
        order_id: String,
        old_rate: String,
        new_rate: String,
    },
    /// Seller updated payment info
    PaymentInfoUpdated {
        order_id: String,
        new_account_id: String,
        new_account_name: String,
        rail: i32,  // 0 = Alipay, 1 = WeChat
    },
    /// Someone bought from seller's order
    TradeCreatedSeller {
        order_id: String,
        trade_id: String,
        token_amount: String,
        token_symbol: String,
        cny_amount: String,
        fee_amount: String,
        buyer_address: String,
        account_id: String,
        account_name: String,
        rail: i32,  // 0 = Alipay, 1 = WeChat
    },
    /// Buyer initiated a purchase
    TradeCreatedBuyer {
        order_id: String,
        trade_id: String,
        token_amount: String,
        token_symbol: String,
        cny_amount: String,
        seller_account_id: String,
        seller_account_name: String,
        rail: i32,  // 0 = Alipay, 1 = WeChat
        expires_at: u64,
    },
    /// Trade settled - email to seller
    TradeSettledSeller {
        order_id: String,
        trade_id: String,
        token_amount: String,
        token_symbol: String,
        cny_amount: String,
        fee_amount: String,
        buyer_address: String,
        settlement_tx: String,
        chain_id: u64,
    },
    /// Trade settled - email to buyer
    TradeSettledBuyer {
        order_id: String,
        trade_id: String,
        token_amount: String,
        token_symbol: String,
        settlement_tx: String,
        chain_id: u64,
    },
    /// Trade expired (seller)
    TradeExpiredSeller {
        order_id: String,
        trade_id: String,
        token_amount: String,
        token_symbol: String,
        cny_amount: String,
    },
    /// Trade expired (buyer)
    TradeExpiredBuyer {
        order_id: String,
        trade_id: String,
        token_amount: String,
        token_symbol: String,
        cny_amount: String,
    },
}

/// Email service configuration
#[derive(Debug, Clone)]
pub struct EmailConfig {
    pub api_key: String,
    pub from_email: String,
    pub app_url: String,
}

impl EmailConfig {
    pub fn from_env() -> Option<Self> {
        let api_key = std::env::var("RESEND_API_KEY").ok()?;
        let from_email = std::env::var("RESEND_FROM_EMAIL")
            .unwrap_or_else(|_| "LyncZ <noreply@lync-z.xyz>".to_string());
        let app_url = std::env::var("APP_URL")
            .unwrap_or_else(|_| "https://lync-z.xyz".to_string());
        
        Some(Self {
            api_key,
            from_email,
            app_url,
        })
    }
}

/// Resend API request body
#[derive(Debug, Serialize)]
struct ResendEmailRequest {
    from: String,
    to: Vec<String>,
    subject: String,
    html: String,
}

/// Resend API response
#[derive(Debug, Deserialize)]
struct ResendEmailResponse {
    id: Option<String>,
}

/// Email service for sending notifications
pub struct EmailService {
    client: Client,
    config: EmailConfig,
}

impl EmailService {
    pub fn new(config: EmailConfig) -> Self {
        Self {
            client: Client::new(),
            config,
        }
    }
    
    /// Create from environment variables
    pub fn from_env() -> Option<Arc<Self>> {
        EmailConfig::from_env().map(|config| Arc::new(Self::new(config)))
    }
    
    /// Send notification email
    pub async fn send_notification(
        &self,
        to_email: &str,
        language: &str,
        event: EmailEvent,
        info: &EmailInfo,
    ) -> Result<(), String> {
        let (subject, html) = match language {
            "zh-CN" => templates::get_email_zh_cn(event, info, &self.config.app_url),
            "zh-TW" => templates::get_email_zh_tw(event, info, &self.config.app_url),
            _ => templates::get_email_en(event, info, &self.config.app_url),
        };
        
        let request = ResendEmailRequest {
            from: self.config.from_email.clone(),
            to: vec![to_email.to_string()],
            subject,
            html,
        };
        
        let response = self.client
            .post("https://api.resend.com/emails")
            .header("Authorization", format!("Bearer {}", self.config.api_key))
            .header("Content-Type", "application/json")
            .json(&request)
            .send()
            .await
            .map_err(|e| format!("Failed to send email request: {}", e))?;
        
        if response.status().is_success() {
            let result: ResendEmailResponse = response.json().await
                .map_err(|e| format!("Failed to parse response: {}", e))?;
            info!(
                "📧 Email sent successfully to {} (id: {:?}, event: {:?})",
                to_email,
                result.id,
                event
            );
            Ok(())
        } else {
            let status = response.status();
            let body = response.text().await.unwrap_or_default();
            error!("❌ Failed to send email: {} - {}", status, body);
            Err(format!("Email API error: {} - {}", status, body))
        }
    }
    
    /// Send admin alert for key rotation (optimistic workflow)
    pub async fn send_key_rotation_alert(
        &self,
        old_hash: &str,
        new_hash: &str,
        trade_id: &str,
    ) -> Result<(), String> {
        let admin_email = std::env::var("ADMIN_ALERT_EMAIL")
            .unwrap_or_else(|_| "anonysatoshi@proton.me".to_string());
        
        let subject = "🔑 [LyncZ Alert] Alipay Public Key Rotated";
        let html = format!(r#"
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"></head>
<body style="font-family: system-ui, sans-serif; padding: 20px;">
    <h2>🔑 Alipay Public Key Rotation Detected</h2>
    <p>The Alipay public key has been <strong>automatically updated</strong> on the contract.</p>
    <p><strong>Please verify this change immediately.</strong></p>
    
    <h3>Details:</h3>
    <table style="border-collapse: collapse; margin: 20px 0;">
        <tr>
            <td style="padding: 8px; border: 1px solid #ddd; background: #f9f9f9;"><strong>Triggered by Trade:</strong></td>
            <td style="padding: 8px; border: 1px solid #ddd; font-family: monospace;">{}</td>
        </tr>
        <tr>
            <td style="padding: 8px; border: 1px solid #ddd; background: #f9f9f9;"><strong>Old Hash:</strong></td>
            <td style="padding: 8px; border: 1px solid #ddd; font-family: monospace; color: #888;">{}</td>
        </tr>
        <tr>
            <td style="padding: 8px; border: 1px solid #ddd; background: #f9f9f9;"><strong>New Hash:</strong></td>
            <td style="padding: 8px; border: 1px solid #ddd; font-family: monospace; color: #22c55e;">{}</td>
        </tr>
    </table>
    
    <p style="color: #dc2626;"><strong>Action Required:</strong> Verify the new key hash matches Alipay's current public key.</p>
    
    <p style="color: #666; font-size: 12px; margin-top: 30px;">
        This is an automated alert from LyncZ's optimistic key rotation system.
    </p>
</body>
</html>
"#, trade_id, old_hash, new_hash);

        let request = ResendEmailRequest {
            from: self.config.from_email.clone(),
            to: vec![admin_email.clone()],
            subject: subject.to_string(),
            html,
        };
        
        let response = self.client
            .post("https://api.resend.com/emails")
            .header("Authorization", format!("Bearer {}", self.config.api_key))
            .header("Content-Type", "application/json")
            .json(&request)
            .send()
            .await
            .map_err(|e| format!("Failed to send email request: {}", e))?;
        
        if response.status().is_success() {
            info!(
                "📧 Key rotation alert sent to {} (old: {}, new: {})",
                admin_email, &old_hash[..16], &new_hash[..16]
            );
            Ok(())
        } else {
            let status = response.status();
            let body = response.text().await.unwrap_or_default();
            error!("❌ Failed to send key rotation alert: {} - {}", status, body);
            Err(format!("Email API error: {} - {}", status, body))
        }
    }
}

/// Helper to format token amounts for display
pub fn format_token_amount(amount: &str, decimals: u8, symbol: &str) -> String {
    let amount_u128: u128 = amount.parse().unwrap_or(0);
    let divisor = 10u128.pow(decimals as u32);
    let whole = amount_u128 / divisor;
    let frac = amount_u128 % divisor;
    
    if decimals == 0 {
        if symbol.is_empty() {
            format!("{}", whole)
        } else {
            format!("{} {}", whole, symbol)
        }
    } else {
        let frac_str = format!("{:0width$}", frac, width = decimals as usize);
        let trimmed = frac_str.trim_end_matches('0');
        if trimmed.is_empty() {
            if symbol.is_empty() {
                format!("{}", whole)
            } else {
                format!("{} {}", whole, symbol)
            }
        } else {
            if symbol.is_empty() {
                format!("{}.{}", whole, trimmed)
            } else {
                format!("{}.{} {}", whole, trimmed, symbol)
            }
        }
    }
}

/// Helper to format CNY amount (stored as cents)
pub fn format_cny_amount(cents: &str) -> String {
    let cents_u64: u64 = cents.parse().unwrap_or(0);
    let yuan = cents_u64 / 100;
    let fen = cents_u64 % 100;
    format!("¥{}.{:02}", yuan, fen)
}

/// Helper to truncate address for display
pub fn truncate_address(address: &str) -> String {
    if address.len() >= 10 {
        format!("{}...{}", &address[..6], &address[address.len()-4..])
    } else {
        address.to_string()
    }
}

/// Helper to format expiration time
pub fn format_expires_at(expires_at: u64) -> String {
    use chrono::{TimeZone, Utc};
    let dt = Utc.timestamp_opt(expires_at as i64, 0);
    match dt {
        chrono::LocalResult::Single(dt) => dt.format("%Y-%m-%d %H:%M UTC").to_string(),
        _ => format!("{}", expires_at),
    }
}
