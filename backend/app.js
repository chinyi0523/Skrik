var createError = require('http-errors');
var express = require('express');
var path = require('path');
var cookieParser = require('cookie-parser');
var logger = require('morgan');
var redisClient = require('./utils/redis')
const http = require("http");
const WebSocket = require("ws");
const mongoose = require('mongoose');
const bodyParser = require('body-parser')
const session = require('express-session')  
const RedisStore = require('connect-redis')(session);
// const cors = require('cors');

var loginRouter = require('./routes/LoginRouter');
var apiRouter = require('./routes/ApiRouter');
const QueryProject = require('./utils/db/QueryProject');
const QueryUser = require('./utils/db/QueryUser');
const QueryRedis = require('./utils/db/QueryRedis'); 

var app = express();

const { text } = require('body-parser');
const { auth } = require('./utils/redis');

const filename = "/test_file"

function empty(a, name) {
    let t = (a === undefined || a === "")
    if(t == true) {
        console.error("[env] missing environment variable: " + name)
    }
    return t
}

// environment check
if (
    empty(process.env.MONGO_USERNAME, "MONGO_USERNAME") ||
    empty(process.env.MONGO_PASSWORD, "MONGO_PASSWORD") ||
    empty(process.env.MONGO_DATABASE, "MONGO_DATABASE") ||
    empty(process.env.MONGO_URL, "MONGO_URL") ||
    empty(process.env.PROJECT_SECRET, "PROJECT_SECRET") ||
    empty(process.env.SESSION_SECRET, "SESSION_SECRET") ||
    // empty(process.env.LOGIN_URL, "LOGIN_URL") ||
    // empty(process.env.FB_APP_ID, "FB_APP_ID") ||
    // empty(process.env.FB_APP_SECRET, "FB_APP_SECRET") ||
    empty(process.env.HTTP_PORT, "HTTP_PORT") ||
    empty(process.env.SOCKETIO_PORT, "SOCKETIO_PORT") ||
    empty(process.env.REDIS_URL, "REDIS_URL") ||
    empty(process.env.REDIS_PASSWORD, "REDIS_PASSWORD")
){
    throw "MISS_ENV";
}

// mongo setup
var username = process.env.MONGO_USERNAME;
var password = process.env.MONGO_PASSWORD;
var database = process.env.MONGO_DATABASE;
var dburl = process.env.MONGO_URL;
var dbport = process.env.MONGO_PORT;
const mongoDB = `mongodb://${username}:${password}@${dburl}:${dbport}/${database}`
console.log("trying to connect to " + mongoDB + "...")
mongoose.set('useNewUrlParser', true);
mongoose.set('useFindAndModify', false);
mongoose.set('useCreateIndex', true);
mongoose.set('useUnifiedTopology', true);
mongoose.connect(mongoDB);

mongoose.connection.on('connected', function () {
    console.error('[db] db connected.');
})

mongoose.connection.on('disconnected', function () {
    console.error('[db] db connection dropped.');
    mongoose.connect(mongoDB);
})

mongoose.connection.on('error', function (err) {
    console.error('[db] db error: ' + err.message);
})

// session and body-parser init
app.use(bodyParser.urlencoded({ extended: true }))
app.use(bodyParser.json())
app.use(session({
    name: "PHPSESSID",
    secret: process.env.SESSION_SECRET,
    resave: 'false',
    store: new RedisStore({ client: redisClient }),
    saveUninitialized: 'false',
    cookie: {
        maxAge: 60 * 60 * 1000
    }
}))

// handle login
app.use(loginRouter.passport.initialize());
app.use(loginRouter.passport.session());
app.use('/api/login', loginRouter.router);

