var buffer = require('buffer');
var events = require('events');
var net = require('net');
var util = require('util');
var uuid = require('node-uuid');

var Client = function(host, port, user, pass, callback) {
  var self = this;

  this.host_ = host;
  this.port_ = port;
  this.user_ = user;
  this.pass_ = pass;

  this.sessionID_ = uuid.v4()

  console.log("My session ID:", this.sessionID_)

  this.responseWaiters_ = [];
  this.rResponseWaiters_ = [];

  var connectPTTH = function()
  {
    self.rsocket_ = net.createConnection(port, host);
    self.rsocket_.on('error', function(data) {
      console.log("RSOCKET ERROR", data)
    })

    self.rsocket_.on('connect', function() {
      if(!self.rsocket_) return
      console.log("Connecting reverse socket")
      self.rsocket_.write(
        'POST /reverse HTTP/1.1\n' +
        'Upgrade: PTTH/1.0\n' + 
        'Connection: Upgrade\n' + 
        'X-Apple-Purpose: event\n' +
        'User-Agent: MediaControl/1.0\n' +
        'X-Apple-Session-ID: ' + this.sessionID_ + '\n' + 
        'Content-Length: 0\n' +  
        '\n')
    })

    self.rsocket_.on('data', function(data) {
      var res = self.parseResponse_(data.toString());
      console.log("RSOCKET RES", res)

      var waiter = self.rResponseWaiters_.shift();
      if (waiter && waiter.callback) {
        waiter.callback(res);
      }
    })
  }

  connectPTTH()

  this.socket_ = net.createConnection(port, host);
  this.socket_.on('connect', function() {
    self.responseWaiters_.push({
      callback: callback
    });
    self.socket_.write(
        'GET /playback-info HTTP/1.1\n' +
        'User-Agent: MediaControl/1.0\n' +
        'X-Apple-Session-ID: ' + this.sessionID_ + '\n' + 
        'Content-Length: 0\n' +
        '\n');
  });

  self.socket_.on('error', function(data) {
    console.log("SOCKET ERROR", data)
  })

  this.socket_.on('data', function(data) {
    var res = self.parseResponse_(data.toString());
    // console.log(res)
    // if(!self.rsocket_) connectPTTH()
    //util.puts(util.inspect(res));

    var waiter = self.responseWaiters_.shift();
    if (waiter.callback) {
      waiter.callback(res);
    }
  });
};
util.inherits(Client, events.EventEmitter);
exports.Client = Client;

Client.prototype.close = function() {
  if (this.socket_) {
    this.socket_.destroy();
  }
  if (this.rsocket_) {
    this.rsocket_.destroy();
  }
  this.socket_ = null;
  this.rsocket_ = null;
};

Client.prototype.parseResponse_ = function(res) {
  // Look for HTTP response:
  // HTTP/1.1 200 OK
  // Some-Header: value
  // Content-Length: 427
  // \n
  // body (427 bytes)

  var header = res;
  var body = '';
  var splitPoint = res.indexOf('\r\n\r\n');
  if (splitPoint != -1) {
    header = res.substr(0, splitPoint);
    body = res.substr(splitPoint + 4);
  }

  // Normalize header \r\n -> \n
  header = header.replace(/\r\n/g, '\n');

  // Peel off status
  var status = header.substr(0, header.indexOf('\n'));
  var statusMatch = status.match(/HTTP\/1.1 ([0-9]+) (.+)/);
  header = header.substr(status.length + 1);

  // Parse headers
  var allHeaders = {};
  var headerLines = header.split('\n');
  for (var n = 0; n < headerLines.length; n++) {
    var headerLine = headerLines[n];
    var key = headerLine.substr(0, headerLine.indexOf(':'));
    var value = headerLine.substr(key.length + 2);
    allHeaders[key] = value;
  }

  // Trim body?
  return {
    statusCode: parseInt(statusMatch[1]),
    statusReason: statusMatch[2],
    headers: allHeaders,
    body: body
  };
};

Client.prototype.issue_ = function(req, body, headers, callback) {
  if (!this.socket_) {
    util.puts('client not connected');
    return;
  }

  req.headers = {}

  req.headers['X-Apple-Session-ID'] = this.sessionID_;
  req.headers['User-Agent'] = 'MediaControl/1.0';
  req.headers['Content-Length'] = body ? body.length : 0;
  req.headers['Connection'] = 'keep-alive';

  req.headers = require('extend')(true, req.headers, headers)

  var allHeaders = '';
  for (var key in req.headers) {
    allHeaders += key + ': ' + req.headers[key] + '\r\n';
  }

  var text = req.method + ' ' + req.path + ' HTTP/1.1\r\n' + allHeaders + '\r\n';

  this.responseWaiters_.push({
    callback: callback
  });

  this.socket_.write(text);
  if(body){
    this.socket_.write(body);
  }
};

Client.prototype.get = function(path, headers, callback) {
  var req = {
    method: 'GET',
    path: path
  };
  this.issue_(req, null, headers, callback);
};

Client.prototype.post = function(path, body, headers, callback) {
  var req = {
    method: 'POST',
    path: path
  };
  this.issue_(req, body, headers, callback);
};

Client.prototype.put = function(path, body, headers, callback) {
  var req = {
    method: 'PUT',
    path: path
  };
  this.issue_(req, body, headers, callback);
};
