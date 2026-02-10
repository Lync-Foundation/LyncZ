//! Email templates in English, Simplified Chinese, and Traditional Chinese
//! Account-based notifications - any wallet can be buyer or seller

use super::{EmailEvent, EmailInfo, truncate_address, format_cny_amount, format_expires_at};

/// Get block explorer base URL for a given chain
fn explorer_url(chain_id: u64) -> &'static str {
    match chain_id {
        1 => "https://etherscan.io",
        _ => "https://basescan.org",
    }
}

/// Get English email subject and body
pub fn get_email_en(event: EmailEvent, info: &EmailInfo, app_url: &str) -> (String, String) {
    match (event, info) {
        // Order Created (Seller) - handles both public and unlisted orders
        (EmailEvent::OrderCreated, EmailInfo::OrderCreated { order_id, token_amount, token_symbol, exchange_rate, account_id, account_name, rail, is_private, private_code: _ }) => {
            let (subject, title, message) = if *is_private {
                (
                    "📦 Your Sell Order is Ready on LyncZ".to_string(),
                    "Your sell order has been created!",
                    format!(
                        "You've listed <strong>{} {}</strong> for sale at <strong>{} CNY/{}</strong>. \
                        This is an unlisted order. Visit My Account to get your sharing code.",
                        token_amount, token_symbol, format_exchange_rate(exchange_rate), token_symbol
                    )
                )
            } else {
                (
                    "📦 Your Sell Order is Live on LyncZ".to_string(),
                    "Your sell order has been created!",
                    format!(
                        "You've listed <strong>{} {}</strong> for sale at <strong>{} CNY/{}</strong>. \
                        Buyers can now purchase from your order.",
                        token_amount, token_symbol, format_exchange_rate(exchange_rate), token_symbol
                    )
                )
            };
            
            // Localize rail name for English
            let rail_name = match rail {
                0 => "Alipay",
                1 => "WeChat",
                _ => "Unknown",
            };
            
            // Build details array - no code in email, user must visit site
            let details: Vec<(&str, String)> = vec![
                ("Order ID", truncate_address(order_id)),
                ("Amount", format!("{} {}", token_amount, token_symbol)),
                ("Rate", format!("{} CNY/{}", format_exchange_rate(exchange_rate), token_symbol)),
                ("Payment Account", format!("{} ({})", account_name, account_id)),
                ("Payment Rail", rail_name.to_string()),
                ("Listing", if *is_private { "Unlisted".to_string() } else { "Public".to_string() }),
            ];
            
            let details_refs: Vec<(&str, &str)> = details.iter().map(|(k, v)| (*k, v.as_str())).collect();
            
            let html = format_simple_email(
                title,
                &message,
                &details_refs,
                app_url,
                &format!("/account/order/{}", order_id),
                "View Order Details",
                "— LyncZ",
            );
            (subject, html)
        },
        
        // Order Withdrawn (Seller)
        (EmailEvent::OrderWithdrawn, EmailInfo::OrderWithdrawn { order_id, withdrawn_amount, remaining_amount, token_symbol }) => {
            let subject = "💸 Withdrawal from Your LyncZ Order".to_string();
            let html = format_simple_email(
                "Tokens withdrawn from your order",
                &format!(
                    "You've successfully withdrawn <strong>{} {}</strong> from your sell order. \
                    Your order now has <strong>{} {}</strong> remaining.",
                    withdrawn_amount, token_symbol, remaining_amount, token_symbol
                ),
                &[
                    ("Order ID", &truncate_address(order_id)),
                    ("Withdrawn", &format!("{} {}", withdrawn_amount, token_symbol)),
                    ("Remaining", &format!("{} {}", remaining_amount, token_symbol)),
                ],
                app_url,
                "/account",
                "View My Orders",
                "— LyncZ",
            );
            (subject, html)
        },
        
        // Exchange Rate Updated (Seller)
        (EmailEvent::OrderUpdated, EmailInfo::ExchangeRateUpdated { order_id, old_rate, new_rate }) => {
            let subject = "📊 Exchange Rate Updated on Your LyncZ Order".to_string();
            let html = format_simple_email(
                "Exchange rate has been updated",
                &format!(
                    "You've updated the exchange rate on your sell order from \
                    <strong>{} CNY</strong> to <strong>{} CNY</strong>.",
                    old_rate, new_rate
                ),
                &[
                    ("Order ID", &truncate_address(order_id)),
                    ("Old Rate", &format!("{} CNY", old_rate)),
                    ("New Rate", &format!("{} CNY", new_rate)),
                ],
                app_url,
                "/account",
                "View My Orders",
                "— LyncZ",
            );
            (subject, html)
        },
        
        // Payment Info Updated (Seller)
        (EmailEvent::OrderUpdated, EmailInfo::PaymentInfoUpdated { order_id, new_account_id, new_account_name, rail }) => {
            let rail_name = match rail {
                0 => "Alipay",
                1 => "WeChat",
                _ => "Payment",
            };
            let subject = "👤 Payment Info Updated on Your LyncZ Order".to_string();
            let html = format_simple_email(
                "Payment information has been updated",
                &format!(
                    "You've updated the payment information on your sell order. \
                    New buyers will see the updated account details.",
                ),
                &[
                    ("Order ID", &truncate_address(order_id)),
                    (&format!("{} Account Name", rail_name), new_account_name),
                    (&format!("{} Account ID", rail_name), new_account_id),
                ],
                app_url,
                "/account",
                "View My Orders",
                "— LyncZ",
            );
            (subject, html)
        },
        
        // Trade Created (Seller perspective)
        (EmailEvent::TradeCreatedSeller, EmailInfo::TradeCreatedSeller { order_id, trade_id, token_amount, token_symbol, cny_amount, fee_amount, buyer_address, account_id, account_name, rail }) => {
            let rail_name = match rail {
                0 => "Alipay",
                1 => "WeChat",
                _ => "Payment",
            };
            let subject = "🔔 New Trade on Your LyncZ Order".to_string();
            let html = format_simple_email(
                "A buyer has initiated a trade!",
                &format!(
                    "A buyer is purchasing <strong>{} {}</strong> for <strong>{}</strong>. \
                    They have 15 minutes to complete payment to your account.",
                    token_amount, token_symbol, format_cny_amount(cny_amount)
                ),
                &[
                    ("Order ID", &truncate_address(order_id)),
                    ("Trade ID", &truncate_address(trade_id)),
                    ("Buyer Receives", &format!("{} {}", token_amount, token_symbol)),
                    ("Platform Fee", &format!("-{} {}", fee_amount, token_symbol)),
                    ("You Receive", &format_cny_amount(cny_amount)),
                    ("Buyer", &truncate_address(buyer_address)),
                    (&format!("{} Account Name", rail_name), account_name),
                    (&format!("{} Account ID", rail_name), account_id),
                ],
                app_url,
                "/account",
                "View Trade",
                "— LyncZ",
            );
            (subject, html)
        },
        
        // Trade Created (Buyer perspective)
        (EmailEvent::TradeCreatedBuyer, EmailInfo::TradeCreatedBuyer { order_id, trade_id, token_amount, token_symbol, cny_amount, seller_account_id, seller_account_name, rail, expires_at }) => {
            let rail_name = match rail {
                0 => "Alipay",
                1 => "WeChat",
                _ => "Payment",
            };
            let subject = "🛒 Your LyncZ Purchase Has Started".to_string();
            let html = format_simple_email(
                "Your purchase is in progress!",
                &format!(
                    "You're buying <strong>{} {}</strong> for <strong>{}</strong>. \
                    Please complete payment to the seller's account within 15 minutes.",
                    token_amount, token_symbol, format_cny_amount(cny_amount)
                ),
                &[
                    ("Order ID", &truncate_address(order_id)),
                    ("Trade ID", &truncate_address(trade_id)),
                    ("You'll Receive", &format!("{} {}", token_amount, token_symbol)),
                    ("Amount to Pay", &format_cny_amount(cny_amount)),
                    (&format!("{} Account Name", rail_name), seller_account_name),
                    (&format!("{} Account ID", rail_name), seller_account_id),
                    ("Expires", &format_expires_at(*expires_at)),
                ],
                app_url,
                "/account",
                "View Purchase",
                "— LyncZ",
            );
            (subject, html)
        },
        
        // Trade Settled (Seller perspective)
        (EmailEvent::TradeSettledSeller, EmailInfo::TradeSettledSeller { order_id, trade_id, token_amount, token_symbol, cny_amount, fee_amount, buyer_address, settlement_tx, chain_id }) => {
            let explorer = explorer_url(*chain_id);
            let subject = "✅ Trade Settled - Payment Received".to_string();
            let html = format_simple_email(
                "Payment verified - crypto released!",
                &format!(
                    "The trade for <strong>{} {}</strong> ({}) has been settled. \
                    The buyer's payment has been verified and the crypto has been released.",
                    token_amount, token_symbol, format_cny_amount(cny_amount)
                ),
                &[
                    ("Order ID", &truncate_address(order_id)),
                    ("Trade ID", &truncate_address(trade_id)),
                    ("Sold", &format!("{} {}", token_amount, token_symbol)),
                    ("Platform Fee", &format!("-{} {}", fee_amount, token_symbol)),
                    ("Received", &format_cny_amount(cny_amount)),
                    ("Buyer", &truncate_address(buyer_address)),
                    ("Settlement TX", &format!("<a href=\"{}/tx/{}\" style=\"color: #6366f1;\">{}</a>", explorer, settlement_tx, truncate_address(settlement_tx))),
                ],
                app_url,
                "/account",
                "View Trade",
                "— LyncZ",
            );
            (subject, html)
        },
        
        // Trade Settled (Buyer perspective)
        (EmailEvent::TradeSettledBuyer, EmailInfo::TradeSettledBuyer { order_id, trade_id, token_amount, token_symbol, settlement_tx, chain_id }) => {
            let explorer = explorer_url(*chain_id);
            let subject = "🎉 Purchase Complete - Crypto Received!".to_string();
            let html = format_simple_email(
                "Your purchase is complete!",
                &format!(
                    "Congratulations! Your payment has been verified and <strong>{} {}</strong> \
                    has been transferred to your wallet.",
                    token_amount, token_symbol
                ),
                &[
                    ("Order ID", &truncate_address(order_id)),
                    ("Trade ID", &truncate_address(trade_id)),
                    ("Received", &format!("{} {}", token_amount, token_symbol)),
                    ("Settlement TX", &format!("<a href=\"{}/tx/{}\" style=\"color: #6366f1;\">{}</a>", explorer, settlement_tx, truncate_address(settlement_tx))),
                ],
                app_url,
                "/account",
                "View Purchase",
                "— LyncZ",
            );
            (subject, html)
        },
        
        // Trade Expired (Seller)
        (EmailEvent::TradeExpiredSeller, EmailInfo::TradeExpiredSeller { order_id, trade_id, token_amount, token_symbol, cny_amount }) => {
            let subject = "⏰ Trade Expired".to_string();
            let html = format_simple_email(
                "Trade expired - funds returned to your order",
                &format!(
                    "The trade for <strong>{} {}</strong> ({}) has expired because the buyer \
                    did not complete payment in time. The funds have been returned to your order.",
                    token_amount, token_symbol, format_cny_amount(cny_amount)
                ),
                &[
                    ("Order ID", &truncate_address(order_id)),
                    ("Trade ID", &truncate_address(trade_id)),
                    ("Amount", &format!("{} {}", token_amount, token_symbol)),
                    ("CNY Value", &format_cny_amount(cny_amount)),
                ],
                app_url,
                "/account",
                "View Orders",
                "— LyncZ",
            );
            (subject, html)
        },
        
        // Trade Expired (Buyer)
        (EmailEvent::TradeExpiredBuyer, EmailInfo::TradeExpiredBuyer { order_id, trade_id, token_amount, token_symbol, cny_amount }) => {
            let subject = "⏰ Your Purchase Has Expired".to_string();
            let html = format_simple_email(
                "Purchase expired - payment not completed in time",
                &format!(
                    "Your purchase of <strong>{} {}</strong> ({}) has expired because payment \
                    was not completed within the required time window. You can start a new purchase anytime.",
                    token_amount, token_symbol, format_cny_amount(cny_amount)
                ),
                &[
                    ("Order ID", &truncate_address(order_id)),
                    ("Trade ID", &truncate_address(trade_id)),
                    ("Amount", &format!("{} {}", token_amount, token_symbol)),
                    ("CNY Value", &format_cny_amount(cny_amount)),
                ],
                app_url,
                "/buy",
                "Start New Purchase",
                "— LyncZ",
            );
            (subject, html)
        },
        
        // Fallback for mismatched event/info combinations
        _ => {
            ("LyncZ Notification".to_string(), "<p>You have a new notification from LyncZ.</p>".to_string())
        }
    }
}