// auto-gen code
app.use(logger('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

app.use('/api', apiRouter);

// catch 404 and forward to error handler
app.use(function (req, res, next) {
    console.log("[endpoint] 404 not found: " + req.url)
    res.redirect('/Error')
    // next(createError(404));
});

// error handler
app.use(function (err, req, res, next) {
    console.log("[global err] uncaught error: " + err)
    // send the error page
    res.status(err.status || 500);
    res.send('error');
});

app2 = express()
const server = http.createServer(app2)
const wss = new WebSocket.Server({ server })
let buffers = {}
let connection = {}

wss.on('connection', async ws => {
    const sendData = (client, data) => {
        client.send(JSON.stringify(data))
    }
    const sendInit = (data) => {
        ws.send(JSON.stringify(data))
    }
    let author = ''
    let projectID = ''
    let filepath = ''

    console.log("[socket] connected")
    ws.onmessage = async (message) => {
        const { data } = message
        console.log("[data] "+data)
        const [task, payload] = JSON.parse(data)
        switch (task) {
            case 'init': {
                console.log(payload)
                var result = await QueryRedis.getID(payload)
                projectID = result["id"]
                var result = await QueryRedis.getUser(payload)
                author = result["username"]
                ws.author = result["username"]
                console.log(["init"], projectID, author)
                if (connection[projectID] === undefined) {
                    connection[projectID] = [ws]
                }
                else connection[projectID].push(ws)
                if (buffers[author] === undefined) {
                    buffers[author] = { projectID: '', filepath: '', line: 0, text: '' }
                }
                if (buffers[author].text != '') {
                    let textToDB = (buffers[author].text.slice(-1) === '\n') ? buffers[author].text.slice(0, -1) : buffers[author].text
                    var result = await QueryProject.addLineChange(projectID, filepath, author, buffers[author].line + 1, 'delete', '')
                    if (result['success'] === false) {
                        console.log("[socket] push buffer:", result['description'])
                    }
                    var result = await QueryProject.addLineChange(projectID, filepath, author, buffers[author].line + 1, 'insert', textToDB)
                    if (result['success'] === false) {
                        console.log("[socket] push buffer:", result['description'])
                    }
                }
                buffers[author] = { projectID: projectID, filepath: '', line: 0, text: '' }
            }
            case 'request_file': {
                console.log('[projectid] '+projectID)
                let content = ''
                if (buffers[author].text != '') {
                    let textToDB = (buffers[author].text.slice(-1) === '\n') ? buffers[author].text.slice(0, -1) : buffers[author].text
                    var result = await QueryProject.addLineChange(projectID, filepath, author, buffers[author].line + 1, 'delete', '')
                    if (result['success'] === false) {
                        console.log("[socket] push buffer:", result['description'])
                    }
                    var result = await QueryProject.addLineChange(projectID, filepath, author, buffers[author].line + 1, 'insert', textToDB)
                    if (result['success'] === false) {
                        console.log("[socket] push buffer:", result['description'])
                    }
                }
                filepath = payload
                buffers[author] = { projectID: projectID, filepath: filepath, line: 0, text: '' }
                var result = await QueryProject.getFile(projectID, payload)
                if (result['success'] === false) {
                    console.log("[socket] request_file:", result['description'])
                }
                else {
                    for(let buffer of Object.values(buffers)) {
                        if(buffer.projectID === projectID && buffer.filepath === filepath && buffer.text != '') {
                            console.log(buffer.filepath, buffer.line, buffer.text)
                            let textInBuffer = (buffer.text.slice(-1) === '\n') ? buffer.text.slice(0, -1) : buffer.text
                            result['content'][buffer.line].data = textInBuffer
                        }
                    }
                    for(let text of result['content']) {
                        content += (text["data"] + '\n')
                    }
                    content = content.slice(0, -1)
                }
                sendInit(['init-file', content])
                break
            }
            case 'input': {
                filepath = payload.filepath
                let content = payload.content
                if (content.length === 2 && content[0].ope + content[1].ope === 1 &&
                    content[0].start === content[1].start && content[0].start + 1 === content[0].end &&
                    content[0].end === content[1].end) {
                    if (content[0].start != buffers[author].line) {
                        if (buffers[author].text != '') {
                            let textToDB = (buffers[author].text.slice(-1) === '\n') ? buffers[author].text.slice(0, -1) : buffers[author].text
                            var result = await QueryProject.addLineChange(projectID, filepath, author, buffers[author].line + 1, 'delete', '')
                            if (result['success'] === false) {
                                console.log("[socket] input:", result['description'])
                            }
                            var result = await QueryProject.addLineChange(projectID, filepath, author, buffers[author].line + 1, 'insert', textToDB)
                            if (result['success'] === false) {
                                console.log("[socket] input:", result['description'])
                            }
                        }
                        buffers[author].text = ''
                    }
                    buffers[author].line = content[0].start
                    buffers[author].text = (content[0].ope === 0) ? content[0].content : content[1].content
                }
                else {
                    if (buffers[author].text != '') {
                        let textToDB = (buffers[author].text.slice(-1) === '\n') ? buffers[author].text.slice(0, -1) : buffers[author].text
                        var result = await QueryProject.addLineChange(projectID, filepath, author, buffers[author].line + 1, 'delete', '')
                        if (result['success'] === false) {
                            console.log("[socket] input:", result['description'])
                        }
                        var result = await QueryProject.addLineChange(projectID, filepath, author, buffers[author].line + 1, 'insert', textToDB)
                        if (result['success'] === false) {
                            console.log("[socket] input:", result['description'])
                        }
                        buffers[author].text = ''
                    }
                    if (content.length === 2) {
                        for(let element of content) {
                            if (element.ope === 0) {
                                let textToDB = (element.content.slice(-1) === '\n') ? element.content.slice(0, -1) : element.content
                                textToDB = textToDB.split('\n')
                                for(let idx in textToDB) {
                                    let idxToInt = parseInt(idx)
                                    let line = textToDB[idxToInt]
                                    console.log("[dataToDB]", idxToInt, line)
                                    var result = await QueryProject.addLineChange(projectID, filepath, author, element.start + idxToInt + 1, 'insert', line)
                                    if (result['success'] === false) {
                                        console.log("[socket] input:", result['description'])
                                    }
                                }
                            }
                            else {
                                let textToDB = (element.content.slice(-1) === '\n') ? element.content.slice(0, -1) : element.content
                                textToDB = textToDB.split('\n')
                                for(let idx in textToDB) {
                                    let idxToInt = parseInt(idx)
                                    let line = textToDB[idxToInt]
                                    console.log("[dataToDB]", idxToInt, line)
                                    var result = await QueryProject.addLineChange(projectID, filepath, author, element.start + 1, 'delete', '')
                                    if (result['success'] === false) {
                                        console.log("[socket] input:", result['description'])
                                    }
                                }
                            }
                        }
                    }
                    else if (content.length === 1 && content[0].ope === 0) {
                        let textToDB = (content[0].content.slice(-1) === '\n') ? content[0].content.slice(0, -1) : content[0].content
                        textToDB = textToDB.split('\n')
                        for(let idx in textToDB) {
                            let idxToInt = parseInt(idx)
                            let line = textToDB[idxToInt]
                            console.log("[dataToDB]", idxToInt, line)
                            var result = await QueryProject.addLineChange(projectID, filepath, author, content[0].start + idxToInt + 1, 'insert', line)
                            if (result['success'] === false) {
                                console.log("[socket] input:", result['description'])
                            }
                        }
                    }
                    else if (content.length === 1 && content[0].ope === 1) {
                        let textToDB = (content[0].content.slice(-1) === '\n') ? content[0].content.slice(0, -1) : content[0].content
                        textToDB = textToDB.split('\n')
                        for(let idx in textToDB) {
                            let idxToInt = parseInt(idx)
                            let line = textToDB[idxToInt]
                            console.log("[dataToDB]", idxToInt, line)
                            var result = await QueryProject.addLineChange(projectID, filepath, author, content[0].start + 1, 'delete', '')
                            if (result['success'] === false) {
                                console.log("[socket] input:", result['description'])
                            }
                        }
                    }
                }
                connection[projectID].forEach((client) => {
                    if (client.readyState === WebSocket.OPEN) {
                        console.log("[broadcast]", payload)
                        sendData(client, ['output', payload])
                    }
                })
                break
            }
            case 'path': {
                connection[projectID].forEach((client) => {
                    if (client.readyState === WebSocket.OPEN) {
                        sendData(client, ['output-path', payload])
                    }
                })
                break
            }
            case 'delete': {
                console.log("[delete]", payload)
                var result = await QueryProject.deleteFile(projectID, payload.path, payload.deleter)
                if (result['success'] === false) {
                    console.log("[deleteFile]", result['description'])
                }
                connection[projectID].forEach((client) => {
                    if (client.readyState === WebSocket.OPEN) {
                        sendData(client, ['delete', payload])
                    }
                })
                break
            }
            case 'cursor':{
                connection[projectID].forEach((client) => {
                    if (client.readyState === WebSocket.OPEN) {
                        sendData(client, ['other-cursor', payload])
                    }
                })
            }
            case 'file': {

                break
            }
            default:
                break
        }
    }
    ws.onclose = async () => {
        console.log("[socket] disconnected")
        if (buffers[author] !== undefined && buffers[author].text != '') {
            let textToDB = (buffers[author].text.slice(-1) === '\n') ? buffers[author].text.slice(0, -1) : buffers[author].text
            var result = await QueryProject.addLineChange(projectID, filepath, author, buffers[author].line + 1, 'delete', '')
            if (result['success'] === false) {
                console.log("error", result['description'])
            }
            var result = await QueryProject.addLineChange(projectID, filepath, author, buffers[author].line + 1, 'insert', textToDB)
            if (result['success'] === false) {
                console.log("error", result['description'])
            }
            buffers[author].text = ''
        }
        if(projectID != '') {
            let remainClient = connection[projectID].filter((client) => client.author != author)
            connection[projectID] = remainClient
            remainClient.forEach((client) => console.log(client.author))
        }
    }
})
const socketio_port = process.env.SOCKETIO_PORT

server.listen(socketio_port, () => {
    console.log(`http server listening on ${socketio_port}`)
})

module.exports = app;
