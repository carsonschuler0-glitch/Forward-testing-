-- PostgreSQL Schema for Polymarket Forward Testing

-- Markets table: tracks all active and resolved markets
CREATE TABLE IF NOT EXISTS markets (
    id VARCHAR(255) PRIMARY KEY,
    condition_id VARCHAR(255) NOT NULL,
    question TEXT NOT NULL,
    category VARCHAR(100),
    end_date TIMESTAMP,
    outcome_prices JSONB,
    volume DECIMAL(20, 2),
    liquidity DECIMAL(20, 2),
    created_at TIMESTAMP NOT NULL,
    resolved_at TIMESTAMP,
    resolved_outcome INTEGER,
    UNIQUE(condition_id)
);

-- Trades table: stores all tracked trades
CREATE TABLE IF NOT EXISTS trades (
    id VARCHAR(255) PRIMARY KEY,
    market_id VARCHAR(255) NOT NULL REFERENCES markets(id),
    trader VARCHAR(255) NOT NULL,
    outcome INTEGER NOT NULL,
    size DECIMAL(20, 2) NOT NULL,
    price DECIMAL(10, 8) NOT NULL,
    timestamp TIMESTAMP NOT NULL,
    market_liquidity DECIMAL(20, 2),
    market_volume DECIMAL(20, 2),
    market_age INTEGER, -- days since market creation
    days_until_close INTEGER,
    volume_share DECIMAL(10, 6), -- percentage
    price_before_trade DECIMAL(10, 8),
    price_after_5min DECIMAL(10, 8),
    price_after_15min DECIMAL(10, 8),
    price_after_1hr DECIMAL(10, 8),
    is_part_of_cluster BOOLEAN DEFAULT false,
    cluster_size INTEGER,
    was_correct BOOLEAN,
    was_favorite BOOLEAN,
    was_underdog BOOLEAN,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Market snapshots: captures market state at time of large trades
CREATE TABLE IF NOT EXISTS market_snapshots (
    id SERIAL PRIMARY KEY,
    market_id VARCHAR(255) NOT NULL REFERENCES markets(id),
    trade_id VARCHAR(255) REFERENCES trades(id),
    timestamp TIMESTAMP NOT NULL,
    outcome_prices JSONB NOT NULL,
    volume DECIMAL(20, 2),
    liquidity DECIMAL(20, 2),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Trader reputation: tracks performance metrics per trader
CREATE TABLE IF NOT EXISTS trader_reputation (
    address VARCHAR(255) PRIMARY KEY,
    total_trades INTEGER DEFAULT 0,
    resolved_trades INTEGER DEFAULT 0,
    correct_trades INTEGER DEFAULT 0,
    total_volume DECIMAL(20, 2) DEFAULT 0,
    total_profit DECIMAL(20, 2) DEFAULT 0,
    accuracy DECIMAL(5, 4), -- 0-1
    roi DECIMAL(10, 4), -- percentage
    reputation_score DECIMAL(5, 2), -- 0-100
    low_liq_trades INTEGER DEFAULT 0,
    low_liq_correct INTEGER DEFAULT 0,
    high_liq_trades INTEGER DEFAULT 0,
    high_liq_correct INTEGER DEFAULT 0,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Trade clusters: detected patterns of coordinated trading
CREATE TABLE IF NOT EXISTS trade_clusters (
    id SERIAL PRIMARY KEY,
    market_id VARCHAR(255) NOT NULL REFERENCES markets(id),
    start_time TIMESTAMP NOT NULL,
    end_time TIMESTAMP NOT NULL,
    trade_count INTEGER NOT NULL,
    total_volume DECIMAL(20, 2) NOT NULL,
    avg_size DECIMAL(20, 2) NOT NULL,
    outcome INTEGER NOT NULL,
    was_correct BOOLEAN,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Cluster trades: junction table linking trades to clusters
CREATE TABLE IF NOT EXISTS cluster_trades (
    cluster_id INTEGER REFERENCES trade_clusters(id) ON DELETE CASCADE,
    trade_id VARCHAR(255) REFERENCES trades(id) ON DELETE CASCADE,
    PRIMARY KEY (cluster_id, trade_id)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_trades_market_id ON trades(market_id);
CREATE INDEX IF NOT EXISTS idx_trades_trader ON trades(trader);
CREATE INDEX IF NOT EXISTS idx_trades_timestamp ON trades(timestamp);
CREATE INDEX IF NOT EXISTS idx_trades_was_correct ON trades(was_correct);
CREATE INDEX IF NOT EXISTS idx_markets_resolved ON markets(resolved_at);
CREATE INDEX IF NOT EXISTS idx_markets_category ON markets(category);
CREATE INDEX IF NOT EXISTS idx_snapshots_market_id ON market_snapshots(market_id);
CREATE INDEX IF NOT EXISTS idx_snapshots_timestamp ON market_snapshots(timestamp);
CREATE INDEX IF NOT EXISTS idx_clusters_market_id ON trade_clusters(market_id);
