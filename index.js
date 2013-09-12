var request = require('request');
var url = require('url');
var qs = require('querystring');
var util = require('util');
var EventEmitter = require('events').EventEmitter;
var WebSocket = require('ws');


function EurekaDongle(base) {  
  this.url = base;
  this.urlParts = url.parse(base);
  EventEmitter.call(this);
}

util.inherits(EurekaDongle, EventEmitter);

EurekaDongle.prototype.timer = null;
EurekaDongle.prototype.currentApp = null;

var appList = null;
EurekaDongle.prototype.collectAppList = function(fn) {
  request('https://clients3.google.com/cast/chromecast/device/config', function(e, r, b) {
    var obj = JSON.parse(b.replace(')]}', ''));
    appList = {};
    obj.applications.forEach(function(app) {
      appList[app.app_name.toLowerCase()] = app;
    });

    fn();
  });
};

EurekaDongle.prototype.statusInterval = 500;

EurekaDongle.prototype.start = function(name, resource, callback) {
  var that = this;

  if (!name) {
    return request(this.url + '/apps', {followRedirect: false}, function(e, r, b) {/* jshint unused: false */
      if (r && r.headers.location) {
        var name = r.headers.location.split('/').pop();
        that.start(name, resource, callback);
      }
    });
  }

  var req = {
    headers: {
      'Connection' : 'close',
    },
    method : 'POST',
  };
  
  this.currentApp = name;

  if (name.toLowerCase() === 'youtube') {
    if (resource && resource.indexOf('v=')) {
      var urlParts = url.parse(resource);

      if (urlParts.query) {
        var queryParts = qs.parse(urlParts.query);
        if (queryParts.v) {
          resource = queryParts.v;
        } else {
          return;
        }
      } else {
        return;
      }

      resource = 'v=' + resource + '&pairingCode=eac4ae42-8b54-4441-9be3-1111111111';
    } else {
      resource = '';
    }


    req.headers['Content-Type'] = 'application/x-www-form-urlencoded';

    req.headers['Content-Length'] = resource.length;
    req.body = resource;

    var payload = JSON.stringify({
      channel: 0,
      senderId : {
        appName : 'ChromeCast',
        senderId: 'myid' + Math.random()
      }
    });

    that = this;

    this.emit('launching');

    (function waitForDevice() {
      request.post(that.url + '/connection/YouTube', {
        headers: {
          'Content-Type' : 'application/json',
          'Content-Length' : payload.length,
          'Host' : that.urlParts.host,
          'Origin' : 'chrome-extension://boadgeojelhgndaghljhdicfkmllpafd'
        },
        body : payload,
      }, function(e, r, b) {

        clearTimeout(that.timer);

        if (r.statusCode === 200) {
          that.timer = setTimeout(function() {
            that.prepareRampSocket(b);
          }, 2000);
        } else {
          that.timer = setTimeout(waitForDevice, 500);
        }
      });
    })();
  }

  resource && request(this.url + '/apps/' + name, req, callback);
};

EurekaDongle.prototype.stop = function(name, callback) {
  var appsUrl = this.url + '/apps/' + name;
  var that = this;

  if (!arguments.length) {
    name = this.currentApp;
  }

  request.del(appsUrl, function() {
    // We really need to ensure it's gone or a restart will cause
    // 408s
    that.timer = setTimeout(function() {
      that.emit('stopped');
      callback && callback();
    }, 2000);
  });

  this.timer && clearTimeout(this.timer);
  this.ws && this.ws.close();
  this.currentApp = null;
};

EurekaDongle.prototype.pause = function() {
  try {
    this.ws.send(JSON.stringify([
      'ramp', { cmd_id: 3, type: 'STOP' }
    ]), { mask: true });
  } catch (e) {
    this.emit('error', e);
  }
};

EurekaDongle.prototype.resume = function(position) {
  try {
    this.ws.send(JSON.stringify([
      'ramp', ((!!position) ? { position: position, cmd_id: 5, type: 'PLAY' } : { cmd_id: 4, type: 'PLAY' })
    ]), { mask: true });
  } catch (e) {
    this.emit('error', e);
  }
};

EurekaDongle.prototype.volume = function(volume) {
  try {
    this.ws.send(JSON.stringify([
      'ramp', { volume: volume, cmd_id: 6, type: 'VOLUME' }
    ]), { mask: true });
  } catch (e) {
    this.emit('error', e);
  }
};

EurekaDongle.prototype.muted = function(muted) {
  try {
    this.ws.send(JSON.stringify([
      'ramp', { muted: muted, cmd_id: 7, type: 'VOLUME' }
    ]), { mask: true });
  } catch (e) {
    this.emit('error', e);
  }
};

EurekaDongle.prototype.prepareRampSocket = function(b) {
  var wsUrl = JSON.parse(b.toString()).URL;
  var that = this;

  var ws = this.ws = new WebSocket(wsUrl, {
    origin: 'chrome-extension://boadgeojelhgndaghljhdicfkmllpafd'
  });
 
  var first = true;
  ws.on('message', function(data, flags) {/* jshint unused: false */
    data = JSON.parse(data);

    if (first) {
      var status = data[1].status;

      try {
        ws.send(JSON.stringify([
          "cv", {
            "type":"activity",
            "message": {
              "type":"update_description",
              "activityId":status.content_id,
              "description":status.title,
              "iconUrl":status.image_url
            }
          }
        ]), { mask: true });
      } catch (e) {
        that.emit('error', e);
      }

      that.getStatus();

      first = false;
    } else {
      clearTimeout(that.timer);

      if (data[1] && data[1].cmd_id && data[1].cmd_id === 1000) {
        that.emit('status', data);
      }

      that.timer = setTimeout(function() {
        that.getStatus();
      }, that.statusInterval);
    }
  });
};

EurekaDongle.prototype.getStatus = function() {
  try {
    this.ws.send(JSON.stringify([
      'ramp', { cmd_id: 1000, type: 'INFO' }
    ]), { mask: true });
  } catch (e) {
    this.emit('error', e);
  }
};

module.exports = EurekaDongle;
