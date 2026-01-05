// Initialize Socket.IO connection
const socket = io();

// State
let markets = [];
let traders = [];

// DOM Elements
const botStatus = document.getElementById('bot-status');
const connectionStatus = document.getElementById('connection-status');
const uptime = document.getElementById('uptime');
const marketsTracked = document.getElementById('markets-tracked');
const tradersTracked = document.getElementById('traders-tracked');
const tradesProcessed = document.getElementById('trades-processed');
const roiThreshold = document.getElementById('roi-threshold');
const alertsList = document.getElementById('alerts-list');
const tradesList = document.getElementById('trades-list');
const marketsList = document.getElementById('markets-list');
const tradersList = document.getElementById('traders-list');

// Tab switching
document.querySelectorAll('.tab-button').forEach(button => {
    button.addEventListener('click', () => {
        const tabName = button.dataset.tab;

        // Update buttons
        document.querySelectorAll('.tab-button').forEach(b => b.classList.remove('active'));
        button.classList.add('active');

        // Update content
        document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));
        document.getElementById(`${tabName}-tab`).classList.add('active');
    });
});

// Socket.IO event handlers
socket.on('connect', () => {
    console.log('Connected to server');
    connectionStatus.textContent = 'Yes';
    connectionStatus.className = 'status-badge connected';
});

socket.on('disconnect', () => {
    console.log('Disconnected from server');
    connectionStatus.textContent = 'No';
    connectionStatus.className = 'status-badge disconnected';
});

socket.on('initial-data', (data) => {
    console.log('Received initial data', data);
    if (data.alerts && data.alerts.length > 0) {
        alertsList.innerHTML = '';
        data.alerts.forEach(alert => renderAlert(alert));
    }
    if (data.trades && data.trades.length > 0) {
        tradesList.innerHTML = '';
        data.trades.forEach(trade => renderTrade(trade));
    }
});

socket.on('new-alert', (alert) => {
    console.log('New alert', alert);
    if (alertsList.querySelector('.empty-state')) {
        alertsList.innerHTML = '';
    }
    renderAlert(alert, true);

    // Show notification
    if ('Notification' in window && Notification.permission === 'granted') {
        new Notification('🐋 Whale Alert!', {
            body: alert.market.question,
            icon: '/favicon.ico'
        });
    }
});

socket.on('new-trade', (trade) => {
    console.log('New trade', trade);
    if (tradesList.querySelector('.empty-state')) {
        tradesList.innerHTML = '';
    }
    renderTrade(trade, true);
});

socket.on('markets-update', (updatedMarkets) => {
    markets = updatedMarkets;
    renderMarkets();
});

socket.on('traders-update', (updatedTraders) => {
    traders = updatedTraders;
    renderTraders();
});

socket.on('stats-update', (stats) => {
    marketsTracked.textContent = stats.marketsTracked.toLocaleString();
    tradersTracked.textContent = stats.tradersTracked.toLocaleString();
    tradesProcessed.textContent = stats.processedTrades.toLocaleString();
    roiThreshold.textContent = stats.topPercentileThreshold > 0
        ? `${stats.topPercentileThreshold.toFixed(2)}%`
        : '--';
});

socket.on('bot-status', (data) => {
    botStatus.textContent = data.status.charAt(0).toUpperCase() + data.status.slice(1);
    botStatus.className = `status-badge ${data.status}`;
});

// Render functions
function renderAlert(alert, prepend = false) {
    const card = document.createElement('div');
    card.className = 'alert-card';

    const tradeValue = (alert.trade.price * alert.trade.size).toFixed(2);
    const roiClass = alert.traderStats.roi > 0 ? 'positive' : 'negative';
    const plClass = alert.traderStats.profitLoss > 0 ? 'positive' : 'negative';
    const sideEmoji = alert.trade.side === 'BUY' ? '🟢' : '🔴';

    card.innerHTML = `
        <div class="alert-header">
            <div class="alert-title">${sideEmoji} ${alert.trade.side} ${alert.trade.outcomeName || 'Outcome ' + alert.trade.outcomeIndex}</div>
            <div class="alert-time">${formatTime(alert.trade.timestamp)}</div>
        </div>
        <div class="alert-market">${alert.market.question}</div>
        <div class="alert-details">
            <div class="detail-item">
                <div class="detail-label">Trade Value</div>
                <div class="detail-value">$${tradeValue}</div>
            </div>
            <div class="detail-item">
                <div class="detail-label">Liquidity Impact</div>
                <div class="detail-value">${alert.liquidityImpact.toFixed(2)}%</div>
            </div>
            <div class="detail-item">
                <div class="detail-label">Trader ROI</div>
                <div class="detail-value ${roiClass}">${alert.traderStats.roi > 0 ? '+' : ''}${alert.traderStats.roi.toFixed(2)}%</div>
            </div>
            <div class="detail-item">
                <div class="detail-label">Trader P&L</div>
                <div class="detail-value ${plClass}">${alert.traderStats.profitLoss > 0 ? '+' : ''}$${alert.traderStats.profitLoss.toFixed(2)}</div>
            </div>
            <div class="detail-item">
                <div class="detail-label">Total Volume</div>
                <div class="detail-value">$${alert.traderStats.totalVolume.toFixed(0)}</div>
            </div>
            <div class="detail-item">
                <div class="detail-label">Win Rate</div>
                <div class="detail-value">${alert.traderStats.winRate.toFixed(1)}%</div>
            </div>
        </div>
        <div style="margin-top: 12px; font-size: 14px; color: #666;">
            <strong>Trader:</strong> <code>${alert.trade.trader}</code>
        </div>
        <div style="margin-top: 8px; font-size: 14px; color: #666; font-style: italic;">
            ${alert.reason}
        </div>
    `;

    if (prepend) {
        alertsList.insertBefore(card, alertsList.firstChild);
    } else {
        alertsList.appendChild(card);
    }
}

