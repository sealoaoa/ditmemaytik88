const WebSocket = require('ws');
const express = require('express');
const cors = require('cors');

class GameWebSocketClient {
    constructor(url) {
        this.url = url;
        this.ws = null;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 5;
        this.reconnectDelay = 5000;
        this.isAuthenticated = false;
        this.sessionId = null;
        this.historyTx = [];        // Lịch sử bàn TX
        this.historyMd5 = [];       // Lịch sử bàn MD5
        this.lastUpdateTime = { tx: null, md5: null };
    }

    connect() {
        console.log('🔗 Connecting to WebSocket server (tik88)...');
        this.ws = new WebSocket(this.url, {
            headers: {
                'Host': 'api.apibinh.xyz',
                'Origin': 'https://play.tik88.vin',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36',
                'Pragma': 'no-cache',
                'Cache-Control': 'no-cache',
                'Accept-Encoding': 'gzip, deflate, br, zstd',
                'Accept-Language': 'vi-VN,vi;q=0.9,fr-FR;q=0.8,fr;q=0.7,en-US;q=0.6,en;q=0.5',
                'Sec-WebSocket-Extensions': 'permessage-deflate; client_max_window_bits',
                'Sec-WebSocket-Version': '13'
            }
        });
        this.setupEventHandlers();
    }

    setupEventHandlers() {
        this.ws.on('open', () => {
            console.log('✅ Connected to WebSocket server');
            this.reconnectAttempts = 0;
            this.sendAuthentication();
        });
        this.ws.on('message', (data) => this.handleMessage(data));
        this.ws.on('error', (error) => console.error('❌ WebSocket error:', error.message));
        this.ws.on('close', (code, reason) => {
            console.log(`🔌 Connection closed. Code: ${code}, Reason: ${String(reason)}`);
            this.isAuthenticated = false;
            this.sessionId = null;
            this.handleReconnect();
        });
        this.ws.on('pong', () => console.log('❤️  Heartbeat received from server'));
    }

    sendAuthentication() {
        console.log('🔐 Sending authentication...');
        const authMessage = [
            1,
            "MiniGame",
            "wanglin20199",
            "WangFlang1",
            {
                "signature": "2FA6B74B8FAF7CD5862E0C5A70394D5D3873D21AF37143F3722D77A9B5E058B1AAD096D27271BEEFB6B495656C6409C8A826FC582CD85250B8C1BD2E9ED4C39FC836BFD196930C8D5F82582D80E0C4C86E974DF6F37743E84FE50745E461E65FC2954C6965FECF9DB22C132F80E9300859F4FB9A183BB286EC858C656D2D7392",
                "info": {
                    "cs": "31aee17e47e7f3f8da6b56e9dea07567",
                    "phone": "84854677721",
                    "ipAddress": "113.185.40.84",
                    "isMerchant": false,
                    "userId": "a66bbc5a-b8a8-4ba1-a442-7573d25a74ee",
                    "deviceId": "050105373614200053736078036024",
                    "branch": "go789",
                    "isMktAccount": false,
                    "username": "wanglin20199",
                    "timestamp": 1766536541986
                },
                "pid": 4
            }
        ];
        this.sendRaw(authMessage);
    }

    sendPluginMessages() {
        console.log('🚀 Sending plugin initialization messages...');
        const pluginMessages = [
            [6, "MiniGame", "taixiuPlugin", { "cmd": 1005 }],
            [6, "MiniGame", "taixiuMd5Plugin", { "cmd": 1105 }],
            [6, "MiniGame", "taixiuLiveRoomPlugin", { "cmd": 1305, "rid": 0 }],
            [6, "MiniGame", "taixiuMd5v2Plugin", { "cmd": 1405 }],
            [6, "MiniGame", "lobbyPlugin", { "cmd": 10001 }]
        ];
        pluginMessages.forEach((message, index) => {
            setTimeout(() => {
                console.log(`📤 Sending plugin ${index+1}/${pluginMessages.length}: ${message[2]}`);
                this.sendRaw(message);
            }, index * 1000);
        });
        setInterval(() => this.refreshGameData(), 30000);
    }