/// Get Simplified Chinese email subject and body
pub fn get_email_zh_cn(event: EmailEvent, info: &EmailInfo, app_url: &str) -> (String, String) {
    match (event, info) {
        // 订单已创建（卖家）- 支持公开和非公开订单
        (EmailEvent::OrderCreated, EmailInfo::OrderCreated { order_id, token_amount, token_symbol, exchange_rate, account_id, account_name, rail, is_private, private_code: _ }) => {
            let (subject, title, message) = if *is_private {
                (
                    "📦 您的灵犀支付卖单已就绪".to_string(),
                    "您的卖单已创建成功！",
                    format!(
                        "您已挂出 <strong>{} {}</strong>，售价 <strong>{} CNY/{}</strong>。\
                        此订单为非公开订单，请访问我的账户页面获取分享码。",
                        token_amount, token_symbol, format_exchange_rate(exchange_rate), token_symbol
                    )
                )
            } else {
                (
                    "📦 您的灵犀支付卖单已上线".to_string(),
                    "您的卖单已创建成功！",
                    format!(
                        "您已挂出 <strong>{} {}</strong>，售价 <strong>{} CNY/{}</strong>。\
                        买家现在可以从您的订单购买。",
                        token_amount, token_symbol, format_exchange_rate(exchange_rate), token_symbol
                    )
                )
            };
            
            // Localize rail name for Simplified Chinese
            let rail_name = match rail {
                0 => "支付宝",
                1 => "微信支付",
                _ => "未知",
            };
            
            // Build details array - no code in email, user must visit site
            let details: Vec<(&str, String)> = vec![
                ("订单ID", truncate_address(order_id)),
                ("数量", format!("{} {}", token_amount, token_symbol)),
                ("汇率", format!("{} CNY/{}", format_exchange_rate(exchange_rate), token_symbol)),
                ("收款账户", format!("{} ({})", account_name, account_id)),
                ("收款方式", rail_name.to_string()),
                ("展示方式", if *is_private { "非公开".to_string() } else { "公开".to_string() }),
            ];
            
            let details_refs: Vec<(&str, &str)> = details.iter().map(|(k, v)| (*k, v.as_str())).collect();
            
            let html = format_simple_email(
                title,
                &message,
                &details_refs,
                app_url,
                &format!("/account/order/{}", order_id),
                "查看订单详情",
                "— 灵犀支付",
            );
            (subject, html)
        },
        
        // 订单提取（卖家）
        (EmailEvent::OrderWithdrawn, EmailInfo::OrderWithdrawn { order_id, withdrawn_amount, remaining_amount, token_symbol }) => {
            let subject = "💸 您已从灵犀支付订单提取代币".to_string();
            let html = format_simple_email(
                "代币已从您的订单中提取",
                &format!(
                    "您已成功从卖单中提取 <strong>{} {}</strong>。\
                    您的订单现在剩余 <strong>{} {}</strong>。",
                    withdrawn_amount, token_symbol, remaining_amount, token_symbol
                ),
                &[
                    ("订单ID", &truncate_address(order_id)),
                    ("已提取", &format!("{} {}", withdrawn_amount, token_symbol)),
                    ("剩余", &format!("{} {}", remaining_amount, token_symbol)),
                ],
                app_url,
                "/account",
                "查看我的订单",
                "— 灵犀支付",
            );
            (subject, html)
        },
        
        // 汇率已更新（卖家）
        (EmailEvent::OrderUpdated, EmailInfo::ExchangeRateUpdated { order_id, old_rate, new_rate }) => {
            let subject = "📊 您的灵犀支付订单汇率已更新".to_string();
            let html = format_simple_email(
                "汇率已更新",
                &format!(
                    "您已将卖单汇率从 <strong>{} CNY</strong> 更新为 <strong>{} CNY</strong>。",
                    old_rate, new_rate
                ),
                &[
                    ("订单ID", &truncate_address(order_id)),
                    ("原汇率", &format!("{} CNY", old_rate)),
                    ("新汇率", &format!("{} CNY", new_rate)),
                ],
                app_url,
                "/account",
                "查看我的订单",
                "— 灵犀支付",
            );
            (subject, html)
        },
        
        // 收款信息已更新（卖家）
        (EmailEvent::OrderUpdated, EmailInfo::PaymentInfoUpdated { order_id, new_account_id, new_account_name, rail }) => {
            let rail_name = match rail {
                0 => "支付宝",
                1 => "微信",
                _ => "收款",
            };
            let subject = "👤 您的灵犀支付订单收款信息已更新".to_string();
            let html = format_simple_email(
                "收款信息已更新",
                "您已更新卖单的收款信息。新买家将看到更新后的账户详情。",
                &[
                    ("订单ID", &truncate_address(order_id)),
                    (&format!("{}账户名", rail_name), new_account_name),
                    (&format!("{}账号", rail_name), new_account_id),
                ],
                app_url,
                "/account",
                "查看我的订单",
                "— 灵犀支付",
            );
            (subject, html)
        },
        
        // 交易已创建（卖家视角）
        (EmailEvent::TradeCreatedSeller, EmailInfo::TradeCreatedSeller { order_id, trade_id, token_amount, token_symbol, cny_amount, fee_amount, buyer_address, account_id, account_name, rail }) => {
            let rail_name = match rail {
                0 => "支付宝",
                1 => "微信",
                _ => "收款",
            };
            let subject = "🔔 您的灵犀支付订单有新交易".to_string();
            let html = format_simple_email(
                "买家已发起交易！",
                &format!(
                    "买家正在购买 <strong>{} {}</strong>，金额为 <strong>{}</strong>。\
                    买家有15分钟时间完成付款。",
                    token_amount, token_symbol, format_cny_amount(cny_amount)
                ),
                &[
                    ("订单ID", &truncate_address(order_id)),
                    ("交易ID", &truncate_address(trade_id)),
                    ("买家收到", &format!("{} {}", token_amount, token_symbol)),
                    ("平台手续费", &format!("-{} {}", fee_amount, token_symbol)),
                    ("您收到", &format_cny_amount(cny_amount)),
                    ("买家", &truncate_address(buyer_address)),
                    (&format!("{}账户名", rail_name), account_name),
                    (&format!("{}账号", rail_name), account_id),
                ],
                app_url,
                "/account",
                "查看交易",
                "— 灵犀支付",
            );
            (subject, html)
        },
        
        // 交易已创建（买家视角）
        (EmailEvent::TradeCreatedBuyer, EmailInfo::TradeCreatedBuyer { order_id, trade_id, token_amount, token_symbol, cny_amount, seller_account_id, seller_account_name, rail, expires_at }) => {
            let rail_name = match rail {
                0 => "支付宝",
                1 => "微信",
                _ => "收款",
            };
            let subject = "🛒 您的灵犀支付购买已开始".to_string();
            let html = format_simple_email(
                "您的购买正在进行中！",
                &format!(
                    "您正在购买 <strong>{} {}</strong>，金额为 <strong>{}</strong>。\
                    请在15分钟内向卖家账户完成付款。",
                    token_amount, token_symbol, format_cny_amount(cny_amount)
                ),
                &[
                    ("订单ID", &truncate_address(order_id)),
                    ("交易ID", &truncate_address(trade_id)),
                    ("您将收到", &format!("{} {}", token_amount, token_symbol)),
                    ("需支付金额", &format_cny_amount(cny_amount)),
                    (&format!("{}账户名", rail_name), seller_account_name),
                    (&format!("{}账号", rail_name), seller_account_id),
                    ("过期时间", &format_expires_at(*expires_at)),
                ],
                app_url,
                "/account",
                "查看购买",
                "— 灵犀支付",
            );
            (subject, html)
        },
        
        // 交易已结算（卖家视角）
        (EmailEvent::TradeSettledSeller, EmailInfo::TradeSettledSeller { order_id, trade_id, token_amount, token_symbol, cny_amount, fee_amount, buyer_address, settlement_tx, chain_id }) => {
            let explorer = explorer_url(*chain_id);
            let subject = "✅ 交易成功结算 - 收款已确认".to_string();
            let html = format_simple_email(
                "付款已验证 - 加密货币已释放！",
                &format!(
                    "<strong>{} {}</strong>（{}）的交易已成功结算。\
                    买家的付款已验证，加密货币已释放给买家。",
                    token_amount, token_symbol, format_cny_amount(cny_amount)
                ),
                &[
                    ("订单ID", &truncate_address(order_id)),
                    ("交易ID", &truncate_address(trade_id)),
                    ("已售出", &format!("{} {}", token_amount, token_symbol)),
                    ("平台手续费", &format!("-{} {}", fee_amount, token_symbol)),
                    ("已收到", &format_cny_amount(cny_amount)),
                    ("买家", &truncate_address(buyer_address)),
                    ("结算交易", &format!("<a href=\"{}/tx/{}\" style=\"color: #6366f1;\">{}</a>", explorer, settlement_tx, truncate_address(settlement_tx))),
                ],
                app_url,
                "/account",
                "查看交易",
                "— 灵犀支付",
            );
            (subject, html)
        },
        
        // 交易已结算（买家视角）
        (EmailEvent::TradeSettledBuyer, EmailInfo::TradeSettledBuyer { order_id, trade_id, token_amount, token_symbol, settlement_tx, chain_id }) => {
            let explorer = explorer_url(*chain_id);
            let subject = "🎉 购买成功 - 加密货币已到账！".to_string();
            let html = format_simple_email(
                "您的购买已完成！",
                &format!(
                    "恭喜！您的付款已验证，<strong>{} {}</strong> 已转入您的钱包。",
                    token_amount, token_symbol
                ),
                &[
                    ("订单ID", &truncate_address(order_id)),
                    ("交易ID", &truncate_address(trade_id)),
                    ("已收到", &format!("{} {}", token_amount, token_symbol)),
                    ("结算交易", &format!("<a href=\"{}/tx/{}\" style=\"color: #6366f1;\">{}</a>", explorer, settlement_tx, truncate_address(settlement_tx))),
                ],
                app_url,
                "/account",
                "查看购买",
                "— 灵犀支付",
            );
            (subject, html)
        },
        
        // 交易已过期（卖家）
        (EmailEvent::TradeExpiredSeller, EmailInfo::TradeExpiredSeller { order_id, trade_id, token_amount, token_symbol, cny_amount }) => {
            let subject = "⏰ 交易已过期".to_string();
            let html = format_simple_email(
                "交易过期 - 资金已返还到您的订单",
                &format!(
                    "<strong>{} {}</strong>（{}）的交易已过期，因为买家未能及时完成付款。\
                    资金已返还到您的订单中。",
                    token_amount, token_symbol, format_cny_amount(cny_amount)
                ),
                &[
                    ("订单ID", &truncate_address(order_id)),
                    ("交易ID", &truncate_address(trade_id)),
                    ("数量", &format!("{} {}", token_amount, token_symbol)),
                    ("金额", &format_cny_amount(cny_amount)),
                ],
                app_url,
                "/account",
                "查看订单",
                "— 灵犀支付",
            );
            (subject, html)
        },
        
        // 交易已过期（买家）
        (EmailEvent::TradeExpiredBuyer, EmailInfo::TradeExpiredBuyer { order_id, trade_id, token_amount, token_symbol, cny_amount }) => {
            let subject = "⏰ 您的购买已过期".to_string();
            let html = format_simple_email(
                "购买过期 - 未在规定时间内完成付款",
                &format!(
                    "您购买 <strong>{} {}</strong>（{}）的交易已过期，因为未能在规定时间内完成付款。\
                    您可以随时发起新的购买。",
                    token_amount, token_symbol, format_cny_amount(cny_amount)
                ),
                &[
                    ("订单ID", &truncate_address(order_id)),
                    ("交易ID", &truncate_address(trade_id)),
                    ("数量", &format!("{} {}", token_amount, token_symbol)),
                    ("金额", &format_cny_amount(cny_amount)),
                ],
                app_url,
                "/buy",
                "发起新购买",
                "— 灵犀支付",
            );
            (subject, html)
        },
        
        _ => {
            ("灵犀支付通知".to_string(), "<p>您有一条新的灵犀支付通知。</p>".to_string())
        }
    }
}

