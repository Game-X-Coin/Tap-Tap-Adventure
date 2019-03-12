/* global module, log */

var Socket = require('./socket'),
    Connection = require('./connection'),
    connect = require('connect'),
    serve = require('serve-static'),
    http = require('http'),
    _ = require('underscore'),
    SocketIO = require('socket.io'),
    Utils = require('../util/utils'),
    config = require('../../config.json'),
    querystring = require('querystring'),
    bodyParser = require('body-parser'),
    gxc = require('../util/gxc');
    WebSocket = {};

module.exports = WebSocket;

WebSocket.Server = Socket.extend({
    _connections: {},
    _counter: 0,

    init: function(host, port, version) {
        var self = this;

        self._super(port);

        self.host = host;
        self.version = version;

        self.ips = {};

        //Serve statically for faster development

        var app = connect();
        app.use(bodyParser.json({ type: 'application/*+json' }));
        app.use(bodyParser.urlencoded({ extended: false }));
        app.use(serve('client', {'index': ['index.html']}), null);

        app.use('/gxc_login', function(request, response, next) {
            const { gxcAccountName, gameLoginToken } = request.body;
            return gxc.login(gxcAccountName, gameLoginToken)
            .then(function(res) {
		        console.log('gxc login attemp: ', gxcAccountName, gameLoginToken);
                response.end(res.data);
            }).catch(function(err) {
                console.error('error!');
                console.error(err);
                next(err);
            });

        })

        self.httpServer = http.createServer(app).listen(port, host, function serverEverythingListening() {
            log.notice('Server is now listening on: ' + port);
        });

        self.io = new SocketIO(self.httpServer);
        self.io.on('connection', function webSocketListener(socket) {
            log.notice('Received connection from: ' + socket.conn.remoteAddress);
            let clientId = self.createId();
            var client = new WebSocket.Connection(clientId, socket, self);

            socket.on('client', function(data) {
                if (data.gVer !== self.version) {
                    client.sendUTF8('updated');
                    client.close('Client version is out of sync with the server.');
                }

                if (self.connectionCallback)
                    self.connectionCallback(client);
                self.addConnection(client);
            });

            socket.on('u_message', function(message) {
                //Used for unity messages as Socket.IO differs

                if (client.listenCallback)
                    client.listenCallback(message);
            });
        });

    },

    createId: function() {
        return '1' + Utils.random(99) + '' + this._counter++;
    },

    onConnect: function(callback) {
        this.connectionCallback = callback;
    },

    onOAuth: function(callback) {
        this.oauthCallback = callback;
    }
});

WebSocket.Connection = Connection.extend({

    init: function(id, socket, server) {
        var self = this;

        self._super(id, socket, server);

        self.socket.on('message', function(message) {
            if (self.listenCallback)
                self.listenCallback(JSON.parse(message));
        });

        self.socket.on('disconnect', function() {
            log.notice('Closed socket: ' + self.socket.conn.remoteAddress);

            if (self.closeCallback)
                self.closeCallback();

            delete self._server.removeConnection(self.id);
        });
    },

    listen: function(callback) {
        this.listenCallback = callback;
    },

    onClose: function(callback) {
        this.closeCallback = callback;
    },

    send: function(message) {
        this.sendUTF8(JSON.stringify(message));
    },

    sendUTF8: function(data) {
        this.socket.send(data);
    }

});
