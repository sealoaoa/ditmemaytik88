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
const PORT = 3012;

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

// Route trang chủ
app.get('/', (req, res) => {
    res.send(`
        <html>
            <head>
                <title>🎲 Sảnh Tài Xỉu - API</title>
                <style>
                    body { font-family: Arial, sans-serif; margin: 40px; background: #f0f2f5; }
                    h1 { color: #333; text-align: center; }
                    .container { max-width: 900px; margin: 0 auto; }
                    .endpoint { background: white; padding: 20px; border-radius: 10px; margin: 20px 0; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
                    code { background: #e0e0e0; padding: 2px 5px; border-radius: 3px; font-family: monospace; }
                    .api-link { color: #1890ff; text-decoration: none; }
                    .api-link:hover { text-decoration: underline; }
                    .status { padding: 10px; border-radius: 5px; margin: 10px 0; }
                    .connected { background: #d4edda; color: #155724; }
                    .disconnected { background: #f8d7da; color: #721c24; }
                    .btn { background: #1890ff; color: white; padding: 10px 15px; border: none; border-radius: 5px; cursor: pointer; margin: 5px; }
                    .btn:hover { background: #40a9ff; }
                    .board { display: inline-block; padding: 10px; margin: 5px; border-radius: 5px; }
                    .board-tx { background: #e6f7ff; border: 1px solid #91d5ff; }
                    .board-md5 { background: #f6ffed; border: 1px solid #b7eb8f; }
                </style>
            </head>
            <body>
                <div class="container">
                    <h1>🎲 Sảnh Tài Xỉu - API</h1>
                    
                    <div id="status" class="endpoint">
                        <h2>📡 Đang kiểm tra trạng thái...</h2>
                    </div>
                    
                    <div class="endpoint">
                        <h2>📊 API Endpoints:</h2>
                        <ul>
                            <li><code>GET <a class="api-link" href="/api/tx" target="_blank">/api/tx</a></code> - Bàn Tài Xỉu thường</li>
                            <li><code>GET <a class="api-link" href="/api/md5" target="_blank">/api/md5</a></code> - Bàn MD5</li>
                            <li><code>GET <a class="api-link" href="/api/all" target="_blank">/api/all</a></code> - Cả 2 bàn</li>
                            <li><code>GET <a class="api-link" href="/api/status" target="_blank">/api/status</a></code> - Trạng thái</li>
                            <li><code>GET <a class="api-link" href="/api/refresh" target="_blank">/api/refresh</a></code> - Refresh dữ liệu</li>
                        </ul>
                    </div>
                    
                    <div class="endpoint">
                        <h2>🎯 Quick Actions:</h2>
                        <button class="btn" onclick="getTX()">🎲 Lấy Bàn TX</button>
                        <button class="btn" onclick="getMD5()">🔐 Lấy Bàn MD5</button>
                        <button class="btn" onclick="getAll()">📊 Lấy Cả 2</button>
                        <button class="btn" onclick="refreshData()">🔄 Refresh Data</button>
                    </div>
                    
                    <div class="endpoint">
                        <h2>🔗 Quick Links:</h2>
                        <p><strong>Localhost:</strong> <a class="api-link" href="http://localhost:${PORT}/api/tx" target="_blank">http://localhost:${PORT}/api/tx</a></p>
                        <p><strong>Network:</strong> http://[YOUR_IP]:${PORT}/api/tx</p>
                    </div>
                    
                    <div id="data-display" class="endpoint">
                        <h2>📋 Data Display:</h2>
                        <div id="tx-data"></div>
                        <div id="md5-data"></div>
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
                                        <div class="board board-tx">
                                            <h3>🎲 Bàn Tài Xỉu</h3>
                                            <p>❌ \${data.error}</p>
                                        </div>
                                    \`;
                                } else {
                                    document.getElementById('tx-data').innerHTML = \`
                                        <div class="board board-tx">
                                            <h3>🎲 Bàn Tài Xỉu</h3>
                                            <p><strong>Phiên:</strong> \${data.phien}</p>
                                            <p><strong>Xúc xắc:</strong> \${data.xuc_xac_1}, \${data.xuc_xac_2}, \${data.xuc_xac_3}</p>
                                            <p><strong>Tổng:</strong> \${data.tong} (<span style="color: \${data.ket_qua === 'tài' ? 'red' : 'blue'}">\${data.ket_qua}</span>)</p>
                                            <p><strong>Thời gian:</strong> \${new Date(data.timestamp).toLocaleTimeString()}</p>
                                        </div>
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
                                        <div class="board board-md5">
                                            <h3>🔐 Bàn MD5</h3>
                                            <p>❌ \${data.error}</p>
                                        </div>
                                    \`;
                                } else {
                                    document.getElementById('md5-data').innerHTML = \`
                                        <div class="board board-md5">
                                            <h3>🔐 Bàn MD5</h3>
                                            <p><strong>Phiên:</strong> \${data.phien}</p>
                                            <p><strong>Xúc xắc:</strong> \${data.xuc_xac_1}, \${data.xuc_xac_2}, \${data.xuc_xac_3}</p>
                                            <p><strong>Tổng:</strong> \${data.tong} (<span style="color: \${data.ket_qua === 'tài' ? 'red' : 'blue'}">\${data.ket_qua}</span>)</p>
                                            <p><strong>Thời gian:</strong> \${new Date(data.timestamp).toLocaleTimeString()}</p>
                                        </div>
                                    \`;
                                }
                            });
                    }
                    
                    function getAll() {
                        getTX();
                        getMD5();
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
                    
                    // Tự động lấy dữ liệu ban đầu
                    setTimeout(() => {
                        getTX();
                        getMD5();
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
    console.log(`📊 API Cả 2 bàn: http://localhost:${PORT}/api/all`);
    console.log(`📡 Status: http://localhost:${PORT}/api/status`);
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
