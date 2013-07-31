var events = require('events');
var plist = require('plist');
var util = require('util');

var Client = require('./client').Client;

var Device = function(id, info, opt_readyCallback) {
  var self = this;

  this.id = id;
  this.info_ = info;
  this.serverInfo_ = null;
  this.ready_ = false;

  var host = info.host;
  var port = info.port;
  var user = 'Airplay';
  var pass = '';
  this.client_ = new Client(host, port, user, pass, function() {
    // TODO: support passwords
    self.client_.get('/server-info', {}, function(res) {
      //plist.parseString(res.body, function(err, obj) {
      var el = plist.parseStringSync(res.body)
      self.serverInfo_ = {
        deviceId: el.deviceid,
        features: el.features,
        model: el.model,
        protocolVersion: el.protovers,
        sourceVersion: el.srcvers
      };

      self.makeReady_(opt_readyCallback);
    });
  });
};
util.inherits(Device, events.EventEmitter);
exports.Device = Device;

Device.prototype.connectPTTH = function(callback) {
    this.client_.connectPTTH(callback)
}

Device.prototype.connectSS = function(nextFile, callback) {
    this.client_.connectSS(nextFile, callback)
}

Device.prototype.isReady = function() {
  return this.ready_;
};

Device.prototype.makeReady_ = function(opt_readyCallback) {
  this.ready_ = true;
  if (opt_readyCallback) {
    opt_readyCallback(this);
  }
  this.emit('ready');
};

Device.prototype.close = function() {
  if (this.client_) {
    this.client_.close();
  }
  this.client_ = null;
  this.ready_ = false;

  this.emit('close');
};

Device.prototype.getInfo = function() {
  var info = this.info_;
  var serverInfo = this.serverInfo_;
  return {
    id: this.id,
    name: info.serviceName,
    deviceId: info.host,
    features: serverInfo.features,
    model: serverInfo.model,
    slideshowFeatures: [],
    supportedContentTypes: []
  };
};

Device.prototype.getName = function() {
  return this.info_.serviceName;
};

Device.prototype.matchesInfo = function(info) {
  for (var key in info) {
    if (this.info_[key] != info[key]) {
      return false;
    }
  }
  return true;
};

Device.prototype.default = function(callback) {
  if (callback) {
    callback(this.getInfo());
  }
};

Device.prototype.status = function(callback) {
  this.client_.get('/playback-info', {}, function(res) {
    if (res) {
      plist.parseString(res.body, function(err, obj) {
        var el = obj[0];
        var result = {
          duration: el.duration,
          position: el.position,
          rate: el.rate,
          playbackBufferEmpty: el.playbackBufferEmpty,
          playbackBufferFull: el.playbackBufferFull,
          playbackLikelyToKeepUp: el.playbackLikelyToKeepUp,
          readyToPlay: el.readyToPlay,
          loadedTimeRanges: el.loadedTimeRanges,
          seekableTimeRanges: el.seekableTimeRanges
        };
        if (callback) {
          callback(result);
        }
      });
    } else {
      if (callback) {
        callback(null);
      }
    }
  });
};

Device.prototype.authorize = function(req, callback) {
  // TODO: implement authorize
  if (callback) {
   callback(null);
  }
};

Device.prototype.play = function(content, start, callback) {
  var body =
      'Content-Location: ' + content + '\n' +
      'Start-Position: ' + start + '\n';
  this.client_.post('/play', body, {}, function(res) {
    if (callback) {
      callback(res ? {} : null);
    }
  });
};

Device.prototype.showImageFile = function(file, params, callback) {
    var self=this;

    var params_ = {
        transition: 'dissolve',
        show: true
    }

    params = require('extend')(true, params_, params)

    self.loadImageFile(file, params, callback)
}


Device.prototype.loadImageFile = function(file, params, callback) {
    var self = this
    var params_ = {
        transition: 'dissolve',
        show: false
    }

    params = require('extend')(true, params_, params)

    fileSystem = require('fs')
    var data = new Buffer(0)
    var readStream = fileSystem.createReadStream(file);
    readStream.on('data', function(tmpData) {
        data = Buffer.concat([data, tmpData]);
    });
    readStream.on('error', function(err) {
        if(err) { return console.log(err); }
    });
    readStream.on('end', function(err) {
        var crypto = require('crypto');
        var shasum = crypto.createHash('sha1');
        shasum.update(file)
        params.assetKey = shasum.digest('hex')

        self.pushImageBuffer(data, params, callback)
    });
};

Device.prototype.startSlideshow = function(callback){
   var data =
      '<plist version="1.0">' +
      ' <dict>' +
      '  <key>settings</key>' +
      '  <dict>' +
      '   <key>slideDuration</key>' +
      '   <integer>3</integer>' +
      '   <key>theme</key>' +
      '   <string>Classic</string>' +
      '  </dict>' +
      '  <key>state</key>' +
      '  <string>playing</string>' +
      ' </dict>' +
      '</plist>'

    this.client_.put('/slideshows/1', data, {
         'Content-Type': 'text/x-apple-plist+xml',
         'X-Apple-Session-ID': '00000000-0000-0000-0000-000000000000'
        }, function(res){
        console.log(res)
        callback()
    })
}

Device.prototype.pushImageBuffer = function(data, params, callback) {

//      Possibly supported transitions (note, that airplay-clones often support Dissolve only)

//      "None"
//      "SlideLeft"
//      "SlideRight"
//      "Dissolve"

  var params_ = {
    transition: 'Dissolve',
    assetKey: '1bd6ceeb-fffd-456c-a09c-996053a7a08c',
    show: false
  }

  params = require('extend')(true, params_, params)

  var headers = {
    'X-Apple-Transition': params.transition,
    'X-Apple-AssetKey': params.assetKey
  }

  if(!params.show) headers['X-Apple-AssetAction'] = 'cacheOnly'

    console.log(headers)

  this.client_.put('/photo', data, headers, function(res) {
    if (callback) {
      callback(null, res)
    }
  });
};

Device.prototype.stop = function(callback) {
  this.client_.post('/stop', null, {}, function(res) {
    if (callback) {
      callback(res ? {} : null);
    }
  });
};

Device.prototype.scrub = function(position, callback) {
  this.client_.post('/scrub?position=' + position, null, {}, function(res) {
    if (callback) {
      callback(res ? {} : null);
    }
  });
};

Device.prototype.reverse = function(callback) {
  this.client_.post('/reverse', null, {}, function(res) {
    if (callback) {
      callback(res ? {} : null);
    }
  })
};

Device.prototype.rate = function(value, callback) {
  this.client_.post('/rate?value=' + value, null, {}, function(res) {
    if (callback) {
      callback(res ? {} : null);
    }
  })
};

Device.prototype.volume = function(value, callback) {
  this.client_.post('/volume?value=' + value, null, {}, function(res) {
    if (callback) {
      callback(res ? {} : null);
    }
  })
};

Device.prototype.photo = function(req, callback) {
  // TODO: implement photo
  if (callback) {
    callback(null);
  }
};
