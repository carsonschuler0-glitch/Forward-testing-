// Dashboard JavaScript
const socket = io();

let tradeSizeChart = null;
let liquidityChart = null;

// Connect to WebSocket
socket.on('connect', () => {
    console.log('Connected to server');
});

socket.on('disconnect', () => {
    console.log('Disconnected from server');
});

// Handle updates
socket.on('update', (data) => {
    console.log('Received update:', data);
    updateDashboard(data);
});

socket.on('status', (data) => {
    console.log('Status:', data);
});

function updateDashboard(data) {
    const { analysis, newTrades, markets, totalTrades } = data;

    // Update status bar
    document.getElementById('totalMarkets').textContent = markets;
    document.getElementById('totalTrades').textContent = totalTrades;
    document.getElementById('resolvedTrades').textContent = analysis.resolvedTrades;
    document.getElementById('newTrades').textContent = newTrades;

    // Update clustering metrics
    document.getElementById('totalClusters').textContent = analysis.totalClusters;
    document.getElementById('clusterAccuracy').textContent = (analysis.clusterAccuracy * 100).toFixed(1) + '%';
    document.getElementById('avgClusterSize').textContent = analysis.avgClusterSize.toFixed(1);

    // Update concentration metrics
    document.getElementById('highConcMarkets').textContent = analysis.highConcentrationMarkets;
    document.getElementById('concAccuracy').textContent = (analysis.concentrationAccuracy * 100).toFixed(1) + '%';
    document.getElementById('repeatMarkets').textContent = analysis.marketsWithRepeatTraders;

    // Update charts
    updateTradeSizeChart(analysis.tradeSizeBuckets);
    updateLiquidityChart(analysis.liquidityBuckets);

    // Update tables
    updateTradeSizeTable(analysis.tradeSizeBuckets, totalTrades);
    updateLiquidityTable(analysis.liquidityBuckets);

    // Update top traders
    updateTopTraders(analysis.topTraders);

    // Update timestamp
    document.getElementById('lastUpdate').textContent = new Date().toLocaleTimeString();
}

function updateTradeSizeChart(buckets) {
    const ctx = document.getElementById('tradeSizeChart');

    // Get top 10 buckets by trade count
    const entries = Object.entries(buckets)
        .sort((a, b) => b[1].totalTrades - a[1].totalTrades)
        .slice(0, 10);

    const labels = entries.map(([range]) => range);
    const data = entries.map(([_, data]) => data.totalTrades);
    const accuracies = entries.map(([_, data]) => data.accuracy * 100);

    if (tradeSizeChart) {
        tradeSizeChart.data.labels = labels;
        tradeSizeChart.data.datasets[0].data = data;
        tradeSizeChart.data.datasets[1].data = accuracies;
        tradeSizeChart.update();
    } else {
        tradeSizeChart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Trades',
                    data: data,
                    backgroundColor: 'rgba(102, 126, 234, 0.5)',
                    borderColor: 'rgba(102, 126, 234, 1)',
                    borderWidth: 1,
                    yAxisID: 'y'
                }, {
                    label: 'Accuracy %',
                    data: accuracies,
                    backgroundColor: 'rgba(16, 185, 129, 0.5)',
                    borderColor: 'rgba(16, 185, 129, 1)',
                    borderWidth: 1,
                    yAxisID: 'y1'
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        labels: {
                            color: '#e0e6ed'
                        }
                    }
                },
                scales: {
                    x: {
                        ticks: { color: '#8b92a8' },
                        grid: { color: '#2a3147' }
                    },
                    y: {
                        type: 'linear',
                        position: 'left',
                        ticks: { color: '#8b92a8' },
                        grid: { color: '#2a3147' }
                    },
                    y1: {
                        type: 'linear',
                        position: 'right',
                        ticks: { color: '#8b92a8' },
                        grid: { display: false },
                        min: 0,
                        max: 100
                    }
                }
            }
        });
    }
}

function updateLiquidityChart(buckets) {
    const ctx = document.getElementById('liquidityChart');

    // Get top 10 buckets by trade count
    const entries = Object.entries(buckets)
        .sort((a, b) => b[1].totalTrades - a[1].totalTrades)
        .slice(0, 10);

    const labels = entries.map(([range]) => range);
    const data = entries.map(([_, data]) => data.totalTrades);
    const accuracies = entries.map(([_, data]) => data.accuracy * 100);

    if (liquidityChart) {
        liquidityChart.data.labels = labels;
        liquidityChart.data.datasets[0].data = data;
        liquidityChart.data.datasets[1].data = accuracies;
        liquidityChart.update();
    } else {
        liquidityChart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Trades',
                    data: data,
                    backgroundColor: 'rgba(118, 75, 162, 0.5)',
                    borderColor: 'rgba(118, 75, 162, 1)',
                    borderWidth: 1,
                    yAxisID: 'y'
                }, {
                    label: 'Accuracy %',
                    data: accuracies,
                    backgroundColor: 'rgba(16, 185, 129, 0.5)',
                    borderColor: 'rgba(16, 185, 129, 1)',
                    borderWidth: 1,
                    yAxisID: 'y1'
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        labels: {
                            color: '#e0e6ed'
                        }
                    }
                },
                scales: {
                    x: {
                        ticks: { color: '#8b92a8', maxRotation: 45, minRotation: 45 },
                        grid: { color: '#2a3147' }
                    },
                    y: {
                        type: 'linear',
                        position: 'left',
                        ticks: { color: '#8b92a8' },
                        grid: { color: '#2a3147' }
                    },
                    y1: {
                        type: 'linear',
                        position: 'right',
                        ticks: { color: '#8b92a8' },
                        grid: { display: false },
                        min: 0,
                        max: 100
                    }
                }
            }
        });
    }
}

