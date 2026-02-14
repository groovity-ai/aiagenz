-- Add subscriptions table for monetization
CREATE TABLE IF NOT EXISTS subscriptions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    plan TEXT NOT NULL,
    status TEXT NOT NULL, -- active, trailing, canceled, expired
    current_period_start TIMESTAMPTZ,
    current_period_end TIMESTAMPTZ,
    payment_provider_id TEXT, -- e.g., midtrans_transaction_id or stripe_subscription_id
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_subscriptions_user_id ON subscriptions(user_id);
