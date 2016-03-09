#!/usr/bin/env node
'use strict';

var url = require('url');
var client = require('http-request');
var cheerio = require('cheerio');

// keepalive
function setKeepalive() {
    var http = require('http');
    var https = require('https');

    var keepAliveAgent = new http.Agent({ keepAlive: true });
    http.globalAgent = keepAliveAgent;
    https.globalAgent = keepAliveAgent;
}

function wget(urlString, options) {
    if (!urlString) return;

    console.log('fetch\\', urlString, options._.length);
    var fetchOpts = {
        url: urlString,
        headers: options.headers,

        stream: true,
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

        res.url = urlString;
        if (res.headers['content-type'] !== 'text/html') {
            next();
            return;
        }

        var content = '';
        res.stream.on('data', chunk => content += chunk);
        res.stream.on('end', function() {
            res.data = content;
            res.$ = cheerio.load(content, {decodeEntities: false});

            var hrefs = [];
            res.$('a[href]').each((idx, e) => hrefs.push(e.attribs.href));

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
                        console.log('href', absHref);

                        options._.push(absHref);
                    }
                }
            });

            options.process(res, options);
            next();
        });
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
        default: false
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
        argv.process = (res) => {
            console.log('Done', res.url, res.code);
        };
    }
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