/// Get Traditional Chinese email subject and body
pub fn get_email_zh_tw(event: EmailEvent, info: &EmailInfo, app_url: &str) -> (String, String) {
    match (event, info) {
        // 訂單已創建（賣家）- 支持公開和非公開訂單
        (EmailEvent::OrderCreated, EmailInfo::OrderCreated { order_id, token_amount, token_symbol, exchange_rate, account_id, account_name, rail, is_private, private_code: _ }) => {
            let (subject, title, message) = if *is_private {
                (
                    "📦 您的靈犀支付賣單已就緒".to_string(),
                    "您的賣單已創建成功！",
                    format!(
                        "您已掛出 <strong>{} {}</strong>，售價 <strong>{} CNY/{}</strong>。\
                        此訂單為非公開訂單，請訪問我的帳戶頁面獲取分享碼。",
                        token_amount, token_symbol, format_exchange_rate(exchange_rate), token_symbol
                    )
                )
            } else {
                (
                    "📦 您的靈犀支付賣單已上線".to_string(),
                    "您的賣單已創建成功！",
                    format!(
                        "您已掛出 <strong>{} {}</strong>，售價 <strong>{} CNY/{}</strong>。\
                        買家現在可以從您的訂單購買。",
                        token_amount, token_symbol, format_exchange_rate(exchange_rate), token_symbol
                    )
                )
            };
            
            // Localize rail name for Traditional Chinese
            let rail_name = match rail {
                0 => "支付寶",
                1 => "微信支付",
                _ => "未知",
            };
            
            // Build details array - no code in email, user must visit site
            let details: Vec<(&str, String)> = vec![
                ("訂單ID", truncate_address(order_id)),
                ("數量", format!("{} {}", token_amount, token_symbol)),
                ("匯率", format!("{} CNY/{}", format_exchange_rate(exchange_rate), token_symbol)),
                ("收款帳戶", format!("{} ({})", account_name, account_id)),
                ("收款方式", rail_name.to_string()),
                ("展示方式", if *is_private { "非公開".to_string() } else { "公開".to_string() }),
            ];
            
            let details_refs: Vec<(&str, &str)> = details.iter().map(|(k, v)| (*k, v.as_str())).collect();
            
            let html = format_simple_email(
                title,
                &message,
                &details_refs,
                app_url,
                &format!("/account/order/{}", order_id),
                "查看訂單詳情",
                "— 靈犀支付",
            );
            (subject, html)
        },
        
        // 訂單提取（賣家）
        (EmailEvent::OrderWithdrawn, EmailInfo::OrderWithdrawn { order_id, withdrawn_amount, remaining_amount, token_symbol }) => {
            let subject = "💸 您已從靈犀支付訂單提取代幣".to_string();
            let html = format_simple_email(
                "代幣已從您的訂單中提取",
                &format!(
                    "您已成功從賣單中提取 <strong>{} {}</strong>。\
                    您的訂單現在剩餘 <strong>{} {}</strong>。",
                    withdrawn_amount, token_symbol, remaining_amount, token_symbol
                ),
                &[
                    ("訂單ID", &truncate_address(order_id)),
                    ("已提取", &format!("{} {}", withdrawn_amount, token_symbol)),
                    ("剩餘", &format!("{} {}", remaining_amount, token_symbol)),
                ],
                app_url,
                "/account",
                "查看我的訂單",
                "— 靈犀支付",
            );
            (subject, html)
        },
        
        // 匯率已更新（賣家）
        (EmailEvent::OrderUpdated, EmailInfo::ExchangeRateUpdated { order_id, old_rate, new_rate }) => {
            let subject = "📊 您的靈犀支付訂單匯率已更新".to_string();
            let html = format_simple_email(
                "匯率已更新",
                &format!(
                    "您已將賣單匯率從 <strong>{} CNY</strong> 更新為 <strong>{} CNY</strong>。",
                    old_rate, new_rate
                ),
                &[
                    ("訂單ID", &truncate_address(order_id)),
                    ("原匯率", &format!("{} CNY", old_rate)),
                    ("新匯率", &format!("{} CNY", new_rate)),
                ],
                app_url,
                "/account",
                "查看我的訂單",
                "— 靈犀支付",
            );
            (subject, html)
        },
        
        // 收款資訊已更新（賣家）
        (EmailEvent::OrderUpdated, EmailInfo::PaymentInfoUpdated { order_id, new_account_id, new_account_name, rail }) => {
            let rail_name = match rail {
                0 => "支付寶",
                1 => "微信",
                _ => "收款",
            };
            let subject = "👤 您的靈犀支付訂單收款資訊已更新".to_string();
            let html = format_simple_email(
                "收款資訊已更新",
                "您已更新賣單的收款資訊。新買家將看到更新後的帳戶詳情。",
                &[
                    ("訂單ID", &truncate_address(order_id)),
                    (&format!("{}帳戶名", rail_name), new_account_name),
                    (&format!("{}帳號", rail_name), new_account_id),
                ],
                app_url,
                "/account",
                "查看我的訂單",
                "— 靈犀支付",
            );
            (subject, html)
        },
        
        // 交易已創建（賣家視角）
        (EmailEvent::TradeCreatedSeller, EmailInfo::TradeCreatedSeller { order_id, trade_id, token_amount, token_symbol, cny_amount, fee_amount, buyer_address, account_id, account_name, rail }) => {
            let rail_name = match rail {
                0 => "支付寶",
                1 => "微信",
                _ => "收款",
            };
            let subject = "🔔 您的靈犀支付訂單有新交易".to_string();
            let html = format_simple_email(
                "買家已發起交易！",
                &format!(
                    "買家正在購買 <strong>{} {}</strong>，金額為 <strong>{}</strong>。\
                    買家有15分鐘時間完成付款。",
                    token_amount, token_symbol, format_cny_amount(cny_amount)
                ),
                &[
                    ("訂單ID", &truncate_address(order_id)),
                    ("交易ID", &truncate_address(trade_id)),
                    ("買家收到", &format!("{} {}", token_amount, token_symbol)),
                    ("平台手續費", &format!("-{} {}", fee_amount, token_symbol)),
                    ("您收到", &format_cny_amount(cny_amount)),
                    ("買家", &truncate_address(buyer_address)),
                    (&format!("{}帳戶名", rail_name), account_name),
                    (&format!("{}帳號", rail_name), account_id),
                ],
                app_url,
                "/account",
                "查看交易",
                "— 靈犀支付",
            );
            (subject, html)
        },
        
        // 交易已創建（買家視角）
        (EmailEvent::TradeCreatedBuyer, EmailInfo::TradeCreatedBuyer { order_id, trade_id, token_amount, token_symbol, cny_amount, seller_account_id, seller_account_name, rail, expires_at }) => {
            let rail_name = match rail {
                0 => "支付寶",
                1 => "微信",
                _ => "收款",
            };
            let subject = "🛒 您的靈犀支付購買已開始".to_string();
            let html = format_simple_email(
                "您的購買正在進行中！",
                &format!(
                    "您正在購買 <strong>{} {}</strong>，金額為 <strong>{}</strong>。\
                    請在15分鐘內向賣家帳戶完成付款。",
                    token_amount, token_symbol, format_cny_amount(cny_amount)
                ),
                &[
                    ("訂單ID", &truncate_address(order_id)),
                    ("交易ID", &truncate_address(trade_id)),
                    ("您將收到", &format!("{} {}", token_amount, token_symbol)),
                    ("需支付金額", &format_cny_amount(cny_amount)),
                    (&format!("{}帳戶名", rail_name), seller_account_name),
                    (&format!("{}帳號", rail_name), seller_account_id),
                    ("過期時間", &format_expires_at(*expires_at)),
                ],
                app_url,
                "/account",
                "查看購買",
                "— 靈犀支付",
            );
            (subject, html)
        },
        
        // 交易已結算（賣家視角）
        (EmailEvent::TradeSettledSeller, EmailInfo::TradeSettledSeller { order_id, trade_id, token_amount, token_symbol, cny_amount, fee_amount, buyer_address, settlement_tx, chain_id }) => {
            let explorer = explorer_url(*chain_id);
            let subject = "✅ 交易成功結算 - 收款已確認".to_string();
            let html = format_simple_email(
                "付款已驗證 - 加密貨幣已釋放！",
                &format!(
                    "<strong>{} {}</strong>（{}）的交易已成功結算。\
                    買家的付款已驗證，加密貨幣已釋放給買家。",
                    token_amount, token_symbol, format_cny_amount(cny_amount)
                ),
                &[
                    ("訂單ID", &truncate_address(order_id)),
                    ("交易ID", &truncate_address(trade_id)),
                    ("已售出", &format!("{} {}", token_amount, token_symbol)),
                    ("平台手續費", &format!("-{} {}", fee_amount, token_symbol)),
                    ("已收到", &format_cny_amount(cny_amount)),
                    ("買家", &truncate_address(buyer_address)),
                    ("結算交易", &format!("<a href=\"{}/tx/{}\" style=\"color: #6366f1;\">{}</a>", explorer, settlement_tx, truncate_address(settlement_tx))),
                ],
                app_url,
                "/account",
                "查看交易",
                "— 靈犀支付",
            );
            (subject, html)
        },
        
        // 交易已結算（買家視角）
        (EmailEvent::TradeSettledBuyer, EmailInfo::TradeSettledBuyer { order_id, trade_id, token_amount, token_symbol, settlement_tx, chain_id }) => {
            let explorer = explorer_url(*chain_id);
            let subject = "🎉 購買成功 - 加密貨幣已到帳！".to_string();
            let html = format_simple_email(
                "您的購買已完成！",
                &format!(
                    "恭喜！您的付款已驗證，<strong>{} {}</strong> 已轉入您的錢包。",
                    token_amount, token_symbol
                ),
                &[
                    ("訂單ID", &truncate_address(order_id)),
                    ("交易ID", &truncate_address(trade_id)),
                    ("已收到", &format!("{} {}", token_amount, token_symbol)),
                    ("結算交易", &format!("<a href=\"{}/tx/{}\" style=\"color: #6366f1;\">{}</a>", explorer, settlement_tx, truncate_address(settlement_tx))),
                ],
                app_url,
                "/account",
                "查看購買",
                "— 靈犀支付",
            );
            (subject, html)
        },
        
        // 交易已過期（賣家）
        (EmailEvent::TradeExpiredSeller, EmailInfo::TradeExpiredSeller { order_id, trade_id, token_amount, token_symbol, cny_amount }) => {
            let subject = "⏰ 交易已過期".to_string();
            let html = format_simple_email(
                "交易過期 - 資金已返還到您的訂單",
                &format!(
                    "<strong>{} {}</strong>（{}）的交易已過期，因為買家未能及時完成付款。\
                    資金已返還到您的訂單中。",
                    token_amount, token_symbol, format_cny_amount(cny_amount)
                ),
                &[
                    ("訂單ID", &truncate_address(order_id)),
                    ("交易ID", &truncate_address(trade_id)),
                    ("數量", &format!("{} {}", token_amount, token_symbol)),
                    ("金額", &format_cny_amount(cny_amount)),
                ],
                app_url,
                "/account",
                "查看訂單",
                "— 靈犀支付",
            );
            (subject, html)
        },
        
        // 交易已過期（買家）
        (EmailEvent::TradeExpiredBuyer, EmailInfo::TradeExpiredBuyer { order_id, trade_id, token_amount, token_symbol, cny_amount }) => {
            let subject = "⏰ 您的購買已過期".to_string();
            let html = format_simple_email(
                "購買過期 - 未在規定時間內完成付款",
                &format!(
                    "您購買 <strong>{} {}</strong>（{}）的交易已過期，因為未能在規定時間內完成付款。\
                    您可以隨時發起新的購買。",
                    token_amount, token_symbol, format_cny_amount(cny_amount)
                ),
                &[
                    ("訂單ID", &truncate_address(order_id)),
                    ("交易ID", &truncate_address(trade_id)),
                    ("數量", &format!("{} {}", token_amount, token_symbol)),
                    ("金額", &format_cny_amount(cny_amount)),
                ],
                app_url,
                "/buy",
                "發起新購買",
                "— 靈犀支付",
            );
            (subject, html)
        },
        
        _ => {
            ("靈犀支付通知".to_string(), "<p>您有一條新的靈犀支付通知。</p>".to_string())
        }
    }
}

