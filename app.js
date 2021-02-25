const Koa = require('koa');
const controllers = require('./controllers.js');
const bodyParser = require('koa-bodyparser');
const paths = require('path');
const templating = require('./templating');
const WebSocket = require('ws');
const url = require('url');
const {createMessage,parseUser} = require("./library/save-fn");

const WebSocketServer = WebSocket.Server;

const isProduction = process.env.NODE_ENV === 'production';
// 创建一个Koa对象表示web app本身:
const app = new Koa();

// 记录URL
app.use(async (ctx, next) => {
    console.log(`Process ${ctx.request.method} ${ctx.request.url}. ${ctx.request.path}`);
    await next();
});

// 验证用户cookie
app.use(async (ctx, next) => {
    ctx.state.user = parseUser(ctx.cookies.get('name') || '');
    await next();
});

// 处理静态文件
if (!isProduction) {
    let staticFiles = require('./static-files');
    app.use(staticFiles('/static/', __dirname + '/static'));
}

// 解析body 表单数据
app.use(bodyParser());

// 给ctx注入render方法来使用Nunjucks
app.use(templating(paths.resolve(__dirname, 'views'), {
    noCache: !isProduction,
    watch: false
}));

app.use(controllers());

// 在端口3000监听:
const server = app.listen(3000);

// 注册ws
function createWebSocketServer(server, onConnection, onMessage, onClose, onError) {
    let wss = new WebSocketServer({
        server: server
    });
    console.log('wss.clients',wss.clients)
    wss.broadcast = function broadcast(data) {
        wss.clients.forEach(function each(client) {
            client.send(data);
        });
    };
    onConnection = onConnection || function () {
        console.log('[WebSocket] connected.');
    };
    onMessage = onMessage || function (msg) {
        console.log('[WebSocket] message received: ' + msg);
    };
    onClose = onClose || function (code, message) {
        console.log(`[WebSocket] closed: ${code} - ${message}`);
    };
    onError = onError || function (err) {
        console.log('[WebSocket] error: ' + err);
    };
    wss.on('connection', function (ws,req) {

        ws.upgradeReq = req;
        let location = url.parse(ws.upgradeReq.url, true);

        console.log('[WebSocketServer] connection: ' + location.href);
        ws.on('message', onMessage);
        ws.on('close', onClose);
        ws.on('error', onError);
        if (location.pathname !== '/ws/chat') {
            // close ws:
            ws.close(4000, 'Invalid URL');
        }
        // check user:
        let user = parseUser(ws.upgradeReq);
        if (!user) {
            ws.close(4001, 'Invalid user');
        }
        ws.user = user;
        ws.wss = wss;
        onConnection.apply(ws);
    });
    console.log('WebSocketServer was attached.');
    return wss;
}

function onConnect() {
    let user = this.user;
    let msg = createMessage('join', user, `${user.name} 进入房间.`);
    this.wss.broadcast(msg);
    // build user list:
    let users = Array.from(this.wss.clients).map((client) => { return client.user; });
    this.send(createMessage('list', user, users));
}

function onMessage(message) {
    console.log(message);
    if (message && message.trim()) {
        let msg = createMessage('chat', this.user, message.trim());
        this.wss.broadcast(msg);
    }
}

function onClose() {
    let user = this.user;
    let msg = createMessage('left', user, `${user.name} 离开.`);
    this.wss.broadcast(msg);
}

app.wss = createWebSocketServer(server, onConnect, onMessage, onClose);

console.log('app started at port 3000...');