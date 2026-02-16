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
        console.log('🔗 Connecting to WebSocket server...');
        
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
            [
                6,
                "MiniGame",
                "taixiuPlugin",
                {
                    "cmd": 1005
                }
            ],
            [
                6,
                "MiniGame",
                "taixiuMd5Plugin",
                {
                    "cmd": 1105
                }
            ],
            [
                6,
                "MiniGame",
                "taixiuLiveRoomPlugin",
                {
                    "cmd": 1305,
                    "rid": 0
                }
            ],
            [
                6,
                "MiniGame",
                "taixiuMd5v2Plugin",
                {
                    "cmd": 1405
                }
            ],
            [
                6,
                "MiniGame",
                "lobbyPlugin",
                {
                    "cmd": 10001
                }
            ]
        ];

        pluginMessages.forEach((message, index) => {
            setTimeout(() => {
                console.log(`📤 Sending plugin ${index + 1}/${pluginMessages.length}: ${message[2]}`);
                this.sendRaw(message);
            }, index * 1000);
        });

        // Thiết lập interval để refresh dữ liệu mỗi 30 giây
        setInterval(() => {
            this.refreshGameData();
        }, 30000);
    }

    refreshGameData() {
        if (this.isAuthenticated && this.ws && this.ws.readyState === WebSocket.OPEN) {
            console.log('🔄 Refreshing game data...');
            
            // Gửi refresh cả 2 bàn
            const refreshTx = [
                6,
                "MiniGame",
                "taixiuPlugin",
                {
                    "cmd": 1005
                }
            ];
            
            const refreshMd5 = [
                6,
                "MiniGame",
                "taixiuMd5Plugin",
                {
                    "cmd": 1105
                }
            ];
            
            this.sendRaw(refreshTx);
            setTimeout(() => {
                this.sendRaw(refreshMd5);
            }, 1000);
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
                    // Tìm phiên gần nhất
                    const latestSession = gameData.htr.reduce((prev, current) => {
                        return (current.sid > prev.sid) ? current : prev;
                    });
                    
                    console.log(`🎲 Bàn TX - Phiên gần nhất: ${latestSession.sid} (${latestSession.d1},${latestSession.d2},${latestSession.d3})`);
                    
                    // Lưu dữ liệu
                    this.latestTxData = gameData;
                    this.lastUpdateTime.tx = new Date();
                    console.log('💾 Đã cập nhật dữ liệu bàn TX');
                }
            }
            
            // XỬ LÝ CMD 1105 - BÀN MD5
            else if (parsed[0] === 5 && parsed[1] && parsed[1].cmd === 1105) {
                console.log('🎯 Nhận được dữ liệu cmd 1105 (Bàn MD5)');
                
                const gameData = parsed[1];
                
                if (gameData.htr && gameData.htr.length > 0) {
                    // Tìm phiên gần nhất
                    const latestSession = gameData.htr.reduce((prev, current) => {
                        return (current.sid > prev.sid) ? current : prev;
                    });
                    
                    console.log(`🎲 Bàn MD5 - Phiên gần nhất: ${latestSession.sid} (${latestSession.d1},${latestSession.d2},${latestSession.d3})`);
                    
                    // Lưu dữ liệu
                    this.latestMd5Data = gameData;
                    this.lastUpdateTime.md5 = new Date();
                    console.log('💾 Đã cập nhật dữ liệu bàn MD5');
                }
            }
            
            // Xử lý response authentication (type 5 nhưng không có cmd)
            else if (parsed[0] === 5 && parsed[1] && parsed[1].u) {
                console.log('🔑 Authentication successful!');
                
                const userData = parsed[1];
                console.log(`✅ User: ${userData.u}`);
                this.isAuthenticated = true;
                
                // Sau khi xác thực thành công, đợi 2 giây rồi gửi plugin messages
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
            return {
                error: "Không có dữ liệu bàn TX",
                message: "Chưa nhận được dữ liệu từ server hoặc dữ liệu trống"
            };
        }

        try {
            // Lấy phiên gần nhất (sid cao nhất)
            const latestSession = this.latestTxData.htr.reduce((prev, current) => {
                return (current.sid > prev.sid) ? current : prev;
            });

            // Tính tổng và xác định kết quả
            const tong = latestSession.d1 + latestSession.d2 + latestSession.d3;
            const ket_qua = (tong >= 11 && tong <= 18) ? "tài" : "xỉu";

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
            return {
                error: "Lỗi xử lý dữ liệu TX",
                message: error.message
            };
        }
    }

    // Hàm lấy phiên gần nhất từ bàn MD5
    getLatestMd5Session() {
        if (!this.latestMd5Data || !this.latestMd5Data.htr || this.latestMd5Data.htr.length === 0) {
            return {
                error: "Không có dữ liệu bàn MD5",
                message: "Chưa nhận được dữ liệu từ server hoặc dữ liệu trống"
            };
        }

        try {
            // Lấy phiên gần nhất (sid cao nhất)
            const latestSession = this.latestMd5Data.htr.reduce((prev, current) => {
                return (current.sid > prev.sid) ? current : prev;
            });

            // Tính tổng và xác định kết quả
            const tong = latestSession.d1 + latestSession.d2 + latestSession.d3;
            const ket_qua = (tong >= 11 && tong <= 18) ? "tài" : "xỉu";

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
            return {
                error: "Lỗi xử lý dữ liệu MD5",
                message: error.message
            };
        }
    }

    // ==================== PHÂN TÍCH VÀ DỰ ĐOÁN NÂNG CAO ====================

    // Chuyển đổi mảng lịch sử thành mảng kết quả (tài/xỉu) theo thứ tự mới nhất -> cũ nhất
    _getRecentResults(historyArray, limit = 50) {
        if (!historyArray || historyArray.length === 0) return [];
        const sorted = [...historyArray].sort((a, b) => b.sid - a.sid);
        return sorted.slice(0, limit).map(s => (s.d1 + s.d2 + s.d3 >= 11 ? 'tài' : 'xỉu'));
    }

    // Tính tần suất tổng thể
    _overallProbability(results) {
        if (results.length === 0) return { tai: 0.5, xiu: 0.5 };
        const tai = results.filter(r => r === 'tài').length;
        const xiu = results.length - tai;
        return {
            tai: tai / results.length,
            xiu: xiu / results.length
        };
    }

    // Phân tích streak (chuỗi liên tiếp)
    _streakAnalysis(results) {
        if (results.length === 0) return { streak: 0, outcome: null, probContinue: 0.5 };
        let streak = 1;
        const first = results[0];
        for (let i = 1; i < results.length; i++) {
            if (results[i] === first) streak++;
            else break;
        }
        // Tính xác suất tiếp tục streak dựa trên lịch sử
        // Tìm tất cả các streak có độ dài >= streak hiện tại và xem tỷ lệ phiên tiếp theo giống streak
        let continueCount = 0;
        let totalStreakEvents = 0;
        for (let i = 0; i < results.length - streak; i++) {
            // Kiểm tra xem từ i có streak dài ít nhất streak không
            let j = 0;
            while (j < streak && i + j < results.length && results[i + j] === first) j++;
            if (j >= streak) {
                totalStreakEvents++;
                if (i + streak < results.length && results[i + streak] === first) continueCount++;
            }
        }
        const probContinue = totalStreakEvents > 0 ? continueCount / totalStreakEvents : 0.5;
        return { streak, outcome: first, probContinue };
    }

    // Markov bậc 1: xác suất chuyển từ kết quả hiện tại
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
        return {
            [last]: countSame / total,
            [last === 'tài' ? 'xỉu' : 'tài']: countDiff / total
        };
    }

    // Markov bậc 2: dựa trên 2 kết quả gần nhất
    _markov2(results) {
        if (results.length < 3) return null;
        const lastTwo = results.slice(0, 2).join('-'); // "tài-tài", "tài-xỉu", ...
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
        return {
            tai: t.tai / total,
            xiu: t.xiu / total
        };
    }

    // Phân tích mẫu cầu trong 10 phiên gần nhất
    _patternAnalysis(results) {
        if (results.length < 10) return { prediction: null, confidence: 0 };
        const recent = results.slice(0, 10); // 10 phiên gần nhất
        // Tìm chu kỳ lặp lại (1-1, 2-2, 3-3,...)
        // Đơn giản: xem 2 phiên cuối, nếu là 1-1 thì dự đoán đối
        if (recent[0] === recent[1]) {
            // 2 phiên liên tiếp giống nhau: dự đoán đảo? Thực tế có thể bệt tiếp hoặc đảo, nhưng theo cầu bệt thường dễ bệt tiếp
            // Ta sẽ dựa vào thống kê bệt dài
            return { prediction: recent[0], confidence: 0.6 }; // thiên về bệt tiếp
        } else {
            // 2 phiên xen kẽ (tài-xỉu hoặc xỉu-tài): dự đoán tiếp tục đảo? (cầu 1-1)
            return { prediction: recent[0] === 'tài' ? 'xỉu' : 'tài', confidence: 0.65 };
        }
    }

    // Dự đoán tổng hợp
    predictNext(historyArray) {
        const results = this._getRecentResults(historyArray, 50);
        if (results.length < 5) {
            return {
                success: false,
                message: `Chỉ có ${results.length} phiên, cần ít nhất 5 phiên để dự đoán`
            };
        }

        // 1. Tần suất tổng thể (trọng số 1)
        const overall = this._overallProbability(results);
        
        // 2. Phân tích streak
        const streak = this._streakAnalysis(results);
        let streakPred = streak.outcome;
        let streakProb = streak.probContinue; // xác suất streak tiếp tục

        // 3. Markov bậc 1
        const markov1 = this._markov1(results);
        // markov1 trả về xác suất cho kết quả tiếp theo dựa trên kết quả cuối

        // 4. Markov bậc 2 (nếu có)
        const markov2 = this._markov2(results);

        // 5. Phân tích mẫu cầu
        const pattern = this._patternAnalysis(results);

        // Tổng hợp các dự đoán
        let taiScore = 0, xiuScore = 0;
        let totalWeight = 0;

        // Trọng số: có thể điều chỉnh dựa trên độ tin cậy từng phương pháp
        const weightOverall = 1.0;
        const weightStreak = streak.streak >= 3 ? 2.0 : 1.0; // tăng trọng số nếu streak dài
        const weightMarkov1 = 1.5;
        const weightMarkov2 = markov2 ? 2.0 : 0;
        const weightPattern = pattern.confidence > 0.6 ? 1.2 : 0.5;

        taiScore += overall.tai * weightOverall;
        xiuScore += overall.xiu * weightOverall;
        totalWeight += weightOverall;

        // Streak: đóng góp dựa trên probContinue
        if (streak.outcome === 'tài') {
            taiScore += streakProb * weightStreak;
            xiuScore += (1 - streakProb) * weightStreak;
        } else {
            xiuScore += streakProb * weightStreak;
            taiScore += (1 - streakProb) * weightStreak;
        }
        totalWeight += weightStreak;

        // Markov1
        taiScore += markov1.tai * weightMarkov1;
        xiuScore += markov1.xiu * weightMarkov1;
        totalWeight += weightMarkov1;

        // Markov2
        if (markov2) {
            taiScore += markov2.tai * weightMarkov2;
            xiuScore += markov2.xiu * weightMarkov2;
            totalWeight += weightMarkov2;
        }

        // Pattern
        if (pattern.prediction) {
            if (pattern.prediction === 'tài') {
                taiScore += pattern.confidence * weightPattern;
                xiuScore += (1 - pattern.confidence) * weightPattern;
            } else {
                xiuScore += pattern.confidence * weightPattern;
                taiScore += (1 - pattern.confidence) * weightPattern;
            }
            totalWeight += weightPattern;
        }

        // Chuẩn hóa
        const finalTai = taiScore / totalWeight;
        const finalXiu = xiuScore / totalWeight;
        const prediction = finalTai > finalXiu ? 'tài' : (finalXiu > finalTai ? 'xỉu' : 'không xác định');
        const confidence = prediction === 'tài' ? finalTai * 100 : finalXiu * 100;

        // Lấy thêm thông tin phân tích chi tiết
        return {
            success: true,
            prediction,
            confidence: Math.round(confidence * 10) / 10 + '%',
            analysis: {
                totalSessions: results.length,
                recentResults: results.slice(0, 15), // 15 phiên gần nhất
                overall: overall,
                streak: {
                    length: streak.streak,
                    outcome: streak.outcome,
                    probContinue: Math.round(streak.probContinue * 100) / 100
                },
                markov1: markov1,
                markov2: markov2 || null,
                pattern: pattern.prediction ? { prediction: pattern.prediction, confidence: pattern.confidence } : null,
                weightedScores: {
                    tai: Math.round(finalTai * 1000) / 1000,
                    xiu: Math.round(finalXiu * 1000) / 1000
                }
            }
        };
    }

    // Dự đoán cho bàn TX
    getTxPrediction() {
        if (!this.latestTxData || !this.latestTxData.htr || this.latestTxData.htr.length === 0) {
            return {
                error: 'Không có dữ liệu bàn TX',
                message: 'Chưa nhận được dữ liệu từ server hoặc dữ liệu trống'
            };
        }
        return this.predictNext(this.latestTxData.htr);
    }

    // Dự đoán cho bàn MD5
    getMd5Prediction() {
        if (!this.latestMd5Data || !this.latestMd5Data.htr || this.latestMd5Data.htr.length === 0) {
            return {
                error: 'Không có dữ liệu bàn MD5',
                message: 'Chưa nhận được dữ liệu từ server hoặc dữ liệu trống'
            };
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
const PORT = process.env.PORT || 3012;  // Dùng port từ Render nếu có

// Middleware
app.use(cors());
app.use(express.json());

// Tạo WebSocket client - URL MỚI
const client = new GameWebSocketClient(
    'wss://api.apibinh.xyz/websocket?d=YW1SdWFXSnVhQT09fDJ8MTc2NjUzNjU0MTM3MHw0YTAxZjZhY2JjMGRhYjhkNWE1YzM3YzVjMmVlM2JjYXwyZmQ4Y2ZmZmM1NDQ5MGY3N2QyODg5ZWIyM2IzZGFlYg=='
);

// Kết nối WebSocket
client.connect();

// Route để lấy phiên gần nhất từ bàn TX
app.get('/api/tx', (req, res) => {
    try {
        const latestSession = client.getLatestTxSession();
        
        if (latestSession.error) {
            return res.status(404).json(latestSession);
        }
        
        res.json(latestSession);
    } catch (error) {
        res.status(500).json({
            error: "Lỗi server",
            message: error.message,
            timestamp: new Date().toISOString()
        });
    }
});

// Route để lấy phiên gần nhất từ bàn MD5
app.get('/api/md5', (req, res) => {
    try {
        const latestSession = client.getLatestMd5Session();
        
        if (latestSession.error) {
            return res.status(404).json(latestSession);
        }
        
        res.json(latestSession);
    } catch (error) {
        res.status(500).json({
            error: "Lỗi server",
            message: error.message,
            timestamp: new Date().toISOString()
        });
    }
});

// Route để lấy cả 2 bàn
app.get('/api/all', (req, res) => {
    try {
        const txSession = client.getLatestTxSession();
        const md5Session = client.getLatestMd5Session();
        
        res.json({
            tai_xiu: txSession.error ? { error: txSession.error } : txSession,
            md5: md5Session.error ? { error: md5Session.error } : md5Session,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        res.status(500).json({
            error: "Lỗi server",
            message: error.message,
            timestamp: new Date().toISOString()
        });
    }
});

// Route kiểm tra trạng thái
app.get('/api/status', (req, res) => {
    const hasTxData = client.latestTxData && 
                     client.latestTxData.htr && 
                     client.latestTxData.htr.length > 0;
    
    const hasMd5Data = client.latestMd5Data && 
                      client.latestMd5Data.htr && 
                      client.latestMd5Data.htr.length > 0;
    
    res.json({
        status: "running",
        websocket_connected: client.ws ? client.ws.readyState === WebSocket.OPEN : false,
        authenticated: client.isAuthenticated,
        has_tx_data: hasTxData,
        has_md5_data: hasMd5Data,
        tx_data_count: hasTxData ? client.latestTxData.htr.length : 0,
        md5_data_count: hasMd5Data ? client.latestMd5Data.htr.length : 0,
        tx_latest_sid: hasTxData ? 
            client.latestTxData.htr.reduce((p, c) => c.sid > p.sid ? c : p).sid : 
            null,
        md5_latest_sid: hasMd5Data ? 
            client.latestMd5Data.htr.reduce((p, c) => c.sid > p.sid ? c : p).sid : 
            null,
        tx_last_updated: client.lastUpdateTime.tx ? client.lastUpdateTime.tx.toISOString() : null,
        md5_last_updated: client.lastUpdateTime.md5 ? client.lastUpdateTime.md5.toISOString() : null,
        timestamp: new Date().toISOString()
    });
});

// Route refresh dữ liệu
app.get('/api/refresh', (req, res) => {
    if (client.isAuthenticated && client.ws && client.ws.readyState === WebSocket.OPEN) {
        client.refreshGameData();
        
        res.json({
            message: "Đã gửi yêu cầu refresh dữ liệu cả 2 bàn",
            timestamp: new Date().toISOString()
        });
    } else {
        res.status(400).json({
            error: "Không thể refresh",
            message: "WebSocket chưa kết nối hoặc chưa xác thực"
        });
    }
});

// ==================== API DỰ ĐOÁN MỚI ====================
// Dự đoán bàn TX
app.get('/api/predict/tx', (req, res) => {
    try {
        const prediction = client.getTxPrediction();
        res.json({
            board: 'tai_xiu',
            ...prediction,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        res.status(500).json({
            error: 'Lỗi server',
            message: error.message,
            timestamp: new Date().toISOString()
        });
    }
});

// Dự đoán bàn MD5
app.get('/api/predict/md5', (req, res) => {
    try {
        const prediction = client.getMd5Prediction();
        res.json({
            board: 'md5',
            ...prediction,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        res.status(500).json({
            error: 'Lỗi server',
            message: error.message,
            timestamp: new Date().toISOString()
        });
    }
});

// Dự đoán cả hai bàn
app.get('/api/predict/all', (req, res) => {
    try {
        const txPred = client.getTxPrediction();
        const md5Pred = client.getMd5Prediction();
        res.json({
            tai_xiu: txPred,
            md5: md5Pred,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        res.status(500).json({
            error: 'Lỗi server',
            message: error.message,
            timestamp: new Date().toISOString()
        });
    }
});

// Route trang chủ (đã cập nhật giao diện để hiển thị dự đoán)
app.get('/', (req, res) => {
    res.send(`
        <html>
            <head>
                <title>🎲 Sảnh Tài Xỉu - API & Dự Đoán Thông Minh</title>
                <style>
                    body { font-family: Arial, sans-serif; margin: 40px; background: #f0f2f5; }
                    h1 { color: #333; text-align: center; }
                    .container { max-width: 1200px; margin: 0 auto; }
                    .endpoint { background: white; padding: 20px; border-radius: 10px; margin: 20px 0; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
                    code { background: #e0e0e0; padding: 2px 5px; border-radius: 3px; font-family: monospace; }
                    .api-link { color: #1890ff; text-decoration: none; }
                    .api-link:hover { text-decoration: underline; }
                    .status { padding: 10px; border-radius: 5px; margin: 10px 0; }
                    .connected { background: #d4edda; color: #155724; }
                    .disconnected { background: #f8d7da; color: #721c24; }
                    .btn { background: #1890ff; color: white; padding: 10px 15px; border: none; border-radius: 5px; cursor: pointer; margin: 5px; }
                    .btn:hover { background: #40a9ff; }
                    .board { display: inline-block; padding: 10px; margin: 5px; border-radius: 5px; vertical-align: top; width: 45%; }
                    .board-tx { background: #e6f7ff; border: 1px solid #91d5ff; }
                    .board-md5 { background: #f6ffed; border: 1px solid #b7eb8f; }
                    .prediction-box { margin-top: 20px; padding: 15px; background: #fffbe6; border: 1px solid #ffe58f; border-radius: 8px; }
                    .confidence { font-weight: bold; color: #fa8c16; }
                    .stats { font-size: 0.9em; color: #666; }
                </style>
            </head>
            <body>
                <div class="container">
                    <h1>🎲 Sảnh Tài Xỉu - API & Dự Đoán Thông Minh</h1>
                    
                    <div id="status" class="endpoint">
                        <h2>📡 Đang kiểm tra trạng thái...</h2>
                    </div>
                    
                    <div class="endpoint">
                        <h2>📊 API Endpoints:</h2>
                        <ul>
                            <li><code>GET <a class="api-link" href="/api/tx" target="_blank">/api/tx</a></code> - Bàn Tài Xỉu thường (phiên mới nhất)</li>
                            <li><code>GET <a class="api-link" href="/api/md5" target="_blank">/api/md5</a></code> - Bàn MD5 (phiên mới nhất)</li>
                            <li><code>GET <a class="api-link" href="/api/all" target="_blank">/api/all</a></code> - Cả 2 bàn</li>
                            <li><code>GET <a class="api-link" href="/api/predict/tx" target="_blank">/api/predict/tx</a></code> - Dự đoán bàn TX (thông minh)</li>
                            <li><code>GET <a class="api-link" href="/api/predict/md5" target="_blank">/api/predict/md5</a></code> - Dự đoán bàn MD5</li>
                            <li><code>GET <a class="api-link" href="/api/predict/all" target="_blank">/api/predict/all</a></code> - Dự đoán cả 2</li>
                            <li><code>GET <a class="api-link" href="/api/status" target="_blank">/api/status</a></code> - Trạng thái</li>
                            <li><code>GET <a class="api-link" href="/api/refresh" target="_blank">/api/refresh</a></code> - Refresh dữ liệu</li>
                        </ul>
                    </div>
                    
                    <div class="endpoint">
                        <h2>🎯 Quick Actions:</h2>
                        <button class="btn" onclick="getTX()">🎲 Lấy Bàn TX</button>
                        <button class="btn" onclick="getMD5()">🔐 Lấy Bàn MD5</button>
                        <button class="btn" onclick="getAll()">📊 Lấy Cả 2</button>
                        <button class="btn" onclick="predictTX()">🔮 Dự đoán Bàn TX (AI)</button>
                        <button class="btn" onclick="predictMD5()">🔮 Dự đoán Bàn MD5 (AI)</button>
                        <button class="btn" onclick="predictAll()">🔮 Dự đoán Cả 2</button>
                        <button class="btn" onclick="refreshData()">🔄 Refresh Data</button>
                    </div>
                    
                    <div class="endpoint">
                        <h2>🔗 Quick Links:</h2>
                        <p><strong>Localhost:</strong> <a class="api-link" href="http://localhost:${PORT}/api/tx" target="_blank">http://localhost:${PORT}/api/tx</a></p>
                        <p><strong>Network:</strong> http://[YOUR_IP]:${PORT}/api/tx</p>
                    </div>
                    
                    <div class="endpoint">
                        <h2>📋 Dữ liệu hiện tại</h2>
                        <div id="tx-data" class="board board-tx"></div>
                        <div id="md5-data" class="board board-md5"></div>
                    </div>
                    
                    <div class="endpoint">
                        <h2>🔮 Dự đoán thông minh</h2>
                        <div id="predict-tx-data" class="board board-tx"></div>
                        <div id="predict-md5-data" class="board board-md5"></div>
                    </div>
                </div>
                
                <script>
                    // Kiểm tra trạng thái và cập nhật liên tục
                    function updateStatus() {
                        fetch('/api/status')
                            .then(response => response.json())
                            .then(data => {
                                const statusDiv = document.getElementById('status');
                                const isConnected = data.websocket_connected;
                                const hasTxData = data.has_tx_data;
                                const hasMd5Data = data.has_md5_data;
                                
                                statusDiv.innerHTML = \`
                                    <h2>📡 Trạng thái hệ thống:</h2>
                                    <div class="status \${isConnected ? 'connected' : 'disconnected'}">
                                        <p><strong>WebSocket:</strong> \${isConnected ? '✅ Đã kết nối' : '❌ Mất kết nối'}</p>
                                        <p><strong>Xác thực:</strong> \${data.authenticated ? '✅ Đã xác thực' : '⏳ Chưa xác thực'}</p>
                                        <div class="board board-tx">
                                            <p><strong>Bàn TX:</strong> \${hasTxData ? '✅ Có dữ liệu (' + data.tx_data_count + ' phiên)' : '⏳ Đang chờ'}</p>
                                            \${data.tx_latest_sid ? '<p>Phiên mới nhất: ' + data.tx_latest_sid + '</p>' : ''}
                                            \${data.tx_last_updated ? '<p>Cập nhật: ' + new Date(data.tx_last_updated).toLocaleTimeString() + '</p>' : ''}
                                        </div>
                                        <div class="board board-md5">
                                            <p><strong>Bàn MD5:</strong> \${hasMd5Data ? '✅ Có dữ liệu (' + data.md5_data_count + ' phiên)' : '⏳ Đang chờ'}</p>
                                            \${data.md5_latest_sid ? '<p>Phiên mới nhất: ' + data.md5_latest_sid + '</p>' : ''}
                                            \${data.md5_last_updated ? '<p>Cập nhật: ' + new Date(data.md5_last_updated).toLocaleTimeString() + '</p>' : ''}
                                        </div>
                                    </div>
                                \`;
                                
                                // Tự động lấy dữ liệu nếu có
                                if (hasTxData) getTX();
                                if (hasMd5Data) getMD5();
                            })
                            .catch(error => {
                                console.error('Error:', error);
                            });
                    }
                    
                    function getTX() {
                        fetch('/api/tx')
                            .then(response => response.json())
                            .then(data => {
                                if (data.error) {
                                    document.getElementById('tx-data').innerHTML = \`
                                        <h3>🎲 Bàn Tài Xỉu</h3>
                                        <p>❌ \${data.error}</p>
                                    \`;
                                } else {
                                    document.getElementById('tx-data').innerHTML = \`
                                        <h3>🎲 Bàn Tài Xỉu</h3>
                                        <p><strong>Phiên:</strong> \${data.phien}</p>
                                        <p><strong>Xúc xắc:</strong> \${data.xuc_xac_1}, \${data.xuc_xac_2}, \${data.xuc_xac_3}</p>
                                        <p><strong>Tổng:</strong> \${data.tong} (<span style="color: \${data.ket_qua === 'tài' ? 'red' : 'blue'}">\${data.ket_qua}</span>)</p>
                                        <p><strong>Thời gian:</strong> \${new Date(data.timestamp).toLocaleTimeString()}</p>
                                    \`;
                                }
                            });
                    }
                    
                    function getMD5() {
                        fetch('/api/md5')
                            .then(response => response.json())
                            .then(data => {
                                if (data.error) {
                                    document.getElementById('md5-data').innerHTML = \`
                                        <h3>🔐 Bàn MD5</h3>
                                        <p>❌ \${data.error}</p>
                                    \`;
                                } else {
                                    document.getElementById('md5-data').innerHTML = \`
                                        <h3>🔐 Bàn MD5</h3>
                                        <p><strong>Phiên:</strong> \${data.phien}</p>
                                        <p><strong>Xúc xắc:</strong> \${data.xuc_xac_1}, \${data.xuc_xac_2}, \${data.xuc_xac_3}</p>
                                        <p><strong>Tổng:</strong> \${data.tong} (<span style="color: \${data.ket_qua === 'tài' ? 'red' : 'blue'}">\${data.ket_qua}</span>)</p>
                                        <p><strong>Thời gian:</strong> \${new Date(data.timestamp).toLocaleTimeString()}</p>
                                    \`;
                                }
                            });
                    }
                    
                    function getAll() {
                        getTX();
                        getMD5();
                    }
                    
                    function predictTX() {
                        fetch('/api/predict/tx')
                            .then(response => response.json())
                            .then(data => {
                                let html = '<h3>🔮 Dự đoán Bàn Tài Xỉu</h3>';
                                if (data.error || !data.success) {
                                    html += \`<p>❌ \${data.message || data.error}</p>\`;
                                } else {
                                    html += \`
                                        <p><strong>Dự đoán:</strong> <span style="color: \${data.prediction === 'tài' ? 'red' : 'blue'}; font-size: 1.3em;">\${data.prediction.toUpperCase()}</span></p>
                                        <p><strong>Độ tin cậy:</strong> <span class="confidence">\${data.confidence}</span></p>
                                        <div class="prediction-box">
                                            <p><strong>Phân tích chi tiết:</strong></p>
                                            <p>Tổng số phiên phân tích: \${data.analysis.totalSessions}</p>
                                            <p>Tần suất tổng thể: Tài \${Math.round(data.analysis.overall.tai*100)}% - Xỉu \${Math.round(data.analysis.overall.xiu*100)}%</p>
                                            <p>Streak hiện tại: \${data.analysis.streak.length} phiên \${data.analysis.streak.outcome} (khả năng tiếp: \${Math.round(data.analysis.streak.probContinue*100)}%)</p>
                                            \${data.analysis.markov2 ? '<p>Markov bậc 2: Tài ' + Math.round(data.analysis.markov2.tai*100) + '% - Xỉu ' + Math.round(data.analysis.markov2.xiu*100) + '%</p>' : ''}
                                            <p class="stats">15 phiên gần: \${data.analysis.recentResults.join(' → ')}</p>
                                        </div>
                                    \`;
                                }
                                document.getElementById('predict-tx-data').innerHTML = html;
                            })
                            .catch(err => {
                                document.getElementById('predict-tx-data').innerHTML = \`<p>❌ Lỗi: \${err.message}</p>\`;
                            });
                    }
                    
                    function predictMD5() {
                        fetch('/api/predict/md5')
                            .then(response => response.json())
                            .then(data => {
                                let html = '<h3>🔮 Dự đoán Bàn MD5</h3>';
                                if (data.error || !data.success) {
                                    html += \`<p>❌ \${data.message || data.error}</p>\`;
                                } else {
                                    html += \`
                                        <p><strong>Dự đoán:</strong> <span style="color: \${data.prediction === 'tài' ? 'red' : 'blue'}; font-size: 1.3em;">\${data.prediction.toUpperCase()}</span></p>
                                        <p><strong>Độ tin cậy:</strong> <span class="confidence">\${data.confidence}</span></p>
                                        <div class="prediction-box">
                                            <p><strong>Phân tích chi tiết:</strong></p>
                                            <p>Tổng số phiên phân tích: \${data.analysis.totalSessions}</p>
                                            <p>Tần suất tổng thể: Tài \${Math.round(data.analysis.overall.tai*100)}% - Xỉu \${Math.round(data.analysis.overall.xiu*100)}%</p>
                                            <p>Streak hiện tại: \${data.analysis.streak.length} phiên \${data.analysis.streak.outcome} (khả năng tiếp: \${Math.round(data.analysis.streak.probContinue*100)}%)</p>
                                            \${data.analysis.markov2 ? '<p>Markov bậc 2: Tài ' + Math.round(data.analysis.markov2.tai*100) + '% - Xỉu ' + Math.round(data.analysis.markov2.xiu*100) + '%</p>' : ''}
                                            <p class="stats">15 phiên gần: \${data.analysis.recentResults.join(' → ')}</p>
                                        </div>
                                    \`;
                                }
                                document.getElementById('predict-md5-data').innerHTML = html;
                            })
                            .catch(err => {
                                document.getElementById('predict-md5-data').innerHTML = \`<p>❌ Lỗi: \${err.message}</p>\`;
                            });
                    }
                    
                    function predictAll() {
                        predictTX();
                        predictMD5();
                    }
                    
                    function refreshData() {
                        fetch('/api/refresh')
                            .then(response => response.json())
                            .then(data => {
                                alert(data.message);
                                setTimeout(updateStatus, 2000);
                            });
                    }
                    
                    // Cập nhật mỗi 5 giây
                    updateStatus();
                    setInterval(updateStatus, 5000);
                    
                    // Tự động lấy dữ liệu ban đầu và dự đoán sau 3 giây
                    setTimeout(() => {
                        getTX();
                        getMD5();
                        setTimeout(() => {
                            predictTX();
                            predictMD5();
                        }, 2000);
                    }, 3000);
                </script>
            </body>
        </html>
    `);
});

// Khởi động server
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Server đang chạy tại: http://localhost:${PORT}`);
    console.log(`🎲 API Bàn TX: http://localhost:${PORT}/api/tx`);
    console.log(`🔐 API Bàn MD5: http://localhost:${PORT}/api/md5`);
    console.log(`🔮 Dự đoán TX: http://localhost:${PORT}/api/predict/tx`);
    console.log(`🔮 Dự đoán MD5: http://localhost:${PORT}/api/predict/md5`);
    console.log(`🌐 Truy cập từ mạng nội bộ: http://[YOUR_IP]:${PORT}`);
});

// Bắt đầu heartbeat sau khi kết nối
setTimeout(() => {
    client.startHeartbeat();
}, 10000);

// Xử lý tắt chương trình
process.on('SIGINT', () => {
    console.log('\n👋 Closing WebSocket connection and server...');
    client.close();
    process.exit();
});

module.exports = { GameWebSocketClient, app };
