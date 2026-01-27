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
    is_contrarian BOOLEAN, -- trading against market consensus
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
CREATE INDEX IF NOT EXISTS idx_trades_is_contrarian ON trades(is_contrarian);
CREATE INDEX IF NOT EXISTS idx_markets_resolved ON markets(resolved_at);
CREATE INDEX IF NOT EXISTS idx_markets_category ON markets(category);
CREATE INDEX IF NOT EXISTS idx_snapshots_market_id ON market_snapshots(market_id);
CREATE INDEX IF NOT EXISTS idx_snapshots_timestamp ON market_snapshots(timestamp);
CREATE INDEX IF NOT EXISTS idx_clusters_market_id ON trade_clusters(market_id);

-- ============================================================
-- ARBITRAGE TRACKING TABLES
-- ============================================================

-- Market relationships for cross/related market detection
CREATE TABLE IF NOT EXISTS market_relationships (
    id SERIAL PRIMARY KEY,
    market1_id VARCHAR(255) NOT NULL,
    market2_id VARCHAR(255) NOT NULL,
    relationship_type VARCHAR(50) NOT NULL, -- 'same_event', 'inverse', 'subset', 'superset', 'mutex'
    similarity_score DECIMAL(5, 4) NOT NULL,
    confidence DECIMAL(5, 4) NOT NULL,
    detected_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    is_valid BOOLEAN DEFAULT true,
    notes TEXT,
    UNIQUE(market1_id, market2_id, relationship_type)
);

-- Arbitrage opportunities detected
CREATE TABLE IF NOT EXISTS arbitrage_opportunities (
    id SERIAL PRIMARY KEY,
    opportunity_type VARCHAR(50) NOT NULL, -- 'multi_outcome', 'cross_market', 'related_market'

    -- Primary market info
    market1_id VARCHAR(255) NOT NULL,
    market1_outcome INTEGER,
    market1_price DECIMAL(10, 8) NOT NULL,
    market1_liquidity DECIMAL(20, 2),

    -- Secondary market info (null for multi_outcome type)
    market2_id VARCHAR(255),
    market2_outcome INTEGER,
    market2_price DECIMAL(10, 8),
    market2_liquidity DECIMAL(20, 2),

    -- Opportunity metrics
    spread DECIMAL(10, 8) NOT NULL,
    profit_percent DECIMAL(10, 4) NOT NULL,
    confidence_score DECIMAL(5, 4) NOT NULL,

    -- Status
    status VARCHAR(20) DEFAULT 'active', -- 'active', 'executed', 'expired', 'invalid'

    -- Timing
    detected_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP,
    closed_at TIMESTAMP,

    -- Additional data
    metadata JSONB
);

-- Arbitrage executions (both simulated and live)
CREATE TABLE IF NOT EXISTS arbitrage_executions (
    id SERIAL PRIMARY KEY,
    opportunity_id INTEGER NOT NULL REFERENCES arbitrage_opportunities(id),

    -- Execution mode
    execution_mode VARCHAR(20) NOT NULL, -- 'simulation', 'live'

    -- Leg 1 execution
    leg1_market_id VARCHAR(255) NOT NULL,
    leg1_outcome INTEGER NOT NULL,
    leg1_side VARCHAR(4) NOT NULL, -- 'BUY' or 'SELL'
    leg1_size DECIMAL(20, 8) NOT NULL,
    leg1_expected_price DECIMAL(10, 8) NOT NULL,
    leg1_executed_price DECIMAL(10, 8),
    leg1_slippage DECIMAL(10, 8),
    leg1_tx_hash VARCHAR(255),
    leg1_executed_at TIMESTAMP,
    leg1_status VARCHAR(20) DEFAULT 'pending',

    -- Leg 2 execution (null for multi_outcome with single market)
    leg2_market_id VARCHAR(255),
    leg2_outcome INTEGER,
    leg2_side VARCHAR(4),
    leg2_size DECIMAL(20, 8),
    leg2_expected_price DECIMAL(10, 8),
    leg2_executed_price DECIMAL(10, 8),
    leg2_slippage DECIMAL(10, 8),
    leg2_tx_hash VARCHAR(255),
    leg2_executed_at TIMESTAMP,
    leg2_status VARCHAR(20),

    -- Overall execution
    total_size_usd DECIMAL(20, 2),
    total_fees DECIMAL(20, 8),
    gas_cost_usd DECIMAL(10, 4),

    -- P&L tracking
    expected_profit_usd DECIMAL(20, 8),
    realized_profit_usd DECIMAL(20, 8),
    profit_percent DECIMAL(10, 4),

    -- Status
    status VARCHAR(20) DEFAULT 'pending', -- 'pending', 'partial', 'complete', 'failed', 'cancelled'
    failure_reason TEXT,

    -- Timing
    initiated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP
);

-- Daily P&L aggregation for tracking
CREATE TABLE IF NOT EXISTS arbitrage_pnl_daily (
    id SERIAL PRIMARY KEY,
    date DATE NOT NULL,
    execution_mode VARCHAR(20) NOT NULL,

    -- Counts
    opportunities_detected INTEGER DEFAULT 0,
    executions_attempted INTEGER DEFAULT 0,
    executions_successful INTEGER DEFAULT 0,

    -- Volumes
    total_volume_usd DECIMAL(20, 2) DEFAULT 0,

    -- P&L
    gross_profit_usd DECIMAL(20, 8) DEFAULT 0,
    total_fees_usd DECIMAL(20, 8) DEFAULT 0,
    total_gas_usd DECIMAL(20, 8) DEFAULT 0,
    net_profit_usd DECIMAL(20, 8) DEFAULT 0,

    -- By type breakdown
    multi_outcome_profit DECIMAL(20, 8) DEFAULT 0,
    cross_market_profit DECIMAL(20, 8) DEFAULT 0,
    related_market_profit DECIMAL(20, 8) DEFAULT 0,

    -- Risk metrics
    max_drawdown_usd DECIMAL(20, 8) DEFAULT 0,

    UNIQUE(date, execution_mode)
);

-- Indexes for arbitrage tables
CREATE INDEX IF NOT EXISTS idx_arb_opps_status ON arbitrage_opportunities(status);
CREATE INDEX IF NOT EXISTS idx_arb_opps_detected ON arbitrage_opportunities(detected_at);
CREATE INDEX IF NOT EXISTS idx_arb_opps_type ON arbitrage_opportunities(opportunity_type);
CREATE INDEX IF NOT EXISTS idx_arb_opps_market1 ON arbitrage_opportunities(market1_id);
CREATE INDEX IF NOT EXISTS idx_arb_exec_opp_id ON arbitrage_executions(opportunity_id);
CREATE INDEX IF NOT EXISTS idx_arb_exec_status ON arbitrage_executions(status);
CREATE INDEX IF NOT EXISTS idx_arb_exec_mode ON arbitrage_executions(execution_mode);
CREATE INDEX IF NOT EXISTS idx_arb_pnl_date ON arbitrage_pnl_daily(date);
CREATE INDEX IF NOT EXISTS idx_market_rel_markets ON market_relationships(market1_id, market2_id);