    refreshGameData() {
        if (this.isAuthenticated && this.ws && this.ws.readyState === WebSocket.OPEN) {
            console.log('🔄 Refreshing game data...');
            this.sendRaw([6, "MiniGame", "taixiuPlugin", { "cmd": 1005 }]);
            setTimeout(() => this.sendRaw([6, "MiniGame", "taixiuMd5Plugin", { "cmd": 1105 }]), 1000);
        }
    }

    sendRaw(data) {
        if (this.ws.readyState === WebSocket.OPEN) {
            const jsonString = JSON.stringify(data);
            this.ws.send(jsonString);
            console.log('📤 Sent raw:', jsonString);
            return true;
        }
        console.log('⚠️ Cannot send, WebSocket not open');
        return false;
    }

    _mergeHistory(historyArray, newSessions) {
        if (!newSessions || !Array.isArray(newSessions)) return historyArray;
        const existingSids = new Set(historyArray.map(s => s.sid));
        const uniqueNew = newSessions.filter(s => !existingSids.has(s.sid));
        const merged = [...historyArray, ...uniqueNew];
        merged.sort((a, b) => b.sid - a.sid);
        return merged.slice(0, 1000);
    }

    handleMessage(data) {
        try {
            const parsed = JSON.parse(data);
            if (parsed[0] === 5 && parsed[1] && parsed[1].cmd === 1005) {
                console.log('🎯 Nhận được dữ liệu cmd 1005 (Bàn TX)');
                const gameData = parsed[1];
                if (gameData.htr && gameData.htr.length > 0) {
                    const latestSession = gameData.htr.reduce((p,c) => c.sid > p.sid ? c : p);
                    console.log(`🎲 Bàn TX - Phiên gần nhất: ${latestSession.sid} (${latestSession.d1},${latestSession.d2},${latestSession.d3})`);
                    this.historyTx = this._mergeHistory(this.historyTx, gameData.htr);
                    this.lastUpdateTime.tx = new Date();
                    console.log(`💾 Lịch sử TX hiện có: ${this.historyTx.length} phiên`);
                }
            }
            else if (parsed[0] === 5 && parsed[1] && parsed[1].cmd === 1105) {
                console.log('🎯 Nhận được dữ liệu cmd 1105 (Bàn MD5)');
                const gameData = parsed[1];
                if (gameData.htr && gameData.htr.length > 0) {
                    const latestSession = gameData.htr.reduce((p,c) => c.sid > p.sid ? c : p);
                    console.log(`🎲 Bàn MD5 - Phiên gần nhất: ${latestSession.sid} (${latestSession.d1},${latestSession.d2},${latestSession.d3})`);
                    this.historyMd5 = this._mergeHistory(this.historyMd5, gameData.htr);
                    this.lastUpdateTime.md5 = new Date();
                    console.log(`💾 Lịch sử MD5 hiện có: ${this.historyMd5.length} phiên`);
                }
            }
            else if (parsed[0] === 5 && parsed[1] && parsed[1].u) {
                console.log('🔑 Authentication successful!');
                this.isAuthenticated = true;
                setTimeout(() => this.sendPluginMessages(), 2000);
            }
            else if (parsed[0] === 1 && parsed[4] === "MiniGame") {
                console.log('✅ Session initialized');
                this.sessionId = parsed[3];
                console.log(`📋 Session ID: ${this.sessionId}`);
            }
            else if (parsed[0] === 7) console.log(`🔄 Plugin ${parsed[2]} response received`);
            else if (parsed[0] === 0) console.log('❤️  Heartbeat received');
        } catch (e) {
            console.log('📥 Raw message:', data.toString());
            console.error('❌ Parse error:', e.message);
        }
    }

