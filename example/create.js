#!/usr/local/bin/node

if (process.argv.length != 5) {
    console.log("Usage:", process.argv[0], "file id key")
    return
}

var pad = function(v) {
    var a = v
    while (a.length < 8) {
        a='0'+a
    }
    return a
}

var filename = process.argv[2]
var id = parseInt(process.argv[3])
var key = parseInt(process.argv[4])

var plist='62706C6973743030D201020304546461746154696E666F4F12' //Header, basedict with data, info, data start with variable length, length int start with 2^2=4 bytes

var fs = require('fs')
var file = fs.readFileSync(filename).toString('hex')
var bytes = (file.length/2).toString(16)
plist+=pad(bytes)+file

plist+='D205060708526964536B657912' //Dict with id, key, int start with 2^2=4 bytes

plist+=pad(id.toString(16))
plist+='12' //int start with 2^2=4 bytes
plist+=pad(key.toString(16))

//offset table
var offsetTableOffset = (plist.length/2).toString(16)
plist+=pad('08')+pad('0D')+pad('12')+pad('17')
var offset=file.length/2
var offsets=[29,34,37,41,46]
for (var i in offsets) {
    plist+=pad((offset+offsets[i]).toString(16))
}

//trailer
plist+='00000000000004010000000000000009000000000000000000000000'
plist+=pad(offsetTableOffset)

console.log(plist)

var buf = new Buffer(plist, 'hex')
fs.writeFileSync('out.plist', plist, 'hex')

console.log("written file out.plist")