function renderTrade(trade, prepend = false) {
    const card = document.createElement('div');
    card.className = 'trade-card';

    const tradeValue = (trade.price * trade.size).toFixed(2);
    const sideClass = trade.side.toLowerCase();

    card.innerHTML = `
        <div class="trade-header">
            <span class="trade-side ${sideClass}">${trade.side}</span>
            <span class="trade-value">$${tradeValue}</span>
        </div>
        <div class="trade-info">
            <strong>${trade.outcomeName || 'Outcome ' + trade.outcomeIndex}</strong><br>
            Size: ${trade.size.toFixed(2)} @ $${trade.price.toFixed(4)}<br>
            ${formatTime(trade.timestamp)}
        </div>
    `;

    if (prepend) {
        tradesList.insertBefore(card, tradesList.firstChild);
    } else {
        tradesList.appendChild(card);
    }

    // Keep only last 50 visible
    while (tradesList.children.length > 50) {
        tradesList.removeChild(tradesList.lastChild);
    }
}

function renderMarkets() {
    if (markets.length === 0) {
        marketsList.innerHTML = '<div class="empty-state">No markets loaded yet...</div>';
        return;
    }

    marketsList.innerHTML = markets.map(market => `
        <div class="market-card">
            <div class="market-question">${market.question}</div>
            <div class="market-stats">
                <span><strong>Liquidity:</strong> $${market.liquidity.toFixed(0)}</span>
                <span><strong>Volume:</strong> $${market.volume.toFixed(0)}</span>
                <span><strong>Active:</strong> ${market.active ? 'Yes' : 'No'}</span>
            </div>
        </div>
    `).join('');
}

function renderTraders() {
    if (traders.length === 0) {
        tradersList.innerHTML = '<div class="empty-state">Analyzing traders...</div>';
        return;
    }

    tradersList.innerHTML = traders.map((trader, index) => {
        const roiClass = trader.roi > 0 ? 'positive' : 'negative';
        const plClass = trader.profitLoss > 0 ? 'positive' : 'negative';

        return `
            <div class="trader-card">
                <div class="trader-rank">#${index + 1}</div>
                <div class="trader-info">
                    <div class="trader-address">${trader.address}</div>
                    <div class="trader-stats">
                        <span class="${roiClass}"><strong>ROI:</strong> ${trader.roi > 0 ? '+' : ''}${trader.roi.toFixed(2)}%</span>
                        <span class="${plClass}"><strong>P&L:</strong> ${trader.profitLoss > 0 ? '+' : ''}$${trader.profitLoss.toFixed(2)}</span>
                        <span><strong>Volume:</strong> $${trader.totalVolume.toFixed(0)}</span>
                        <span><strong>Trades:</strong> ${trader.totalTrades}</span>
                        <span><strong>Win Rate:</strong> ${trader.winRate.toFixed(1)}%</span>
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

function formatTime(timestamp) {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now - date;

    if (diff < 60000) return 'Just now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;

    return date.toLocaleString();
}

// Update uptime every second
setInterval(async () => {
    try {
        const response = await fetch('/api/status');
        const data = await response.json();
        const hours = Math.floor(data.uptime / 3600);
        const minutes = Math.floor((data.uptime % 3600) / 60);
        const seconds = Math.floor(data.uptime % 60);
        uptime.textContent = `${hours}h ${minutes}m ${seconds}s`;
    } catch (error) {
        console.error('Failed to fetch status', error);
    }
}, 1000);

// Request notification permission
if ('Notification' in window && Notification.permission === 'default') {
    Notification.requestPermission();
}