    getLatestTxSession() {
        if (this.historyTx.length === 0) return { error: "Không có dữ liệu bàn TX", message: "Chưa nhận được phiên nào" };
        try {
            const latest = this.historyTx[0];
            const tong = latest.d1 + latest.d2 + latest.d3;
            const ket_qua = tong >= 11 ? "tài" : "xỉu";
            return {
                phien: latest.sid,
                xuc_xac_1: latest.d1, xuc_xac_2: latest.d2, xuc_xac_3: latest.d3,
                tong, ket_qua,
                timestamp: new Date().toISOString(),
                ban: "tai_xiu",
                last_updated: this.lastUpdateTime.tx?.toISOString() || null
            };
        } catch (e) { return { error: "Lỗi xử lý dữ liệu TX", message: e.message }; }
    }

    getLatestMd5Session() {
        if (this.historyMd5.length === 0) return { error: "Không có dữ liệu bàn MD5", message: "Chưa nhận được phiên nào" };
        try {
            const latest = this.historyMd5[0];
            const tong = latest.d1 + latest.d2 + latest.d3;
            const ket_qua = tong >= 11 ? "tài" : "xỉu";
            return {
                phien: latest.sid,
                xuc_xac_1: latest.d1, xuc_xac_2: latest.d2, xuc_xac_3: latest.d3,
                tong, ket_qua,
                timestamp: new Date().toISOString(),
                ban: "md5",
                last_updated: this.lastUpdateTime.md5?.toISOString() || null
            };
        } catch (e) { return { error: "Lỗi xử lý dữ liệu MD5", message: e.message }; }
    }

    // ==================== PHÂN TÍCH & DỰ ĐOÁN ====================
    _toResultArray(historyArray, limit = 200) {
        if (!historyArray || historyArray.length === 0) return [];
        return historyArray.slice(0, limit).map(s => (s.d1 + s.d2 + s.d3 >= 11 ? 'tài' : 'xỉu'));
    }

    _analyzeWindow(results) {
        if (results.length === 0) return null;
        const len = results.length;
        const taiCount = results.filter(r => r === 'tài').length;
        const freqTai = taiCount / len;
        const freqXiu = 1 - freqTai;

        let streak = 1;
        const first = results[0];
        for (let i = 1; i < len; i++) {
            if (results[i] === first) streak++;
            else break;
        }
        let streakContinueProb = 0.5;
        if (len > streak) {
            let continueCount = 0, totalEvents = 0;
            for (let i = 0; i <= len - streak - 1; i++) {
                if (results.slice(i, i + streak).every(r => r === first)) {
                    totalEvents++;
                    if (i + streak < len && results[i + streak] === first) continueCount++;
                }
            }
            if (totalEvents > 0) streakContinueProb = continueCount / totalEvents;
        }

        let m1 = { tai: 0.5, xiu: 0.5 };
        if (len >= 2) {
            let same = 0, diff = 0;
            for (let i = 0; i < len - 1; i++) {
                if (results[i] === first) {
                    if (results[i + 1] === first) same++;
                    else diff++;
                }
            }
            const total = same + diff;
            if (total > 0) {
                m1 = { [first]: same / total, [first === 'tài' ? 'xỉu' : 'tài']: diff / total };
            }
        }

        let m2 = null;
        if (len >= 3) {
            const lastTwo = results.slice(0, 2).join('-');
            const trans = {};
            for (let i = 0; i < len - 2; i++) {
                const key = results[i] + '-' + results[i + 1];
                if (!trans[key]) trans[key] = { tai: 0, xiu: 0 };
                trans[key][results[i + 2]]++;
            }
            if (trans[lastTwo]) {
                const t = trans[lastTwo];
                const total = t.tai + t.xiu;
                if (total > 0) m2 = { tai: t.tai / total, xiu: t.xiu / total };
            }
        }

        let pattern = { pred: null, conf: 0 };
        if (len >= 10) {
            const recent = results.slice(0, 10);
            if (recent[0] === recent[1]) pattern = { pred: recent[0], conf: 0.6 };
            else pattern = { pred: recent[0] === 'tài' ? 'xỉu' : 'tài', conf: 0.65 };
        }

        return { freqTai, freqXiu, streak: { length: streak, outcome: first, probContinue: streakContinueProb }, markov1: m1, markov2: m2, pattern };
    }

