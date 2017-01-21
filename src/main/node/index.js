'use strict';

const async = require('async');
const gm = require('gm').subClass({imageMagick: true});

const aws = require('aws-sdk');
const s3 = new aws.S3({apiVersion: '2006-03-01'});

const Options = {
    ARTICLE: [
        {path: 's', mark: true, quality: 90, size: 640},
        {path: 'm', mark: true, quality: 90, size: 960},
        {path: 'l', mark: true, quality: 90, size: 1280}
    ],
    PROFILE: [
        {path: 's', crop: true, quality: 90, size: 140}
    ],
    MESSAGE: [
        {path: 'l', quality: 90, size: 1280}
    ],
    get: function (key) {
        const type = key.split('/')[1];
        if (type === 'article') {
            return Options.ARTICLE;
        } else if (type === 'profile') {
            return Options.PROFILE;
        } else if (type === 'message') {
            return Options.MESSAGE;
        }
        return null;
    }
};
const Watermark = {
    get: function (size) {
        if (size >= 1280) {
            return 'stamp/watermark_1280.png';
        } else if (size >= 960) {
            return 'stamp/watermark_960.png';
        } else if (size >= 640) {
            return 'stamp/watermark_640.png';
        }
        return null;
    }
};

function getObject(params) {
    console.log('getObject : ', params);
    return new Promise((resolve, reject) => {
        s3.getObject(params, (err, data) => {
            if (err) reject(err);
            else {
                return resolve({
                    Bucket: params.Bucket,
                    Key: params.Key,
                    Options: params.Options,
                    ContentType: data.ContentType,
                    Body: data.Body
                });
            }
        });
    });
}

function putObject(params) {
    console.log('putObject : ', params);
    let tasks = params.map(param => {
        const dest = getDestKey(param.Key, param.Option.path);
        const p = {
            Bucket: param.Bucket,
            Key: dest,
            Body: param.Body
        };
        return new Promise((resolve, reject) => {
            s3.putObject(p, (err, data) => {
                if (err) reject(err);
                else resolve(data);
            });
        });
    });
    console.log('putObject : ', tasks);
    return Promise.all(tasks);
}

function resizeRatio(params) {
    console.log('resizeRatio : ', params);
    return new Promise((resolve, reject) => {
        gm(params.Body)
            .autoOrient()
            .resize(params.Option.size, params.Option.size, '>')
            .quality(params.Option.quality)
            .toBuffer(imageType, function (err, buffer) {
                if (err) reject(err);
                else {
                    return resolve({
                        Bucket: params.Bucket,
                        Key: params.Key,
                        ContentType: params.ContentType,
                        Option: params.Option,
                        Body: buffer
                    });
                }
            });
    });
}

function resizeCrop(params) {
    console.log('resizeCrop : ', params);
    return new Promise((resolve, reject) => {
        gm(params.Body)
            .autoOrient()
            .resize(params.Option.size, params.Option.size, '>')
            .gravity('Center')
            .extent(params.Option.size, params.Option.size)
            .quality(params.Option.quality)
            .toBuffer(imageType, function (err, buffer) {
                if (err) reject(err);
                else {
                    return resolve({
                        Bucket: params.Bucket,
                        Key: params.Key,
                        ContentType: params.ContentType,
                        Option: params.Option,
                        Body: buffer
                    });
                }
            });
    });
}

function resize(params) {
    console.log('resize : ', params);
    let tasks = params.Options.map(option => {
        const p = {
            Bucket: params.Bucket,
            Key: params.Key,
            ContentType: params.ContentType,
            Option: option,
            Body: params.Body
        };
        if (option.crop) {
            return resizeCrop(p);
        } else {
            return resizeRatio(p);
        }
    });
    console.log('resize : ', tasks);
    return Promise.all(tasks);
}

function getDestKey(key, suffix) {
    return key.replace('origin/', `resize/${suffix}/`)
}

exports.handler = (event, context, callback) => {
    console.log('## Received event:', JSON.stringify(event, null, 2));

    const bucket = event.Records[0].s3.bucket.name;
    const key = decodeURIComponent(event.Records[0].s3.object.key.replace(/\+/g, ' '));
    const options = Options.get(key);

    const params = {
        Bucket: bucket,
        Key: key,
        Options: options
    };

    Promise.resolve(params)
        .then(getObject)
        .then(resize)
        .then(putObject)
        .then(result => {
            console.log(result);
            callback(null, result);
        })
        .catch(err => {
            console.error(err);
            callback(err);
        });
};