function updateTradeSizeTable(buckets, totalTrades) {
    const tbody = document.getElementById('tradeSizeTable');

    // Get top 15 buckets
    const entries = Object.entries(buckets)
        .sort((a, b) => b[1].totalTrades - a[1].totalTrades)
        .slice(0, 15);

    if (entries.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; color: #8b92a8;">No data yet...</td></tr>';
        return;
    }

    tbody.innerHTML = entries.map(([range, data]) => {
        const accuracy = (data.accuracy * 100).toFixed(1);
        const accuracyClass = data.accuracy > 0.5 ? 'positive' : '';

        return `
            <tr>
                <td><strong>${range}</strong></td>
                <td>${data.totalTrades}</td>
                <td>$${data.avgSize.toFixed(0)}</td>
                <td>${data.correctTrades}</td>
                <td>
                    <span class="metric-value ${accuracyClass}">${accuracy}%</span>
                    <div class="accuracy-bar">
                        <div class="accuracy-fill" style="width: ${accuracy}%"></div>
                    </div>
                </td>
            </tr>
        `;
    }).join('');
}

function updateLiquidityTable(buckets) {
    const tbody = document.getElementById('liquidityTable');

    // Get top 15 buckets
    const entries = Object.entries(buckets)
        .sort((a, b) => b[1].totalTrades - a[1].totalTrades)
        .slice(0, 15);

    if (entries.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; color: #8b92a8;">No data yet...</td></tr>';
        return;
    }

    tbody.innerHTML = entries.map(([range, data]) => {
        const accuracy = (data.accuracy * 100).toFixed(1);
        const accuracyClass = data.accuracy > 0.5 ? 'positive' : '';

        return `
            <tr>
                <td><strong>${range}</strong></td>
                <td>${data.totalMarkets}</td>
                <td>${data.totalTrades}</td>
                <td>$${data.avgLiquidity.toFixed(0)}</td>
                <td>
                    <span class="metric-value ${accuracyClass}">${accuracy}%</span>
                    <div class="accuracy-bar">
                        <div class="accuracy-fill" style="width: ${accuracy}%"></div>
                    </div>
                </td>
            </tr>
        `;
    }).join('');
}

function updateTopTraders(traders) {
    const container = document.getElementById('topTraders');

    if (!traders || traders.length === 0) {
        container.innerHTML = '<p style="text-align: center; color: #8b92a8;">No traders yet...</p>';
        return;
    }

    container.innerHTML = traders.slice(0, 10).map((trader, i) => {
        const accuracyClass = trader.accuracy > 0.5 ? 'positive' : trader.accuracy < 0.4 ? 'negative' : '';
        const roiClass = trader.roi > 0 ? 'positive' : trader.roi < 0 ? 'negative' : '';

        return `
            <div class="trader-card">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem;">
                    <div class="trader-address"><strong>#${i + 1}</strong> ${trader.address.substring(0, 20)}...</div>
                    <div style="font-size: 1.2rem; color: #667eea;">Score: <strong>${trader.reputationScore.toFixed(0)}</strong>/100</div>
                </div>
                <div class="trader-stats">
                    <div>
                        <div style="color: #8b92a8;">Accuracy</div>
                        <div class="metric-value ${accuracyClass}">${(trader.accuracy * 100).toFixed(1)}%</div>
                    </div>
                    <div>
                        <div style="color: #8b92a8;">ROI</div>
                        <div class="metric-value ${roiClass}">${trader.roi > 0 ? '+' : ''}${trader.roi.toFixed(1)}%</div>
                    </div>
                    <div>
                        <div style="color: #8b92a8;">Volume</div>
                        <div class="metric-value">$${trader.totalVolume.toFixed(0)}</div>
                    </div>
                    <div>
                        <div style="color: #8b92a8;">Trades</div>
                        <div class="metric-value">${trader.totalTrades} (${trader.resolvedTrades} resolved)</div>
                    </div>
                    <div>
                        <div style="color: #8b92a8;">Low-Liq</div>
                        <div class="metric-value">${(trader.lowLiqAccuracy * 100).toFixed(1)}%</div>
                    </div>
                    <div>
                        <div style="color: #8b92a8;">High-Liq</div>
                        <div class="metric-value">${(trader.highLiqAccuracy * 100).toFixed(1)}%</div>
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

// Initialize
console.log('Dashboard loaded');