    predictNext(historyArray) {
        if (historyArray.length < 5) return { success: false, message: `Chỉ có ${historyArray.length} phiên, cần ít nhất 5` };
        const resultsAll = this._toResultArray(historyArray, 200);
        const windows = [
            { size: 20, weight: 1.0 },
            { size: 50, weight: 1.5 },
            { size: 100, weight: 2.0 },
            { size: 200, weight: 2.5 }
        ];

        let totalTaiScore = 0, totalXiuScore = 0, totalWeight = 0;
        const windowResults = [];

        for (let w of windows) {
            if (resultsAll.length < w.size) continue;
            const windowSlice = resultsAll.slice(0, w.size);
            const analysis = this._analyzeWindow(windowSlice);
            if (!analysis) continue;

            let taiScore = 0, xiuScore = 0, weightSum = 0;

            taiScore += analysis.freqTai * 1.0; xiuScore += analysis.freqXiu * 1.0; weightSum += 1.0;

            if (analysis.streak.outcome === 'tài') {
                taiScore += analysis.streak.probContinue * 1.2;
                xiuScore += (1 - analysis.streak.probContinue) * 1.2;
            } else {
                xiuScore += analysis.streak.probContinue * 1.2;
                taiScore += (1 - analysis.streak.probContinue) * 1.2;
            }
            weightSum += 1.2;

            taiScore += analysis.markov1.tai * 1.3; xiuScore += analysis.markov1.xiu * 1.3; weightSum += 1.3;

            if (analysis.markov2) {
                taiScore += analysis.markov2.tai * 1.5; xiuScore += analysis.markov2.xiu * 1.5; weightSum += 1.5;
            }

            if (analysis.pattern.pred) {
                if (analysis.pattern.pred === 'tài') {
                    taiScore += analysis.pattern.conf * 1.0;
                    xiuScore += (1 - analysis.pattern.conf) * 1.0;
                } else {
                    xiuScore += analysis.pattern.conf * 1.0;
                    taiScore += (1 - analysis.pattern.conf) * 1.0;
                }
                weightSum += 1.0;
            }

            const windowTai = taiScore / weightSum;
            const windowXiu = xiuScore / weightSum;
            windowResults.push({ size: w.size, tai: windowTai, xiu: windowXiu });

            totalTaiScore += windowTai * w.weight;
            totalXiuScore += windowXiu * w.weight;
            totalWeight += w.weight;
        }

        if (totalWeight === 0) return { success: false, message: "Không đủ dữ liệu để phân tích" };

        if (resultsAll.length >= 100) {
            const recent20 = resultsAll.slice(0, 20);
            const recent100 = resultsAll.slice(0, 100);
            const tai20 = recent20.filter(r => r === 'tài').length / 20;
            const tai100 = recent100.filter(r => r === 'tài').length / 100;
            const trend = tai20 - tai100;
            if (trend > 0.1) { totalTaiScore *= 1.02; totalXiuScore *= 0.98; }
            else if (trend < -0.1) { totalTaiScore *= 0.98; totalXiuScore *= 1.02; }
        }

        const finalTai = totalTaiScore / totalWeight;
        const finalXiu = totalXiuScore / totalWeight;
        let prediction = finalTai > finalXiu ? 'tài' : (finalXiu > finalTai ? 'xỉu' : 'không xác định');
        let confidence = prediction === 'tài' ? finalTai * 100 : (prediction === 'xỉu' ? finalXiu * 100 : 0);
        if (isNaN(confidence)) confidence = 0;

        const latestSession = historyArray[0]?.sid || null;
        const nextSession = latestSession ? latestSession + 1 : null;

        return {
            success: true,
            prediction,
            confidence: Math.round(confidence * 10) / 10 + '%',
            next_session: nextSession,
            analysis: { totalSessions: resultsAll.length, windows: windowResults, recentResults: resultsAll.slice(0, 20) }
        };
    }

    getTxPrediction() {
        if (this.historyTx.length === 0) return { error: 'Không có dữ liệu bàn TX', message: 'Chưa nhận được phiên nào' };
        return this.predictNext(this.historyTx);
    }

