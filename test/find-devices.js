var ssdp = new (require('node-ssdp'))();

ssdp.on('response', function(res) {
console.log(res.toString())
  var info = {};
  res.toString().replace(/\r/g, '').split('\n').forEach(function(line) {
    var parts = line.split(':');
    if (parts.length < 2) return;
    info[parts.shift().trim().toLowerCase()] = parts.join(':').trim();
  });

  console.log(info);

});

ssdp.search('urn:dial-multiscreen-org:service:dial:1');
console.log('searching...')
