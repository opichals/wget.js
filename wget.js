#!/usr/bin/env node
'use strict';

var url = require('url');
var path = require('path');
var client = require('http-request');
var cheerio = require('cheerio');
var shell = require('shelljs');

function fname(urlString) {
    var parsed = url.parse(urlString);
    var pathname = parsed.pathname.replace(/\/(index\.html)?$/, '/index.html');
    return parsed.hostname + pathname.split('/').map(encodeURIComponent).join('/') + (parsed.query ? encodeURIComponent('?' + parsed.query) : '');
}

function writeAsset(name, res) {
    shell.mkdir('-p', path.dirname(name));
    fs.writeFileSync(name, res.buffer);
}

// keepalive
function setKeepalive() {
    var http = require('http');
    var https = require('https');

    var keepAliveAgent = new http.Agent({ keepAlive: true });
    http.globalAgent = keepAliveAgent;
    https.globalAgent = keepAliveAgent;
}

function parseRequest(res, options) {
    if (res.headers['content-type'] !== 'text/html') {
        return;
    }

    res.$ = cheerio.load(res.buffer.toString(), {decodeEntities: false});

    if (!options.recursive) {
        return;
    }

    // recursively go through the links
    var hrefs = [];

    // see http://html5doctor.com/microdata/ for the attributes...?
    res.$('a[href], link[href]').each((idx, e) => hrefs.push(e.attribs.href));
    res.$('script[src], img[src], embed[src], iframe[src], audio[src], video[src]').each((idx, e) => hrefs.push(e.attribs.src));

    var base = res.$('html head base[href]').attr('href') || res.url;
    hrefs.forEach(href => {
        var absHref = url.resolve(base, href);

        // strip the href fragment
        absHref = absHref.replace(/\#.*/, '');

        if (options.acceptHref(absHref, href)) {
            options._visited = options._visited || {};
            var entry = options._visited[absHref];
            if (!entry) {
                options._visited[absHref] = true;
                // console.log('href', absHref, fname(absHref));

                options._.push(absHref);
            }
        }
    });
}

function wget(urlString, options) {
    if (!urlString) return;

    console.log('fetch\\', urlString, options._.length);
    var fetchOpts = {
        url: urlString,
        headers: options.headers,

        // stream: true,
        noRedirect: false
    };
    client.get(fetchOpts, function(err, res) {
        let next = _ => {
            console.log('fetch/', res.code);
            wget(options._.shift(), options);
        };

        if (err) {
            res = err;
            console.error(urlString + ':', err);
            next();
            return;
        }

        function onEnd() {
            parseRequest(res, options);
            options.process(res, options);
            next();
        }

        res.url = urlString;

        if (!res.buffer) {
            var content = [];
            res.stream.on('error', function(err) {
                console.error('error:', err);
            });
            res.stream.on('data', chunk => (console.log('data', chunk.length), content.push(chunk)));
            res.stream.on('end', () => {
                res.buffer = Buffer.concat(content);
                onEnd();
            });
        } else {
            onEnd();
        }

    });
}


if (module.parent) {
    // for use as a node.js module
    // node -e 'require("./wget.js")("http://www.yahoo.com", {_: [], acceptHref: _ => _, process: _ => _})'
    module.exports = wget;
    return;
}

// command-line utility use
var argv = require('yargs')
    .usage('Usage: $0 [options] <url>')
    .demand(1)
    .example('$0 http://www.yahoo.com', 'fetch the site content')
    .option('np', {
        alias: 'no-parent',
        describe: `don't ascend to the parent directory`,
        boolean: true,
        default: false
    })
    .option('r', {
        alias: 'recursive',
        describe: `specify recursive download`,
        boolean: true,
        default: false
    })
    .option('P', {
        alias: 'directory-prefix',
        describe: `save files to PREFIX/...`,
        string: true,
        default: ''
    })
    .option('process', {
        describe: `javascript module/function handling the contents`,
        optional: true
    })
    // .alias('H', 'header')
    // .nargs('H', 1)
    // .describe('H', 'Request header')
    .help('h')
    .alias('h', 'help')
    // .epilog('Copyright 2016')
    .argv;

var firstUrl = argv._.shift();

// single origin only
firstUrl = firstUrl.match(/\w+:\/\//) ? firstUrl : 'http://' + firstUrl;
var parsedFirst = url.parse(firstUrl);

argv.acceptHref = href => {
    var parsedHref = url.parse(href);
    return parsedHref.host === parsedFirst.host &&
           parsedHref.protocol === parsedFirst.protocol;
};

if (argv.np) {
    // no-parent hrefs only
    argv.acceptHref = ((acceptHref) => href => {
        return href.startsWith(firstUrl) && acceptHref(href);
    })(argv.acceptHref);
}

try {
    argv.process = require(argv.process);
} catch(e) {
    try {
        argv.process = eval(argv.process);
    } catch(e) {
        argv.process = undefined;
    }

    var fs = require('fs');
    argv.process = argv.process || (res => {
        var name = path.normalize(path.join(argv.P, fname(res.url)));
        writeAsset(name, res);
        console.log('Done', res.url, res.code, '->', fname(res.url));
    });
}

argv.headers = {
  "accept-charset" : "ISO-8859-1,utf-8;q=0.7,*;q=0.3",
  "accept-language" : "en-US,en;q=0.8",
  "accept" : "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "user-agent" : "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_6_8) AppleWebKit/537.13+ (KHTML, like Gecko) Version/5.1.7 Safari/534.57.2",
  "accept-encoding" : "gzip,deflate",
};

// if (typeof argv.header === 'string') argv.header = [argv.header];
// argv.header.forEach(h => {
//     var parts = h.split(':');
//     argv.headers[parts.shift()] = parts.join(':');
// })

setKeepalive();
wget(firstUrl, argv);