    getMd5Prediction() {
        if (this.historyMd5.length === 0) return { error: 'Không có dữ liệu bàn MD5', message: 'Chưa nhận được phiên nào' };
        return this.predictNext(this.historyMd5);
    }

    handleReconnect() {
        if (this.reconnectAttempts < this.maxReconnectAttempts) {
            this.reconnectAttempts++;
            const delay = this.reconnectDelay * this.reconnectAttempts;
            console.log(`🔄 Attempting to reconnect in ${delay}ms (Attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
            setTimeout(() => this.connect(), delay);
        } else console.log('❌ Max reconnection attempts reached');
    }

    startHeartbeat() {
        setInterval(() => {
            if (this.ws?.readyState === WebSocket.OPEN) this.sendRaw([0, this.sessionId || ""]);
        }, 25000);
    }

    close() { if (this.ws) this.ws.close(); }
}

// EXPRESS
const app = express();
const PORT = 3004;
app.use(cors());
app.use(express.json());

const client = new GameWebSocketClient(
    'wss://api.apibinh.xyz/websocket?d=YW1SdWFXSnVhQT09fDJ8MTc2NjUzNjU0MTM3MHw0YTAxZjZhY2JjMGRhYjhkNWE1YzM3YzVjMmVlM2JjYXwyZmQ4Y2ZmZmM1NDQ5MGY3N2QyODg5ZWIyM2IzZGFlYg=='
);
client.connect();

app.get('/api/tx', (req, res) => { const d = client.getLatestTxSession(); d.error ? res.status(404).json(d) : res.json(d); });
app.get('/api/md5', (req, res) => { const d = client.getLatestMd5Session(); d.error ? res.status(404).json(d) : res.json(d); });
app.get('/api/all', (req, res) => res.json({ tai_xiu: client.getLatestTxSession(), md5: client.getLatestMd5Session(), timestamp: new Date().toISOString() }));
app.get('/api/status', (req, res) => res.json({
    status: "running",
    websocket_connected: client.ws?.readyState === WebSocket.OPEN,
    authenticated: client.isAuthenticated,
    tx_history_count: client.historyTx.length,
    md5_history_count: client.historyMd5.length,
    tx_last_updated: client.lastUpdateTime.tx?.toISOString() || null,
    md5_last_updated: client.lastUpdateTime.md5?.toISOString() || null,
    timestamp: new Date().toISOString()
}));
app.get('/api/refresh', (req, res) => {
    if (client.isAuthenticated && client.ws?.readyState === WebSocket.OPEN) {
        client.refreshGameData();
        res.json({ message: "Đã gửi yêu cầu refresh dữ liệu", timestamp: new Date().toISOString() });
    } else res.status(400).json({ error: "Không thể refresh", message: "WebSocket chưa kết nối hoặc chưa xác thực" });
});

// Dự đoán đầy đủ
app.get('/api/predict/tx', (req, res) => { try { res.json({ board: 'tai_xiu', ...client.getTxPrediction(), timestamp: new Date().toISOString() }); } catch (e) { res.status(500).json({ error: e.message }); } });
app.get('/api/predict/md5', (req, res) => { try { res.json({ board: 'md5', ...client.getMd5Prediction(), timestamp: new Date().toISOString() }); } catch (e) { res.status(500).json({ error: e.message }); } });
app.get('/api/predict/all', (req, res) => { try { res.json({ tai_xiu: client.getTxPrediction(), md5: client.getMd5Prediction(), timestamp: new Date().toISOString() }); } catch (e) { res.status(500).json({ error: e.message }); } });

// Rút gọn (short)
app.get('/api/predict/tx/short', (req, res) => {
    try {
        const pred = client.getTxPrediction();
        const latest = client.getLatestTxSession();
        res.json({
            board: 'tai_xiu',
            prediction: pred.prediction || 'không xác định',
            confidence: pred.confidence || '0%',
            latest_session: latest.phien || null,
            next_session: pred.next_session || null,
            timestamp: new Date().toISOString()
        });
    } catch (e) { res.status(500).json({ error: e.message }); }
});
app.get('/api/predict/md5/short', (req, res) => {
    try {
        const pred = client.getMd5Prediction();
        const latest = client.getLatestMd5Session();
        res.json({
            board: 'md5',
            prediction: pred.prediction || 'không xác định',
            confidence: pred.confidence || '0%',
            latest_session: latest.phien || null,
            next_session: pred.next_session || null,
            timestamp: new Date().toISOString()
        });
    } catch (e) { res.status(500).json({ error: e.message }); }
});
app.get('/api/predict/all/short', (req, res) => {
    try {
        const txPred = client.getTxPrediction();
        const txLatest = client.getLatestTxSession();
        const md5Pred = client.getMd5Prediction();
        const md5Latest = client.getLatestMd5Session();
        res.json({
            tai_xiu: {
                prediction: txPred.prediction || 'không xác định',
                confidence: txPred.confidence || '0%',
                latest_session: txLatest.phien || null,
                next_session: txPred.next_session || null
            },
            md5: {
                prediction: md5Pred.prediction || 'không xác định',
                confidence: md5Pred.confidence || '0%',
                latest_session: md5Latest.phien || null,
                next_session: md5Pred.next_session || null
            },
            timestamp: new Date().toISOString()
        });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/', (req, res) => {
    res.send(`
        <html>
            <head><title>TIK88 - Dự đoán siêu cấp</title>
            <style>
                body { font-family: Arial; margin: 40px; background: #f0f2f5; }
                h1 { color: #333; text-align: center; }
                .endpoint { background: white; padding: 20px; border-radius: 10px; margin:20px 0; }
                .btn { background: #1890ff; color:white; padding:10px 15px; border:none; border-radius:5px; cursor:pointer; margin:5px; }
                .btn:hover { background: #40a9ff; }
            </style>
            </head>
            <body>
                <h1>🎲 TIK88 - Dự đoán Tài Xỉu siêu cấp (đa cửa sổ + xu hướng)</h1>
                <div class="endpoint">
                    <h3>📊 API endpoints:</h3>
                    <ul>
                        <li><code>GET /api/predict/tx/short</code> - Dự đoán TX (rút gọn + next_session)</li>
                        <li><code>GET /api/predict/md5/short</code> - Dự đoán MD5 (rút gọn + next_session)</li>
                        <li><code>GET /api/status</code> - Trạng thái & số lượng lịch sử</li>
                    </ul>
                    <button class="btn" onclick="fetch('/api/predict/tx/short').then(r=>r.json()).then(d=>alert(JSON.stringify(d,null,2)))">Dự đoán TX</button>
                    <button class="btn" onclick="fetch('/api/predict/md5/short').then(r=>r.json()).then(d=>alert(JSON.stringify(d,null,2)))">Dự đoán MD5</button>
                </div>
                <div id="status"></div>
                <script>
                    async function updateStatus() {
                        let res = await fetch('/api/status');
                        let data = await res.json();
                        document.getElementById('status').innerHTML = \`
                            <div class="endpoint">
                                <h3>📡 Trạng thái</h3>
                                <p>WebSocket: \${data.websocket_connected ? '✅' : '❌'}</p>
                                <p>Lịch sử TX: \${data.tx_history_count} phiên</p>
                                <p>Lịch sử MD5: \${data.md5_history_count} phiên</p>
                                <p>Cập nhật TX: \${data.tx_last_updated ? new Date(data.tx_last_updated).toLocaleTimeString() : 'chưa có'}</p>
                                <p>Cập nhật MD5: \${data.md5_last_updated ? new Date(data.md5_last_updated).toLocaleTimeString() : 'chưa có'}</p>
                            </div>
                        \`;
                    }
                    setInterval(updateStatus, 3000);
                    updateStatus();
                </script>
            </body>
        </html>
    `);
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 TIK88 server đang chạy tại: http://localhost:${PORT}`);
});

setTimeout(() => client.startHeartbeat(), 10000);
process.on('SIGINT', () => { client.close(); process.exit(); });

module.exports = { GameWebSocketClient, app };
