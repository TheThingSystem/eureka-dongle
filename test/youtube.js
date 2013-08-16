var Dongle = require('../index');
var url = require('url');
var WebSocket = require('ws');
var request = require('request');

var host = '192.168.0.3:8008'

var url = 'http://' + host;
var d = new Dongle(url);

d.stop('YouTube', function(e) {
  if (e) throw e;

  d.start('YouTube', 'OoabVM4DokQ', function(e) {
    if (e) throw e;
  });
});


function play(b) {

 
}