/// Format exchange rate from cents to human readable
fn format_exchange_rate(rate: &str) -> String {
    let rate_u64: u64 = rate.parse().unwrap_or(0);
    let yuan = rate_u64 / 100;
    let fen = rate_u64 % 100;
    format!("{}.{:02}", yuan, fen)
}

/// Format a simple email with key-value details
fn format_simple_email(
    title: &str,
    message: &str,
    details: &[(&str, &str)],
    app_url: &str,
    btn_path: &str,
    btn_text: &str,
    signature: &str,
) -> String {
    let details_html: String = details.iter()
        .map(|(label, value)| {
            format!(r#"
                <tr>
                    <td style="padding: 8px 0; color: #6b7280; font-size: 14px;">{}</td>
                    <td style="padding: 8px 0; color: #374151; font-size: 14px; text-align: right;">{}</td>
                </tr>"#,
                label, value
            )
        })
        .collect();

    format!(r#"<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>LyncZ</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f3f4f6; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
    <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f3f4f6; padding: 40px 20px;">
        <tr>
            <td align="center">
                <table width="100%" cellpadding="0" cellspacing="0" style="max-width: 600px; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
                    <!-- Header -->
                    <tr>
                        <td style="background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%); padding: 30px; text-align: center;">
                            <h1 style="margin: 0; color: white; font-size: 28px; font-weight: 700;">LyncZ 灵犀支付</h1>
                        </td>
                    </tr>
                    
                    <!-- Content -->
                    <tr>
                        <td style="padding: 40px 30px;">
                            <h2 style="margin: 0 0 20px; color: #1f2937; font-size: 22px;">{title}</h2>
                            <p style="margin: 0 0 30px; color: #6b7280; font-size: 16px; line-height: 1.6;">{message}</p>
                            
                            <!-- Details Box -->
                            <div style="background-color: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; padding: 20px; margin-bottom: 30px;">
                                <table width="100%" cellpadding="0" cellspacing="0">{details}</table>
                            </div>
                            
                            <!-- CTA Button -->
                            <a href="{app_url}{btn_path}" style="display: inline-block; background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%); color: white; text-decoration: none; padding: 14px 28px; border-radius: 8px; font-weight: 600; font-size: 16px;">{btn_text}</a>
                        </td>
                    </tr>
                    
                    <!-- Footer -->
                    <tr>
                        <td style="padding: 20px 30px; border-top: 1px solid #e5e7eb; text-align: center;">
                            <p style="margin: 0; color: #9ca3af; font-size: 14px;">{signature}</p>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>"#,
        title = title,
        message = message,
        details = details_html,
        app_url = app_url,
        btn_path = btn_path,
        btn_text = btn_text,
        signature = signature,
    )
}
