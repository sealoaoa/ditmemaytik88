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
        this.latestTxData = null;   // Dữ liệu bàn tài xỉu thường (cmd 1005)
        this.latestMd5Data = null;  // Dữ liệu bàn MD5 (cmd 1105)
        this.lastUpdateTime = {
            tx: null,
            md5: null
        };
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

        this.ws.on('message', (data) => {
            this.handleMessage(data);
        });

        this.ws.on('error', (error) => {
            console.error('❌ WebSocket error:', error.message);
        });

        this.ws.on('close', (code, reason) => {
            console.log(`🔌 Connection closed. Code: ${code}, Reason: ${reason}`);
            this.isAuthenticated = false;
            this.sessionId = null;
            this.handleReconnect();
        });

        this.ws.on('pong', () => {
            console.log('❤️  Heartbeat received from server');
        });
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
                console.log(`📤 Sending plugin ${index + 1}/${pluginMessages.length}: ${message[2]}`);
                this.sendRaw(message);
            }, index * 1000);
        });

        setInterval(() => {
            this.refreshGameData();
        }, 30000);
    }

    refreshGameData() {
        if (this.isAuthenticated && this.ws && this.ws.readyState === WebSocket.OPEN) {
            console.log('🔄 Refreshing game data...');
            const refreshTx = [6, "MiniGame", "taixiuPlugin", { "cmd": 1005 }];
            const refreshMd5 = [6, "MiniGame", "taixiuMd5Plugin", { "cmd": 1105 }];
            this.sendRaw(refreshTx);
            setTimeout(() => this.sendRaw(refreshMd5), 1000);
        }
    }

    sendRaw(data) {
        if (this.ws.readyState === WebSocket.OPEN) {
            const jsonString = JSON.stringify(data);
            this.ws.send(jsonString);
            console.log('📤 Sent raw:', jsonString);
            return true;
        } else {
            console.log('⚠️ Cannot send, WebSocket not open');
            return false;
        }
    }

    handleMessage(data) {
        try {
            const parsed = JSON.parse(data);
            
            // XỬ LÝ CMD 1005 - BÀN TÀI XỈU THƯỜNG
            if (parsed[0] === 5 && parsed[1] && parsed[1].cmd === 1005) {
                console.log('🎯 Nhận được dữ liệu cmd 1005 (Bàn TX)');
                const gameData = parsed[1];
                if (gameData.htr && gameData.htr.length > 0) {
                    const latestSession = gameData.htr.reduce((prev, current) => (current.sid > prev.sid) ? current : prev);
                    console.log(`🎲 Bàn TX - Phiên gần nhất: ${latestSession.sid} (${latestSession.d1},${latestSession.d2},${latestSession.d3})`);
                    this.latestTxData = gameData;
                    this.lastUpdateTime.tx = new Date();
                }
            }
            
            // XỬ LÝ CMD 1105 - BÀN MD5
            else if (parsed[0] === 5 && parsed[1] && parsed[1].cmd === 1105) {
                console.log('🎯 Nhận được dữ liệu cmd 1105 (Bàn MD5)');
                const gameData = parsed[1];
                if (gameData.htr && gameData.htr.length > 0) {
                    const latestSession = gameData.htr.reduce((prev, current) => (current.sid > prev.sid) ? current : prev);
                    console.log(`🎲 Bàn MD5 - Phiên gần nhất: ${latestSession.sid} (${latestSession.d1},${latestSession.d2},${latestSession.d3})`);
                    this.latestMd5Data = gameData;
                    this.lastUpdateTime.md5 = new Date();
                }
            }
            
            // Xử lý response authentication (type 5 nhưng không có cmd)
            else if (parsed[0] === 5 && parsed[1] && parsed[1].u) {
                console.log('🔑 Authentication successful!');
                const userData = parsed[1];
                console.log(`✅ User: ${userData.u}`);
                this.isAuthenticated = true;
                setTimeout(() => {
                    console.log('🔄 Starting to send plugin messages...');
                    this.sendPluginMessages();
                }, 2000);
            }
            
            // Xử lý response type 1 - Session initialization
            else if (parsed[0] === 1 && parsed[4] === "MiniGame") {
                console.log('✅ Session initialized');
                this.sessionId = parsed[3];
                console.log(`📋 Session ID: ${this.sessionId}`);
            }
            
            // Xử lý response type 7 - Plugin response
            else if (parsed[0] === 7) {
                const pluginName = parsed[2];
                console.log(`🔄 Plugin ${pluginName} response received`);
            }
            
            // Xử lý heartbeat/ping response
            else if (parsed[0] === 0) {
                console.log('❤️  Heartbeat received');
            }
            
        } catch (e) {
            console.log('📥 Raw message:', data.toString());
            console.error('❌ Parse error:', e.message);
        }
    }

    // Hàm lấy phiên gần nhất từ bàn TX
    getLatestTxSession() {
        if (!this.latestTxData || !this.latestTxData.htr || this.latestTxData.htr.length === 0) {
            return { error: "Không có dữ liệu bàn TX", message: "Chưa nhận được dữ liệu từ server hoặc dữ liệu trống" };
        }
        try {
            const latestSession = this.latestTxData.htr.reduce((prev, current) => (current.sid > prev.sid) ? current : prev);
            const tong = latestSession.d1 + latestSession.d2 + latestSession.d3;
            const ket_qua = (tong >= 11) ? "tài" : "xỉu";
            return {
                phien: latestSession.sid,
                xuc_xac_1: latestSession.d1,
                xuc_xac_2: latestSession.d2,
                xuc_xac_3: latestSession.d3,
                tong: tong,
                ket_qua: ket_qua,
                timestamp: new Date().toISOString(),
                ban: "tai_xiu",
                last_updated: this.lastUpdateTime.tx ? this.lastUpdateTime.tx.toISOString() : null
            };
        } catch (error) {
            return { error: "Lỗi xử lý dữ liệu TX", message: error.message };
        }
    }

    // Hàm lấy phiên gần nhất từ bàn MD5
    getLatestMd5Session() {
        if (!this.latestMd5Data || !this.latestMd5Data.htr || this.latestMd5Data.htr.length === 0) {
            return { error: "Không có dữ liệu bàn MD5", message: "Chưa nhận được dữ liệu từ server hoặc dữ liệu trống" };
        }
        try {
            const latestSession = this.latestMd5Data.htr.reduce((prev, current) => (current.sid > prev.sid) ? current : prev);
            const tong = latestSession.d1 + latestSession.d2 + latestSession.d3;
            const ket_qua = (tong >= 11) ? "tài" : "xỉu";
            return {
                phien: latestSession.sid,
                xuc_xac_1: latestSession.d1,
                xuc_xac_2: latestSession.d2,
                xuc_xac_3: latestSession.d3,
                tong: tong,
                ket_qua: ket_qua,
                timestamp: new Date().toISOString(),
                ban: "md5",
                last_updated: this.lastUpdateTime.md5 ? this.lastUpdateTime.md5.toISOString() : null
            };
        } catch (error) {
            return { error: "Lỗi xử lý dữ liệu MD5", message: error.message };
        }
    }

    // ==================== PHÂN TÍCH VÀ DỰ ĐOÁN NÂNG CAO ====================
    _getRecentResults(historyArray, limit = 50) {
        if (!historyArray || historyArray.length === 0) return [];
        const sorted = [...historyArray].sort((a, b) => b.sid - a.sid);
        return sorted.slice(0, limit).map(s => (s.d1 + s.d2 + s.d3 >= 11 ? 'tài' : 'xỉu'));
    }

    _overallProbability(results) {
        if (results.length === 0) return { tai: 0.5, xiu: 0.5 };
        const tai = results.filter(r => r === 'tài').length;
        return { tai: tai / results.length, xiu: (results.length - tai) / results.length };
    }

    _streakAnalysis(results) {
        if (results.length === 0) return { streak: 0, outcome: null, probContinue: 0.5 };
        let streak = 1;
        const first = results[0];
        for (let i = 1; i < results.length; i++) {
            if (results[i] === first) streak++;
            else break;
        }
        let continueCount = 0, totalStreakEvents = 0;
        for (let i = 0; i < results.length - streak; i++) {
            let j = 0;
            while (j < streak && i + j < results.length && results[i + j] === first) j++;
            if (j >= streak) {
                totalStreakEvents++;
                if (i + streak < results.length && results[i + streak] === first) continueCount++;
            }
        }
        let prob = totalStreakEvents > 0 ? continueCount / totalStreakEvents : 0.5;
        if (isNaN(prob)) prob = 0.5;
        return { streak, outcome: first, probContinue: prob };
    }

    _markov1(results) {
        if (results.length < 2) return { tai: 0.5, xiu: 0.5 };
        const last = results[0];
        let countSame = 0, countDiff = 0;
        for (let i = 0; i < results.length - 1; i++) {
            if (results[i] === last) {
                if (results[i + 1] === last) countSame++;
                else countDiff++;
            }
        }
        const total = countSame + countDiff;
        if (total === 0) return { tai: 0.5, xiu: 0.5 };
        let r = {
            [last]: countSame / total,
            [last === 'tài' ? 'xỉu' : 'tài']: countDiff / total
        };
        if (typeof r.tai !== 'number') r.tai = 0.5;
        if (typeof r.xiu !== 'number') r.xiu = 0.5;
        return r;
    }

    _markov2(results) {
        if (results.length < 3) return null;
        const lastTwo = results.slice(0, 2).join('-');
        const transitions = {};
        for (let i = 0; i < results.length - 2; i++) {
            const key = results[i] + '-' + results[i + 1];
            const next = results[i + 2];
            if (!transitions[key]) transitions[key] = { tai: 0, xiu: 0 };
            transitions[key][next]++;
        }
        if (!transitions[lastTwo]) return null;
        const t = transitions[lastTwo];
        const total = t.tai + t.xiu;
        if (total === 0) return null;
        return { tai: t.tai / total, xiu: t.xiu / total };
    }

    _patternAnalysis(results) {
        if (results.length < 10) return { prediction: null, confidence: 0 };
        const recent = results.slice(0, 10);
        if (recent[0] === recent[1]) {
            return { prediction: recent[0], confidence: 0.6 };
        } else {
            return { prediction: recent[0] === 'tài' ? 'xỉu' : 'tài', confidence: 0.65 };
        }
    }

    predictNext(historyArray) {
        const results = this._getRecentResults(historyArray, 50);
        if (results.length < 5) {
            return { success: false, message: `Chỉ có ${results.length} phiên, cần ít nhất 5 phiên để dự đoán` };
        }

        const overall = this._overallProbability(results);
        const streak = this._streakAnalysis(results);
        let streakProb = streak.probContinue;
        if (isNaN(streakProb)) streakProb = 0.5;
        const markov1 = this._markov1(results);
        let m1t = typeof markov1.tai === 'number' ? markov1.tai : 0.5;
        let m1x = typeof markov1.xiu === 'number' ? markov1.xiu : 0.5;
        const markov2 = this._markov2(results);
        let m2t = markov2?.tai ?? null, m2x = markov2?.xiu ?? null;
        const pattern = this._patternAnalysis(results);
        let patternPred = pattern.prediction, patternConf = pattern.confidence;

        const wOverall = 1.0;
        const wStreak = streak.streak >= 3 ? 2.0 : 1.0;
        const wMarkov1 = 1.5;
        const wMarkov2 = markov2 ? 2.0 : 0;
        const wPattern = patternConf > 0.6 ? 1.2 : (patternPred ? 0.5 : 0);

        let taiScore = 0, xiuScore = 0, totalWeight = 0;

        taiScore += overall.tai * wOverall;
        xiuScore += overall.xiu * wOverall;
        totalWeight += wOverall;

        if (streak.outcome === 'tài') {
            taiScore += streakProb * wStreak;
            xiuScore += (1 - streakProb) * wStreak;
        } else {
            xiuScore += streakProb * wStreak;
            taiScore += (1 - streakProb) * wStreak;
        }
        totalWeight += wStreak;

        taiScore += m1t * wMarkov1;
        xiuScore += m1x * wMarkov1;
        totalWeight += wMarkov1;

        if (markov2) {
            taiScore += m2t * wMarkov2;
            xiuScore += m2x * wMarkov2;
            totalWeight += wMarkov2;
        }

        if (patternPred) {
            if (patternPred === 'tài') {
                taiScore += patternConf * wPattern;
                xiuScore += (1 - patternConf) * wPattern;
            } else {
                xiuScore += patternConf * wPattern;
                taiScore += (1 - patternConf) * wPattern;
            }
            totalWeight += wPattern;
        }

        if (isNaN(taiScore) || isNaN(xiuScore) || isNaN(totalWeight) || totalWeight === 0) {
            return { success: false, message: 'Lỗi tính toán dự đoán (NaN)' };
        }

        const finalTai = taiScore / totalWeight;
        const finalXiu = xiuScore / totalWeight;
        let prediction = finalTai > finalXiu ? 'tài' : (finalXiu > finalTai ? 'xỉu' : 'không xác định');
        let confidence = prediction === 'tài' ? finalTai * 100 : (prediction === 'xỉu' ? finalXiu * 100 : 0);
        if (isNaN(confidence)) confidence = 0;

        return {
            success: true,
            prediction,
            confidence: Math.round(confidence * 10) / 10 + '%',
            analysis: {
                totalSessions: results.length,
                recentResults: results.slice(0, 15),
                overall,
                streak: { length: streak.streak, outcome: streak.outcome, probContinue: Math.round(streak.probContinue * 100) / 100 },
                markov1: { tai: m1t, xiu: m1x },
                markov2: markov2 ? { tai: m2t, xiu: m2x } : null,
                pattern: patternPred ? { prediction: patternPred, confidence: patternConf } : null,
                weightedScores: { tai: Math.round(finalTai * 1000) / 1000, xiu: Math.round(finalXiu * 1000) / 1000 }
            }
        };
    }

    getTxPrediction() {
        if (!this.latestTxData || !this.latestTxData.htr || this.latestTxData.htr.length === 0) {
            return { error: 'Không có dữ liệu bàn TX', message: 'Chưa nhận được dữ liệu từ server hoặc dữ liệu trống' };
        }
        return this.predictNext(this.latestTxData.htr);
    }

    getMd5Prediction() {
        if (!this.latestMd5Data || !this.latestMd5Data.htr || this.latestMd5Data.htr.length === 0) {
            return { error: 'Không có dữ liệu bàn MD5', message: 'Chưa nhận được dữ liệu từ server hoặc dữ liệu trống' };
        }
        return this.predictNext(this.latestMd5Data.htr);
    }

    handleReconnect() {
        if (this.reconnectAttempts < this.maxReconnectAttempts) {
            this.reconnectAttempts++;
            const delay = this.reconnectDelay * this.reconnectAttempts;
            console.log(`🔄 Attempting to reconnect in ${delay}ms (Attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
            setTimeout(() => {
                console.log('🔄 Reconnecting...');
                this.connect();
            }, delay);
        } else {
            console.log('❌ Max reconnection attempts reached');
        }
    }

    startHeartbeat() {
        setInterval(() => {
            if (this.ws && this.ws.readyState === WebSocket.OPEN) {
                const heartbeatMsg = [0, this.sessionId || ""];
                this.ws.send(JSON.stringify(heartbeatMsg));
                console.log('❤️  Sending heartbeat...');
            }
        }, 25000);
    }

    close() {
        if (this.ws) {
            this.ws.close();
        }
    }
}

// KHỞI TẠO EXPRESS SERVER
const app = express();
const PORT = 3004; // Dùng port 3004 để tránh xung đột với các game khác

app.use(cors());
app.use(express.json());

// Tạo WebSocket client - URL cũ từ tik88
const client = new GameWebSocketClient(
    'wss://api.apibinh.xyz/websocket?d=YW1SdWFXSnVhQT09fDJ8MTc2NjUzNjU0MTM3MHw0YTAxZjZhY2JjMGRhYjhkNWE1YzM3YzVjMmVlM2JjYXwyZmQ4Y2ZmZmM1NDQ5MGY3N2QyODg5ZWIyM2IzZGFlYg=='
);
client.connect();

// ==================== API endpoints ====================
app.get('/api/tx', (req, res) => {
    const data = client.getLatestTxSession();
    if (data.error) return res.status(404).json(data);
    res.json(data);
});

app.get('/api/md5', (req, res) => {
    const data = client.getLatestMd5Session();
    if (data.error) return res.status(404).json(data);
    res.json(data);
});

app.get('/api/all', (req, res) => {
    res.json({
        tai_xiu: client.getLatestTxSession(),
        md5: client.getLatestMd5Session(),
        timestamp: new Date().toISOString()
    });
});

app.get('/api/status', (req, res) => {
    res.json({
        status: "running",
        websocket_connected: client.ws ? client.ws.readyState === WebSocket.OPEN : false,
        authenticated: client.isAuthenticated,
        has_tx_data: !!(client.latestTxData?.htr?.length),
        has_md5_data: !!(client.latestMd5Data?.htr?.length),
        tx_last_updated: client.lastUpdateTime.tx ? client.lastUpdateTime.tx.toISOString() : null,
        md5_last_updated: client.lastUpdateTime.md5 ? client.lastUpdateTime.md5.toISOString() : null,
        timestamp: new Date().toISOString()
    });
});

app.get('/api/refresh', (req, res) => {
    if (client.isAuthenticated && client.ws && client.ws.readyState === WebSocket.OPEN) {
        client.refreshGameData();
        res.json({ message: "Đã gửi yêu cầu refresh dữ liệu", timestamp: new Date().toISOString() });
    } else {
        res.status(400).json({ error: "Không thể refresh", message: "WebSocket chưa kết nối hoặc chưa xác thực" });
    }
});

// ==================== API dự đoán (đầy đủ) ====================
app.get('/api/predict/tx', (req, res) => {
    try {
        res.json({ board: 'tai_xiu', ...client.getTxPrediction(), timestamp: new Date().toISOString() });
    } catch (error) {
        res.status(500).json({ error: 'Lỗi server', message: error.message });
    }
});

app.get('/api/predict/md5', (req, res) => {
    try {
        res.json({ board: 'md5', ...client.getMd5Prediction(), timestamp: new Date().toISOString() });
    } catch (error) {
        res.status(500).json({ error: 'Lỗi server', message: error.message });
    }
});

app.get('/api/predict/all', (req, res) => {
    try {
        res.json({
            tai_xiu: client.getTxPrediction(),
            md5: client.getMd5Prediction(),
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        res.status(500).json({ error: 'Lỗi server', message: error.message });
    }
});

// ==================== API dự đoán rút gọn (short) ====================
app.get('/api/predict/tx/short', (req, res) => {
    try {
        const pred = client.getTxPrediction();
        const latest = client.getLatestTxSession();
        res.json({
            board: 'tai_xiu',
            prediction: pred.prediction || 'không xác định',
            confidence: pred.confidence || '0%',
            latest_session: latest.phien || null,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        res.status(500).json({ error: 'Lỗi server', message: error.message });
    }
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
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        res.status(500).json({ error: 'Lỗi server', message: error.message });
    }
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
                latest_session: txLatest.phien || null
            },
            md5: {
                prediction: md5Pred.prediction || 'không xác định',
                confidence: md5Pred.confidence || '0%',
                latest_session: md5Latest.phien || null
            },
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        res.status(500).json({ error: 'Lỗi server', message: error.message });
    }
});

// Trang chủ đơn giản
app.get('/', (req, res) => {
    res.send(`
        <html>
            <head><title>Tik88 - Dự đoán Tài Xỉu</title>
            <style>
                body { font-family: Arial; margin: 40px; background: #f0f2f5; }
                h1 { color: #333; text-align: center; }
                .endpoint { background: white; padding: 20px; border-radius: 10px; margin:20px 0; }
                .btn { background: #1890ff; color:white; padding:10px 15px; border:none; border-radius:5px; cursor:pointer; margin:5px; }
                .btn:hover { background: #40a9ff; }
            </style>
            </head>
            <body>
                <h1>🎲 Tik88 - Dự đoán Tài Xỉu thông minh</h1>
                <div class="endpoint">
                    <h3>📊 API endpoints:</h3>
                    <ul>
                        <li><code>GET /api/tx</code> - Phiên mới nhất bàn TX</li>
                        <li><code>GET /api/md5</code> - Phiên mới nhất bàn MD5</li>
                        <li><code>GET /api/predict/tx</code> - Dự đoán bàn TX (đầy đủ)</li>
                        <li><code>GET /api/predict/tx/short</code> - Dự đoán TX (rút gọn)</li>
                        <li><code>GET /api/predict/md5/short</code> - Dự đoán MD5 (rút gọn)</li>
                        <li><code>GET /api/status</code> - Trạng thái</li>
                    </ul>
                    <button class="btn" onclick="fetch('/api/predict/tx/short').then(r=>r.json()).then(d=>alert(JSON.stringify(d,null,2)))">Dự đoán TX (short)</button>
                    <button class="btn" onclick="fetch('/api/predict/md5/short').then(r=>r.json()).then(d=>alert(JSON.stringify(d,null,2)))">Dự đoán MD5 (short)</button>
                </div>
                <div id="status"></div>
                <script>
                    async function updateStatus() {
                        let res = await fetch('/api/status');
                        let data = await res.json();
                        document.getElementById('status').innerHTML = \`
                            <div class="endpoint">
                                <h3>📡 Trạng thái hệ thống</h3>
                                <p>WebSocket: \${data.websocket_connected ? '✅' : '❌'}</p>
                                <p>Xác thực: \${data.authenticated ? '✅' : '⏳'}</p>
                                <p>Dữ liệu TX: \${data.has_tx_data ? '✅' : '⏳'} (cập nhật: \${data.tx_last_updated ? new Date(data.tx_last_updated).toLocaleTimeString() : 'chưa có'})</p>
                                <p>Dữ liệu MD5: \${data.has_md5_data ? '✅' : '⏳'} (cập nhật: \${data.md5_last_updated ? new Date(data.md5_last_updated).toLocaleTimeString() : 'chưa có'})</p>
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
    console.log(`🚀 Tik88 server đang chạy tại: http://localhost:${PORT}`);
});

setTimeout(() => {
    client.startHeartbeat();
}, 10000);

process.on('SIGINT', () => {
    console.log('\n👋 Closing WebSocket connection and server...');
    client.close();
    process.exit();
});

module.exports = { GameWebSocketClient, app };
