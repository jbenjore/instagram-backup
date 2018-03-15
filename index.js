"use strict";

// josh@DESKTOP-PSM5JEL:~/ig/node_modules/instagram-private-api/client/v1$ diff thread-item.js~ thread-item.js
// 22a23
// >     hash.json = json;
// 27c28,39
// <         hash.media = json.media.image_versions2.candidates;
// ---
// >       // console.log(require('util').inspect(json, {depth:null, colors:true}));
// >         hash.media = [];
// >         if (json.media.image_versions2.candidates) {
// >             json.media.image_versions2.candidates.forEach(function(i) {
// >                 hash.media.push(i);
// >             });
// >         }
// >         if (json.media.video_versions) {
// >           json.media.video_versions.forEach(function(v) {
// >               hash.media.push(v);
// >           });
// >         }
// 74c86

const Async = require('async');
const CircularJSON = require('circular-json');
const Client = require('instagram-private-api').V1;
const Fs = require('fs');
const Optimist = require('optimist');
const Request = require('request');
const URL = require('url');
const Util = require('util');

if (4 != process.argv.length) {
    throw new Error(`usage`);
}
const username = process.argv[2];
const password = process.argv[3];
main(username, password);

function main(username, password) {
    console.error("main()");

    const cookie_path = `${__dirname}/cookies/${username}.json`;
    const device = new Client.Device(username);
    const storage = new Client.CookieFileStorage(cookie_path);
    Client.Session.create(device, storage, username, password)
        .then(session => fetch_threads(
            session,
            new Client.Feed.Inbox(session),
            [],
            (err, threads) => {
                if (err) {
                    console.error(err);
                }
                else {
                    process.stdout.write(CircularJSON.stringify({
                        threads: threads
                    }));
                    process.stdout.write("\n");
                }
            }
        ))
        .catch(console.error);
}

function fetch_threads(session, feed, threads_results, fetch_threads_cb) {
    console.error("fetch_threads()");
    feed.get()
        .then(threads => Async.eachSeries(
            threads,
            (thread, cb) => {
                let returned = false;
                extract_thread(session, thread, (err, result) => {
                    if (!err) {
                        threads_results.push(result);
                    }
                    if (returned) {
                        console.error(err);
                    }
                    else {
                        returned = true;
                        cb(err);
                    }
                });
            },
            err => {
                if (err) {
                    fetch_threads_cb(err);
                }
                else if (feed.isMoreAvailable()) {
                    // recurse.
                    fetch_threads(session, feed, threads_results, fetch_threads_cb);
                }
                else {
                    fetch_threads_cb(null, threads_results);
                }
            }
        ))
        .catch(fetch_threads_cb);
}

function extract_thread(session, thread, cb) {
    console.error("extract_thread()");
    fetch_thread_items(
        new Client.Feed.ThreadItems(session, thread.id),
        [],
        (err, items) => {
            console.error(`err: ${err} items.length: ${items ? items.length : String(items)}`);
            if (err) {
                cb(err);
            }
            else {
                const result = {
                    title: thread.params.title,
                    items: items
                };
                cb(err, result);
            }
        }
    );
}

function fetch_thread_items(feed, results, cb) {
    console.error("fetch_thread_items()");
    const skip_type = new Set([
        'placeholder',
    ]);
    feed.get()
        .then(items => {
            for (let item of items) {
                if (!skip_type.has(item.params.type)) {
                    const parsed = parse_item(item);
                    results.push(parsed);
                }
            }
            if (feed.isMoreAvailable()) {
                fetch_thread_items(feed, results, cb);
            }
            else {
                cb(null, results);
            }
        })
        .catch(cb);
}

function parse_item(item) {
    console.error(`parse_item(${item.params.id})`);
    //const acct = item.params.accountId;
    //const result = {
    //    id: item.params.id,
    //    type: item.params.type,
    //    created: new Date(item.params.created).toISOString(),
    //    accountId: item.params.accountId
    //};

    return item.params.json;
    //switch (item.params.type) {
    //case 'like':
    //    break;
    //case 'text':
    //    result.text = item.params.text;
    //    break;
    //case 'actionLog':
    //    result.description = item.params.actionLog.description;
    //    break;
    //case 'media':
    //    result.media = item.params.media;
    //    break;
    //case 'mediaShare':
    //    result.username = item.mediaShare.params.account.username;
    //    result.picture =  item.mediaShare.params.account.picture;
    //    result.webLnk = item.mediaShare.params.images.map(i => i.url);
    //    break;
    //default:
    //    result.debug = Util.inspect(
    //        item,
    //        { depth: 20 }
    //    );
    //}
    return result;
}

function download_media(item, cb) {
    console.error("download_media()");
    Async.each(
        item.params.media,
        (media, ecb) => {
            const url = URL.parse(media.url);
            const base_file = String(item.id) + '-' + url.pathname.match(/([^\/]+)$/)[1];
            const path = `$${base_file}`;

            const write = Fs.createWriteStream(path);
            let epoch = item.params.created / 1000;
            write.on('finish', () => {
                Fs.utimes(path, epoch, epoch, ecb);
            });
            Request.get(media.url)
                .on('error', ecb)
                .pipe(write);
        },
        cb
    );
}
